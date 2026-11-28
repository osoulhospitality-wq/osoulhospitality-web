-- These user-context functions require the authenticated identity and its claims.
-- Make the effective privilege independent of the project's default function grants.
revoke execute on function
  public.fm_confirm_reputation_listing(uuid, uuid, text, text, text, numeric, numeric, date, text),
  public.fm_meter_forecast_history(uuid, uuid, date, text, text),
  public.fm_provider_contracts(integer),
  public.fm_provider_submit(uuid, uuid, text, text, text),
  public.fm_read_monthly_evidence(uuid, uuid, date, integer),
  public.fm_read_reputation(uuid, uuid, date, integer),
  public.fm_record_monthly_evidence(uuid, uuid, date, text, text, integer, integer, text, numeric, numeric, numeric, numeric, numeric),
  public.fm_record_reputation_month(uuid, uuid, uuid, date, integer, integer, numeric, date, text),
  public.fm_review_submission(uuid, text, text),
  public.fm_submission_inbox(uuid, uuid, integer),
  public.fm_verify_meter_revision(uuid, uuid, date, text, text, integer)
from service_role;
