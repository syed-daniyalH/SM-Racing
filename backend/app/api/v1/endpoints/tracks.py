from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.track import Track
from app.models.user import User
from app.schemas.track import TrackRead


router = APIRouter()


@router.get("", response_model=list[TrackRead])
def list_tracks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Track]:
    stmt = select(Track).where(Track.active.is_(True)).order_by(Track.name.asc())
    return list(db.scalars(stmt).all())
