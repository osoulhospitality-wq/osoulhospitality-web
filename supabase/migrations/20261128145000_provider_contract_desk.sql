-- Supplier staff use dedicated accounts. Only an authorized administrator provisions private mappings.
create table private.fm_provider_accounts (
  supplier_id uuid not null references public.suppliers(id),
  user_id uuid not null references auth.users(id),
  active boolean not null default true,
  primary key (user_id, supplier_id)
);
create table private.fm_provider_submissions (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  contract_id uuid not null references public.contracts(id),
  supplier_id uuid not null references public.suppliers(id),
  organization_id uuid not null references public.organizations(id),
  author_id uuid not null references auth.users(id),
  kind text not null check (kind in ('visit_report','material_request','quotation','invoice','corrective_action')),
  reference text not null check (length(reference) between 2 and 160),
  details text not null check (length(details) between 2 and 4000),
  created_at timestamptz not null default now(),
  decision text check (decision in ('accepted','returned')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  unique (author_id,request_key),
  check ((decision is null) = (reviewed_by is null) and (decision is null) = (reviewed_at is null))
);
alter table private.fm_provider_accounts enable row level security;
alter table private.fm_provider_submissions enable row level security;
revoke all on private.fm_provider_accounts, private.fm_provider_submissions from public, anon, authenticated;
create index fm_provider_submissions_org_idx on private.fm_provider_submissions(organization_id,created_at desc,id);
create index fm_provider_submissions_contract_idx on private.fm_provider_submissions(contract_id,created_at desc,id);

create function public.fm_provider_contracts(p_offset integer default 0)
returns table(contract_id uuid, name text, building text, status text, ends_on date, updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select c.id,c.name,c.building,c.status::text,c.end_date,c.updated_at
  from private.fm_provider_accounts a join public.suppliers s on s.id=a.supplier_id
  join public.contracts c on c.supplier_id=s.id and c.organization_id=s.organization_id
  where a.active and a.user_id=auth.uid() and auth.jwt()->>'aal'='aal2'
  order by c.name,c.id limit 50 offset greatest(0,p_offset)
$$;

create function public.fm_provider_submit(p_contract uuid,p_key uuid,p_kind text,p_reference text,p_details text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contracts; previous private.fm_provider_submissions; new_id uuid;
begin
  select ct.* into strict c from public.contracts ct join public.suppliers s
    on s.id=ct.supplier_id and s.organization_id=ct.organization_id
    join private.fm_provider_accounts a on a.supplier_id=s.id
    where ct.id=p_contract and a.user_id=auth.uid() and a.active and auth.jwt()->>'aal'='aal2'
    for share of ct,s,a;
  insert into private.fm_provider_submissions(request_key,contract_id,supplier_id,organization_id,author_id,kind,reference,details)
    values (p_key,c.id,c.supplier_id,c.organization_id,auth.uid(),p_kind,btrim(p_reference),btrim(p_details))
    on conflict(author_id,request_key) do nothing returning id into new_id;
  if new_id is not null then return new_id; end if;
  select * into strict previous from private.fm_provider_submissions where author_id=auth.uid() and request_key=p_key;
  if (previous.contract_id,previous.kind,previous.reference,previous.details) is distinct from
      (p_contract,p_kind,btrim(p_reference),btrim(p_details)) then
    raise exception 'Request key already used for another submission'; end if;
  return previous.id;
end $$;

create function public.fm_submission_inbox(p_org uuid default null,p_contract uuid default null,p_offset integer default 0)
returns table(submission_id uuid,contract_name text,kind text,reference text,details text,created_at timestamptz,decision text,review_note text,reviewed_at timestamptz)
language sql stable security definer set search_path='' as $$
 select v.id,c.name,v.kind,v.reference,v.details,v.created_at,v.decision,v.review_note,v.reviewed_at
 from private.fm_provider_submissions v join public.contracts c on c.id=v.contract_id and c.organization_id=v.organization_id
 where auth.jwt()->>'aal'='aal2' and (
   (p_contract is null and p_org=v.organization_id and private.current_org_role(p_org) in ('owner','approver'))
   or (p_org is null and p_contract=v.contract_id and c.supplier_id=v.supplier_id and exists
       (select 1 from private.fm_provider_accounts a where a.user_id=auth.uid() and a.active and a.supplier_id=v.supplier_id))
 ) order by v.created_at desc,v.id limit 50 offset greatest(0,p_offset)
$$;
create function public.fm_review_submission(p_id uuid,p_decision text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare reviewed uuid;
begin
  if p_decision is null or p_decision not in ('accepted','returned') or p_note is null or length(btrim(p_note)) not between 2 and 1000 then
    raise exception 'Invalid review'; end if;
  update private.fm_provider_submissions v set decision=p_decision,review_note=btrim(p_note),reviewed_at=now(),reviewed_by=auth.uid()
    where v.id=p_id and v.decision is null and v.author_id<>auth.uid() and auth.jwt()->>'aal'='aal2'
    and private.current_org_role(v.organization_id) in ('owner','approver')
    and not exists (select 1 from private.fm_provider_accounts a where a.active and a.user_id=auth.uid() and a.supplier_id=v.supplier_id)
    returning v.id into reviewed;
  if reviewed is null then raise exception 'Review unavailable'; end if;
  return reviewed;
end $$;
revoke all on function public.fm_provider_contracts(integer),public.fm_provider_submit(uuid,uuid,text,text,text),public.fm_submission_inbox(uuid,uuid,integer),public.fm_review_submission(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fm_provider_contracts(integer),public.fm_provider_submit(uuid,uuid,text,text,text),public.fm_submission_inbox(uuid,uuid,integer),public.fm_review_submission(uuid,text,text) to authenticated;
