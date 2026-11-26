// End-of-year discounted lifecycle costs for two alternatives with equivalent service scope.
export const investmentLimits = Object.freeze({years:100, amount:1e12, minRate:-99, maxRate:100});
export const investmentMethodSource = "https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/valuation-standards/discounted-cash-flow-valuation";

function dateIsValid(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return false;
  const time=Date.parse(date+"T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===date;
}

function validMoney(value) {
  return typeof value==="number" && Number.isFinite(value) && value>=0 && value<=investmentLimits.amount;
}

function sourceProblem(source, valuationDate) {
  if (!source || typeof source.reference!=="string" || !source.reference.trim() || source.reference.trim().length>500) return "reference";
  if (!dateIsValid(source.date) || source.date>valuationDate) return "date";
  return null;
}

function presentCosts(option, annuity, endFactor) {
  const annualCost=option.operating+option.downtime;
  const annualPV=annualCost*annuity;
  const terminalPV=(option.disposal-option.residual)*endFactor;
  return {upfront:option.upfront,annualCost,annualPV,terminalPV,totalPV:option.upfront+annualPV+terminalPV};
}

function scenario(repair, replace, annuity) {
  // Positive difference is the present cost saved by choosing replacement.
  const difference=repair.totalPV-replace.totalPV;
  const breakEvenAnnualSavings=(replace.upfront-repair.upfront+replace.terminalPV-repair.terminalPV)/annuity;
  return {repair,replace,difference,breakEvenAnnualSavings,assumedAnnualSavings:repair.annualCost-replace.annualCost};
}

export function compareInvestmentCase(input) {
  const invalid=(field,reason="required_or_out_of_range")=>({status:"invalid",field,reason});
  if (!input || typeof input!=="object") return invalid("case");
  if (!dateIsValid(input.valuationDate)) return invalid("valuationDate");
  if (typeof input.currency!=="string" || !/^[A-Z]{3}$/u.test(input.currency)) return invalid("currency");
  if (!["real","nominal"].includes(input.basis)) return invalid("basis");
  if (!Number.isInteger(input.years) || input.years<1 || input.years>investmentLimits.years) return invalid("years");
  if (!Number.isFinite(input.discountRatePct) || input.discountRatePct<investmentLimits.minRate || input.discountRatePct>investmentLimits.maxRate) return invalid("discountRatePct");
  for (const name of ["rateSource","repair","replace","downside"]) {
    const part=input[name],issue=sourceProblem(part,input.valuationDate);
    if (issue) return invalid(name+"."+issue);
    const keys=name==="rateSource"?[]:name==="downside"?["extraUpfront","extraAnnual","lostResidual"]:["upfront","operating","downtime","disposal","residual"];
    for (const key of keys) if (!validMoney(part[key])) return invalid(name+"."+key);
  }
  const shock=input.downside;
  if (shock.lostResidual>input.replace.residual) return invalid("downside.lostResidual","exceeds_base_residual");
  let annuity=0,endFactor=1;
  const rate=input.discountRatePct/100;
  for (let year=1;year<=input.years;year++) { endFactor/=1+rate; annuity+=endFactor; }
  const repair=presentCosts(input.repair,annuity,endFactor);
  const base=scenario(repair,presentCosts(input.replace,annuity,endFactor),annuity);
  const stressed={...input.replace,upfront:input.replace.upfront+shock.extraUpfront,
    operating:input.replace.operating+shock.extraAnnual,residual:input.replace.residual-shock.lostResidual};
  const downside=scenario(repair,presentCosts(stressed,annuity,endFactor),annuity);
  // Preserve meaningful precision in the declared comparison currency.
  for (const s of [base,downside]) {
    const amounts=[s.difference,s.breakEvenAnnualSavings,s.assumedAnnualSavings,...Object.values(s.repair),...Object.values(s.replace)];
    if (amounts.some(n=>!Number.isFinite(n) || Math.abs(n)>Number.MAX_SAFE_INTEGER/100))
      return invalid("calculation","outside_numerical_range");
  }
  return {status:"compared",base,downside,annuity,endFactor,years:input.years,discountRatePct:input.discountRatePct,
    valuationDate:input.valuationDate,basis:input.basis,currency:input.currency,
    sources:Object.fromEntries(["rateSource","repair","replace","downside"].map(k=>[k,{reference:input[k].reference.trim(),date:input[k].date}]))};
}
