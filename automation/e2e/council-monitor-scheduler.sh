#!/usr/bin/env bash
# Called only by run-local-auth.sh after provisioning and identifying the fresh local container.
set -euo pipefail
report_dir="${1:?local artifact directory required}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
db=(docker exec -i -e PGOPTIONS='-c draqon.disposable_test=council-monitor' supabase_db_draqon-ci-auth psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres)
if [[ "${DRAQON_DISPOSABLE_LOCAL:-}" != 'draqon-ci-auth' ]]; then
  echo 'Dedicated disposable Supabase CLI project required.' >&2
  exit 1
fi
"${db[@]}" < "$repo/automation/e2e/council-monitor-scheduler.sql" >/dev/null
# The trial hook can now run in the provider's background worker. No manual invocation precedes the observation.
cleanup_trial() {
  "${db[@]}" -c "select cron.unschedule(jobid) from cron.job where jobname='draqon-disposable-prove-background'" >/dev/null
}
trap cleanup_trial EXIT
for _ in $(seq 1 45); do
  evidence="$("${db[@]}" -c "select count(*) from private.facility_council_monitor_snapshots where facility_id='dd000000-0000-4000-8000-000000000003' and run_source='scheduled'")"
  [[ "$evidence" == '1' ]] && break
  sleep 2
done
if [[ "$evidence" != '1' ]]; then echo 'No background worker snapshot arrived in the disposable stack.' >&2;exit 1;fi
"${db[@]}" > "$report_dir/council-monitor-scheduler.json" <<'SQL'
do $$declare snap uuid; facts_ jsonb; projected jsonb;
begin
  if not exists (select from cron.job where active and jobname='osoul-approved-field-maintenance'
    and schedule='*/10 * * * *' and command='select private.field_cycle_tick(25)') then
    raise exception 'Native maintenance worker registration not found';
  end if;
  select id,facts into strict snap,facts_ from private.facility_council_monitor_snapshots where facility_id='dd000000-0000-4000-8000-000000000003' and business_day=(now() at time zone 'Asia/Riyadh')::date and run_source='scheduled' and requested_by is null;
  select s into strict projected from jsonb_array_elements(facts_->'signals') s
    where s->>'code'='forecast_above_maximum' and s->>'metric'='occupancy_pct';
  if (projected->>'estimate')::numeric<>52 or (projected->>'bound')::numeric<>51.5
    or (projected->>'mae')::numeric<>0 or projected->>'method'<>'median_drift'
    or projected->>'nextMonth'<>to_char(now() at time zone 'Asia/Riyadh','YYYY-MM')
    or jsonb_array_length(projected->'observationIds')<>14 then raise exception 'Projected breach lost model evidence'; end if;
  if exists(select from jsonb_array_elements(facts_->'signals') s where s->>'metric'='occupancy_pct' and s->>'code'='metric_above_maximum') then
    raise exception 'Projected risk incorrectly labeled as an observed breach';
  end if;
  if exists(select from private.facility_council_monitor_snapshots where facility_id='dd000000-0000-4000-8000-000000000004') then raise exception 'Non-enrolled site captured'; end if;
  perform private.facility_council_monitor_tick();
  if (select count(*) from private.facility_council_monitor_snapshots where facility_id='dd000000-0000-4000-8000-000000000003')<>1 then raise exception 'Replay duplicated snapshot'; end if;
end$$;
select jsonb_build_object('status','passed','checkedAt',clock_timestamp(),'scope','disposable no-production-data PostgreSQL',
  'nativeExtensionVersion',(select extversion from pg_extension where extname='pg_cron'),
  'schedulerHook',private.facility_council_monitor_scheduler(false),'timing','hourly hook configuration verified; accelerated temporary minute hook observed',
  'nativeBackgroundRun',true,'enrolledSnapshotCount',1,'unscheduledSiteCount',0,'repeatSameDayCount',1,
  'forecast',(select s-'observationIds' from private.facility_council_monitor_snapshots h cross join lateral jsonb_array_elements(h.facts->'signals') s
    where h.facility_id='dd000000-0000-4000-8000-000000000003' and s->>'code'='forecast_above_maximum' and s->>'metric'='occupancy_pct'),
  'observedOccupancy',51,'observations',14,'observedBreach',false,
  'capturedRules',(select facts->'sourceHealth' from private.facility_council_monitor_snapshots where facility_id='dd000000-0000-4000-8000-000000000003'));
SQL
