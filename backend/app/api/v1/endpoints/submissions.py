import logging
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.core.config import get_settings
from app.core.database import get_db
from app.core.enums import SubmissionStatus, UserRole, VoiceNoteStatus
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.structured_notes import Seance
from app.models.submission import Submission
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.voice_note import VoiceNoteSession
from app.schemas.submission import (
    RawSubmissionCreate,
    RawSubmissionResult,
    SubmissionCreate,
    SubmissionRead,
    SubmissionUpdate,
)
from app.services.image_analysis_service import analyze_submission_image
from app.services.raw_note_llm_service import extract_raw_note_via_openai
from app.services.raw_submission_service import (
    RawSubmissionValidationError,
    build_raw_submission_payload,
    describe_raw_exception,
    parse_raw_note,
    resolve_driver_alias,
    resolve_vehicle_alias,
    validate_raw_submission_payload,
)
from app.services.raw_submission_current_schema_service import (
    lookup_raw_duplicate_current_schema,
    persist_raw_submission_current_schema,
    write_raw_audit_log_current_schema,
)
from app.services.run_group_service import normalize_run_group
from app.services.submission_delivery_service import (
    enqueue_submission_delivery,
    process_submission_delivery,
    process_submission_delivery_task,
)
from app.services.submission_ingest_service import (
    _write_audit_log,
    persist_structured_submission,
    record_image_analysis_result,
    stage_submission_input,
)
from app.services.submission_payload_service import (
    get_session_payload,
    merge_submission_analysis,
    normalize_optional_text,
    should_persist_structured_submission,
)
from app.services.voice_note_service import confirm_voice_session, get_voice_session_for_user


router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


def _submission_error(
    status_code: int,
    code: str,
    message: str,
    *,
    detail: dict | None = None,
) -> HTTPException:
    payload: dict[str, object] = {"code": code, "message": message}
    if detail is not None:
        payload["detail"] = detail
    return HTTPException(status_code=status_code, detail=payload)


def _submission_log_summary(
    *,
    submission_ref: str | None,
    correlation_id: str | None,
    event_id: UUID | None,
    run_group_id: UUID | None,
    driver_id: str | None,
    vehicle_id: str | None,
    current_user_id: UUID | None,
    payload: dict | None = None,
) -> str:
    session_payload = get_session_payload(payload)
    session_date = normalize_optional_text(session_payload.get("date"))
    session_time = normalize_optional_text(session_payload.get("time"))
    session_number = session_payload.get("session_number")
    session_type = normalize_optional_text(session_payload.get("session_type"))

    return (
        f"submission_ref={submission_ref or 'none'} "
        f"correlation_id={correlation_id or 'none'} "
        f"event_id={event_id or 'none'} "
        f"run_group_id={run_group_id or 'none'} "
        f"driver_id={driver_id or 'none'} "
        f"vehicle_id={vehicle_id or 'none'} "
        f"user_id={current_user_id or 'none'} "
        f"session_date={session_date or 'none'} "
        f"session_time={session_time or 'none'} "
        f"session_type={session_type or 'none'} "
        f"session_number={session_number if session_number not in (None, '') else 'none'}"
    )


def _with_suffix(value: str, suffix: str, max_length: int) -> str:
    if len(suffix) >= max_length:
        return suffix[:max_length]
    return f"{value[: max_length - len(suffix)]}{suffix}"


def _ensure_unique_submission_ref(db: Session, submission_ref: str | None) -> str:
    candidate = (normalize_optional_text(submission_ref) or str(uuid4()))[:120]
    while db.scalar(select(Submission.id).where(Submission.submission_ref == candidate)) is not None:
        candidate = _with_suffix(candidate, f"-{uuid4().hex[:8]}", 120)
    return candidate


def _ensure_unique_correlation_id(db: Session, correlation_id: str | None) -> str:
    candidate = (normalize_optional_text(correlation_id) or str(uuid4()))[:36]
    while db.scalar(select(Submission.id).where(Submission.correlation_id == candidate)) is not None:
        candidate = str(uuid4())
    return candidate


def _is_integrity_duplicate_error(exc: IntegrityError) -> bool:
    message = " ".join(str(part) for part in getattr(exc, "args", ()) or (str(exc),)).lower()
    if "duplicate key" in message:
        return True
    if "unique constraint" in message:
        return True
    if "uq_submissions_session_fingerprint" in message:
        return True
    if "ux_submissions_correlation_id" in message:
        return True
    return False


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _is_midnight(value: datetime) -> bool:
    return (
        value.hour == 0
        and value.minute == 0
        and value.second == 0
        and value.microsecond == 0
    )


def _event_submission_start_to_utc(event: Event) -> datetime | None:
    return _as_utc(getattr(event, "start_date", None))


def _event_submission_end_to_utc(event: Event) -> datetime | None:
    end_date = _as_utc(getattr(event, "end_date", None))
    if end_date is None:
        return None

    # Admin events are date-based, so a midnight end date should stay open through that full day.
    if _is_midnight(end_date):
        return end_date + timedelta(days=1)

    return end_date


def _submission_options():
    return (
        joinedload(Submission.event),
        joinedload(Submission.run_group),
        joinedload(Submission.driver),
        joinedload(Submission.vehicle),
        joinedload(Submission.voice_session).joinedload(VoiceNoteSession.attempts),
    )


def _submission_stmt():
    return select(Submission).options(*_submission_options()).order_by(Submission.created_at.desc())


def _load_submission(db: Session, submission_id: UUID) -> Submission | None:
    stmt = select(Submission).options(*_submission_options()).where(Submission.id == submission_id)
    return db.scalar(stmt)


def _validate_submission_relations(
    db: Session,
    submission_in: SubmissionCreate,
) -> tuple[Driver | None, Vehicle | None]:
    driver = None
    vehicle = None

    if submission_in.driver_id and not submission_in.vehicle_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vehicle is required when a driver is selected",
        )
    if submission_in.vehicle_id and not submission_in.driver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver is required when a vehicle is selected",
        )

    if submission_in.driver_id:
        driver_code = submission_in.driver_id.strip()
        driver = db.scalar(select(Driver).where(Driver.driver_id == driver_code))
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
        if not driver.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Driver is archived")

    if submission_in.vehicle_id:
        vehicle_code = submission_in.vehicle_id.strip()
        vehicle = db.scalar(select(Vehicle).where(Vehicle.vehicle_id == vehicle_code))
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
        if not vehicle.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle is archived")

    if driver and vehicle and vehicle.driver_id != driver.driver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vehicle does not belong to the selected driver",
        )

    return driver, vehicle


def _build_submission_candidate(
    submission_in: SubmissionCreate,
    current_user: User,
    event: Event,
    run_group: RunGroup,
    driver: Driver | None,
    vehicle: Vehicle | None,
    correlation_id: str,
    voice_session: VoiceNoteSession | None = None,
) -> Submission:
    raw_text = normalize_optional_text(submission_in.raw_text)
    if raw_text is None and voice_session is not None:
        raw_text = (
            normalize_optional_text(voice_session.transcript_edited_text)
            or normalize_optional_text(voice_session.transcript_text)
        )
    image_url = normalize_optional_text(submission_in.image_url)
    analysis_result = merge_submission_analysis(
        submission_in.payload,
        raw_text,
        image_url,
        submission_in.analysis_result,
    )

    if voice_session is not None:
        analysis_result = {
            **analysis_result,
            "source_type": "voice",
            "has_voice_notes": True,
            "voice_input_used": True,
            "raw_input_mode": "voice",
            "voice_session_id": str(voice_session.id),
            "voice_session_status": (
                voice_session.status.value if hasattr(voice_session.status, "value") else voice_session.status
            ),
            "voice_transcript_confidence": voice_session.transcript_confidence,
            "voice_validation_status": voice_session.validation_status,
        }

    submission = Submission(
        submission_ref=submission_in.submission_ref,
        event_id=event.id,
        run_group_id=run_group.id,
        driver_id=driver.id if driver else None,
        vehicle_id=vehicle.id if vehicle else None,
        voice_session_id=voice_session.id if voice_session is not None else None,
        created_by_id=current_user.id,
        correlation_id=correlation_id,
        raw_text=raw_text,
        image_url=image_url,
        payload=submission_in.payload,
        analysis_result=analysis_result,
        structured_ingest_status="skipped",
        structured_ingest_warnings=[],
        status=SubmissionStatus.PENDING,
    )
    submission.event = event
    submission.run_group = run_group
    submission.driver = driver
    submission.vehicle = vehicle
    return submission


def _raw_request_user_label(user: User | None, fallback: str) -> str:
    if user is None:
        return fallback
    return normalize_optional_text(user.name) or normalize_optional_text(user.email) or fallback


def _resolve_raw_created_by_user(
    db: Session,
    *,
    created_by: str,
    current_user: User,
) -> User:
    normalized_created_by = normalize_optional_text(created_by)
    if not normalized_created_by:
        raise RawSubmissionValidationError(
            "created_by must exist",
            errors=[{"field": "created_by", "message": "created_by must exist"}],
        )

    matched_user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.name) == normalized_created_by.lower(),
                func.lower(User.email) == normalized_created_by.lower(),
            )
        )
    )
    if matched_user is None:
        raise RawSubmissionValidationError(
            "created_by does not exist",
            errors=[{"field": "created_by", "message": "created_by does not exist"}],
        )

    if matched_user.id != current_user.id and current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        raise RawSubmissionValidationError(
            "created_by does not match the authenticated user",
            errors=[
                {
                    "field": "created_by",
                    "message": "created_by does not match the authenticated user",
                }
            ],
        )

    return matched_user


def _resolve_raw_event(db: Session, event_identifier: str) -> Event:
    normalized_identifier = normalize_optional_text(event_identifier)
    if not normalized_identifier:
        raise RawSubmissionValidationError(
            "eventId is required",
            errors=[{"field": "eventId", "message": "eventId is required"}],
        )

    event: Event | None = None
    try:
        event = db.get(Event, UUID(normalized_identifier))
    except ValueError:
        event = None

    if event is None:
        event = db.scalar(select(Event).where(func.lower(Event.name) == normalized_identifier.lower()))

    if event is None:
        raise RawSubmissionValidationError(
            "eventId was not found",
            errors=[{"field": "eventId", "message": "eventId was not found"}],
        )
    if not event.is_active:
        raise RawSubmissionValidationError(
            "event is archived",
            errors=[{"field": "eventId", "message": "event is archived"}],
        )

    return event


def _resolve_raw_run_group(
    db: Session,
    *,
    event: Event,
    requested_run_group: str,
) -> RunGroup:
    run_group = db.scalar(select(RunGroup).where(RunGroup.event_id == event.id))
    if run_group is None:
        raise RawSubmissionValidationError(
            "runGroup is not configured for this event",
            errors=[{"field": "runGroup", "message": "runGroup is not configured for this event"}],
        )

    normalized_requested_run_group = normalize_run_group(requested_run_group)
    if normalized_requested_run_group is None:
        raise RawSubmissionValidationError(
            "runGroup is invalid",
            errors=[{"field": "runGroup", "message": "runGroup is invalid"}],
        )

    if run_group.normalized != normalized_requested_run_group:
        raise RawSubmissionValidationError(
            "runGroup does not match the event run group",
            errors=[{"field": "runGroup", "message": "runGroup does not match the event run group"}],
        )

    return run_group


def _validate_raw_event_submission_window(event: Event) -> None:
    now = datetime.now(timezone.utc)
    event_start_date = _event_submission_start_to_utc(event)
    event_end_date = _event_submission_end_to_utc(event)
    if event_start_date is not None and now < event_start_date:
        raise RawSubmissionValidationError(
            "submission notes open when the event start date arrives",
            errors=[
                {
                    "field": "eventId",
                    "message": "submission notes open when the event start date arrives",
                }
            ],
        )
    if event_end_date is not None and now >= event_end_date:
        raise RawSubmissionValidationError(
            "submission notes close after the event end date passes",
            errors=[
                {
                    "field": "eventId",
                    "message": "submission notes close after the event end date passes",
                }
            ],
        )


def _raw_duplicate_lookup(
    db: Session,
    *,
    session_data: dict[str, object],
    raw_text: str,
) -> Seance | None:
    session_date = date.fromisoformat(str(session_data["date"]))
    session_time = time.fromisoformat(str(session_data["time"]))
    stmt = select(Seance).where(
        Seance.session_date == session_date,
        Seance.session_time == session_time,
        Seance.track == str(session_data["track"]),
        Seance.driver_id == str(session_data["driver_id"]),
        Seance.vehicle_id == str(session_data["vehicle_id"]),
        Seance.session_type == str(session_data["session_type"]),
        Seance.session_number == int(session_data["session_number"]),
        Seance.notes == raw_text,
    )
    return db.scalar(stmt)


def _raw_submission_response(
    *,
    status_code: int,
    status_value: str,
    message: str,
    id_seance: str | None = None,
    errors: list[dict[str, object]] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "status": status_value,
            "id_seance": id_seance,
            "message": message,
            "errors": errors or [],
        },
    )


def _finalize_delivery(
    db: Session,
    submission: Submission,
    *,
    submission_input_id: int | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> Submission:
    if not settings.make_webhook_url:
        final_submission = process_submission_delivery(
            db,
            submission.id,
            submission_input_id=submission_input_id,
        )
        return final_submission or submission

    enqueue_submission_delivery(
        db,
        submission,
        submission_input_id=submission_input_id,
    )
    db.commit()
    db.refresh(submission)

    if background_tasks is not None:
        background_tasks.add_task(
            process_submission_delivery_task,
            submission.id,
            submission_input_id=submission_input_id,
        )

    return submission


@router.get("", response_model=list[SubmissionRead])
def list_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Submission]:
    stmt = _submission_stmt()
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        stmt = stmt.where(Submission.created_by_id == current_user.id)
    return list(db.scalars(stmt).unique().all())


@router.get("/event/{event_id}", response_model=list[SubmissionRead])
def list_submissions_by_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Submission]:
    event = db.scalar(select(Event).options(joinedload(Event.run_group)).where(Event.id == event_id))
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    stmt = _submission_stmt().where(Submission.event_id == event_id)
    if event.run_group:
        stmt = stmt.where(Submission.run_group_id == event.run_group.id)
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        stmt = stmt.where(Submission.created_by_id == current_user.id)
    return list(db.scalars(stmt).unique().all())


@router.get("/user/{user_id}", response_model=list[SubmissionRead])
def list_submissions_by_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Submission]:
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN) and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    stmt = _submission_stmt().where(Submission.created_by_id == user_id)
    return list(db.scalars(stmt).unique().all())


@router.post("", response_model=SubmissionRead, status_code=status.HTTP_201_CREATED)
def create_submission(
    submission_in: SubmissionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Submission:
    voice_session = None
    event = db.get(Event, submission_in.event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not event.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is archived")
    now = datetime.now(timezone.utc)
    event_start_date = _event_submission_start_to_utc(event)
    event_end_date = _event_submission_end_to_utc(event)
    if event_start_date is not None and now < event_start_date:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Submission notes open when the event start date arrives",
        )
    if event_end_date is not None and now >= event_end_date:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Submission notes close after the event end date passes",
        )

    run_group = db.get(RunGroup, submission_in.run_group_id)
    if not run_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run group not found")
    if run_group.event_id != submission_in.event_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run group does not belong to the event")

    driver, vehicle = _validate_submission_relations(db, submission_in)

    if submission_in.voice_session_id is not None:
        voice_session = get_voice_session_for_user(
            db,
            submission_in.voice_session_id,
            current_user=current_user,
            load_attempts=True,
        )
        if voice_session.event_id != submission_in.event_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voice session does not belong to the event")
        if voice_session.run_group_id != submission_in.run_group_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voice session does not belong to the run group")
        if voice_session.status == VoiceNoteStatus.ARCHIVED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voice session is archived")
        if voice_session.status == VoiceNoteStatus.TRANSCRIPTION_FAILED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voice transcription failed and cannot be submitted")
        if not normalize_optional_text(submission_in.raw_text):
            submission_in = submission_in.model_copy(
                update={
                    "raw_text": (
                        normalize_optional_text(voice_session.transcript_edited_text)
                        or normalize_optional_text(voice_session.transcript_text)
                    )
                }
            )
        if not normalize_optional_text(submission_in.raw_text):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voice transcript is empty")

    submission_ref = _ensure_unique_submission_ref(db, submission_in.submission_ref)
    correlation_id = _ensure_unique_correlation_id(db, submission_in.correlation_id)
    submission_input = submission_in.model_copy(
        update={
            "submission_ref": submission_ref,
            "correlation_id": correlation_id,
        }
    )
    submission_log_summary = _submission_log_summary(
        submission_ref=submission_ref,
        correlation_id=correlation_id,
        event_id=submission_in.event_id,
        run_group_id=submission_in.run_group_id,
        driver_id=submission_in.driver_id,
        vehicle_id=submission_in.vehicle_id,
        current_user_id=current_user.id,
        payload=submission_in.payload,
    )

    submission = _build_submission_candidate(
        submission_input,
        current_user,
        event,
        run_group,
        driver,
        vehicle,
        correlation_id,
        voice_session=voice_session,
    )

    db.add(submission)
    submission_input_id = None
    try:
        db.flush()

        if should_persist_structured_submission(submission.analysis_result):
            try:
                structured_result = persist_structured_submission(
                    db,
                    submission=submission,
                    event=event,
                    run_group=run_group,
                    driver=driver,
                    vehicle=vehicle,
                    current_user=current_user,
                )
                submission_input_id = structured_result.submission_input_id
                submission.structured_ingest_status = structured_result.status
                submission.structured_ingest_warnings = structured_result.warnings
            except Exception:
                submission_input_id = None
                submission.structured_ingest_status = "skipped"
                submission.structured_ingest_warnings = [
                    {
                        "section": "structured_ingest",
                        "code": "STRUCTURED_INGEST_FAILED",
                        "message": "Structured normalization failed unexpectedly. The canonical note was still saved.",
                    }
                ]
                logger.exception(
                    "Structured submission persistence failed; continuing with raw submission only (%s)",
                    submission_log_summary,
                )
        else:
            submission.structured_ingest_status = "skipped"
            submission.structured_ingest_warnings = []

        if voice_session is not None:
            now = datetime.now(timezone.utc)
            voice_session.transcript_edited_text = normalize_optional_text(submission.raw_text)
            if not voice_session.transcript_text:
                voice_session.transcript_text = normalize_optional_text(submission.raw_text)
            voice_session.confirmed_at = voice_session.confirmed_at or now
            voice_session.submitted_at = now
            voice_session.status = VoiceNoteStatus.SUBMITTED
            voice_session.validation_status = "VALIDATED"
            voice_session.validation_message = "Transcript confirmed and submission created."
            voice_session.submission = submission
            voice_session.submission_id = submission.id
            db.add(voice_session)

        if submission.image_url and submission_input_id is None:
            try:
                image_analysis = analyze_submission_image(
                    submission=submission,
                    event=event,
                    run_group=run_group,
                    driver=driver,
                    vehicle=vehicle,
                )
                if image_analysis:
                    submission.analysis_result = {
                        **(submission.analysis_result or {}),
                        "has_image_analysis": True,
                        "image_analysis_review_status": image_analysis.get("recommended_review_status") or "PENDING",
                        "image_analysis": image_analysis,
                    }
                submission_input_id = stage_submission_input(
                    db,
                    submission=submission,
                    event=event,
                    run_group=run_group,
                    driver=driver,
                    vehicle=vehicle,
                    current_user=current_user,
                    source="photo",
                )
                record_image_analysis_result(
                    db,
                    submission_input_id=submission_input_id,
                    image_analysis=image_analysis,
                )
                submission.structured_ingest_status = "pending_review"
                submission.structured_ingest_warnings = [
                    *submission.structured_ingest_warnings,
                    {
                        "section": "image_analysis",
                        "code": "IMAGE_STAGED_FOR_REVIEW",
                        "message": "Image input was staged for review before any structured event/session/setup data is applied.",
                    },
                ]
            except Exception:
                logger.exception(
                    "Image submission staging failed; continuing with canonical submission only (%s)",
                    submission_log_summary,
                )
                submission.structured_ingest_warnings = [
                    *submission.structured_ingest_warnings,
                    {
                        "section": "image_analysis",
                        "code": "IMAGE_STAGE_FAILED",
                        "message": "Image analysis or staging failed unexpectedly. The canonical submission was still saved.",
                    },
                ]

        if settings.make_webhook_url:
            enqueue_submission_delivery(
                db,
                submission,
                submission_input_id=submission_input_id,
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not _is_integrity_duplicate_error(exc):
            logger.exception(
                "Unexpected submission integrity error while saving (%s)",
                submission_log_summary,
            )
            raise _submission_error(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "SUBMISSION_SAVE_FAILED",
                "Failed to save submission",
            ) from exc

        logger.warning(
            "Submission duplicate integrity conflict while saving (%s)",
            submission_log_summary,
        )
        raise _submission_error(
            status.HTTP_409_CONFLICT,
            "SUBMISSION_DUPLICATE",
            "Submission already exists or conflicts with an existing session",
        ) from exc
    except HTTPException as exc:
        db.rollback()
        logger.warning(
            "Submission rejected after entering save pipeline (%s): %s",
            submission_log_summary,
            getattr(exc, "detail", exc),
        )
        raise
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Unexpected submission save failure (%s)",
            submission_log_summary,
        )
        raise _submission_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUBMISSION_SAVE_FAILED",
            "Failed to save submission",
        ) from exc

    db.refresh(submission)

    loaded_submission = _load_submission(db, submission.id)
    if loaded_submission is None:
        logger.error(
            "Submission saved but failed to reload from database (%s)",
            submission_log_summary,
        )
        raise _submission_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUBMISSION_LOAD_FAILED",
            "Failed to load submission",
        )

    if settings.make_webhook_url:
        background_tasks.add_task(
            process_submission_delivery_task,
            loaded_submission.id,
            submission_input_id=submission_input_id,
        )
        return loaded_submission

    return _finalize_delivery(
        db,
        loaded_submission,
        submission_input_id=submission_input_id,
    )


@router.post("/raw", response_model=RawSubmissionResult, status_code=status.HTTP_201_CREATED)
def create_raw_submission(
    submission_in: RawSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    request_payload = submission_in.model_dump(by_alias=True)
    request_user_label = submission_in.created_by
    parser_mode = "deterministic"

    try:
        created_by_user = _resolve_raw_created_by_user(
            db,
            created_by=submission_in.created_by,
            current_user=current_user,
        )
        request_user_label = _raw_request_user_label(created_by_user, submission_in.created_by)

        event = _resolve_raw_event(db, submission_in.event_id)
        _validate_raw_event_submission_window(event)
        run_group = _resolve_raw_run_group(
            db,
            event=event,
            requested_run_group=submission_in.run_group,
        )

        # Parse the shorthand note into deterministic structured session data first.
        try:
            parsed_note = parse_raw_note(submission_in.raw_text)
        except RawSubmissionValidationError as parse_error:
            # Keep OpenAI as a backend-only fallback for notes the deterministic parser cannot read.
            fallback_result = extract_raw_note_via_openai(submission_in.raw_text)
            if fallback_result is None:
                raise parse_error
            parsed_note = fallback_result.parsed_note
            parser_mode = "openai"
            submission_confidence = fallback_result.confidence
            logger.info(
                "Raw submission parse used OpenAI fallback: event_id=%s session_number=%s",
                submission_in.event_id,
                parsed_note.session_number,
            )
        else:
            submission_confidence = submission_in.confidence

        driver = resolve_driver_alias(
            db.scalars(select(Driver).where(Driver.is_active.is_(True))).all(),
            parsed_note.driver_alias,
        )
        vehicle = resolve_vehicle_alias(
            db.scalars(
                select(Vehicle).where(
                    Vehicle.is_active.is_(True),
                    Vehicle.driver_id == driver.driver_id,
                )
            ).all(),
            parsed_note.vehicle_alias,
        )

        captured_at = datetime.now(timezone.utc)
        payload, analysis_result, id_seance = build_raw_submission_payload(
            parsed_note,
            driver_id=driver.driver_id,
            vehicle_id=vehicle.vehicle_id,
            track=event.track,
            run_group=run_group.normalized.value,
            created_by=request_user_label,
            captured_at=captured_at,
            confidence=submission_confidence,
        )

        # Validate the backend-owned structured payload before any database write.
        validation_errors = validate_raw_submission_payload(
            created_by=request_user_label,
            raw_text=submission_in.raw_text,
            payload=payload,
            analysis_result=analysis_result,
        )
        if vehicle.driver_id != driver.driver_id:
            validation_errors.append(
                {"field": "vehicle_id", "message": "vehicle_id does not belong to driver_id"}
            )
        if validation_errors:
            raise RawSubmissionValidationError(
                validation_errors[0]["message"],
                errors=validation_errors,
            )

        duplicate_session_id = lookup_raw_duplicate_current_schema(
            db,
            id_seance=id_seance,
            raw_text=submission_in.raw_text,
        )
        if duplicate_session_id is not None:
            write_raw_audit_log_current_schema(
                db,
                action="submission.ingest.raw",
                status="SUCCESS",
                entity_type="seance",
                entity_id=duplicate_session_id,
                message=f"Duplicate raw submission ignored for {duplicate_session_id}",
                payload={
                    **request_payload,
                    "parser_mode": parser_mode,
                    "id_seance": duplicate_session_id,
                    "duplicate": True,
                },
                actor_user_id=current_user.id,
                correlation_id=None,
            )
            db.commit()
            return _raw_submission_response(
                status_code=status.HTTP_200_OK,
                status_value="SUCCESS",
                id_seance=duplicate_session_id,
                message="Duplicate session ignored",
            )

        submission_ref = _ensure_unique_submission_ref(db, f"RAW-{id_seance}")
        correlation_id = _ensure_unique_correlation_id(db, str(uuid4()))
        submission_payload = SubmissionCreate(
            submission_ref=submission_ref,
            correlation_id=correlation_id,
            event_id=event.id,
            run_group_id=run_group.id,
            driver_id=driver.driver_id,
            vehicle_id=vehicle.vehicle_id,
            raw_text=submission_in.raw_text,
            payload=payload,
            analysis_result=analysis_result,
        )
        raw_submission = _build_submission_candidate(
            submission_payload,
            created_by_user,
            event,
            run_group,
            driver,
            vehicle,
            correlation_id,
        )

        db.add(raw_submission)
        db.flush()

        # Persist the normalized raw submission against the current sm2racing schema.
        persist_result = persist_raw_submission_current_schema(
            db,
            submission=raw_submission,
            event=event,
            run_group=run_group,
            driver=driver,
            vehicle=vehicle,
            current_user=created_by_user,
            source=(normalize_optional_text(submission_in.source) or "pwa").lower(),
            payload=payload,
            analysis_result=analysis_result,
            id_seance=id_seance,
            captured_at=captured_at,
        )
        raw_submission.structured_ingest_status = persist_result.status
        raw_submission.structured_ingest_warnings = persist_result.warnings
        raw_submission.status = SubmissionStatus.SENT
        raw_submission.error_message = None

        if not persist_result.saved_sections:
            raise RuntimeError("Raw submission did not persist any structured sections")

        stored_session_id = persist_result.id_seance or id_seance

        write_raw_audit_log_current_schema(
            db,
            action="submission.ingest.raw",
            status="SUCCESS",
            entity_type="seance",
            entity_id=stored_session_id,
            message=f"Raw submission stored successfully for {stored_session_id}",
            payload={
                **request_payload,
                "parser_mode": parser_mode,
                "submission_ref": raw_submission.submission_ref,
                "correlation_id": raw_submission.correlation_id,
                "id_seance": stored_session_id,
                "submission_input_id": str(persist_result.submission_input_id) if persist_result.submission_input_id else None,
                "seance_db_id": str(persist_result.seance_id) if persist_result.seance_id else None,
                "structured_status": persist_result.status,
                "structured_warnings": persist_result.warnings,
                "saved_sections": persist_result.saved_sections,
                "skipped_sections": persist_result.skipped_sections,
            },
            actor_user_id=current_user.id,
            correlation_id=raw_submission.correlation_id,
        )
        db.commit()

        return _raw_submission_response(
            status_code=status.HTTP_201_CREATED,
            status_value="SUCCESS",
            id_seance=stored_session_id,
            message="Session stored successfully",
        )
    except HTTPException:
        db.rollback()
        raise
    except RawSubmissionValidationError as exc:
        db.rollback()
        write_raw_audit_log_current_schema(
            db,
            action="submission.ingest.raw",
            status="VALIDATION_FAILED",
            entity_type="submission",
            entity_id=str(request_payload.get("raw_text") or submission_in.event_id),
            message=exc.message,
            payload={
                **request_payload,
                "parser_mode": parser_mode,
                "errors": exc.errors,
            },
            actor_user_id=current_user.id,
            correlation_id=None,
        )
        db.commit()
        return _raw_submission_response(
            status_code=status.HTTP_400_BAD_REQUEST,
            status_value="VALIDATION_FAILED",
            message=exc.message,
            errors=exc.errors,
        )
    except Exception as exc:
        db.rollback()
        error_context = describe_raw_exception(exc)
        unexpected_message = (
            f"Raw submission ingest failed unexpectedly: {error_context['display_message']}"
        )
        logger.exception("Raw submission ingest failed (%s)", error_context["display_message"])
        write_raw_audit_log_current_schema(
            db,
            action="submission.ingest.raw",
            status="ERROR",
            entity_type="submission",
            entity_id=str(request_payload.get("raw_text") or submission_in.event_id),
            message=unexpected_message,
            payload={
                **request_payload,
                "parser_mode": parser_mode,
                **error_context,
            },
            actor_user_id=current_user.id,
            correlation_id=None,
        )
        db.commit()
        return _raw_submission_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            status_value="ERROR",
            message=unexpected_message,
            errors=[{"field": "raw_text", "message": unexpected_message, **error_context}],
        )


@router.get("/{submission_id}", response_model=SubmissionRead)
def read_submission(
    submission_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Submission:
    submission = _load_submission(db, submission_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN) and submission.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return submission


@router.post("/{submission_id}/retry", response_model=SubmissionRead)
def retry_submission(
    submission_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Submission:
    submission = _load_submission(db, submission_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    retry_log_summary = _submission_log_summary(
        submission_ref=submission.submission_ref,
        correlation_id=submission.correlation_id,
        event_id=submission.event_id,
        run_group_id=submission.run_group_id,
        driver_id=getattr(submission.driver, "driver_id", None),
        vehicle_id=getattr(submission.vehicle, "vehicle_id", None),
        current_user_id=current_user.id,
        payload=submission.payload,
    )

    submission.status = SubmissionStatus.PENDING
    submission.error_message = None
    try:
        db.add(submission)
        if settings.make_webhook_url:
            enqueue_submission_delivery(db, submission)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not _is_integrity_duplicate_error(exc):
            logger.exception(
                "Unexpected submission integrity error while retrying (%s)",
                retry_log_summary,
            )
            raise _submission_error(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "SUBMISSION_RETRY_FAILED",
                "Failed to retry submission",
            ) from exc

        logger.warning(
            "Submission duplicate integrity conflict while retrying (%s)",
            retry_log_summary,
        )
        raise _submission_error(
            status.HTTP_409_CONFLICT,
            "SUBMISSION_DUPLICATE",
            "Submission already exists or conflicts with an existing session",
        ) from exc
    except HTTPException as exc:
        db.rollback()
        logger.warning(
            "Submission retry rejected after entering save pipeline (%s): %s",
            retry_log_summary,
            getattr(exc, "detail", exc),
        )
        raise
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Unexpected submission retry failure (%s)",
            retry_log_summary,
        )
        raise _submission_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUBMISSION_RETRY_FAILED",
            "Failed to retry submission",
        ) from exc

    db.refresh(submission)

    if settings.make_webhook_url:
        background_tasks.add_task(process_submission_delivery_task, submission.id)
    else:
        process_submission_delivery(db, submission.id)

    return _load_submission(db, submission_id) or submission


@router.put("/{submission_id}", response_model=SubmissionRead)
def update_submission(
    submission_id: UUID,
    submission_in: SubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Submission:
    submission = _load_submission(db, submission_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    data = submission_in.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(submission, key, value)

    db.commit()
    db.refresh(submission)
    loaded_submission = _load_submission(db, submission_id)
    if loaded_submission is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load submission")
    return loaded_submission


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission(
    submission_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> None:
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    db.delete(submission)
    db.commit()
