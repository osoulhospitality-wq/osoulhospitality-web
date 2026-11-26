-- Keep unrelated legacy F08 records free-form. Validate an F08 that names
-- a managed work order before it becomes immutable on submission.
create function private.field_cycle_check_report() returns trigger
language plpgsql security definer set search_path='' as $$
declare order_ref text:=btrim(new.answers->>'C8'); expected_site uuid; expected_code text; state text;
begin
 if new.code<>'F08' or new.status<>'submitted' or order_ref is null or
  order_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return new;end if;
 select a.facility_id,a.asset_code,w.status into expected_site,expected_code,state from public.facility_work_orders w
 join public.facility_assets a on a.id=w.asset_id join private.field_cycle_assets l on l.asset_id=a.id
 join public.facility_pm_occurrences o on o.work_order_id=w.id where w.id=order_ref::uuid;
 if not found then return new;end if;
 if expected_site<>new.facility_id or btrim(new.answers->>'C9') is distinct from expected_code then raise exception 'CYCLE_F08_SCOPE';end if;
 if state='completed' then raise exception 'CYCLE_CLOSURE_FIXED';end if;
 if not exists(select from storage.objects where bucket_id='field-form-photos' and name like new.id::text||'/%') then raise exception 'CYCLE_PHOTO';end if;
 return new;
end $$;
revoke all on function private.field_cycle_check_report() from public,anon,authenticated;
create trigger field_cycle_check_report before insert or update on public.field_form_records for each row execute function private.field_cycle_check_report();
