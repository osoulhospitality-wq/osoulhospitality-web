import json,os,subprocess,tempfile,unittest,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];PHP=os.environ.get('PHP_BINARY','php')
class MigrationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.src=self.base/'legacy';self.dst=self.base/'receipts';self.src.mkdir(mode=0o700);self.dst.mkdir(mode=0o700);self.digest=hashlib.sha256(b'old-key').hexdigest();self.old=self.src/f'osoul-submission-{self.digest}.lock';self.new=self.dst/f'receipt-{self.digest}.json';self.old.write_text(json.dumps({'fingerprint':'fp','receipt':'a'*16,'status':'completed'}))
 def tearDown(self):self.tmp.cleanup()
 def migrate(self,apply=False):
  cmd=[PHP,'-n',str(ROOT/'server/migrate-intake-claims.php'),'--source='+str(self.src),'--destination='+str(self.dst)]+(['--apply'] if apply else [])
  p=subprocess.run(cmd,capture_output=True,text=True);return p.returncode,json.loads(p.stdout) if p.stdout else p.stderr
 def test_dryrun_no_mutation(self):
  rc,r=self.migrate();self.assertEqual(rc,0);self.assertEqual(r['planned'],1);self.assertEqual(list(self.dst.iterdir()),[])
 def test_apply_idempotent_no_overwrite(self):
  rc,r=self.migrate(True);self.assertEqual(r['migrated'],1);before=self.new.read_bytes();rc,r=self.migrate(True);self.assertEqual(r['existing'],1);self.assertEqual(before,self.new.read_bytes());self.assertTrue(self.old.exists());s=json.loads(before);self.assertEqual(s['receipt'],'a'*16);self.assertTrue(all(x['status']=='unknown' for x in s['channels'].values()))
 def test_existing_corrupt_untouched(self):
  self.new.write_text('{existing');rc,r=self.migrate(True);self.assertEqual(r['existing'],1);self.assertEqual(self.new.read_text(),'{existing')
 def test_corrupt_legacy_tombstone(self):
  self.old.write_text('{broken');rc,r=self.migrate(True);self.assertEqual(rc,0);self.assertEqual(json.loads(self.new.read_text())['status'],'review-required')
 def test_timestamp_legacy(self):
  self.old.write_text('1720000000');rc,r=self.migrate(True);self.assertEqual(rc,0);self.assertEqual(len(json.loads(self.new.read_text())['receipt']),16)
 def test_source_symlink_rejected(self):
  self.old.unlink();self.old.symlink_to(self.base/'missing');rc,r=self.migrate(True);self.assertEqual(rc,1);self.assertEqual(r['errors'],1);self.assertFalse(self.new.exists())
 def test_destination_symlink_rejected(self):
  self.new.symlink_to(self.base/'missing');rc,r=self.migrate(True);self.assertEqual(rc,1);self.assertEqual(r['errors'],1)
 def test_pipeline_blocks_legacy_key(self):
  self.migrate(True);code=f'require {json.dumps(str(ROOT/"server/intake-pipeline.php"))}; $a=fn()=>file_put_contents({json.dumps(str(self.base/"unexpected-adapter"))},"called"); echo json_encode(intake_process("old-key","fp",["crm"=>$a,"mail"=>$a,"database"=>$a],{json.dumps(str(self.dst))}));'
  p=subprocess.run([PHP,'-n','-r',code],capture_output=True,text=True);self.assertEqual(p.returncode,0,p.stderr);self.assertEqual(json.loads(p.stdout)['status'],'review-required');self.assertFalse((self.base/'unexpected-adapter').exists())
if __name__=='__main__':unittest.main(verbosity=2)
