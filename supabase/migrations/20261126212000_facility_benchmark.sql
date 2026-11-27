begin;

-- Internal reviewers are provisioned out-of-band by a database administrator.
-- Tenant owners cannot delegate this role. Store only approved shareable prices
-- in this source; the private evidence reference never leaves the curator boundary.
create table private.draqon_price_curators (
  user_id uuid primary key references auth.users(id),
  active boolean not null default true
);
create table private.draqon_price_references (
  id uuid primary key default gen_random_uuid(),
  item_key text not null check (length(item_key) between 1 and 100),
  spec_key text not null check (length(spec_key) between 1 and 160),
  region text not null check (length(region) between 1 and 100),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  base_unit text not null check (base_unit in ('ea','kg','l','m')),
  min_qty numeric(18,5) not null check (min_qty>=0 and min_qty::text<>'NaN'),
  max_qty numeric(18,5) check (max_qty>=min_qty and max_qty::text<>'NaN'),
  delivered_net_unit_price numeric(18,6) not null check (delivered_net_unit_price>0 and delivered_net_unit_price::text<>'NaN'),
  valid_from date not null, valid_until date not null check (valid_until>=valid_from),
  evidence_ref text not null check (length(btrim(evidence_ref)) between 1 and 240),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
  retired_at timestamptz, retired_by uuid references auth.users(id),
  unique(evidence_ref,item_key,spec_key,region,currency,base_unit,min_qty,valid_from)
);
create index draqon_price_reference_matching on private.draqon_price_references(item_key,spec_key,region,currency,base_unit,valid_from) where retired_at is null;
create function private.draqon_price_key(v text) returns text language sql immutable strict set search_path='' as $$
  select lower(regexp_replace(btrim(v),'[[:space:]]+',' ','g'))
$$;
create function private.draqon_price_unit(v text) returns table(base_unit text, factor numeric)
language sql immutable strict set search_path='' as $$
  select u.base_unit,u.factor from (values
    ('ea', 'ea',1::numeric),('each','ea',1),('pc','ea',1),('pcs','ea',1),('قطعة','ea',1),
    ('kg','kg',1),('كجم','kg',1),('g','kg',0.001),('غ','kg',0.001),
    ('l','l',1),('لتر','l',1),('ml','l',0.001),('مل','l',0.001),
    ('m','m',1),('متر','m',1),('cm','m',0.01)) u(token,base_unit,factor)
  where u.token=private.draqon_price_key(v)
$$;

create table private.draqon_facility_purchases (
  organization_id uuid not null, facility_id uuid not null, id uuid not null,
  quote_line_id uuid references public.quote_lines(id) on delete restrict,
  invoice_ref text not null check (length(btrim(invoice_ref)) between 1 and 140),
  invoice_line text not null check (length(btrim(invoice_line)) between 1 and 80),
  purchased_on date not null,
  item_key text not null check (length(item_key) between 1 and 100),
  spec_key text not null check (length(spec_key) between 1 and 160),
  region text not null check (length(region) between 1 and 100),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit text not null check (length(unit) between 1 and 30),
  packs numeric(16,4) not null check (packs>0 and packs::text<>'NaN'),
  units_per_pack numeric(16,4) not null check (units_per_pack>0 and units_per_pack::text<>'NaN'),
  pack_price numeric(16,4) not null check (pack_price>=0 and pack_price::text<>'NaN'),
  vat_mode text not null check (vat_mode in ('included','excluded','unknown')),
  tax_pct numeric(7,4) check (tax_pct between 0 and 100 and tax_pct::text<>'NaN'),
  freight_net numeric(16,4) check (freight_net>=0 and freight_net::text<>'NaN'),
  discount_net numeric(16,4) check (discount_net>=0 and discount_net::text<>'NaN'),
  entered_by uuid not null references auth.users(id), entered_at timestamptz not null default now(),
  primary key (organization_id,id), unique(organization_id,facility_id,invoice_ref,invoice_line),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id)
);
create index draqon_purchases_by_site on private.draqon_facility_purchases(organization_id,facility_id,purchased_on desc,id);
revoke all on private.draqon_price_curators,private.draqon_price_references,private.draqon_facility_purchases from public,anon,authenticated;
alter table private.draqon_price_curators enable row level security;
alter table private.draqon_price_references enable row level security;
alter table private.draqon_facility_purchases enable row level security;

create function private.draqon_price_assert_curator() returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise insufficient_privilege; end if;
  perform 1 from private.draqon_price_curators where user_id=auth.uid() and active for share;
  if not found then raise insufficient_privilege; end if;
end $$;
create function public.draqon_approve_price_reference(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
  perform private.draqon_price_assert_curator();
  insert into private.draqon_price_references as previous(item_key,spec_key,region,currency,base_unit,min_qty,max_qty,
    delivered_net_unit_price,valid_from,valid_until,evidence_ref,approved_by)
  values(private.draqon_price_key(p_input->>'item_key'),private.draqon_price_key(p_input->>'spec_key'),private.draqon_price_key(p_input->>'region'),
    upper(btrim(p_input->>'currency')),p_input->>'base_unit',(p_input->>'min_qty')::numeric,(p_input->>'max_qty')::numeric,
    (p_input->>'delivered_net_unit_price')::numeric,(p_input->>'valid_from')::date,(p_input->>'valid_until')::date,btrim(p_input->>'evidence_ref'),auth.uid())
  on conflict(evidence_ref,item_key,spec_key,region,currency,base_unit,min_qty,valid_from)
  do update set evidence_ref=excluded.evidence_ref
  where previous.retired_at is null and previous.max_qty is not distinct from excluded.max_qty and
        previous.delivered_net_unit_price=excluded.delivered_net_unit_price and previous.valid_until=excluded.valid_until
  returning id into r;
  if r is null then raise exception 'Approval evidence is already used for another revision' using errcode='23505'; end if;
  return r;
end $$;
create function public.draqon_approve_price_batch(p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare entry jsonb;
begin
  perform private.draqon_price_assert_curator();
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Expected array' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Invalid reference batch size' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(p_rows) loop
    perform public.draqon_approve_price_reference(entry);
  end loop;
  return jsonb_array_length(p_rows);
end $$;
revoke all on function public.draqon_approve_price_batch(jsonb) from public,anon,authenticated;
grant execute on function public.draqon_approve_price_batch(jsonb) to authenticated;
create function public.draqon_retire_price_reference(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.draqon_price_assert_curator();
  update private.draqon_price_references set retired_at=now(),retired_by=auth.uid() where id=p_id and retired_at is null;
end $$;

create function public.draqon_record_facility_purchase(p_org uuid,p_facility uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare row_in private.draqon_facility_purchases; old private.draqon_facility_purchases;
begin
  perform private.draqon_assert_field_actor(p_org,false);
  if not exists(select 1 from public.facilities where id=p_facility and organization_id=p_org)
     then raise insufficient_privilege; end if;
  select * into row_in from jsonb_populate_record(null::private.draqon_facility_purchases,p_input);
  if row_in.purchased_on>current_date then raise exception 'Invoice date exceeds today' using errcode='22023'; end if;
  if row_in.quote_line_id is not null and not exists (
    select 1 from public.quote_lines l join public.quotes q on q.id=l.quote_id and q.organization_id=l.organization_id
    join public.suppliers s on s.id=q.supplier_id and s.organization_id=q.organization_id
    left join public.products t on t.id=l.product_id and t.organization_id=q.organization_id and t.supplier_id=s.id
    where l.id=row_in.quote_line_id and l.organization_id=p_org and (l.product_id is null or t.id is not null)
  ) then raise insufficient_privilege; end if;
  row_in.organization_id:=p_org; row_in.facility_id:=p_facility; row_in.entered_by:=auth.uid(); row_in.entered_at:=now();
  row_in.item_key:=private.draqon_price_key(row_in.item_key); row_in.spec_key:=private.draqon_price_key(row_in.spec_key);
  row_in.region:=private.draqon_price_key(row_in.region); row_in.unit:=private.draqon_price_key(row_in.unit);
  row_in.currency:=upper(btrim(row_in.currency)); row_in.invoice_ref:=btrim(row_in.invoice_ref); row_in.invoice_line:=btrim(row_in.invoice_line);
  insert into private.draqon_facility_purchases select row_in.* on conflict do nothing;
  if found then return row_in.id; end if;
  select * into old from private.draqon_facility_purchases where organization_id=p_org and id=row_in.id;
  if not found or (to_jsonb(old)-'entered_at')<>(to_jsonb(row_in)-'entered_at') then
    raise exception 'Purchase reference already used' using errcode='23505';
  end if;
  return old.id;
end $$;

create function public.draqon_facility_price_benchmark(p_org uuid,p_facility uuid)
returns table(purchase_id uuid,invoice_ref text,invoice_line text,purchased_on date,item_key text,spec_key text,
  currency text,base_unit text,net_delivered_unit numeric,approved_unit numeric,difference_pct numeric,
  reference_count integer,reason text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not coalesce(private.has_org_access(p_org),false)
    or not exists (select 1 from public.facilities f where f.id=p_facility and f.organization_id=p_org)
  then raise insufficient_privilege; end if;
  return query
  with purchase as (
    select p.*,u.base_unit as bu,p.packs*p.units_per_pack*u.factor as qty,
      case when p.vat_mode='excluded' then p.packs*p.pack_price
           when p.vat_mode='included' and p.tax_pct is not null then p.packs*p.pack_price/(1+p.tax_pct/100) end
      +p.freight_net-p.discount_net as landed
    from private.draqon_facility_purchases p left join lateral private.draqon_price_unit(p.unit) u on true
    where p.organization_id=p_org and p.facility_id=p_facility
    order by p.purchased_on desc,p.id limit 200
  ), compared as (
    select p.*,m.* from purchase p cross join lateral (
      select coalesce(max(rank.level),0) as match_level,
        count(*) filter(where rank.level=7) as matches,
        avg(r.delivered_net_unit_price) filter(where rank.level=7) as mean_price
      from private.draqon_price_references r
      cross join lateral (select case when r.spec_key<>p.spec_key then 1
        when r.base_unit is distinct from p.bu then 2 when r.currency<>p.currency then 3
        when r.region<>p.region then 4 when p.purchased_on not between r.valid_from and r.valid_until then 5
        when p.qty<r.min_qty or p.qty>r.max_qty then 6 else 7 end as level) rank
      where r.item_key=p.item_key and r.retired_at is null
    ) m
  ), reasoned as (
    select c.*,case when c.bu is null then 'unsupported_unit' when c.landed is null then 'unknown_commercial_basis'
      when c.landed<0 then 'negative_net_amount' when c.match_level=0 then 'no_approved_item' when c.match_level=1 then 'specification_mismatch'
      when c.match_level=2 then 'unit_mismatch' when c.match_level=3 then 'currency_mismatch' when c.match_level=4 then 'region_mismatch'
      when c.match_level=5 then 'date_mismatch' when c.matches=0 then 'quantity_mismatch' else 'comparable' end as why from compared c
  )
  select c.id,c.invoice_ref,c.invoice_line,c.purchased_on,c.item_key,c.spec_key,c.currency,c.bu,
    case when c.landed>=0 then round(c.landed/c.qty,6) end,
    case when c.why='comparable' then round(c.mean_price,6) end,
    case when c.why='comparable' then round(100*((c.landed/c.qty)/c.mean_price-1),2) end,
    case when c.why='comparable' then c.matches::integer else 0 end,c.why
  from reasoned c order by c.purchased_on desc,c.id;
end $$;
create function public.draqon_price_catalog(p_org uuid) returns table(item_key text,spec_key text)
language sql stable security definer set search_path='' as $$
  select distinct r.item_key,r.spec_key from private.draqon_price_references r
  where r.retired_at is null and (auth.jwt()->>'aal')='aal2' and private.has_org_access(p_org)
  order by r.item_key,r.spec_key limit 500
$$;
create function public.draqon_is_price_curator() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(auth.jwt()->>'aal','')='aal2' and exists(
    select 1 from private.draqon_price_curators c where c.user_id=auth.uid() and c.active)
$$;
revoke all on function public.draqon_price_catalog(uuid),public.draqon_is_price_curator() from public,anon,authenticated;
grant execute on function public.draqon_price_catalog(uuid),public.draqon_is_price_curator() to authenticated;
revoke all on function private.draqon_price_key(text),private.draqon_price_unit(text),private.draqon_price_assert_curator() from public,anon,authenticated;
revoke all on function public.draqon_approve_price_reference(jsonb),public.draqon_retire_price_reference(uuid),
  public.draqon_record_facility_purchase(uuid,uuid,jsonb),public.draqon_facility_price_benchmark(uuid,uuid) from public,anon,authenticated;
grant execute on function public.draqon_approve_price_reference(jsonb),public.draqon_retire_price_reference(uuid),
  public.draqon_record_facility_purchase(uuid,uuid,jsonb),public.draqon_facility_price_benchmark(uuid,uuid) to authenticated;
commit;
