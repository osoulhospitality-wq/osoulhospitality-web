create extension if not exists pgcrypto;
create type public.app_role as enum ('owner','approver','analyst','viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, cr_number text, city text,
  status text not null default 'under_review',
  coverage text, payment_terms text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  sku text not null, name text not null, category text,
  pack_price numeric(14,2) not null check (pack_price >= 0),
  standard_qty numeric(14,3) not null check (standard_qty > 0),
  unit text not null, moq numeric(14,3) not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id),
  name text not null, building text, annual_value numeric(14,2),
  end_date date, notice_days int not null default 90,
  probability smallint check (probability between 1 and 5),
  impact smallint check (impact between 1 and 5),
  risk_text text, status text not null default 'open',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique, file_name text not null,
  mime_type text, sha256 text not null, document_type text not null,
  reference_text text, ocr_status text not null default 'pending',
  ocr_payload jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.contracts enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.current_role()
returns public.app_role language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create policy "team reads profiles" on public.profiles for select to authenticated using (public.current_role() is not null);
create policy "owner manages profiles" on public.profiles for all to authenticated
using (public.current_role() = 'owner') with check (public.current_role() = 'owner');

create policy "team reads suppliers" on public.suppliers for select to authenticated using (public.current_role() is not null);
create policy "analysts manage suppliers" on public.suppliers for all to authenticated
using (public.current_role() in ('owner','approver','analyst'))
with check (public.current_role() in ('owner','approver','analyst'));

create policy "team reads products" on public.products for select to authenticated using (public.current_role() is not null);
create policy "analysts manage products" on public.products for all to authenticated
using (public.current_role() in ('owner','approver','analyst'))
with check (public.current_role() in ('owner','approver','analyst'));

create policy "team reads contracts" on public.contracts for select to authenticated using (public.current_role() is not null);
create policy "approvers manage contracts" on public.contracts for all to authenticated
using (public.current_role() in ('owner','approver'))
with check (public.current_role() in ('owner','approver'));

create policy "team reads documents" on public.documents for select to authenticated using (public.current_role() is not null);
create policy "analysts register documents" on public.documents for insert to authenticated
with check (public.current_role() in ('owner','approver','analyst'));
create policy "approvers update documents" on public.documents for update to authenticated
using (public.current_role() in ('owner','approver'))
with check (public.current_role() in ('owner','approver'));

create policy "owner reads audit" on public.audit_events for select to authenticated
using (public.current_role() = 'owner');
create policy "team appends audit" on public.audit_events for insert to authenticated
with check (actor_id = auth.uid());
