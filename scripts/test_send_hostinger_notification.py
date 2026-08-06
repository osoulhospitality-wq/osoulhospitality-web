import unittest
from email.message import EmailMessage

from scripts.send_hostinger_notification import (
    build_message,
    notification_content,
    required,
)


class HostingerNotificationTests(unittest.TestCase):
    def test_required_rejects_missing_secret(self):
        with self.assertRaisesRegex(RuntimeError, "HOSTINGER_SMTP_PASSWORD"):
            required({}, "HOSTINGER_SMTP_PASSWORD")

    def test_build_message_uses_expected_headers(self):
        message = build_message(
            "info@osoulhospitality.com",
            "ops@example.com",
            "Subject",
            "Body",
        )
        self.assertIsInstance(message, EmailMessage)
        self.assertEqual(message["To"], "ops@example.com")
        self.assertEqual(message["Subject"], "Subject")
        self.assertIn("info@osoulhospitality.com", message["From"])

    def test_failure_notification_excludes_client_data(self):
        subject, body = notification_content(
            {
                "GITHUB_REPOSITORY": "osoulhospitality-wq/osoulhospitality-web",
                "GITHUB_EVENT_NAME": "workflow_run",
                "WORKFLOW_NAME": "Static Site Checks",
                "WORKFLOW_CONCLUSION": "failure",
                "WORKFLOW_URL": "https://github.com/example/run/1",
                "WORKFLOW_BRANCH": "feature",
            }
        )
        self.assertIn("failure", subject)
        self.assertIn("operational metadata only", body)
        self.assertNotIn("email body", body.lower())


if __name__ == "__main__":
    unittest.main()
