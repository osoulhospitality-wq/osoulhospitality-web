"""Prepare a checked Osoul Price Master CSV export for the internal reference-curator panel."""
import argparse
import csv
import json
import re
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

HEADERS = {'Price ID','SKU','الوصف/المواصفة','الوحدة','السعر قبل الضريبة','تاريخ السعر','صالح حتى','مصدر العرض','حالة التحقق'}
UNITS = {k:(unit,Decimal(factor)) for unit, factor, keys in [
    ('ea','1',('ea','each','pc','pcs','قطعة')),('kg','1',('kg','كجم')),('kg','0.001',('g','غ')),
    ('l','1',('l','لتر')),('l','0.001',('ml','مل')),('m','1',('m','متر')),('m','0.01',('cm',))] for k in keys}
APPROVED = {'approved','verified','معتمد','معتمدة','تم التحقق','موثق','موثّق'}
DEMO = re.compile(r'\b(?:demo|example|sample|placeholder)\b|تجريبي|افتراضي|مثال',re.I)

class Rejected(ValueError):
    pass

def required(value,reason):
    if value is None or not str(value).strip():raise Rejected(reason)
    return str(value).strip()

def decimal(value,reason,minimum=0,strict=False):
    try:number=Decimal(required(value,reason))
    except InvalidOperation:raise Rejected(reason) from None
    if not number.is_finite() or number<minimum or (strict and number==minimum):raise Rejected(reason)
    return number

def prepare(row, review):
    if DEMO.search(' '.join(str(x) for x in row.values())):raise Rejected('example_row')
    if row['حالة التحقق'].strip().casefold() not in APPROVED:raise Rejected('source_verification_missing')
    required(row['مصدر العرض'],'missing_source')
    required(row['SKU'],'missing_sku')
    required(row['الوصف/المواصفة'],'missing_specification')
    if not isinstance(review,dict) or review.get('approved_for_sharing') is not True:raise Rejected('shareable_approval_missing')
    for src,expected in [('SKU','source_sku'),('الوصف/المواصفة','source_spec'),('الوحدة','source_unit')]:
        if required(review.get(expected),'unmapped_source').casefold()!=row[src].strip().casefold():raise Rejected('source_mapping_changed')
    unit=UNITS.get(row['الوحدة'].strip().casefold())
    if not unit:raise Rejected('unsupported_unit')
    try:start=date.fromisoformat(row['تاريخ السعر'].strip());end=date.fromisoformat(row['صالح حتى'].strip())
    except ValueError:raise Rejected('unconfirmed_iso_dates') from None
    if end<start:raise Rejected('invalid_date_window')
    price=decimal(row['السعر قبل الضريبة'],'net_pack_price_unconfirmed')
    freight=decimal(review.get('net_freight_per_pack'),'freight_unconfirmed')
    discount=decimal(review.get('net_discount_per_pack'),'discount_unconfirmed')
    size=decimal(review.get('contents_per_pack'),'pack_size_unconfirmed',strict=True)
    approved=(price+freight-discount)/(size*unit[1])
    if approved<=0:raise Rejected('invalid_delivered_net_price')
    currency=required(review.get('currency'),'currency_unconfirmed').upper()
    if not re.fullmatch('[A-Z]{3}',currency):raise Rejected('currency_unconfirmed')
    minimum=decimal(review.get('min_base_qty'),'quantity_tier_unconfirmed')
    if 'max_base_qty' not in review:raise Rejected('quantity_tier_unconfirmed')
    maximum=review['max_base_qty']
    if maximum is not None:maximum=str(decimal(maximum,'invalid_tier',minimum))
    return dict(item_key=required(review.get('item_key'),'missing_standard_item'),spec_key=required(review.get('spec_key'),'missing_standard_specification'),
        region=required(review.get('region'),'missing_region'),currency=currency,base_unit=unit[0],min_qty=str(minimum),max_qty=maximum,
        delivered_net_unit_price=str(approved.quantize(Decimal('0.000001'),rounding=ROUND_HALF_UP)),
        valid_from=start.isoformat(),valid_until=end.isoformat(),evidence_ref=required(review.get('approval_ref'),'internal_approval_missing'))

def stage(filename, approvals):
    with filename.open(encoding='utf-8-sig',newline='') as f: data=list(csv.reader(f))
    for idx,header in enumerate(data):
        if HEADERS.issubset(set(header)):break
    else:raise ValueError('Price Master header not found')
    records=[dict(zip(header,row)) for row in data[idx+1:] if any(v.strip() for v in row)]
    ids=Counter(r.get('Price ID','').strip() for r in records);rejected=Counter();accepted=[]
    for row in records:
        try:
            if not HEADERS.issubset(row):raise Rejected('incomplete_row')
            identifier=required(row['Price ID'],'missing_price_id')
            if ids[identifier]!=1:raise Rejected('duplicate_price_id')
            accepted.append(prepare(row,approvals.get(identifier)))
        except Rejected as e:rejected[str(e)]+=1
    return dict(count=len(records),accepted=len(accepted),excluded=dict(rejected)), accepted

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv',type=Path,help='locally exported Product & Price Master CSV')
    parser.add_argument('approvals',type=Path,help='operator-reviewed JSON object keyed by Price ID')
    parser.add_argument('--stage',type=Path,help='write a new private curator input file. Omit for count-only dry run.')
    args=parser.parse_args()
    approvals=json.loads(args.approvals.read_text())
    if not isinstance(approvals,dict):parser.error('approvals must be keyed by Price ID')
    counts,accepted=stage(args.csv,approvals)
    if args.stage:
        if len(accepted)>200:parser.error('split source export into batches of 200 or fewer approved rows')
        with args.stage.open('x',encoding='utf8') as f:json.dump(accepted,f,ensure_ascii=False,indent=2)
    print(json.dumps(counts,ensure_ascii=False))
