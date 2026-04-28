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
    correlation_id: str | None = Field(default=None, max_length=36)
    event_id: UUID
    run_group_id: UUID
    driver_id: str | None = Field(default=None, max_length=32)
    vehicle_id: str | None = Field(default=None, max_length=64)
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
    correlation_id: str | None = None
    event_id: UUID
    run_group_id: UUID
    driver_id: UUID | None = None
    vehicle_id: UUID | None = None
    created_by_id: UUID
    raw_text: str | None
    image_url: str | None
    payload: dict[str, Any]
    analysis_result: dict[str, Any] | None = None
    structured_ingest_status: str = "skipped"
    structured_ingest_warnings: list[dict[str, Any]] = Field(default_factory=list)
    status: SubmissionStatus
    error_message: str | None = None
    event: EventRead | None = None
    run_group: RunGroupRead | None = None
    driver: DriverRead | None = None
    vehicle: VehicleRead | None = None


class MakeSubmissionCallback(ORMModel):
    submission_ref: str = Field(min_length=1, max_length=120)
    correlation_id: str | None = Field(default=None, max_length=36)
    structured_data: dict[str, Any] | None = None
    data: dict[str, Any] | None = None
    payload: dict[str, Any] | None = None
    session: dict[str, Any] | None = None
    raw_text: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=1000)
    analysis_result: dict[str, Any] | None = None
    submission_input_id: int | None = None
    confidence: float | None = None
    validation_message: str | None = Field(default=None, max_length=1000)
    source: str | None = Field(default=None, max_length=120)
    submission_type: str | None = Field(default=None, max_length=120)
    ocr_text: str | None = Field(default=None, max_length=5000)
    cleaned_ocr_text: str | None = Field(default=None, max_length=5000)
    ocr_extracted_json: dict[str, Any] | None = None
    ocr_confidence: float | None = None
    parser_version: str | None = Field(default=None, max_length=120)
    review_status: str | None = Field(default=None, max_length=120)
