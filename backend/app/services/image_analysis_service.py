from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from app.core.config import get_ocr_config_status, get_settings
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.models.vehicle import Vehicle


logger = logging.getLogger(__name__)
IMAGE_ANALYSIS_SCHEMA_NAME = "sm_racing_image_analysis"
IMAGE_ANALYSIS_PARSER_VERSION = "ocr-v1"
OCR_PRIMARY_CONFIDENCE_THRESHOLD = 0.58
OCR_MIN_MEANINGFUL_FIELDS = 3
OCR_REVIEW_FLAG_KEYWORDS = (
    "ambiguous",
    "unclear",
    "unreadable",
    "overwritten",
    "crossed-out",
    "crossed out",
    "uncertain",
    "low quality",
)
OCR_SEVERE_QUALITY_FLAG_KEYWORDS = (
    "unreadable",
    "low quality",
    "mostly unreadable",
    "too blurry",
)
OCR_DOCUMENT_TYPES = (
    "blank_setup_sheet",
    "handwritten_setup_grid",
    "printed_form_with_values",
    "shock_setup_sheet",
    "mixed_session_notes",
    "low_quality_review_required",
    "unknown",
)


IMAGE_ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "document_type": {
            "type": "string",
            "enum": list(OCR_DOCUMENT_TYPES),
        },
        "template_name": {"type": "string"},
        "confidence": {"type": "number"},
        "summary": {"type": "string"},
        "extracted_text": {"type": "string"},
        "metadata": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "driver_text": {"type": "string"},
                "track_text": {"type": "string"},
                "session_text": {"type": "string"},
            },
            "required": ["driver_text", "track_text", "session_text"],
        },
        "setup": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "pressures": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "cold_fl": {"type": "string"},
                        "cold_fr": {"type": "string"},
                        "cold_rl": {"type": "string"},
                        "cold_rr": {"type": "string"},
                        "hot_fl": {"type": "string"},
                        "hot_fr": {"type": "string"},
                        "hot_rl": {"type": "string"},
                        "hot_rr": {"type": "string"},
                    },
                    "required": [
                        "cold_fl",
                        "cold_fr",
                        "cold_rl",
                        "cold_rr",
                        "hot_fl",
                        "hot_fr",
                        "hot_rl",
                        "hot_rr",
                    ],
                },
                "suspension": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "rebound_fl": {"type": "string"},
                        "rebound_fr": {"type": "string"},
                        "rebound_rl": {"type": "string"},
                        "rebound_rr": {"type": "string"},
                        "bump_fl": {"type": "string"},
                        "bump_fr": {"type": "string"},
                        "bump_rl": {"type": "string"},
                        "bump_rr": {"type": "string"},
                        "hsr_fl": {"type": "string"},
                        "hsr_fr": {"type": "string"},
                        "hsr_rl": {"type": "string"},
                        "hsr_rr": {"type": "string"},
                        "lsr_fl": {"type": "string"},
                        "lsr_fr": {"type": "string"},
                        "lsr_rl": {"type": "string"},
                        "lsr_rr": {"type": "string"},
                        "hsb_fl": {"type": "string"},
                        "hsb_fr": {"type": "string"},
                        "hsb_rl": {"type": "string"},
                        "hsb_rr": {"type": "string"},
                        "lsb_fl": {"type": "string"},
                        "lsb_fr": {"type": "string"},
                        "lsb_rl": {"type": "string"},
                        "lsb_rr": {"type": "string"},
                        "sway_bar_f": {"type": "string"},
                        "sway_bar_r": {"type": "string"},
                        "wing_angle_deg": {"type": "string"},
                    },
                    "required": [
                        "rebound_fl",
                        "rebound_fr",
                        "rebound_rl",
                        "rebound_rr",
                        "bump_fl",
                        "bump_fr",
                        "bump_rl",
                        "bump_rr",
                        "hsr_fl",
                        "hsr_fr",
                        "hsr_rl",
                        "hsr_rr",
                        "lsr_fl",
                        "lsr_fr",
                        "lsr_rl",
                        "lsr_rr",
                        "hsb_fl",
                        "hsb_fr",
                        "hsb_rl",
                        "hsb_rr",
                        "lsb_fl",
                        "lsb_fr",
                        "lsb_rl",
                        "lsb_rr",
                        "sway_bar_f",
                        "sway_bar_r",
                        "wing_angle_deg",
                    ],
                },
                "alignment": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "rh_fl": {"type": "string"},
                        "rh_fr": {"type": "string"},
                        "rh_rl": {"type": "string"},
                        "rh_rr": {"type": "string"},
                        "camber_fl": {"type": "string"},
                        "camber_fr": {"type": "string"},
                        "camber_rl": {"type": "string"},
                        "camber_rr": {"type": "string"},
                        "toe_fl": {"type": "string"},
                        "toe_fr": {"type": "string"},
                        "toe_rl": {"type": "string"},
                        "toe_rr": {"type": "string"},
                        "toe_front": {"type": "string"},
                        "toe_rear": {"type": "string"},
                        "caster_l": {"type": "string"},
                        "caster_r": {"type": "string"},
                        "ride_height_f": {"type": "string"},
                        "ride_height_r": {"type": "string"},
                        "rake_mm": {"type": "string"},
                        "wheelbase_mm": {"type": "string"},
                    },
                    "required": [
                        "rh_fl",
                        "rh_fr",
                        "rh_rl",
                        "rh_rr",
                        "camber_fl",
                        "camber_fr",
                        "camber_rl",
                        "camber_rr",
                        "toe_fl",
                        "toe_fr",
                        "toe_rl",
                        "toe_rr",
                        "toe_front",
                        "toe_rear",
                        "caster_l",
                        "caster_r",
                        "ride_height_f",
                        "ride_height_r",
                        "rake_mm",
                        "wheelbase_mm",
                    ],
                },
                "tire_temperatures": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "fl_in": {"type": "string"},
                        "fl_mid": {"type": "string"},
                        "fl_out": {"type": "string"},
                        "fr_in": {"type": "string"},
                        "fr_mid": {"type": "string"},
                        "fr_out": {"type": "string"},
                        "rl_in": {"type": "string"},
                        "rl_mid": {"type": "string"},
                        "rl_out": {"type": "string"},
                        "rr_in": {"type": "string"},
                        "rr_mid": {"type": "string"},
                        "rr_out": {"type": "string"},
                    },
                    "required": [
                        "fl_in",
                        "fl_mid",
                        "fl_out",
                        "fr_in",
                        "fr_mid",
                        "fr_out",
                        "rl_in",
                        "rl_mid",
                        "rl_out",
                        "rr_in",
                        "rr_mid",
                        "rr_out",
                    ],
                },
                "sheet_fields": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "fuel_liters": {"type": "string"},
                        "driver_weight_lbs": {"type": "string"},
                        "scale_weight_lbs": {"type": "string"},
                        "cross_weight_percent": {"type": "string"},
                        "roll_bar_text": {"type": "string"},
                        "spacer_text": {"type": "string"},
                        "bump_text": {"type": "string"},
                        "rebound_text": {"type": "string"},
                        "springs_front": {"type": "string"},
                        "springs_rear": {"type": "string"},
                        "bump_stops_front": {"type": "string"},
                        "bump_stops_rear": {"type": "string"},
                        "wheelbase_left_mm": {"type": "string"},
                        "wheelbase_right_mm": {"type": "string"},
                        "wing_rake_deg": {"type": "string"},
                        "wing_angle_deg": {"type": "string"},
                        "wing_gurney_mm": {"type": "string"},
                        "wicker_text": {"type": "string"},
                        "specs_toe_text": {"type": "string"},
                        "corner_weight_text": {"type": "string"},
                        "static_ride_height_text": {"type": "string"},
                        "bump_stop_height_text": {"type": "string"},
                        "arb_front_text": {"type": "string"},
                        "arb_rear_text": {"type": "string"},
                        "fuel_pumped_out_liters": {"type": "string"},
                        "notes_block": {"type": "string"},
                    },
                    "required": [
                        "fuel_liters",
                        "driver_weight_lbs",
                        "scale_weight_lbs",
                        "cross_weight_percent",
                        "roll_bar_text",
                        "spacer_text",
                        "bump_text",
                        "rebound_text",
                        "springs_front",
                        "springs_rear",
                        "bump_stops_front",
                        "bump_stops_rear",
                        "wheelbase_left_mm",
                        "wheelbase_right_mm",
                        "wing_rake_deg",
                        "wing_angle_deg",
                        "wing_gurney_mm",
                        "wicker_text",
                        "specs_toe_text",
                        "corner_weight_text",
                        "static_ride_height_text",
                        "bump_stop_height_text",
                        "arb_front_text",
                        "arb_rear_text",
                        "fuel_pumped_out_liters",
                        "notes_block",
                    ],
                },
                "post_session": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "camber_text": {"type": "string"},
                        "toe_text": {"type": "string"},
                        "weight_text": {"type": "string"},
                        "height_text": {"type": "string"},
                        "shocks_text": {"type": "string"},
                    },
                    "required": [
                        "camber_text",
                        "toe_text",
                        "weight_text",
                        "height_text",
                        "shocks_text",
                    ],
                },
                "shock_setup": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "rr": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "position": {"type": "string"},
                                "hsr": {"type": "string"},
                                "lsr": {"type": "string"},
                                "hsb": {"type": "string"},
                                "lsb": {"type": "string"},
                                "total_setup": {"type": "string"},
                            },
                            "required": ["position", "hsr", "lsr", "hsb", "lsb", "total_setup"],
                        },
                        "lr": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "position": {"type": "string"},
                                "hsr": {"type": "string"},
                                "lsr": {"type": "string"},
                                "hsb": {"type": "string"},
                                "lsb": {"type": "string"},
                                "total_setup": {"type": "string"},
                            },
                            "required": ["position", "hsr", "lsr", "hsb", "lsb", "total_setup"],
                        },
                        "lf": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "position": {"type": "string"},
                                "hsr": {"type": "string"},
                                "lsr": {"type": "string"},
                                "hsb": {"type": "string"},
                                "lsb": {"type": "string"},
                                "total_setup": {"type": "string"},
                            },
                            "required": ["position", "hsr", "lsr", "hsb", "lsb", "total_setup"],
                        },
                        "rf": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "position": {"type": "string"},
                                "hsr": {"type": "string"},
                                "lsr": {"type": "string"},
                                "hsb": {"type": "string"},
                                "lsb": {"type": "string"},
                                "total_setup": {"type": "string"},
                            },
                            "required": ["position", "hsr", "lsr", "hsb", "lsb", "total_setup"],
                        },
                    },
                    "required": ["rr", "lr", "lf", "rf"],
                },
                "notes": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": [
                "pressures",
                "suspension",
                "alignment",
                "tire_temperatures",
                "sheet_fields",
                "post_session",
                "shock_setup",
                "notes",
            ],
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
        "recommended_review_status": {
            "type": "string",
            "enum": ["PENDING", "APPROVED", "REJECTED", "CORRECTED"],
        },
    },
    "required": [
        "document_type",
        "template_name",
        "confidence",
        "summary",
        "extracted_text",
        "metadata",
        "setup",
        "warnings",
        "recommended_review_status",
    ],
}


def _empty_alignment() -> dict[str, str]:
    return {
        "rh_fl": "",
        "rh_fr": "",
        "rh_rl": "",
        "rh_rr": "",
        "ride_height_f": "",
        "ride_height_r": "",
        "camber_fl": "",
        "camber_fr": "",
        "camber_rl": "",
        "camber_rr": "",
        "toe_fl": "",
        "toe_fr": "",
        "toe_rl": "",
        "toe_rr": "",
        "toe_front": "",
        "toe_rear": "",
        "caster_l": "",
        "caster_r": "",
        "rake_mm": "",
        "wheelbase_mm": "",
    }


def _empty_pressures() -> dict[str, str]:
    return {
        "cold_fl": "",
        "cold_fr": "",
        "cold_rl": "",
        "cold_rr": "",
        "hot_fl": "",
        "hot_fr": "",
        "hot_rl": "",
        "hot_rr": "",
    }


def _empty_suspension() -> dict[str, str]:
    return {
        "rebound_fl": "",
        "rebound_fr": "",
        "rebound_rl": "",
        "rebound_rr": "",
        "bump_fl": "",
        "bump_fr": "",
        "bump_rl": "",
        "bump_rr": "",
        "hsr_fl": "",
        "hsr_fr": "",
        "hsr_rl": "",
        "hsr_rr": "",
        "lsr_fl": "",
        "lsr_fr": "",
        "lsr_rl": "",
        "lsr_rr": "",
        "hsb_fl": "",
        "hsb_fr": "",
        "hsb_rl": "",
        "hsb_rr": "",
        "lsb_fl": "",
        "lsb_fr": "",
        "lsb_rl": "",
        "lsb_rr": "",
        "sway_bar_f": "",
        "sway_bar_r": "",
        "wing_angle_deg": "",
    }


def _empty_tire_temperatures() -> dict[str, str]:
    return {
        "fl_in": "",
        "fl_mid": "",
        "fl_out": "",
        "fr_in": "",
        "fr_mid": "",
        "fr_out": "",
        "rl_in": "",
        "rl_mid": "",
        "rl_out": "",
        "rr_in": "",
        "rr_mid": "",
        "rr_out": "",
    }


def _empty_sheet_fields() -> dict[str, str]:
    return {
        "fuel_liters": "",
        "driver_weight_lbs": "",
        "scale_weight_lbs": "",
        "cross_weight_percent": "",
        "roll_bar_text": "",
        "spacer_text": "",
        "bump_text": "",
        "rebound_text": "",
        "springs_front": "",
        "springs_rear": "",
        "bump_stops_front": "",
        "bump_stops_rear": "",
        "wheelbase_left_mm": "",
        "wheelbase_right_mm": "",
        "wing_rake_deg": "",
        "wing_angle_deg": "",
        "wing_gurney_mm": "",
        "wicker_text": "",
        "specs_toe_text": "",
        "corner_weight_text": "",
        "static_ride_height_text": "",
        "bump_stop_height_text": "",
        "arb_front_text": "",
        "arb_rear_text": "",
        "fuel_pumped_out_liters": "",
        "notes_block": "",
    }


def _empty_post_session() -> dict[str, str]:
    return {
        "camber_text": "",
        "toe_text": "",
        "weight_text": "",
        "height_text": "",
        "shocks_text": "",
    }


def _empty_shock_corner() -> dict[str, str]:
    return {
        "position": "",
        "hsr": "",
        "lsr": "",
        "hsb": "",
        "lsb": "",
        "total_setup": "",
    }


def _empty_shock_setup() -> dict[str, dict[str, str]]:
    return {
        "rr": _empty_shock_corner(),
        "lr": _empty_shock_corner(),
        "lf": _empty_shock_corner(),
        "rf": _empty_shock_corner(),
    }


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_float(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(number, 1.0))


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _normalize_notes(values: Any) -> list[str]:
    normalized: list[str] = []
    for entry in _list(values):
        text = _normalize_text(entry)
        if text and text not in normalized:
            normalized.append(text)
    return normalized


def _normalize_flags(values: Any) -> list[str]:
    normalized: list[str] = []
    for entry in _list(values):
        text = _normalize_text(entry)
        if text and text not in normalized:
            normalized.append(text)
    return normalized


def _normalize_doc_type(value: Any) -> str:
    doc_type = _normalize_text(value)
    legacy_map = {
        "setup_sheet": "printed_form_with_values",
        "session_note": "mixed_session_notes",
        "schedule": "unknown",
    }
    if doc_type in legacy_map:
        return legacy_map[doc_type]
    if doc_type in OCR_DOCUMENT_TYPES:
        return doc_type
    return "unknown"


def _is_blankish_document(*, doc_type: str, raw_text: str, field_count: int, notes: list[str]) -> bool:
    return doc_type == "blank_setup_sheet" or (
        doc_type == "unknown" and not raw_text and field_count == 0 and not notes
    )


def _normalize_shock_corner(value: Any) -> dict[str, str]:
    raw = _dict(value)
    corner = _empty_shock_corner()
    for key in corner:
        corner[key] = _normalize_text(raw.get(key))
    return corner


def _normalize_shock_setup(value: Any) -> dict[str, dict[str, str]]:
    raw = _dict(value)
    normalized = _empty_shock_setup()
    for corner in normalized:
        nested_corner = _dict(raw.get(corner))
        if nested_corner:
            normalized[corner] = _normalize_shock_corner(nested_corner)
            continue

        normalized[corner] = {
            "position": _normalize_text(raw.get(f"{corner}_position")),
            "hsr": _normalize_text(raw.get(f"{corner}_hsr")),
            "lsr": _normalize_text(raw.get(f"{corner}_lsr")),
            "hsb": _normalize_text(raw.get(f"{corner}_hsb") or raw.get(f"{corner}_hbs")),
            "lsb": _normalize_text(raw.get(f"{corner}_lsb")),
            "total_setup": _normalize_text(raw.get(f"{corner}_total_setup")),
        }
    return normalized


def _normalize_pressures(value: Any) -> dict[str, str]:
    raw = _dict(value)
    cold = _dict(raw.get("cold"))
    hot = _dict(raw.get("hot"))
    normalized = _empty_pressures()
    normalized["cold_fl"] = _normalize_text(raw.get("cold_fl") or cold.get("fl"))
    normalized["cold_fr"] = _normalize_text(raw.get("cold_fr") or cold.get("fr"))
    normalized["cold_rl"] = _normalize_text(raw.get("cold_rl") or cold.get("rl"))
    normalized["cold_rr"] = _normalize_text(raw.get("cold_rr") or cold.get("rr"))
    normalized["hot_fl"] = _normalize_text(raw.get("hot_fl") or hot.get("fl"))
    normalized["hot_fr"] = _normalize_text(raw.get("hot_fr") or hot.get("fr"))
    normalized["hot_rl"] = _normalize_text(raw.get("hot_rl") or hot.get("rl"))
    normalized["hot_rr"] = _normalize_text(raw.get("hot_rr") or hot.get("rr"))
    return normalized


def _normalize_alignment(value: Any) -> dict[str, str]:
    raw = _dict(value)
    normalized = _empty_alignment()
    normalized["ride_height_f"] = _normalize_text(raw.get("ride_height_f"))
    normalized["ride_height_r"] = _normalize_text(raw.get("ride_height_r"))
    normalized["rh_fl"] = _normalize_text(raw.get("rh_fl")) or normalized["ride_height_f"]
    normalized["rh_fr"] = _normalize_text(raw.get("rh_fr")) or normalized["ride_height_f"]
    normalized["rh_rl"] = _normalize_text(raw.get("rh_rl")) or normalized["ride_height_r"]
    normalized["rh_rr"] = _normalize_text(raw.get("rh_rr")) or normalized["ride_height_r"]
    normalized["camber_fl"] = _normalize_text(raw.get("camber_fl"))
    normalized["camber_fr"] = _normalize_text(raw.get("camber_fr"))
    normalized["camber_rl"] = _normalize_text(raw.get("camber_rl"))
    normalized["camber_rr"] = _normalize_text(raw.get("camber_rr"))
    normalized["toe_front"] = _normalize_text(raw.get("toe_front"))
    normalized["toe_rear"] = _normalize_text(raw.get("toe_rear"))
    normalized["toe_fl"] = _normalize_text(raw.get("toe_fl")) or normalized["toe_front"]
    normalized["toe_fr"] = _normalize_text(raw.get("toe_fr")) or normalized["toe_front"]
    normalized["toe_rl"] = _normalize_text(raw.get("toe_rl")) or normalized["toe_rear"]
    normalized["toe_rr"] = _normalize_text(raw.get("toe_rr")) or normalized["toe_rear"]
    normalized["caster_l"] = _normalize_text(raw.get("caster_l"))
    normalized["caster_r"] = _normalize_text(raw.get("caster_r"))
    normalized["rake_mm"] = _normalize_text(raw.get("rake_mm"))
    normalized["wheelbase_mm"] = _normalize_text(raw.get("wheelbase_mm"))
    return normalized


def _normalize_string_map(value: Any, template: dict[str, str]) -> dict[str, str]:
    raw = _dict(value)
    normalized = template.copy()
    for key in normalized:
        normalized[key] = _normalize_text(raw.get(key))
    return normalized


def _count_meaningful_fields(setup: dict[str, Any], notes: list[str], raw_text: str) -> int:
    total = 0
    for group_key in ("alignment", "pressures", "suspension", "tire_temperatures", "sheet_fields", "post_session"):
        group = _dict(setup.get(group_key))
        total += sum(1 for value in group.values() if _normalize_text(value))

    shock_setup = _dict(setup.get("shock_setup"))
    for corner in ("rr", "lr", "lf", "rf"):
        total += sum(1 for value in _dict(shock_setup.get(corner)).values() if _normalize_text(value))

    if notes:
        total += len(notes)
    if raw_text:
        total += 1
    return total


def normalize_image_analysis_result(image_analysis: dict[str, Any] | None) -> dict[str, Any]:
    analysis = _dict(image_analysis)
    raw_setup = _dict(analysis.get("setup"))
    metadata = _dict(analysis.get("metadata"))

    normalized_setup = {
        "alignment": _normalize_alignment(raw_setup.get("alignment")),
        "pressures": _normalize_pressures(raw_setup.get("pressures")),
        "suspension": _normalize_string_map(
            raw_setup.get("suspension") or raw_setup.get("suspensions"),
            _empty_suspension(),
        ),
        "tire_temperatures": _normalize_string_map(
            raw_setup.get("tire_temperatures"),
            _empty_tire_temperatures(),
        ),
        "sheet_fields": _normalize_string_map(raw_setup.get("sheet_fields"), _empty_sheet_fields()),
        "post_session": _normalize_string_map(raw_setup.get("post_session"), _empty_post_session()),
        "shock_setup": _normalize_shock_setup(raw_setup.get("shock_setup")),
        "notes": _normalize_notes(raw_setup.get("notes") or analysis.get("notes")),
    }

    extracted_text = _normalize_text(analysis.get("raw_text")) or _normalize_text(analysis.get("extracted_text"))
    warnings = _normalize_flags(analysis.get("warnings"))
    confidence = _normalize_float(analysis.get("confidence"))
    field_count = _count_meaningful_fields(normalized_setup, normalized_setup["notes"], extracted_text)
    doc_type = _normalize_doc_type(analysis.get("document_type"))

    if not doc_type or doc_type == "unknown":
        if _is_blankish_document(
            doc_type=doc_type,
            raw_text=extracted_text,
            field_count=field_count,
            notes=normalized_setup["notes"],
        ):
            doc_type = "blank_setup_sheet"
        elif field_count > 0:
            doc_type = "mixed_session_notes"
        else:
            doc_type = "unknown"

    if confidence < OCR_PRIMARY_CONFIDENCE_THRESHOLD and "low confidence extraction" not in warnings:
        warnings.append("low confidence extraction")

    if field_count == 0 and not extracted_text and "no readable setup values detected" not in warnings:
        warnings.append("no readable setup values detected")

    flag_text = " ".join(warnings).lower()
    if doc_type not in {"blank_setup_sheet", "unknown"} and (
        confidence < OCR_PRIMARY_CONFIDENCE_THRESHOLD
        or any(keyword in flag_text for keyword in OCR_SEVERE_QUALITY_FLAG_KEYWORDS)
    ):
        doc_type = "low_quality_review_required"

    recommended_review_status = _normalize_text(analysis.get("recommended_review_status")) or "PENDING"
    if doc_type != "unknown":
        recommended_review_status = "PENDING"

    return {
        "document_type": doc_type,
        "template_name": _normalize_text(analysis.get("template_name")),
        "confidence": confidence,
        "summary": _normalize_text(analysis.get("summary")),
        "extracted_text": extracted_text,
        "raw_text": extracted_text,
        "metadata": {
            "driver_text": _normalize_text(metadata.get("driver_text")),
            "track_text": _normalize_text(metadata.get("track_text")),
            "session_text": _normalize_text(metadata.get("session_text")),
        },
        "setup": normalized_setup,
        "warnings": warnings,
        "recommended_review_status": recommended_review_status,
        "parser_version": _normalize_text(analysis.get("parser_version")) or IMAGE_ANALYSIS_PARSER_VERSION,
        "model": _normalize_text(analysis.get("model")),
        "fallback_model_used": bool(analysis.get("fallback_model_used")),
        "_field_count": field_count,
    }


def _should_retry_with_fallback(image_analysis: dict[str, Any], fallback_model: str | None) -> tuple[bool, str | None]:
    if not fallback_model:
        return False, None

    doc_type = _normalize_doc_type(image_analysis.get("document_type"))
    confidence = _normalize_float(image_analysis.get("confidence"))
    review_flags = _normalize_flags(image_analysis.get("warnings"))
    field_count = int(image_analysis.get("_field_count") or 0)
    raw_text = _normalize_text(image_analysis.get("raw_text"))
    flag_text = " ".join(review_flags).lower()

    if doc_type == "low_quality_review_required":
        return True, "primary_marked_low_quality"
    if confidence < OCR_PRIMARY_CONFIDENCE_THRESHOLD:
        return True, "primary_low_confidence"
    if any(keyword in flag_text for keyword in OCR_REVIEW_FLAG_KEYWORDS):
        return True, "primary_high_ambiguity"
    if doc_type not in {"blank_setup_sheet", "unknown"} and field_count < OCR_MIN_MEANINGFUL_FIELDS and not raw_text:
        return True, "primary_sparse_result"
    return False, None


def _response_output_text(response_payload: dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str):
        return output_text

    pieces: list[str] = []
    for item in response_payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content") or []:
            if not isinstance(content, dict):
                continue
            text_value = content.get("text")
            if isinstance(text_value, str):
                pieces.append(text_value)
    return "".join(pieces)


def _context_line(
    *,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
) -> str:
    return (
        f"Known context: event={event.name}, track={event.track}, run_group={run_group.raw_text}, "
        f"driver={driver.driver_id if driver else 'unknown'}, "
        f"vehicle={vehicle.vehicle_id if vehicle else 'unknown'}."
    )


def _request_image_analysis(
    *,
    api_key: str,
    image_url: str,
    model: str,
    prompt: str,
    timeout_seconds: float,
) -> dict[str, Any] | None:
    payload = {
        "model": model,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_url, "detail": "auto"},
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": IMAGE_ANALYSIS_SCHEMA_NAME,
                "schema": IMAGE_ANALYSIS_SCHEMA,
                "strict": True,
            }
        },
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        logger.warning("OpenAI image analysis failed: status=%s model=%s", error.code, model)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        logger.warning("OpenAI image analysis failed for model=%s: %s", model, error)
        return None

    raw_text = _response_output_text(response_payload).strip()
    if not raw_text:
        logger.warning("OpenAI image analysis returned no output text for model=%s", model)
        return None

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.warning("OpenAI image analysis returned invalid JSON for model=%s", model)
        return None

    parsed["parser_version"] = IMAGE_ANALYSIS_PARSER_VERSION
    parsed["model"] = model
    return parsed


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
    image_url = (submission.image_url or "").strip()
    if ocr_config["missing_requirements"] or not image_url:
        return None

    prompt = (
        "You are reviewing SM Racing OCR input for a race-weekend setup workflow."
        "\n"
        "Classify the image as exactly one of: blank_setup_sheet, handwritten_setup_grid, "
        "printed_form_with_values, shock_setup_sheet, mixed_session_notes, "
        "low_quality_review_required, or unknown."
        "\n"
        "These sheets may be blank printed templates, Alex-style handwritten 2x2 quadrant notes, "
        "shock setup pages, or mixed notebook/session notes."
        "\n"
        "Extract only text and values that are actually visible. Do not guess unclear numbers, "
        "crossed-out values, overwritten values, or uncertain label mappings. Preserve decimals, "
        "fractions, shorthand, and free-form notes in extracted_text and notes when they cannot be "
        "mapped confidently."
        "\n"
        "Apply this 2x2 grid mapping rule whenever a setup value is shown as a quadrant grid: "
        "top-left=FL, top-right=FR, bottom-left=RL, bottom-right=RR."
        "\n"
        "Recognize common labels and shorthand: Ride Height / RH / RH2, Camber / C / C2, Toe, "
        "Wheelbase / WB, cold/hot pressures, bump, rebound, HSR, LSR, HSB/HBS, LSB, RR/LR/LF/RF, "
        "corner weight, roll-bar, springs, bump-stops, and after-session set-down."
        "\n"
        "If the sheet is blank, low quality, or mostly unreadable, return empty mapped fields, keep "
        "raw/unstructured text if any, and add review flags. Never auto-finalize OCR data."
        "\n"
        "Use empty strings or empty arrays for missing values. Keep recommended_review_status as "
        "PENDING unless the document is clearly unrelated."
        "\n\n"
        f"{_context_line(event=event, run_group=run_group, driver=driver, vehicle=vehicle)}"
    )
    api_key = settings.openai_api_key.strip()
    fallback_model = ocr_config["fallback_model"]
    primary_model = ocr_config["primary_model"]

    primary_result = _request_image_analysis(
        api_key=api_key,
        image_url=image_url,
        model=primary_model,
        prompt=prompt,
        timeout_seconds=settings.openai_request_timeout_seconds,
    )
    normalized_primary = normalize_image_analysis_result(primary_result) if primary_result else None

    if normalized_primary is not None:
        should_retry, retry_reason = _should_retry_with_fallback(normalized_primary, fallback_model)
        if should_retry and fallback_model:
            logger.warning(
                "Primary OCR result needs fallback retry: reason=%s fallback_model=%s",
                retry_reason,
                fallback_model,
            )
            fallback_result = _request_image_analysis(
                api_key=api_key,
                image_url=image_url,
                model=fallback_model,
                prompt=prompt,
                timeout_seconds=settings.openai_request_timeout_seconds,
            )
            if fallback_result is not None:
                normalized_fallback = normalize_image_analysis_result(fallback_result)
                normalized_fallback["fallback_model_used"] = True
                normalized_fallback["model"] = fallback_model
                return normalized_fallback
        return normalized_primary

    if fallback_model:
        logger.warning(
            "Primary OCR model failed or returned malformed output; retrying with fallback model=%s",
            fallback_model,
        )
        fallback_result = _request_image_analysis(
            api_key=api_key,
            image_url=image_url,
            model=fallback_model,
            prompt=prompt,
            timeout_seconds=settings.openai_request_timeout_seconds,
        )
        if fallback_result is not None:
            normalized_fallback = normalize_image_analysis_result(fallback_result)
            normalized_fallback["fallback_model_used"] = True
            normalized_fallback["model"] = fallback_model
            return normalized_fallback

    return None
