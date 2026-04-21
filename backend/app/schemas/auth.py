from uuid import UUID

from pydantic import EmailStr, Field

from app.core.enums import UserRole
from app.schemas.common import ORMModel, TimestampedModel


class UserCreate(ORMModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.MECHANIC


class UserSignup(ORMModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(ORMModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPasswordReset(ORMModel):
    password: str = Field(min_length=8, max_length=128)


class UserRead(TimestampedModel):
    name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    active_event_id: UUID | None = None


class Token(ORMModel):
    access_token: str
    token_type: str = "bearer"
