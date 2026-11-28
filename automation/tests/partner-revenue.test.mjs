import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pilot} from '../../scripts/pilot-partner/fixture.mjs';
import {baseRate,comparePeriod,forecast,months,nightsFor} from '../../scripts/pilot-partner/performance-model.mjs';

const codes=pilot.sites.map(site=>site.code);
test('comparison uses equal dates and reconciles portfolio income to nightly property records',()=>{
  assert.throws(()=>comparePeriod(codes,months[0]),RangeError);
  for(const month of months.slice(1)){
    const report=comparePeriod(codes,month), siteTotals=codes.map(code=>comparePeriod([code],month));
    assert.equal(report.weeks.reduce((a,w)=>a+w.revenue,0),report.current.revenue);
    assert.equal(report.current.revenue,siteTotals.reduce((a,s)=>a+s.current.revenue,0));
    for(const code of codes){
      const nights=nightsFor(code,month);
      assert.equal(nights.length,28);
      for(const n of nights){
        assert(n.sold<=n.available && n.available+n.offline===n.units);
        assert(n.repeat<=n.opened && n.overdue<=n.opened);
      }
    }
  }
});
test('seven-day forecast caps remaining inventory and preserves confirmed booking revenue',()=>{
  const directions=new Set();
  for(const code of codes){
    for(const rate of [120,baseRate(code),300,900]){
      const values=forecast(code,rate);
      assert.equal(values[0].date,'2026-11-29');assert.equal(values[6].date,'2026-12-05');
      assert.equal(new Set(values.map(v=>v.date)).size,7);
      for(const n of values){
        directions.add(n.suggested-rate);
        assert.equal(n.district.length,5);assert.equal(n.median,n.district[2]);
        assert(n.soldLow>=n.booked && n.soldLow<=n.soldHigh && n.soldHigh<=n.available);
        assert.equal(n.revenueLow,n.onBooksRevenue+n.low*n.suggested);
        assert.equal(n.revenueHigh,n.onBooksRevenue+n.high*n.suggested);
        assert(n.suggested>=120 && n.suggested<=900);
      }
    }
  }
  assert.deepEqual([...directions].sort((a,b)=>a-b),[-5,0,5]);
});
