-- Operator-only receipts for contacts already received by the corporate CRM.
-- Deleting an expired inquiry also deletes its receipt.
create table private.draqon_contact_receipts(
 lead_id uuid primary key references public.website_leads(id) on delete cascade,
 contact_id bigint not null check(contact_id>0), matched_at timestamptz not null default now()
);
alter table private.draqon_contact_receipts enable row level security;
revoke all on private.draqon_contact_receipts from public,anon,authenticated;
create function private.draqon_link_submitted_contacts(matches jsonb) returns int
language plpgsql security invoker set search_path='' as $$
declare changed int;
begin
 if jsonb_typeof(matches) is distinct from 'array' then raise exception 'Expected match array';end if;
 if jsonb_array_length(matches)>100 then raise exception 'Batch exceeds 100';end if;
 if exists(select from jsonb_to_recordset(matches) as x(lead uuid,contact bigint,address_hash text)
           group by lead having count(*)>1) then raise exception 'Duplicate lead in batch';end if;
 if exists(select from jsonb_to_recordset(matches) as x(lead uuid,contact bigint,address_hash text)
           where lead is null or contact is null or contact<=0 or address_hash is null or address_hash !~ '^[a-f0-9]{64}$')
 then raise exception 'Invalid CRM observation';end if;
 with selected as (
   select l.id,m.contact from public.website_leads l
   join jsonb_to_recordset(matches) as m(lead uuid,contact bigint,address_hash text) on l.id=m.lead
   where l.consent and l.email is not null and l.hubspot_status='submitted' and l.hubspot_contact_id is null
     and l.expires_at>now() and encode(extensions.digest(lower(btrim(l.email)),'sha256'),'hex')=m.address_hash
   order by l.id for update of l
 ), revised as (
   update public.website_leads l set hubspot_contact_id=s.contact from selected s
   where l.id=s.id and l.hubspot_contact_id is null returning l.id,l.hubspot_contact_id
 )
 insert into private.draqon_contact_receipts(lead_id,contact_id) select id,hubspot_contact_id from revised;
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function private.draqon_link_submitted_contacts(jsonb) from public,anon,authenticated;
