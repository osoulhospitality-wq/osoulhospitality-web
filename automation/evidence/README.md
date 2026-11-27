# Migration reconciliation evidence

`production-migrations-20261127.json` records the production migration history and the adoption-check results for the #91 release. The check is read-only: it does not connect to any database and does not execute SQL.

## Reproduce

```sh
# Migrations as published with PR #91 (not committed to this branch)
git archive 05734620a8190997e3c485b1715df26f47df7bcb supabase/migrations | tar -x -C /tmp/pr91
node scripts/check-migration-reconciliation.mjs \
  --migrations-dir /tmp/pr91/supabase/migrations \
  --evidence automation/evidence/production-migrations-20261127.json
node --test automation/tests/migration-reconciliation.test.mjs
```

Exit code 1 means at least one check failed. The check reports these as FAIL and does not hide them.

## What the recorded evidence says

- `applied`: observed by SELECT on `supabase_migrations.schema_migrations`. All 14 release-91 migrations are present under their exact versions. `bootstrap_enterprise_foundation` (20261125190000) is absent.
- Two facility migrations are applied under versions that differ from the repository (`20261125193457`, `20261125231431` against `20261125193000`, `20261125232000`).
- RLS, policy digest and five helper pins: user-reported as passing. Not reproduced by this session.
- `bootstrap_org_owner`: user-reported as failing the full read-only adoption block with SQLSTATE 55000 (observed md5 `365b4af093c127ff713f80dc53fd21d1`, pinned `6c120a16cbc349bf4744d1622634a945`). The user compared the two source bodies by hand and found whitespace-only differences outside literals. That equivalence is not machine-verified, so the check treats the mismatch as a FAIL.

## Gap

The strongest remaining gap is that the adoption block has not been run against production. A whitespace-normalised comparison of the `bootstrap_org_owner` body would settle whether the pin or the production body should change. Any such change needs a reviewed migration; it should not be made by editing the evidence file.
