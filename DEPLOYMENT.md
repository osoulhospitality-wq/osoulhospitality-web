# Osool Hospitality Deployment

Last updated: 2026-08-08 UTC

## Website v13 — Integrated Tourism Advisory House

The public website now positions Osool Hospitality as a licensed Saudi tourism advisory house combining advisory, execution and intelligence. The home page presents the full lifecycle proposition, six core capability groups, three client journeys and the Advisory–Execution–Intelligence operating model. The services page contains eight complete service families covering strategy, feasibility, licensing, compliance, development, pre-opening, operations, profitability, revenue, sales, owner representation, facilities, people and digital transformation. Arabic copy, calls to action, metadata and brand descriptors were aligned to the new positioning.

## Command Center Public Pilot v13

The dashboard reads the public `dragon-task` issue ledger from the project repository and is explicitly classified as a public pilot for sanitized data only. It paginates issue and comment reads, detects conflicting workflow labels, qualifies KPI definitions, highlights overdue or stale work, formats Dragon responses safely, and requires the user to confirm that a new request contains no sensitive data before the authenticated GitHub handoff.

This release is **not approved for real client, supplier, contract, pricing, personal, or confidential information**. Enterprise activation requires Supabase Auth, enforced MFA, verified RLS, private storage, database-generated audit events, retention controls, backup restoration, and negative authorization testing.

## Production Status

The verified production website is live on the official domain:

- https://osoulhospitality.com
- https://www.osoulhospitality.com redirects to https://osoulhospitality.com/

Hostinger is the active production hosting path for the official domain. Do not move the official custom domain to the secondary Sites deployment unless a future migration is intentionally approved.

## Validation Completed

Latest live verification: 2026-08-07 15:34 UTC.

- Official apex domain: HTTP 200 over HTTPS
- `www` hostname: redirects to apex and returns HTTP 301
- Host headers confirm Hostinger production path:
  - `platform: hostinger`
  - `panel: hpanel`
  - `server: hcdn`
- Key routes checked:
  - `/`
  - `/contact/`
  - `/command-center/`
  - `/command-center/app/`
  - `/sitemap.xml`
- PHP contact handler rejects GET with `405 Allow: POST`
- Invalid/incomplete POST redirects safely to `/contact/?status=incomplete#project-brief`
- Complete production POST redirects to `/thank-you/`
- Security headers present on Hostinger responses:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
  - `X-Frame-Options: SAMEORIGIN`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Strict-Transport-Security`

## Contact Form Verification

A fresh production verification submission was sent through `submit.php` using non-sensitive QA data.

- Result: `303` redirect to `/thank-you/`
- Mailbox: `info@osoulhospitality.com`
- Delivery confirmed in Hostinger Mail: UID `12`
- Received at: `2026-08-07T15:34:32Z`
- Sender shown: `Osool Website <info@osoulhospitality.com>`

This confirms the visitor flow reaches the success page and the email reaches the production mailbox.

## Sites Deployment

A public Sites deployment also exists as a secondary accessible deployment:

- https://osoul-hospitality.zezo-9262.chatgpt.site

The official custom domain is not attached to Sites. Pending custom-domain records were removed from Sites to avoid confusion because the official production domain is served by Hostinger.

## n8n MCP Status

Instance-level MCP server URL shown in n8n:

- `https://osoul.app.n8n.cloud/mcp-server/http`

The screenshot shows the API key name already exists. That means key creation failed because of a duplicate name, not because MCP is disabled. Continue with OAuth connection or reuse/rename the existing API key in n8n.

## Operational Notes

- `robots.txt` points to `https://osoulhospitality.com/sitemap.xml`.
- Dotfiles such as `/.osool-release.json` return `403 Forbidden` on Hostinger, which is acceptable and safer for public hosting.
- Keep source, deployment notes, and release changes synchronized in this repository before future uploads to Hostinger.
