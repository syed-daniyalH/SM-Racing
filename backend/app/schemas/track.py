from datetime import datetime

from app.schemas.common import ORMModel


class TrackRead(ORMModel):
    name: str
    latitude: float | None = None
    longitude: float | None = None
    country: str | None = None
    active: bool
    created_at: datetime
    updated_at: datetime
