import assert from "node:assert/strict";
import {test} from "node:test";
import {routeFacilityQuestion as route} from "../../command-center/enterprise/src/facility-desk-intent.mjs";

const cases=[
  ["ما مَسَاحةُ الْأَرْض؟",["land_area_m2"]],
  ["والمساحة؟",["area_ambiguous"]],
  ["طيب مساحتها كم؟",["area_ambiguous"]],
  ["المساحة المبنية",["built_area_m2"]],
  ["كم مساحة البناء وكم مساحة الأرض؟",["built_area_m2","land_area_m2"]],
  ["ما مساحة الأرض والمبنى؟",["land_area_m2","built_area_m2"]],
  ["land and building areas",["land_area_m2","built_area_m2"]],
  ["What's its size?",["area_ambiguous"]],
  ["built-up area and plot size",["built_area_m2","land_area_m2"]],
  ["كم عدد الأدوار فوق الأرض وتحتها والمصاعد والوحدات؟",["floors_above","basements","lifts","units"]],
  ["كم دور فيه؟",["floors_above"]],
  ["عدد أدوار البدروم",["basements"]],
  ["الطوابق السفلية",["basements"]],
  ["how many floors below ground?",["basements"]],
  ["number of above- and below-ground floors",["floors_above","basements"]],
  ["كم طابق فوق الأرض وما مساحته؟",["floors_above","area_ambiguous"]],
  ["what are its floor area, staff distribution and elevators?",["built_area_m2","staff_breakdown","lifts"]],
  ["كم إجمالي عدد العاملين وتوزيعهم؟",["staff_total","staff_breakdown"]],
  ["طيب الموظفين؟",["staff_total"]],
  ["ماذا عن عدد الفنيين والمهندسين؟",["staff_breakdown"]],
  ["Staff by department?",["staff_breakdown"]],
  ["overall headcount and breakdown by trade",["staff_total","staff_breakdown"]],
  ["ما نوع المبنى وموقعه ومعداته؟",["property_type","address","assets"]],
  ["وين موقع المبنى؟",["address"]],
  ["what is the land area and site address?",["land_area_m2","address"]],
  ["and location?",["address"]],
  ["what type of property?",["property_type"]],
  ["والمصاعد؟",["lifts"]],
  ["كم عدد الشقق؟",["units"]],
  ["How many guest rooms?",["units"]],
  ["asset register",["assets"]],
  ["ما نقاط القوة والضعف والفرص والتهديدات؟",["swot"]],
  ["guest feedback and maintenance faults",["swot","maintenance"]],
  ["تكلفة صيانة المصعد",["prices","maintenance"]],
  ["How much is the unit price?",["prices"]],
  ["what are staff costs?",["prices"]],
  ["متى الجولة التفقدية؟",["round"]],
  ["What about PM schedules and site inspections?",["maintenance","round"]],
  ["لا أقصد مساحة الأرض بل مساحة البناء",["built_area_m2"]],
  ["ترجم النص",[]],["what about it?",[]],["Hi",[]],["أصول الضيافة",[]],
  ["Round to two decimal places",[]],["bedrooms",[]],["number of meeting rooms",[]],
  ["عندي كشف على مبنى",["round"]],["وش باقي بالكشف؟",["round"]],["المتبقي من الكشف",["round"]],
  ["موعد الصيانة الجاية",["maintenance"]],["افتح باركود الأصل",["assets"]],["مشتريات المنشأة",["prices"]],
  ["فاتورة المصاعد",["prices"]],["Barcode and QR",["assets"]],["Invoices and purchases",["prices"]],["Open facility survey",["round"]],
  [null,[]],[42,[]],[{},[]],["",[]]
];
for(const [q,expected] of cases) test("Facility desk intent • "+String(q),()=>{
  const found=route(q);
  assert.equal(new Set(found).size,found.length);
  assert.deepEqual([...found].sort(),[...expected].sort());
});
