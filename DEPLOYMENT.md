# Osool Hospitality Deployment

Last updated: 2026-08-06 UTC

## Production Status

The verified production website is live on the official domain:

- https://osoulhospitality.com
- https://www.osoulhospitality.com redirects to https://osoulhospitality.com/

Hostinger is the active production hosting path for the official domain.

## Validation Completed

- Official apex domain: HTTP 200 over HTTPS
- `www` hostname: redirects to apex and returns HTTP 200
- Key routes checked:
  - `/`
  - `/solutions/`
  - `/contact/`
  - `/command-center/`
  - `/robots.txt`
  - `/sitemap.xml`
- PHP contact handler exists and rejects GET with `405 Allow: POST`
- Empty POST redirects safely to `/contact/?status=incomplete#project-brief`
- Complete production POST test redirects to `/thank-you/`
- Security headers present on Hostinger responses:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
  - `X-Frame-Options: SAMEORIGIN`
  - `Cross-Origin-Opener-Policy: same-origin`

## Contact Form Verification

A single production verification submission was sent through `submit.php` using test data:

- Name: `Codex Verification`
- Organization: `Osool Hospitality Website QA`
- Email: `info@osoulhospitality.com`
- Result: `303` redirect to `/thank-you/`, followed by `200` on the thank-you page

This confirms the visitor flow reaches the success page. Delivery to the mailbox should be confirmed from the `info@osoulhospitality.com` inbox.

## Sites Deployment

A public Sites deployment also exists as a secondary accessible deployment:

- https://osoul-hospitality.zezo-9262.chatgpt.site

The official custom domain is not attached to Sites. Pending custom-domain records were removed from Sites to avoid confusion because the official production domain is served by Hostinger.

## Operational Notes

- `robots.txt` points to `https://osoulhospitality.com/sitemap.xml`.
- Dotfiles such as `/.osool-release.json` return `403 Forbidden` on Hostinger, which is acceptable and safer for public hosting.
- Keep source, deployment notes, and release changes synchronized in this repository before future uploads to Hostinger.
