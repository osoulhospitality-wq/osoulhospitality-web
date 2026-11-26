begin;
do $test$
declare rowid uuid:=gen_random_uuid(); email_input text:='fixture@example.invalid'; hs bigint:=809202661; input jsonb; badhash jsonb; chk int:=0;
begin
 insert into public.website_leads(id,name,organization,email,asset_type,city,stage,opening_target,units,primary_gap,urgency,documents,requested_support,consent,hubspot_status,privacy_notice_version)
 values(rowid,'QA','QA',email_input,'QA','QA','QA','QA','QA','QA','QA','QA','QA',true,'not_attempted','QA-v1');
 input:=jsonb_build_array(jsonb_build_object('lead',rowid,'contact',hs,'address_hash',encode(extensions.digest(email_input,'sha256'),'hex')));
 badhash:=jsonb_set(input,'{0,address_hash}',to_jsonb(repeat('a',64)));
 if private.draqon_link_submitted_contacts(input)<>0 then raise exception 'unsubmitted';end if;
 update public.website_leads set hubspot_status='submitted' where id=rowid;
 if private.draqon_link_submitted_contacts(badhash)<>0 then raise exception 'mismatched';end if;
 if private.draqon_link_submitted_contacts(input)<>1 then raise exception 'valid match';end if;
 if private.draqon_link_submitted_contacts(input)<>0 then raise exception 'retry';end if;
 if private.draqon_link_submitted_contacts(jsonb_set(input,'{0,contact}','11'))<>0 then raise exception 'replacement';end if;
 if (select count(*) from private.draqon_contact_receipts where lead_id=rowid and contact_id=hs)<>1 then raise exception 'receipt';end if;
 if has_function_privilege('authenticated','private.draqon_link_submitted_contacts(jsonb)','EXECUTE') or has_function_privilege('anon','private.draqon_link_submitted_contacts(jsonb)','EXECUTE') then raise exception 'role';end if;
end $test$;
select 7 as checks_passed;
rollback;
