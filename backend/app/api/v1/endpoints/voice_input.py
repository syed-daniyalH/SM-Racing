from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.schemas.submission import VoiceTranscriptionRead
from app.services.deepgram_service import (
    DeepgramTranscriptionError,
    extract_transcription_result,
    transcribe_audio_bytes,
)


settings = get_settings()
router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/aac",
    "video/webm",
}


def _normalized_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";")[0].strip().lower()


def _is_allowed_audio_content_type(content_type: str | None) -> bool:
    return _normalized_content_type(content_type) in ALLOWED_AUDIO_CONTENT_TYPES


@router.post("/voice-input/transcribe", response_model=VoiceTranscriptionRead)
async def transcribe_voice_input_endpoint(
    current_user: User = Depends(get_current_user),
    audio_file: UploadFile = File(...),
    audio_language: str | None = Form(default=None),
) -> VoiceTranscriptionRead:
    audio_bytes = await audio_file.read()
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No audio was captured")

    if len(audio_bytes) > settings.voice_upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds the allowed size",
        )

    normalized_content_type = _normalized_content_type(audio_file.content_type)
    if not _is_allowed_audio_content_type(normalized_content_type):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported audio format")

    try:
        deepgram_response, _deepgram_request = transcribe_audio_bytes(
            audio_bytes,
            content_type=normalized_content_type or "audio/webm",
            audio_language=audio_language,
        )
        transcript = extract_transcription_result(deepgram_response)
    except DeepgramTranscriptionError as exc:
        logger.warning(
            "Voice input transcription failed",
            extra={
                "user_id": str(current_user.id),
                "error_code": exc.code,
                "retryable": exc.retryable,
            },
            exc_info=True,
        )
        if exc.code == "DEEPGRAM_NOT_CONFIGURED":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Speech transcription is not configured",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE if exc.retryable else status.HTTP_502_BAD_GATEWAY,
            detail=exc.detail or str(exc),
        ) from exc

    transcript_text = str(transcript["transcript_text"] or "").strip()
    if not transcript_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No speech was detected",
        )

    return VoiceTranscriptionRead(
        transcript_text=transcript_text,
        transcript_confidence=transcript["transcript_confidence"],
        transcript_word_count=transcript["transcript_word_count"],
        audio_language=transcript["audio_language"],
        deepgram_request_id=transcript["deepgram_request_id"],
        deepgram_model=transcript["deepgram_model"],
        transcript_json=transcript["transcript_json"],
    )
