#!/usr/bin/env python3
"""Send operational GitHub notifications through Hostinger SMTP."""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Mapping


def required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def build_message(
    sender: str,
    recipient: str,
    subject: str,
    body: str,
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = f"Osool Hospitality <{sender}>"
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    return message


def notification_content(env: Mapping[str, str]) -> tuple[str, str]:
    repository = env.get("GITHUB_REPOSITORY", "unknown repository")
    event_name = env.get("GITHUB_EVENT_NAME", "workflow_dispatch")
    workflow_name = env.get("WORKFLOW_NAME", "").strip() or "Manual notification test"
    conclusion = env.get("WORKFLOW_CONCLUSION", "").strip() or "manual"
    workflow_url = env.get("WORKFLOW_URL", "").strip() or "Not available"
    branch = env.get("WORKFLOW_BRANCH", "").strip() or "Not available"

    if event_name == "workflow_dispatch":
        subject = f"[Osool GitHub] Mail bridge test — {repository}"
    else:
        subject = f"[Osool GitHub] {workflow_name}: {conclusion}"

    body = (
        "Osool Hospitality — GitHub operational notification\n\n"
        f"Repository: {repository}\n"
        f"Workflow: {workflow_name}\n"
        f"Conclusion: {conclusion}\n"
        f"Branch: {branch}\n"
        f"Run: {workflow_url}\n\n"
        "This notification contains operational metadata only. "
        "Client email content and personal data are intentionally excluded."
    )
    return subject, body


def send_notification(
    env: Mapping[str, str] | None = None,
    smtp_factory=smtplib.SMTP,
) -> None:
    env = os.environ if env is None else env
    username = required(env, "HOSTINGER_SMTP_USERNAME")
    password = required(env, "HOSTINGER_SMTP_PASSWORD")
    recipient = env.get("OPS_NOTIFICATION_TO", "").strip() or username
    host = env.get("HOSTINGER_SMTP_HOST", "smtp.hostinger.com").strip()
    port = int(env.get("HOSTINGER_SMTP_PORT", "587"))

    subject, body = notification_content(env)
    message = build_message(username, recipient, subject, body)

    context = ssl.create_default_context()
    with smtp_factory(host, port, timeout=30) as client:
        client.ehlo()
        client.starttls(context=context)
        client.ehlo()
        client.login(username, password)
        client.send_message(message)


if __name__ == "__main__":
    send_notification()
