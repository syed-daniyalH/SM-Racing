from uuid import UUID

from pydantic import Field

from app.schemas.common import ORMModel, TimestampedModel


class DriverCreate(ORMModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    license_number: str | None = Field(default=None, max_length=120)
    team_name: str | None = Field(default=None, max_length=255)


class DriverUpdate(ORMModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    license_number: str | None = Field(default=None, max_length=120)
    team_name: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class DriverRead(TimestampedModel):
    first_name: str
    last_name: str
    license_number: str | None
    team_name: str | None
    is_active: bool
    created_by_id: UUID | None = None

