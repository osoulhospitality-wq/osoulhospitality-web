-- Dragon Intake Production — idempotency lock, audit log, and least-privilege
-- PostgREST access for n8n. No raw API key or production key hash belongs here.

-- Run manually as the Dragon object owner in a dedicated environment. In the same
-- session SET draqon.install_repository and SET draqon.install_sender first.
-- Values are validated and stored as policy literals, never taken from an API request.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.dragon_locks (
  id BIGSERIAL PRIMARY KEY,
  repository TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  command_version TEXT NOT NULL,
  idempotency_key TEXT GENERATED ALWAYS AS (
    repository || '#' || issue_number || '@' || command_version
  ) STORED,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  execution_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (repository, issue_number, command_version)
);

CREATE INDEX IF NOT EXISTS dragon_locks_issue_idx
  ON public.dragon_locks (repository, issue_number);

CREATE TABLE IF NOT EXISTS public.dragon_events_log (
  id BIGSERIAL PRIMARY KEY,
  repository TEXT NOT NULL,
  issue_number INTEGER,
  github_action TEXT NOT NULL,
  sender TEXT,
  decision TEXT NOT NULL
    CHECK (decision IN ('proceed', 'duplicate', 'unauthorized', 'ignored')),
  reason TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dragon_events_log_issue_idx
  ON public.dragon_events_log (repository, issue_number);

-- Only SHA-256 hashes of app keys are stored. Insert or rotate production
-- hashes through an approved secret-management procedure, never in source.
CREATE TABLE IF NOT EXISTS private.dragon_api_keys (
  key_hash TEXT PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  key_name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

ALTER TABLE public.dragon_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dragon_events_log ENABLE ROW LEVEL SECURITY;

-- Header verification is isolated in a SECURITY DEFINER function. This lets
-- PostgREST's anon role evaluate only a boolean and never read the key registry.
CREATE OR REPLACE FUNCTION private.dragon_request_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          NULLIF(
            NULLIF(current_setting('request.headers', true), '')::jsonb
              ->> 'x-app-api-key',
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  );
$function$;

-- Preserve the existing ACL on this shared schema. RLS resolves its helper at
-- policy creation; clients need no new schema-wide privilege.
REVOKE ALL ON TABLE private.dragon_api_keys
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.dragon_request_authorized()
  FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.dragon_request_authorized() TO anon;

-- A callable legacy diagnostic requires a separate owner decision. Preserve the
-- existing definition and abort the transaction while it is exposed to API roles.
DO $diagnostic$
DECLARE
  diagnostic regprocedure := to_regprocedure('public.dragon_debug_auth()');
BEGIN
  IF diagnostic IS NOT NULL AND EXISTS (
    SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS api(role_name)
    WHERE has_function_privilege(api.role_name::name, diagnostic, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Restrict the legacy Dragon diagnostic under a separate approved change before installation';
  END IF;
END;
$diagnostic$;

REVOKE ALL ON TABLE public.dragon_locks
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dragon_events_log
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.dragon_locks_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.dragon_events_log_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

-- n8n authenticates as anon with a Supabase publishable key plus x-app-api-key.
GRANT SELECT, INSERT ON TABLE public.dragon_locks TO anon;
GRANT UPDATE (status, finished_at) ON TABLE public.dragon_locks TO anon;
GRANT SELECT, INSERT ON TABLE public.dragon_events_log TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_locks_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_events_log_id_seq TO anon;

-- service_role remains available for controlled administration and recovery,
-- with no DELETE on either table and no UPDATE on the append-only audit log.
GRANT SELECT, INSERT, UPDATE ON TABLE public.dragon_locks TO service_role;
GRANT SELECT, INSERT ON TABLE public.dragon_events_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_locks_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_events_log_id_seq TO service_role;

DROP POLICY IF EXISTS dragon_locks_n8n_select ON public.dragon_locks;
DROP POLICY IF EXISTS dragon_locks_n8n_insert ON public.dragon_locks;
DROP POLICY IF EXISTS dragon_locks_n8n_update ON public.dragon_locks;
DROP POLICY IF EXISTS dragon_events_n8n_select ON public.dragon_events_log;
DROP POLICY IF EXISTS dragon_events_n8n_insert ON public.dragon_events_log;

DO $install$
DECLARE
  repo text := current_setting('draqon.install_repository', true);
  actor text := current_setting('draqon.install_sender', true);
BEGIN
  IF repo IS NULL OR repo !~ '^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$'
    OR actor IS NULL OR actor !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$' THEN
    RAISE EXCEPTION 'Set a valid repository (owner/name) and sender for this environment before installing Dragon';
  END IF;
  EXECUTE format($policy$
    CREATE POLICY dragon_locks_n8n_select
    ON public.dragon_locks
    FOR SELECT
    TO anon
    USING (
      repository = %1$L
      AND (SELECT private.dragon_request_authorized())
    )
  $policy$, repo);
  EXECUTE format($policy$
    CREATE POLICY dragon_locks_n8n_insert
    ON public.dragon_locks
    FOR INSERT
    TO anon
    WITH CHECK (
      repository = %1$L
      AND sender = %2$L
      AND status = 'processing'
      AND (SELECT private.dragon_request_authorized())
    )
  $policy$, repo, actor);
  EXECUTE format($policy$
    CREATE POLICY dragon_locks_n8n_update
    ON public.dragon_locks
    FOR UPDATE
    TO anon
    USING (
      repository = %1$L
      AND (SELECT private.dragon_request_authorized())
    )
    WITH CHECK (
      repository = %1$L
      AND status IN ('completed', 'failed')
      AND finished_at IS NOT NULL
      AND (SELECT private.dragon_request_authorized())
    )
  $policy$, repo);
  EXECUTE format($policy$
    CREATE POLICY dragon_events_n8n_select
    ON public.dragon_events_log
    FOR SELECT
    TO anon
    USING (
      repository = %1$L
      AND (SELECT private.dragon_request_authorized())
    )
  $policy$, repo);
  EXECUTE format($policy$
    CREATE POLICY dragon_events_n8n_insert
    ON public.dragon_events_log
    FOR INSERT
    TO anon
    WITH CHECK (
      repository = %1$L
      AND decision IN ('proceed', 'duplicate', 'unauthorized', 'ignored')
      AND (SELECT private.dragon_request_authorized())
    )
  $policy$, repo);
END;
$install$;

COMMIT;

-- Lock acquisition through PostgREST:
--   POST /rest/v1/dragon_locks?on_conflict=repository,issue_number,command_version
--   Prefer: return=representation,resolution=ignore-duplicates
-- On an empty/ambiguous insert result, read the exact lock and verify its owner
-- and state before continuing or classifying a duplicate.
