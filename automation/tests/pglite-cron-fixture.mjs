// The WASM engine cannot load the native pg_cron worker. Exercise the SQL
// registration against a scoped registry here. Real scheduling runs in Supabase CI.
export async function installCronFixture(db) {
  await db.exec(`
    create schema cron;
    create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
    create function cron.unschedule(bigint) returns void language sql as $$delete from cron.job where jobid=$1$$;
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
  `);
}

export function useFixtureCron(sql) {
  return sql
    .replace('create extension if not exists pg_cron with schema pg_catalog;', "select 'cron.job'::regclass;")
    .replace("execute 'create extension pg_cron'", "perform 'cron.job'::regclass");
}
