from __future__ import annotations

import json
import logging
from typing import Any
from urllib import error, parse, request

from app.core.config import get_settings


settings = get_settings()
logger = logging.getLogger(__name__)


class DeepgramTranscriptionError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str,
        retryable: bool,
        status_code: int | None = None,
        detail: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.status_code = status_code
        self.detail = detail


def _bool_param(value: bool) -> str:
    return "true" if value else "false"


def build_deepgram_request_options(
    *,
    audio_language: str | None = None,
    session_id: str | None = None,
) -> dict[str, str]:
    options: dict[str, str] = {
        "model": settings.deepgram_model,
        "smart_format": _bool_param(settings.deepgram_smart_format),
        "punctuate": _bool_param(False if settings.deepgram_smart_format else settings.deepgram_punctuate),
        "numerals": _bool_param(settings.deepgram_numerals),
        "utterances": _bool_param(settings.deepgram_utterances),
        "diarize": _bool_param(settings.deepgram_diarize),
        "filler_words": _bool_param(settings.deepgram_filler_words),
    }

    if settings.deepgram_alternatives and settings.deepgram_alternatives > 1:
        options["alternatives"] = str(settings.deepgram_alternatives)

    language = (audio_language or settings.deepgram_language or "").strip()
    if language:
        options["language"] = language

    if session_id:
        options["extra"] = f"sm2_voice_session_id:{session_id}"

    return options


def _build_request_url(options: dict[str, str]) -> str:
    return f"{settings.deepgram_base_url}?{parse.urlencode(options)}"


def _extract_model_name(metadata: dict[str, Any]) -> str | None:
    model_info = metadata.get("model_info")
    if isinstance(model_info, dict):
        return model_info.get("name") or model_info.get("arch")
    if isinstance(model_info, str):
        return model_info
    return metadata.get("model")


def _load_error_detail(exc: error.HTTPError) -> Any:
    try:
        payload = exc.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    try:
        return json.loads(payload)
    except Exception:
        return payload or None


def transcribe_audio_bytes(
    audio_bytes: bytes,
    *,
    content_type: str,
    audio_language: str | None = None,
    session_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not settings.deepgram_api_key:
        raise DeepgramTranscriptionError(
            "Deepgram API key is not configured",
            code="DEEPGRAM_NOT_CONFIGURED",
            retryable=False,
        )

    options = build_deepgram_request_options(
        audio_language=audio_language,
        session_id=session_id,
    )
    request_url = _build_request_url(options)
    request_headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": content_type,
    }
    req = request.Request(
        request_url,
        data=audio_bytes,
        headers=request_headers,
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=settings.voice_transcription_timeout_seconds) as response:
            response_bytes = response.read()
            try:
                payload = json.loads(response_bytes.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise DeepgramTranscriptionError(
                    "Deepgram returned an invalid JSON response",
                    code="DEEPGRAM_INVALID_RESPONSE",
                    retryable=True,
                    status_code=response.status,
                ) from exc
    except error.HTTPError as exc:
        detail = _load_error_detail(exc)
        retryable = exc.code in {408, 409, 425, 429} or exc.code >= 500
        raise DeepgramTranscriptionError(
            f"Deepgram returned HTTP {exc.code}",
            code="DEEPGRAM_HTTP_ERROR",
            retryable=retryable,
            status_code=exc.code,
            detail=detail,
        ) from exc
    except error.URLError as exc:
        raise DeepgramTranscriptionError(
            f"Deepgram request failed: {exc.reason if hasattr(exc, 'reason') else exc}",
            code="DEEPGRAM_NETWORK_ERROR",
            retryable=True,
        ) from exc
    except TimeoutError as exc:
        raise DeepgramTranscriptionError(
            "Deepgram transcription timed out",
            code="DEEPGRAM_TIMEOUT",
            retryable=True,
        ) from exc
    except DeepgramTranscriptionError:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected Deepgram transcription failure")
        raise DeepgramTranscriptionError(
            f"Deepgram transcription failed: {exc}",
            code="DEEPGRAM_UNEXPECTED_ERROR",
            retryable=False,
        ) from exc

    return payload, {
        "url": request_url,
        "options": options,
        "audio_bytes": len(audio_bytes),
        "content_type": content_type,
    }


def extract_transcription_result(response_payload: dict[str, Any]) -> dict[str, Any]:
    metadata = response_payload.get("metadata") if isinstance(response_payload, dict) else {}
    results = response_payload.get("results") if isinstance(response_payload, dict) else {}
    channels = results.get("channels") if isinstance(results, dict) else []
    primary_channel = channels[0] if channels else {}
    alternatives = primary_channel.get("alternatives") if isinstance(primary_channel, dict) else []
    primary_alternative = alternatives[0] if alternatives else {}
    words = primary_alternative.get("words") if isinstance(primary_alternative, dict) else []
    utterances = results.get("utterances") if isinstance(results, dict) else []

    transcript_text = str(primary_alternative.get("transcript") or "").strip()
    confidence_value = primary_alternative.get("confidence")
    if confidence_value is not None:
        try:
            confidence_value = float(confidence_value)
        except (TypeError, ValueError):
            confidence_value = None

    detected_language = metadata.get("detected_language") or metadata.get("language")
    if not detected_language and isinstance(results, dict):
        detected_language = results.get("language")

    word_count = len(words) if isinstance(words, list) else len(transcript_text.split())

    return {
        "transcript_text": transcript_text,
        "transcript_confidence": confidence_value,
        "transcript_word_count": word_count,
        "audio_language": detected_language,
        "deepgram_request_id": metadata.get("request_id"),
        "deepgram_model": _extract_model_name(metadata),
        "transcript_json": {
            "metadata": metadata,
            "results": results,
            "primary_channel": primary_channel,
            "primary_alternative": primary_alternative,
            "words": words,
            "utterances": utterances,
        },
    }
