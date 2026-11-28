// Pilot decision support. A rate is a market reference for human review; nothing is posted to channels.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const dayMs = 86_400_000;
const money = value => Math.round(value * 100) / 100;
const integer = value => Number.isSafeInteger(value);
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1);
};
function day(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value)) return NaN;
  const ms = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === value ? ms : NaN;
}
const timestamp = value => typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
function fresh(value, asof) {
  const age = timestamp(asof) - timestamp(value);
  return age >= 0 && age <= dayMs;
}
const nightFields = ["district", "unit", "serviceClass", "guests", "cancellation", "meals"];
function sameQuote(q, target) {
  return q && q.publicRate === true && q.available === true && q.allIn === true && q.currency === "SAR" &&
    typeof q.property === "string" && q.property.trim() && q.checkIn === target.checkIn &&
    q.checkOut === target.checkOut && nightFields.every(k => target[k] != null && target[k] !== "" && q[k] === target[k]) &&
    Number.isFinite(q.price) && q.price > 0 && fresh(q.observedAt, target.asOf) && /^https:\/\//.test(q.source || "");
}
// One median per property; a second sales channel must not double-weight the same apartment building.
const propertyKey = name => String(name).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
function peerRates(quotes, target) {
  const byProperty = new Map();
  for (const q of quotes) {
    if (!sameQuote(q, target) || !propertyKey(q.property) || propertyKey(q.property) === propertyKey(target.property)) continue;
    const key = propertyKey(q.property);
    if (!byProperty.has(key)) byProperty.set(key, []);
    const offers = byProperty.get(key);
    const previous = offers.findIndex(row => row.source === q.source);
    if (previous < 0) offers.push(q);
    else if (timestamp(offers[previous].observedAt) < timestamp(q.observedAt)) offers[previous] = q;
  }
  return [...byProperty.values()].map(offers => quantile(offers.map(q => q.price), 0.5));
}
function currentSales(row, target) {
  return row && row.property === target.property && row.unit === target.unit && row.checkIn === target.checkIn &&
    fresh(row.observedAt, target.asOf) && typeof row.source === "string" && row.source.trim() &&
    integer(row.sellable) && row.sellable > 0 && integer(row.booked) && row.booked >= 0 && row.booked <= row.sellable;
}
function historyRows(history, target, sales) {
  const asOfDay = day(new Date(timestamp(target.asOf) + 3 * 3600000).toISOString().slice(0,10));
  const lead = (day(target.checkIn) - asOfDay) / dayMs;
  const dedup = new Map();
  for (const h of history) {
    if (!h || h.property !== target.property || h.unit !== target.unit || !h.source ||
        !Number.isFinite(day(h.checkIn)) || day(h.checkIn) >= asOfDay ||
        new Date(day(h.checkIn)).getUTCDay() !== new Date(day(target.checkIn)).getUTCDay() ||
        h.leadDays !== lead || h.sellable !== sales.sellable || !integer(h.bookedAtLead) ||
        !integer(h.finalSold) || Math.min(h.bookedAtLead,h.finalSold) < 0 ||
        Math.max(h.bookedAtLead,h.finalSold) > h.sellable) continue;
    if (!dedup.has(h.checkIn)) dedup.set(h.checkIn,h);
    else { // Inconsistent history for the same stay date is ineligible.
      const old = dedup.get(h.checkIn);
      if (old && (old.bookedAtLead !== h.bookedAtLead || old.finalSold !== h.finalSold)) dedup.set(h.checkIn,null);
    }
  }
  return [...dedup.values()].filter(Boolean);
}
export function reviewNight({target, ownQuote, peers = [], sales, history = []}) {
  if (!target || !Number.isFinite(timestamp(target.asOf)) || !Number.isFinite(day(target.checkIn)) ||
      !Number.isFinite(day(target.checkOut)) || day(target.checkOut) - day(target.checkIn) !== dayMs ||
      day(target.checkIn) < day(new Date(timestamp(target.asOf) + 3 * 3600000).toISOString().slice(0,10)) ||
      !target.property || !propertyKey(target.property) || !integer(target.guests) || target.guests < 1 || !Array.isArray(peers) || !Array.isArray(history))
    throw new Error("Invalid one-night stay or observation window");
  const rates = peerRates(peers, target);
  const own = sameQuote(ownQuote,target) && propertyKey(ownQuote.property) === propertyKey(target.property) ? ownQuote.price : null;
  const actual = currentSales(sales,target);
  const matched = actual ? historyRows(history,target,sales) : [];
  const out = {date:target.checkIn, ownRate:own, peerProperties:rates.length, marketMedian:null, marketLow:null,
    marketHigh:null, onBooks:actual ? sales.booked : null, historicalDates:matched.length, projectedSold:null,
    suggestedLow:null, suggestedHigh:null, pricingBasis:"insufficient_evidence"};
  if (rates.length) {
    out.marketMedian = money(quantile(rates,.5));
    out.marketLow = money(Math.min(...rates)); out.marketHigh = money(Math.max(...rates));
  }
  // Six observed same-weekday/same-lead dates is a pilot inclusion rule, not measured confidence.
  if (actual && matched.length >= 6) {
    const netPickup = matched.map(h => h.finalSold - h.bookedAtLead);
    out.projectedSold = Math.max(0, Math.min(sales.sellable, Math.round(sales.booked + quantile(netPickup,.5))));
  }
  if (actual && sales.booked === sales.sellable) { out.pricingBasis="no_remaining_inventory"; return out; }
  if (rates.length < 3 || own === null || !actual) return out;
  let lo=.25, hi=.75;
  out.pricingBasis="peer_interquartile_review";
  if (matched.length >= 6) {
    const pace=matched.map(h=>h.bookedAtLead);
    if (sales.booked > quantile(pace,.75)) {lo=.5; out.pricingBasis="above_usual_booking_pace";}
    else if (sales.booked < quantile(pace,.25)) {hi=.5; out.pricingBasis="below_usual_booking_pace";}
  }
  out.suggestedLow=money(quantile(rates,lo)); out.suggestedHigh=money(quantile(rates,hi));
  return out;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nights = JSON.parse(readFileSync(0,"utf8"));
  if (!Array.isArray(nights)) throw new Error("Expected array of stay-night inputs");
  console.log(JSON.stringify(nights.map(reviewNight),null,2));
}
