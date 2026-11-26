// Local-only, conservative review signals. Never return or persist narrative text.
const concepts = new Map([
  ["cleanliness_strength",{
    positive:/\b(?:spotless|very clean|room(?:s)? (?:was|were|is|are) clean|clean rooms?)\b|(?:الغرفه|الغرف|الفندق|المكان) (?:كانت? |جدا )?نظيف|نظافه ممتازه/u,
    conflict:/\b(?:unclean|dirty|filthy|stained)\b|متسخ|وسخ|قذر|نظافه سيئه/u}],
  ["response_strength",{
    positive:/\b(?:maintenance|technician|repair team) (?:responded|arrived|fixed (?:it|the issue)) (?:quickly|promptly|immediately)\b|(?:الصيانه|الفني) (?:استجاب|استجابت|حضر|حضرت|وصل|اصلح)(?:ت)? بسرعه|استجابه الصيانه (?:سريعه|فوريه)/u,
    conflict:/\b(?:slow|late|delayed|never arrived)\b|متاخر|بطيء|بطيئ|تاخر/u}],
  ["noise_weakness",{
    positive:/\b(?:room|corridor|hallway|lobby) (?:was |is |felt )?(?:very |too )?(?:noisy|loud)\b|\b(?:noise|loud noise) (?:in|inside) (?:the )?(?:room|corridor|hallway|lobby)\b|(?:ضوضاء|ازعاج|ضجيج) (?:داخل|في) (?:الغرفه|الغرف|الممر|الاستقبال)|(?:الغرفه|الممر) (?:كانت? )?مزعج/u,
    conflict:/\b(?:quiet|peaceful|soundproof)\b|هادئ|هادء|عازل للصوت/u}],
  ["cooling_weakness",{
    positive:/\b(?:ac|air conditioner|air conditioning|cooling) (?:was |is )?(?:broken|weak|poor|ineffective|not working|not cooling)\b|(?:التكييف|المكيف|التبريد) (?:كان )?(?:ضعيف|متعطل|عطلان|لا يعمل|ما يبرد|لا يبرد)/u,
    conflict:/\b(?:working well|cools well|cooling was good|ac was excellent)\b|التكييف ممتاز|المكيف ممتاز|يعمل جيدا/u}]
]);
const negation=/\b(?:not|never|no|hardly|wasn t|isn t|didn t|wasnt|isnt|didnt)\b|(?:^| )(?:لا|لم|لن|ليس|ليست|ما|مش|مو|غير|دون|بدون|مب)(?: |$)/u;
const hedges=/\b(?:maybe|might|perhaps|if|would|could|apparently)\b|(?:^| )(?:ربما|لعل|لو|اذا|اتمني|يقال)(?: |$)/u;
const pii=/\b[^\s@]+@[^\s@]+\.[^\s@]+|https?:\/\/|(?:[+\d٠-٩۰-۹][\s().-]*){8,}|\B@[\p{L}\p{N}_]+/u;
function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{M}ـ]/gu,"").replace(/[أإآٱ]/gu,"ا")
    .replace(/ى/gu,"ي").replace(/ة/gu,"ه").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
function isoDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const stamp=Date.parse(value+"T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10)===value;
}
function reviewTopics(text) {
  const normalized=normalize(text);
  // Recognize these explicit fault observations without interpreting other negations.
  const check=normalized.replace(/\bnot (?:working|cooling)\b/g,"fault")
    .replace(/(?:التكييف|المكيف|التبريد) (?:لا يعمل|لا يبرد|ما يبرد)/gu,"عطل تبريد");
  if(negation.test(check) || hedges.test(normalized)) return [];
  const found=[];
  for(const [topic,rule] of concepts) {
    if(rule.positive.test(normalized) && !rule.conflict.test(normalized)) found.push(topic);
  }
  return found;
}
function parseLine(row) {
  const match=row.match(/^(\d{4}-\d{2}-\d{2})\s*([|,\t])\s*(.+)$/u);
  if(!match) return null;
  let body=match[3].trim();
  if(match[2]===",") {
    if(body.startsWith('"')) {
      if(!/^"(?:[^"]|"")*"$/u.test(body)) return null;
      body=body.slice(1,-1).replace(/""/g,'"');
    } else if(body.includes(",")) return null; // Require quotes to distinguish extra CSV columns.
  }
  return body ? [match[1],body] : null;
}

export function summarizeGuestReviewSample(raw, asOf=new Date().toISOString().slice(0,10)) {
  if(typeof raw!=="string" || raw.length>60000 || !isoDate(asOf)) throw new Error("invalid_sample_size_or_date");
  const lines=raw.split(/\r?\n/u);
  let dataRows=0;
  const seen=new Set(), dates=[];
  const summary={examined:0,uncertain:0,duplicates:0,excluded:0,topics:{},from:null,to:null};
  for(const [index,original] of lines.entries()) {
    const line=original.trim();
    if(!line || (index===0 && /^(?:date[,|\t]review|التاريخ[,|\t]المراجعة)$/iu.test(line))) continue;
    if(++dataRows>200) throw new Error("sample_row_limit");
    const parsed=parseLine(line);
    if(!parsed || !isoDate(parsed[0]) || parsed[0]>asOf || pii.test(parsed[1])) { summary.excluded++; continue; }
    const [date,body]=parsed, text=normalize(body);
    if(!text) { summary.excluded++; continue; }
    const key=date+" "+text;
    if(seen.has(key)) { summary.duplicates++; continue; }
    seen.add(key); summary.examined++; dates.push(date);
    const topics=reviewTopics(body);
    if(!topics.length) summary.uncertain++;
    for(const topic of topics) {
      const item=summary.topics[topic]??={supporting:0,examples:[]};
      item.supporting++;
      if(item.examples.length<3) item.examples.push({date,line:index+1});
    }
  }
  dates.sort(); summary.from=dates[0]??null; summary.to=dates.at(-1)??null;
  return summary;
}
