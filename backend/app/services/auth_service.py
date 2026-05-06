from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import UserApprovalStatus, UserRole
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserCreate, UserSignup


def create_user(
    db: Session,
    user_in: UserCreate | UserSignup,
    role: UserRole = UserRole.DRIVER,
    is_active: bool = True,
    approval_status: UserApprovalStatus | None = None,
) -> User:
    email = user_in.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise ValueError("User already exists")

    next_approval_status = (
        approval_status
        if approval_status is not None
        else UserApprovalStatus.APPROVED
        if is_active
        else UserApprovalStatus.PENDING
    )

    user = User(
        name=user_in.name,
        email=email,
        hashed_password=hash_password(user_in.password),
        role=role,
        approval_status=next_approval_status,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def authenticate_user(
    db: Session,
    email: str,
    password: str,
    allow_inactive: bool = False,
) -> User | None:
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not allow_inactive and (
        not user.is_active or user.approval_status != UserApprovalStatus.APPROVED
    ):
        return None
    return user
