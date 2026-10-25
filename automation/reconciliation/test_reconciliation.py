import unittest
from datetime import datetime,timezone
from reconciliation import decision

class ReconciliationTests(unittest.TestCase):
 def setUp(self):
  self.now=datetime(2026,10,25,16,tzinfo=timezone.utc)
  self.e=dict(organization_id='TEST-ORG-A',submission_id='TEST-001',channel='crm',state='pending',owner_id='TEST-OWNER',test_mode=True,attempts=0)
 def test_valid_test_only(self):self.assertEqual(decision(self.e,self.now)['action'],'simulate_delivery')
 def test_same_event_stable_key(self):self.assertEqual(decision(self.e,self.now)['action_key'],decision(dict(self.e),self.now)['action_key'])
 def test_tenant_keys_differ(self):self.assertNotEqual(decision(self.e,self.now)['action_key'],decision(dict(self.e,organization_id='TEST-ORG-B'),self.now)['action_key'])
 def test_delimiter_collision_prevented(self):
  first=dict(self.e,organization_id='A|TEST-B',submission_id='TEST-C')
  second=dict(self.e,organization_id='A',submission_id='TEST-B|TEST-C')
  self.assertNotEqual(decision(first,self.now)['action_key'],decision(second,self.now)['action_key'])
 def test_missing_owner_quarantined(self):self.assertEqual(decision(dict(self.e,owner_id=''),self.now)['action'],'quarantine')
 def test_duplicate_skipped(self):self.assertEqual(decision(dict(self.e,already_claimed=True),self.now)['action'],'skip')
 def test_delivered_skipped(self):self.assertEqual(decision(dict(self.e,state='delivered'),self.now)['action'],'skip')
 def test_network_timeout_not_resent(self):self.assertEqual(decision(dict(self.e,state='unknown'),self.now)['action'],'reconcile_provider')
 def test_permanent_failure_escalated(self):self.assertEqual(decision(dict(self.e,state='failed_permanent'),self.now)['action'],'escalate')
 def test_retry_cap(self):self.assertEqual(decision(dict(self.e,state='failed_retryable',attempts=4),self.now)['action'],'escalate')
 def test_backoff(self):self.assertEqual(decision(dict(self.e,next_attempt_at='2026-10-25T16:01:00+00:00'),self.now)['action'],'wait')
 def test_timezone_required(self):self.assertEqual(decision(dict(self.e,next_attempt_at='2026-10-25T16:01:00'),self.now)['action'],'quarantine')
 def test_no_customer_messages(self):self.assertEqual(decision(dict(self.e,channel='customer_email'),self.now)['action'],'approval_required')
 def test_no_live_execution(self):self.assertEqual(decision(dict(self.e,test_mode=False),self.now)['action'],'blocked')
 def test_no_real_record(self):self.assertEqual(decision(dict(self.e,submission_id='customer-001'),self.now)['action'],'blocked')
 def test_invalid_count(self):self.assertEqual(decision(dict(self.e,attempts=-1),self.now)['action'],'quarantine')
 def test_unknown_state(self):self.assertEqual(decision(dict(self.e,state='success_guess'),self.now)['action'],'quarantine')

if __name__=='__main__':unittest.main(verbosity=2)
