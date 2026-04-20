import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import UserRole
from app.models.base import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), default=UserRole.MECHANIC, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    active_event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"), nullable=True)

    active_event = relationship("Event", foreign_keys=[active_event_id], lazy="joined")
    created_events = relationship("Event", back_populates="created_by_user", foreign_keys="Event.created_by_id")
    submissions = relationship("Submission", back_populates="created_by_user", foreign_keys="Submission.created_by_id")

