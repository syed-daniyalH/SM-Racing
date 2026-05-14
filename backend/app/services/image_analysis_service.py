from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from app.core.config import get_settings
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.models.vehicle import Vehicle


logger = logging.getLogger(__name__)
IMAGE_ANALYSIS_SCHEMA_NAME = "sm_racing_image_analysis"
IMAGE_ANALYSIS_PARSER_VERSION = "sm-racing-image-analysis-v2"


IMAGE_ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "document_type": {
            "type": "string",
            "enum": ["schedule", "setup_sheet", "session_note", "unknown"],
        },
        "template_name": {"type": "string"},
        "confidence": {"type": "number"},
        "summary": {"type": "string"},
        "extracted_text": {"type": "string"},
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "track": {"type": "string"},
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["name", "track", "start_date", "end_date", "notes"],
            },
        },
        "sessions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "date": {"type": "string"},
                    "time": {"type": "string"},
                    "track": {"type": "string"},
                    "session_type": {"type": "string"},
                    "session_number": {"type": "string"},
                    "duration_min": {"type": "string"},
                    "driver_id": {"type": "string"},
                    "vehicle_id": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": [
                    "date",
                    "time",
                    "track",
                    "session_type",
                    "session_number",
                    "duration_min",
                    "driver_id",
                    "vehicle_id",
                    "notes",
                ],
            },
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
                        "sway_bar_f",
                        "sway_bar_r",
                        "wing_angle_deg",
                    ],
                },
                "alignment": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "camber_fl": {"type": "string"},
                        "camber_fr": {"type": "string"},
                        "camber_rl": {"type": "string"},
                        "camber_rr": {"type": "string"},
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
                        "camber_fl",
                        "camber_fr",
                        "camber_rl",
                        "camber_rr",
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
                        "rr_hsr": {"type": "string"},
                        "rr_lsr": {"type": "string"},
                        "rr_hsb": {"type": "string"},
                        "rr_lsb": {"type": "string"},
                        "rr_total_setup": {"type": "string"},
                        "lr_hsr": {"type": "string"},
                        "lr_lsr": {"type": "string"},
                        "lr_hsb": {"type": "string"},
                        "lr_lsb": {"type": "string"},
                        "lr_total_setup": {"type": "string"},
                        "lf_hsr": {"type": "string"},
                        "lf_lsr": {"type": "string"},
                        "lf_hsb": {"type": "string"},
                        "lf_lsb": {"type": "string"},
                        "lf_total_setup": {"type": "string"},
                        "rf_hsr": {"type": "string"},
                        "rf_lsr": {"type": "string"},
                        "rf_hsb": {"type": "string"},
                        "rf_lsb": {"type": "string"},
                        "rf_total_setup": {"type": "string"},
                    },
                    "required": [
                        "rr_hsr",
                        "rr_lsr",
                        "rr_hsb",
                        "rr_lsb",
                        "rr_total_setup",
                        "lr_hsr",
                        "lr_lsr",
                        "lr_hsb",
                        "lr_lsb",
                        "lr_total_setup",
                        "lf_hsr",
                        "lf_lsr",
                        "lf_hsb",
                        "lf_lsb",
                        "lf_total_setup",
                        "rf_hsr",
                        "rf_lsr",
                        "rf_hsb",
                        "rf_lsb",
                        "rf_total_setup",
                    ],
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
        "events",
        "sessions",
        "setup",
        "warnings",
        "recommended_review_status",
    ],
}


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


def analyze_submission_image(
    *,
    submission: Submission,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
) -> dict[str, Any] | None:
    settings = get_settings()
    image_url = (submission.image_url or "").strip()
    if not settings.chatbot_image_analysis_enabled or not settings.openai_api_key or not image_url:
        return None

    model = settings.openai_vision_model or settings.openai_model
    prompt = (
        "Analyze this SM Racing image for review. It may be a schedule, setup sheet, "
        "session note, or unrelated image. Extract only visible information. Use empty strings "
        "or empty arrays for missing data. Do not invent events, session IDs, driver IDs, car IDs, "
        "or setup values. Keep recommended_review_status as PENDING unless the image is unrelated. "
        "These images may be race setup templates, handwritten quadrant notes, or shocks setup sheets. "
        "Recognize common motorsport shorthand such as RH=ride height, CW/corner weight, FL/FR/RL/RR, "
        "and HSB/HBS as high-speed bump. Populate sheet_fields for template-specific labels like "
        "roll-bar, spacer, fuel, wing, wheelbase left/right, and after-session set-down. Populate "
        "shock_setup when the page is a dedicated shocks setup sheet."
        "\n\n"
        f"{_context_line(event=event, run_group=run_group, driver=driver, vehicle=vehicle)}"
    )

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
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=settings.openai_request_timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        logger.warning("OpenAI image analysis failed: status=%s", error.code)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        logger.warning("OpenAI image analysis failed: %s", error)
        return None

    raw_text = _response_output_text(response_payload).strip()
    if not raw_text:
        logger.warning("OpenAI image analysis returned no output text")
        return None

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.warning("OpenAI image analysis returned invalid JSON")
        return None

    parsed["parser_version"] = IMAGE_ANALYSIS_PARSER_VERSION
    parsed["model"] = model
    return parsed
