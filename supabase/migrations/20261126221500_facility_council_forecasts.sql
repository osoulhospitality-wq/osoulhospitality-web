begin;

-- Keep the same arithmetic order, rolling origins, vetoes and units as forecastSeries().
-- Internal routines receive no external inputs, credentials or model clients.
create function private.council_forecast_mean(vals double precision[]) returns double precision
language plpgsql immutable strict set search_path='' as $$
declare scale float8; result float8:=0; x float8;
begin
 select max(abs(y)) into scale from unnest(vals) y;
 if scale=0 then return 0; end if;
 foreach x in array vals loop result:=result+x/scale; end loop;
 return (result/cardinality(vals))*scale;
end $$;

create function private.council_forecast_median(vals double precision[]) returns double precision
language plpgsql immutable strict set search_path='' as $$
declare sorted float8[]; n int:=cardinality(vals);
begin
 select array_agg(y order by y) into sorted from unnest(vals) y;
 if n%2=1 then return sorted[n/2+1]; end if;
 return sorted[n/2]/2+sorted[n/2+1]/2;
end $$;

-- origin is the number of already observed values, matching the zero-based JS loop.
create function private.council_forecast_predict(method text, vals double precision[], origin int) returns double precision
language plpgsql immutable strict set search_path='' as $$
declare diffs float8[]:='{}'; i int;
begin
 case method
 when 'last_value' then return vals[origin];
 when 'moving_mean_3' then return private.council_forecast_mean(vals[origin-2:origin]);
 when 'median_drift' then
  for i in greatest(1,origin-5)..origin-1 loop diffs:=array_append(diffs,vals[i+1]-vals[i]); end loop;
  return vals[origin]+private.council_forecast_median(diffs);
 else raise exception 'Unknown internal forecasting method';
 end case;
end $$;

create function private.council_forecast_mae(method text,vals double precision[],first_origin int,end_exclusive int)
returns double precision language plpgsql immutable strict set search_path='' as $$
declare errors float8[]:='{}'; i int;
begin
 for i in first_origin..end_exclusive-1 loop
   errors:=array_append(errors,abs(vals[i+1]-private.council_forecast_predict(method,vals,i)));
 end loop;
 return private.council_forecast_mean(errors);
end $$;

create function private.council_forecast_score(months date[],numbers numeric[],as_of date,min_value float8,max_value float8)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
 n int:=coalesce(cardinality(months),0); values_ float8[]:='{}'; status_ text:='invalid'; reason_ text;
 history_n int:=0; holdout int:=0; split int; start_ int; i int; method_ text; candidate text;
 winner text:='last_value'; tune float8; best float8; base float8; mae_ float8; base_mae float8;
 magnitude float8; estimate_ float8; relative_ float8; old_errors float8[]:='{}'; recent float8; ref float8;
 history_start date; history_end date; hold_start date; hold_end date; cur date:=date_trunc('month',as_of::timestamp)::date;
begin
 <<evaluate>>
 begin
   if as_of is null or not isfinite(as_of) then reason_:='invalid_as_of'; exit evaluate; end if;
   for i in 1..n loop
     if numbers[i] is null then reason_:='invalid_observation'; exit evaluate; end if;
     values_:=array_append(values_,numbers[i]::float8);
     if values_[i]<min_value or values_[i]>max_value then reason_:='observation_out_of_bounds'; exit evaluate; end if;
     if months[i]>=cur then reason_:='month_not_closed'; exit evaluate; end if;
   end loop;
   history_n:=n;history_start:=months[1];history_end:=months[n];
   if n=0 then status_:='insufficient';reason_:='too_few_months';exit evaluate;end if;
   if history_end<>(cur-interval '1 month')::date then status_:='stale';reason_:='latest_closed_month_missing';exit evaluate;end if;
   if history_start+(n-1)*interval '1 month'<>history_end::timestamp then status_:='insufficient';reason_:='calendar_gap';exit evaluate;end if;
   if n<12 then status_:='insufficient';reason_:='too_few_months';exit evaluate;end if;
   holdout:=least(6,n/4);split:=n-holdout;start_:=greatest(4,split-12);
   base:=private.council_forecast_mae('last_value',values_,start_,split);best:=base;
   foreach candidate in array array['moving_mean_3','median_drift'] loop
     tune:=private.council_forecast_mae(candidate,values_,start_,split);
     if tune<best then best:=tune;winner:=candidate;end if;
   end loop;
   method_:=case when base>0 and best<base*0.90 then winner else 'last_value' end;
   hold_start:=months[split+1];hold_end:=months[n];
   mae_:=private.council_forecast_mae(method_,values_,split,n);
   base_mae:=private.council_forecast_mae('last_value',values_,split,n);
   select private.council_forecast_mean(array_agg(abs(val) order by ord)) into magnitude from unnest(values_[split+1:n]) with ordinality t(val,ord);
   estimate_:=private.council_forecast_predict(method_,values_,n);
   if magnitude>0 then relative_:=mae_/magnitude;elsif mae_=0 then relative_:=0;end if;
   if relative_ is null or relative_>0.20 then status_:='unreliable';reason_:='holdout_error_high';exit evaluate;end if;
   if method_<>'last_value' and mae_>base_mae then status_:='unreliable';reason_:='holdout_worse_than_baseline';exit evaluate;end if;
   for i in greatest(4,n-7)..n-2 loop old_errors:=array_append(old_errors,abs(values_[i+1]-private.council_forecast_predict(method_,values_,i)));end loop;
   recent:=abs(values_[n]-private.council_forecast_predict(method_,values_,n-1));
   select private.council_forecast_mean(array_agg(abs(val) order by ord)) into ref from unnest(values_[greatest(0,n-7)+1:n-1]) with ordinality t(val,ord);
   if recent>greatest(4*private.council_forecast_median(old_errors),ref*0.15) then status_:='unreliable';reason_:='recent_structural_break';exit evaluate;end if;
   if estimate_<min_value or estimate_>max_value then status_:='unreliable';reason_:='forecast_out_of_bounds';exit evaluate;end if;
   status_:='forecast';reason_:='passed_holdout';
 exception when numeric_value_out_of_range or floating_point_exception then
   status_:='invalid';reason_:='numerical_range';mae_:=null;base_mae:=null;
 end evaluate;
 return jsonb_build_object('status',status_,'reason',reason_,'estimate',case when status_='forecast' then estimate_ end,
   'mae',mae_,'baselineMae',base_mae,'method',method_,'asOf',as_of,'nextMonth',to_char(cur,'YYYY-MM'),'horizonMonths',1,
   'historyStart',to_char(history_start,'YYYY-MM'),'historyEnd',to_char(history_end,'YYYY-MM'),'historyMonths',history_n,
   'holdoutMonths',case when hold_start is null then 0 else holdout end,'holdoutStart',to_char(hold_start,'YYYY-MM'),'holdoutEnd',to_char(hold_end,'YYYY-MM'),
   'relativeError',relative_,'errorShareLimit',0.20,'seasonalAdjustment',false,
   'seasonality',case when history_n>=24 then 'annual_pattern_not_tested' else 'under_two_annual_cycles' end);
end $$;

-- Reconstruct the adjudication *known on the supplied local day* from immutable receipts.
-- Future imports of older records and later resolutions can never leak into a historical replay.
create function private.facility_council_outlook(p_org uuid,p_facility uuid,p_day date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_day is null or not isfinite(p_day) or not exists(select 1 from public.facilities where organization_id=p_org and id=p_facility) then
   raise exception 'Unknown facility scope or forecast date' using errcode='22023';
 end if;
 with obs as materialized (
   select o.* from public.facility_council_observations o where o.organization_id=p_org and o.facility_id=p_facility
     and o.month < date_trunc('month',p_day::timestamp)::date and o.retrieved_on<=p_day
     and o.verified_at < ((p_day+1)::timestamp at time zone 'Asia/Riyadh')
 ), periods as (
   select metric,month,array_agg(id order by id) ids,count(distinct value) alternatives,
   (array_agg(id order by retrieved_on desc,verified_at desc,id))[1] latest
   from obs group by metric,month
 ), effective as (
   select p.metric,p.month,p.ids,o.id,o.value
   from periods p left join public.facility_council_resolutions r on
     r.organization_id=p_org and r.facility_id=p_facility and r.metric=p.metric and r.month=p.month and r.evidence_count=cardinality(p.ids)
     and r.evidence_ids=p.ids and r.decided_at < ((p_day+1)::timestamp at time zone 'Asia/Riyadh')
   left join obs o on o.id=case when p.alternatives=1 then p.latest else r.chosen_id end
 ), series as (
   select metric,array_agg(month order by month) months,array_agg(value order by month) vals,
    array_agg(id order by month) filter(where id is not null) chosen_ids,
    jsonb_agg(jsonb_build_object('month',to_char(month,'YYYY-MM'),'observationId',id,'evidenceIds',ids) order by month) receipts
   from effective group by metric
 )
 select jsonb_agg(private.council_forecast_score(s.months,s.vals,p_day,
      case when m.unit='sar_signed' then null else 0::float8 end,case when m.unit='pct' then 100::float8 end) ||
    jsonb_build_object('metric',m.metric,'lastValue',s.vals[cardinality(s.vals)],'latestObservedMonth',to_char(s.months[cardinality(s.months)],'YYYY-MM'),
      'eligibleFrom',(s.months[cardinality(s.months)]+interval '1 month')::date,
      'observationIds',coalesce(to_jsonb(s.chosen_ids),'[]'::jsonb),'observationCount',coalesce(cardinality(s.chosen_ids),0),
      'observations',coalesce(s.receipts,'[]'::jsonb),'periodCount',coalesce(cardinality(s.months),0))
    order by m.metric) into result from private.facility_council_metric_catalog() m left join series s on s.metric=m.metric;
 return result;
end $$;
revoke all on function private.council_forecast_mean(double precision[]),private.council_forecast_median(double precision[]),
 private.council_forecast_predict(text,double precision[],integer),private.council_forecast_mae(text,double precision[],integer,integer),
 private.council_forecast_score(date[],numeric[],date,double precision,double precision),private.facility_council_outlook(uuid,uuid,date)
 from public,anon,authenticated,service_role;
commit;
