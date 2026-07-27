-- Dragon Intake Production — idempotency lock and audit log.
-- Source of truth for whether a given (repository, issue, commandVersion) cycle
-- has already been claimed by an execution. The UNIQUE constraint is what makes
-- lock acquisition atomic: two concurrent executions racing INSERT ... ON CONFLICT
-- DO NOTHING can only ever have one of them receive a returned row.

CREATE TABLE IF NOT EXISTS dragon_locks (
  id BIGSERIAL PRIMARY KEY,
  repository TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  command_version TEXT NOT NULL, -- github issue.updated_at at the moment of the qualifying event
  idempotency_key TEXT GENERATED ALWAYS AS (repository || '#' || issue_number || '@' || command_version) STORED,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  execution_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (repository, issue_number, command_version)
);

CREATE INDEX IF NOT EXISTS dragon_locks_issue_idx ON dragon_locks (repository, issue_number);

-- Every received webhook event is logged here regardless of outcome, so "why was
-- this event ignored" is always answerable without reading n8n execution internals.
CREATE TABLE IF NOT EXISTS dragon_events_log (
  id BIGSERIAL PRIMARY KEY,
  repository TEXT NOT NULL,
  issue_number INTEGER,
  github_action TEXT NOT NULL,
  sender TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('proceed', 'duplicate', 'unauthorized', 'ignored')),
  reason TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dragon_events_log_issue_idx ON dragon_events_log (repository, issue_number);

-- Lock acquisition (used by the "Acquire Lock" node):
--   INSERT INTO dragon_locks (repository, issue_number, command_version, execution_id, sender)
--   VALUES ($1, $2, $3, $4, $5)
--   ON CONFLICT (repository, issue_number, command_version) DO NOTHING
--   RETURNING id;
-- Zero rows returned => another execution already holds this exact cycle's lock => stop as duplicate.
-- One row returned    => this execution owns the lock => proceed.

-- Finalization (used by "Finalize Lock: completed/failed"):
--   UPDATE dragon_locks SET status = $1, finished_at = now()
--   WHERE repository = $2 AND issue_number = $3 AND command_version = $4;
