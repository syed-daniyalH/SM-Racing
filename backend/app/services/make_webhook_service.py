from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.core.config import get_settings
from app.models.submission import Submission
from app.services.submission_payload_service import get_session_payload, to_isoformat


settings = get_settings()


def build_make_payload(submission: Submission) -> dict[str, Any]:
    run_group_value = None
    if submission.run_group is not None:
        run_group_value = submission.run_group.normalized.value if hasattr(submission.run_group.normalized, "value") else submission.run_group.normalized

    driver_code = submission.driver.driver_id if submission.driver is not None else None
    vehicle_code = submission.vehicle.vehicle_id if submission.vehicle is not None else None
    session_payload = get_session_payload(submission.payload)
    analysis_payload = submission.analysis_result if isinstance(submission.analysis_result, dict) else {}

    return {
        "submissionId": submission.submission_ref,
        "status": submission.status.value if hasattr(submission.status, "value") else submission.status,
        "submittedAt": to_isoformat(submission.created_at),
        "updatedAt": to_isoformat(submission.updated_at),
        "eventId": str(submission.event_id),
        "runGroup": run_group_value,
        "runGroupCode": run_group_value,
        "driverId": str(submission.driver_id) if submission.driver_id else None,
        "vehicleId": str(submission.vehicle_id) if submission.vehicle_id else None,
        "driverCode": driver_code,
        "vehicleCode": vehicle_code,
        "createdById": str(submission.created_by_id) if submission.created_by_id else None,
        "raw_text": submission.raw_text,
        "image": submission.image_url,
        "data": session_payload,
        "analysis_result": analysis_payload,
        "event": {
            "id": str(submission.event.id) if submission.event is not None else str(submission.event_id),
            "name": submission.event.name if submission.event is not None else None,
            "track": submission.event.track if submission.event is not None else None,
            "startDate": to_isoformat(submission.event.start_date) if submission.event is not None else None,
            "endDate": to_isoformat(submission.event.end_date) if submission.event is not None else None,
        },
        "runGroupDetail": {
            "id": str(submission.run_group.id) if submission.run_group is not None else str(submission.run_group_id),
            "rawText": submission.run_group.raw_text if submission.run_group is not None else None,
            "normalized": run_group_value,
            "locked": submission.run_group.locked if submission.run_group is not None else None,
        },
        "driver": {
            "id": str(submission.driver.id) if submission.driver is not None else (str(submission.driver_id) if submission.driver_id else None),
            "driverCode": driver_code,
            "name": submission.driver.driver_name if submission.driver is not None else None,
            "firstName": submission.driver.first_name if submission.driver is not None else None,
            "lastName": submission.driver.last_name if submission.driver is not None else None,
            "teamName": submission.driver.team_name if submission.driver is not None else None,
        },
        "vehicle": {
            "id": str(submission.vehicle.id) if submission.vehicle is not None else (str(submission.vehicle_id) if submission.vehicle_id else None),
            "vehicleCode": vehicle_code,
            "make": submission.vehicle.make if submission.vehicle is not None else None,
            "model": submission.vehicle.model if submission.vehicle is not None else None,
            "year": submission.vehicle.year if submission.vehicle is not None else None,
            "class": submission.vehicle.vehicle_class if submission.vehicle is not None else None,
            "registrationNumber": submission.vehicle.registration_number if submission.vehicle is not None else None,
        },
        "notes": {
            "rawText": submission.raw_text,
            "imageUrl": submission.image_url,
        },
        "analysis": analysis_payload,
        "session": session_payload,
        "payload": session_payload,
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
