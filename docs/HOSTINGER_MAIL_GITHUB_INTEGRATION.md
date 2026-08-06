# Hostinger Mail ↔ GitHub operational bridge

## Decision

This integration is intentionally one-way: **GitHub → Hostinger Mail**.

The repository is public, so incoming client emails, names, phone numbers, attachments, and message bodies must never be copied into GitHub Issues or Actions logs. The bridge sends operational alerts only when the `Static Site Checks` workflow fails, plus a manual test notification through `workflow_dispatch`.

## Files

- `.github/workflows/hostinger-mail-notifications.yml`
- `scripts/send_hostinger_notification.py`
- `scripts/test_send_hostinger_notification.py`

## Required GitHub configuration

In **Settings → Secrets and variables → Actions**, add:

### Repository secrets

- `HOSTINGER_SMTP_USERNAME`: `info@osoulhospitality.com`
- `HOSTINGER_SMTP_PASSWORD`: the mailbox password from Hostinger; never commit it.

### Repository variable

- `OPS_NOTIFICATION_TO`: the internal destination for alerts, recommended `osoulhospitality@gmail.com`.

The script defaults to Hostinger's documented TLS/STARTTLS configuration:

- Host: `smtp.hostinger.com`
- Port: `587`
- Username: the complete mailbox address.

Official references:

- Hostinger SMTP settings: https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/
- GitHub Actions secrets: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

## Activation test

1. Merge this PR.
2. Add both repository secrets and the destination variable.
3. Open **Actions → Hostinger Mail Notifications → Run workflow**.
4. Confirm one message reaches `OPS_NOTIFICATION_TO`.
5. Confirm no secret value appears in the workflow logs.
6. Rotate the mailbox password immediately if it is ever exposed outside Hostinger or GitHub Secrets.

## Security controls

- The workflow checks out `main`, not untrusted pull-request code.
- It runs automatically only after a failed `Static Site Checks` run.
- It uses Python's standard SMTP library and no third-party mail action.
- The email contains repository, workflow, conclusion, branch, and run URL only.
- Client PII remains in the mail/CRM layer, not the public repository.
