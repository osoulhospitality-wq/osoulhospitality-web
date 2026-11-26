"""Rerunnable synthetic, read-only-production-independent retrieval and restore drill."""
import hashlib
import json
import math
import os
import sqlite3
import tempfile
from pathlib import Path
from time import perf_counter_ns

ROOT = Path(__file__).resolve().parent
QUERY = (ROOT / 'memory_retrieval.sql').read_text()
TODAY = '2026-11-26T12:00:00Z'
PAST = '2026-11-01T00:00:00Z'
FUTURE = '2026-12-01T00:00:00Z'
BASE = dict(actor_id='lead',tenant_id='A',site_id='riyadh',category='maintenance',as_of=TODAY)

def add(db, name, version=1, tenant='A', site='riyadh', role='ops', status='approved',
        sensitivity=1, effective=PAST, until=None, review=FUTURE, disposition=None, hold=None,
        source_at=PAST, category='maintenance'):
    body=f'SYNTHETIC/{tenant}/{name}/{version}'
    db.execute('INSERT INTO knowledge_record VALUES ('+','.join('?'*21)+')',
        (tenant,name,version,site,category,'fixture://'+name,source_at,'FM guide','steward',status,
         sensitivity,effective,until,review,'test-delete-after-run',disposition,hold,
         'test-approver','fixture://approval',hashlib.sha256(body.encode()).hexdigest(),body))
    db.execute('INSERT INTO record_role VALUES (?,?,?,?)',(tenant,name,version,role))

def find(db, changes=None):
    return [f'{r[1]}@{r[2]}' for r in db.execute(QUERY,{**BASE,**(changes or {})})]

def run():
    results=[]
    def case(name, inputs, expected, action):
        start=perf_counter_ns()
        try: actual=action()
        except Exception as e: actual='ERROR: '+type(e).__name__
        elapsed=(perf_counter_ns()-start)/1e6
        results.append(dict(id=name,inputs=inputs,expected=expected,actual=actual,elapsed_ms=round(elapsed,4),
            status='PASS' if actual==expected else 'FAIL',evidence='local SQLite synthetic fixture; '+name,
            external_cost=0,corrective_action=None if actual==expected else 'Inspect SQL contract; block promotion.'))
    with tempfile.TemporaryDirectory() as tmp:
        tmp=Path(tmp)
        with sqlite3.connect(tmp/'source.db') as db:
            db.executescript((ROOT/'memory_schema.sql').read_text())
            db.executemany('INSERT INTO trusted_actor_site VALUES (?,?,?,?,?)',[
                ('lead','A','riyadh','ops',1),('auditor','A','riyadh','auditor',2),
                ('visitor','B','riyadh','ops',1),('lead','A','jeddah','ops',1)])
            add(db,'guide'); add(db,'guide',2); add(db,'guide',3,status='draft')
            add(db,'org',site=None);add(db,'private',sensitivity=2)
            add(db,'withdrawn');add(db,'withdrawn',2,status='withdrawn')
            add(db,'expired',until=TODAY);add(db,'review-due',review=TODAY)
            add(db,'hold-expired',disposition=TODAY,hold='fixture://hold')
            add(db,'future',effective=FUTURE);add(db,'future-source',source_at=FUTURE)
            add(db,'other-tenant',tenant='B');add(db,'other-site',site='jeddah')
            add(db,'finance',category='finance',role='auditor',sensitivity=2)
            add(db,'new-role');add(db,'new-role',2,role='auditor',sensitivity=2)
            db.commit()
            expected=['guide@2','org@1']
            case('K01',BASE,expected,lambda:find(db))
            case('K02','same tenant / different authorised site',['org@1','other-site@1'],lambda:find(db,{'site_id':'jeddah'}))
            case('K03','no site membership',[],lambda:find(db,{'site_id':'madinah'}))
            case('K04','actor scoped to other tenant',[],lambda:find(db,{'actor_id':'visitor'}))
            case('K05','tenant B authorised membership',['other-tenant@1'],lambda:find(db,{'actor_id':'visitor','tenant_id':'B'}))
            case('K06','ops role / restricted finance category',[],lambda:find(db,{'category':'finance'}))
            case('K07','finance read by authorised auditor',['finance@1'],lambda:find(db,{'actor_id':'auditor','category':'finance'}))
            case('K08','new edition with narrower ACL; old access revoked',False,lambda:'new-role@1' in find(db))
            case('K09','withdrawn latest version shadows valid history',False,lambda:any(r.startswith('withdrawn') for r in find(db)))
            case('K10','role allowed / low clearance',False,lambda:'private@1' in find(db))
            case('K11','expiry equal to now',False,lambda:'expired@1' in find(db))
            case('K12','retention hold preserves storage only',False,lambda:'hold-expired@1' in find(db))
            case('K13','scheduled re-review due',False,lambda:'review-due@1' in find(db))
            case('K14','future source or effective date',False,lambda:any(r.startswith('future') for r in find(db)))
            case('K15','future draft does not hide approved edition',True,lambda:'guide@2' in find(db))
            backup=tmp/'snapshot.db'
            with sqlite3.connect(backup) as archive: db.backup(archive)
            snap_hash=hashlib.sha256(backup.read_bytes()).hexdigest()
            add(db,'after-snapshot');db.commit()
            start=perf_counter_ns()
            with sqlite3.connect(backup) as archive, sqlite3.connect(tmp/'restore.db') as recovered:
                archive.backup(recovered)
                case('DR01','sha256 of independent snapshot',snap_hash,lambda:hashlib.sha256(backup.read_bytes()).hexdigest())
                case('DR02','restored DB integrity','ok',lambda:recovered.execute('pragma integrity_check').fetchone()[0])
                case('DR03','restored authorisation, lineage and editions',expected,lambda:find(recovered))
                case('DR04','post-checkpoint row detected as missing',True,lambda:'after-snapshot@1' in find(db) and 'after-snapshot@1' not in find(recovered))
                case('DR05','restored payloads checked against their source checksums',True,lambda:all(
                    hashlib.sha256(body.encode()).hexdigest()==checksum for body,checksum in recovered.execute('select body,checksum from knowledge_record')))
            restore_ms=(perf_counter_ns()-start)/1e6
            timings=[]
            for _ in range(100):
                tick=perf_counter_ns();find(db);timings.append((perf_counter_ns()-tick)/1e6)
            size=backup.stat().st_size
    outcome={'environment':'Local SQLite synthetic fixture; no external API calls. No production backup used.',
        'data_class':'synthetic','checkpoint_loss_rows':1,'snapshot_bytes':size,'restore_and_check_ms':round(restore_ms,4),
        'retrieval_p95_ms_local_100_runs':round(sorted(timings)[math.ceil(.95*len(timings))-1],4),
        'external_request_cost_zero':True,'cases':results}
    if report_path := os.environ.get('DRAQON_MEMORY_TEST_REPORT'):
        Path(report_path).write_text(json.dumps(outcome,indent=2)+'\n')
    print(json.dumps({k:outcome[k] for k in ('restore_and_check_ms','snapshot_bytes','checkpoint_loss_rows','retrieval_p95_ms_local_100_runs')}),sum(r['status']=='PASS' for r in results),'/',len(results))
    return all(r['status']=='PASS' for r in results)
if __name__=='__main__': raise SystemExit(0 if run() else 1)
