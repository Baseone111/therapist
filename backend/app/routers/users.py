from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import (
    EpisodeStatus,
    PatientServiceEpisode,
    ServiceType,
    User,
    UserRole,
    UserStatus,
)
from app.schemas import UserCreate, UserRead, UserReadWithLoad
from app.security import hash_password
from app.services import write_audit
from app.models import AuditAction

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=List[UserRead])
def list_users(
    role: UserRole = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return q.order_by(User.full_name).all()


@router.get("/therapists", response_model=List[UserReadWithLoad])
def list_therapists_with_load(
    service_type: ServiceType = None,
    available_only: bool = False,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    """Returns therapists with their current active patient count.
    Used on the assignment screen so Admin is not assigning blind."""
    q = db.query(User).filter(User.role == UserRole.therapist)
    if service_type:
        q = q.filter(User.service_type == service_type)
    if available_only:
        q = q.filter(User.status == UserStatus.active)

    therapists = q.order_by(User.full_name).all()

    # Count active episodes per therapist in one query
    active_counts = (
        db.query(
            PatientServiceEpisode.assigned_therapist_id,
            func.count(PatientServiceEpisode.id).label("cnt"),
        )
        .filter(
            PatientServiceEpisode.status.in_(
                [EpisodeStatus.active, EpisodeStatus.ready_to_close]
            )
        )
        .group_by(PatientServiceEpisode.assigned_therapist_id)
        .all()
    )
    count_map = {row.assigned_therapist_id: row.cnt for row in active_counts}

    result = []
    for t in therapists:
        t_dict = {
            "id": t.id,
            "full_name": t.full_name,
            "email": t.email,
            "role": t.role,
            "service_type": t.service_type,
            "status": t.status,
            "created_at": t.created_at,
            "active_patient_count": count_map.get(t.id, 0),
        }
        result.append(UserReadWithLoad(**t_dict))
    return result


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        service_type=payload.service_type,
        status=payload.status,
    )
    db.add(user)
    db.flush()
    write_audit(db, admin.id, AuditAction.created, "User", user.id)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed = {"full_name", "service_type", "status"}
    for field, value in payload.items():
        if field in allowed:
            setattr(user, field, value)

    write_audit(db, admin.id, AuditAction.updated, "User", user.id, str(payload))
    db.commit()
    db.refresh(user)
    return user
