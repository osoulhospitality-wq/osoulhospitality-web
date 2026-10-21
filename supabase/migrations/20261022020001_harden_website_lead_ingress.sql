-- Constrain public lead ingestion and adopt explicit Data API grants.
-- Existing rows remain readable only by service_role; these checks protect new writes.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;

alter table public.website_leads
  drop constraint if exists website_leads_email_format_chk,
  drop constraint if exists website_leads_ingress_timestamps_chk;

alter table public.website_leads
  add constraint website_leads_email_format_chk
    check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') not valid,
  add constraint website_leads_ingress_timestamps_chk
    check (
      consent_recorded_at between created_at - interval '10 minutes' and created_at + interval '10 minutes'
      and expires_at between created_at + interval '23 months' and created_at + interval '25 months'
      and last_attempt_at between created_at - interval '10 minutes' and created_at + interval '10 minutes'
    ) not valid;

drop policy if exists "website_leads_anon_insert" on public.website_leads;
create policy "website_leads_anon_insert"
  on public.website_leads
  for insert
  to anon
  with check (
    consent is true
    and form_name = 'hospitality_readiness_brief'
    and language in ('ar', 'en')
    and source = 'website'
    and status = 'new'
    and submission_id is not null
    and privacy_notice_version = '3.0-2026-10-22'
    and hubspot_status in ('submitted', 'failed')
    and email_status in ('sent', 'failed')
    and processing_error is not distinct from case
      when hubspot_status = 'failed' and email_status = 'failed'
        then 'hubspot_submission_failed; email_delivery_failed'
      when hubspot_status = 'failed'
        then 'hubspot_submission_failed'
      when email_status = 'failed'
        then 'email_delivery_failed'
      else null
    end
    and created_at between now() - interval '10 minutes' and now() + interval '10 minutes'
    and consent_recorded_at between now() - interval '10 minutes' and now() + interval '10 minutes'
    and last_attempt_at between now() - interval '10 minutes' and now() + interval '10 minutes'
    and expires_at between now() + interval '23 months' and now() + interval '25 months'
    and char_length(name) between 1 and 120
    and char_length(organization) between 1 and 180
    and char_length(asset_type) between 1 and 120
    and char_length(city) between 1 and 120
    and char_length(stage) between 1 and 160
    and char_length(opening_target) between 1 and 160
    and char_length(units) between 1 and 40
    and char_length(primary_gap) between 1 and 220
    and char_length(urgency) between 1 and 120
    and char_length(documents) between 1 and 160
    and char_length(requested_support) between 1 and 180
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

revoke all on table public.website_leads from anon, authenticated;
grant insert on table public.website_leads to anon;
grant select, insert, update, delete on table public.website_leads to service_role;
