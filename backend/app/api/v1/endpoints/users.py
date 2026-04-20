from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.user import User
from app.schemas.auth import UserCreate, UserRead
from app.services.auth_service import create_user


router = APIRouter()


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())).all())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_admin_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> User:
    try:
        return create_user(db, user_in, role=user_in.role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
