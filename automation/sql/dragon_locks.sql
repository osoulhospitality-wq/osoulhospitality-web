-- Dragon Intake Production — idempotency lock, audit log, and least-privilege
-- PostgREST access for n8n. No raw API key or production key hash belongs here.

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

REVOKE ALL ON SCHEMA private FROM PUBLIC, authenticated, service_role;
REVOKE ALL ON TABLE private.dragon_api_keys
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO anon;
GRANT SELECT ON TABLE private.dragon_api_keys TO anon;

REVOKE ALL ON TABLE public.dragon_locks
  FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.dragon_events_log
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.dragon_locks_id_seq
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.dragon_events_log_id_seq
  FROM anon, authenticated, service_role;

-- n8n authenticates as anon with the Supabase publishable key plus the
-- x-app-api-key header. RLS verifies the latter against the private hash table.
GRANT SELECT, INSERT ON TABLE public.dragon_locks TO anon;
GRANT UPDATE (status, finished_at) ON TABLE public.dragon_locks TO anon;
GRANT SELECT, INSERT ON TABLE public.dragon_events_log TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_locks_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_events_log_id_seq TO anon;

-- Keep service_role available for controlled administration and recovery, with
-- no DELETE on either table and no UPDATE on the append-only audit log.
GRANT SELECT, INSERT, UPDATE ON TABLE public.dragon_locks TO service_role;
GRANT SELECT, INSERT ON TABLE public.dragon_events_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_locks_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dragon_events_log_id_seq TO service_role;

DROP POLICY IF EXISTS dragon_locks_n8n_select ON public.dragon_locks;
DROP POLICY IF EXISTS dragon_locks_n8n_insert ON public.dragon_locks;
DROP POLICY IF EXISTS dragon_locks_n8n_update ON public.dragon_locks;
DROP POLICY IF EXISTS dragon_events_n8n_select ON public.dragon_events_log;
DROP POLICY IF EXISTS dragon_events_n8n_insert ON public.dragon_events_log;

CREATE POLICY dragon_locks_n8n_select
ON public.dragon_locks
FOR SELECT
TO anon
USING (
  repository = 'osoulhospitality-wq/osoulhospitality-web'
  AND EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          COALESCE(
            ((SELECT current_setting('request.headers', true))::jsonb
              ->> 'x-app-api-key'),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  )
);

CREATE POLICY dragon_locks_n8n_insert
ON public.dragon_locks
FOR INSERT
TO anon
WITH CHECK (
  repository = 'osoulhospitality-wq/osoulhospitality-web'
  AND sender = 'osoulhospitality-wq'
  AND status = 'processing'
  AND EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          COALESCE(
            ((SELECT current_setting('request.headers', true))::jsonb
              ->> 'x-app-api-key'),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  )
);

CREATE POLICY dragon_locks_n8n_update
ON public.dragon_locks
FOR UPDATE
TO anon
USING (
  repository = 'osoulhospitality-wq/osoulhospitality-web'
  AND EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          COALESCE(
            ((SELECT current_setting('request.headers', true))::jsonb
              ->> 'x-app-api-key'),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  )
)
WITH CHECK (
  repository = 'osoulhospitality-wq/osoulhospitality-web'
  AND status IN ('completed', 'failed')
  AND finished_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          COALESCE(
            ((SELECT current_setting('request.headers', true))::jsonb
              ->> 'x-app-api-key'),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  )
);

CREATE POLICY dragon_events_n8n_select
ON public.dragon_events_log
FOR SELECT
TO anon
USING (
  repository = 'osoulhospitality-wq/osoulhospitality-web'
  AND EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          COALESCE(
            ((SELECT current_setting('request.headers', true))::jsonb
              ->> 'x-app-api-key'),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  )
);

CREATE POLICY dragon_events_n8n_insert
ON public.dragon_events_log
FOR INSERT
TO anon
WITH CHECK (
  repository = 'osoulhospitality-wq/osoulhospitality-web'
  AND decision IN ('proceed', 'duplicate', 'unauthorized', 'ignored')
  AND EXISTS (
    SELECT 1
    FROM private.dragon_api_keys AS k
    WHERE k.active
      AND k.key_hash = encode(
        extensions.digest(
          COALESCE(
            ((SELECT current_setting('request.headers', true))::jsonb
              ->> 'x-app-api-key'),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
  )
);

-- Lock acquisition through PostgREST:
--   POST /rest/v1/dragon_locks?on_conflict=repository,issue_number,command_version
--   Prefer: return=representation,resolution=ignore-duplicates
-- Zero rows returned means another execution owns the exact command cycle.
