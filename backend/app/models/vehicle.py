import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    make: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vin: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    driver = relationship("Driver", back_populates="vehicles")
    submissions = relationship("Submission", back_populates="vehicle")

