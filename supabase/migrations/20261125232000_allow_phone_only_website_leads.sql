-- Allow phone-only website leads without weakening consent, retention, or anonymous permissions.
alter table public.website_leads
  drop constraint website_leads_email_required_chk,
  add constraint website_leads_contact_format_chk
    check (
      (email is not null and char_length(btrim(email)) between 3 and 180)
      or (email is null and phone is not null and phone ~ '^[+]?[0-9]{7,15}$')
    );

alter policy website_leads_anon_insert
  on public.website_leads
  with check (
    consent is true
    and form_name = 'hospitality_readiness_brief'
    and language in ('ar', 'en')
    and source = 'website'
    and status = 'new'
    and submission_id is not null
    and privacy_notice_version = '3.0-2026-10-22'
    and (
      (email is not null
        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and hubspot_status in ('submitted', 'failed'))
      or (email is null
        and phone is not null
        and phone ~ '^[+]?[0-9]{7,15}$'
        and hubspot_status = 'not_attempted')
    )
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
  );
