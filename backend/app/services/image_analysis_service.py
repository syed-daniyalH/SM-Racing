from __future__ import annotations

import base64
import binascii
import json
import logging
import re
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
OCR_ABBREVIATION_MAP = {
    "RH": "ride_height",
    "RH2": "ride_height_after",
    "RIDE HGT": "ride_height",
    "RIDE HEIGHT": "ride_height",
    "HEIGHT": "ride_height",
    "C": "camber",
    "C2": "camber_after",
    "CAMBER": "camber",
    "TOE": "toe",
    "IN": "toe_in",
    "OUT": "toe_out",
    "WB": "wheelbase",
    "WHEEL BASE": "wheelbase",
    "WHEELBASE": "wheelbase",
    "TP": "tire_pressure",
    "TIRE PRESSURE": "tire_pressure",
    "COLD": "cold_pressure",
    "HOT": "hot_pressure",
    "SHOCK": "shock_setup",
    "SHOCKS": "shock_setup",
    "RR": "rear_right",
    "LR": "rear_left",
    "LF": "left_front",
    "RF": "right_front",
    "HSR": "high_speed_rebound",
    "LSR": "low_speed_rebound",
    "HSB": "high_speed_bump",
    "HBS": "high_speed_bump",
    "LSB": "low_speed_bump",
    "BUMP": "bump",
    "REBOUND": "rebound",
    "ARB": "anti_roll_bar",
    "ROLL BAR": "anti_roll_bar",
    "ROLL-BAR": "anti_roll_bar",
}
DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>[\w.+/-]+);base64,(?P<data>[A-Za-z0-9+/=\s]+)$", re.IGNORECASE)
DEFAULT_EXTRACTION_FAILED_MESSAGE = (
    "OCR extraction could not build a safe draft from this image. Retry with a clearer image or use manual correction."
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
        "raw_evidence": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "visible_text": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "detected_grids": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "label": {"type": "string"},
                            "canonical_label": {"type": "string"},
                            "top_left": {"type": "string"},
                            "top_right": {"type": "string"},
                            "bottom_left": {"type": "string"},
                            "bottom_right": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": [
                            "label",
                            "canonical_label",
                            "top_left",
                            "top_right",
                            "bottom_left",
                            "bottom_right",
                            "note",
                        ],
                    },
                },
                "detected_labels": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "label": {"type": "string"},
                            "canonical_label": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["label", "canonical_label", "note"],
                    },
                },
                "unmapped_values": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["visible_text", "detected_grids", "detected_labels", "unmapped_values"],
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
        "raw_evidence",
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


def _empty_raw_evidence() -> dict[str, list[Any]]:
    return {
        "visible_text": [],
        "detected_grids": [],
        "detected_labels": [],
        "unmapped_values": [],
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


def _append_warning(warnings: list[str], warning: str) -> None:
    text = _normalize_text(warning)
    if text and text not in warnings:
        warnings.append(text)


def _canonicalize_label(value: Any) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", " ", _normalize_text(value).upper()).strip()
    if not normalized:
        return ""
    return OCR_ABBREVIATION_MAP.get(normalized, normalized.lower())


def _normalize_raw_evidence(value: Any) -> dict[str, Any]:
    raw = _dict(value)
    normalized = _empty_raw_evidence()
    normalized["visible_text"] = _normalize_notes(raw.get("visible_text"))
    normalized["unmapped_values"] = _normalize_notes(raw.get("unmapped_values"))

    detected_labels: list[dict[str, str]] = []
    for entry in _list(raw.get("detected_labels")):
        entry_map = _dict(entry)
        label = _normalize_text(entry_map.get("label") or entry)
        canonical_label = _normalize_text(entry_map.get("canonical_label")) or _canonicalize_label(label)
        note = _normalize_text(entry_map.get("note"))
        if label or canonical_label or note:
            detected_labels.append(
                {
                    "label": label,
                    "canonical_label": canonical_label,
                    "note": note,
                }
            )
    normalized["detected_labels"] = detected_labels

    detected_grids: list[dict[str, str]] = []
    for entry in _list(raw.get("detected_grids")):
        entry_map = _dict(entry)
        label = _normalize_text(entry_map.get("label"))
        canonical_label = _normalize_text(entry_map.get("canonical_label")) or _canonicalize_label(label)
        grid = {
            "label": label,
            "canonical_label": canonical_label,
            "top_left": _normalize_text(entry_map.get("top_left")),
            "top_right": _normalize_text(entry_map.get("top_right")),
            "bottom_left": _normalize_text(entry_map.get("bottom_left")),
            "bottom_right": _normalize_text(entry_map.get("bottom_right")),
            "note": _normalize_text(entry_map.get("note")),
        }
        if any(grid.values()):
            detected_grids.append(grid)
    normalized["detected_grids"] = detected_grids
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
    return {
        "position": _normalize_text(raw.get("position")),
        "hsr": _normalize_text(raw.get("hsr")),
        "lsr": _normalize_text(raw.get("lsr")),
        "hsb": _normalize_text(raw.get("hsb") or raw.get("hbs")),
        "lsb": _normalize_text(raw.get("lsb")),
        "total_setup": _normalize_text(raw.get("total_setup")),
    }


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


def _apply_corner_grid(
    alignment: dict[str, str],
    *,
    key_prefix: str,
    grid: dict[str, str],
    warnings: list[str],
    use_after_values: bool = False,
) -> None:
    existing_values = [
        alignment.get(f"{key_prefix}_fl", ""),
        alignment.get(f"{key_prefix}_fr", ""),
        alignment.get(f"{key_prefix}_rl", ""),
        alignment.get(f"{key_prefix}_rr", ""),
    ]
    incoming_values = [
        _normalize_text(grid.get("top_left")),
        _normalize_text(grid.get("top_right")),
        _normalize_text(grid.get("bottom_left")),
        _normalize_text(grid.get("bottom_right")),
    ]

    if use_after_values and any(existing_values) and any(incoming_values):
        _append_warning(warnings, "Before and after values detected; after value used.")

    if not any(incoming_values):
        return

    if use_after_values or not any(existing_values):
        alignment[f"{key_prefix}_fl"] = incoming_values[0]
        alignment[f"{key_prefix}_fr"] = incoming_values[1]
        alignment[f"{key_prefix}_rl"] = incoming_values[2]
        alignment[f"{key_prefix}_rr"] = incoming_values[3]


def _sync_alignment_rollups(alignment: dict[str, str]) -> None:
    if not _normalize_text(alignment.get("ride_height_f")):
        if alignment.get("rh_fl") and alignment.get("rh_fl") == alignment.get("rh_fr"):
            alignment["ride_height_f"] = alignment["rh_fl"]
    if not _normalize_text(alignment.get("ride_height_r")):
        if alignment.get("rh_rl") and alignment.get("rh_rl") == alignment.get("rh_rr"):
            alignment["ride_height_r"] = alignment["rh_rl"]
    if not _normalize_text(alignment.get("toe_front")):
        if alignment.get("toe_fl") and alignment.get("toe_fl") == alignment.get("toe_fr"):
            alignment["toe_front"] = alignment["toe_fl"]
    if not _normalize_text(alignment.get("toe_rear")):
        if alignment.get("toe_rl") and alignment.get("toe_rl") == alignment.get("toe_rr"):
            alignment["toe_rear"] = alignment["toe_rl"]


def _apply_raw_grid_mapping(
    *,
    alignment: dict[str, str],
    sheet_fields: dict[str, str],
    raw_evidence: dict[str, Any],
    warnings: list[str],
) -> None:
    for grid in raw_evidence.get("detected_grids", []):
        label = _normalize_text(grid.get("label"))
        canonical_label = _normalize_text(grid.get("canonical_label")) or _canonicalize_label(label)
        if not canonical_label:
            _append_warning(warnings, "Grid label could not be mapped confidently.")
            continue

        if canonical_label == "ride_height":
            _apply_corner_grid(alignment, key_prefix="rh", grid=grid, warnings=warnings)
        elif canonical_label == "ride_height_after":
            _apply_corner_grid(
                alignment,
                key_prefix="rh",
                grid=grid,
                warnings=warnings,
                use_after_values=True,
            )
        elif canonical_label == "camber":
            _apply_corner_grid(alignment, key_prefix="camber", grid=grid, warnings=warnings)
        elif canonical_label == "camber_after":
            _apply_corner_grid(
                alignment,
                key_prefix="camber",
                grid=grid,
                warnings=warnings,
                use_after_values=True,
            )
        elif canonical_label == "toe":
            _apply_corner_grid(alignment, key_prefix="toe", grid=grid, warnings=warnings)
        elif canonical_label == "wheelbase":
            wheelbase_candidates = [
                _normalize_text(grid.get("top_left")),
                _normalize_text(grid.get("top_right")),
                _normalize_text(grid.get("bottom_left")),
                _normalize_text(grid.get("bottom_right")),
            ]
            wheelbase_candidates = [candidate for candidate in wheelbase_candidates if candidate]
            if wheelbase_candidates:
                if not alignment.get("wheelbase_mm"):
                    alignment["wheelbase_mm"] = wheelbase_candidates[-1]
                if not sheet_fields.get("wheelbase_left_mm"):
                    sheet_fields["wheelbase_left_mm"] = wheelbase_candidates[0]
                if len(wheelbase_candidates) > 1 and not sheet_fields.get("wheelbase_right_mm"):
                    sheet_fields["wheelbase_right_mm"] = wheelbase_candidates[1]
        else:
            if grid.get("note"):
                _append_warning(warnings, f"Grid mapping uncertain for label '{label or canonical_label}'.")

    _sync_alignment_rollups(alignment)


def _derive_ocr_status(
    *,
    doc_type: str,
    confidence: float,
    field_count: int,
    raw_text: str,
    warnings: list[str],
) -> str:
    if doc_type == "extraction_failed":
        return "extraction_failed"
    if doc_type in {"unknown", "blank_setup_sheet", "low_quality_review_required"}:
        return "review_required"
    if confidence < OCR_PRIMARY_CONFIDENCE_THRESHOLD:
        return "review_required"
    if field_count < OCR_MIN_MEANINGFUL_FIELDS:
        return "review_required"
    if not raw_text:
        return "review_required"
    if warnings:
        return "review_required"
    return "success"


def normalize_image_analysis_result(image_analysis: dict[str, Any] | None) -> dict[str, Any]:
    analysis = _dict(image_analysis)
    raw_setup = _dict(analysis.get("setup"))
    metadata = _dict(analysis.get("metadata"))
    raw_evidence = _normalize_raw_evidence(analysis.get("raw_evidence"))
    requested_status = _normalize_text(analysis.get("status"))

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
    if not extracted_text and raw_evidence["visible_text"]:
        extracted_text = "\n".join(raw_evidence["visible_text"])
    warnings = _normalize_flags(analysis.get("warnings"))
    confidence = _normalize_float(analysis.get("confidence"))
    doc_type = _normalize_doc_type(analysis.get("document_type"))

    _apply_raw_grid_mapping(
        alignment=normalized_setup["alignment"],
        sheet_fields=normalized_setup["sheet_fields"],
        raw_evidence=raw_evidence,
        warnings=warnings,
    )

    if normalized_setup["notes"] == [] and raw_evidence["unmapped_values"]:
        normalized_setup["notes"] = raw_evidence["unmapped_values"]

    field_count = _count_meaningful_fields(normalized_setup, normalized_setup["notes"], extracted_text)

    if requested_status != "extraction_failed" and (not doc_type or doc_type == "unknown"):
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

    if field_count < OCR_MIN_MEANINGFUL_FIELDS:
        _append_warning(warnings, "Some values could not be mapped")

    flag_text = " ".join(warnings).lower()
    if requested_status != "extraction_failed" and doc_type not in {"blank_setup_sheet", "unknown"} and (
        confidence < OCR_PRIMARY_CONFIDENCE_THRESHOLD
        or any(keyword in flag_text for keyword in OCR_SEVERE_QUALITY_FLAG_KEYWORDS)
    ):
        doc_type = "low_quality_review_required"

    recommended_review_status = _normalize_text(analysis.get("recommended_review_status")) or "PENDING"
    if doc_type != "unknown":
        recommended_review_status = "PENDING"

    status = requested_status or _derive_ocr_status(
        doc_type=doc_type,
        confidence=confidence,
        field_count=field_count,
        raw_text=extracted_text,
        warnings=warnings,
    )
    if status == "review_required":
        _append_warning(warnings, "Manual review required")

    return {
        "status": status,
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
        "raw_evidence": raw_evidence,
        "setup": normalized_setup,
        "warnings": warnings,
        "recommended_review_status": recommended_review_status,
        "parser_version": _normalize_text(analysis.get("parser_version")) or IMAGE_ANALYSIS_PARSER_VERSION,
        "model": _normalize_text(analysis.get("model")),
        "fallback_model_used": bool(analysis.get("fallback_model_used")),
        "message": _normalize_text(analysis.get("message")),
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

    if doc_type == "unknown":
        return True, "primary_unknown_doc_type"
    if doc_type == "low_quality_review_required":
        return True, "primary_marked_low_quality"
    if confidence < OCR_PRIMARY_CONFIDENCE_THRESHOLD:
        return True, "primary_low_confidence"
    if any(keyword in flag_text for keyword in OCR_REVIEW_FLAG_KEYWORDS):
        return True, "primary_high_ambiguity"
    if not raw_text and doc_type != "blank_setup_sheet":
        return True, "primary_missing_raw_text"
    if doc_type not in {"blank_setup_sheet", "unknown"} and field_count < OCR_MIN_MEANINGFUL_FIELDS:
        return True, "primary_sparse_result"
    return False, None


def _parse_data_url(image_url: str) -> tuple[str, bytes] | None:
    match = DATA_URL_PATTERN.match(image_url.strip())
    if not match:
        return None

    try:
        decoded = base64.b64decode(match.group("data"), validate=True)
    except (ValueError, binascii.Error):
        return None

    return match.group("mime").lower(), decoded


def _png_dimensions(image_bytes: bytes) -> tuple[int | None, int | None]:
    if len(image_bytes) < 24 or not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return None, None
    return int.from_bytes(image_bytes[16:20], "big"), int.from_bytes(image_bytes[20:24], "big")


def _jpeg_dimensions(image_bytes: bytes) -> tuple[int | None, int | None]:
    if len(image_bytes) < 4 or image_bytes[:2] != b"\xff\xd8":
        return None, None

    index = 2
    while index + 9 < len(image_bytes):
        if image_bytes[index] != 0xFF:
            index += 1
            continue
        marker = image_bytes[index + 1]
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            height = int.from_bytes(image_bytes[index + 5:index + 7], "big")
            width = int.from_bytes(image_bytes[index + 7:index + 9], "big")
            return width, height
        if index + 4 >= len(image_bytes):
            break
        segment_length = int.from_bytes(image_bytes[index + 2:index + 4], "big")
        if segment_length <= 0:
            break
        index += segment_length + 2
    return None, None


def _webp_dimensions(image_bytes: bytes) -> tuple[int | None, int | None]:
    if len(image_bytes) < 30 or image_bytes[:4] != b"RIFF" or image_bytes[8:12] != b"WEBP":
        return None, None

    chunk_type = image_bytes[12:16]
    if chunk_type == b"VP8X" and len(image_bytes) >= 30:
        width = int.from_bytes(image_bytes[24:27] + b"\x00", "little") + 1
        height = int.from_bytes(image_bytes[27:30] + b"\x00", "little") + 1
        return width, height
    return None, None


def _inspect_image_payload(image_url: str) -> dict[str, Any]:
    image_info = {
        "image_url": image_url,
        "mime_type": None,
        "size_bytes": None,
        "width": None,
        "height": None,
        "detail": "high",
        "preprocessing_notes": [],
    }
    parsed = _parse_data_url(image_url)
    if not parsed:
        return image_info

    mime_type, image_bytes = parsed
    image_info["mime_type"] = "image/jpeg" if mime_type == "image/jpg" else mime_type
    image_info["size_bytes"] = len(image_bytes)

    width, height = None, None
    if image_info["mime_type"] == "image/png":
        width, height = _png_dimensions(image_bytes)
    elif image_info["mime_type"] == "image/jpeg":
        width, height = _jpeg_dimensions(image_bytes)
    elif image_info["mime_type"] == "image/webp":
        width, height = _webp_dimensions(image_bytes)

    image_info["width"] = width
    image_info["height"] = height

    if image_info["size_bytes"] is not None and image_info["size_bytes"] < 1024:
        image_info["preprocessing_notes"].append("image payload is very small")
    if width is not None and height is not None and min(width, height) < 320:
        image_info["preprocessing_notes"].append("image resolution is very small")

    return image_info


def _placeholder_analysis_from_raw_text(*, raw_text: str, model: str, warning: str) -> dict[str, Any]:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    return {
        "status": "review_required",
        "document_type": "low_quality_review_required",
        "template_name": "",
        "confidence": 0.2,
        "summary": "Raw OCR text returned without a fully structured schema draft.",
        "raw_text": raw_text,
        "extracted_text": raw_text,
        "metadata": {
            "driver_text": "",
            "track_text": "",
            "session_text": "",
        },
        "raw_evidence": {
            "visible_text": lines,
            "detected_grids": [],
            "detected_labels": [],
            "unmapped_values": lines,
        },
        "setup": {},
        "warnings": [warning, "Manual review required", "Some values could not be mapped"],
        "recommended_review_status": "PENDING",
        "parser_version": IMAGE_ANALYSIS_PARSER_VERSION,
        "model": model,
    }


def _parse_model_payload(raw_text: str, model: str) -> dict[str, Any] | None:
    candidate = raw_text.strip()
    if not candidate:
        return None

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end > start:
            snippet = candidate[start : end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError:
                logger.warning("OpenAI OCR returned non-normalizable JSON envelope for model=%s", model)
        logger.warning("OpenAI OCR returned unstructured text for model=%s; creating review-required placeholder", model)
        return _placeholder_analysis_from_raw_text(
            raw_text=raw_text,
            model=model,
            warning="Structured OCR mapping could not be parsed; raw OCR text preserved.",
        )


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
    image_info = _inspect_image_payload(image_url)
    logger.info(
        "OCR request starting: model=%s mime_type=%s size_bytes=%s width=%s height=%s detail=%s notes=%s",
        model,
        image_info["mime_type"] or "unknown",
        image_info["size_bytes"],
        image_info["width"],
        image_info["height"],
        image_info["detail"],
        len(image_info["preprocessing_notes"]),
    )
    payload = {
        "model": model,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_info["image_url"], "detail": image_info["detail"]},
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
        logger.info("OCR request completed: model=%s parse_transport=success", model)
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

    parsed = _parse_model_payload(raw_text, model)
    if parsed is None:
        logger.warning("OpenAI image analysis returned no normalizable payload for model=%s", model)
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
    logger.info(
        "OCR analyze request received: has_image=%s primary_model=%s fallback_model=%s",
        bool(image_url),
        ocr_config["primary_model"],
        ocr_config["fallback_model"] or "none",
    )
    if ocr_config["missing_requirements"] or not image_url:
        logger.warning(
            "OCR analyze request skipped: missing_requirements=%s has_image=%s",
            ocr_config["missing_requirements"],
            bool(image_url),
        )
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
        "Stage A: capture raw OCR evidence in raw_evidence. Include visible_text, detected_labels, "
        "detected_grids, and unmapped_values. Preserve unclear strings exactly instead of guessing."
        "\n"
        "Stage B: map the raw evidence into setup fields using racing abbreviations. Use the fixed "
        "2x2 grid mapping top-left=FL, top-right=FR, bottom-left=RL, bottom-right=RR unless the "
        "sheet explicitly labels a different position."
        "\n"
        "If both before/after values appear, RH2 overrides RH and C2 overrides C in the mapped schema. "
        "Add a review flag saying 'Before and after values detected; after value used.' and preserve "
        "the original evidence in raw_evidence or extracted_text."
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
        logger.info(
            "OCR primary normalized: status=%s doc_type=%s confidence=%.2f field_count=%s review_flags=%s",
            normalized_primary["status"],
            normalized_primary["document_type"],
            normalized_primary["confidence"],
            normalized_primary.get("_field_count"),
            len(normalized_primary["warnings"]),
        )
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
                logger.info(
                    "OCR fallback normalized: status=%s doc_type=%s confidence=%.2f field_count=%s review_flags=%s",
                    normalized_fallback["status"],
                    normalized_fallback["document_type"],
                    normalized_fallback["confidence"],
                    normalized_fallback.get("_field_count"),
                    len(normalized_fallback["warnings"]),
                )
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
            logger.info(
                "OCR fallback normalized after primary transport failure: status=%s doc_type=%s confidence=%.2f field_count=%s review_flags=%s",
                normalized_fallback["status"],
                normalized_fallback["document_type"],
                normalized_fallback["confidence"],
                normalized_fallback.get("_field_count"),
                len(normalized_fallback["warnings"]),
            )
            return normalized_fallback

    logger.warning("OCR analyze request ended without any safe normalized draft")
    return None
