from __future__ import annotations

import base64
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


MAKE_SETUP_CORNERS = ("LF", "RF", "LR", "RR")
ALIGNMENT_CORNER_SUFFIX = {
    "LF": "fl",
    "RF": "fr",
    "LR": "rl",
    "RR": "rr",
}
SHOCK_SETUP_CORNER_SUFFIX = {
    "LF": "lf",
    "RF": "rf",
    "LR": "lr",
    "RR": "rr",
}


def _extension_for_mime_type(mime_type: Any) -> str:
    normalized_mime = _normalize_text(mime_type)
    if normalized_mime == "image/jpg":
        normalized_mime = "image/jpeg"

    return {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
    }.get(normalized_mime or "", "bin")


def _is_make_setup_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False

    schema_version = _normalize_text(payload.get("schema_version"))
    return bool(schema_version and schema_version.startswith("smr_ocr_setup_v"))


def _has_meaningful_value(value: Any) -> bool:
    if value is None:
        return False

    if isinstance(value, str):
        return bool(value.strip())

    if isinstance(value, (int, float, bool)):
        return True

    if isinstance(value, dict):
        return any(_has_meaningful_value(item) for item in value.values())

    if isinstance(value, list):
        return any(_has_meaningful_value(item) for item in value)

    return bool(str(value).strip())


def _append_unique(values: list[str], value: Any) -> None:
    normalized = _normalize_text(value)
    if normalized and normalized not in values:
        values.append(normalized)


def _join_non_empty(values: list[Any], separator: str = " / ") -> str | None:
    normalized_values = [_normalize_text(value) for value in values]
    if not any(normalized_values):
        return None
    return separator.join(value or "" for value in normalized_values)


def _format_directional_value(value: Any) -> str | None:
    if isinstance(value, dict):
        numeric_value = _normalize_text(value.get("value"))
        direction = _normalize_text(value.get("direction"))
        if direction:
            direction = direction.lower()
        return _join_non_empty([numeric_value, direction], separator=" ")

    return _normalize_text(value)


def _format_corner_values(values: Any) -> str | None:
    mapping = _dict_or_empty(values)
    return _join_non_empty([mapping.get(corner) for corner in MAKE_SETUP_CORNERS])


def _format_post_session_toe(values: Any) -> str | None:
    mapping = _dict_or_empty(values)
    return _join_non_empty(
        [
            _format_directional_value(mapping.get("front_left")),
            _format_directional_value(mapping.get("front_right")),
            _format_directional_value(mapping.get("rear_left")),
            _format_directional_value(mapping.get("rear_right")),
        ]
    )


def _format_post_session_shocks(values: Any) -> str | None:
    mapping = _dict_or_empty(values)
    front = _dict_or_empty(mapping.get("front"))
    rear = _dict_or_empty(mapping.get("rear"))
    segments: list[str] = []

    front_value = _join_non_empty([front.get("bump"), front.get("rebound")])
    rear_value = _join_non_empty([rear.get("bump"), rear.get("rebound")])
    if front_value:
        segments.append(f"front {front_value}")
    if rear_value:
        segments.append(f"rear {rear_value}")

    return " | ".join(segments) if segments else None


def _format_reference_toe_slots(values: Any) -> str | None:
    mapping = _dict_or_empty(values)
    slot_1 = _normalize_text(mapping.get("slot_1"))
    slot_2 = _normalize_text(mapping.get("slot_2"))
    if not slot_1 and not slot_2:
        return None

    suffix = "" if bool(mapping.get("meaning_confirmed")) else " (meaning unconfirmed)"
    return f"Reference toe slots: 1={slot_1 or '?'} 2={slot_2 or '?'}{suffix}"


def _build_reference_setup_notes(reference_setup: Any) -> list[str]:
    mapping = _dict_or_empty(reference_setup)
    if not _has_meaningful_value(mapping):
        return []

    notes: list[str] = []
    toe_slots = _format_reference_toe_slots(mapping.get("toe_slots"))
    if toe_slots:
        notes.append(toe_slots)

    camber = _format_corner_values(mapping.get("camber"))
    if camber:
        notes.append(f"Reference camber LF/RF/LR/RR: {camber}")

    ride_height_map = _dict_or_empty(mapping.get("ride_height"))
    ride_height = _format_corner_values(ride_height_map)
    if ride_height:
        unit = _normalize_text(ride_height_map.get("unit"))
        notes.append(f"Reference ride height LF/RF/LR/RR{f' ({unit})' if unit else ''}: {ride_height}")

    weight_map = _dict_or_empty(mapping.get("weight"))
    weight = _format_corner_values(weight_map)
    if weight:
        unit = _normalize_text(weight_map.get("unit"))
        notes.append(f"Reference weight LF/RF/LR/RR{f' ({unit})' if unit else ''}: {weight}")

    return notes


def _build_baseline_shock_notes(values: Any) -> list[str]:
    mapping = _dict_or_empty(values)
    if not _has_meaningful_value(mapping):
        return []

    notes: list[str] = []
    package_name = _normalize_text(mapping.get("package_name"))
    if package_name:
        notes.append(f"Baseline shocks package: {package_name}")

    for corner in MAKE_SETUP_CORNERS:
        corner_map = _dict_or_empty(mapping.get(corner))
        if not _has_meaningful_value(corner_map):
            continue

        parts = []
        for label, key in (
            ("HSR", "HSR"),
            ("LSR", "LSR"),
            ("HBS", "HBS"),
            ("LSB", "LSB"),
            ("total", "setup_total"),
        ):
            value = _normalize_text(corner_map.get(key))
            if value:
                parts.append(f"{label} {value}")

        if parts:
            notes.append(f"Baseline {corner}: {', '.join(parts)}")

    return notes


def _build_session_text(session: dict[str, Any]) -> str | None:
    date_value = _normalize_text(session.get("date_raw")) or _normalize_text(session.get("date_iso"))
    time_value = _normalize_text(session.get("time_raw")) or _normalize_text(session.get("time_24h"))
    car_number = _normalize_text(session.get("car_number"))
    series = _normalize_text(session.get("series"))
    team = _normalize_text(session.get("team"))

    session_bits = [date_value, time_value, car_number, series, team]
    normalized = [value for value in session_bits if value]
    return " | ".join(normalized) if normalized else None


def _adapt_make_setup_payload(payload: dict[str, Any]) -> dict[str, Any]:
    session = _dict_or_empty(payload.get("session"))
    setup = _dict_or_empty(payload.get("setup"))
    shocks = _dict_or_empty(payload.get("shocks"))
    baseline_shocks = _dict_or_empty(payload.get("baseline_shocks"))
    post_session = _dict_or_empty(payload.get("post_session"))
    reference_setup = _dict_or_empty(payload.get("reference_setup"))
    quality_control = _dict_or_empty(payload.get("quality_control"))
    source_documents = payload.get("source_documents") if isinstance(payload.get("source_documents"), list) else []

    raw_evidence = {
        "visible_text": [],
        "detected_grids": [],
        "detected_labels": [],
        "unmapped_values": [],
        "quality_flags": [],
        "template_labels": [],
    }
    warnings: list[str] = []
    notes: list[str] = []

    for note in payload.get("notes") if isinstance(payload.get("notes"), list) else []:
        _append_unique(notes, note)

    for note in _build_reference_setup_notes(reference_setup):
        _append_unique(notes, note)
    for note in _build_baseline_shock_notes(baseline_shocks):
        _append_unique(notes, note)

    for warning in quality_control.get("warnings") if isinstance(quality_control.get("warnings"), list) else []:
        _append_unique(warnings, warning)
    for unresolved in quality_control.get("unresolved_fields") if isinstance(quality_control.get("unresolved_fields"), list) else []:
        _append_unique(warnings, unresolved)

    if _has_meaningful_value(reference_setup):
        _append_unique(warnings, "Reference setup preserved in notes for manual review")
    if _has_meaningful_value(baseline_shocks):
        _append_unique(warnings, "Baseline shocks preserved in notes for manual review")
    if bool(quality_control.get("mapping_inferred")):
        _append_unique(warnings, "Mapping inferred from Make OCR schema")

    session_text = _build_session_text(session)
    for visible_line in (session.get("driver"), session.get("track"), session_text):
        _append_unique(raw_evidence["visible_text"], visible_line)
    for note in notes:
        _append_unique(raw_evidence["visible_text"], note)
    for warning in warnings:
        _append_unique(raw_evidence["quality_flags"], warning)

    alignment: dict[str, Any] = {}
    camber_map = _dict_or_empty(setup.get("camber"))
    ride_height_map = _dict_or_empty(setup.get("ride_height"))
    toe_map = _dict_or_empty(setup.get("toe"))
    for corner, suffix in ALIGNMENT_CORNER_SUFFIX.items():
        alignment[f"camber_{suffix}"] = _normalize_text(camber_map.get(corner))
        alignment[f"rh_{suffix}"] = _normalize_text(ride_height_map.get(corner))

    alignment["toe_fl"] = _format_directional_value(toe_map.get("front_left"))
    alignment["toe_fr"] = _format_directional_value(toe_map.get("front_right"))
    alignment["toe_rl"] = _format_directional_value(toe_map.get("rear_left"))
    alignment["toe_rr"] = _format_directional_value(toe_map.get("rear_right"))

    tire_pressure = _dict_or_empty(setup.get("tire_pressure"))
    pressures = {
        "cold_fl": _normalize_text(tire_pressure.get("LF")),
        "cold_fr": _normalize_text(tire_pressure.get("RF")),
        "cold_rl": _normalize_text(tire_pressure.get("LR")),
        "cold_rr": _normalize_text(tire_pressure.get("RR")),
    }

    sheet_fields = {
        "fuel_liters": _normalize_text(setup.get("fuel_liters")),
        "driver_weight_lbs": _normalize_text(setup.get("driver_weight_lbs")),
        "scale_weight_lbs": _normalize_text(setup.get("total_weight_lbs")),
        "cross_weight_percent": _normalize_text(setup.get("cross_weight_percent")),
        "springs_front": _normalize_text(_dict_or_empty(setup.get("springs")).get("front")),
        "springs_rear": _normalize_text(_dict_or_empty(setup.get("springs")).get("rear")),
        "roll_bar_text": _join_non_empty(
            [
                _dict_or_empty(setup.get("roll_bar")).get("front"),
                _dict_or_empty(setup.get("roll_bar")).get("rear"),
            ]
        ),
        "arb_front_text": _join_non_empty(
            [
                _dict_or_empty(setup.get("anti_roll_bar")).get("front"),
                _dict_or_empty(setup.get("anti_roll_bar")).get("LF"),
                _dict_or_empty(setup.get("anti_roll_bar")).get("RF"),
            ],
            separator=" / ",
        ),
        "arb_rear_text": _join_non_empty(
            [
                _dict_or_empty(setup.get("anti_roll_bar")).get("rear"),
                _dict_or_empty(setup.get("anti_roll_bar")).get("LR"),
                _dict_or_empty(setup.get("anti_roll_bar")).get("RR"),
            ],
            separator=" / ",
        ),
        "wheelbase_left_mm": _normalize_text(_dict_or_empty(setup.get("wheel_base")).get("left")),
        "wheelbase_right_mm": _normalize_text(_dict_or_empty(setup.get("wheel_base")).get("right")),
        "wing_rake_deg": _normalize_text(_dict_or_empty(setup.get("aero")).get("rake_deg")),
        "wing_angle_deg": _normalize_text(_dict_or_empty(setup.get("aero")).get("wing_deg")),
        "wing_gurney_mm": _normalize_text(_dict_or_empty(setup.get("aero")).get("gurney_mm")),
        "wicker_text": _normalize_text(_dict_or_empty(setup.get("aero")).get("wicker_mm")),
        "bump_stops_front": _normalize_text(_dict_or_empty(setup.get("bump_stops")).get("front")),
        "bump_stops_rear": _normalize_text(_dict_or_empty(setup.get("bump_stops")).get("rear")),
        "spacer_text": _normalize_text(setup.get("spacer_mm")),
        "bump_text": _normalize_text(_dict_or_empty(setup.get("main_bump_rebound")).get("bump")),
        "rebound_text": _normalize_text(_dict_or_empty(setup.get("main_bump_rebound")).get("rebound")),
        "corner_weight_text": _format_corner_values(_dict_or_empty(setup.get("corner_weight"))),
        "static_ride_height_text": _join_non_empty(
            [
                _dict_or_empty(setup.get("static_ride_height")).get("left"),
                _dict_or_empty(setup.get("static_ride_height")).get("right"),
            ]
        ),
        "bump_stop_height_text": _join_non_empty(
            [
                _dict_or_empty(setup.get("bump_stop_height")).get("left"),
                _dict_or_empty(setup.get("bump_stop_height")).get("right"),
            ]
        ),
        "fuel_pumped_out_liters": _normalize_text(post_session.get("fuel_pumped_out_liters")),
        "notes_block": _join_non_empty(notes, separator="\n"),
    }

    post_session_map = {
        "camber_text": _format_corner_values(post_session.get("camber")),
        "toe_text": _format_post_session_toe(post_session.get("toe")),
        "weight_text": _format_corner_values(_dict_or_empty(post_session.get("corner_weight"))),
        "height_text": _format_corner_values(_dict_or_empty(post_session.get("ride_height"))),
        "shocks_text": _format_post_session_shocks(post_session.get("shocks")),
    }

    suspension: dict[str, Any] = {}
    shock_setup = {}
    for corner, alignment_suffix in ALIGNMENT_CORNER_SUFFIX.items():
        shock_map = _dict_or_empty(shocks.get(corner))
        shock_setup_suffix = SHOCK_SETUP_CORNER_SUFFIX[corner]
        suspension[f"bump_{alignment_suffix}"] = _normalize_text(shock_map.get("compression"))
        suspension[f"rebound_{alignment_suffix}"] = _normalize_text(shock_map.get("rebound"))
        suspension[f"hsr_{alignment_suffix}"] = _normalize_text(shock_map.get("HSR"))
        suspension[f"lsr_{alignment_suffix}"] = _normalize_text(shock_map.get("LSR"))
        suspension[f"hsb_{alignment_suffix}"] = _normalize_text(shock_map.get("HBS"))
        suspension[f"lsb_{alignment_suffix}"] = _normalize_text(shock_map.get("LSB"))
        shock_setup[shock_setup_suffix] = {
            "position": "",
            "hsr": _normalize_text(shock_map.get("HSR")),
            "lsr": _normalize_text(shock_map.get("LSR")),
            "hsb": _normalize_text(shock_map.get("HBS")),
            "lsb": _normalize_text(shock_map.get("LSB")),
            "total_setup": _normalize_text(shock_map.get("setup_total")),
        }

    inferred_document_type = "printed_form_with_values"
    if not _has_meaningful_value(setup) and _has_meaningful_value(shocks):
        inferred_document_type = "shock_setup_sheet"
    elif not _has_meaningful_value(setup) and not _has_meaningful_value(shocks) and notes:
        inferred_document_type = "mixed_session_notes"
    elif not _has_meaningful_value(setup) and not _has_meaningful_value(shocks) and not notes:
        inferred_document_type = "blank_setup_sheet"

    if len(source_documents) > 1:
        summary = f"Make OCR merged {len(source_documents)} source documents into a review draft."
    elif len(source_documents) == 1:
        summary = "Make OCR returned a single-image review draft."
    else:
        summary = "Make OCR returned a structured review draft."

    adapted = {
        "status": "review_required" if bool(quality_control.get("needs_review")) or warnings else None,
        "document_type": inferred_document_type,
        "template_name": _normalize_text(payload.get("document_type")) or "race_setup_packet",
        "confidence": quality_control.get("confidence"),
        "has_values": _has_meaningful_value(setup) or _has_meaningful_value(shocks) or _has_meaningful_value(post_session),
        "summary": summary,
        "extracted_text": _join_non_empty(notes, separator="\n") or session_text,
        "metadata": {
            "driver_text": _normalize_text(session.get("driver")),
            "track_text": _normalize_text(session.get("track")),
            "session_text": session_text,
            "session_notes": _join_non_empty(notes, separator="\n") or "",
        },
        "raw_evidence": raw_evidence,
        "field_evidence": [],
        "setup": {
            "alignment": alignment,
            "pressures": pressures,
            "suspension": suspension,
            "sheet_fields": sheet_fields,
            "post_session": post_session_map,
            "shock_setup": shock_setup,
            "notes": notes,
        },
        "warnings": warnings,
        "recommended_review_status": "PENDING",
        "parser_version": _normalize_text(payload.get("schema_version")),
        "model": "make.com",
        "fallback_model_used": False,
    }

    return adapted


def _build_make_ocr_payload(
    *,
    submission: Submission,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
    preprocessing_info: dict[str, Any],
) -> dict[str, Any] | None:
    context = _dict_or_empty(submission.payload).get("context")
    context_map = _dict_or_empty(context)
    run_group_value = getattr(run_group, "normalized", None) or getattr(run_group, "raw_text", None)
    if hasattr(run_group_value, "value"):
        run_group_value = run_group_value.value

    image_payload = _build_make_ocr_image_payload(preprocessing_info)
    if image_payload is None:
        return None

    return {
        "correlation_id": getattr(submission, "correlation_id", None),
        "submission_ref": submission.submission_ref,
        "ocr_preview": True,
        "force_review_staging": True,
        "raw_text": _normalize_text(submission.raw_text),
        "image": image_payload,
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


def _sanitize_filename_component(value: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in value.strip())
    return safe or "ocr_preview"


def _expected_make_ocr_base64_prefix(mime_type: str) -> str | None:
    return {
        "image/png": "iVBOR",
        "image/jpeg": "/9j/",
        "image/webp": "UklGR",
    }.get(mime_type)


def _validate_make_ocr_base64_string(encoded_image: str, mime_type: str) -> bool:
    if not encoded_image:
        logger.warning("Make OCR image payload produced an empty base64 string")
        return False

    if encoded_image.startswith("IMTString") or "IMTString" in encoded_image:
        logger.warning("Make OCR image payload included an IMT wrapper instead of clean base64")
        return False

    if ": " in encoded_image:
        logger.warning("Make OCR image payload included an unexpected label separator")
        return False

    if encoded_image.startswith("data:") or "data:image" in encoded_image:
        logger.warning("Make OCR image payload included an unexpected data URL prefix")
        return False

    expected_prefix = _expected_make_ocr_base64_prefix(mime_type)
    if expected_prefix and not encoded_image.startswith(expected_prefix):
        logger.warning(
            "Make OCR image payload did not start with the expected base64 prefix: mime_type=%s expected_prefix=%s actual_prefix=%s",
            mime_type,
            expected_prefix,
            encoded_image[:20],
        )
        return False

    return True


def _build_make_ocr_image_payload(preprocessing_info: dict[str, Any]) -> dict[str, Any] | None:
    selected_image_url = _normalize_text(preprocessing_info.get("selected_image_url"))
    if not selected_image_url:
        logger.warning("Make OCR image payload missing selected image URL")
        return None

    parsed = image_analysis_service._parse_data_url(selected_image_url)
    if not parsed:
        logger.warning("Make OCR image payload contained an invalid data URL")
        return None

    mime_type, image_bytes = parsed
    normalized_mime = _normalize_text("image/jpeg" if mime_type == "image/jpg" else mime_type)
    if not image_bytes:
        logger.warning("Make OCR image payload missing image bytes")
        return None
    if not normalized_mime:
        logger.warning("Make OCR image payload missing mime type")
        return None

    selected_variant = _normalize_text(preprocessing_info.get("selected_variant"))
    if not selected_variant:
        logger.warning("Make OCR image payload missing selected variant")
        return None

    extension = _extension_for_mime_type(normalized_mime)
    filename = _normalize_text(f"{_sanitize_filename_component(selected_variant)}.{extension}")
    if not filename:
        logger.warning("Make OCR image payload could not derive a filename")
        return None

    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    if not _validate_make_ocr_base64_string(encoded_image, normalized_mime):
        return None

    logger.info(
        "Make OCR base64 payload prepared: filename=%s mime_type=%s size_bytes=%s selected_variant=%s base64_length=%s base64_prefix=%s",
        filename,
        normalized_mime,
        len(image_bytes),
        selected_variant,
        len(encoded_image),
        encoded_image[:20],
    )

    return {
        "transport": "base64_json",
        "filename": filename,
        "mime_type": normalized_mime,
        "size_bytes": len(image_bytes),
        "width": preprocessing_info.get("width"),
        "height": preprocessing_info.get("height"),
        "selected_variant": selected_variant,
        "base64": encoded_image,
    }


def _build_make_ocr_request(
    *,
    webhook_url: str,
    payload: dict[str, Any],
    submission: Submission,
) -> request.Request:
    body = json.dumps(
        {
            "payload_json": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            "correlation_id": str(payload.get("correlation_id") or ""),
            "submission_ref": str(payload.get("submission_ref") or ""),
            "ocr_preview": True,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")

    logger.info(
        "Make OCR webhook JSON request prepared: correlation_id=%s submission_ref=%s transport=%s",
        payload.get("correlation_id"),
        payload.get("submission_ref"),
        _dict_or_empty(payload.get("image")).get("transport"),
    )

    return request.Request(
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


def _extract_analysis_candidate(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None

    if _is_make_setup_payload(payload):
        return payload

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
    if payload is None:
        logger.warning("Make OCR JSON payload could not be prepared from the selected image variant")
        return normalize_image_analysis_result(
            image_analysis_service._build_extraction_failed_analysis(
                message="Image could not be prepared for OCR.",
                preprocessing_info=preprocessing_info,
                model="make.com",
            )
        )

    req = _build_make_ocr_request(
        webhook_url=webhook_url,
        payload=payload,
        submission=submission,
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

    if _is_make_setup_payload(analysis):
        analysis = _adapt_make_setup_payload(analysis)

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

    if ocr_config["provider"] != "make_webhook":
        logger.warning(
            "OCR analyze request skipped because Make OCR webhook is not configured: missing_requirements=%s",
            ocr_config["missing_requirements"],
        )
        return None

    return _analyze_submission_image_via_make(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
    )
