-- Dedicated disposable CLI stack only. Seed synthetic ownership and schedule a
-- second, one-minute test hook with the same fixed command as the hourly job.
do $$begin
  if current_setting('draqon.disposable_test',true) is distinct from 'council-monitor' then
    raise exception 'Local disposable stack required';
  end if;
  if private.facility_council_monitor_scheduler(false)<>'installed' then raise exception 'Hourly monitor hook absent'; end if;
  if not exists(select from cron.job where jobname='draqon-facility-council-daily' and active
      and command='select private.facility_council_monitor_tick();' and schedule='17 * * * *') then
    raise exception 'Configured daily snapshot hook differs from expected schedule'; end if;
end$$;
begin;
insert into auth.users(id) values('dd000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"dd000000-0000-4000-8000-000000000001","aal":"aal2","role":"authenticated"}',true);
insert into public.organizations(id,name,created_by) values('dd000000-0000-4000-8000-000000000002','Synthetic scheduled test','dd000000-0000-4000-8000-000000000001');
insert into public.facilities(id,organization_id,name) values
 ('dd000000-0000-4000-8000-000000000003','dd000000-0000-4000-8000-000000000002','Synthetic enabled site'),
 ('dd000000-0000-4000-8000-000000000004','dd000000-0000-4000-8000-000000000002','Synthetic disabled site');
set local role authenticated;
select public.facility_council_monitor_set('dd000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000003',true);
select public.facility_council_monitor_limit('dd000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000003','occupancy_pct',null,51.5);
-- Closed, confirmed synthetic series 38..51. Latest measured value stays under
-- the admitted ceiling while the next-period forecast crosses it.
select public.facility_council_record('dd000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000003',
  gen_random_uuid(),'occupancy_pct',(date_trunc('month',now() at time zone 'Asia/Riyadh')-make_interval(months=>14-i))::date,
  38+i,'Synthetic occupancy ledger '||i,(now() at time zone 'Asia/Riyadh')::date)
from generate_series(0,13) s(i);
reset role;
select cron.schedule('draqon-disposable-prove-background','* * * * *','select private.facility_council_monitor_tick();');
commit;
