from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.core.security import hash_password
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.models.user import User
from app.schemas.auth import UserCreate, UserPasswordReset, UserRead
from app.services.auth_service import create_user


router = APIRouter()


def _count_linked_rows(db: Session, model: type, field, user_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(model).where(field == user_id)) or 0


def _delete_blockers(db: Session, user_id: UUID) -> dict[str, int]:
    return {
        "events": _count_linked_rows(db, Event, Event.created_by_id, user_id),
        "run groups": _count_linked_rows(db, RunGroup, RunGroup.created_by_id, user_id),
        "submissions": _count_linked_rows(db, Submission, Submission.created_by_id, user_id),
        "drivers": _count_linked_rows(db, Driver, Driver.created_by_id, user_id),
    }


def _format_blockers(blockers: dict[str, int]) -> str:
    active_blockers = [f"{count} {label}" for label, count in blockers.items() if count > 0]
    return ", ".join(active_blockers)


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
    if current_user.role != UserRole.OWNER and user_in.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an owner can create another owner account.",
        )

    try:
        return create_user(db, user_in, role=user_in.role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.patch("/{user_id}/password", response_model=UserRead)
def reset_user_password(
    user_id: UUID,
    password_in: UserPasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> User:
    target_user = db.get(User, user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.role == UserRole.OWNER and current_user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an owner can reset an owner password.",
        )

    target_user.hashed_password = hash_password(password_in.password)
    db.add(target_user)
    db.commit()
    db.refresh(target_user)
    return target_user


@router.delete("/{user_id}")
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> dict[str, str]:
    target_user = db.get(User, user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    if target_user.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner accounts cannot be deleted.",
        )

    if current_user.role != UserRole.OWNER and target_user.role != UserRole.MECHANIC:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins can only delete mechanic accounts.",
        )

    blockers = _delete_blockers(db, user_id)
    if any(blockers.values()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User is still in use and cannot be deleted: {_format_blockers(blockers)}.",
        )

    db.delete(target_user)
    db.commit()
    return {"message": "User deleted successfully"}
