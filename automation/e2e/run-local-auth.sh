#!/usr/bin/env bash
# Runs only on a fresh local CLI project and tears down the temporary volumes.
set -euo pipefail
umask 077
repo="$(cd "$(dirname "$0")/../.." && pwd)"
project_dir="$(mktemp -d)"
report_dir="${DRAQON_UAT_REPORT_DIR:-$repo/evidence/local-auth}"
mkdir -p "$report_dir" "$project_dir/supabase"
report_dir="$(cd "$report_dir" && pwd)"
# A failed repeat must never inherit receipts from a previous successful run.
# Preserve existing reports and put this run in its own directory when needed.
if compgen -G "$report_dir/*.json" >/dev/null; then
  report_dir="$(mktemp -d "$report_dir/run-XXXXXX")"
  echo "Fresh evidence directory: $report_dir"
fi
cp "$repo/automation/e2e/config.toml" "$project_dir/supabase/config.toml"
cp -R "$repo/supabase/migrations" "$project_dir/supabase/migrations"
cd "$project_dir"
if docker container inspect supabase_db_draqon-ci-auth >/dev/null 2>&1; then
  echo 'A local test stack with the same identifier already exists; leaving it alone.' >&2
  rm -rf "$project_dir"
  exit 1
fi
cleanup() {
  (cd "$project_dir" && supabase stop --no-backup) >/dev/null 2>&1 || true
  rm -rf "$project_dir"
}
trap cleanup EXIT
echo 'Starting disposable Supabase PostgreSQL, Auth and API and applying repository migrations.'
# Startup output includes local credentials. It is never logged or retained.
if ! supabase start >"$project_dir/start.log" 2>&1; then
  echo 'Local stack startup or repository migration failed.' >&2
  # Emit an SQLSTATE when available, never raw migration logs.
  grep -Eo 'SQLSTATE [[:alnum:]]{5}' "$project_dir/start.log" | tail -1 >&2 || true
  exit 1
fi
supabase status -o env >"$project_dir/local.env" 2>"$project_dir/status.log"
cd "$repo"
DRAQON_DISPOSABLE_LOCAL=draqon-ci-auth bash automation/e2e/council-monitor-scheduler.sh "$report_dir"
node automation/e2e/real-auth.mjs "$project_dir/local.env" "$report_dir"
node automation/e2e/field-receipts.mjs "$report_dir" "$(git rev-parse HEAD)"
