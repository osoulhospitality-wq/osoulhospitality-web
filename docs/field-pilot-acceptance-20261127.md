# Field pilot acceptance — 2026-11-27 (Riyadh)

## Release identity

Field Site v7, source `4b3b3215557d86cb24dadc32555f47601b8189a4`. Hosting returned succeeded. Both public enterprise pages matched the navigation release #103 (`72bc9cdb5917de962a70d54bd9547956b5e27686`) over HTTPS. Roll back the Site to saved version 6 if necessary. The pilot entry change is independent of database migrations.

## Acceptance scope

The exact rebuilt field client was served locally at a mobile viewport (390×844, Chromium). Its test configuration addressed the isolated PR 91 Supabase branch through a local forwarding test server. Authentication, TOTP, PostgREST, photo storage and review calls reached that branch. No production customer record was used.

- A synthetic assigned technician signed in, enrolled and verified TOTP, saw 28 form templates, saved an F01 draft, uploaded an image through the file input and submitted the form.
- A second synthetic user signed in with MFA, opened the record, downloaded and rendered the image, accepted the form with a reason and reloaded the accepted decision from the database.
- Two fixture users were disabled and two test sessions cleared after the run. Native camera permission, physical devices and a real tenant invitation were outside this run.
- 50 frontend unit checks passed. On the preview database the rollback suites returned 7 checks for CRM linkage, 11 for building facts, 28 for asset-cycle operations and 15 for the management desk.
- The isolated n8n candidate graph passed unauthorized sender (365), ignored event (366), duplicate (367), provider failure (368) and successful completion (369). Initial run 364 had no fixture and failed its fixture assertion. These runs use synthetic downstream nodes.
- The production host reported the field maintenance cron active and last observed successful at 17:00 Riyadh. Production had 28 templates and zero technician assignments at observation.

## Historical Supabase migration comparison

| Repository version | Applied production version | Verified comparison |
| --- | --- | --- |
| 20261125193000 add_facility_operations | 20261125193457 | Same SQL statements after removal of the repository transaction wrapper and surrounding whitespace. |
| 20261125232000 allow_phone_only_website_leads | 20261125231431 | Identical trimmed SQL text. |

These mappings explain historical identifiers. Do not replay the migrations to change a timestamp. The enterprise bootstrap adoption checks were previously validated read-only on the existing installation. This evidence does not alter either database's migration ledger. Before deployment of the SQL branch, reconcile the release runner's complete migration plan with the target ledger on a restored copy. The public navigation release does not depend on that operation.

## Launch boundary

Owner-access pilot accepted. Staff onboarding requires an identified technician, an independent reviewer, a confirmed facility and the corresponding access grants. The executive automation release remains subject to its provider recovery, correlated end-to-end evidence and restore gates.
