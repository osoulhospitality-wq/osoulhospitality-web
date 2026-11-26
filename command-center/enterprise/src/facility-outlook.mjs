// Calendar-month, one-step outlook for a single facility, metric, unit and currency.
// Source references are opaque receipts. The caller validates them and supplies closed, verified periods.
const minimumMonths = 12;
const maxHoldout = 6;
const errorShareLimit = 0.20;
const methods = ["last_value", "moving_mean_3", "median_drift"];

function monthIndex(month) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) return null;
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

function calendarDay(asOf) {
  if (asOf instanceof Date) {
    if (!Number.isFinite(asOf.getTime())) return null;
    asOf = asOf.toISOString().slice(0, 10);
  }
  if (typeof asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(asOf)) return null;
  const time = Date.parse(asOf + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === asOf ? asOf : null;
}

function mean(values) {
  // Work in units of the largest magnitude so a finite mean does not overflow its sum.
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return 0;
  return (values.reduce((sum, value) => sum + value / scale, 0) / values.length) * scale;
}

function median(numbers) {
  const ordered = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : ordered[mid - 1] / 2 + ordered[mid] / 2;
}

function predict(method, values, origin) {
  const last = values[origin - 1];
  if (method === "last_value") return last;
  if (method === "moving_mean_3") return mean(values.slice(origin - 3, origin));
  const deltas = [];
  for (let i = Math.max(1, origin - 5); i < origin; i++) deltas.push(values[i] - values[i - 1]);
  return last + median(deltas);
}

function backtest(method, values, start, end) {
  const errors = [];
  for (let i = start; i < end; i++) {
    const distance = Math.abs(values[i] - predict(method, values, i));
    if (!Number.isFinite(distance)) return null;
    errors.push(distance);
  }
  return mean(errors);
}

/**
 * Returns a one-month estimate, or an explicit reason for abstention.
 * Optional bounds {min,max} are in the input units (e.g. 0..100 for percent occupancy).
 * MAE describes held-out errors; it is neither a probability nor a prediction interval.
 */
export function forecastSeries(points, asOf, bounds = {}) {
  const day = calendarDay(asOf);
  const output = {
    status:"invalid", reason:null, estimate:null, mae:null, baselineMae:null, method:null,
    asOf:day, nextMonth:day?.slice(0,7)??null, horizonMonths:1, historyStart:null,
    historyEnd:null, historyMonths:0, holdoutMonths:0, holdoutStart:null, holdoutEnd:null,
    sources:[], seasonalAdjustment:false, seasonality:"under_two_annual_cycles",
    relativeError:null, errorShareLimit
  };
  const stop = (status, reason) => ({...output,status,reason});
  if (!day) return stop("invalid","invalid_as_of");
  if (!Array.isArray(points)) return stop("invalid","invalid_series");
  if (!bounds || typeof bounds!=="object" || Array.isArray(bounds) ||
      (bounds.min!==undefined && !Number.isFinite(bounds.min)) ||
      (bounds.max!==undefined && !Number.isFinite(bounds.max)) ||
      (bounds.min!==undefined && bounds.max!==undefined && bounds.min>bounds.max))
    return stop("invalid","invalid_bounds");
  const current = monthIndex(output.nextMonth);
  const rows = [];
  const months = new Set();
  for (const point of points) {
    if (!point || typeof point!=="object") return stop("invalid","invalid_observation");
    const index=monthIndex(point.month);
    if (index===null || !Number.isFinite(point.value) || typeof point.source!=="string" || !point.source.trim() ||
        ("verified" in point && point.verified!==true) || ("complete" in point && point.complete!==true))
      return stop("invalid","invalid_observation");
    if (point.value<bounds.min || point.value>bounds.max) return stop("invalid","observation_out_of_bounds");
    if (index>=current) return stop("invalid","month_not_closed");
    if (months.has(index)) return stop("invalid","duplicate_month");
    months.add(index);
    rows.push({month:point.month,index,value:point.value,source:point.source.trim()});
  }
  rows.sort((a,b)=>a.index-b.index);
  const n=rows.length;
  output.historyStart=rows[0]?.month??null;
  output.historyEnd=rows[n-1]?.month??null;
  output.historyMonths=n;
  output.sources=rows.map(({month,source})=>({month,source}));
  if (!n) return stop("insufficient","too_few_months");
  if (rows[n-1].index!==current-1) return stop("stale","latest_closed_month_missing");
  if (rows[n-1].index-rows[0].index+1!==n) return stop("insufficient","calendar_gap");
  if (n<minimumMonths) return stop("insufficient","too_few_months");
  if (n>=24) output.seasonality="annual_pattern_not_tested";

  const values=rows.map(r=>r.value);
  const holdout=Math.min(maxHoldout,Math.floor(n/4));
  const split=n-holdout;
  // Tune only on earlier rolling origins. The final consecutive holdout remains out of method selection.
  const tuningStart=Math.max(4,split-12);
  const scores=methods.map(method=>({method,mae:backtest(method,values,tuningStart,split)}));
  if (scores.some(s=>s.mae===null || !Number.isFinite(s.mae))) return stop("invalid","numerical_range");
  const best=scores.reduce((a,b)=>b.mae<a.mae?b:a);
  const base=scores[0];
  const selected=base.mae>0 && best.mae<base.mae*0.90 ? best.method : base.method;
  output.method=selected;
  output.holdoutMonths=holdout;
  output.holdoutStart=rows[split].month;
  output.holdoutEnd=rows[n-1].month;
  output.mae=backtest(selected,values,split,n);
  output.baselineMae=backtest("last_value",values,split,n);
  const magnitude=mean(values.slice(split).map(Math.abs));
  const estimate=predict(selected,values,n);
  if (![output.mae,output.baselineMae,magnitude,estimate].every(Number.isFinite)){
    output.mae=null; output.baselineMae=null;
    return stop("invalid","numerical_range");
  }
  output.relativeError=magnitude>0 ? output.mae/magnitude : output.mae===0 ? 0 : null;
  if (!Number.isFinite(output.relativeError)) output.relativeError=null;
  if (output.relativeError===null || output.relativeError>errorShareLimit) return stop("unreliable","holdout_error_high");
  if (selected!=="last_value" && output.mae>output.baselineMae) return stop("unreliable","holdout_worse_than_baseline");

  // A recent structural break invalidates a formerly accurate stationary or trend model.
  // Compare the last residual against deviations on preceding origins without using future rows.
  const oldErrors=[];
  for (let i=Math.max(4,n-7); i<n-1; i++) oldErrors.push(Math.abs(values[i]-predict(selected,values,i)));
  const recentError=Math.abs(values[n-1]-predict(selected,values,n-1));
  const reference=mean(values.slice(Math.max(0,n-7),n-1).map(Math.abs));
  if (recentError>Math.max(4*median(oldErrors),reference*0.15))
    return stop("unreliable","recent_structural_break");
  if (estimate<bounds.min || estimate>bounds.max) return stop("unreliable","forecast_out_of_bounds");
  return {...output,status:"forecast",reason:"passed_holdout",estimate};
}
