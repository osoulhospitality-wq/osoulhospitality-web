# Osool Hospitality Deployment

Last updated: 2026-08-06 UTC

## Production Status

The current verified production deployment is live at:

- https://osoul-hospitality.zezo-9262.chatgpt.site

Validation completed:

- Production deployment status: succeeded
- Public access: enabled
- Key routes checked: `/`, `/solutions`, `/outputs`, `/about`, `/scenarios`, `/insights`, `/contact`, `/robots.txt`, `/sitemap.xml`
- Worker errors in recent logs: none
- Build: passed
- Lint: passed
- Production metadata test: passed

## Custom Domain Status

The following custom domains have been attached to the deployment platform and are pending DNS/SSL validation:

- `osoulhospitality.com`
- `www.osoulhospitality.com`

## Hostinger DNS Records Required

Add these records in Hostinger DNS Zone for `osoulhospitality.com`.

### Apex Domain

| Type | Name / Host | Value / Target |
| --- | --- | --- |
| A | `@` | `162.159.143.30` |
| A | `@` | `172.66.3.26` |
| TXT | `_openai-site-verification` | `openai-site-verification=7V0DqANH-M7CRe9A5aECTdcnGuFvm2WPA0nbT7LiREI` |
| TXT | `_cf-custom-hostname` | `2efff8e8-e66f-4a76-8ce1-537aa581b55e` |

### WWW Subdomain

| Type | Name / Host | Value / Target |
| --- | --- | --- |
| CNAME | `www` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.www` | `openai-site-verification=LbVxLaqFY-1LFMB3ahdckMwD2Ae5RSbPG5vw_vfY8QQ` |
| TXT | `_cf-custom-hostname.www` | `28ce4dd3-9fbd-4d71-9e8c-f8e1fb492cd4` |

After DNS propagation, refresh custom domain validation in the deployment platform and verify both hostnames over HTTPS.
