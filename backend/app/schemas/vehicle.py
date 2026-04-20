from uuid import UUID

from pydantic import Field

from app.schemas.common import ORMModel, TimestampedModel


class VehicleCreate(ORMModel):
    driver_id: UUID | None = None
    make: str = Field(min_length=1, max_length=120)
    model: str = Field(min_length=1, max_length=120)
    year: int | None = Field(default=None, ge=1900, le=2100)
    vin: str | None = Field(default=None, max_length=120)
    registration_number: str | None = Field(default=None, max_length=120)


class VehicleUpdate(ORMModel):
    driver_id: UUID | None = None
    make: str | None = Field(default=None, min_length=1, max_length=120)
    model: str | None = Field(default=None, min_length=1, max_length=120)
    year: int | None = Field(default=None, ge=1900, le=2100)
    vin: str | None = Field(default=None, max_length=120)
    registration_number: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class VehicleRead(TimestampedModel):
    driver_id: UUID | None = None
    make: str
    model: str
    year: int | None
    vin: str | None
    registration_number: str | None
    is_active: bool

