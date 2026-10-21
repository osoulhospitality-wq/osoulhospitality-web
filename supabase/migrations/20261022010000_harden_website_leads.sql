alter table public.website_leads
  add column if not exists submission_id uuid not null default gen_random_uuid(),
  add column if not exists consent_recorded_at timestamptz not null default now(),
  add column if not exists privacy_notice_version text not null default '2.0-2026-08-08',
  add column if not exists hubspot_status text not null default 'not_attempted',
  add column if not exists email_status text not null default 'not_attempted',
  add column if not exists last_attempt_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '24 months');

create unique index if not exists website_leads_submission_id_uidx
  on public.website_leads (submission_id);

create index if not exists website_leads_expires_at_idx
  on public.website_leads (expires_at);

alter table public.website_leads
  drop constraint if exists website_leads_email_required_chk,
  drop constraint if exists website_leads_field_lengths_chk,
  drop constraint if exists website_leads_channel_status_chk,
  drop constraint if exists website_leads_privacy_version_chk;

alter table public.website_leads
  add constraint website_leads_email_required_chk
    check (email is not null and char_length(btrim(email)) between 3 and 180),
  add constraint website_leads_field_lengths_chk
    check (
      char_length(name) between 1 and 120
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
      and (phone is null or char_length(phone) between 7 and 60)
      and (description is null or char_length(description) <= 2000)
      and (processing_error is null or char_length(processing_error) <= 1000)
    ),
  add constraint website_leads_channel_status_chk
    check (
      hubspot_status in ('not_attempted', 'submitted', 'failed')
      and email_status in ('not_attempted', 'sent', 'failed')
    ),
  add constraint website_leads_privacy_version_chk
    check (char_length(privacy_notice_version) between 3 and 40);

comment on column public.website_leads.submission_id is
  'Server-generated idempotency and reconciliation identifier for one enquiry.';
comment on column public.website_leads.expires_at is
  'Retention review/deletion deadline; operational deletion job must enforce it.';
