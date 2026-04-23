import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.db_schema import SM2RACING_SCHEMA
from app.models.base import TimestampMixin


class RevokedToken(Base, TimestampMixin):
    __tablename__ = "revoked_tokens"
    __table_args__ = {"schema": SM2RACING_SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
