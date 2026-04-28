from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.user import User
from app.schemas.event import EventCreate, EventRead, EventUpdate
from app.services.run_group_service import normalize_run_group


router = APIRouter()


def _normalize_notes(notes: str | None) -> str | None:
    if notes is None:
        return None

    normalized = notes.strip()
    return normalized or None


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Event]:
    stmt = select(Event).order_by(Event.start_date.desc())
    if current_user.role not in (UserRole.OWNER, UserRole.ADMIN):
        stmt = stmt.where(Event.is_active.is_(True))
    return list(db.scalars(stmt).all())


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Event:
    normalized_run_group = normalize_run_group(event_in.run_group_raw_text)
    if not normalized_run_group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid run group")

    event = Event(
        name=event_in.name,
        track=event_in.track,
        start_date=event_in.start_date,
        end_date=event_in.end_date,
        notes=_normalize_notes(event_in.notes),
        created_by_id=current_user.id,
    )
    db.add(event)
    db.flush()

    run_group = RunGroup(
        event_id=event.id,
        raw_text=event_in.run_group_raw_text,
        normalized=normalized_run_group,
        created_by_id=current_user.id,
        locked=False,
    )
    db.add(run_group)
    db.commit()
    db.refresh(event)
    return event


@router.post("/{event_id}/select", response_model=EventRead)
def select_active_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not event.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is archived")

    run_group = db.scalar(select(RunGroup).where(RunGroup.event_id == event.id))
    if not run_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Run group is not configured for this event",
        )

    current_user.active_event_id = event.id
    db.commit()
    db.refresh(event)
    return event


@router.get("/active", response_model=EventRead)
def read_active_event(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Event:
    if not current_user.active_event_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active event not set")

    event = db.get(Event, current_user.active_event_id)
    if not event or not event.is_active:
        current_user.active_event_id = None
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active event not found")

    return event


@router.get("/{event_id}", response_model=EventRead)
def read_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.put("/{event_id}", response_model=EventRead)
def update_event(
    event_id: UUID,
    event_in: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    data = event_in.model_dump(exclude_unset=True)
    run_group_raw_text = data.pop("run_group_raw_text", None)
    notes = data.pop("notes", None)

    for key, value in data.items():
        setattr(event, key, value)

    if notes is not None:
        event.notes = _normalize_notes(notes)

    if run_group_raw_text is not None:
        normalized_run_group = normalize_run_group(run_group_raw_text)
        if not normalized_run_group:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid run group")

        run_group = db.scalar(select(RunGroup).where(RunGroup.event_id == event.id))
        if not run_group:
            if not event.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Archived events cannot create new run groups",
                )

            run_group = RunGroup(
                event_id=event.id,
                raw_text=run_group_raw_text,
                normalized=normalized_run_group,
                created_by_id=current_user.id,
                locked=False,
            )
            db.add(run_group)
        else:
            if run_group.locked:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Run group is locked and cannot be changed",
                )

            run_group.raw_text = run_group_raw_text
            run_group.normalized = normalized_run_group

    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", response_model=EventRead)
def archive_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    event.is_active = False
    if current_user.active_event_id == event.id:
        current_user.active_event_id = None
    db.commit()
    db.refresh(event)
    return event
