from __future__ import annotations

import json
import logging
from typing import Any
from urllib import error, request

from app.core.config import get_ocr_config_status, get_settings
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.models.vehicle import Vehicle
from app.services import image_analysis_service


logger = logging.getLogger(__name__)


normalize_image_analysis_result = image_analysis_service.normalize_image_analysis_result


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None

    normalized = str(value).strip()
    return normalized or None


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _build_make_ocr_payload(
    *,
    submission: Submission,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
    preprocessing_info: dict[str, Any],
) -> dict[str, Any]:
    context = _dict_or_empty(submission.payload).get("context")
    context_map = _dict_or_empty(context)
    run_group_value = getattr(run_group, "normalized", None) or getattr(run_group, "raw_text", None)
    if hasattr(run_group_value, "value"):
        run_group_value = run_group_value.value

    return {
        "correlation_id": getattr(submission, "correlation_id", None),
        "submission_ref": submission.submission_ref,
        "ocr_preview": True,
        "force_review_staging": True,
        "raw_text": _normalize_text(submission.raw_text),
        "image_url": preprocessing_info.get("selected_image_url") or submission.image_url,
        "image": {
            "data_url": preprocessing_info.get("selected_image_url") or submission.image_url,
            "mime_type": preprocessing_info.get("mime_type"),
            "size_bytes": preprocessing_info.get("size_bytes"),
            "width": preprocessing_info.get("width"),
            "height": preprocessing_info.get("height"),
            "selected_variant": preprocessing_info.get("selected_variant") or "original",
        },
        "context": context_map,
        "event": {
            "id": str(event.id),
            "name": _normalize_text(getattr(event, "name", None)),
            "track": _normalize_text(getattr(event, "track", None)),
        },
        "run_group": {
            "id": str(run_group.id),
            "code": _normalize_text(run_group_value),
            "raw_text": _normalize_text(getattr(run_group, "raw_text", None)),
        },
        "driver": {
            "id": str(driver.id) if driver is not None else None,
            "driver_id": _normalize_text(getattr(driver, "driver_id", None)),
            "name": _normalize_text(getattr(driver, "driver_name", None)),
        },
        "vehicle": {
            "id": str(vehicle.id) if vehicle is not None else None,
            "vehicle_id": _normalize_text(getattr(vehicle, "vehicle_id", None)),
            "make": _normalize_text(getattr(vehicle, "make", None)),
            "model": _normalize_text(getattr(vehicle, "model", None)),
        },
        "requested_response_shape": "sm_racing_image_analysis",
        "requested_parser_version": image_analysis_service.IMAGE_ANALYSIS_PARSER_VERSION,
    }


def _extract_analysis_candidate(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None

    if any(
        key in payload
        for key in (
            "document_type",
            "setup",
            "status",
            "raw_evidence",
            "field_evidence",
            "confidence",
            "warnings",
            "metadata",
        )
    ):
        return payload

    for key in (
        "analysis",
        "image_analysis",
        "imageAnalysis",
        "ocr_result",
        "ocrResult",
        "result",
        "data",
        "payload",
        "structured_json",
        "structuredJson",
    ):
        candidate = payload.get(key)
        nested = _extract_analysis_candidate(candidate)
        if nested is not None:
            return nested

    return None


def _extract_error_message(payload: Any) -> str | None:
    if isinstance(payload, str):
        return _normalize_text(payload)

    if not isinstance(payload, dict):
        return None

    for key in ("message", "error", "detail"):
        value = payload.get(key)
        if isinstance(value, str) and _normalize_text(value):
            return _normalize_text(value)
        if isinstance(value, dict):
            nested_message = _extract_error_message(value)
            if nested_message:
                return nested_message

    return None


def _analyze_submission_image_via_make(
    *,
    submission: Submission,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
) -> dict[str, Any] | None:
    settings = get_settings()
    webhook_url = _normalize_text(getattr(settings, "make_ocr_webhook_url", None))
    image_url = (submission.image_url or "").strip()
    preprocessing_info = (
        image_analysis_service._preprocess_image_payload(image_url)
        if image_url
        else {"valid": False, "error": "No image file received."}
    )

    logger.info(
        "OCR analyze request routed to Make webhook: file_received=%s mime_type=%s size_bytes=%s width=%s height=%s variant=%s",
        bool(image_url),
        preprocessing_info.get("mime_type") or "unknown",
        preprocessing_info.get("size_bytes"),
        preprocessing_info.get("width"),
        preprocessing_info.get("height"),
        preprocessing_info.get("selected_variant") or "original",
    )

    if not webhook_url or not image_url:
        logger.warning(
            "Make OCR analyze request skipped: webhook_configured=%s has_image=%s",
            bool(webhook_url),
            bool(image_url),
        )
        return None

    if not preprocessing_info.get("valid"):
        logger.warning(
            "Make OCR preprocessing rejected image: error=%s mime_type=%s",
            preprocessing_info.get("error"),
            preprocessing_info.get("mime_type") or "unknown",
        )
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message=preprocessing_info.get("error") or "Image could not be prepared for OCR.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    payload = _build_make_ocr_payload(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
        preprocessing_info=preprocessing_info,
    )
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        webhook_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-SM2-OCR-Preview": "true",
            **(
                {"X-SM2-Correlation-Id": str(submission.correlation_id)}
                if getattr(submission, "correlation_id", None)
                else {}
            ),
            **({"X-SM2-Submission-Ref": submission.submission_ref} if submission.submission_ref else {}),
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=getattr(settings, "make_ocr_timeout_seconds", 20.0)) as response:
            raw_response = response.read().decode("utf-8").strip()
    except error.HTTPError as exc:
        logger.warning("Make OCR webhook responded with HTTP %s", exc.code)
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message="OCR service failed. Please retry or enter manually.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )
    except error.URLError as exc:
        logger.warning("Make OCR webhook request failed: %s", exc)
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message="OCR service failed. Please retry or enter manually.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    if not raw_response:
        logger.warning("Make OCR webhook returned an empty body")
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message="OCR service failed. Please retry or enter manually.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    try:
        parsed_response = json.loads(raw_response)
    except json.JSONDecodeError:
        logger.warning("Make OCR webhook returned non-JSON body")
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message="OCR service failed. Please retry or enter manually.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    analysis = _extract_analysis_candidate(parsed_response)
    if analysis is None:
        logger.warning("Make OCR webhook returned no analysis payload: message=%s", _extract_error_message(parsed_response))
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message=_extract_error_message(parsed_response) or "OCR service failed. Please retry or enter manually.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    normalized = normalize_image_analysis_result(analysis)
    if normalized is None:
        logger.warning("Make OCR webhook returned malformed analysis payload")
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message="OCR service failed. Please retry or enter manually.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    if not _normalize_text(normalized.get("model")):
        normalized["model"] = (
            _normalize_text(analysis.get("model"))
            or _normalize_text(parsed_response.get("model"))
            or "make.com"
        )

    if "fallback_model_used" not in normalized:
        normalized["fallback_model_used"] = False

    logger.info(
        "Make OCR normalized: status=%s doc_type=%s confidence=%s",
        normalized.get("status"),
        normalized.get("document_type"),
        normalized.get("confidence"),
    )
    return normalized


def analyze_submission_image(
    *,
    submission: Submission,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
) -> dict[str, Any] | None:
    settings = get_settings()
    ocr_config = get_ocr_config_status(settings)

    if ocr_config["provider"] == "make_webhook":
        return _analyze_submission_image_via_make(
            submission=submission,
            event=event,
            run_group=run_group,
            driver=driver,
            vehicle=vehicle,
        )

    return image_analysis_service.analyze_submission_image(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
    )
