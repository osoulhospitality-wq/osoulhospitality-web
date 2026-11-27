// Pure read-side routing. A detected subject never grants authority or supplies a fact.
const left = "(?<![\\p{L}\\p{N}])";
const right = "(?![\\p{L}\\p{N}])";

function term(ar, en) {
  return new RegExp(left + "(?:(?:و|ف)?(?:" + ar + ")|(?:" + en + "))" + right, "u");
}

function normalize(value) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\p{M}\u0640]/gu, "")
    .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/u)
    .map(word=>word.replace(/^(?:و|ف)?ال(?=[ء-ي]{2})/u,"")).join(" ");
}

const area = term("مساح(?:ه|ته|تها|تهم|ات)|امتار مربعه","area|areas|size|square (?:meters?|metres?|feet|footage)|sqm|gfa");
const landArea = term("مساح(?:ه|ته|تها) (?:قطعه )?(?:ارض|ارضيه|قسيمه|قطعه)|(?:ارض|قطعه) (?:كم )?مساح(?:تها|ته)|مسطح ارض","(?:land|site|plot|lot|parcel) (?:area|size|square footage)|area of (?:the )?(?:land|plot|lot|site|parcel)|lot square footage");
const builtArea = term("مساح(?:ه|ته|تها) (?:اجمالي )?(?:بناء|مبنيه|مبني|مباني|انشاء|طابقيه)|(?:مسطح|مسطحات) (?:بناء|مبني|بنيان)|(?:مبني|بناء) (?:كم )?مساح(?:ته|تها)|اجمالي مسطحات","(?:built (?:up )?|building |gross (?:floor )?|floor )area|building size|building square footage|area of (?:the )?(?:building|construction)|gfa");
const pairedAreas = term("مساح(?:ه|ات) (?:ارض (?:و)?(?:مبني|بناء|مباني)|(?:مبني|بناء|مباني) (?:و)?ارض)","(?:land|plot|lot) and (?:building|built(?: up)?|floor) areas?|(?:building|built(?: up)?|floor) and (?:land|plot|lot) areas?");
const floorArea = term("مساحه دور|مساحه طابق","floor area|floor space");
const floors = term("طابق|طوابق(?:ه|ها)?|ادوار(?:ه|ها)?|دورين|كم دور|عدد دور|مكون من كم دور","floors?|storeys?|stories|above ground levels?");
const basement = term("قبو|اقبيه|اقبي(?:ته|تها)|بدروم(?:ات)?|سراديب|سرداب|طوابق سفليه|ادوار سفليه|طوابق تحت (?:سطح )?ارض|ادوار تحت (?:سطح )?ارض","basements?|underground (?:floors?|levels?|storeys?)|below (?:ground|grade)(?: (?:floors?|levels?))?|sublevels?");
const basementFloor = term("طوابق (?:قبو|بدروم|سفليه)|ادوار (?:قبو|بدروم|سفليه)|دور (?:قبو|بدروم)","basement (?:floors?|levels?)|underground (?:floors?|levels?|storeys?)|below (?:grade|ground) floors?");
const below = term("تحت (?:سطح )?ارض|تحتها|تحت ارضيه","underground|below ground|below grade");
const above = term("فوق (?:سطح )?ارض|فوقها|فوق (?:و)?تحت","above ground|above grade|above and below");
const workers = term("عامل(?:ون|ين)?|عمال(?:ه|تها)?|عاملات|موظف(?:ون|ين|ات)?|موظفي(?:ن|ها|ه)?|كادر|كوادر|طاقم|قوي عامله","staff(?:ing)?|headcount|workforce|workers?|employees?|personnel|team members?");
const split = term("توزيع(?:هم|ه|ها)?|تقسيم(?:هم)?|تخصصات(?:هم)?|حسب (?:تخصص|وظيفه|مهنه|دور|قسم|فئه)|فئات|لكل قسم|بكل قسم|مسميات|تصنيف(?:هم)?","breakdown|break down|by (?:role|trade|department|category|discipline)|split|distribution|mix|categories");
const count = term("اجمالي(?:هم)?|مجموع(?:هم)?|عددهم|بالمجمل","total|headcount|altogether|overall");
const roles = term("فنيين|فنيون|فنيي صيانه|مهندسين|مهندسون|مشرفين|مشرفون|عمال نظافه|موظفي استقبال","technicians?|engineers?|cleaners?|receptionists?|supervisors?");
const countsAsked = term("كم|عدد|احصاء","how many|number of|count of|headcounts?");
const price = term("اسعار(?:ها|ه|هم)?|سعر(?:ه|ها)?|تسعير|تسعيره|تكلف(?:ه|ته|تها)|تكاليف|فاتور(?:ه|ته|تها)|فواتير|مشتريات(?:ه|ها)?|مقارنه سوقيه|مرجع سعري","prices?|pricing|costs?|rates?|price benchmarks?|market comparables?|purchases?|invoices?|procurement|quotations?|unit price");
const maintenance = term("صيانه(?:ها|ه)?|صيان(?:ته|تها)|صيان(?:ات)?|اعطال|عطل(?:ان|ه|ها)?|اصلاح(?:ات)?|وقائي(?:ه)?|اوامر عمل|امر عمل","maintenance|preventive|preventative|repairs?|breakdowns?|faults?|work orders?|servicing|pm schedules?|pm plans?|ppm schedules?");
const rounds = term("جول(?:ه|ته|تها|ات)|تفقد|تفتيش|معاين(?:ه|ات)|تفقديه|(?:ب)?(?:ال)?كشف|كشوفات|زياره ميدانيه","rounds?|walkthroughs?|walk throughs?|inspections?|site visits?|site walks?|surveys?");
const equipment = term("اصول(?:ه|ها)?|معدات(?:ه|ها)?|معده|اجهزه|باركود|رمز (?:اصل|استجابه سريعه)|موجودات|جرد|سجل اصل","assets?|equipment|machinery|inventory|asset register|barcodes?|qr(?: codes?)?");

const simple = {
  lifts:term("مصعد(?:ان|ين|ات)?|مصاعد(?:ه|ها)?|اسانسير(?:ات)?|اصانصير(?:ات)?|اصنصير(?:ات)?","lifts?|elevators?"),
  units:term("وحد(?:ه|ات)(?:ه|ها)?|شقق(?:ه|ها)?|شقه|غرف(?:ه|ها)?(?: فندقيه)?","units?|apartments?|flats?|guest rooms?|hotel rooms?|rooms?|suites?"),
  address:term("عنوان(?:ه|ها|هم)?|اين (?:يقع|تقع|موقع)|وين (?:يقع|تقع|موقع|مكان|مبني|منشاه|فندق|عقار)|(?:موقع|لوكيشن) (?:مبني|منشاه|فندق|عقار|مشروع)|موقعه|موقعها|احداثيات(?:ه|ها)?","address(?:es)?|where (?:is|s) (?:it|the (?:property|facility|building|hotel))|(?:building|facility|property|hotel) location|coordinates"),
  property_type:term("نوع (?:مبني|منشاه|عقار|سكن|فندق|استخدام)|نوع(?:ه|ها)|تصنيف (?:مبني|منشاه|عقار)|استخدام مبني","(?:property|building|facility|site) (?:type|classification)|type of (?:the )?(?:property|building|facility)|what kind of (?:building|property|facility)"),
  swot:term("سوات|سوت|نقاط (?:قوه|ضعف)|فرص(?:ه|ها)?|تهديدات(?:ه|ها)?|تحليل (?:موقع|منشاه)|تقييمات (?:نزلاء|ضيوف|فندق)|اراء (?:نزلاء|ضيوف)","swot|strengths?|weakness(?:es)?|opportunit(?:y|ies)|threats?|guest (?:reviews?|feedback)|location analysis")
};

function mask(source, expression) {
  return source.replace(new RegExp(expression.source,"gu"),m=>" ".repeat(m.length));
}

export function routeFacilityQuestion(query) {
  if(typeof query!=="string") return [];
  let input=normalize(query);
  if(!input) return [];
  // When the speaker explicitly corrects themselves, apply the replacement request.
  const correction=input.match(/(?:^| )(?:لا (?:اقصد|اعني|اريد)|not) .+? (?:بل |انما |but (?:rather )?)(.+)$/u);
  if(correction) input=correction[1];
  const result=new Map();
  function add(key, match) {
    if(match) result.set(key,Math.min(result.get(key)??Infinity,match.index));
  }
  const statedArea=area.exec(input), land=landArea.exec(input), built=builtArea.exec(input), pair=pairedAreas.exec(input);
  add("built_area_m2",built||pair); add("land_area_m2",land||pair);
  if(statedArea && !land && !built && !pair) add("area_ambiguous",statedArea);
  // A floor-area figure or a unit price is a measure, never a count of floors or units.
  const floorInput=mask(mask(input,builtArea),floorArea);
  const floor=floors.exec(floorInput), down=below.exec(floorInput), up=above.exec(floorInput);
  const cellar=basement.exec(floorInput);
  if(floor && (up || (!down && !basementFloor.test(floorInput)))) add("floors_above",floor);
  add("basements",cellar || (floor && down));
  const workersMatch=workers.exec(input), splitMatch=split.exec(input), countMatch=count.exec(input), roleMatch=roles.exec(input);
  if(roleMatch && (countsAsked.test(input) || workersMatch)) add("staff_breakdown",roleMatch);
  if(workersMatch && splitMatch) add("staff_breakdown",splitMatch);
  if(workersMatch && ((!splitMatch && !roleMatch && (!price.test(input) || countMatch)) || countMatch)) add("staff_total",workersMatch);
  for(const [key,pattern] of Object.entries(simple)) {
    let search=input;
    if(key==="units") search=search.replace(/\bunit (?:price|cost|rate)\b/g,"").replace(/(?:سعر|تكلفه) وحده/gu,"").replace(/غرف (?:نوم|اجتماعات|معدات|خدمات)/gu,"").replace(/\b(?:bed|meeting |equipment |plant |utility |laundry )rooms?\b/g,"");
    if(key==="lifts" && (maintenance.test(input) || price.test(input)) && !countsAsked.test(input)) continue;
    if(key==="address" && /^(?:(?:and|what about|وماذا عن|طيب|و)? ?)(?:موقع|لوكيشن|location)$/u.test(search)) add(key,{index:0});
    add(key,pattern.exec(search));
  }
  add("assets",equipment.exec(input.replace(/اصول ضيافه/gu,"")));
  const maintenanceInput=workersMatch && splitMatch ? input.replace(/\bbreakdowns?\b/gu,"") : input;
  add("maintenance",maintenance.exec(maintenanceInput)); add("prices",price.exec(input)); add("round",rounds.exec(input.replace(/\bround (?:to|off|up|down)\b/gu,"")));
  return [...result].sort((a,b)=>a[1]-b[1]).map(([key])=>key);
}
