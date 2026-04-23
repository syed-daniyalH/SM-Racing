from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any


PRESSURE_PHASES = ("cold", "hot")
PRESSURE_CORNERS = ("fl", "fr", "rl", "rr")


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first_non_blank(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


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


def to_isoformat(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return None
