// Isolated training records for the public partner demonstration.
export const asOf='2026-11-28';
export const months=['2026-08','2026-09','2026-10','2026-11'];
const seeds={court:[47,300,2],garden:[35,275,7],terrace:[68,345,11],horizon:[96,330,17],showcase:[76,295,23]};
const noise=(n,m)=>(n*31+n*n*17)%m;
const sum=(rows,key)=>rows.reduce((total,row)=>total+row[key],0);
const limit=(x,min,max)=>Math.max(min,Math.min(max,x));
const iso=(year,month,day)=>new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10);
const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
export function nightsFor(code,month) {
  const [units,rate,seed]=seeds[code], m=months.indexOf(month);
  return Array.from({length:28},(_,i)=>{
    const date=month+'-'+String(i+1).padStart(2,'0'), w=weekday(date);
    const n=seed*30+i+41*m;
    const offline=noise(n,7)>3?1+noise(n+1,Math.max(2,Math.floor(units/12))):0;
    const available=units-offline,weekend=w===4||w===5;
    const sold=Math.round(available*limit(.55+noise(n+3,17)/100+(weekend?.16:0)+m*.013,.3,.94));
    const adr=rate+noise(n+6,29)-14+(weekend?20:0);
    const opened=noise(n+8,7)%4, repeat=opened>0&&noise(n+11,6)===0?1:0;
    const overdue=opened>1&&noise(n+7,8)>4?1:0;
    const pickup=Math.min(sold,Math.round(units*(.05+noise(n+9,11)/100)));
    return {date,units,offline,available,sold,revenue:sold*adr,opened,repeat,overdue,
      maintenance:opened*(58+noise(n,90))+offline*11,pickup};
  });
}
export function summarize(rows){
  const totals=Object.fromEntries(['units','offline','available','sold','revenue','opened','repeat','overdue','maintenance'].map(k=>[k,sum(rows,k)]));
  return {...totals,adr:totals.sold?totals.revenue/totals.sold:0,occupancy:totals.available?100*totals.sold/totals.available:0,
    revpar:totals.available?totals.revenue/totals.available:0};
}
export function comparePeriod(codes,month){
  const index=months.indexOf(month);
  if(index<1)throw new RangeError('Two equal 28-day comparison windows are required');
  const prior=months[index-1];
  const currentRows=codes.flatMap(code=>nightsFor(code,month));
  const previousRows=codes.flatMap(code=>nightsFor(code,prior));
  const weekly=rows=>Array.from({length:4},(_,i)=>summarize(rows.filter(row=>Math.floor((Number(row.date.slice(-2))-1)/7)===i)));
  return {current:summarize(currentRows),previous:summarize(previousRows),weeks:weekly(currentRows),priorWeeks:weekly(previousRows),prior};
}
// Budget simulations never write a rate or contact a booking platform.
export function baseRate(code){return seeds[code][1]}
export function forecast(code,trialRate=baseRate(code)){
  const [units,base,seed]=seeds[code],history=nightsFor(code,'2026-11');
  return Array.from({length:7},(_,i)=>{
    const date=iso(2026,11,29+i), w=weekday(date), weekend=w===4||w===5;
    const comparable=history.filter(row=>weekday(row.date)===w).map(row=>Math.round(row.pickup*(.55+.075*(i+1)))).sort((a,b)=>a-b);
    const blocked=noise(seed+i,4), available=units-blocked;
    const booked=Math.round(available*(.49+noise(seed+i+3,29)/100+(weekend?.09:0)));
    const pickup72=1+noise(seed+i+5,Math.max(3,Math.floor(units*.14)));
    const district=[-25,-10,0,15,30].map(offset=>base+(weekend?35:0)+noise(seed+i,19)-8+offset);
    const median=district[2], pressure=booked/available;
    const strong=pressure>=.74&&pickup72>=Math.ceil(available*.065);
    const soft=pressure<.64&&pickup72<=Math.ceil(available*.085);
    const direction=strong&&trialRate<=median*1.05?1:soft&&trialRate>=median*.95?-1:0;
    // A pilot change is exactly one 5 SAR step, only when rate & booking signals agree.
    const suggested=limit(trialRate+direction*5,120,900), open=available-booked;
    const low=Math.min(open,comparable[0]), high=Math.min(open,comparable[comparable.length-1]);
    const onBooksRevenue=booked*(base+(weekend?15:0));
    return {date,available,blocked,booked,pickup72,district,median,strong,soft,suggested,
      low,high,soldLow:booked+low,soldHigh:booked+high,onBooksRevenue,
      revenueLow:onBooksRevenue+low*suggested,revenueHigh:onBooksRevenue+high*suggested};
  });
}
