import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.hash import pbkdf2_sha256

from app.core.config import get_settings


settings = get_settings()


def hash_password(password: str) -> str:
    # PBKDF2 is fully supported in hosted environments and avoids bcrypt backend issues.
    return pbkdf2_sha256.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pbkdf2_sha256.verify(plain_password, hashed_password)


def create_access_token(subject: str, additional_claims: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"jti": str(uuid.uuid4()), "sub": subject, "exp": expire}

    if additional_claims:
        payload.update(additional_claims)

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
