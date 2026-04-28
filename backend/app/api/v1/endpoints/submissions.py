import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.core.config import get_settings
from app.core.database import get_db
from app.core.enums import SubmissionStatus, UserRole
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.submission import SubmissionCreate, SubmissionRead, SubmissionUpdate
from app.services.submission_delivery_service import (
    enqueue_submission_delivery,
    process_submission_delivery,
    process_submission_delivery_task,
)
from app.services.submission_ingest_service import persist_structured_submission
from app.services.submission_payload_service import (
    get_session_payload,
    merge_submission_analysis,
    normalize_optional_text,
    should_persist_structured_submission,
)


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
) -> Submission:
    raw_text = normalize_optional_text(submission_in.raw_text)
    image_url = normalize_optional_text(submission_in.image_url)
    analysis_result = merge_submission_analysis(
        submission_in.payload,
        raw_text,
        image_url,
        submission_in.analysis_result,
    )

    submission = Submission(
        submission_ref=submission_in.submission_ref,
        event_id=event.id,
        run_group_id=run_group.id,
        driver_id=driver.id if driver else None,
        vehicle_id=vehicle.id if vehicle else None,
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
