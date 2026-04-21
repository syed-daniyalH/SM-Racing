from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import select


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import get_session_local
from app.core.enums import UserRole
from app.core.security import hash_password
from app.models.user import User


SEED_USERS = [
    {
        "name": "Admin",
        "email": "admin@smracing.com",
        "password": "123456",
        "role": UserRole.ADMIN,
    },
    {
        "name": "Mechanic",
        "email": "mec@smracing.com",
        "password": "123456",
        "role": UserRole.MECHANIC,
    },
]


def upsert_users() -> tuple[list[str], list[str]]:
    session_local = get_session_local()
    db = session_local()
    created: list[str] = []
    updated: list[str] = []

    try:
        for user_data in SEED_USERS:
            email = user_data["email"].lower()
            existing = db.scalar(select(User).where(User.email == email))

            if existing is None:
                db.add(
                    User(
                        name=user_data["name"],
                        email=email,
                        hashed_password=hash_password(user_data["password"]),
                        role=user_data["role"],
                        is_active=True,
                    )
                )
                created.append(email)
                continue

            existing.name = user_data["name"]
            existing.hashed_password = hash_password(user_data["password"])
            existing.role = user_data["role"]
            existing.is_active = True
            updated.append(email)

        db.commit()
        return created, updated
    finally:
        db.close()


def main() -> None:
    created, updated = upsert_users()
    print({"created": created, "updated": updated})


if __name__ == "__main__":
    main()
