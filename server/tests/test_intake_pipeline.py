import json,os,subprocess,tempfile,unittest,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PHP=os.environ.get('PHP_BINARY','php')
class PipelineTests(unittest.TestCase):
 def setUp(self): self.tmp=tempfile.TemporaryDirectory(); self.d=self.tmp.name; self.key=str(uuid.uuid4())
 def tearDown(self): self.tmp.cleanup()
 def runphp(self,code):
  r=subprocess.run([PHP,'-n','-r',f'require {json.dumps(str(ROOT/"server/intake-pipeline.php"))}; $d={json.dumps(self.d)}; '+code],capture_output=True,text=True)
  self.assertEqual(r.returncode,0,r.stderr);return json.loads(r.stdout)
 def http(self,modes=None,change=None):
  data={k:'SYNTHETIC' for k in ['asset_type','city','stage','opening_target','units','primary_gap','urgency','documents','requested_support','name','organization']}
  data.update(form_name='hospitality_readiness_brief',consent='yes',email='synthetic@example.invalid',idempotency_key=self.key,started_at=str(int(time.time()*1000)-4000),language='ar')
  data.update(change or {})
  env=os.environ|{'OSOOL_INTAKE_STATE_DIR':self.d,'TEST_POST':json.dumps(data),'TEST_MODES':json.dumps(modes or {})}
  r=subprocess.run([PHP,'-n',str(ROOT/'server/tests/intake-http-harness.php')],env=env,capture_output=True,text=True)
  self.assertEqual(r.returncode,0,r.stderr);return json.loads(r.stdout)
 def state(self):return json.loads(next(Path(self.d).glob('receipt-*.json')).read_text())
 def test_http_full_pipeline(self):
  r=self.http();self.assertEqual(r['calls'],['crm','mail','database']);self.assertIn('submitted=1',r['location']);self.assertFalse(self.state()['needs_review'])
 def test_duplicate_stable_receipt(self):
  a=self.http();b=self.http();self.assertEqual(a['location'],b['location']);self.assertEqual(b['calls'],[])
 def test_conflicting_payload(self):
  self.http();r=self.http(change={'city':'different'});self.assertEqual(r['calls'],[]);self.assertIn('conflict',r['location'])
 def test_partial(self):
  r=self.http({'crm':'unknown','mail':'failed'});self.assertIn('submitted=1',r['location']);s=self.state();self.assertTrue(s['needs_review']);self.assertEqual(s['channels']['crm']['status'],'unknown');self.assertEqual(s['channels']['mail']['status'],'failed');self.assertEqual(self.http()['calls'],[])
 def test_all_unknown_failclosed_no_retry(self):
  r=self.http({'crm':'unknown','mail':'failed','database':'unknown'});self.assertIn('review-required',r['location']);self.assertEqual(self.http()['calls'],[])
 def test_missing_fields_no_effect(self):
  r=self.http(change={'name':''});self.assertEqual(r['calls'],[]);self.assertIn('incomplete',r['location']);self.assertEqual(list(Path(self.d).glob('receipt-*.json')),[])
 def test_corrupt_ledger_no_effect(self):
  self.http();next(Path(self.d).glob('receipt-*.json')).write_text('{broken');r=self.http();self.assertEqual(r['calls'],[]);self.assertIn('review-required',r['location'])
 def test_inprogress_after_crash_no_replay(self):
  self.http();p=next(Path(self.d).glob('receipt-*.json'));s=json.loads(p.read_text());s['status']='processing';s['channels']['crm']['status']='in_progress';p.write_text(json.dumps(s));self.assertEqual(self.http()['calls'],[])
 def test_malformed_completed_channels_no_success(self):
  self.http();p=next(Path(self.d).glob('receipt-*.json'));s=json.loads(p.read_text());s['channels']={};p.write_text(json.dumps(s));r=self.http();self.assertEqual(r['calls'],[]);self.assertIn('review-required',r['location'])
 def test_adapter_exception_unknown(self):
  r=self.runphp('$a=fn()=>throw new Exception("secret"); echo json_encode(intake_process("x","fp",["crm"=>$a,"mail"=>$a,"database"=>$a],$d));');self.assertEqual(r['status'],'review-required');self.assertNotIn('secret',json.dumps(r))
 def test_unsafe_directory(self):
  os.chmod(self.d,0o755);r=self.http();self.assertEqual(r['calls'],[]);self.assertIn('send-error',r['location'])
 def test_no_config(self):
  r=self.runphp('putenv("OSOOL_INTAKE_STATE_DIR"); $a=fn()=>throw new Exception(); echo json_encode(intake_process("x","fp",["crm"=>$a,"mail"=>$a,"database"=>$a]));');self.assertEqual(r['status'],'unavailable')
if __name__=='__main__':unittest.main(verbosity=2)
