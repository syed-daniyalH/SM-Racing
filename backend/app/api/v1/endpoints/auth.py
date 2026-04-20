from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, oauth2_scheme
from app.core.database import get_db
from app.core.security import create_access_token
from app.core.security import decode_access_token
from app.core.enums import UserRole
from app.models.revoked_token import RevokedToken
from app.models.user import User
from sqlalchemy import select

from app.schemas.auth import Token, UserLogin, UserRead, UserSignup
from app.services.auth_service import authenticate_user, create_user


router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_user(user_in: UserSignup, db: Session = Depends(get_db)) -> User:
    try:
        return create_user(db, user_in, role=UserRole.MECHANIC)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/login", response_model=Token)
def login(
    user_in: UserLogin,
    db: Session = Depends(get_db),
) -> Token:
    user = authenticate_user(db, user_in.email, user_in.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        subject=str(user.id),
        additional_claims={"email": user.email, "role": user.role.value},
    )
    return Token(access_token=token)


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout")
def logout(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    claims = decode_access_token(token)
    token_jti = claims.get("jti")
    if token_jti:
        existing = db.scalar(select(RevokedToken).where(RevokedToken.jti == token_jti))
        if existing is None:
            expires_at = claims.get("exp")
            revoked = RevokedToken(
                jti=token_jti,
                expires_at=datetime.fromtimestamp(expires_at, tz=timezone.utc)
                if expires_at is not None
                else datetime.now(timezone.utc),
            )
            db.add(revoked)
            db.commit()

    return {"message": "Logged out successfully"}
