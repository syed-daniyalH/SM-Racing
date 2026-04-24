from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.core.enums import SeanceStatus, TireInventoryStatus
from app.models.driver import Driver
from app.models.event import Event
from app.models.structured_notes import (
    Alignment,
    Pressure,
    Seance,
    Suspension,
    TireHistory,
    TireInventory,
    TireTemperature,
    Track,
)
from app.models.submission import Submission
from app.models.user import User
from app.models.vehicle import Vehicle


STRUCTURED_HINT_KEYS = {
    "date",
    "time",
    "track",
    "driver_id",
    "vehicle_id",
    "session_type",
    "session_number",
    "duration_min",
    "tire_set",
    "wheelbase_mm",
    "pressures",
    "suspension",
    "alignment",
    "tire_temperatures",
    "tire_inventory",
}

class StructuredSubmissionError(ValueError):
    pass


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    return text or None


def _flatten_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    if any(key in payload for key in STRUCTURED_HINT_KEYS):
        return payload

    nested = payload.get("data")
    if isinstance(nested, dict):
        return nested

    return payload


def _parse_date(value: Any, field_name: str) -> date:
    cleaned = _clean_text(value)
    if not cleaned:
        raise StructuredSubmissionError(f"{field_name} is required")

    for parser in (date.fromisoformat,):
        try:
            return parser(cleaned)
        except ValueError:
            continue

    for fmt in ("%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue

    raise StructuredSubmissionError(f"{field_name} must be a valid date")


def _parse_time(value: Any, field_name: str) -> time:
    cleaned = _clean_text(value)
    if not cleaned:
        raise StructuredSubmissionError(f"{field_name} is required")

    for parser in (time.fromisoformat,):
        try:
            return parser(cleaned)
        except ValueError:
            continue

    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M:%S %p"):
        try:
            return datetime.strptime(cleaned, fmt).time()
        except ValueError:
            continue

    raise StructuredSubmissionError(f"{field_name} must be a valid time")


def _parse_int(value: Any, field_name: str, *, required: bool = False, default: int | None = None) -> int | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        if required:
            raise StructuredSubmissionError(f"{field_name} is required")
        return default

    try:
        return int(float(cleaned))
    except (TypeError, ValueError):
        raise StructuredSubmissionError(f"{field_name} must be a valid integer") from None


def _parse_decimal(value: Any, field_name: str) -> Decimal | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None

    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        raise StructuredSubmissionError(f"{field_name} must be a valid number") from None


def _parse_positive_decimal(value: Any, field_name: str) -> Decimal | None:
    parsed = _parse_decimal(value, field_name)
    if parsed is None:
        return None
    if parsed <= 0:
        raise StructuredSubmissionError(f"{field_name} must be greater than 0")
    return parsed


def _parse_tire_status(value: Any) -> TireInventoryStatus | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None  # preserve the existing status when the field is blank

    normalized = cleaned.upper()
    try:
        return TireInventoryStatus[normalized]
    except KeyError as exc:
        raise StructuredSubmissionError("tire_inventory.status must be ACTIVE or DISCARDED") from exc


def _set_if_not_none(instance: Any, attribute: str, value: Any) -> None:
    if value is not None:
        setattr(instance, attribute, value)


def _get_actor_label(current_user: User) -> str:
    return current_user.name.strip() or current_user.email.strip() or str(current_user.id)


def _upsert_single_row(db: Session, model: type[Any], primary_key_name: str, primary_key_value: Any, values: dict[str, Any]) -> Any:
    row = db.get(model, primary_key_value)
    if row is None:
        row = model(**{primary_key_name: primary_key_value})
        db.add(row)

    for attribute, value in values.items():
        _set_if_not_none(row, attribute, value)

    return row


def _build_pressure_values(section: dict[str, Any], prefix: str) -> dict[str, Decimal | None]:
    corners = section if isinstance(section, dict) else {}
    return {
        f"{prefix}_fl": _parse_decimal(corners.get("fl"), f"pressures.{prefix}.fl"),
        f"{prefix}_fr": _parse_decimal(corners.get("fr"), f"pressures.{prefix}.fr"),
        f"{prefix}_rl": _parse_decimal(corners.get("rl"), f"pressures.{prefix}.rl"),
        f"{prefix}_rr": _parse_decimal(corners.get("rr"), f"pressures.{prefix}.rr"),
    }


def save_structured_submission(
    db: Session,
    submission: Submission,
    event: Event,
    driver: Driver | None,
    vehicle: Vehicle | None,
    current_user: User,
) -> None:
    payload = _flatten_payload(submission.payload)
    if not payload:
        raise StructuredSubmissionError("Structured submission payload is missing")

    track_name = _clean_text(payload.get("track") or event.track)
    if not track_name:
        raise StructuredSubmissionError("track is required")

    driver_code = _clean_text(payload.get("driver_id") or (driver.driver_id if driver else None))
    if not driver_code:
        raise StructuredSubmissionError("driver_id is required")

    vehicle_code = _clean_text(payload.get("vehicle_id") or (vehicle.vehicle_id if vehicle else None))
    if not vehicle_code:
        raise StructuredSubmissionError("vehicle_id is required")

    tire_inventory = payload.get("tire_inventory") if isinstance(payload.get("tire_inventory"), dict) else {}
    tire_inventory_id = _clean_text(tire_inventory.get("tire_id") or payload.get("tire_set"))
    explicit_inventory_id = _clean_text(tire_inventory.get("tire_id"))
    payload_tire_set = _clean_text(payload.get("tire_set"))
    if explicit_inventory_id and payload_tire_set and explicit_inventory_id != payload_tire_set:
        raise StructuredSubmissionError("tire_inventory.tire_id must match tire_set when both are provided")

    session_date = _parse_date(payload.get("date"), "date")
    session_time = _parse_time(payload.get("time"), "time")
    session_type = _clean_text(payload.get("session_type")) or "Practice"
    session_number = _parse_int(payload.get("session_number"), "session_number", default=1)
    duration_min = _parse_int(payload.get("duration_min"), "duration_min", default=30)
    wheelbase_mm = _parse_positive_decimal(payload.get("wheelbase_mm"), "wheelbase_mm")
    notes = _clean_text(submission.raw_text)
    created_by = _get_actor_label(current_user)

    existing_inventory_row = db.get(TireInventory, tire_inventory_id) if tire_inventory_id else None
    inventory_has_values = any(
        value not in (None, "")
        for value in (
            tire_inventory.get("manufacturer"),
            tire_inventory.get("model"),
            tire_inventory.get("size"),
            tire_inventory.get("purchase_date"),
            tire_inventory.get("heat_cycles"),
            tire_inventory.get("track_time_min"),
            tire_inventory.get("status"),
        )
    )

    if inventory_has_values and not tire_inventory_id:
        raise StructuredSubmissionError("tire_inventory.tire_id is required when tire inventory data is provided")

    if tire_inventory_id and inventory_has_values:
        manufacturer = _clean_text(tire_inventory.get("manufacturer"))
        if manufacturer is None and existing_inventory_row is not None:
            manufacturer = existing_inventory_row.manufacturer
        if not manufacturer:
            raise StructuredSubmissionError("tire_inventory.manufacturer is required when tire inventory data is provided")

        purchase_date_value = tire_inventory.get("purchase_date")
        purchase_date = _parse_date(purchase_date_value, "tire_inventory.purchase_date") if _clean_text(purchase_date_value) else None

        tire_inventory_values = {
            "manufacturer": manufacturer,
            "model": _clean_text(tire_inventory.get("model")),
            "size": _clean_text(tire_inventory.get("size")),
            "purchase_date": purchase_date,
            "heat_cycles": _parse_int(tire_inventory.get("heat_cycles"), "tire_inventory.heat_cycles"),
            "track_time_min": _parse_int(tire_inventory.get("track_time_min"), "tire_inventory.track_time_min"),
            "status": _parse_tire_status(tire_inventory.get("status")),
        }
        _upsert_single_row(db, TireInventory, "tire_id", tire_inventory_id, tire_inventory_values)
        db.flush()

    tire_set = tire_inventory_id or payload_tire_set
    if tire_set and db.get(TireInventory, tire_set) is None:
        raise StructuredSubmissionError("tire_inventory data is required before seance can reference tire_set")

    _upsert_single_row(
        db,
        Track,
        "name",
        track_name,
        {
            "active": True,
        },
    )
    db.flush()

    seance = _upsert_single_row(
        db,
        Seance,
        "id_seance",
        submission.submission_ref,
        {
            "session_date": session_date,
            "session_time": session_time,
            "track": track_name,
            "driver_id": driver_code,
            "vehicle_id": vehicle_code,
            "session_type": session_type,
            "session_number": session_number,
            "duration_min": duration_min,
            "tire_set": tire_set,
            "notes": notes,
            "created_by": created_by,
            "status": SeanceStatus.ACTIVE,
        },
    )
    db.flush()

    pressures = payload.get("pressures") if isinstance(payload.get("pressures"), dict) else {}
    pressure_values = {
        **_build_pressure_values(pressures.get("cold") if isinstance(pressures, dict) else {}, "cold"),
        **_build_pressure_values(pressures.get("hot") if isinstance(pressures, dict) else {}, "hot"),
    }
    _upsert_single_row(db, Pressure, "id_seance", seance.id_seance, pressure_values)

    suspension = payload.get("suspension") if isinstance(payload.get("suspension"), dict) else {}
    suspension_values = {
        "rebound_fl": _parse_int(suspension.get("rebound_fl"), "suspension.rebound_fl"),
        "rebound_fr": _parse_int(suspension.get("rebound_fr"), "suspension.rebound_fr"),
        "rebound_rl": _parse_int(suspension.get("rebound_rl"), "suspension.rebound_rl"),
        "rebound_rr": _parse_int(suspension.get("rebound_rr"), "suspension.rebound_rr"),
        "bump_fl": _parse_int(suspension.get("bump_fl"), "suspension.bump_fl"),
        "bump_fr": _parse_int(suspension.get("bump_fr"), "suspension.bump_fr"),
        "bump_rl": _parse_int(suspension.get("bump_rl"), "suspension.bump_rl"),
        "bump_rr": _parse_int(suspension.get("bump_rr"), "suspension.bump_rr"),
        "sway_bar_f": _clean_text(suspension.get("sway_bar_f")),
        "sway_bar_r": _clean_text(suspension.get("sway_bar_r")),
        "wing_angle_deg": _parse_decimal(suspension.get("wing_angle_deg"), "suspension.wing_angle_deg"),
    }
    _upsert_single_row(db, Suspension, "id_seance", seance.id_seance, suspension_values)

    alignment = payload.get("alignment") if isinstance(payload.get("alignment"), dict) else {}
    alignment_values = {
        "camber_fl": _parse_decimal(alignment.get("camber_fl"), "alignment.camber_fl"),
        "camber_fr": _parse_decimal(alignment.get("camber_fr"), "alignment.camber_fr"),
        "camber_rl": _parse_decimal(alignment.get("camber_rl"), "alignment.camber_rl"),
        "camber_rr": _parse_decimal(alignment.get("camber_rr"), "alignment.camber_rr"),
        "toe_front": _clean_text(alignment.get("toe_front")),
        "toe_rear": _clean_text(alignment.get("toe_rear")),
        "caster_l": _parse_decimal(alignment.get("caster_l"), "alignment.caster_l"),
        "caster_r": _parse_decimal(alignment.get("caster_r"), "alignment.caster_r"),
        "ride_height_f": _parse_decimal(alignment.get("ride_height_f"), "alignment.ride_height_f"),
        "ride_height_r": _parse_decimal(alignment.get("ride_height_r"), "alignment.ride_height_r"),
        "corner_weight_fl": _parse_decimal(alignment.get("corner_weight_fl"), "alignment.corner_weight_fl"),
        "corner_weight_fr": _parse_decimal(alignment.get("corner_weight_fr"), "alignment.corner_weight_fr"),
        "corner_weight_rl": _parse_decimal(alignment.get("corner_weight_rl"), "alignment.corner_weight_rl"),
        "corner_weight_rr": _parse_decimal(alignment.get("corner_weight_rr"), "alignment.corner_weight_rr"),
        "cross_weight_pct": _parse_decimal(alignment.get("cross_weight_pct"), "alignment.cross_weight_pct"),
        "rake_mm": _parse_decimal(alignment.get("rake_mm"), "alignment.rake_mm"),
        "wheelbase_mm": wheelbase_mm,
    }
    _upsert_single_row(db, Alignment, "id_seance", seance.id_seance, alignment_values)

    tire_temperatures = payload.get("tire_temperatures") if isinstance(payload.get("tire_temperatures"), dict) else {}
    tire_temperature_values = {
        "fl_in": _parse_decimal(tire_temperatures.get("fl_in"), "tire_temperatures.fl_in"),
        "fl_mid": _parse_decimal(tire_temperatures.get("fl_mid"), "tire_temperatures.fl_mid"),
        "fl_out": _parse_decimal(tire_temperatures.get("fl_out"), "tire_temperatures.fl_out"),
        "fr_in": _parse_decimal(tire_temperatures.get("fr_in"), "tire_temperatures.fr_in"),
        "fr_mid": _parse_decimal(tire_temperatures.get("fr_mid"), "tire_temperatures.fr_mid"),
        "fr_out": _parse_decimal(tire_temperatures.get("fr_out"), "tire_temperatures.fr_out"),
        "rl_in": _parse_decimal(tire_temperatures.get("rl_in"), "tire_temperatures.rl_in"),
        "rl_mid": _parse_decimal(tire_temperatures.get("rl_mid"), "tire_temperatures.rl_mid"),
        "rl_out": _parse_decimal(tire_temperatures.get("rl_out"), "tire_temperatures.rl_out"),
        "rr_in": _parse_decimal(tire_temperatures.get("rr_in"), "tire_temperatures.rr_in"),
        "rr_mid": _parse_decimal(tire_temperatures.get("rr_mid"), "tire_temperatures.rr_mid"),
        "rr_out": _parse_decimal(tire_temperatures.get("rr_out"), "tire_temperatures.rr_out"),
        "photo_url": _clean_text(submission.image_url or payload.get("image_url")),
    }
    _upsert_single_row(db, TireTemperature, "id_seance", seance.id_seance, tire_temperature_values)

    if tire_set:
        inventory_row = db.get(TireInventory, tire_inventory_id) if tire_inventory_id else None
        if inventory_row is not None:
            history_row = db.get(TireHistory, (inventory_row.tire_id, seance.id_seance))
            if history_row is None:
                db.add(
                    TireHistory(
                        tire_id=inventory_row.tire_id,
                        id_seance=seance.id_seance,
                        usage_date=session_date,
                        track=track_name,
                        duration_min=duration_min,
                    )
                )
            else:
                history_row.usage_date = session_date
                history_row.track = track_name
                history_row.duration_min = duration_min
