-- Internal read-only operations query. Counts attempts including QA, not clients or field outcomes.
select count(*) as acquired_attempts,
 count(*) filter (where status='completed') as drafts_delivered,
 count(*) filter (where status='failed') as recorded_failures,
 count(*) filter (where status='processing') as in_progress,
 count(*) filter (where status='processing' and locked_at < now()-interval '15 min') as needs_reconciliation,
 percentile_cont(0.95) within group (order by extract(epoch from finished_at-locked_at))
   filter (where status='completed' and finished_at>=locked_at) as p95_draft_seconds
from public.dragon_locks where locked_at>=now()-interval '30 days';

select (received_at at time zone 'Asia/Riyadh')::date day_riyadh,decision,count(*) as events
from public.dragon_events_log where received_at>=now()-interval '30 days'
group by day_riyadh,decision order by day_riyadh desc,decision;

-- After deploying the field bridge, execute as the authorized tenant member (RLS applies).
-- Pass tenant UUID via a parameter in the reporting client rather than widening access.
-- select p.id,p.created_at,p.approved_at,p.github_issue,p.assigned_to,w.status,w.completed_at,
--   exists(select 1 from public.facility_visits v where v.organization_id=p.organization_id and v.work_order_id=w.id) as visit_recorded
-- from public.draqon_field_proposals p left join public.facility_work_orders w
-- on w.organization_id=p.organization_id and w.id=p.work_order_id where p.organization_id=$1;
