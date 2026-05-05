from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.driver import Driver
from app.models.event import Event
from app.models.run_group import RunGroup
from app.models.submission import Submission
from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import UserCreate, UserPasswordReset, UserRead, UserRoleUpdate
from app.services.auth_service import create_user


router = APIRouter()


def _user_delete_references(db: Session, user_id: UUID) -> list[str]:
    references: list[str] = []

    if db.scalar(select(Event.id).where(Event.created_by_id == user_id)) is not None:
        references.append("events")
    if db.scalar(select(RunGroup.id).where(RunGroup.created_by_id == user_id)) is not None:
        references.append("run groups")
    if db.scalar(select(Submission.id).where(Submission.created_by_id == user_id)) is not None:
        references.append("submissions")
    if db.scalar(select(Driver.id).where(Driver.created_by_id == user_id)) is not None:
        references.append("drivers")

    return references


def _reassign_user_references(db: Session, target_user_id: UUID, replacement_user_id: UUID) -> dict[str, int]:
    if target_user_id == replacement_user_id:
        return {
            "events": 0,
            "run_groups": 0,
            "submissions": 0,
            "drivers": 0,
        }

    updates = {
        "events": db.execute(
            update(Event)
            .where(Event.created_by_id == target_user_id)
            .values(created_by_id=replacement_user_id),
        ).rowcount
        or 0,
        "run_groups": db.execute(
            update(RunGroup)
            .where(RunGroup.created_by_id == target_user_id)
            .values(created_by_id=replacement_user_id),
        ).rowcount
        or 0,
        "submissions": db.execute(
            update(Submission)
            .where(Submission.created_by_id == target_user_id)
            .values(created_by_id=replacement_user_id),
        ).rowcount
        or 0,
        "drivers": db.execute(
            update(Driver)
            .where(Driver.created_by_id == target_user_id)
            .values(created_by_id=replacement_user_id),
        ).rowcount
        or 0,
    }

    return updates


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


@router.patch("/{user_id}/role", response_model=UserRead)
def update_user_role(
    user_id: UUID,
    role_in: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> User:
    target_user = db.get(User, user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot change your own role.",
        )

    if current_user.role != UserRole.OWNER:
        if target_user.role == UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an owner can change an owner account.",
            )

        if role_in.role == UserRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an owner can assign owner access.",
            )

    target_user.role = role_in.role
    db.add(target_user)
    db.commit()
    db.refresh(target_user)
    return target_user


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


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> None:
    target_user = db.get(User, user_id)
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete your own account.",
        )

    if target_user.role == UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner accounts cannot be deleted.",
        )

    if current_user.role == UserRole.ADMIN and target_user.role != UserRole.MECHANIC:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins can only delete mechanic accounts.",
        )

    try:
        _reassign_user_references(db, target_user.id, current_user.id)
        db.delete(target_user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User cannot be deleted because it is referenced by events, run groups, submissions, or drivers.",
        ) from exc
