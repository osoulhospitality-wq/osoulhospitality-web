import { pathToFileURL } from 'node:url';
import { CampaignRehearsal, stages } from './campaign.mjs';

const source = 'https://osoulhospitality.com/solutions/asset-tagging/';
export const fixtureTime = Date.parse('2026-11-27T12:00:00+03:00');
export const fixtureScope = { tenant:'OsoulFixture', campaign:'AssetRegisterPilot' };

// Synthetic inputs. The public service description is a source for the offer;
// all audience observations, timing, inquiries and conversions below are fixtures.
const artifacts = {
  signal: {source,observation:'Test hypothesis: owners want to trace units serviced by multiple suppliers.',growthRate:null},
  audience: {segment:'Serviced-apartment owner',objection:'Will the next contractor find the correct asset and its service history?'},
  opportunity: {offer:'Asset inventory and tagging',businessQuestion:'Will an asset-level handover prompt qualified service inquiries?'},
  strategy: {channel:'linkedin',format:'single_static_post',scheduleAt:'2026-11-27T11:30:00+03:00',timingBasis:'Fixed test clock; audience timing data unavailable.',spendMinor:0},
  copy: {arabic:'عند تسلّم المبنى، هل يستطيع الفني ربط المكيف أمامه بسجلّه؟ نجرد المعدات حسب الموقع، ونختبر الرمز عند الأصل، ثم نسلّمك سجلًا تستطيع الرجوع إليه.',english:'A handover register should work on the plant room floor. We tag each surveyed asset and check the scan where the equipment is installed.',cta:'اطلب عرض خدمة جرد الأصول وترميزها'},
  concept: {story:'Follow one unit from its physical location to its register entry.',artDirection:'A typeset process card, with no client names, facility imagery or claimed savings.'},
  design: {headline:'من المعدّة إلى سجلّها',caption:'تحديد الموقع، فحص بيانات المعدّة، اختبار مسح الرمز',layout:'stacked-type',alt:'ثلاث خطوات تربط الأصل بموقعه وبياناته ورمزه.'},
  videoDecision: {status:'not_applicable',reason:'The approved fixture brief requests a single static card.'},
  community: {inquiries:3,routing:'Classify synthetic inquiries about asset surveys and route qualified interest to commercial intake.'},
  lead: {qualified:2,personalData:false},
  conversion: {wonDeals:0,revenueMinor:0,currency:'SAR'},
  measurement: {visits:20,attributionWindow:'Synthetic single-campaign fixture window.'},
  lesson: {finding:'The synthetic inquiry-to-sale sample contains no wins. It cannot establish commercial viability.',nextTest:'Compare an asset-register example with a scope-of-work explanation.',owner:'M19'}
};

export function fixtureRequest(db,stage,{tenant,campaign} = fixtureScope) {
  const {id,role} = stage;
  const principal = {tenant,role,id:'fixture-'+role};
  let input = artifacts[id];
  if (['brandReview','qualityReview','approval'].includes(id)) {
    input = {digest:db.approvedDigest(tenant,campaign),decision:'accepted',criticalOpen:0};
  } else if (id === 'publish') {
    input = {digest:db.approvedDigest(tenant,campaign),publisher:'local-simulator',channel:'linkedin',
      spendMinor:0,scheduleAt:artifacts.strategy.scheduleAt};
  }
  return [tenant,campaign,id,principal,{...input,evidence:id === 'signal' ? source : 'fixture-'+id}];
}

export function runCampaign(db,scope = fixtureScope) {
  db.start(scope.tenant,scope.campaign);
  for (const stage of stages) db.advance(...fixtureRequest(db,stage,scope));
  return db.report(scope.tenant,scope.campaign);
}

// Fixed layout: untrusted strings are escaped before entering the SVG text nodes.
// The campaign is a specimen, not evidence of a real client, platform or operator.
export function renderCard(design) {
  const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  if (design.layout !== 'stacked-type') throw new Error('UNSUPPORTED_LAYOUT');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" xml:lang="ar">
<title>${escape(design.alt)}</title><rect width="1200" height="630" fill="#143e34"/>
<g fill="#fffaf1" direction="rtl" text-anchor="start" font-family="sans-serif">
<text x="1110" y="190" font-size="38">أصول الضيافة</text>
<text x="1110" y="310" font-size="72">${escape(design.headline)}</text>
<text x="1110" y="420" font-size="36">${escape(design.caption)}</text></g></svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new CampaignRehearsal(':memory:',() => fixtureTime);
  try {
    const report = runCampaign(db);
    if (process.argv[2] === '--svg') {
      console.log(renderCard(report.steps.find(s => s.stage === 'design').payload.input));
    } else {
      console.log(JSON.stringify(report,null,2));
    }
  } finally { db.close(); }
}
