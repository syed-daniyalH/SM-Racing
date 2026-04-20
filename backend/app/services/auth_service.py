from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserCreate, UserSignup


def create_user(
    db: Session,
    user_in: UserSignup,
    role: UserRole = UserRole.MECHANIC,
) -> User:
    email = user_in.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise ValueError("User already exists")

    user = User(
        name=user_in.name,
        email=email,
        hashed_password=hash_password(user_in.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user:
        return None
    if not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
