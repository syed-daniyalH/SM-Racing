import json
from functools import lru_cache
from typing import Any, TypedDict

from pydantic import AliasChoices
from pydantic import Field
from pydantic import field_validator
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


MIN_JWT_SECRET_LENGTH = 32
TEST_ENVIRONMENT_NAME = "test"
ALLOWED_TEST_JWT_SECRET = "test-secret"
DISALLOWED_JWT_SECRETS = {"change-me", "default"}
DEFAULT_OCR_PRIMARY_MODEL = "gpt-5.4"


class OCRConfigStatus(TypedDict):
    enabled: bool
    provider: str | None
    has_api_key: bool
    has_make_webhook: bool
    primary_model: str
    fallback_model: str | None
    missing_requirements: list[str]
    user_safe_message: str
    developer_message: str


def _normalize_optional_text(value: Any) -> str | None:
    if value is None:
        return None

    normalized = str(value).strip()
    return normalized or None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "SM Racing API"
    environment: str = Field(default="development", validation_alias=AliasChoices("ENVIRONMENT", "APP_ENV"))
    api_v1_prefix: str = "/api/v1"
    database_url: str = Field(default="postgresql+psycopg://USER:PASSWORD@NEON_HOST/DB?sslmode=require&channel_binding=require")
    database_schema: str = "sm2racing"
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"],
    )
    cors_origin_regex: str | None = None
    make_webhook_url: str | None = None
    make_ocr_webhook_url: str | None = None
    make_ocr_timeout_seconds: float = 20.0
    chatbot_nlp_enabled: bool = False
    chatbot_image_analysis_enabled: bool = False
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_vision_model: str = DEFAULT_OCR_PRIMARY_MODEL
    openai_fallback_model: str | None = None
    openai_request_timeout_seconds: float = 8.0
    openai_intent_confidence_threshold: float = 0.70
    voice_storage_root: str = "storage/voice-notes"
    voice_upload_max_bytes: int = 25 * 1024 * 1024
    voice_upload_max_duration_seconds: int = 300
    voice_transcription_confidence_threshold: float = 0.80
    voice_transcription_timeout_seconds: float = 45.0
    deepgram_api_key: str | None = None
    deepgram_base_url: str = "https://api.deepgram.com/v1/listen"
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en-US"
    deepgram_punctuate: bool = True
    deepgram_smart_format: bool = True
    deepgram_numerals: bool = True
    deepgram_utterances: bool = True
    deepgram_diarize: bool = False
    deepgram_filler_words: bool = False
    deepgram_endpointing: int = 300
    deepgram_alternatives: int = 1

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if value is None:
            return ["http://localhost:3000", "http://127.0.0.1:3000"]

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []

            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    parsed = None

                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]

            return [item.strip() for item in stripped.split(",") if item.strip()]

        return value

    @field_validator("openai_api_key", "openai_fallback_model", "make_ocr_webhook_url", mode="before")
    @classmethod
    def normalize_optional_openai_fields(cls, value: Any) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("openai_vision_model", mode="before")
    @classmethod
    def normalize_vision_model(cls, value: Any) -> str:
        return _normalize_optional_text(value) or DEFAULT_OCR_PRIMARY_MODEL

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> "Settings":
        normalized_environment = self.environment.strip().lower()
        normalized_secret = self.jwt_secret_key.strip()

        if not normalized_secret:
            raise ValueError("JWT_SECRET_KEY must be set and cannot be empty.")

        if normalized_environment == TEST_ENVIRONMENT_NAME and normalized_secret == ALLOWED_TEST_JWT_SECRET:
            self.jwt_secret_key = normalized_secret
            return self

        if normalized_secret.lower() in DISALLOWED_JWT_SECRETS:
            raise ValueError("JWT_SECRET_KEY must not use a default or placeholder value.")

        if normalized_secret.lower() == ALLOWED_TEST_JWT_SECRET:
            raise ValueError("JWT_SECRET_KEY=test-secret is allowed only when ENVIRONMENT or APP_ENV is set to 'test'.")

        if len(normalized_secret) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET_KEY must be at least {MIN_JWT_SECRET_LENGTH} characters long."
            )

        self.jwt_secret_key = normalized_secret
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_ocr_config_status(settings: Any | None = None) -> OCRConfigStatus:
    resolved_settings = settings or get_settings()
    openai_enabled = bool(getattr(resolved_settings, "chatbot_image_analysis_enabled", False))
    api_key = _normalize_optional_text(getattr(resolved_settings, "openai_api_key", None))
    make_ocr_webhook_url = _normalize_optional_text(getattr(resolved_settings, "make_ocr_webhook_url", None))
    primary_model = (
        _normalize_optional_text(getattr(resolved_settings, "openai_vision_model", None))
        or DEFAULT_OCR_PRIMARY_MODEL
    )
    fallback_model = _normalize_optional_text(getattr(resolved_settings, "openai_fallback_model", None))

    provider: str | None = None
    missing_requirements: list[str] = []
    if make_ocr_webhook_url:
        provider = "make_webhook"
    elif openai_enabled and api_key:
        provider = "openai"
    else:
        if not openai_enabled:
            missing_requirements.append("CHATBOT_IMAGE_ANALYSIS_ENABLED")
        if not api_key:
            missing_requirements.append("OPENAI_API_KEY")

    if missing_requirements:
        user_safe_message = "OCR extraction is disabled because neither a Make OCR webhook nor backend image analysis is configured."
        developer_message = (
            "OCR image analysis unavailable; missing "
            f"{', '.join(missing_requirements)}. "
            f"make_ocr_webhook={'configured' if make_ocr_webhook_url else 'missing'}, "
            f"primary_model={primary_model}, fallback_model={fallback_model or 'none'}."
        )
    else:
        user_safe_message = "OCR extraction is configured and ready."
        if provider == "make_webhook":
            developer_message = (
                "OCR image analysis configured via Make webhook. "
                f"primary_model={primary_model}, fallback_model={fallback_model or 'none'}."
            )
        else:
            developer_message = (
                "OCR image analysis configured via backend OpenAI provider. "
                f"primary_model={primary_model}, fallback_model={fallback_model or 'none'}."
            )

    return {
        "enabled": provider is not None,
        "provider": provider,
        "has_api_key": api_key is not None,
        "has_make_webhook": make_ocr_webhook_url is not None,
        "primary_model": primary_model,
        "fallback_model": fallback_model,
        "missing_requirements": missing_requirements,
        "user_safe_message": user_safe_message,
        "developer_message": developer_message,
    }
