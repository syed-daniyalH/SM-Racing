from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.core.config import get_settings
from app.models.submission import Submission


settings = get_settings()


def build_make_payload(submission: Submission) -> dict[str, Any]:
    run_group_value = None
    if submission.run_group is not None:
        run_group_value = submission.run_group.normalized.value if hasattr(submission.run_group.normalized, "value") else submission.run_group.normalized

    return {
        "submissionId": submission.submission_ref,
        "eventId": str(submission.event_id),
        "runGroup": run_group_value,
        "raw_text": submission.raw_text,
        "image": submission.image_url,
        "data": submission.payload,
        "status": submission.status.value if hasattr(submission.status, "value") else submission.status,
    }


def send_submission_to_make(submission: Submission) -> None:
    if not settings.make_webhook_url:
        return

    payload = build_make_payload(submission)
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        settings.make_webhook_url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=8) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Webhook responded with status {response.status}")
    except error.URLError as exc:
        raise RuntimeError(f"Webhook forwarding failed: {exc}") from exc
