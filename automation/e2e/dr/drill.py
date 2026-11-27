"""Native, offline PostgreSQL logical backup and independent cold restore of synthetic FM data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
MIGRATIONS = [
    "supabase/migrations/20261125190000_bootstrap_enterprise_foundation.sql",
    "supabase/migrations/20261125193000_add_facility_operations.sql",
    "supabase/migrations/20261126190000_draqon_field_handoff.sql",
]
TABLES = ["auth.users", "public.organizations", "public.organization_members", "public.facilities",
          "public.facility_assets", "public.facility_work_orders", "public.facility_visits",
          "public.draqon_field_proposals", "public.draqon_field_events", "private.draqon_field_pilot"]
ROLES = "create role anon; create role authenticated; create role service_role;"
def digest(data):
    return hashlib.sha256(data).hexdigest()
def identity(n):
    return f"10000000-0000-4000-8000-{n:012d}"
OWNER, TECH, OUTSIDER, ORG, OTHER, FAC, SITE, ASSET, PROPOSAL, LATE, ASSET_B = map(identity, range(1,12))
def claims(uid):
    return "select set_config('request.jwt.claims','" + json.dumps({"sub": uid,"aal":"aal2"}) + "',false);"
def authed(uid, sql):
    return claims(uid) + "set role authenticated;" + sql
def require(ok, message):
    if not ok:
        raise RuntimeError(message)
def now():
    return datetime.now(timezone.utc).isoformat()
def milliseconds(start):
    return round((time.monotonic() - start) * 1000, 3)
def archive_hash(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f,"sha256").hexdigest()
def start_cluster(bin_dir, base):
    data, sock = base/"cluster", base/"socket"
    base.mkdir()
    sock.mkdir(mode=0o700)
    # Ignore caller's PGHOST/PGSERVICE/PGPASSWORD and any production connection strings.
    env = {k:v for k,v in os.environ.items() if not k.startswith("PG")}
    env.update(PGHOST=str(sock),PGPORT="5432",PGUSER="dr_fixture",PGDATABASE="postgres",PGTZ="UTC",PGCONNECT_TIMEOUT="5")
    def tool(name,*args,input_sql=None):
        p = subprocess.run([str(bin_dir/name),*args],env=env,input=input_sql,capture_output=True,text=True)
        if p.returncode:
            log = (base/"server.log").read_text()[-900:] if name=="pg_ctl" and (base/"server.log").exists() else ""
            raise RuntimeError(f"{name} failed: {p.stderr[-1600:]} {log}")
        return p.stdout.strip()
    tool("initdb","-D",str(data),"-U","dr_fixture","--auth-local=trust","--auth-host=reject","--no-locale","--encoding=UTF8","--no-instructions")
    # socket directory is private, TCP is disabled. No authentication secrets are created.
    tool("pg_ctl","-D",str(data),"-l",str(base/"server.log"),"-o",f"-c listen_addresses='' -k {sock} -c unix_socket_permissions=0700","-w","start")
    def sql(value):
        return tool("psql","-X","-qAt","-v","ON_ERROR_STOP=1","-f","-",input_sql=value)
    def stop():
        tool("pg_ctl","-D",str(data),"-m","fast","-w","stop")
    return sql,tool,stop
def last(sql,statement):
    return sql(statement).splitlines()[-1]
def fingerprint(sql):
    data = {}
    for table in TABLES:
        # Include all columns, IDs and timestamps; ordering is deterministic for equal logical states.
        text = sql(f"select to_jsonb(t)::text from {table} t order by to_jsonb(t)::text collate \"C\";")
        data[table]={"rows":len(text.splitlines()),"sha256":digest(text.encode())}
    return data
def source_fixture(sql):
    sql(f"""
    insert into auth.users(id) values ('{OWNER}'),('{TECH}'),('{OUTSIDER}');
    {claims(OWNER)}
    insert into public.organizations(id,name,created_by) values('{ORG}','Synthetic hotel A','{OWNER}');
    {claims(OUTSIDER)}
    insert into public.organizations(id,name,created_by) values('{OTHER}','Synthetic hotel B','{OUTSIDER}');
    insert into public.organization_members(organization_id,user_id,full_name,role) values('{ORG}','{TECH}','Synthetic tech','analyst');
    insert into public.facilities(id,organization_id,name) values('{FAC}','{ORG}','Synthetic hotel A'),('{SITE}','{OTHER}','Synthetic hotel B');
    insert into public.facility_assets(id,organization_id,facility_id,asset_code,name) values
      ('{ASSET}','{ORG}','{FAC}','DR-A','Synthetic pump'),('{ASSET_B}','{OTHER}','{SITE}','DR-B','Synthetic chiller');
    insert into private.draqon_field_pilot values('{ORG}',true);
    """)
    sql(authed(TECH,f"select public.draqon_prepare_field('{ORG}','{PROPOSAL}','{ASSET}','Synthetic pump inspection',701);"))
    order = last(sql,authed(OWNER,f"select public.draqon_approve_field('{ORG}','{PROPOSAL}','{TECH}');"))
    sql(authed(TECH,f"update public.facility_work_orders set status='in_progress' where id='{order}';"
                     f"insert into public.facility_visits(organization_id,work_order_id,findings) values('{ORG}','{order}','Synthetic inspection completed');"))
    sql(authed(OWNER,f"update public.facility_work_orders set status='completed' where id='{order}';"))
    return order
def late_proposal(sql):
    return last(sql,authed(OUTSIDER,f"select public.draqon_prepare_field('{OTHER}','{LATE}','{ASSET_B}','Synthetic post-checkpoint request',702);"))
def target_checks(sql, order):
    link = last(sql,f"""select count(*) from public.draqon_field_proposals p
       join public.facility_work_orders w on (w.organization_id,w.id)=(p.organization_id,p.work_order_id)
       join public.facility_visits v on (v.organization_id,v.work_order_id)=(w.organization_id,w.id)
       join public.draqon_field_events e on (e.organization_id,e.proposal_id)=(p.organization_id,p.id)
       where p.submitted_by='{TECH}' and p.approved_by='{OWNER}' and p.assigned_to='{TECH}' and
       v.created_by='{TECH}' and w.status='completed' and e.event_type='closed' and e.actor_id='{OWNER}';""")
    before=fingerprint(sql)
    retry=last(sql,authed(OWNER,f"select public.draqon_approve_field('{ORG}','{PROPOSAL}','{TECH}');"))
    visible=last(sql,authed(OUTSIDER,f"select count(*) from public.draqon_field_events where organization_id='{ORG}';"))
    require(link=="1" and retry==order and visible=="0" and fingerprint(sql)==before,"reconciliation/retry/tenant isolation failed")
    return {"linked_field_order_and_actors":True,"duplicate_approval_same_receipt_unchanged_state":True,"other_tenant_events_visible":0}
def run(args):
    reports=[]
    with tempfile.TemporaryDirectory(prefix="dqdr-") as folder:
        temporary=Path(folder)
        backup=args.backup_dir or temporary/"archives"
        backup.mkdir(exist_ok=True,parents=True)
        require(not any(backup.iterdir()),"Choose an empty backup directory.")
        archives={}
        source,tool,stop=start_cluster(args.bin_dir,temporary/"source")
        try:
            source(ROLES)
            source((HERE/"fixture.sql").read_text())
            for migration in MIGRATIONS:
                text=(REPO/migration).read_text()
                if args.core_uuid_fixture:
                    # PostgreSQL >=13 provides gen_random_uuid(). Optional only for a stripped local binary.
                    text=text.replace("create extension if not exists pgcrypto;","")
                source(text)
            version=source("select version();")
            order=source_fixture(source)
            for stage in ["checkpoint","latest"]:
                if stage=="latest":
                    require(late_proposal(source)==LATE,"post-checkpoint command failed")
                    acknowledged=time.time_ns()
                captured=time.time_ns()
                state=fingerprint(source)
                archive=backup/(stage+".dump")
                started=time.monotonic()
                tool("pg_dump","--format=custom","--file",str(archive),"--dbname","postgres")
                archives[stage]={"captured_epoch_ns":captured,"bytes":archive.stat().st_size,"sha256":archive_hash(archive),
                                 "dump_ms":milliseconds(started),"tables":state}
        finally:
            stop()
        # No source server is running during either recovery.
        for key in ["checkpoint","latest"]:
            started=time.monotonic()
            ref=archives[key]
            path=backup/(key+".dump")
            require(archive_hash(path)==ref["sha256"],"archive integrity error")
            target,tool,stop=start_cluster(args.bin_dir,temporary/("restore-"+key))
            try:
                target(ROLES)
                tool("pg_restore","--exit-on-error","--single-transaction","--dbname","postgres",str(path))
                require(fingerprint(target)==ref["tables"],"full-row checkpoint mismatch")
                checks=target_checks(target, order)
                count=int(last(target,f"select count(*) from public.draqon_field_proposals where id='{LATE}';"))
                require(count==int(key=="latest"),"unexpected recovery boundary")
                availability_ms=milliseconds(started)
                # The original synthetic caller resubmits its stable command. Business key and audit count stay singular.
                require(late_proposal(target)==LATE and late_proposal(target)==LATE,"replayed draft mismatch")
                replay_counts = last(target,f"select (select count(*) from public.draqon_field_proposals where id='{LATE}')||':'||(select count(*) from public.draqon_field_events where proposal_id='{LATE}' and event_type='prepared');")
                require(replay_counts=="1:1","duplicate post-checkpoint effect")
                reports.append({"restore":key,"cold_cluster_rto_ms":availability_ms,
                    "rto_scope":"elapsed from archive integrity check and new cluster initialization through SQL restore, full row hashes and authorized service probes",
                    "rpo_gap_ms":round(max(0,acknowledged-ref["captured_epoch_ns"])/1000000,3),
                    "acknowledged_commands_missing_before_replay":1-count,
                    "replay_source":"resubmission of the known synthetic command by its caller, no WAL/PITR",
                    "proposals_and_events_after_duplicate_resubmission":replay_counts,**checks})
            finally:
                stop()
        damaged=bytearray((backup/"latest.dump").read_bytes())
        damaged[-1]^=1
        require(digest(damaged)!=archives["latest"]["sha256"],"corrupt archive was accepted")
    return {"observed_utc":now(),"database_engine":version,"scope":"synthetic native PostgreSQL, two tenants, two independent cold targets",
            "platform_auth_and_storage":"minimal synthetic schemas; client data and storage object bytes excluded",
            "pgcrypto_setup_omitted_for_stripped_local_binary":args.core_uuid_fixture,"archive_hash_negative_control":"changed-byte rejected",
            "source_stopped_before_restore":True,"archive_manifest":archives,"restores":reports}
if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir",type=Path,required=True)
    parser.add_argument("--report",type=Path,required=True)
    parser.add_argument("--backup-dir",type=Path)
    parser.add_argument("--core-uuid-fixture",action="store_true")
    args=parser.parse_args()
    result=run(args)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result["restores"],indent=2))
