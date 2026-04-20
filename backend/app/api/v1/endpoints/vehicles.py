from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.driver import Driver
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleRead, VehicleUpdate


router = APIRouter()


@router.get("", response_model=list[VehicleRead])
def list_vehicles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Vehicle]:
    return list(db.scalars(select(Vehicle).order_by(Vehicle.created_at.desc())).all())


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER)),
) -> Vehicle:
    if vehicle_in.driver_id and not db.get(Driver, vehicle_in.driver_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    vehicle = Vehicle(
        driver_id=vehicle_in.driver_id,
        make=vehicle_in.make,
        model=vehicle_in.model,
        year=vehicle_in.year,
        vin=vehicle_in.vin,
        registration_number=vehicle_in.registration_number,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleRead)
def read_vehicle(
    vehicle_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleRead)
def update_vehicle(
    vehicle_id: UUID,
    vehicle_in: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER)),
) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    if vehicle_in.driver_id and not db.get(Driver, vehicle_in.driver_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    data = vehicle_in.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(vehicle, key, value)

    db.commit()
    db.refresh(vehicle)
    return vehicle
