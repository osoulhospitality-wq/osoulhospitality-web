-- Enforce the public privacy notice's 24-month website-lead retention limit.
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
   where jobname = 'purge-expired-website-leads'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'purge-expired-website-leads',
    '17 2 * * *',
    $job$delete from public.website_leads where expires_at <= now()$job$
  );
end
$$;

