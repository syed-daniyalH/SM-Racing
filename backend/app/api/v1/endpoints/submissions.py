from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
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
from app.services.make_webhook_service import send_submission_to_make


router = APIRouter()
settings = get_settings()


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

    # Admin scheduling is date-based, so midnight end dates stay open for the full end day.
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


def _finalize_delivery(db: Session, submission: Submission) -> Submission:
    if not settings.make_webhook_url:
        submission.status = SubmissionStatus.SENT
        submission.error_message = None
        db.commit()
        db.refresh(submission)
        return submission

    try:
        send_submission_to_make(submission)
        submission.status = SubmissionStatus.SENT
        submission.error_message = None
    except Exception as exc:
        submission.status = SubmissionStatus.FAILED
        submission.error_message = str(exc)

    db.commit()
    db.refresh(submission)
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
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    stmt = _submission_stmt().where(Submission.event_id == event_id)
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Submission already exists")

    submission = Submission(
        submission_ref=submission_in.submission_ref,
        event_id=submission_in.event_id,
        run_group_id=submission_in.run_group_id,
        driver_id=driver.id if driver else None,
        vehicle_id=vehicle.id if vehicle else None,
        created_by_id=current_user.id,
        raw_text=submission_in.raw_text,
        image_url=submission_in.image_url,
        payload=submission_in.payload,
        analysis_result=submission_in.analysis_result,
        status=SubmissionStatus.PENDING,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    loaded_submission = _load_submission(db, submission.id)
    if loaded_submission is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load submission")

    return _finalize_delivery(db, loaded_submission)


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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Submission:
    submission = _load_submission(db, submission_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    submission.status = SubmissionStatus.PENDING
    submission.error_message = None
    db.commit()
    db.refresh(submission)

    return _finalize_delivery(db, _load_submission(db, submission_id) or submission)


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
