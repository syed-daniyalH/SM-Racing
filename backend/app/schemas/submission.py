from typing import Any
from uuid import UUID

from pydantic import Field

from app.core.enums import SubmissionStatus
from app.schemas.driver import DriverRead
from app.schemas.event import EventRead
from app.schemas.common import ORMModel, TimestampedModel
from app.schemas.run_group import RunGroupRead
from app.schemas.vehicle import VehicleRead


class SubmissionCreate(ORMModel):
    submission_ref: str = Field(min_length=1, max_length=120)
    event_id: UUID
    run_group_id: UUID
    driver_id: UUID | None = None
    vehicle_id: UUID | None = None
    raw_text: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=1000)
    payload: dict[str, Any] = Field(default_factory=dict)
    analysis_result: dict[str, Any] | None = None


class SubmissionUpdate(ORMModel):
    payload: dict[str, Any] | None = None
    analysis_result: dict[str, Any] | None = None
    status: SubmissionStatus | None = None
    error_message: str | None = Field(default=None, max_length=1000)


class SubmissionRead(TimestampedModel):
    submission_ref: str
    event_id: UUID
    run_group_id: UUID
    driver_id: UUID | None = None
    vehicle_id: UUID | None = None
    created_by_id: UUID
    raw_text: str | None
    image_url: str | None
    payload: dict[str, Any]
    analysis_result: dict[str, Any] | None = None
    status: SubmissionStatus
    error_message: str | None = None
    event: EventRead | None = None
    run_group: RunGroupRead | None = None
    driver: DriverRead | None = None
    vehicle: VehicleRead | None = None
