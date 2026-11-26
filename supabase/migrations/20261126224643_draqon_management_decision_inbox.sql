-- Current management action list. Only existing org owners/approvers on an MFA session may use it.
create table private.draqon_management_receipts (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null, item_key text not null, noted_by uuid not null references auth.users(id),
 noted_at timestamptz not null default now(), note text not null check(length(btrim(note)) between 2 and 500),
 primary key(organization_id,kind,item_key)
);
alter table private.draqon_management_receipts enable row level security;
revoke all on private.draqon_management_receipts from public,anon,authenticated;

create function private.draqon_inbox_rows(org uuid, today date)
returns table(kind text,key text,title text,due date,priority text,owner_role text,origin text,site_name text)
language sql stable set search_path='' as $$
 select 'approval',a.id::text||'.'||md5(extract(epoch from a.requested_at)::text||a.entity_type||a.entity_id::text),
        'قرار معلق • '||a.entity_type,null::date,'high','صاحب صلاحية الاعتماد','سجل الموافقات',null::text
 from public.approvals a where a.organization_id=org and a.status='pending'
 union all
 select 'contract',c.id::text||'.'||c.version||'.'||(c.end_date-c.notice_days)::text,c.name,
        c.end_date-c.notice_days,case when c.end_date-c.notice_days<=today then 'urgent' else 'normal' end,
        'مدير العقود','إشعار عقد',c.building
 from public.contracts c where c.organization_id=org and c.status='active' and c.end_date-c.notice_days<=today+30
 union all
 select 'request',r.id::text||'.'||md5(extract(epoch from r.updated_at)::text||r.status::text),
        r.title,(r.due_at at time zone 'Asia/Riyadh')::date,
        case when r.due_at<now() then 'urgent' else r.priority::text end,
        case when r.assigned_to is null then 'مدير العمليات لتحديد المسؤول' else 'المكلّف بالطلب' end,'الطلبات التنفيذية',null
 from public.requests r where r.organization_id=org and r.status in ('new','accepted','processing','review','failed')
 union all
 select 'field_review',r.id::text||'.'||r.version,'مراجعة كشف '||r.code,null::date,'normal','مراجع المنشأة','نماذج الفنيين',f.name
 from public.field_form_records r join public.facilities f on f.id=r.facility_id and f.organization_id=org
 where r.organization_id=org and r.status='submitted' and not exists(select from public.field_form_reviews v where v.record_id=r.id)
 union all
 select 'late_order',w.id::text||'.'||o.due_on::text||'.'||w.status::text,w.summary,o.due_on,'urgent','مدير الصيانة','أمر صيانة دوري',f.name
 from public.facility_pm_occurrences o join public.facility_work_orders w on w.id=o.work_order_id and w.organization_id=org
 join public.facilities f on f.id=o.facility_id and f.organization_id=org
 where o.organization_id=org and o.due_on<today and w.status<>'completed'
$$;
revoke all on function private.draqon_inbox_rows(uuid,date) from public,anon,authenticated;

create function public.draqon_daily_desk(p_site uuid,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site); result jsonb; today date:=(now() at time zone 'Asia/Riyadh')::date;
begin
 if p_offset is null or p_offset<0 then raise exception 'Invalid inbox offset';end if;
 with items as materialized (select r.*,a.noted_at as acked_at,a.note as ack_note
  from private.draqon_inbox_rows(org,today) r
  left join private.draqon_management_receipts a on a.organization_id=org and a.kind=r.kind and a.item_key=r.key),
 page as (select i.*,row_number() over(order by (acked_at is not null),case priority when 'urgent' then 0 when 'high' then 1 else 2 end,due nulls last,kind,key) as position from items i
 order by position offset p_offset limit 25)
 select jsonb_build_object('as_of',now(),'org_scope',true,'counts',jsonb_build_object(
  'approvals',count(*) filter(where kind='approval'),'contracts',count(*) filter(where kind='contract'),
  'requests',count(*) filter(where kind='request'),'field_reviews',count(*) filter(where kind='field_review'),'late_orders',count(*) filter(where kind='late_order')),
  'total',count(*),'has_more',count(*)::bigint>p_offset::bigint+25,
  'rows',coalesce((select jsonb_agg(to_jsonb(p)-'position' order by p.position) from page p),'[]'::jsonb)) into result from items;
 return result;
end $$;

create function public.draqon_daily_ack(p_site uuid,p_kind text,p_key text,p_note text) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site); result timestamptz;
begin
 if coalesce(length(btrim(p_note)),0) not between 2 and 500 then raise exception 'DRAQON_NOTE_REQUIRED';end if;
 if not exists(select from private.draqon_inbox_rows(org,(now() at time zone 'Asia/Riyadh')::date) r where r.kind=p_kind and r.key=p_key)
 then raise exception 'DRAQON_ITEM_CHANGED';end if;
 insert into private.draqon_management_receipts(organization_id,kind,item_key,noted_by,note)
 values(org,p_kind,p_key,auth.uid(),btrim(p_note)) on conflict do nothing returning noted_at into result;
 if result is null then
   select noted_at into result from private.draqon_management_receipts where organization_id=org and kind=p_kind and item_key=p_key
     and noted_by=auth.uid() and note=btrim(p_note);
   if result is null then raise exception 'DRAQON_ALREADY_NOTED';end if;
 end if;
 return result;
end $$;
revoke all on function public.draqon_daily_desk(uuid,int),public.draqon_daily_ack(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.draqon_daily_desk(uuid,int),public.draqon_daily_ack(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
