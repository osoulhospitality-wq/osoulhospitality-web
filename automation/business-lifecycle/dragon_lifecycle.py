#!/usr/bin/env python3
"""Synthetic-only executable business lifecycle. No network adapters or AI calls."""
import argparse
import hashlib
import json
import sqlite3
from datetime import date


class Rejected(ValueError):
    pass


ROLES = {
    'lead_received': {'sales', 'owner'}, 'qualify': {'sales', 'owner'},
    'open_opportunity': {'sales', 'owner'}, 'prepare_quote': {'sales', 'owner'},
    'approve_quote': {'owner'}, 'reject_quote': {'owner'},
    'authorize_contract': {'owner'}, 'plan_work': {'operations', 'owner'},
    'submit_work': {'operations'}, 'accept_quality': {'quality'},
    'issue_invoice': {'finance', 'owner'}, 'record_payment': {'finance', 'owner'},
    'prepare_renewal': {'sales', 'owner'},
}
NEXT = {
    'lead_received': (None, 'lead'), 'qualify': ('lead', 'qualified'),
    'open_opportunity': ('qualified', 'opportunity'),
    'prepare_quote': ('opportunity', 'quote_pending'),
    'approve_quote': ('quote_pending', 'quote_approved'),
    'reject_quote': ('quote_pending', 'quote_rejected'),
    'authorize_contract': ('quote_approved', 'contract_authorized'),
    'plan_work': ('contract_authorized', 'work_planned'),
    'submit_work': ('work_planned', 'quality_pending'),
    'accept_quality': ('quality_pending', 'quality_passed'),
    'issue_invoice': ('quality_passed', 'invoiced'),
    'record_payment': ('invoiced', 'invoiced'),
    'prepare_renewal': ('paid', 'renewal_ready'),
}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def required(payload, key):
    value = payload.get(key)
    if value is None or isinstance(value, str) and not value.strip():
        raise Rejected('missing:' + key)
    return value


def cents(payload, key):
    value = required(payload, key)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise Rejected('positive_integer_minor_units_required:' + key)
    return value


def text_field(payload, key):
    value = required(payload, key)
    if not isinstance(value, str) or len(value) > 4000:
        raise Rejected('bounded_text_required:' + key)
    return value.strip()


def valid_date(payload, key):
    value = required(payload, key)
    try:
        return date.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        raise Rejected('invalid_date:' + key) from None


class Engine:
    """Local staging core. Caller authentication must be implemented before deployment."""
    def __init__(self, path=':memory:', clock=date.today):
        # Trusted process configuration, never an event-provided timestamp.
        self.clock = clock
        self.db = sqlite3.connect(path, isolation_level=None, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS members (
          tenant TEXT NOT NULL, actor TEXT NOT NULL, role TEXT NOT NULL,
          PRIMARY KEY(tenant,actor));
        CREATE TABLE IF NOT EXISTS cases (
          tenant TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL,
          data TEXT NOT NULL, PRIMARY KEY(tenant,id));
        CREATE TABLE IF NOT EXISTS accepted_events (
          tenant TEXT NOT NULL,event_id TEXT NOT NULL,fingerprint TEXT NOT NULL,
          result TEXT NOT NULL,PRIMARY KEY(tenant,event_id));
        CREATE TABLE IF NOT EXISTS payment_records (
          tenant TEXT NOT NULL, reference TEXT NOT NULL,case_id TEXT NOT NULL,
          amount_cents INTEGER NOT NULL, PRIMARY KEY(tenant,reference));
        CREATE TABLE IF NOT EXISTS audit (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT NOT NULL,actor TEXT NOT NULL,
          event_id TEXT NOT NULL,action TEXT NOT NULL,case_id TEXT NOT NULL,
          result TEXT NOT NULL,detail TEXT NOT NULL,
          recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
          BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
        CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
          BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL,
          event_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,
          last_error TEXT, UNIQUE(tenant,event_id,kind));
        ''')

    def seed_synthetic_members(self, tenant):
        """Fixture provisioning only: never exposed as a remote operation."""
        for actor, role in [('owner','owner'), ('sales','sales'), ('ops','operations'),
                            ('quality','quality'), ('finance','finance')]:
            self.db.execute('INSERT OR IGNORE INTO members VALUES(?,?,?)', (tenant,actor,role))

    def role(self, tenant, actor):
        row = self.db.execute('SELECT role FROM members WHERE tenant=? AND actor=?',
                              (tenant, actor)).fetchone()
        if not row:
            raise Rejected('membership_required')
        return row['role']

    def _audit(self, tenant, actor, event_id, action, case_id, outcome, detail):
        self.db.execute('INSERT INTO audit(tenant,actor,event_id,action,case_id,result,detail) VALUES(?,?,?,?,?,?,?)',
                        (tenant, actor, event_id, action, case_id, outcome, detail))

    def apply(self, tenant, actor, event_id, action, case_id, payload):
        if not all(isinstance(x,str) and x.strip() for x in [tenant,actor,event_id,action,case_id]):
            raise Rejected('nonempty_identifiers_required')
        if not isinstance(payload, dict):
            raise Rejected('object_payload_required')
        fingerprint = hashlib.sha256(canonical([actor, action, case_id, payload]).encode()).hexdigest()
        self.db.execute('BEGIN IMMEDIATE')
        try:
            role = self.role(tenant, actor)
            if action not in ROLES or role not in ROLES[action]:
                raise Rejected('action_not_authorized')
            old = self.db.execute('SELECT * FROM accepted_events WHERE tenant=? AND event_id=?',
                                  (tenant,event_id)).fetchone()
            if old:
                if old['fingerprint'] != fingerprint:
                    raise Rejected('idempotency_conflict')
                self.db.execute('COMMIT')
                return {**json.loads(old['result']), 'duplicate': True}
            row = self.db.execute('SELECT * FROM cases WHERE tenant=? AND id=?', (tenant,case_id)).fetchone()
            before, after = NEXT[action]
            if (row['state'] if row else None) != before:
                raise Rejected('invalid_state_transition')
            data = json.loads(row['data']) if row else {}
            if action == 'lead_received':
                if payload.get('synthetic') is not True:
                    raise Rejected('synthetic_data_only')
                name = text_field(payload,'company')
                building = text_field(payload,'building')
                owner = text_field(payload,'owner')
                if self.role(tenant,owner) not in ('sales','owner'):
                    raise Rejected('responsible_sales_owner_required')
                services = required(payload,'services')
                if not isinstance(services,list) or not services or not all(isinstance(s,str) and s.strip() for s in services):
                    raise Rejected('service_list_required')
                data = dict(synthetic=True,company=name,building=building,owner=owner,services=services)
            elif action == 'qualify':
                data['qualification_evidence'] = text_field(payload,'evidence')
            elif action == 'open_opportunity':
                data['next_action'] = text_field(payload,'next_action')
                data['follow_up_date'] = valid_date(payload,'follow_up_date')
            elif action == 'prepare_quote':
                data['quote_cents'] = cents(payload,'amount_cents')
                data['cost_cents'] = cents(payload,'cost_cents')
                if payload.get('currency') != 'SAR':
                    raise Rejected('SAR_currency_required')
                data['currency'] = 'SAR'
                data['scope'] = text_field(payload,'scope')
                data['exclusions'] = text_field(payload,'exclusions')
                data['tax_basis'] = text_field(payload,'tax_basis')
                data['quote_expiry'] = valid_date(payload,'expiry')
            elif action in ('approve_quote','reject_quote'):
                if action == 'approve_quote' and date.fromisoformat(data['quote_expiry']) < self.clock():
                    raise Rejected('quote_expired')
                data['quote_decision_evidence'] = text_field(payload,'evidence')
                if action == 'reject_quote':
                    data['rejection_reason'] = text_field(payload,'reason')
            elif action == 'authorize_contract':
                if date.fromisoformat(data['quote_expiry']) < self.clock():
                    raise Rejected('quote_expired')
                data['contract_evidence'] = text_field(payload,'signed_contract_evidence')
                data['customer_acceptance'] = text_field(payload,'customer_acceptance_evidence')
                data['authorized_by'] = actor
            elif action == 'plan_work':
                responsible = text_field(payload,'responsible')
                if self.role(tenant,responsible) != 'operations':
                    raise Rejected('operations_assignee_required')
                data['work'] = dict(responsible=responsible,supplier=text_field(payload,'supplier'),
                                    due=valid_date(payload,'due'),checklist=text_field(payload,'checklist'))
            elif action == 'submit_work':
                if actor != data['work']['responsible']:
                    raise Rejected('assigned_worker_required')
                data['work']['evidence'] = text_field(payload,'evidence')
                data['work']['submitted_by'] = actor
            elif action == 'accept_quality':
                if actor == data['work']['submitted_by']:
                    raise Rejected('independent_reviewer_required')
                if payload.get('passed') is not True:
                    raise Rejected('quality_not_passed')
                data['quality'] = dict(reviewer=actor,evidence=text_field(payload,'evidence'))
            elif action == 'issue_invoice':
                data['invoice'] = dict(reference=text_field(payload,'reference'),
                    amount_cents=data['quote_cents'], paid_cents=0, due=valid_date(payload,'due'))
            elif action == 'record_payment':
                amount = cents(payload,'amount_cents')
                reference = text_field(payload,'reference')
                refs = data.setdefault('payment_references',[])
                if self.db.execute('SELECT 1 FROM payment_records WHERE tenant=? AND reference=?',(tenant,reference)).fetchone():
                    raise Rejected('payment_reference_already_recorded')
                if data['invoice']['paid_cents']+amount>data['invoice']['amount_cents']:
                    raise Rejected('overpayment_requires_review')
                refs.append(reference)
                self.db.execute('INSERT INTO payment_records VALUES(?,?,?,?)',(tenant,reference,case_id,amount))
                data['invoice']['paid_cents'] += amount
                if data['invoice']['paid_cents']==data['invoice']['amount_cents']:
                    after='paid'
            elif action == 'prepare_renewal':
                data['renewal'] = dict(review_on=valid_date(payload,'review_on'),
                                        recommendation=text_field(payload,'recommendation'))
            result = {'tenant':tenant,'case_id':case_id,'state':after,'event_id':event_id,'duplicate':False}
            self.db.execute('INSERT INTO cases VALUES(?,?,?,?) ON CONFLICT(tenant,id) DO UPDATE SET state=excluded.state,data=excluded.data',
                            (tenant,case_id,after,canonical(data)))
            self.db.execute('INSERT INTO accepted_events VALUES(?,?,?,?)', (tenant,event_id,fingerprint,canonical(result)))
            self._audit(tenant,actor,event_id,action,case_id,'accepted',after)
            # The worker can only simulate delivery. No address or real channel is collected.
            self.db.execute('INSERT INTO outbox(tenant,event_id,kind) VALUES(?,?,?)', (tenant,event_id,'simulation.status'))
            self.db.execute('COMMIT')
            return result
        except Rejected as error:
            self.db.execute('ROLLBACK')
            self._audit(tenant,actor,event_id,action,case_id,'rejected',str(error))
            raise
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def simulate_outbox(self, tenant, actor, now=0, fail=False, max_attempts=3):
        if self.role(tenant,actor) != 'owner':
            raise Rejected('owner_required')
        if max_attempts != 3:
            raise Rejected('retry_policy_fixed_at_three')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            rows = self.db.execute("SELECT * FROM outbox WHERE tenant=? AND status IN ('pending','retry') AND next_attempt_at<=?",(tenant,now)).fetchall()
            for row in rows:
                count = row['attempts']+1
                status = ('dead_letter' if count>=3 else 'retry') if fail else 'simulated_delivered'
                next_at = now + 60*(2**(count-1)) if fail else now
                self.db.execute('UPDATE outbox SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE id=?',
                                (status,count,next_at,'simulated_adapter_failure' if fail else None,row['id']))
                self._audit(tenant,actor,row['event_id'],'outbox_simulation','',status,'no_external_send')
            self.db.execute('COMMIT')
            return len(rows)
        except BaseException:
            self.db.execute('ROLLBACK');raise

    def report(self, tenant, actor, as_of):
        if self.role(tenant,actor) not in ('owner','finance'):
            raise Rejected('financial_report_role_required')
        day = date.fromisoformat(as_of)
        rows = self.db.execute('SELECT * FROM cases WHERE tenant=? ORDER BY id',(tenant,)).fetchall()
        cases=[]
        for row in rows:
            data=json.loads(row['data']);alerts=[]
            if row['state']=='work_planned' and date.fromisoformat(data['work']['due'])<day:
                alerts.append({'kind':'supplier_overdue','owner':data['work']['responsible']})
            invoice=data.get('invoice')
            if invoice and invoice['paid_cents']<invoice['amount_cents'] and date.fromisoformat(invoice['due'])<day:
                alerts.append({'kind':'collection_overdue','owner':'finance'})
            cases.append({'id':row['id'],'state':row['state'],'data':data,'exceptions':alerts})
        return {'classification':'synthetic_local_staging_only','as_of':as_of,'tenant':tenant,'cases':cases,
                'outbox': [dict(r) for r in self.db.execute('SELECT status,count(*) AS count FROM outbox WHERE tenant=? GROUP BY status',(tenant,))],
                'schedule_active':False,'external_delivery_verified':False}

    def work_queue(self, tenant, actor):
        if self.role(tenant,actor) != 'operations':
            raise Rejected('operations_role_required')
        items=[]
        for row in self.db.execute('SELECT * FROM cases WHERE tenant=? ORDER BY id',(tenant,)):
            data=json.loads(row['data']);work=data.get('work')
            if work and work['responsible']==actor:
                items.append({'case_id':row['id'],'state':row['state'],
                              'building':data['building'],'services':data['services'],'work':work})
        return {'classification':'synthetic_local_staging_only','items':items}


def demo_events():
    return [
      ('sales','lead_received',dict(synthetic=True,company='SYNTHETIC COMPANY',building='TEST BUILDING',owner='sales',services=['S04'])),
      ('sales','qualify',dict(evidence='TEST survey reviewed')),
      ('sales','open_opportunity',dict(next_action='TEST site assessment',follow_up_date='2026-10-26')),
      ('sales','prepare_quote',dict(amount_cents=100000,cost_cents=70000,currency='SAR',scope='TEST one service',exclusions='TEST parts excluded',tax_basis='TEST amount excludes tax; not a tax invoice',expiry='2026-11-01')),
      ('owner','approve_quote',dict(evidence='TEST owner approval')),
      ('owner','authorize_contract',dict(signed_contract_evidence='TEST signed reference',customer_acceptance_evidence='TEST acceptance')),
      ('ops','plan_work',dict(responsible='ops',supplier='SYNTHETIC SUPPLIER',due='2026-10-27',checklist='TEST inspection checklist')),
      ('ops','submit_work',dict(evidence='TEST readings and photos reference')),
      ('quality','accept_quality',dict(passed=True,evidence='TEST independent quality review')),
      ('finance','issue_invoice',dict(reference='TEST-INV-1',due='2026-11-05')),
      ('finance','record_payment',dict(amount_cents=100000,reference='TEST-PAY-1')),
      ('sales','prepare_renewal',dict(review_on='2027-09-25',recommendation='TEST review actual scope and costs')),
    ]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['demo','report'])
    parser.add_argument('--db',default=':memory:')
    parser.add_argument('--as-of',default='2026-11-06')
    args=parser.parse_args();engine=Engine(args.db,clock=lambda:date(2026,10,25))
    if args.command=='demo':
        engine.seed_synthetic_members('SYNTHETIC-A')
        for index,(actor,action,payload) in enumerate(demo_events()):
            engine.apply('SYNTHETIC-A',actor,f'TEST-EVENT-{index}',action,'TEST-CASE-1',payload)
        engine.simulate_outbox('SYNTHETIC-A','owner')
    print(json.dumps(engine.report('SYNTHETIC-A','owner',args.as_of),ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
