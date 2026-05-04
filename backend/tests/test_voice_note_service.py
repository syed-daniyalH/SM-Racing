from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.enums import VoiceNoteStatus
from app.models.voice_note import VoiceNoteSession
from app.schemas.submission import SubmissionCreate
from app.services.voice_note_service import (
    _validate_event_submission_window,
    ensure_voice_session_mutable,
    ensure_voice_transcription_allowed,
    prepare_voice_submission_create,
    require_explicit_review_before_finalize,
)


def _voice_session(
    *,
    status: VoiceNoteStatus = VoiceNoteStatus.DRAFT,
    validation_status: str = "PENDING",
    transcript_text: str | None = "Car rotates well on entry.",
    transcript_edited_text: str | None = None,
    audio_storage_key: str | None = "voice-notes/audio.webm",
) -> VoiceNoteSession:
    return VoiceNoteSession(
        id=uuid4(),
        event_id=uuid4(),
        run_group_id=uuid4(),
        created_by_id=uuid4(),
        status=status,
        validation_status=validation_status,
        transcript_text=transcript_text,
        transcript_edited_text=transcript_edited_text,
        audio_storage_key=audio_storage_key,
    )


def test_validate_event_submission_window_treats_midnight_end_as_full_day_open() -> None:
    now = datetime.now(timezone.utc)
    event = SimpleNamespace(
        start_date=now - timedelta(days=1),
        end_date=datetime(now.year, now.month, now.day, tzinfo=timezone.utc),
    )

    _validate_event_submission_window(event)


@pytest.mark.parametrize(
    ("status_value", "expected_detail"),
    [
        (VoiceNoteStatus.ARCHIVED, "archived and read-only"),
        (VoiceNoteStatus.SUBMITTED, "submitted and read-only"),
    ],
)
def test_ensure_voice_session_mutable_blocks_read_only_states(
    status_value: VoiceNoteStatus,
    expected_detail: str,
) -> None:
    session = _voice_session(status=status_value)

    with pytest.raises(HTTPException) as exc_info:
        ensure_voice_session_mutable(session)

    assert exc_info.value.status_code == 400
    assert expected_detail in str(exc_info.value.detail)


def test_ensure_voice_transcription_allowed_requires_uploaded_audio() -> None:
    session = _voice_session(audio_storage_key=None)

    with pytest.raises(HTTPException) as exc_info:
        ensure_voice_transcription_allowed(session)

    assert exc_info.value.status_code == 400
    assert "Upload audio before transcription" in str(exc_info.value.detail)


@pytest.mark.parametrize(
    "status_value",
    [VoiceNoteStatus.PENDING_TRANSCRIPTION, VoiceNoteStatus.TRANSCRIBING],
)
def test_ensure_voice_transcription_allowed_blocks_duplicate_in_progress_attempts(
    status_value: VoiceNoteStatus,
) -> None:
    session = _voice_session(status=status_value)

    with pytest.raises(HTTPException) as exc_info:
        ensure_voice_transcription_allowed(session)

    assert exc_info.value.status_code == 400
    assert "already in progress" in str(exc_info.value.detail)


def test_ensure_voice_transcription_allowed_blocks_restarting_completed_start_flow() -> None:
    session = _voice_session(status=VoiceNoteStatus.PENDING_REVIEW)

    with pytest.raises(HTTPException) as exc_info:
        ensure_voice_transcription_allowed(session, action="start")

    assert exc_info.value.status_code == 400
    assert "Use retry" in str(exc_info.value.detail)


def test_require_explicit_review_before_finalize_rejects_unconfirmed_low_confidence_session() -> None:
    session = _voice_session(
        status=VoiceNoteStatus.PENDING_REVIEW,
        validation_status="REVIEW_REQUIRED",
    )

    with pytest.raises(HTTPException) as exc_info:
        require_explicit_review_before_finalize(session)

    assert exc_info.value.status_code == 400
    assert "must be reviewed and confirmed" in str(exc_info.value.detail)


def test_prepare_voice_submission_create_links_voice_session_and_transcript() -> None:
    session = _voice_session(
        status=VoiceNoteStatus.CONFIRMED,
        validation_status="VALIDATED",
        transcript_text="Base transcript from Deepgram.",
        transcript_edited_text="Reviewed transcript for final submission.",
    )
    submission = SubmissionCreate(
        submission_ref="VOICE-REF-001",
        correlation_id=str(uuid4()),
        event_id=session.event_id,
        run_group_id=session.run_group_id,
        driver_id="DRV-01",
        vehicle_id="CAR-01",
        payload={"data": {"session_id": "VOICE-SESSION-001"}},
        analysis_result={"confidence": 0.91},
    )

    prepared = prepare_voice_submission_create(submission, voice_session=session)

    assert prepared.voice_session_id == session.id
    assert prepared.raw_text == "Reviewed transcript for final submission."
    assert prepared.analysis_result["source_type"] == "voice"
    assert prepared.analysis_result["raw_input_mode"] == "voice"
    assert prepared.analysis_result["voice_input_used"] is True
    assert prepared.analysis_result["has_voice_notes"] is True
    assert prepared.analysis_result["voice_session_id"] == str(session.id)


def test_prepare_voice_submission_create_rejects_empty_transcript() -> None:
    session = _voice_session(transcript_text=None, transcript_edited_text=None)
    submission = SubmissionCreate(
        submission_ref="VOICE-REF-EMPTY",
        correlation_id=str(uuid4()),
        event_id=session.event_id,
        run_group_id=session.run_group_id,
        driver_id="DRV-01",
        vehicle_id="CAR-01",
        payload={"data": {"session_id": "VOICE-SESSION-EMPTY"}},
        analysis_result={},
    )

    with pytest.raises(HTTPException) as exc_info:
        prepare_voice_submission_create(submission, voice_session=session)

    assert exc_info.value.status_code == 400
    assert "Transcript cannot be empty" in str(exc_info.value.detail)
