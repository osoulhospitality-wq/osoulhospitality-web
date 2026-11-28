begin;

create table private.fm_reputation_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, facility_id uuid not null,
  platform text not null check(platform in ('google','booking','airbnb','agoda','expedia','gathern','tripadvisor')),
  external_key text not null check(external_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,149}$'),
  listing_url text not null check(length(listing_url) <= 1200 and listing_url !~ '[[:space:]?#]'),
  native_min numeric(5,2) not null, native_max numeric(5,2) not null,
  confirmed_on date not null check(isfinite(confirmed_on)),
  identity_reference text not null check(length(btrim(identity_reference)) between 2 and 180),
  confirmed_by uuid not null references auth.users(id), recorded_at timestamptz not null default clock_timestamp(),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
  unique(organization_id,facility_id,id), unique(organization_id,platform,external_key), unique(organization_id,platform,listing_url),
  check(native_min >= 0 and native_min < native_max and native_max <= 100),
  check(listing_url ~ case platform
    when 'google' then '^https://(www[.])?google[.]com/maps/place/[^/]+'
    when 'booking' then '^https://(www[.])?booking[.]com/hotel/[^/]+/[^/]+'
    when 'airbnb' then '^https://(www[.])?airbnb[.]com/rooms/[0-9]+([/]|$)'
    when 'agoda' then '^https://(www[.])?agoda[.]com/[^/]+/.+'
    when 'expedia' then '^https://(www[.])?expedia[.]com/[^/]+[.]h[0-9]+[.]Hotel-Information'
    when 'gathern' then '^https://(www[.])?gathern[.]co/[^/]+/.+'
    when 'tripadvisor' then '^https://(www[.])?tripadvisor[.]com/Hotel_Review-[^/]+'
    end)
);
create table private.fm_reputation_months (
  organization_id uuid not null,facility_id uuid not null,listing_id uuid not null,
  period_month date not null check(isfinite(period_month) and extract(day from period_month)=1),
  revision integer not null check(revision>0),
  review_count integer not null check(review_count>=0),
  average_rating numeric(7,4),
  source_date date not null check(isfinite(source_date)),
  source_reference text not null check(length(btrim(source_reference)) between 2 and 180),
  recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default clock_timestamp(),
  primary key(listing_id,period_month,revision),
  foreign key(organization_id,facility_id,listing_id) references private.fm_reputation_listings(organization_id,facility_id,id),
  check((review_count=0 and average_rating is null) or (review_count>0 and average_rating is not null)),
  check(source_date >= (period_month+interval '1 month - 1 day')::date)
);
alter table private.fm_reputation_listings enable row level security;
alter table private.fm_reputation_months enable row level security;
revoke all on private.fm_reputation_listings,private.fm_reputation_months from public,anon,authenticated;

create function private.fm_reputation_authorize(p_org uuid,p_site uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or coalesce(private.current_org_role(p_org)::text,'') not in ('owner','approver')
    or not exists(select 1 from public.facilities where id=p_site and organization_id=p_org)
  then raise exception 'Facility access unavailable' using errcode='42501';end if;
end $$;
revoke all on function private.fm_reputation_authorize(uuid,uuid) from public,anon,authenticated;

create function public.fm_confirm_reputation_listing(p_org uuid,p_site uuid,p_platform text,p_key text,p_url text,
 p_min numeric,p_max numeric,p_confirmation date,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.fm_reputation_authorize(p_org,p_site);
 if p_confirmation>(now() at time zone 'Asia/Riyadh')::date
   or p_url ~ '[[:cntrl:]\\]' or p_min='NaN'::numeric or p_max='NaN'::numeric
 then raise exception 'Invalid listing evidence' using errcode='22023';end if;
 insert into private.fm_reputation_listings(organization_id,facility_id,platform,external_key,listing_url,native_min,native_max,confirmed_on,identity_reference,confirmed_by)
 values(p_org,p_site,p_platform,btrim(p_key),rtrim(btrim(p_url),'/'),p_min,p_max,p_confirmation,btrim(p_reference),auth.uid())
 returning id into result;
 return result;
end $$;

create function public.fm_record_reputation_month(p_org uuid,p_site uuid,p_listing uuid,p_month date,p_expected integer,
 p_count integer,p_average numeric,p_source_date date,p_reference text)
returns integer language plpgsql security definer set search_path='' as $$
declare listing private.fm_reputation_listings%rowtype; current_revision integer;
begin
 perform private.fm_reputation_authorize(p_org,p_site);
 select * into listing from private.fm_reputation_listings where organization_id=p_org and facility_id=p_site and id=p_listing;
 if not found then raise exception 'Facility access unavailable' using errcode='42501';end if;
 if p_expected is null or p_expected<0 or p_source_date>(now() at time zone 'Asia/Riyadh')::date
   or p_month>=date_trunc('month',now() at time zone 'Asia/Riyadh')::date
   or (p_average is not null and (p_average not between listing.native_min and listing.native_max or p_average<>round(p_average,4)))
 then raise exception 'Invalid aggregate, source date or reporting period' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','review',p_listing,p_month),0));
 select coalesce(max(revision),0) into current_revision from private.fm_reputation_months where listing_id=p_listing and period_month=p_month;
 if p_expected<>current_revision then raise exception 'Source revision changed' using errcode='40001';end if;
 insert into private.fm_reputation_months(organization_id,facility_id,listing_id,period_month,revision,review_count,average_rating,source_date,source_reference,recorded_by)
 values(p_org,p_site,p_listing,p_month,current_revision+1,p_count,p_average,p_source_date,btrim(p_reference),auth.uid());
 return current_revision+1;
end $$;

create function public.fm_read_reputation(p_org uuid,p_site uuid,p_month date,p_offset integer default 0)
returns table(listing_id uuid,platform text,external_key text,listing_url text,native_min numeric,native_max numeric,
 confirmed_on date,identity_reference text,revision integer,review_count integer,average_rating numeric,source_date date,
 source_reference text,previous_count integer,previous_average numeric,previous_source_date date,previous_reference text)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.fm_reputation_authorize(p_org,p_site);
 if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 or p_offset is null or p_offset<0
 then raise exception 'Invalid reporting period or offset' using errcode='22023';end if;
 return query select l.id,l.platform,l.external_key,l.listing_url,l.native_min,l.native_max,l.confirmed_on,l.identity_reference,
   c.revision,c.review_count,c.average_rating,c.source_date,c.source_reference,p.review_count,p.average_rating,p.source_date,p.source_reference
 from private.fm_reputation_listings l
 left join lateral(select m.* from private.fm_reputation_months m where m.listing_id=l.id and m.period_month=p_month order by m.revision desc limit 1)c on true
 left join lateral(select m.* from private.fm_reputation_months m where m.listing_id=l.id and m.period_month=(p_month-interval '1 month')::date order by m.revision desc limit 1)p on true
 where l.organization_id=p_org and l.facility_id=p_site order by l.platform,l.external_key,l.id limit 100 offset p_offset;
end $$;
revoke all on function public.fm_confirm_reputation_listing(uuid,uuid,text,text,text,numeric,numeric,date,text),
 public.fm_record_reputation_month(uuid,uuid,uuid,date,integer,integer,numeric,date,text),
 public.fm_read_reputation(uuid,uuid,date,integer) from public,anon,authenticated;
grant execute on function public.fm_confirm_reputation_listing(uuid,uuid,text,text,text,numeric,numeric,date,text),
 public.fm_record_reputation_month(uuid,uuid,uuid,date,integer,integer,numeric,date,text),
 public.fm_read_reputation(uuid,uuid,date,integer) to authenticated;
commit;
