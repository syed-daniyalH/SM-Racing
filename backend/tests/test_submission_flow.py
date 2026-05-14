from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.v1.endpoints import submissions as submissions_endpoints
from app.core import config as config_module
from app.core.enums import SubmissionStatus, TireInventoryStatus
from app.models.structured_notes import TireInventory
from app.services import image_analysis_service
from app.services import submission_delivery_service as delivery_service
from app.services import make_webhook_service as make_service
from app.services import submission_ingest_service as ingest_service
from app.services import submission_payload_service as payload_service
from app.schemas.submission import OcrPreviewCreate, SubmissionUpdate


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


class _PreviewSession:
    def __init__(self, *, event, run_group):
        self.event = event
        self.run_group = run_group

    def get(self, model, pk):
        if model.__name__ == "Event" and pk == self.event.id:
            return self.event
        if model.__name__ == "RunGroup" and pk == self.run_group.id:
            return self.run_group
        return None

    def scalar(self, _statement):
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


def test_review_required_ocr_submissions_skip_immediate_structured_persist():
    analysis = payload_service.merge_submission_analysis(
        _submission_payload(),
        raw_text="reviewed OCR note",
        image_url="data:image/png;base64,AAAA",
        analysis_result={
            "submission_mode": "detail",
            "ocr_review_required": True,
            "force_review_staging": True,
        },
    )

    assert analysis["has_structured_data"] is True
    assert payload_service.should_persist_structured_submission(analysis) is False


def test_preview_ocr_submission_reports_disabled_config(monkeypatch):
    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=False,
            openai_api_key=None,
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )

    response = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=uuid4(),
            run_group_id=uuid4(),
            image_url="data:image/png;base64,AAAA",
        ),
        db=SimpleNamespace(),
        current_user=SimpleNamespace(),
    )

    payload = json.loads(response.body.decode("utf-8"))
    assert response.status_code == 503
    assert payload["error"] == "OCR_EXTRACTION_DISABLED"
    assert payload["message"] == "OCR extraction is disabled because backend image analysis is not configured."
    assert payload["missing_requirements"] == ["CHATBOT_IMAGE_ANALYSIS_ENABLED", "OPENAI_API_KEY"]


def test_preview_ocr_submission_reports_missing_api_key(monkeypatch):
    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key=None,
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )

    response = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=uuid4(),
            run_group_id=uuid4(),
            image_url="data:image/png;base64,AAAA",
        ),
        db=SimpleNamespace(),
        current_user=SimpleNamespace(),
    )

    payload = json.loads(response.body.decode("utf-8"))
    assert response.status_code == 503
    assert payload["error"] == "OCR_EXTRACTION_DISABLED"
    assert payload["missing_requirements"] == ["OPENAI_API_KEY"]


def test_ocr_config_status_uses_gpt_54_primary_model():
    status = config_module.get_ocr_config_status(
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        )
    )

    assert status["enabled"] is True
    assert status["has_api_key"] is True
    assert status["primary_model"] == "gpt-5.4"
    assert status["fallback_model"] == "gpt-5.5"
    assert status["missing_requirements"] == []


def test_preview_ocr_submission_returns_editable_draft(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )
    monkeypatch.setattr(
        submissions_endpoints,
        "analyze_submission_image",
        lambda **_kwargs: {
            "document_type": "handwritten_setup_grid",
            "template_name": "farnbacher_86_setup_sheet",
            "confidence": 0.84,
            "summary": "Front geometry sheet",
            "extracted_text": "RH front 65, rear 68",
            "raw_text": "RH front 65, rear 68",
            "metadata": {
                "driver_text": "NG",
                "track_text": "Sebring International Raceway",
                "session_text": "Practice S3",
            },
            "setup": {
                "pressures": {
                    "cold_fl": "22.0",
                    "cold_fr": "22.1",
                    "cold_rl": "22.4",
                    "cold_rr": "22.5",
                    "hot_fl": "",
                    "hot_fr": "",
                    "hot_rl": "",
                    "hot_rr": "",
                },
                "suspension": {
                    "rebound_fl": "12",
                    "rebound_fr": "12",
                    "rebound_rl": "11",
                    "rebound_rr": "11",
                    "bump_fl": "",
                    "bump_fr": "",
                    "bump_rl": "",
                    "bump_rr": "",
                    "hsr_fl": "7",
                    "hsr_fr": "7",
                    "hsr_rl": "6",
                    "hsr_rr": "6",
                    "lsr_fl": "4",
                    "lsr_fr": "4",
                    "lsr_rl": "3",
                    "lsr_rr": "3",
                    "hsb_fl": "8",
                    "hsb_fr": "8",
                    "hsb_rl": "7",
                    "hsb_rr": "7",
                    "lsb_fl": "5",
                    "lsb_fr": "5",
                    "lsb_rl": "4",
                    "lsb_rr": "4",
                    "sway_bar_f": "",
                    "sway_bar_r": "",
                    "wing_angle_deg": "",
                },
                "alignment": {
                    "rh_fl": "65",
                    "rh_fr": "65",
                    "rh_rl": "68",
                    "rh_rr": "68",
                    "camber_fl": "-1.5",
                    "camber_fr": "-1.4",
                    "camber_rl": "-2.0",
                    "camber_rr": "-2.0",
                    "toe_fl": "0.05",
                    "toe_fr": "0.05",
                    "toe_rl": "0.10",
                    "toe_rr": "0.10",
                    "toe_front": "0.05",
                    "toe_rear": "0.10",
                    "caster_l": "6.5",
                    "caster_r": "6.4",
                    "ride_height_f": "65",
                    "ride_height_r": "68",
                    "rake_mm": "3",
                    "wheelbase_mm": "2550",
                },
                "sheet_fields": {
                    "fuel_liters": "22.5",
                    "driver_weight_lbs": "180",
                    "scale_weight_lbs": "1280",
                    "cross_weight_percent": "50.0",
                    "roll_bar_text": "3",
                    "spacer_text": "2",
                    "bump_text": "12",
                    "rebound_text": "14",
                    "springs_front": "900",
                    "springs_rear": "1000",
                    "bump_stops_front": "10",
                    "bump_stops_rear": "12",
                    "wheelbase_left_mm": "2550",
                    "wheelbase_right_mm": "2552",
                    "wing_rake_deg": "1.5",
                    "wing_angle_deg": "4",
                    "wing_gurney_mm": "2",
                    "fuel_pumped_out_liters": "3.0",
                    "notes_block": "Out with 15g fuel",
                },
                "post_session": {
                    "camber_text": "front tech values",
                    "toe_text": "1 out / 2.5 in",
                    "weight_text": "1280",
                    "height_text": "80 / 121",
                    "shocks_text": "pending",
                },
                "shock_setup": {
                    "rr": {
                        "position": "RR",
                        "hsr": "7",
                        "lsr": "6",
                        "hsb": "9",
                        "lsb": "8",
                        "total_setup": "30",
                    },
                    "lr": {
                        "position": "LR",
                        "hsr": "",
                        "lsr": "",
                        "hsb": "",
                        "lsb": "",
                        "total_setup": "",
                    },
                    "lf": {
                        "position": "LF",
                        "hsr": "",
                        "lsr": "",
                        "hsb": "",
                        "lsb": "",
                        "total_setup": "",
                    },
                    "rf": {
                        "position": "RF",
                        "hsr": "",
                        "lsr": "",
                        "hsb": "",
                        "lsb": "",
                        "total_setup": "",
                    },
                },
                "tire_temperatures": {},
                "notes": ["Rear ride height looks uncertain"],
            },
            "warnings": ["ambiguous handwriting", "crossed-out value on wheelbase"],
            "recommended_review_status": "PENDING",
            "parser_version": "ocr-v1",
            "model": "gpt-5.4",
            "fallback_model_used": False,
        },
    )

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
            context={"track": "Sebring International Raceway"},
        ),
        session,
        current_user,
    )

    assert result.status == "review_required"
    assert result.doc_type == "handwritten_setup_grid"
    assert result.template_name == "farnbacher_86_setup_sheet"
    assert result.metadata["track_text"] == "Sebring International Raceway"
    assert result.model_used == "gpt-5.4"
    assert result.fallback_used is False
    assert result.raw_text == "RH front 65, rear 68"
    assert result.structured_data["alignment"]["rh_fl"] == "65"
    assert result.structured_data["alignment"]["toe_rl"] == "0.10"
    assert result.structured_data["pressures"]["cold"]["fl"] == "22.0"
    assert result.structured_data["sheet_fields"]["fuel_liters"] == "22.5"
    assert result.structured_data["post_session"]["toe_text"] == "1 out / 2.5 in"
    assert result.structured_data["shock_setup"]["rr"]["hsr"] == "7"
    assert "ambiguous handwriting" in result.review_flags
    assert "crossed-out value on wheelbase" in result.review_flags
    assert "Manual review required" in result.review_flags
    assert result.recommended_review_status == "PENDING"


def test_preview_ocr_submission_tolerates_partial_analysis(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )
    monkeypatch.setattr(
        submissions_endpoints,
        "analyze_submission_image",
        lambda **_kwargs: {
            "document_type": "mixed_session_notes",
            "confidence": 0.41,
            "summary": "",
            "extracted_text": "",
            "setup": {},
            "warnings": [],
            "recommended_review_status": "PENDING",
        },
    )

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
        ),
        session,
        current_user,
    )

    assert result.status == "review_required"
    assert result.doc_type == "low_quality_review_required"
    assert result.structured_data["alignment"]["rh_fl"] == ""
    assert result.structured_data["pressures"]["cold"]["fl"] == ""
    assert result.structured_data["notes"] == []
    assert "low confidence extraction" in result.review_flags
    assert "Manual review required" in result.review_flags


def test_preview_ocr_submission_reports_service_failure(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )
    monkeypatch.setattr(submissions_endpoints, "analyze_submission_image", lambda **_kwargs: None)

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
        ),
        session,
        current_user,
    )

    assert result.status == "extraction_failed"
    assert result.doc_type == "unknown"
    assert result.message == "OCR extraction failed before a safe draft could be created. Retry with a clearer image or use manual correction."
    assert "Manual review required" in result.review_flags


def test_preview_ocr_submission_calls_ocr_service_with_structured_context(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")
    analyze_calls: list[dict] = []

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )

    def fake_analyze(**kwargs):
        analyze_calls.append(kwargs)
        return {
            "document_type": "printed_form_with_values",
            "template_name": "generic_setup",
            "confidence": 0.77,
            "summary": "Structured metadata should not bypass OCR extraction",
            "extracted_text": "toe 0.10",
            "setup": {},
            "warnings": [],
            "recommended_review_status": "PENDING",
        }

    monkeypatch.setattr(submissions_endpoints, "analyze_submission_image", fake_analyze)

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
            context={
                "track": "Sebring International Raceway",
                "session_type": "Practice",
                "session_number": "3",
                "duration_min": "30",
                "alignment": {"camber_fl": "-1.5"},
            },
        ),
        session,
        current_user,
    )

    assert len(analyze_calls) == 1
    assert analyze_calls[0]["submission"].analysis_result["ocr_preview"] is True
    assert analyze_calls[0]["submission"].analysis_result["force_review_staging"] is True
    assert analyze_calls[0]["submission"].status == SubmissionStatus.PENDING
    assert analyze_calls[0]["submission"].payload["context"]["alignment"]["camber_fl"] == "-1.5"
    assert result.status == "review_required"


def test_analyze_submission_image_uses_gpt_54_primary_model(monkeypatch):
    submission, event, run_group, driver, vehicle, _current_user = _make_actor_context(
        "OCR-PRIMARY-MODEL",
        _submission_payload(),
    )
    captured_requests: list[dict] = []

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(
                {
                    "output_text": json.dumps(
                        {
                            "document_type": "setup_sheet",
                            "template_name": "generic_setup",
                            "confidence": 0.88,
                            "summary": "Detected setup values",
                            "extracted_text": "camber 3.8",
                            "events": [],
                            "sessions": [],
                            "setup": {
                                "pressures": {
                                    "cold_fl": "",
                                    "cold_fr": "",
                                    "cold_rl": "",
                                    "cold_rr": "",
                                    "hot_fl": "",
                                    "hot_fr": "",
                                    "hot_rl": "",
                                    "hot_rr": "",
                                },
                                "suspension": {
                                    "rebound_fl": "",
                                    "rebound_fr": "",
                                    "rebound_rl": "",
                                    "rebound_rr": "",
                                    "bump_fl": "",
                                    "bump_fr": "",
                                    "bump_rl": "",
                                    "bump_rr": "",
                                    "sway_bar_f": "",
                                    "sway_bar_r": "",
                                    "wing_angle_deg": "",
                                },
                                "alignment": {
                                    "camber_fl": "3.8",
                                    "camber_fr": "4.0",
                                    "camber_rl": "",
                                    "camber_rr": "",
                                    "toe_front": "",
                                    "toe_rear": "",
                                    "caster_l": "",
                                    "caster_r": "",
                                    "ride_height_f": "",
                                    "ride_height_r": "",
                                    "rake_mm": "",
                                    "wheelbase_mm": "",
                                },
                                "tire_temperatures": {
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
                                },
                                "sheet_fields": {
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
                                },
                                "post_session": {
                                    "camber_text": "",
                                    "toe_text": "",
                                    "weight_text": "",
                                    "height_text": "",
                                    "shocks_text": "",
                                },
                                "shock_setup": {
                                    "rr_hsr": "",
                                    "rr_lsr": "",
                                    "rr_hsb": "",
                                    "rr_lsb": "",
                                    "rr_total_setup": "",
                                    "lr_hsr": "",
                                    "lr_lsr": "",
                                    "lr_hsb": "",
                                    "lr_lsb": "",
                                    "lr_total_setup": "",
                                    "lf_hsr": "",
                                    "lf_lsr": "",
                                    "lf_hsb": "",
                                    "lf_lsb": "",
                                    "lf_total_setup": "",
                                    "rf_hsr": "",
                                    "rf_lsr": "",
                                    "rf_hsb": "",
                                    "rf_lsb": "",
                                    "rf_total_setup": "",
                                },
                            },
                            "warnings": [],
                            "recommended_review_status": "PENDING",
                        }
                    )
                }
            ).encode("utf-8")

    monkeypatch.setattr(
        image_analysis_service,
        "get_settings",
        lambda: SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
            openai_request_timeout_seconds=8.0,
        ),
    )

    def fake_urlopen(request, timeout):
        captured_requests.append(
            {
                "payload": json.loads(request.data.decode("utf-8")),
                "timeout": timeout,
            }
        )
        return _FakeResponse()

    monkeypatch.setattr(image_analysis_service.urllib.request, "urlopen", fake_urlopen)

    result = image_analysis_service.analyze_submission_image(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
    )

    assert captured_requests[0]["payload"]["model"] == "gpt-5.4"
    assert result["model"] == "gpt-5.4"
    assert result["fallback_model_used"] is False


def test_analyze_submission_image_uses_fallback_model_when_primary_fails(monkeypatch):
    submission, event, run_group, driver, vehicle, _current_user = _make_actor_context(
        "OCR-FALLBACK-MODEL",
        _submission_payload(),
    )
    attempted_models: list[str] = []

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(
                {
                    "output_text": json.dumps(
                        {
                            "document_type": "shock_setup_sheet",
                            "template_name": "shock_setup",
                            "confidence": 0.91,
                            "summary": "Shock setup values detected",
                            "extracted_text": "RR 7/6/9/8",
                            "metadata": {
                                "driver_text": "NG",
                                "track_text": "Sebring International Raceway",
                                "session_text": "Practice S3",
                            },
                            "setup": {
                                "pressures": {},
                                "suspension": {},
                                "alignment": {},
                                "tire_temperatures": {},
                                "sheet_fields": {},
                                "post_session": {},
                                "shock_setup": {
                                    "rr": {
                                        "position": "RR",
                                        "hsr": "7",
                                        "lsr": "6",
                                        "hsb": "9",
                                        "lsb": "8",
                                        "total_setup": "30",
                                    },
                                    "lr": {
                                        "position": "LR",
                                        "hsr": "",
                                        "lsr": "",
                                        "hsb": "",
                                        "lsb": "",
                                        "total_setup": "",
                                    },
                                    "lf": {
                                        "position": "LF",
                                        "hsr": "",
                                        "lsr": "",
                                        "hsb": "",
                                        "lsb": "",
                                        "total_setup": "",
                                    },
                                    "rf": {
                                        "position": "RF",
                                        "hsr": "",
                                        "lsr": "",
                                        "hsb": "",
                                        "lsb": "",
                                        "total_setup": "",
                                    },
                                },
                                "notes": [],
                            },
                            "warnings": [],
                            "recommended_review_status": "PENDING",
                        }
                    )
                }
            ).encode("utf-8")

    monkeypatch.setattr(
        image_analysis_service,
        "get_settings",
        lambda: SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
            openai_request_timeout_seconds=8.0,
        ),
    )

    def fake_urlopen(request, timeout):
        payload = json.loads(request.data.decode("utf-8"))
        attempted_models.append(payload["model"])
        if len(attempted_models) == 1:
            raise image_analysis_service.urllib.error.URLError("primary unavailable")
        return _FakeResponse()

    monkeypatch.setattr(image_analysis_service.urllib.request, "urlopen", fake_urlopen)

    result = image_analysis_service.analyze_submission_image(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
    )

    assert attempted_models == ["gpt-5.4", "gpt-5.5"]
    assert result is not None
    assert result["model"] == "gpt-5.5"
    assert result["fallback_model_used"] is True
    assert result["document_type"] == "shock_setup_sheet"


def test_analyze_submission_image_handles_malformed_json_without_crashing(monkeypatch):
    submission, event, run_group, driver, vehicle, _current_user = _make_actor_context(
        "OCR-MALFORMED-JSON",
        _submission_payload(),
    )

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"output_text": "{this is not valid json"}).encode("utf-8")

    monkeypatch.setattr(
        image_analysis_service,
        "get_settings",
        lambda: SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model=None,
            openai_request_timeout_seconds=8.0,
        ),
    )
    monkeypatch.setattr(image_analysis_service.urllib.request, "urlopen", lambda *_args, **_kwargs: _FakeResponse())

    result = image_analysis_service.analyze_submission_image(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
    )

    assert result is not None
    assert result["status"] == "review_required"
    assert result["document_type"] == "low_quality_review_required"
    assert result["raw_text"] == "{this is not valid json"
    assert result["model"] == "gpt-5.4"
    assert "Structured OCR mapping could not be parsed; raw OCR text preserved." in result["warnings"]


def test_normalize_image_analysis_marks_low_confidence_results_for_review():
    normalized = image_analysis_service.normalize_image_analysis_result(
        {
            "document_type": "handwritten_setup_grid",
            "confidence": 0.22,
            "summary": "One camber value is visible",
            "extracted_text": "camber 3.8",
            "setup": {
                "alignment": {
                    "camber_fl": "3.8",
                }
            },
            "warnings": [],
            "recommended_review_status": "APPROVED",
        }
    )

    assert normalized["document_type"] == "low_quality_review_required"
    assert "low confidence extraction" in normalized["warnings"]
    assert normalized["recommended_review_status"] == "PENDING"


def test_normalize_image_analysis_accepts_nested_shock_setup():
    normalized = image_analysis_service.normalize_image_analysis_result(
        {
            "document_type": "shock_setup_sheet",
            "confidence": 0.9,
            "summary": "Shock page",
            "extracted_text": "RR 7/6/9/8",
            "setup": {
                "shock_setup": {
                    "rr": {
                        "position": "RR",
                        "hsr": "7",
                        "lsr": "6",
                        "hsb": "9",
                        "lsb": "8",
                        "total_setup": "30",
                    }
                }
            },
            "warnings": [],
            "recommended_review_status": "PENDING",
        }
    )

    assert normalized["setup"]["shock_setup"]["rr"]["hsr"] == "7"
    assert normalized["setup"]["shock_setup"]["rr"]["total_setup"] == "30"


def test_normalize_image_analysis_maps_abbreviation_grids_and_after_values():
    normalized = image_analysis_service.normalize_image_analysis_result(
        {
            "document_type": "handwritten_setup_grid",
            "confidence": 0.76,
            "summary": "Handwritten setup sheet",
            "raw_text": "RH RH2 C C2 TOE WB",
            "raw_evidence": {
                "visible_text": ["RH", "RH2", "C", "C2", "TOE", "WB"],
                "detected_grids": [
                    {
                        "label": "RH",
                        "top_left": "102",
                        "top_right": "101",
                        "bottom_left": "100",
                        "bottom_right": "99",
                    },
                    {
                        "label": "RH2",
                        "top_left": "98",
                        "top_right": "97",
                        "bottom_left": "96",
                        "bottom_right": "95",
                    },
                    {
                        "label": "C",
                        "top_left": "3.9",
                        "top_right": "3.8",
                        "bottom_left": "3.5",
                        "bottom_right": "3.5",
                    },
                    {
                        "label": "C2",
                        "top_left": "4.0",
                        "top_right": "3.9",
                        "bottom_left": "3.55",
                        "bottom_right": "3.5",
                    },
                    {
                        "label": "TOE",
                        "top_left": "1.0 out",
                        "top_right": "1.0 out",
                        "bottom_left": "2.5 in",
                        "bottom_right": "2.5 in",
                    },
                    {
                        "label": "WB",
                        "top_left": "2475",
                        "top_right": "2475",
                    },
                ],
                "detected_labels": [],
                "unmapped_values": [],
            },
            "setup": {},
            "warnings": [],
            "recommended_review_status": "PENDING",
        }
    )

    assert normalized["status"] == "review_required"
    assert normalized["setup"]["alignment"]["rh_fl"] == "98"
    assert normalized["setup"]["alignment"]["rh_fr"] == "97"
    assert normalized["setup"]["alignment"]["rh_rl"] == "96"
    assert normalized["setup"]["alignment"]["rh_rr"] == "95"
    assert normalized["setup"]["alignment"]["camber_fl"] == "4.0"
    assert normalized["setup"]["alignment"]["camber_fr"] == "3.9"
    assert normalized["setup"]["alignment"]["camber_rl"] == "3.55"
    assert normalized["setup"]["alignment"]["camber_rr"] == "3.5"
    assert normalized["setup"]["alignment"]["toe_fl"] == "1.0 out"
    assert normalized["setup"]["alignment"]["toe_fr"] == "1.0 out"
    assert normalized["setup"]["alignment"]["toe_rl"] == "2.5 in"
    assert normalized["setup"]["alignment"]["toe_rr"] == "2.5 in"
    assert normalized["setup"]["alignment"]["wheelbase_mm"] == "2475"
    assert normalized["setup"]["sheet_fields"]["wheelbase_left_mm"] == "2475"
    assert normalized["setup"]["sheet_fields"]["wheelbase_right_mm"] == "2475"
    assert "Before and after values detected; after value used." in normalized["warnings"]


def test_normalize_image_analysis_accepts_hbs_alias_in_shock_setup():
    normalized = image_analysis_service.normalize_image_analysis_result(
        {
            "document_type": "shock_setup_sheet",
            "confidence": 0.9,
            "summary": "Shock page",
            "extracted_text": "RR 7/6/9/8",
            "setup": {
                "shock_setup": {
                    "rr": {
                        "position": "RR",
                        "hsr": "7",
                        "lsr": "6",
                        "hbs": "9",
                        "lsb": "8",
                        "total_setup": "30",
                    }
                }
            },
            "warnings": [],
            "recommended_review_status": "PENDING",
        }
    )

    assert normalized["setup"]["shock_setup"]["rr"]["position"] == "RR"
    assert normalized["setup"]["shock_setup"]["rr"]["hsb"] == "9"
    assert normalized["setup"]["shock_setup"]["rr"]["lsb"] == "8"


def test_analyze_submission_image_uses_fallback_when_primary_result_is_too_sparse(monkeypatch):
    submission, event, run_group, driver, vehicle, _current_user = _make_actor_context(
        "OCR-SPARSE-PRIMARY",
        _submission_payload(),
    )
    attempted_models: list[str] = []

    class _FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"output_text": json.dumps(self.payload)}).encode("utf-8")

    primary_payload = {
        "document_type": "unknown",
        "confidence": 0.18,
        "summary": "",
        "extracted_text": "",
        "setup": {},
        "warnings": ["ambiguous handwriting"],
        "recommended_review_status": "PENDING",
    }
    fallback_payload = {
        "document_type": "handwritten_setup_grid",
        "confidence": 0.82,
        "summary": "Mapped handwritten setup grid",
        "extracted_text": "RH 102 101 100 99",
        "raw_evidence": {
            "visible_text": ["RH", "102", "101", "100", "99"],
            "detected_grids": [
                {
                    "label": "RH",
                    "top_left": "102",
                    "top_right": "101",
                    "bottom_left": "100",
                    "bottom_right": "99",
                }
            ],
            "detected_labels": [{"label": "RH"}],
            "unmapped_values": [],
        },
        "setup": {},
        "warnings": [],
        "recommended_review_status": "PENDING",
    }

    monkeypatch.setattr(
        image_analysis_service,
        "get_settings",
        lambda: SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
            openai_request_timeout_seconds=8.0,
        ),
    )

    def fake_urlopen(request, timeout):
        payload = json.loads(request.data.decode("utf-8"))
        attempted_models.append(payload["model"])
        if payload["model"] == "gpt-5.4":
            return _FakeResponse(primary_payload)
        return _FakeResponse(fallback_payload)

    monkeypatch.setattr(image_analysis_service.urllib.request, "urlopen", fake_urlopen)

    result = image_analysis_service.analyze_submission_image(
        submission=submission,
        event=event,
        run_group=run_group,
        driver=driver,
        vehicle=vehicle,
    )

    assert attempted_models == ["gpt-5.4", "gpt-5.5"]
    assert result is not None
    assert result["status"] == "success"
    assert result["model"] == "gpt-5.5"
    assert result["fallback_model_used"] is True
    assert result["document_type"] == "handwritten_setup_grid"
    assert result["setup"]["alignment"]["rh_fl"] == "102"


def test_preview_ocr_submission_unknown_document_returns_review_required(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )
    monkeypatch.setattr(
        submissions_endpoints,
        "analyze_submission_image",
        lambda **_kwargs: {
            "document_type": "unknown",
            "confidence": 0.35,
            "summary": "Notebook page with a few visible values",
            "extracted_text": "Sebring Daniel initial setup 22.5 psi",
            "setup": {},
            "warnings": ["label-to-grid mapping uncertain"],
            "recommended_review_status": "PENDING",
            "model": "gpt-5.4",
        },
    )

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
        ),
        session,
        current_user,
    )

    assert result.status == "review_required"
    assert result.doc_type == "low_quality_review_required"
    assert "label-to-grid mapping uncertain" in result.review_flags
    assert "Manual review required" in result.review_flags


def test_normalize_image_analysis_result_maps_sequential_data_blocks():
    normalized = image_analysis_service.normalize_image_analysis_result(
        {
            "document_type": "handwritten_setup_grid",
            "confidence": 0.88,
            "summary": "Alex-style handwritten sheet",
            "extracted_text": "",
            "metadata": {
                "driver_text": "Jeff Sebring",
                "track_text": "Sebring",
                "session_text": "",
                "session_notes": "Spring medium",
            },
            "raw_evidence": {
                "visible_text": [],
                "detected_grids": [],
                "detected_labels": [],
                "unmapped_values": [],
            },
            "data_blocks": [
                {
                    "sequence_id": 1,
                    "label": "RH",
                    "coordinates_context": "top-left",
                    "data": {"fl": "102", "fr": "101", "rl": "100", "rr": "99"},
                    "raw_text_found": {"fl": "102", "fr": "101", "rl": "100", "rr": "99"},
                    "adjustments_applied": "",
                },
                {
                    "sequence_id": 2,
                    "label": "RH2",
                    "coordinates_context": "upper-right",
                    "data": {"fl": "98", "fr": "97", "rl": "100", "rr": "95"},
                    "raw_text_found": {"fl": "98", "fr": "97", "rl": "100", "rr": "95"},
                    "adjustments_applied": "after-session values supersede the first grid",
                },
                {
                    "sequence_id": 3,
                    "label": "C",
                    "coordinates_context": "mid-left",
                    "data": {"fl": "3.9", "fr": "3.8", "rl": "3.7", "rr": "3.5"},
                    "raw_text_found": {"fl": "3.9", "fr": "3.8", "rl": "3.7", "rr": "3.5"},
                    "adjustments_applied": "",
                },
                {
                    "sequence_id": 4,
                    "label": "C2",
                    "coordinates_context": "mid-right",
                    "data": {"fl": "4.0", "fr": "3.9", "rl": "3.55", "rr": "3.5"},
                    "raw_text_found": {"fl": "4.0", "fr": "3.9", "rl": "3.55", "rr": "3.5"},
                    "adjustments_applied": "",
                },
                {
                    "sequence_id": 5,
                    "label": "WB",
                    "coordinates_context": "bottom",
                    "data": {"fl": "2475", "fr": "2475", "rl": "", "rr": ""},
                    "raw_text_found": {"fl": "2475", "fr": "2475", "rl": "", "rr": ""},
                    "adjustments_applied": "",
                },
            ],
            "unstructured_elements": ["50.4%", "Sebring Daniel initial setup"],
            "warnings": [],
            "recommended_review_status": "PENDING",
        }
    )

    assert normalized["document_type"] == "handwritten_setup_grid"
    assert normalized["metadata"]["session_text"] == "Spring medium"
    assert normalized["setup"]["alignment"]["rh_fl"] == "98"
    assert normalized["setup"]["alignment"]["rh_fr"] == "97"
    assert normalized["setup"]["alignment"]["rh_rr"] == "95"
    assert normalized["setup"]["alignment"]["camber_fl"] == "4.0"
    assert normalized["setup"]["alignment"]["camber_rl"] == "3.55"
    assert normalized["setup"]["alignment"]["wheelbase_mm"] == "2475"
    assert "Before and after values detected; after value used." in normalized["warnings"]
    assert any(grid["label"] == "RH2" for grid in normalized["raw_evidence"]["detected_grids"])
    assert "50.4%" in normalized["setup"]["notes"]


def test_preview_ocr_submission_accepts_blank_setup_sheet(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )
    monkeypatch.setattr(
        submissions_endpoints,
        "analyze_submission_image",
        lambda **_kwargs: {
            "document_type": "blank_setup_sheet",
            "confidence": 0.96,
            "summary": "Blank printed setup sheet",
            "extracted_text": "",
            "setup": {},
            "warnings": ["no readable setup values detected"],
            "recommended_review_status": "PENDING",
            "model": "gpt-5.4",
        },
    )

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
        ),
        session,
        current_user,
    )

    assert result.status == "review_required"
    assert result.doc_type == "blank_setup_sheet"
    assert result.structured_data["alignment"]["rh_fl"] == ""
    assert "no readable setup values detected" in result.review_flags


def test_preview_ocr_submission_builds_review_draft_from_data_blocks(monkeypatch):
    event = SimpleNamespace(
        id=uuid4(),
        name="Sebring",
        track="Sebring International Raceway",
        start_date=_dt(2026, 5, 10),
        end_date=_dt(2026, 5, 20),
        is_active=True,
    )
    run_group = SimpleNamespace(
        id=uuid4(),
        event_id=event.id,
        raw_text="BLUE",
        normalized="BLUE",
    )
    session = _PreviewSession(event=event, run_group=run_group)
    current_user = SimpleNamespace(id=uuid4(), name="Mechanic One", email="mechanic@example.com")

    monkeypatch.setattr(
        submissions_endpoints,
        "settings",
        SimpleNamespace(
            chatbot_image_analysis_enabled=True,
            openai_api_key="test-key",
            openai_vision_model="gpt-5.4",
            openai_fallback_model="gpt-5.5",
        ),
    )
    monkeypatch.setattr(
        submissions_endpoints,
        "analyze_submission_image",
        lambda **_kwargs: {
            "document_type": "handwritten_setup_grid",
            "confidence": 0.73,
            "summary": "Verified grid blocks extracted",
            "extracted_text": "",
            "metadata": {
                "driver_text": "Jeff Sebring",
                "track_text": "Sebring",
                "session_text": "",
                "session_notes": "Spring medium",
            },
            "raw_evidence": {
                "visible_text": [],
                "detected_grids": [],
                "detected_labels": [],
                "unmapped_values": [],
            },
            "data_blocks": [
                {
                    "sequence_id": 1,
                    "label": "RH",
                    "coordinates_context": "top-left",
                    "data": {"fl": "102", "fr": "101", "rl": "100", "rr": "99"},
                    "raw_text_found": {"fl": "102", "fr": "101", "rl": "100", "rr": "99"},
                    "adjustments_applied": "",
                },
                {
                    "sequence_id": 2,
                    "label": "C",
                    "coordinates_context": "middle",
                    "data": {"fl": "3.9", "fr": "3.8", "rl": "3.7", "rr": "3.5"},
                    "raw_text_found": {"fl": "3.9", "fr": "3.8", "rl": "3.7", "rr": "3.5"},
                    "adjustments_applied": "",
                },
            ],
            "unstructured_elements": ["50.4%", "margin note: Sebring medium"],
            "warnings": ["manual verification recommended"],
            "recommended_review_status": "PENDING",
            "model": "gpt-5.4",
        },
    )

    result = submissions_endpoints.preview_ocr_submission(
        OcrPreviewCreate(
            event_id=event.id,
            run_group_id=run_group.id,
            image_url="data:image/png;base64,AAAA",
        ),
        session,
        current_user,
    )

    assert result.status == "review_required"
    assert result.doc_type == "handwritten_setup_grid"
    assert result.model_used == "gpt-5.4"
    assert result.structured_data["alignment"]["rh_fl"] == "102"
    assert result.structured_data["alignment"]["camber_rr"] == "3.5"
    assert "50.4%" in result.structured_data["notes"]
    assert "manual verification recommended" in result.review_flags


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
