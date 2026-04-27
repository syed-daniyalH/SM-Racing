import logging
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
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
        status=SubmissionStatus.PENDING,
    )
    submission.event = event
    submission.run_group = run_group
    submission.driver = driver
    submission.vehicle = vehicle
    return submission


def _normalized_session_duplicate_key(
    payload: dict | None,
    *,
    event_id: UUID | None,
    driver_id: UUID | None,
    vehicle_id: UUID | None,
    track_name: str | None,
    session_type: str | None,
) -> tuple[str | None, str | None, str | None, str | None, str | None, str, str, int] | None:
    session_payload = get_session_payload(payload)
    session_date_raw = normalize_optional_text(session_payload.get("date"))
    session_time_raw = normalize_optional_text(session_payload.get("time"))
    session_number_raw = session_payload.get("session_number")

    if session_date_raw is None or session_time_raw is None or session_number_raw in (None, ""):
        return None

    try:
        session_date = date.fromisoformat(session_date_raw).isoformat()
        session_time = time.fromisoformat(session_time_raw).isoformat(timespec="minutes")
        session_number = int(session_number_raw)
    except (TypeError, ValueError):
        return None

    normalized_track_name = normalize_optional_text(track_name)
    if normalized_track_name is not None:
        normalized_track_name = normalized_track_name.casefold()

    normalized_session_type = normalize_optional_text(session_type)
    if normalized_session_type is not None:
        normalized_session_type = normalized_session_type.casefold()
    else:
        normalized_session_type = "practice"

    return (
        str(event_id) if event_id is not None else None,
        str(driver_id) if driver_id is not None else None,
        str(vehicle_id) if vehicle_id is not None else None,
        normalized_track_name,
        normalized_session_type,
        session_date,
        session_time,
        session_number,
    )


def _find_existing_session_duplicate(
    db: Session,
    *,
    event_id: UUID,
    driver_id: UUID | None,
    vehicle_id: UUID | None,
    track_name: str | None,
    session_type: str | None,
    payload: dict | None,
) -> Submission | None:
    duplicate_key = _normalized_session_duplicate_key(
        payload,
        event_id=event_id,
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        track_name=track_name,
        session_type=session_type,
    )
    if duplicate_key is None:
        return None

    stmt = (
        select(Submission).options(*_submission_options())
        .where(Submission.event_id == event_id)
        .where(Submission.driver_id == driver_id)
        .where(Submission.vehicle_id == vehicle_id)
        .order_by(Submission.created_at.desc())
    )
    for existing_submission in db.scalars(stmt):
        existing_key = _normalized_session_duplicate_key(
            existing_submission.payload,
            event_id=existing_submission.event_id,
            driver_id=existing_submission.driver_id,
            vehicle_id=existing_submission.vehicle_id,
            track_name=existing_submission.event.track if existing_submission.event is not None else track_name,
            session_type=get_session_payload(existing_submission.payload).get("session_type"),
        )
        if existing_key == duplicate_key:
            return existing_submission

    return None


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

    existing = db.scalar(select(Submission).where(Submission.submission_ref == submission_in.submission_ref))
    if existing:
        raise _submission_error(
            status.HTTP_409_CONFLICT,
            "SUBMISSION_ALREADY_EXISTS",
            "Submission already exists",
        )

    correlation_id = normalize_optional_text(submission_in.correlation_id) or str(uuid4())
    submission_log_summary = _submission_log_summary(
        submission_ref=submission_in.submission_ref,
        correlation_id=correlation_id,
        event_id=submission_in.event_id,
        run_group_id=submission_in.run_group_id,
        driver_id=submission_in.driver_id,
        vehicle_id=submission_in.vehicle_id,
        current_user_id=current_user.id,
        payload=submission_in.payload,
    )

    duplicate_submission = _find_existing_session_duplicate(
        db,
        event_id=submission_in.event_id,
        driver_id=driver.id if driver else None,
        vehicle_id=vehicle.id if vehicle else None,
        track_name=event.track,
        session_type=get_session_payload(submission_in.payload).get("session_type"),
        payload=submission_in.payload,
    )
    if duplicate_submission is not None:
        duplicate_key = _normalized_session_duplicate_key(
            submission_in.payload,
            event_id=submission_in.event_id,
            driver_id=driver.id if driver else None,
            vehicle_id=vehicle.id if vehicle else None,
            track_name=event.track,
            session_type=get_session_payload(submission_in.payload).get("session_type"),
        )
        session_date = duplicate_key[5] if duplicate_key else None
        session_time = duplicate_key[6] if duplicate_key else None
        session_number = duplicate_key[7] if duplicate_key else None
        raise _submission_error(
            status.HTTP_409_CONFLICT,
            "SUBMISSION_DUPLICATE",
            (
                "Another note already exists in the backend for "
                f"event {event.id}, driver {driver.id if driver else 'none'}, "
                f"vehicle {vehicle.id if vehicle else 'none'}, track {event.track}, "
                f"session type {normalize_optional_text(get_session_payload(submission_in.payload).get('session_type')) or 'practice'}, "
                f"date {session_date}, time {session_time}, and session #{session_number}"
            ),
            detail={
                "event_id": str(event.id),
                "driver_id": str(driver.id) if driver else None,
                "vehicle_id": str(vehicle.id) if vehicle else None,
                "track": event.track,
                "session_type": normalize_optional_text(get_session_payload(submission_in.payload).get("session_type"))
                or "practice",
                "date": session_date,
                "time": session_time,
                "session_number": session_number,
            },
        )

    submission = _build_submission_candidate(
        submission_in,
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
            submission_input_id = persist_structured_submission(
                db,
                submission=submission,
                event=event,
                run_group=run_group,
                driver=driver,
                vehicle=vehicle,
                current_user=current_user,
            )

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


@router.delete("/{submission_id}")
def delete_submission(
    submission_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, str]:
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    try:
        result = db.execute(
            text(
                """
                SELECT submission_input_id, seance_id
                FROM sm2racing.submission_inputs
                WHERE raw_payload_jsonb ->> 'submission_ref' = :submission_ref
                """
            ),
            {"submission_ref": submission.submission_ref},
        )
        linked_rows = result.mappings().all()
        linked_submission_input_ids = [row["submission_input_id"] for row in linked_rows]
        linked_seance_ids = {row["seance_id"] for row in linked_rows if row["seance_id"] is not None}

        if linked_submission_input_ids:
            db.execute(
                text(
                    """
                    DELETE FROM sm2racing.submission_inputs
                    WHERE submission_input_id = ANY(:submission_input_ids)
                    """
                ),
                {"submission_input_ids": linked_submission_input_ids},
            )

        for seance_id in linked_seance_ids:
            remaining_ref = db.execute(
                text(
                    """
                    SELECT 1
                    FROM sm2racing.submission_inputs
                    WHERE seance_id = :seance_id
                    LIMIT 1
                    """
                ),
                {"seance_id": seance_id},
            ).scalar()
            if remaining_ref is None:
                db.execute(
                    text("DELETE FROM sm2racing.seances WHERE id_seance = :seance_id"),
                    {"seance_id": seance_id},
                )

        db.delete(submission)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete submission",
        ) from exc

    return {"message": "Submission deleted successfully"}
