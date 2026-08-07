-- Osoul Command Center v13 enterprise activation schema.
-- Run in a dedicated Supabase project after reviewing the project region,
-- Data API exposure, retention policy, and backup plan.

create extension if not exists pgcrypto;
create schema if not exists private;

create type public.app_role as enum ('owner','approver','analyst','viewer');
create type public.request_status as enum ('new','accepted','processing','review','completed','failed','cancelled');
create type public.request_priority as enum ('normal','high','urgent');
create type public.supplier_status as enum ('under_review','approved','suspended');
create type public.contract_status as enum ('draft','review','active','expired','terminated');
create type public.approval_status as enum ('pending','approved','rejected','changes_requested');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 180),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 180),
  role public.app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 240),
  cr_number text,
  tax_number text,
  city text,
  status public.supplier_status not null default 'under_review',
  coverage text,
  payment_terms text,
  qualification_score numeric(5,2) check (qualification_score between 0 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, cr_number)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  sku text not null,
  name text not null,
  category text,
  pack_price numeric(14,2) not null check (pack_price >= 0),
  standard_qty numeric(14,3) not null check (standard_qty > 0),
  unit text not null,
  moq numeric(14,3) not null default 1 check (moq > 0),
  currency char(3) not null default 'SAR',
  valid_from date,
  valid_until date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_id, sku),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  quote_number text,
  quote_date date,
  valid_until date,
  currency char(3) not null default 'SAR',
  delivery_cost numeric(14,2) not null default 0 check (delivery_cost >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_rate numeric(5,2) not null default 15 check (tax_rate between 0 and 100),
  source_document_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_id, quote_number)
);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  pack_price numeric(14,2) not null check (pack_price >= 0),
  standard_qty numeric(14,3) not null check (standard_qty > 0),
  unit text not null,
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  name text not null,
  building text,
  annual_value numeric(14,2) check (annual_value >= 0),
  currency char(3) not null default 'SAR',
  start_date date,
  end_date date,
  notice_days integer not null default 90 check (notice_days between 0 and 730),
  probability smallint check (probability between 1 and 5),
  impact smallint check (impact between 1 and 5),
  risk_text text,
  status public.contract_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 240),
  body text not null check (char_length(body) between 3 and 20000),
  category text not null default 'general',
  priority public.request_priority not null default 'normal',
  status public.request_status not null default 'new',
  due_at timestamptz,
  requester_id uuid not null references auth.users(id),
  assigned_to uuid references auth.users(id),
  external_reference text,
  source text not null default 'command_center',
  classification text not null default 'internal',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, external_reference)
);

create table public.request_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  event_type text not null,
  status public.request_status,
  execution_id text,
  idempotency_key text,
  message text,
  evidence jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  unique (organization_id, idempotency_key, event_type)
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject text not null,
  decision text not null,
  rationale text not null,
  evidence_reference text,
  approver_id uuid not null references auth.users(id),
  decided_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  status public.approval_status not null default 'pending',
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  rationale text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((status = 'pending' and decided_at is null) or status <> 'pending')
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  document_type text not null,
  reference_text text,
  ocr_status text not null default 'pending' check (ocr_status in ('pending','processing','completed','failed','not_required')),
  ocr_payload jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, sha256)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.suppliers add constraint suppliers_org_id_key unique (organization_id, id);
alter table public.products add constraint products_org_id_key unique (organization_id, id);
alter table public.quotes add constraint quotes_org_id_key unique (organization_id, id);
alter table public.requests add constraint requests_org_id_key unique (organization_id, id);
alter table public.documents add constraint documents_org_id_key unique (organization_id, id);
alter table public.products add constraint products_supplier_same_org_fk
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete restrict;
alter table public.quotes add constraint quotes_supplier_same_org_fk
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete restrict;
alter table public.quote_lines add constraint quote_lines_quote_same_org_fk
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id) on delete cascade;
alter table public.quote_lines add constraint quote_lines_product_same_org_fk
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete restrict;
alter table public.contracts add constraint contracts_supplier_same_org_fk
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete restrict;
alter table public.request_events add constraint request_events_request_same_org_fk
  foreign key (organization_id, request_id) references public.requests (organization_id, id) on delete cascade;
alter table public.quotes add constraint quotes_document_same_org_fk
  foreign key (organization_id, source_document_id) references public.documents (organization_id, id) on delete restrict;

create index organization_members_user_idx on public.organization_members (user_id) where active;
create index suppliers_org_status_idx on public.suppliers (organization_id, status);
create index products_org_supplier_idx on public.products (organization_id, supplier_id);
create index products_org_category_idx on public.products (organization_id, category);
create index quotes_org_supplier_date_idx on public.quotes (organization_id, supplier_id, quote_date desc);
create index quote_lines_quote_idx on public.quote_lines (quote_id);
create index contracts_org_end_idx on public.contracts (organization_id, end_date) where status in ('active','review');
create index contracts_supplier_idx on public.contracts (supplier_id);
create index requests_org_status_priority_idx on public.requests (organization_id, status, priority, updated_at desc);
create index requests_org_due_idx on public.requests (organization_id, due_at) where status not in ('completed','cancelled');
create index request_events_request_time_idx on public.request_events (request_id, occurred_at);
create index approvals_org_status_idx on public.approvals (organization_id, status, requested_at);
create index documents_org_type_idx on public.documents (organization_id, document_type, created_at desc);
create index audit_org_time_idx on public.audit_events (organization_id, occurred_at desc);

create or replace function private.current_org_role(target_org uuid)
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = target_org
    and m.user_id = (select auth.uid())
    and m.active = true
$$;

create or replace function private.has_org_access(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.current_org_role(target_org) is not null $$;

create or replace function private.can_write_org(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.current_org_role(target_org) in ('owner','approver','analyst') $$;

create or replace function private.can_approve_org(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select private.current_org_role(target_org) in ('owner','approver') $$;

create or replace function private.bootstrap_org_owner()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, user_id, full_name, role)
  values (new.id, new.created_by, coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = new.created_by), 'Organization owner'), 'owner');
  return new;
end;
$$;

create trigger organizations_bootstrap_owner
after insert on public.organizations
for each row execute function private.bootstrap_org_owner();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by = (select auth.uid());
  return new;
end;
$$;

create trigger suppliers_actor before insert on public.suppliers for each row execute function private.set_created_by();
create trigger products_actor before insert on public.products for each row execute function private.set_created_by();
create trigger quotes_actor before insert on public.quotes for each row execute function private.set_created_by();
create trigger contracts_actor before insert on public.contracts for each row execute function private.set_created_by();
create trigger documents_actor before insert on public.documents for each row execute function private.set_created_by();
create trigger suppliers_updated before update on public.suppliers for each row execute function private.set_updated_at();
create trigger products_updated before update on public.products for each row execute function private.set_updated_at();
create trigger quotes_updated before update on public.quotes for each row execute function private.set_updated_at();
create trigger contracts_updated before update on public.contracts for each row execute function private.set_updated_at();
create trigger requests_updated before update on public.requests for each row execute function private.set_updated_at();

create or replace function private.append_audit_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  record_data jsonb;
begin
  record_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, details)
  values (
    (record_data->>'organization_id')::uuid,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    record_data->>'id',
    jsonb_build_object('source', 'database_trigger')
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger suppliers_audit after insert or update or delete on public.suppliers for each row execute function private.append_audit_event();
create trigger products_audit after insert or update or delete on public.products for each row execute function private.append_audit_event();
create trigger quotes_audit after insert or update or delete on public.quotes for each row execute function private.append_audit_event();
create trigger contracts_audit after insert or update or delete on public.contracts for each row execute function private.append_audit_event();
create trigger requests_audit after insert or update or delete on public.requests for each row execute function private.append_audit_event();
create trigger decisions_audit after insert or update or delete on public.decisions for each row execute function private.append_audit_event();
create trigger approvals_audit after insert or update or delete on public.approvals for each row execute function private.append_audit_event();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function private.append_audit_event();

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_org_role(uuid), private.has_org_access(uuid), private.can_write_org(uuid), private.can_approve_org(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.contracts enable row level security;
alter table public.requests enable row level security;
alter table public.request_events enable row level security;
alter table public.decisions enable row level security;
alter table public.approvals enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;

create policy "create organization" on public.organizations for insert to authenticated
with check (created_by = (select auth.uid()));
create policy "members read organization" on public.organizations for select to authenticated
using (private.has_org_access(id));
create policy "owners update organization" on public.organizations for update to authenticated
using (private.current_org_role(id) = 'owner') with check (private.current_org_role(id) = 'owner');

create policy "members read membership" on public.organization_members for select to authenticated
using (private.has_org_access(organization_id));
create policy "owners manage membership" on public.organization_members for all to authenticated
using (private.current_org_role(organization_id) = 'owner')
with check (private.current_org_role(organization_id) = 'owner');

create policy "members read suppliers" on public.suppliers for select to authenticated using (private.has_org_access(organization_id));
create policy "team manages suppliers" on public.suppliers for all to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id));
create policy "members read products" on public.products for select to authenticated using (private.has_org_access(organization_id));
create policy "team manages products" on public.products for all to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id));
create policy "members read quotes" on public.quotes for select to authenticated using (private.has_org_access(organization_id));
create policy "team manages quotes" on public.quotes for all to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id));
create policy "members read quote lines" on public.quote_lines for select to authenticated using (private.has_org_access(organization_id));
create policy "team manages quote lines" on public.quote_lines for all to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id));
create policy "members read contracts" on public.contracts for select to authenticated using (private.has_org_access(organization_id));
create policy "approvers manage contracts" on public.contracts for all to authenticated using (private.can_approve_org(organization_id)) with check (private.can_approve_org(organization_id));
create policy "members read requests" on public.requests for select to authenticated using (private.has_org_access(organization_id));
create policy "team creates requests" on public.requests for insert to authenticated with check (private.can_write_org(organization_id) and requester_id = (select auth.uid()));
create policy "team updates requests" on public.requests for update to authenticated using (private.can_write_org(organization_id)) with check (private.can_write_org(organization_id));
create policy "members read request events" on public.request_events for select to authenticated using (private.has_org_access(organization_id));
create policy "team appends request events" on public.request_events for insert to authenticated with check (private.can_write_org(organization_id) and (actor_id is null or actor_id = (select auth.uid())));
create policy "members read decisions" on public.decisions for select to authenticated using (private.has_org_access(organization_id));
create policy "approvers create decisions" on public.decisions for insert to authenticated with check (private.can_approve_org(organization_id) and approver_id = (select auth.uid()));
create policy "members read approvals" on public.approvals for select to authenticated using (private.has_org_access(organization_id));
create policy "team requests approvals" on public.approvals for insert to authenticated with check (private.can_write_org(organization_id) and requested_by = (select auth.uid()));
create policy "approvers decide approvals" on public.approvals for update to authenticated using (private.can_approve_org(organization_id)) with check (private.can_approve_org(organization_id));
create policy "members read documents" on public.documents for select to authenticated using (private.has_org_access(organization_id));
create policy "team registers documents" on public.documents for insert to authenticated with check (private.can_write_org(organization_id) and created_by = (select auth.uid()));
create policy "approvers update documents" on public.documents for update to authenticated using (private.can_approve_org(organization_id)) with check (private.can_approve_org(organization_id));
create policy "owners read audit" on public.audit_events for select to authenticated using (private.current_org_role(organization_id) = 'owner');

-- MFA is enforced at the database boundary, not only in the interface.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','organization_members','suppliers','products','quotes','quote_lines',
    'contracts','requests','request_events','decisions','approvals','documents','audit_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select auth.jwt()->>''aal'') = ''aal2'') with check ((select auth.jwt()->>''aal'') = ''aal2'')',
      'mfa required', table_name
    );
  end loop;
end;
$$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.organizations, public.organization_members, public.suppliers, public.products, public.quotes, public.quote_lines, public.contracts, public.requests, public.decisions, public.approvals, public.documents to authenticated;
grant select, insert on public.request_events to authenticated;
grant select on public.audit_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'command-center-documents',
  'command-center-documents',
  false,
  26214400,
  array['application/pdf','image/png','image/jpeg','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "members read private documents" on storage.objects for select to authenticated
using (
  bucket_id = 'command-center-documents'
  and private.has_org_access(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
);

create policy "team uploads private documents" on storage.objects for insert to authenticated
with check (
  bucket_id = 'command-center-documents'
  and private.can_write_org(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
  and owner_id = (select auth.uid()::text)
);

create policy "approvers manage private documents" on storage.objects for update to authenticated
using (
  bucket_id = 'command-center-documents'
  and private.can_approve_org(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  )
)
with check (bucket_id = 'command-center-documents');

create policy "owners delete private documents" on storage.objects for delete to authenticated
using (
  bucket_id = 'command-center-documents'
  and private.current_org_role(
    case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid else null end
  ) = 'owner'
);

-- Required post-run checks:
-- 1) Confirm anon has no table or function access.
-- 2) Test owner/approver/analyst/viewer with aal1 and aal2 sessions.
-- 3) Run Supabase security and performance advisors.
-- 4) Test backup restoration and private-object access from a non-member account.
