create table if not exists public.website_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  form_name text not null default 'hospitality_readiness_brief',
  language text not null default 'ar',
  name text not null,
  organization text not null,
  email text,
  phone text,
  asset_type text not null,
  city text not null,
  stage text not null,
  opening_target text not null,
  units text not null,
  primary_gap text not null,
  urgency text not null,
  documents text not null,
  requested_support text not null,
  description text,
  consent boolean not null default false,
  source text not null default 'website',
  status text not null default 'new',
  hubspot_contact_id bigint,
  processing_error text,
  constraint website_leads_contact_required check (
    nullif(btrim(coalesce(email, '')), '') is not null
    or nullif(btrim(coalesce(phone, '')), '') is not null
  ),
  constraint website_leads_form_check check (form_name = 'hospitality_readiness_brief'),
  constraint website_leads_language_check check (language in ('ar', 'en')),
  constraint website_leads_status_check check (status in ('new', 'processing', 'synced', 'failed', 'archived'))
);

alter table public.website_leads enable row level security;

revoke all on table public.website_leads from anon, authenticated;
grant insert on table public.website_leads to anon;
grant select, insert, update, delete on table public.website_leads to service_role;

drop policy if exists "website_leads_anon_insert" on public.website_leads;
create policy "website_leads_anon_insert"
  on public.website_leads
  for insert
  to anon
  with check (
    consent is true
    and form_name = 'hospitality_readiness_brief'
    and char_length(name) between 1 and 120
    and char_length(organization) between 1 and 180
    and char_length(city) between 1 and 120
    and status = 'new'
    and source = 'website'
  );

create index if not exists website_leads_status_created_idx
  on public.website_leads (status, created_at desc);

comment on table public.website_leads is
  'Server-submitted website enquiries; anon can insert validated rows only and cannot read them.';