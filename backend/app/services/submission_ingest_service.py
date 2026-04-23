from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.submission_payload_service import get_session_payload


DB_SCHEMA = get_settings().database_schema


def _table(name: str) -> str:
    return f"{DB_SCHEMA}.{name}"


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text_value = str(value)
    return text_value if text_value else None


def _clean_blank(value: Any) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    stripped = cleaned.strip()
    return stripped or None


def _to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def _to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_confidence(value: Any) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    if numeric < 0:
        return None
    if numeric > 1:
        if numeric <= 100:
            numeric = numeric / 100.0
        else:
            return None
    return round(numeric, 4)


def _slugify(value: str | None) -> str:
    tokens = re.findall(r"[A-Za-z0-9]+", _clean_blank(value) or "")
    if not tokens:
        return "SESSION"
    return "-".join(token.upper() for token in tokens)


def _session_started_at(session_data: dict[str, Any]) -> tuple[datetime, date, time]:
    session_date_raw = _clean_blank(session_data.get("date"))
    session_time_raw = _clean_blank(session_data.get("time"))

    if not session_date_raw or not session_time_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session date and time are required",
        )

    try:
        session_date = date.fromisoformat(session_date_raw)
        session_time = time.fromisoformat(session_time_raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session date or time is invalid",
        ) from exc

    started_at = datetime.combine(session_date, session_time).replace(tzinfo=timezone.utc)
    return started_at, session_date, session_time


def _seance_business_id(
    *,
    track_name: str,
    session_started_at: datetime,
    driver_code: str,
    vehicle_code: str,
    session_type: str,
    session_number: int,
) -> str:
    timestamp_code = session_started_at.strftime("%Y%m%d-%H%M")
    return (
        f"{_slugify(track_name)}-{timestamp_code}-"
        f"{_slugify(session_type)}-{session_number}-"
        f"{_slugify(driver_code)}-{_slugify(vehicle_code)}"
    )


def _driver_aliases(driver: Driver) -> list[str]:
    aliases = [alias for alias in driver.aliases if _clean_blank(alias)]
    return aliases or [driver.driver_name]


def _created_by_value(user: User) -> str:
    return _clean_blank(user.name) or _clean_blank(user.email) or str(user.id)


def _upsert_master_driver(db: Session, driver: Driver) -> None:
    db.execute(
        text(
            f"""
            INSERT INTO {_table("drivers")} (
                id,
                driver_id,
                driver_name,
                aliases,
                first_name,
                last_name,
                license_number,
                team_name,
                notes,
                is_active,
                created_by_id,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :driver_id,
                :driver_name,
                :aliases,
                :first_name,
                :last_name,
                :license_number,
                :team_name,
                :notes,
                TRUE,
                :created_by_id,
                now(),
                now()
            )
            ON CONFLICT (driver_id) DO UPDATE
            SET driver_name = EXCLUDED.driver_name,
                aliases = COALESCE(EXCLUDED.aliases, {_table("drivers")}.aliases),
                first_name = COALESCE(EXCLUDED.first_name, {_table("drivers")}.first_name),
                last_name = COALESCE(EXCLUDED.last_name, {_table("drivers")}.last_name),
                license_number = COALESCE(EXCLUDED.license_number, {_table("drivers")}.license_number),
                team_name = COALESCE(EXCLUDED.team_name, {_table("drivers")}.team_name),
                notes = COALESCE(EXCLUDED.notes, {_table("drivers")}.notes),
                is_active = TRUE,
                updated_at = now()
            """
        ),
        {
            "id": driver.id or uuid.uuid4(),
            "driver_id": driver.driver_id,
            "driver_name": driver.driver_name,
            "aliases": _driver_aliases(driver),
            "first_name": driver.first_name,
            "last_name": driver.last_name,
            "license_number": _clean_blank(driver.license_number),
            "team_name": _clean_blank(driver.team_name),
            "notes": _clean_blank(driver.notes),
            "created_by_id": driver.created_by_id,
        },
    )


def _upsert_master_vehicle(db: Session, vehicle: Vehicle) -> None:
    db.execute(
        text(
            f"""
            INSERT INTO {_table("vehicles")} (
                id,
                driver_id,
                make,
                model,
                year,
                vin,
                registration_number,
                vehicle_id,
                "class",
                notes,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :driver_id,
                :make,
                :model,
                :year,
                :vin,
                :registration_number,
                :vehicle_id,
                :vehicle_class,
                :notes,
                TRUE,
                now(),
                now()
            )
            ON CONFLICT (vehicle_id) DO UPDATE
            SET driver_id = COALESCE(EXCLUDED.driver_id, {_table("vehicles")}.driver_id),
                make = EXCLUDED.make,
                model = EXCLUDED.model,
                year = COALESCE(EXCLUDED.year, {_table("vehicles")}.year),
                vin = COALESCE(EXCLUDED.vin, {_table("vehicles")}.vin),
                registration_number = COALESCE(EXCLUDED.registration_number, {_table("vehicles")}.registration_number),
                "class" = COALESCE(EXCLUDED."class", {_table("vehicles")}."class"),
                notes = COALESCE(EXCLUDED.notes, {_table("vehicles")}.notes),
                is_active = TRUE,
                updated_at = now()
            """
        ),
        {
            "id": vehicle.id or uuid.uuid4(),
            "driver_id": _clean_blank(vehicle.driver_id),
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "vin": _clean_blank(vehicle.vin),
            "registration_number": _clean_blank(vehicle.registration_number),
            "vehicle_id": vehicle.vehicle_id,
            "vehicle_class": _clean_blank(vehicle.vehicle_class),
            "notes": _clean_blank(vehicle.notes),
        },
    )


def _upsert_track(db: Session, track_name: str) -> None:
    db.execute(
        text(
            f"""
            INSERT INTO {_table("tracks")} (name, latitude, longitude, country, active, created_at, updated_at)
            VALUES (:name, NULL, NULL, NULL, TRUE, now(), now())
            ON CONFLICT (name) DO UPDATE
            SET active = TRUE,
                updated_at = now()
            """
        ),
        {"name": track_name},
    )


def _insert_submission_input(
    db: Session,
    *,
    id_seance: str,
    submission_type: str,
    source: str,
    raw_text: str | None,
    raw_payload: dict[str, Any],
    confidence: float | None,
    created_by: str,
) -> int:
    raw_payload_json = json.dumps(raw_payload, ensure_ascii=False, sort_keys=True, default=str)
    return db.execute(
        text(
            f"""
            INSERT INTO {_table("submission_inputs")} (
                id_seance,
                submission_type,
                source,
                raw_text,
                raw_payload_json,
                confidence,
                created_by,
                created_at,
                validation_status,
                validation_message
            ) VALUES (
                :id_seance,
                :submission_type,
                :source,
                :raw_text,
                CAST(:raw_payload_json AS jsonb),
                :confidence,
                :created_by,
                now(),
                'APPLIED',
                NULL
            )
            RETURNING submission_id
            """
        ),
        {
            "id_seance": id_seance,
            "submission_type": submission_type,
            "source": source,
            "raw_text": raw_text,
            "raw_payload_json": raw_payload_json,
            "confidence": confidence,
            "created_by": created_by,
        },
    ).scalar_one()


def _upsert_single_row(
    db: Session,
    *,
    table_name: str,
    id_column: str,
    columns: list[str],
    values: dict[str, Any],
) -> None:
    insert_columns = [id_column, *columns]
    assignments = ", ".join(
        f"{column} = COALESCE(EXCLUDED.{column}, {_table(table_name)}.{column})" for column in columns
    )
    db.execute(
        text(
            f"""
            INSERT INTO {_table(table_name)} ({", ".join(insert_columns)})
            VALUES ({", ".join(f":{column}" for column in insert_columns)})
            ON CONFLICT ({id_column}) DO UPDATE
            SET {assignments}
            """
        ),
        values,
    )


def _upsert_tire_inventory(db: Session, tire_inventory: dict[str, Any]) -> None:
    tire_id = _clean_blank(tire_inventory.get("tire_id"))
    if not tire_id or not re.match(r"^[YMP]-S[0-9]+$", tire_id):
        return

    db.execute(
        text(
            f"""
            INSERT INTO {_table("tire_inventory")} (
                tire_id,
                manufacturer,
                model,
                size,
                purchase_date,
                heat_cycles,
                track_time_min,
                created_at,
                updated_at
            ) VALUES (
                :tire_id,
                :manufacturer,
                :model,
                :size,
                :purchase_date,
                :heat_cycles,
                :track_time_min,
                now(),
                now()
            )
            ON CONFLICT (tire_id) DO UPDATE
            SET manufacturer = COALESCE(EXCLUDED.manufacturer, {_table("tire_inventory")}.manufacturer),
                model = COALESCE(EXCLUDED.model, {_table("tire_inventory")}.model),
                size = COALESCE(EXCLUDED.size, {_table("tire_inventory")}.size),
                purchase_date = COALESCE(EXCLUDED.purchase_date, {_table("tire_inventory")}.purchase_date),
                heat_cycles = COALESCE(EXCLUDED.heat_cycles, {_table("tire_inventory")}.heat_cycles),
                track_time_min = COALESCE(EXCLUDED.track_time_min, {_table("tire_inventory")}.track_time_min),
                updated_at = now()
            """
        ),
        {
            "tire_id": tire_id,
            "manufacturer": _clean_blank(tire_inventory.get("manufacturer")) or "Unknown",
            "model": _clean_blank(tire_inventory.get("model")),
            "size": _clean_blank(tire_inventory.get("size")),
            "purchase_date": _clean_blank(tire_inventory.get("purchase_date")),
            "heat_cycles": _to_int(tire_inventory.get("heat_cycles")),
            "track_time_min": _to_int(tire_inventory.get("track_time_min")),
        },
    )


def _insert_media_file(
    db: Session,
    *,
    submission_id: int,
    submission_ref: str,
    image_url: str | None,
    uploaded_by: str,
) -> int | None:
    if not image_url:
        return None

    mime_type = None
    if image_url.startswith("data:") and ";" in image_url:
        mime_type = image_url[5 : image_url.index(";")]

    return db.execute(
        text(
            f"""
            INSERT INTO {_table("media_files")} (
                submission_id,
                storage_url,
                mime_type,
                file_name,
                file_size,
                checksum,
                uploaded_by,
                uploaded_at
            ) VALUES (
                :submission_id,
                :storage_url,
                :mime_type,
                :file_name,
                :file_size,
                :checksum,
                :uploaded_by,
                now()
            )
            RETURNING media_id
            """
        ),
        {
            "submission_id": submission_id,
            "storage_url": image_url,
            "mime_type": mime_type,
            "file_name": f"{submission_ref}.img",
            "file_size": None,
            "checksum": None,
            "uploaded_by": uploaded_by,
        },
    ).scalar_one()


def persist_structured_submission(
    db: Session,
    *,
    submission: Submission,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
    current_user: User,
) -> None:
    payload = _dict_or_empty(submission.payload)
    session_data = get_session_payload(payload)
    analysis_result = _dict_or_empty(submission.analysis_result)

    if not session_data:
        return

    if driver is None or vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Structured submissions require both driver and vehicle",
        )

    track_name = _clean_blank(session_data.get("track")) or event.track
    if not track_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Track is required for structured submission",
        )

    _upsert_master_driver(db, driver)
    _upsert_master_vehicle(db, vehicle)
    _upsert_track(db, track_name)

    started_at, session_date, session_time = _session_started_at(session_data)
    session_type = _clean_blank(session_data.get("session_type")) or "Practice"
    session_number = _to_int(session_data.get("session_number"))
    if session_number is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session number is required",
        )

    tire_set = _clean_blank(session_data.get("tire_set"))
    duration_min = _to_int(session_data.get("duration_min"))
    raw_text = submission.raw_text
    created_by = _created_by_value(current_user)

    tire_inventory = _dict_or_empty(session_data.get("tire_inventory"))
    if tire_set or tire_inventory:
        tire_inventory_payload = dict(tire_inventory)
        if tire_set and not tire_inventory_payload.get("tire_id"):
            tire_inventory_payload["tire_id"] = tire_set
        if tire_set and not tire_inventory_payload.get("manufacturer"):
            tire_inventory_payload["manufacturer"] = "Unknown"
        _upsert_tire_inventory(db, tire_inventory_payload)

    id_seance = _seance_business_id(
        track_name=track_name,
        session_started_at=started_at,
        driver_code=driver.driver_id,
        vehicle_code=vehicle.vehicle_id,
        session_type=session_type,
        session_number=session_number,
    )

    submission_type = "detail" if any(
        key in session_data for key in ("suspension", "alignment", "tire_temperatures", "tire_inventory")
    ) else "quick"
    confidence = _normalize_confidence(analysis_result.get("confidence"))

    raw_payload_snapshot = {
        "submission_ref": submission.submission_ref,
        "event_id": str(event.id),
        "event_name": event.name,
        "run_group_id": str(run_group.id),
        "run_group_raw_text": run_group.raw_text,
        "driver_id": driver.driver_id,
        "vehicle_id": vehicle.vehicle_id,
        "analysis_result": analysis_result,
        "raw_text": raw_text,
        "image_url": submission.image_url,
        "data": session_data,
    }

    id_seance = db.execute(
        text(
            f"""
            INSERT INTO {_table("seances")} (
                id_seance,
                session_date,
                session_time,
                track,
                driver_id,
                vehicle_id,
                session_type,
                session_number,
                duration_min,
                tire_set,
                notes,
                created_by,
                created_at
            ) VALUES (
                :id_seance,
                :session_date,
                :session_time,
                :track,
                :driver_id,
                :vehicle_id,
                :session_type,
                :session_number,
                :duration_min,
                :tire_set,
                :notes,
                :created_by,
                now()
            )
            ON CONFLICT ON CONSTRAINT uq_session_identity DO UPDATE
            SET session_date = EXCLUDED.session_date,
                session_time = COALESCE(EXCLUDED.session_time, {_table("seances")}.session_time),
                track = EXCLUDED.track,
                driver_id = EXCLUDED.driver_id,
                vehicle_id = EXCLUDED.vehicle_id,
                session_type = COALESCE(EXCLUDED.session_type, {_table("seances")}.session_type),
                session_number = EXCLUDED.session_number,
                duration_min = COALESCE(EXCLUDED.duration_min, {_table("seances")}.duration_min),
                tire_set = COALESCE(EXCLUDED.tire_set, {_table("seances")}.tire_set),
                notes = COALESCE(EXCLUDED.notes, {_table("seances")}.notes),
                created_by = EXCLUDED.created_by
            RETURNING id_seance
            """
        ),
        {
            "id_seance": id_seance,
            "session_date": session_date,
            "session_time": session_time,
            "track": track_name,
            "driver_id": driver.driver_id,
            "vehicle_id": vehicle.vehicle_id,
            "session_type": session_type,
            "session_number": session_number,
            "duration_min": duration_min,
            "tire_set": tire_set,
            "notes": raw_text,
            "created_by": created_by,
        },
    ).scalar_one()

    submission_input_id = _insert_submission_input(
        db,
        id_seance=id_seance,
        submission_type=submission_type,
        source="pwa",
        raw_text=raw_text,
        raw_payload=raw_payload_snapshot,
        confidence=confidence,
        created_by=created_by,
    )

    db.execute(
        text(
            f"""
            UPDATE {_table("submission_inputs")}
            SET id_seance = :id_seance,
                validation_status = 'APPLIED',
                validation_message = NULL
            WHERE submission_id = :submission_id
            """
        ),
        {"id_seance": id_seance, "submission_id": submission_input_id},
    )

    pressures = _dict_or_empty(session_data.get("pressures"))
    if pressures:
        pressure_columns = [
            "cold_fl",
            "cold_fr",
            "cold_rl",
            "cold_rr",
            "hot_fl",
            "hot_fr",
            "hot_rl",
            "hot_rr",
        ]
        pressure_values = {
            "id_seance": id_seance,
            **{column: _to_float(pressures.get(column)) for column in pressure_columns},
        }
        _upsert_single_row(
            db,
            table_name="pressures",
            id_column="id_seance",
            columns=pressure_columns,
            values=pressure_values,
        )

    suspension = _dict_or_empty(session_data.get("suspension"))
    if suspension:
        suspension_columns = [
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
        ]
        suspension_values = {
            "id_seance": id_seance,
            "rebound_fl": _to_int(suspension.get("rebound_fl")),
            "rebound_fr": _to_int(suspension.get("rebound_fr")),
            "rebound_rl": _to_int(suspension.get("rebound_rl")),
            "rebound_rr": _to_int(suspension.get("rebound_rr")),
            "bump_fl": _to_int(suspension.get("bump_fl")),
            "bump_fr": _to_int(suspension.get("bump_fr")),
            "bump_rl": _to_int(suspension.get("bump_rl")),
            "bump_rr": _to_int(suspension.get("bump_rr")),
            "sway_bar_f": _clean_blank(suspension.get("sway_bar_f")),
            "sway_bar_r": _clean_blank(suspension.get("sway_bar_r")),
            "wing_angle_deg": _to_float(suspension.get("wing_angle_deg")),
        }
        _upsert_single_row(
            db,
            table_name="suspensions",
            id_column="id_seance",
            columns=suspension_columns,
            values=suspension_values,
        )

    alignment = _dict_or_empty(session_data.get("alignment"))
    if alignment:
        alignment_columns = [
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
            "corner_weight_fl",
            "corner_weight_fr",
            "corner_weight_rl",
            "corner_weight_rr",
            "cross_weight_pct",
            "rake_mm",
            "wheelbase_mm",
        ]
        alignment_values = {
            "id_seance": id_seance,
            "camber_fl": _to_float(alignment.get("camber_fl")),
            "camber_fr": _to_float(alignment.get("camber_fr")),
            "camber_rl": _to_float(alignment.get("camber_rl")),
            "camber_rr": _to_float(alignment.get("camber_rr")),
            "toe_front": _clean_blank(alignment.get("toe_front")),
            "toe_rear": _clean_blank(alignment.get("toe_rear")),
            "caster_l": _to_float(alignment.get("caster_l")),
            "caster_r": _to_float(alignment.get("caster_r")),
            "ride_height_f": _to_float(alignment.get("ride_height_f")),
            "ride_height_r": _to_float(alignment.get("ride_height_r")),
            "corner_weight_fl": _to_float(alignment.get("corner_weight_fl")),
            "corner_weight_fr": _to_float(alignment.get("corner_weight_fr")),
            "corner_weight_rl": _to_float(alignment.get("corner_weight_rl")),
            "corner_weight_rr": _to_float(alignment.get("corner_weight_rr")),
            "cross_weight_pct": _to_float(alignment.get("cross_weight_pct")),
            "rake_mm": _to_float(alignment.get("rake_mm")),
            "wheelbase_mm": _to_float(alignment.get("wheelbase_mm")),
        }
        _upsert_single_row(
            db,
            table_name="alignment",
            id_column="id_seance",
            columns=alignment_columns,
            values=alignment_values,
        )

    tire_temperatures = _dict_or_empty(session_data.get("tire_temperatures"))
    if tire_temperatures:
        tire_temperature_columns = [
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
            "photo_url",
        ]
        tire_temperature_values = {
            "id_seance": id_seance,
            "fl_in": _to_float(tire_temperatures.get("fl_in")),
            "fl_mid": _to_float(tire_temperatures.get("fl_mid")),
            "fl_out": _to_float(tire_temperatures.get("fl_out")),
            "fr_in": _to_float(tire_temperatures.get("fr_in")),
            "fr_mid": _to_float(tire_temperatures.get("fr_mid")),
            "fr_out": _to_float(tire_temperatures.get("fr_out")),
            "rl_in": _to_float(tire_temperatures.get("rl_in")),
            "rl_mid": _to_float(tire_temperatures.get("rl_mid")),
            "rl_out": _to_float(tire_temperatures.get("rl_out")),
            "rr_in": _to_float(tire_temperatures.get("rr_in")),
            "rr_mid": _to_float(tire_temperatures.get("rr_mid")),
            "rr_out": _to_float(tire_temperatures.get("rr_out")),
            "photo_url": _clean_blank(submission.image_url),
        }
        _upsert_single_row(
            db,
            table_name="tire_temperatures",
            id_column="id_seance",
            columns=tire_temperature_columns,
            values=tire_temperature_values,
        )

    if submission.image_url:
        _insert_media_file(
            db,
            submission_id=submission_input_id,
            submission_ref=submission.submission_ref,
            image_url=submission.image_url,
            uploaded_by=created_by,
        )
