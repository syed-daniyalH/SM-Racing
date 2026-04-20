from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, EventRead, EventUpdate


router = APIRouter()


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
    event = Event(
        name=event_in.name,
        track=event_in.track,
        start_date=event_in.start_date,
        end_date=event_in.end_date,
        created_by_id=current_user.id,
    )
    db.add(event)
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
    for key, value in data.items():
        setattr(event, key, value)

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
