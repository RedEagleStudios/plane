# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for outgoing webhook delivery failures.

Failed deliveries must alert the configured Discord channel and keep the
webhook active instead of silently disabling it.
"""

from unittest.mock import MagicMock, patch

import pytest
import requests

from plane.bgtasks.webhook_task import webhook_send_task
from plane.db.models import Webhook, WebhookLog
from plane.tests.factories import WorkspaceFactory

DISCORD_URL = "https://discord.example/api/webhooks/1/token"


@pytest.fixture
def webhook(db):
    workspace = WorkspaceFactory()
    return Webhook.objects.create(workspace=workspace, url="https://receiver.example/hook", issue=True)


def _send(webhook):
    return webhook_send_task.apply(
        kwargs={
            "webhook_id": str(webhook.id),
            "slug": webhook.workspace.slug,
            "event": "issue",
            "event_data": {"id": "issue-1"},
            "action": "PATCH",
            "current_site": "https://plane.example",
            "activity": None,
        }
    )


def _response(status_code, text=""):
    response = MagicMock()
    response.status_code = status_code
    response.ok = 200 <= status_code < 400
    response.text = text
    response.headers = {}
    return response


@pytest.mark.unit
class TestWebhookDeliveryFailure:
    def test_exhausted_retries_alert_once_and_keep_webhook_active(self, webhook, settings):
        settings.WEBHOOK_FAILURE_DISCORD_WEBHOOK_URL = DISCORD_URL
        with (
            patch(
                "plane.bgtasks.webhook_task.pinned_fetch",
                side_effect=requests.ConnectionError("connection refused"),
            ) as fetch,
            patch("plane.bgtasks.webhook_task.requests.post") as discord_post,
        ):
            _send(webhook)

        assert fetch.call_count == webhook_send_task.max_retries + 1
        assert WebhookLog.objects.filter(webhook=webhook.id).count() == webhook_send_task.max_retries + 1
        webhook.refresh_from_db()
        assert webhook.is_active is True
        discord_post.assert_called_once()
        url = discord_post.call_args.args[0]
        body = discord_post.call_args.kwargs["json"]
        assert url == DISCORD_URL
        assert "ConnectionError: connection refused" in body["content"]
        assert f"attempts: {webhook_send_task.max_retries + 1}" in body["content"]
        assert body["allowed_mentions"] == {"parse": []}

    def test_error_response_alerts_without_retry(self, webhook, settings):
        settings.WEBHOOK_FAILURE_DISCORD_WEBHOOK_URL = DISCORD_URL
        with (
            patch(
                "plane.bgtasks.webhook_task.pinned_fetch",
                return_value=_response(500, "Discord delivery failed"),
            ) as fetch,
            patch("plane.bgtasks.webhook_task.requests.post") as discord_post,
        ):
            _send(webhook)

        fetch.assert_called_once()
        discord_post.assert_called_once()
        assert "HTTP 500: Discord delivery failed" in discord_post.call_args.kwargs["json"]["content"]

    def test_successful_delivery_does_not_alert(self, webhook, settings):
        settings.WEBHOOK_FAILURE_DISCORD_WEBHOOK_URL = DISCORD_URL
        with (
            patch("plane.bgtasks.webhook_task.pinned_fetch", return_value=_response(200, "OK")),
            patch("plane.bgtasks.webhook_task.requests.post") as discord_post,
        ):
            _send(webhook)

        discord_post.assert_not_called()

    def test_alert_failure_does_not_retry_delivery(self, webhook, settings):
        settings.WEBHOOK_FAILURE_DISCORD_WEBHOOK_URL = DISCORD_URL
        with (
            patch("plane.bgtasks.webhook_task.pinned_fetch", return_value=_response(502)) as fetch,
            patch(
                "plane.bgtasks.webhook_task.requests.post",
                side_effect=requests.ConnectionError("discord down"),
            ),
        ):
            result = _send(webhook)

        fetch.assert_called_once()
        assert result.successful()
