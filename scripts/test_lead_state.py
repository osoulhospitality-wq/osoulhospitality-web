import json,subprocess,tempfile,unittest,concurrent.futures,os
from pathlib import Path
PHP=os.environ.get('PHP_BINARY','php')
MODULE=str(Path(__file__).resolve().parents[1]/'server/lead-state.php')
class StateTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.d=self.tmp.name
 def tearDown(self):self.tmp.cleanup()
 def runphp(self,code):
  p=subprocess.run([PHP,'-n','-r',f'require {json.dumps(MODULE)}; $d={json.dumps(self.d)}; '+code],capture_output=True,text=True)
  self.assertEqual(p.returncode,0,p.stdout+p.stderr);return json.loads(p.stdout)
 def claim(self):return self.runphp('echo json_encode(lead_state_claim("TEST-id","fp",$d));')
 def state(self,obj):self.runphp('file_put_contents(lead_state_path("TEST-id",$d),'+json.dumps(json.dumps(obj))+'); echo "true";')
 def test_concurrent(self):
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:rs=list(pool.map(lambda _:self.claim(),range(8)))
  self.assertEqual(sum(r['status']=='claimed' for r in rs),1);self.assertEqual(sum(r['status'] in ('processing','review-required') for r in rs),7)
 def test_stable_receipt(self):
  first=self.claim();self.assertTrue(self.runphp('echo json_encode(lead_state_finish("TEST-id","fp",true,$d));'));r=self.claim();self.assertEqual(r,dict(status='completed',receipt=first['receipt']))
 def test_legacy(self):self.state(1720000000);self.assertEqual(self.claim()['status'],'review-required')
 def test_empty_existing_state(self):
  self.runphp('file_put_contents(lead_state_path("TEST-id",$d),""); echo "true";');self.assertEqual(self.claim()["status"],"review-required")
 def test_corrupt_json(self):
  self.runphp('file_put_contents(lead_state_path("TEST-id",$d),"{broken"); echo "true";');self.assertEqual(self.claim()['status'],'review-required')
 def test_corrupt_typed_fingerprint(self):self.state(dict(fingerprint=[],status='completed',receipt='a'*16));self.assertEqual(self.claim()['status'],'review-required')
 def test_corrupt_typed_receipt(self):self.state(dict(fingerprint='fp',status='completed',receipt=[]));self.assertEqual(self.claim()['status'],'review-required')
 def test_unavailable(self):self.assertEqual(self.runphp('echo json_encode(lead_state_claim("x","fp",$d."/absent"));')['status'],'unavailable')
 def test_stale_unknown(self):self.state(dict(fingerprint='fp',status='processing',created_at=1));self.assertEqual(self.claim()['status'],'review-required')
 def test_mismatch(self):self.claim();self.assertEqual(self.runphp('echo json_encode(lead_state_claim("TEST-id","different",$d));')['status'],'conflict')
 def test_failed_requires_review(self):self.claim();self.runphp('echo json_encode(lead_state_finish("TEST-id","fp",false,$d));');self.assertEqual(self.claim()['status'],'review-required')
if __name__=='__main__':unittest.main(verbosity=2)
