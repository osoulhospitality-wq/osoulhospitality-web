-- Internal access in an organization and supplier access in that same organization
-- are mutually exclusive. Keep active grant counts because a supplier user may
-- have multiple supplier assignments, and may belong internally to a different org.
-- Acquire these locks before backfill; migrations run inside one transaction.
lock table public.organization_members, private.fm_provider_accounts in share row exclusive mode;

create table private.fm_identity_grants (
  organization_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('internal','provider')),
  grant_count bigint not null check (grant_count >= 0),
  primary key (organization_id, user_id)
);
alter table private.fm_identity_grants enable row level security;
revoke all on private.fm_identity_grants from public, anon, authenticated, service_role;

-- A pre-existing dual assignment fails the unique constraint and aborts the
-- migration without choosing a role or rewriting any existing membership.
insert into private.fm_identity_grants (organization_id,user_id,kind,grant_count)
select organization_id, user_id, 'internal', count(*) from public.organization_members
where active group by organization_id,user_id
union all
select s.organization_id, a.user_id, 'provider', count(*) from private.fm_provider_accounts a
join public.suppliers s on s.id=a.supplier_id where a.active group by s.organization_id,a.user_id;

create function private.fm_sync_identity_grant() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  old_org uuid; new_org uuid; old_user uuid; new_user uuid;
  grant_kind text := tg_argv[0]; remaining bigint;
begin
  if tg_op='TRUNCATE' then
    delete from private.fm_identity_grants where kind=grant_kind;
    return null;
  end if;
  if tg_op in ('UPDATE','DELETE') then
    if old.active then
      old_user := old.user_id;
      if grant_kind='internal' then old_org := old.organization_id;
      else select s.organization_id into strict old_org from public.suppliers s where s.id=old.supplier_id;
      end if;
    end if;
  end if;
  if tg_op in ('UPDATE','INSERT') then
    if new.active then
      new_user := new.user_id;
      if grant_kind='internal' then new_org := new.organization_id;
      else select s.organization_id into strict new_org from public.suppliers s where s.id=new.supplier_id;
      end if;
    end if;
  end if;

  if (old_org,old_user) is not distinct from (new_org,new_user) then return null; end if;
  if old_org is not null then
    update private.fm_identity_grants set grant_count=grant_count-1
    where organization_id=old_org and user_id=old_user and kind=grant_kind and grant_count>0
    returning grant_count into remaining;
    if not found then raise exception 'Identity grant register is inconsistent' using errcode='23514'; end if;
    if remaining=0 then
      delete from private.fm_identity_grants where organization_id=old_org and user_id=old_user;
    end if;
  end if;
  if new_org is not null then
    -- ON CONFLICT locks the latest row for this exact key, including rows from
    -- concurrent uncommitted grants. Ordinary snapshot-based EXISTS checks do not.
    insert into private.fm_identity_grants as g (organization_id,user_id,kind,grant_count)
      values (new_org,new_user,grant_kind,1)
    on conflict (organization_id,user_id) do update set grant_count=g.grant_count+1
      where g.kind=excluded.kind;
    if not found then
      raise exception 'An internal and a supplier account cannot both be active in this organization' using errcode='23514';
    end if;
  end if;
  return null;
end $$;

revoke all on function private.fm_sync_identity_grant() from public, anon, authenticated, service_role;
create trigger fm_internal_identity_grant after insert or update or delete on public.organization_members
for each row execute function private.fm_sync_identity_grant('internal');
create trigger fm_provider_identity_grant after insert or update or delete on private.fm_provider_accounts
for each row execute function private.fm_sync_identity_grant('provider');
create trigger fm_internal_identity_truncate after truncate on public.organization_members
for each statement execute function private.fm_sync_identity_grant('internal');
create trigger fm_provider_identity_truncate after truncate on private.fm_provider_accounts
for each statement execute function private.fm_sync_identity_grant('provider');
