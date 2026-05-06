from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.v1.endpoints import submissions as submissions_endpoints
from app.core.enums import SubmissionStatus, TireInventoryStatus
from app.models.structured_notes import TireInventory
from app.services import submission_delivery_service as delivery_service
from app.services import make_webhook_service as make_service
from app.services import submission_ingest_service as ingest_service
from app.services import submission_payload_service as payload_service
from app.schemas.submission import SubmissionUpdate


def _dt(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def _session_data(*, tire_status: str = "DISCARDED") -> dict:
    return {
        "date": "2026-04-23",
        "time": "15:31",
        "track": "Sebring International Raceway",
        "driver_id": "NG",
        "vehicle_id": "NG-GT4-2025",
        "session_type": "Practice",
        "session_number": 3,
        "duration_min": 10,
        "tire_set": "Y-S3",
        "wheelbase_mm": 2550,
        "pressures": {
            "cold": {"fl": 22, "fr": 21, "rl": 22, "rr": 23},
            "hot": {"fl": 24, "fr": 23, "rl": 24, "rr": 25},
        },
        "suspension": {
            "rebound_fl": 12,
            "rebound_fr": 12,
            "rebound_rl": 11,
            "rebound_rr": 11,
            "bump_fl": 5,
            "bump_fr": 5,
            "bump_rl": 4,
            "bump_rr": 4,
            "sway_bar_f": "1",
            "sway_bar_r": "2",
            "wing_angle_deg": 15,
        },
        "alignment": {
            "camber_fl": -1.5,
            "camber_fr": -1.4,
            "camber_rl": -2.0,
            "camber_rr": -2.0,
            "toe_front": "0.05",
            "toe_rear": "0.10",
            "caster_l": 6.5,
            "caster_r": 6.4,
            "ride_height_f": 65,
            "ride_height_r": 68,
            "corner_weight_fl": 310,
            "corner_weight_fr": 315,
            "corner_weight_rl": 320,
            "corner_weight_rr": 322,
            "cross_weight_pct": 50.5,
            "rake_mm": 3.0,
            "wheelbase_mm": 2550,
        },
        "tire_temperatures": {
            "fl_in": 78.5,
            "fl_mid": 80.0,
            "fl_out": 82.1,
            "fr_in": 77.2,
            "fr_mid": 79.0,
            "fr_out": 81.3,
            "rl_in": 74.0,
            "rl_mid": 75.1,
            "rl_out": 76.8,
            "rr_in": 73.8,
            "rr_mid": 75.0,
            "rr_out": 76.5,
        },
        "tire_inventory": {
            "tire_id": "Y-S3",
            "manufacturer": "Yokohama",
            "model": "S3",
            "size": "S3",
            "purchase_date": "2026-04-14",
            "heat_cycles": 2,
            "track_time_min": 15,
            "status": tire_status,
        },
    }


def _submission_payload(*, tire_status: str = "DISCARDED") -> dict:
    return {"data": _session_data(tire_status=tire_status)}


def _make_submission(
    *,
    submission_ref: str,
    payload: dict,
    raw_text: str = "",
    image_url: str | None = None,
    analysis_result: dict | None = None,
    correlation_id: str | None = None,
):
    return SimpleNamespace(
        submission_ref=submission_ref,
        correlation_id=correlation_id or f"{submission_ref}-CORR",
        raw_text=raw_text,
        image_url=image_url,
        payload=payload,
        analysis_result=analysis_result or {},
    )


def _make_actor_context(
    submission_ref: str,
    payload: dict,
    *,
    raw_text: str | None = "Driver reported the car was stable.",
    image_url: str | None = "data:image/png;base64,AAAA",
    analysis_result: dict | None = None,
):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 4, 20),
        end_date=_dt(2026, 5, 1),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        raw_text="BLUE",
        normalized="BLUE",
    )
    driver = SimpleNamespace(
        id=uuid4(),
        driver_id="NG",
        driver_name="Nicolas GuigÃ¨re",
        first_name="Nicolas",
        last_name="GuigÃ¨re",
        aliases=["Nicolas GuigÃ¨re"],
        team_name="Blue",
        license_number="L-123",
        notes="Lead mechanic driver",
        created_by_id=uuid4(),
    )
    vehicle = SimpleNamespace(
        id=uuid4(),
        vehicle_id="NG-GT4-2025",
        driver_id="NG",
        make="Porsche",
        model="GT4 RS Clubsport",
        year=2025,
        vin="WP0ZZZ99ZTS123456",
        registration_number="NG",
        vehicle_class="GT4",
        notes="Primary race car",
    )
    current_user = SimpleNamespace(
        id=uuid4(),
        name="Mechanic One",
        email="mechanic@example.com",
    )
    submission = _make_submission(
        submission_ref=submission_ref,
        payload=payload,
        raw_text=raw_text or "",
        image_url=image_url,
        analysis_result=
        {"confidence": 0.87, "voice_input_used": True}
        if analysis_result is None
        else analysis_result,
    )
    return submission, event, run_group, driver, vehicle, current_user


class FakeResult:
    def __init__(self, *, scalar_value=None, row=None):
        self._scalar_value = scalar_value
        self._row = row

    def scalar_one(self):
        return self._scalar_value

    def first(self):
        return self._row

    def mappings(self):
        return self


class FakeSession:
    def __init__(self):
        self.executed: list[tuple[str, dict]] = []
        self.storage: dict[tuple[type, object], object] = {}
        self.added: list[object] = []
        self.commits = 0

    def _identity_key(self, obj):
        mapper = getattr(obj.__class__, "__mapper__", None)
        if mapper is None:
            return (obj.__class__, getattr(obj, "id", id(obj)))

        pk_values = tuple(getattr(obj, column.key) for column in mapper.primary_key)
        return (obj.__class__, pk_values[0] if len(pk_values) == 1 else pk_values)

    def add(self, obj):
        self.added.append(obj)
        self.storage[self._identity_key(obj)] = obj

    def get(self, model, pk):
        return self.storage.get((model, pk))

    def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        normalized = sql.lower()
        params = params or {}
        self.executed.append((sql, params))

        if "insert into sm2racing.submission_inputs" in normalized:
            return FakeResult(scalar_value=101)
        if "insert into sm2racing.media_files" in normalized:
            return FakeResult(scalar_value=202)
        if "insert into sm2racing.logs" in normalized:
            return FakeResult()
        if "insert into sm2racing.ocr_results" in normalized:
            return FakeResult(scalar_value=303)
        if "select submission_id" in normalized and "from sm2racing.submission_inputs" in normalized:
            return FakeResult(row=None)
        if "select media_id" in normalized and "from sm2racing.media_files" in normalized:
            return FakeResult(row={"media_id": 202})
        if "insert into sm2racing.tire_inventory" in normalized:
            status_value = params.get("status") or TireInventoryStatus.ACTIVE
            if isinstance(status_value, str):
                status_value = TireInventoryStatus[status_value]
            tire_inventory = TireInventory(
                tire_id=params["tire_id"],
                manufacturer=params["manufacturer"],
                model=params.get("model"),
                size=params.get("size"),
                purchase_date=params.get("purchase_date"),
                heat_cycles=params.get("heat_cycles"),
                track_time_min=params.get("track_time_min"),
                status=status_value,
            )
            self.storage[(TireInventory, tire_inventory.tire_id)] = tire_inventory
            return FakeResult()
        if "insert into sm2racing.seances" in normalized:
            return FakeResult(scalar_value=params["id_seance"])

        return FakeResult()

    def flush(self):
        return None

    def commit(self):
        self.commits += 1
        return None

    def refresh(self, obj):
        self.storage[self._identity_key(obj)] = obj

    def rollback(self):
        return None

class _DeliveryResult:
    def __init__(self, *, scalar_value=None, row=None):
        self._scalar_value = scalar_value
        self._row = row

    def scalar_one(self):
        return self._scalar_value

    def first(self):
        return self._row

    def mappings(self):
        return self


class _DeliverySession:
    def __init__(self, submission):
        self.submission = submission
        self.executed: list[tuple[str, dict]] = []
        self.outbox_row: dict | None = None

    def get(self, model, pk):
        if model.__name__ == "Submission" and pk == self.submission.id:
            return self.submission
        return None

    def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        normalized = sql.lower()
        params = params or {}
        self.executed.append((sql, params))

        if "insert into sm2racing.submission_delivery_outbox" in normalized:
            self.outbox_row = {
                "id": params["id"],
                "submission_id": params["submission_id"],
                "submission_ref": params["submission_ref"],
                "correlation_id": params["correlation_id"],
                "submission_input_id": params.get("submission_input_id"),
                "delivery_status": "PENDING",
                "attempt_count": 0,
                "last_attempt_at": None,
                "next_attempt_at": params.get("next_attempt_at"),
                "last_error_code": None,
                "last_error_message": None,
                "delivered_at": None,
            }
            return _DeliveryResult()

        if "select * from sm2racing.submission_delivery_outbox" in normalized:
            return _DeliveryResult(row=self.outbox_row)

        if "update sm2racing.submission_delivery_outbox" in normalized:
            if self.outbox_row is not None:
                self.outbox_row.update(params)
            return _DeliveryResult()

        return _DeliveryResult()

    def flush(self):
        return None

    def commit(self):
        return None

    def refresh(self, obj):
        return None


def test_submission_stage_records_raw_media_and_audit_log():
    db = FakeSession()
    submission_ref = "SEB-20260423-1531-PRACTICE-3-NG-NG-GT4-2025"
    submission, event, run_group, driver, vehicle, current_user = _make_actor_context(
        submission_ref,
        _submission_payload(tire_status="DISCARDED"),
    )

    submission_input_id = ingest_service.stage_submission_input(
        db,
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
        current_user=current_user,
    )

    assert submission_input_id == 101

    insert_submission = next(
        params for sql, params in db.executed if "insert into sm2racing.submission_inputs" in sql.lower()
    )
    raw_snapshot = json.loads(insert_submission["raw_payload_json"])
    assert raw_snapshot["submission_ref"] == submission_ref
    assert raw_snapshot["correlation_id"] == f"{submission_ref}-CORR"
    assert raw_snapshot["submission_type"] == "detail"
    assert raw_snapshot["analysis_result"]["voice_input_used"] is True
    assert insert_submission["confidence"] == pytest.approx(0.87)

    insert_media = next(
        params for sql, params in db.executed if "insert into sm2racing.media_files" in sql.lower()
    )
    assert insert_media["mime_type"] == "image/png"
    assert insert_media["file_name"] == f"{submission_ref}.img"

    insert_log = next(params for sql, params in db.executed if "insert into sm2racing.logs" in sql.lower())
    audit_payload = json.loads(insert_log["payload"])
    assert audit_payload["submission_ref"] == submission_ref
    assert audit_payload["correlation_id"] == f"{submission_ref}-CORR"
    assert audit_payload["submission_input_id"] == 101
    assert audit_payload["source"] == "pwa"


@pytest.mark.parametrize(
    "name,raw_text,image_url,analysis_result,expect_media,expected_voice_value",
    [
        ("raw", "rear pressures felt stable", None, {}, False, None),
        (
            "voice",
            "voice transcript note",
            None,
            {"voice_input_used": True},
            False,
            True,
        ),
        ("image", "", "data:image/png;base64,AAAA", {}, True, None),
    ],
)
def test_stage_submission_input_handles_raw_voice_and_image_variants(
    name,
    raw_text,
    image_url,
    analysis_result,
    expect_media,
    expected_voice_value,
):
    db = FakeSession()
    submission_ref = f"SEB-20260423-1531-{name.upper()}-ONLY"
    submission, event, run_group, driver, vehicle, current_user = _make_actor_context(
        submission_ref,
        {},
        raw_text=raw_text,
        image_url=image_url,
        analysis_result=analysis_result,
    )

    submission_input_id = ingest_service.stage_submission_input(
        db,
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
        current_user=current_user,
    )

    assert submission_input_id == 101

    insert_submission = next(
        params for sql, params in db.executed if "insert into sm2racing.submission_inputs" in sql.lower()
    )
    raw_snapshot = json.loads(insert_submission["raw_payload_json"])
    assert raw_snapshot["submission_ref"] == submission_ref
    assert raw_snapshot["correlation_id"] == f"{submission_ref}-CORR"
    assert raw_snapshot["submission_type"] == "quick"
    assert raw_snapshot["raw_text"] == raw_text
    assert raw_snapshot["image_url"] == image_url
    assert raw_snapshot["analysis_result"].get("voice_input_used") == expected_voice_value

    insert_log = next(params for sql, params in db.executed if "insert into sm2racing.logs" in sql.lower())
    audit_payload = json.loads(insert_log["payload"])
    assert audit_payload["submission_ref"] == submission_ref
    assert audit_payload["correlation_id"] == f"{submission_ref}-CORR"
    assert audit_payload["submission_type"] == "quick"
    assert audit_payload["source"] == "pwa"

    if expect_media:
        insert_media = next(
            params for sql, params in db.executed if "insert into sm2racing.media_files" in sql.lower()
        )
        assert insert_media["mime_type"] == "image/png"
        assert insert_media["file_name"] == f"{submission_ref}.img"
    else:
        assert not any("insert into sm2racing.media_files" in sql.lower() for sql, _ in db.executed)


def test_ocr_result_normalizes_invalid_review_status():
    db = FakeSession()

    ocr_id = ingest_service._insert_ocr_result(
        db,
        submission_input_id=101,
        raw_ocr_text="PF 27",
        cleaned_ocr_text="PF 27",
        extracted_json={"pressure": 27},
        ocr_confidence=0.93,
        parser_version="ocr-v1",
        review_status="unknown",
    )

    assert ocr_id == 303
    insert_ocr = next(params for sql, params in db.executed if "insert into sm2racing.ocr_results" in sql.lower())
    assert insert_ocr["review_status"] == "PENDING"
    assert insert_ocr["media_id"] == 202


def test_persist_structured_submission_links_session_tables_and_history():
    db = FakeSession()
    submission_ref = "SEB-20260423-1531-PRACTICE-3-NG-NG-GT4-2025"
    session_data = _session_data(tire_status="DISCARDED")
    submission, event, run_group, driver, vehicle, current_user = _make_actor_context(
        submission_ref,
        {"data": session_data},
    )

    result = ingest_service.persist_structured_submission(
        db,
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
        current_user=current_user,
    )
    assert result.submission_input_id == 101
    assert result.status == "saved"
    assert result.warnings == []

    started_at = datetime.combine(date.fromisoformat("2026-04-23"), time.fromisoformat("15:31")).replace(
        tzinfo=timezone.utc
    )
    expected_seance_id = ingest_service._seance_business_id(
        track_name="Sebring International Raceway",
        session_started_at=started_at,
        driver_code="NG",
        vehicle_code="NG-GT4-2025",
        session_type="Practice",
        session_number=3,
    )

    tire_inventory_insert = next(
        params for sql, params in db.executed if "insert into sm2racing.tire_inventory" in sql.lower()
    )
    assert tire_inventory_insert["status"] == "DISCARDED"
    raw_snapshot = json.loads(
        next(params for sql, params in db.executed if "insert into sm2racing.submission_inputs" in sql.lower())[
            "raw_payload_json"
        ]
    )
    assert raw_snapshot["correlation_id"] == f"{submission_ref}-CORR"

    tire_inventory_row = db.get(TireInventory, "Y-S3")
    assert tire_inventory_row is not None
    assert tire_inventory_row.status == TireInventoryStatus.DISCARDED

    seance_insert = next(params for sql, params in db.executed if "insert into sm2racing.seances" in sql.lower())
    assert seance_insert["id_seance"] == expected_seance_id
    assert seance_insert["track"] == "Sebring International Raceway"

    pressure_insert = next(params for sql, params in db.executed if "insert into sm2racing.pressures" in sql.lower())
    assert pressure_insert["id_seance"] == expected_seance_id
    assert pressure_insert["cold_fl"] == 22.0

    alignment_insert = next(params for sql, params in db.executed if "insert into sm2racing.alignment" in sql.lower())
    assert alignment_insert["id_seance"] == expected_seance_id
    assert alignment_insert["wheelbase_mm"] == 2550.0

    tire_history_insert = next(
        params for sql, params in db.executed if "insert into sm2racing.tire_history" in sql.lower()
    )
    assert tire_history_insert["tire_id"] == "Y-S3"
    assert tire_history_insert["id_seance"] == expected_seance_id
    assert tire_history_insert["track"] == "Sebring International Raceway"
    assert tire_history_insert["duration_min"] == 10


def test_persist_structured_submission_preserves_note_when_pressure_is_out_of_range():
    db = FakeSession()
    submission_ref = "SEB-20260423-1531-WARNING-3-NG-NG-GT4-2025"
    session_data = _session_data(tire_status="DISCARDED")
    session_data["pressures"]["cold"]["fl"] = 112
    submission, event, run_group, driver, vehicle, current_user = _make_actor_context(
        submission_ref,
        {"data": session_data},
    )

    result = ingest_service.persist_structured_submission(
        db,
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
        current_user=current_user,
    )

    assert result.submission_input_id == 101
    assert result.status == "saved_with_warnings"
    assert any(warning["field"] == "cold_fl" for warning in result.warnings)

    pressure_insert = next(params for sql, params in db.executed if "insert into sm2racing.pressures" in sql.lower())
    assert pressure_insert["cold_fl"] is None
    assert pressure_insert["cold_fr"] == 21.0

    validation_update = next(
        params for sql, params in db.executed if "update sm2racing.submission_inputs" in sql.lower()
    )
    assert "cold_fl must be at most 60.0" in (validation_update["validation_message"] or "")

@pytest.mark.parametrize(
    "name,raw_text,image_url,analysis_result,expected_mode,expected_has_voice,expected_has_image,expected_voice_value",
    [
        ("raw", "manual note", None, {}, "manual", False, False, None),
        (
            "voice",
            "voice transcript note",
            None,
            {"voice_input_used": True},
            "voice",
            True,
            False,
            True,
        ),
        ("image", "", "data:image/png;base64,AAAA", {}, "image", False, True, None),
    ],
)
def test_make_webhook_payload_includes_raw_staging_and_structured_data(
    name,
    raw_text,
    image_url,
    analysis_result,
    expected_mode,
    expected_has_voice,
    expected_has_image,
    expected_voice_value,
):
    event_id = uuid4()
    run_group_id = uuid4()
    driver_id = uuid4()
    vehicle_id = uuid4()
    created_by_id = uuid4()
    submission = SimpleNamespace(
        submission_ref=f"SEB-20260423-1531-PRACTICE-3-NG-NG-GT4-2025-{name.upper()}",
        correlation_id=f"corr-{name}",
        status="SENT",
        created_at=_dt(2026, 4, 23, 15, 31),
        updated_at=_dt(2026, 4, 23, 15, 33),
        event_id=event_id,
        run_group_id=run_group_id,
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        created_by_id=created_by_id,
        raw_text=raw_text,
        image_url=image_url,
        payload=_submission_payload(tire_status="ACTIVE"),
        analysis_result={"confidence": 0.85, **analysis_result, "submission_mode": "quick"},
            event=SimpleNamespace(
                id=event_id,
                name="Sebring",
                track="Sebring International Raceway",
                start_date=_dt(2026, 4, 20),
                end_date=_dt(2026, 5, 1),
            ),
            run_group=SimpleNamespace(id=run_group_id, normalized="BLUE", raw_text="BLUE", locked=False),
            driver=SimpleNamespace(
                id=driver_id,
                driver_id="NG",
                driver_name="Nicolas GuigÃ¨re",
                first_name="Nicolas",
                last_name="GuigÃ¨re",
                team_name="Blue",
            ),
            vehicle=SimpleNamespace(
                id=vehicle_id,
                vehicle_id="NG-GT4-2025",
                make="Porsche",
                model="GT4 RS Clubsport",
                year=2025,
                registration_number="NG",
                vehicle_class="GT4",
            ),
        )

    payload = make_service.build_make_payload(submission, submission_input_id=42)

    assert payload["correlationId"] == f"corr-{name}"
    assert payload["submissionInputId"] == 42
    assert payload["raw_text"] == raw_text
    assert payload["image"] == image_url
    assert payload["rawInput"]["rawText"] == raw_text
    assert payload["rawInput"]["imageUrl"] == image_url
    assert payload["rawInput"]["analysisResult"].get("voice_input_used") == expected_voice_value
    assert payload["rawInput"]["correlationId"] == f"corr-{name}"
    assert payload["staging"]["submissionInputId"] == 42
    assert payload["staging"]["validationStatus"] == "PENDING"
    assert payload["staging"]["correlationId"] == f"corr-{name}"
    assert payload["data"]["tire_inventory"]["status"] == "ACTIVE"
    assert payload["analysis_result"]["submission_mode"] == "quick"
    assert payload["analysis_result"]["raw_input_mode"] == expected_mode
    assert payload["hasVoiceNotes"] is expected_has_voice
    assert payload["hasImage"] is expected_has_image
    assert payload["rawInputMode"] == expected_mode


def test_submission_delivery_outbox_enqueues_and_completes(monkeypatch):
    submission = SimpleNamespace(
        id=uuid4(),
        submission_ref="SEB-20260423-1531-PRACTICE-3-NG-NG-GT4-2025-ASYNC",
        correlation_id="corr-async-1",
        status=SubmissionStatus.PENDING,
        error_message=None,
        created_at=_dt(2026, 4, 23, 15, 31),
        updated_at=_dt(2026, 4, 23, 15, 33),
        event=SimpleNamespace(id=uuid4(), name="Sebring", track="Sebring International Raceway"),
        event_id=uuid4(),
        run_group=SimpleNamespace(id=uuid4(), normalized="BLUE", raw_text="BLUE", locked=False),
        run_group_id=uuid4(),
        driver=SimpleNamespace(id=uuid4(), driver_id="NG", driver_name="Nicolas GuigÃƒÂ¨re"),
        driver_id=uuid4(),
        vehicle=SimpleNamespace(id=uuid4(), vehicle_id="NG-GT4-2025", make="Porsche", model="GT4 RS Clubsport"),
        vehicle_id=uuid4(),
        created_by_id=uuid4(),
        raw_text="rear pressures were stable",
        image_url=None,
        payload=_submission_payload(tire_status="ACTIVE"),
        analysis_result={"confidence": 0.85, "submission_mode": "detail"},
    )
    db = _DeliverySession(submission)
    sent_calls: list[tuple[str, int | None]] = []

    monkeypatch.setattr(delivery_service.settings, "make_webhook_url", "https://make.example")
    monkeypatch.setattr(
        delivery_service,
        "send_submission_to_make",
        lambda sent_submission, submission_input_id=None: sent_calls.append(
            (sent_submission.submission_ref, submission_input_id)
        ),
    )

    correlation_id = delivery_service.enqueue_submission_delivery(db, submission, submission_input_id=77)
    assert correlation_id == "corr-async-1"
    assert db.outbox_row is not None
    assert db.outbox_row["delivery_status"] == "PENDING"

    result = delivery_service.process_submission_delivery(db, submission.id, submission_input_id=77)

    assert result is submission
    assert submission.status == SubmissionStatus.SENT
    assert submission.error_message is None
    assert sent_calls == [(submission.submission_ref, 77)]
    assert db.outbox_row["delivery_status"] == "DELIVERED"


@pytest.mark.parametrize(
    "raw_text,image_url,analysis_result,expected_mode",
    [
        ("manual note", None, {}, "manual"),
        ("voice transcript note", None, {"voice_input_used": True}, "voice"),
        ("", "data:image/png;base64,AAAA", {}, "image"),
    ],
)
def test_submission_analysis_classifies_raw_voice_and_image_inputs(
    raw_text,
    image_url,
    analysis_result,
    expected_mode,
):
    analysis = payload_service.merge_submission_analysis(
        {},
        raw_text=raw_text,
        image_url=image_url,
        analysis_result=analysis_result,
    )

    assert analysis["submission_mode"] == "quick"
    assert analysis["raw_input_mode"] == expected_mode
    assert analysis["has_raw_text"] == bool(raw_text)
    assert analysis["has_image"] == bool(image_url)


def test_quick_hybrid_notes_still_persist_structured_data():
    analysis = payload_service.merge_submission_analysis(
        _submission_payload(),
        raw_text="manual note with structured fields",
        image_url=None,
        analysis_result={"submission_mode": "quick"},
    )

    assert analysis["source_type"] == "quick_hybrid"
    assert analysis["has_structured_data"] is True
    assert payload_service.should_persist_structured_submission(analysis) is True


def test_submission_update_allows_creator_to_overwrite_notes(monkeypatch):
    current_user = SimpleNamespace(
        id=uuid4(),
        name="Mechanic One",
        email="mechanic@example.com",
        role=SimpleNamespace(value="MECHANIC"),
    )
    submission = SimpleNamespace(
        id=uuid4(),
        submission_ref="SUB-123",
        correlation_id="corr-123",
        created_by_id=current_user.id,
        driver_id=None,
        vehicle_id=None,
        raw_text="original note",
        image_url=None,
        payload={"data": {"session_id": "SEB-1", "track": "Sebring International Raceway"}},
        analysis_result={"submission_mode": "quick", "has_structured_data": False},
        status=SubmissionStatus.SENT,
        error_message=None,
        structured_ingest_status="skipped",
        structured_ingest_warnings=[],
        event=SimpleNamespace(id=uuid4()),
        run_group=SimpleNamespace(id=uuid4()),
        driver=None,
        vehicle=None,
    )
    session = FakeSession()

    monkeypatch.setattr(submissions_endpoints, "_load_submission", lambda _db, _submission_id: submission)
    monkeypatch.setattr(submissions_endpoints, "_finalize_delivery", lambda _db, loaded_submission, **_kwargs: loaded_submission)
    monkeypatch.setattr(submissions_endpoints, "_write_audit_log", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(submissions_endpoints, "should_persist_structured_submission", lambda *_args, **_kwargs: False)

    result = submissions_endpoints.update_submission(
        submission.id,
        SubmissionUpdate(
            raw_text="updated short note",
            image_url="data:image/png;base64,AAAA",
            payload={"session_id": "SEB-1", "track": "Sebring International Raceway"},
            analysis_result={"submission_mode": "quick", "has_structured_data": False},
        ),
        BackgroundTasks(),
        session,
        current_user,
    )

    assert result.raw_text == "updated short note"
    assert result.image_url == "data:image/png;base64,AAAA"
    assert result.payload["session_id"] == "SEB-1"
    assert submission.raw_text == "updated short note"
    assert session.commits == 2


def test_submission_update_blocks_non_creator_non_admin(monkeypatch):
    current_user = SimpleNamespace(
        id=uuid4(),
        name="Mechanic Two",
        email="mechanic2@example.com",
        role=SimpleNamespace(value="MECHANIC"),
    )
    submission = SimpleNamespace(
        id=uuid4(),
        submission_ref="SUB-456",
        correlation_id="corr-456",
        created_by_id=uuid4(),
        driver_id=None,
        vehicle_id=None,
        raw_text="original note",
        image_url=None,
        payload={"data": {"session_id": "SEB-2"}},
        analysis_result={"submission_mode": "quick", "has_structured_data": False},
        status=SubmissionStatus.SENT,
        error_message=None,
        structured_ingest_status="skipped",
        structured_ingest_warnings=[],
        event=SimpleNamespace(id=uuid4()),
        run_group=SimpleNamespace(id=uuid4()),
        driver=None,
        vehicle=None,
    )
    session = FakeSession()

    monkeypatch.setattr(submissions_endpoints, "_load_submission", lambda _db, _submission_id: submission)

    with pytest.raises(HTTPException) as exc_info:
        submissions_endpoints.update_submission(
            submission.id,
            SubmissionUpdate(raw_text="should not save"),
            BackgroundTasks(),
            session,
            current_user,
        )

    assert exc_info.value.status_code == 403
    assert session.commits == 0
