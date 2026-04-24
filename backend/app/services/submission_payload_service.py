from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any


PRESSURE_PHASES = ("cold", "hot")
PRESSURE_CORNERS = ("fl", "fr", "rl", "rr")
DETAILED_SECTION_KEYS = (
    "suspension",
    "alignment",
    "tire_temperatures",
    "tire_inventory",
)


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first_non_blank(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _has_meaningful_value(value: Any) -> bool:
    if value is None:
        return False

    if isinstance(value, str):
        return bool(value.strip())

    if isinstance(value, dict):
        return any(_has_meaningful_value(item) for item in value.values())

    if isinstance(value, (list, tuple, set)):
        return any(_has_meaningful_value(item) for item in value)

    return True


def normalize_pressures(value: Any) -> dict[str, Any]:
    source = _dict_or_empty(value)
    if not source:
        return {}

    normalized: dict[str, Any] = {
        "unit": source.get("unit") or "psi",
    }

    for phase in PRESSURE_PHASES:
        nested_values = _dict_or_empty(source.get(phase))
        phase_values: dict[str, Any] = {}

        for corner in PRESSURE_CORNERS:
            flat_key = f"{phase}_{corner}"
            measurement = _first_non_blank(source.get(flat_key), nested_values.get(corner))
            phase_values[corner] = measurement
            normalized[flat_key] = measurement

        normalized[phase] = phase_values

    return normalized


def normalize_optional_text(value: Any) -> str | None:
    if value is None:
        return None

    text_value = str(value).strip()
    return text_value or None


def get_session_payload(payload: Any) -> dict[str, Any]:
    source_payload = _dict_or_empty(payload)
    nested_session = _dict_or_empty(source_payload.get("data"))
    session_payload = deepcopy(nested_session or source_payload)

    if not session_payload:
        return {}

    session_payload.pop("data", None)

    pressures = normalize_pressures(session_payload.get("pressures"))
    if pressures:
        session_payload["pressures"] = pressures

    alignment = _dict_or_empty(session_payload.get("alignment"))
    wheelbase_mm = _first_non_blank(
        alignment.get("wheelbase_mm"),
        session_payload.get("wheelbase_mm"),
    )
    if alignment or wheelbase_mm is not None:
        normalized_alignment = deepcopy(alignment)
        normalized_alignment["wheelbase_mm"] = wheelbase_mm
        session_payload["alignment"] = normalized_alignment
        session_payload["wheelbase_mm"] = wheelbase_mm

    return session_payload


def merge_submission_analysis(
    payload: Any,
    raw_text: Any,
    image_url: Any,
    analysis_result: Any,
) -> dict[str, Any]:
    existing = deepcopy(_dict_or_empty(analysis_result))
    source_payload = _dict_or_empty(payload)
    raw_session_payload = _dict_or_empty(source_payload.get("data")) or source_payload
    session_payload = get_session_payload(payload)
    normalized_raw_text = normalize_optional_text(raw_text)
    normalized_image_url = normalize_optional_text(image_url)

    explicit_mode = str(
        existing.get("submission_mode") or existing.get("submissionMode") or "",
    ).strip().lower()
    submission_mode = (
        explicit_mode
        if explicit_mode in {"quick", "detail"}
        else (
            "detail"
            if any(key in raw_session_payload for key in DETAILED_SECTION_KEYS)
            else "quick"
        )
    )

    has_structured_data = any(
        _has_meaningful_value(value) for value in session_payload.values()
    )
    has_raw_text = normalized_raw_text is not None
    has_image = normalized_image_url is not None
    has_voice_notes = bool(
        existing.get("has_voice_notes")
        or existing.get("hasVoiceNotes")
        or existing.get("voice_input_used")
        or existing.get("voiceInputUsed")
        or str(existing.get("raw_input_mode") or existing.get("rawInputMode") or "")
        .strip()
        .lower()
        in {"voice", "mixed"}
    )

    if not has_raw_text:
        has_voice_notes = False

    structured_only = has_structured_data and not has_raw_text and not has_image

    if structured_only:
        raw_input_mode = "none"
    elif has_voice_notes and has_raw_text:
        raw_input_mode = "voice"
    elif has_image:
        raw_input_mode = "image"
    elif has_raw_text:
        raw_input_mode = "manual"
    else:
        raw_input_mode = "none"

    if submission_mode == "detail":
        if structured_only:
            source_type = "detail_structured_only"
        elif has_structured_data and (has_raw_text or has_image):
            source_type = "detail_hybrid"
        else:
            source_type = "detail_structured"
    else:
        if structured_only:
            source_type = "quick_structured_only"
        elif has_structured_data and (has_raw_text or has_image):
            source_type = "quick_hybrid"
        elif has_raw_text or has_image:
            source_type = "quick_raw"
        else:
            source_type = "quick"

    return {
        **existing,
        "submission_mode": submission_mode,
        "source_type": source_type,
        "has_structured_data": has_structured_data,
        "structured_only": structured_only,
        "has_raw_text": has_raw_text,
        "has_image": has_image,
        "has_voice_notes": has_voice_notes,
        "raw_input_mode": raw_input_mode,
    }


def should_persist_structured_submission(analysis_result: Any) -> bool:
    analysis = _dict_or_empty(analysis_result)
    submission_mode = str(
        analysis.get("submission_mode") or analysis.get("submissionMode") or "",
    ).strip().lower()
    has_raw_text = bool(
        analysis.get("has_raw_text") or analysis.get("hasRawText"),
    )
    has_voice_notes = bool(
        analysis.get("has_voice_notes") or analysis.get("hasVoiceNotes"),
    )
    has_image = bool(
        analysis.get("has_image") or analysis.get("hasImage"),
    )

    if submission_mode == "quick" and (has_raw_text or has_voice_notes or has_image):
        return False

    return True


def to_isoformat(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return None
