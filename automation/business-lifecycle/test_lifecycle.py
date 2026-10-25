#!/usr/bin/env python3
"""Behavior and failure tests; zero network calls and no production data."""
import argparse
import contextlib
import io
import json
import sqlite3
import tempfile
import unittest
from datetime import date
from pathlib import Path
from dragon_lifecycle import Engine, Rejected, demo_events


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.e=Engine(clock=lambda:date(2026,10,25));self.e.seed_synthetic_members('A');self.events=demo_events()

    def step(self, index, event_id=None, **changes):
        actor,action,payload=self.events[index]
        return self.e.apply('A',actor,event_id or f'e{index}',action,'case',{**payload,**changes})

    def through(self, index):
        for n in range(index+1):self.step(n)

    def rejected(self, message, fn):
        with self.assertRaisesRegex(Rejected,message):fn()

    def test_complete_customer_to_cash_and_renewal(self):
        self.through(11)
        r=self.e.report('A','owner','2026-11-06')
        self.assertEqual(r['cases'][0]['state'],'renewal_ready')
        self.assertEqual(r['cases'][0]['data']['invoice']['paid_cents'],100000)
        self.assertEqual(len(r['cases'][0]['exceptions']),0)
        self.assertEqual(self.e.db.execute("SELECT count(*) FROM audit WHERE result='accepted'").fetchone()[0],12)
        self.assertFalse(r['external_delivery_verified']);self.assertFalse(r['schedule_active'])

    def test_duplicate_returns_original_without_second_case_or_outbox(self):
        self.step(0);r=self.step(0)
        self.assertTrue(r['duplicate'])
        self.assertEqual(self.e.db.execute('SELECT count(*) FROM outbox').fetchone()[0],1)
        self.assertEqual(self.e.db.execute('SELECT count(*) FROM cases').fetchone()[0],1)

    def test_conflicting_idempotency_payload_rejected(self):
        self.step(0)
        self.rejected('idempotency_conflict',lambda:self.step(0,building='OTHER TEST'))
        self.assertEqual(self.e.report('A','owner','2026-10-25')['cases'][0]['data']['building'],'TEST BUILDING')

    def test_missing_data_does_not_create_case(self):
        self.rejected('missing:building',lambda:self.step(0,building=''))
        self.assertEqual(self.e.db.execute('SELECT count(*) FROM cases').fetchone()[0],0)
        self.assertEqual(self.e.db.execute("SELECT result FROM audit").fetchone()[0],'rejected')

    def test_missing_owner_and_wrong_owner_role(self):
        self.rejected('membership_required',lambda:self.step(0,owner='nobody'))
        self.rejected('responsible_sales_owner_required',lambda:self.step(0,owner='ops'))

    def test_reject_non_synthetic(self):
        self.rejected('synthetic_data_only',lambda:self.step(0,synthetic=False))

    def test_invalid_dependency_cannot_invoice_before_quality(self):
        self.through(6)
        self.rejected('invalid_state_transition',lambda:self.step(9))
        self.assertEqual(self.e.report('A','owner','2026-10-25')['cases'][0]['state'],'work_planned')

    def test_sales_cannot_self_approve(self):
        self.through(3)
        self.rejected('action_not_authorized',lambda:self.e.apply('A','sales','bad','approve_quote','case',{'evidence':'TEST'}))

    def test_expired_quote_cannot_be_approved_or_contracted(self):
        self.through(3);self.e.clock=lambda:date(2026,11,2)
        self.rejected('quote_expired',lambda:self.step(4))
        self.e.clock=lambda:date(2026,10,25);self.step(4)
        self.e.clock=lambda:date(2026,11,2)
        self.rejected('quote_expired',lambda:self.step(5))

    def test_financial_report_hidden_from_operational_roles(self):
        self.step(0)
        for actor in ['ops','quality','sales']:
            self.rejected('financial_report_role_required',lambda:self.e.report('A',actor,'2026-10-25'))

    def test_employee_queue_only_assigned_work_without_prices(self):
        self.through(6)
        self.e.db.execute("INSERT INTO members VALUES('A','ops2','operations')")
        self.assertEqual(self.e.work_queue('A','ops2')['items'],[])
        queue=self.e.work_queue('A','ops')['items']
        self.assertEqual(len(queue),1)
        self.assertNotIn('quote_cents',queue[0]);self.assertNotIn('cost_cents',queue[0])

    def test_non_text_fields_rejected(self):
        self.rejected('bounded_text_required',lambda:self.step(0,company={'name':'TEST'}))

    def test_payment_reference_cannot_be_reused_on_another_case(self):
        self.through(10)
        for i,(actor,action,payload) in enumerate(self.events[:10]):
            self.e.apply('A',actor,f'second-{i}',action,'second',payload)
        self.rejected('payment_reference_already_recorded',lambda:self.e.apply('A','finance','new-payment','record_payment','second',{'amount_cents':100000,'reference':'TEST-PAY-1'}))

    def test_rejected_quote_cannot_authorize_contract(self):
        self.through(3)
        self.e.apply('A','owner','reject','reject_quote','case',{'evidence':'TEST decision','reason':'TEST rejected scope'})
        self.rejected('invalid_state_transition',lambda:self.step(5))

    def test_supplier_overdue_is_owned_exception(self):
        self.through(6)
        r=self.e.report('A','owner','2026-10-28')
        self.assertEqual(r['cases'][0]['exceptions'],[{'kind':'supplier_overdue','owner':'ops'}])

    def test_payment_overdue_and_partial_payment(self):
        self.through(9)
        self.step(10,amount_cents=25000)
        r=self.e.report('A','owner','2026-11-06')
        self.assertEqual(r['cases'][0]['state'],'invoiced')
        self.assertEqual(r['cases'][0]['exceptions'][0]['kind'],'collection_overdue')
        self.e.apply('A','finance','payment2','record_payment','case',{'amount_cents':75000,'reference':'TEST-PAY-2'})
        self.assertEqual(self.e.report('A','owner','2026-11-06')['cases'][0]['state'],'paid')

    def test_duplicate_payment_reference_with_new_event_rejected(self):
        self.through(9);self.step(10,amount_cents=25000)
        self.rejected('payment_reference_already_recorded',lambda:self.step(10,event_id='new-key',amount_cents=25000))
        self.assertEqual(self.e.report('A','owner','2026-11-06')['cases'][0]['data']['invoice']['paid_cents'],25000)

    def test_negative_float_bool_and_overpayment_rejected(self):
        self.through(9)
        for val in [-1,1.5,True]:
            self.rejected('positive_integer',lambda:self.step(10,amount_cents=val))
        self.rejected('overpayment',lambda:self.step(10,amount_cents=100001))

    def test_tenant_mismatch_reads_and_writes_rejected(self):
        self.step(0)
        self.rejected('membership_required',lambda:self.e.report('B','owner','2026-10-25'))
        self.rejected('membership_required',lambda:self.e.apply('B','sales','e1','qualify','case',{'evidence':'TEST'}))
        self.e.seed_synthetic_members('B')
        self.assertEqual(self.e.report('B','owner','2026-10-25')['cases'],[])
        self.rejected('invalid_state_transition',lambda:self.e.apply('B','sales','e1','qualify','case',{'evidence':'TEST'}))

    def test_idempotency_scoped_per_tenant(self):
        self.step(0);self.e.seed_synthetic_members('B')
        actor,action,payload=self.events[0]
        self.e.apply('B',actor,'e0',action,'case',payload)
        self.assertEqual(self.e.db.execute('SELECT count(*) FROM cases').fetchone()[0],2)

    def test_failed_adapter_bounded_retries_and_dead_letter(self):
        self.step(0)
        self.assertEqual(self.e.simulate_outbox('A','owner',0,fail=True),1)
        self.assertEqual(self.e.simulate_outbox('A','owner',59,fail=True),0)
        self.assertEqual(self.e.simulate_outbox('A','owner',60,fail=True),1)
        self.assertEqual(self.e.simulate_outbox('A','owner',180,fail=True),1)
        self.assertEqual(self.e.simulate_outbox('A','owner',999,fail=True),0)
        row=self.e.db.execute('SELECT * FROM outbox').fetchone()
        self.assertEqual((row['status'],row['attempts']),('dead_letter',3))

    def test_retry_recovers_without_second_external_action(self):
        self.step(0);self.e.simulate_outbox('A','owner',0,fail=True)
        self.assertEqual(self.e.simulate_outbox('A','owner',60),1)
        self.assertEqual(self.e.simulate_outbox('A','owner',1000),0)
        self.assertEqual(self.e.db.execute('SELECT status FROM outbox').fetchone()[0],'simulated_delivered')

    def test_worker_restricted_to_owner(self):
        self.step(0)
        self.rejected('owner_required',lambda:self.e.simulate_outbox('A','sales'))

    def test_quality_requires_independent_role_and_pass(self):
        self.through(7)
        self.rejected('action_not_authorized',lambda:self.e.apply('A','ops','quality','accept_quality','case',{'passed':True,'evidence':'TEST'}))
        self.rejected('quality_not_passed',lambda:self.step(8,passed=False))

    def test_audit_cannot_be_mutated_via_normal_sql(self):
        self.step(0)
        for sql in ['DELETE FROM audit',"UPDATE audit SET detail='changed'"]:
            with self.assertRaisesRegex(sqlite3.IntegrityError,'append-only'):self.e.db.execute(sql)

    def test_restart_preserves_state_and_idempotency(self):
        with tempfile.TemporaryDirectory() as folder:
            p=str(Path(folder)/'test.sqlite');e=Engine(p);e.seed_synthetic_members('A')
            actor,action,payload=self.events[0];e.apply('A',actor,'event',action,'case',payload);e.db.close()
            e=Engine(p);r=e.apply('A',actor,'event',action,'case',payload)
            self.assertTrue(r['duplicate']);self.assertEqual(e.report('A','owner','2026-10-25')['cases'][0]['state'],'lead');e.db.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--report');args=p.parse_args()
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(LifecycleTests)
    out=io.StringIO();result=unittest.TextTestRunner(stream=out,verbosity=2).run(suite)
    print(out.getvalue())
    report={'scope':'synthetic_local_sqlite_business_lifecycle','tests':result.testsRun,
            'passed':result.testsRun-len(result.failures)-len(result.errors),
            'failures':[{'test':str(t),'detail':d} for t,d in result.failures+result.errors],
            'external_services_tested':False,'production_ready':False,
            'log':out.getvalue()}
    if args.report:Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
