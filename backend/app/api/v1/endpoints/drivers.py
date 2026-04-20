from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.driver import Driver
from app.models.user import User
from app.schemas.driver import DriverCreate, DriverRead, DriverUpdate


router = APIRouter()


@router.get("", response_model=list[DriverRead])
def list_drivers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Driver]:
    return list(db.scalars(select(Driver).order_by(Driver.created_at.desc())).all())


@router.post("", response_model=DriverRead, status_code=status.HTTP_201_CREATED)
def create_driver(
    driver_in: DriverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER)),
) -> Driver:
    driver = Driver(
        first_name=driver_in.first_name,
        last_name=driver_in.last_name,
        license_number=driver_in.license_number,
        team_name=driver_in.team_name,
        created_by_id=current_user.id,
    )
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/{driver_id}", response_model=DriverRead)
def read_driver(
    driver_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Driver:
    driver = db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
    return driver


@router.put("/{driver_id}", response_model=DriverRead)
def update_driver(
    driver_id: UUID,
    driver_in: DriverUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER)),
) -> Driver:
    driver = db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    data = driver_in.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(driver, key, value)

    db.commit()
    db.refresh(driver)
    return driver
