# Isolated PostgreSQL security regression

This suite executes the repository's unchanged enterprise schema in fresh, disposable PostgreSQL databases. It compares the baseline with `prepared_hardening.sql`. **The hardening is prepared and locally tested; it is not a production migration applied to Supabase.**

## Run on a normal development machine

Requires PostgreSQL 16+ binaries (server, initdb, pg_ctl, psql, pgcrypto extension), Python 3, a non-root OS user, and an available loopback TCP port. No package from PyPI is needed.

```bash
PG_TEST_BIN=/usr/lib/postgresql/16/bin \
python security-tests/run_sql_security.py --output /tmp/osoul-security-results
```

If share files are relocated, also set `PG_TEST_SHARE`. The script creates a fresh temporary cluster, creates synthetic users in an **auth stub table**, listens on 127.0.0.1 only with Unix sockets disabled, starts separate baseline/hardened databases, exercises SQL as the NOSUPERUSER `authenticated` role, stops the server, and removes the cluster. It does not accept a remote database URL or Supabase credentials. All case mutations run in rolled-back transactions. Auth role names and fixture email addresses are synthetic. Output contains raw synthetic SQL only.

## What this proves

- Actual PostgreSQL RLS enforcement, including an assertion that current_user is authenticated, rolsuper=false, and row_security_active=true.
- Two-organization isolation, AAL1/AAL2 claim gates, inactive membership, owner/approver/analyst/viewer permissions, cross-organization foreign keys, storage SQL policies, and audit write/read boundaries.
- Six baseline failures reproduced and blocked by prepared hardening: cross-organization assignee; inactive assignee; requester impersonation on update; analyst inserting an already-approved approval; approver impersonating another decision maker; authenticated TRUNCATE privileges bypassing row RLS.
- The last case explicitly models **live-observed grants** in the isolated cluster. The repository schema itself does not grant TRUNCATE. Direct SQL capability is not proof that public REST exposes a TRUNCATE endpoint.

## What this does not prove

The local engine is PostgreSQL 16.15 while the observed production engine is PostgreSQL 17. Auth UID and JWT claims are stubs: no real Supabase JWT signatures, MFA enrollment, session revocation, PostgREST, Storage API/signed URLs, browser logins, backups, third-party integrations, or tenant customer portals are tested here. Storage object policies run against a stub schema, not the Supabase service. Standard schema-level organization isolation does not implement customer/building-specific access inside the same organization.

In this work environment only, official Ubuntu PostgreSQL binaries were unpacked under a scratch runtime; the container maps only UID0. A process-local UID/stat shim allowed initdb/server execution without changing SQL or PostgreSQL binaries. AF_UNIX sockets are blocked; AF_INET loopback is available. An early single-user experiment was discarded because standalone mode bypassed RLS. **Final results use a normal PostgreSQL server with psql, not single-user mode.** Re-run on an ordinary unprivileged staging host before production rollout.

## Prepared migration scope and promotion

The additive script removes TRUNCATE/TRIGGER/REFERENCES from known business tables, validates new/reassigned assignees, freezes requester identity, requires initial approvals to be pending, attributes decisions to the acting approver at server time, freezes approval subject/requester, and removes one duplicate owner-bootstrap trigger. It does not introduce grants, users, customer roles, or broaden access. It is idempotent and has preflight checks; invalid existing assignments or inconsistent pending approvals abort the transaction.

Promotion checklist: capture schema/function/grant definitions and verified backup; run full suite against PostgreSQL17/Supabase staging; inspect production drift and existing records; test real JWT/MFA and API flows with synthetic organizations; apply as one transaction during a controlled change; run post-change acceptance. Never automatically revert to excessive privileges. If application compatibility fails, roll back the uncommitted migration; after commit, use the reviewed prior schema definitions or a corrective migration from the backup snapshot, with a new test run. Do not delete business records to pass preflight.

Remaining design decisions: a service partner outside the organization cannot be assigned through this basic member-based guard until a contract-scoped partner model is implemented. Existing assignments to subsequently deactivated people remain as history; reassignment to them is rejected. Polymorphic approval `entity_type/entity_id` is not yet a same-organization foreign key: add an approved entity registry or typed references before using approval records as executable authority. A database approval row alone must not trigger spending or contract signature.
