# Osool Hospitality Deployment

Last updated: 2026-08-08 UTC

## Website v15 — CRM, consent-first analytics and enterprise security

Version 14 adds a production-ready bilingual content system: 40 Arabic articles and 40 matched English article pages across five tracks (licensing and compliance, performance and profitability, revenue and sales, development and opening, and ownership/technology/governance). The library includes full-text search, category filters, canonical URLs, reciprocal `hreflang`, Article and breadcrumb structured data, source references and related reading.

The English site is no longer a single landing page. It now includes complete routes for services, outputs, about, decision scenarios, insights, contact, privacy, terms, accessibility and confirmation. The contact handler preserves the visitor's language for validation and success redirects.

The v15 layer retains the bilingual editorial system and adds opt-in HubSpot analytics, a persistent privacy-settings control, Global Privacy Control support, a stronger licensing-claim gate, and the Supabase enterprise activation path with database-enforced MFA.

Local release evidence for v15:

- `796` content, bilingual, SEO, claims, form, analytics and enterprise-security assertions passed.
- `108` HTML files passed the internal-link resolver.
- All generated Arabic and English library pages passed `html-validate`.
- Existing Python notification tests and Dragon workflow tests passed.
- PHP runtime syntax and live delivery must be rechecked on Hostinger after deployment because PHP is not installed in the local build container.
- Live production rendering, consent controls and enterprise-login routing were rechecked in the cloud browser on 2026-08-08 UTC.

## Website v13 — Integrated Tourism Advisory House

The public website now positions Osool Hospitality as a Saudi tourism advisory house combining advisory, execution and intelligence. The home page presents the full lifecycle proposition, six core capability groups, three client journeys and the Advisory–Execution–Intelligence operating model. The services page contains eight complete service families covering strategy, feasibility, licensing, compliance, development, pre-opening, operations, profitability, revenue, sales, owner representation, facilities, people and digital transformation. Arabic copy, calls to action, metadata and brand descriptors were aligned to the new positioning. No licensing claim is published unless a current licence is evidenced and approved for disclosure.

## Command Center Public Pilot v13

The dashboard reads the public `dragon-task` issue ledger from the project repository and is explicitly classified as a public pilot for sanitized data only. It paginates issue and comment reads, detects conflicting workflow labels, qualifies KPI definitions, highlights overdue or stale work, formats Dragon responses safely, and requires the user to confirm that a new request contains no sensitive data before the authenticated GitHub handoff.

This release is **not approved for real client, supplier, contract, pricing, personal, or confidential information**. Enterprise activation requires Supabase Auth, enforced MFA, verified RLS, private storage, database-generated audit events, retention controls, backup restoration, and negative authorization testing.

## Production Status

The verified production website is live on the official domain:

- https://osoulhospitality.com
- https://www.osoulhospitality.com redirects to https://osoulhospitality.com/

Hostinger is the active production hosting path for the official domain. Do not move the official custom domain to the secondary Sites deployment unless a future migration is intentionally approved.

## Validation Completed

Latest live verification: 2026-08-08 10:07 UTC.

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

## Consent-first Analytics Verification

HubSpot EU1 analytics was verified against production portal `149059794` on 2026-08-08 UTC.

- Before a visitor decision, no HubSpot script is loaded.
- Choosing necessary-only keeps HubSpot blocked.
- Choosing analytics loads the EU1 HubSpot script set.
- CSP explicitly permits the EU1 tracking, analytics, collected-forms and banner script hosts required after consent.
- The privacy-settings control remains available after the initial decision.
- HubSpot account timezone is `Asia/Riyadh`; the account currency remains an administrative UI action to change from USD to SAR.

## Enterprise Command Center Verification

The Supabase project is active and healthy in `ap-northeast-2`. Current production evidence:

- Security advisor: zero findings.
- Private `command-center-documents` bucket: 25 MB per file with an explicit MIME allowlist.
- No `anon` table privileges for the enterprise tables.
- MFA is enforced at the database boundary through restrictive `aal2` policies.
- No owner user, organization or verified TOTP factor exists yet; the portal must not receive real client or confidential data until the first owner completes sign-in and TOTP enrollment.

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
