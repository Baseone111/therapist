from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import (
    AuditAction,
    Patient,
    PatientServiceEpisode,
    User,
    UserRole,
    PatientStatus,
)
from app.schemas import (
    PatientCreate,
    PatientRead,
    PatientReadDetail,
    PatientUpdate,
)
from app.services import write_audit

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("", response_model=List[PatientRead])
def list_patients(
    search: Optional[str] = Query(None, description="Search by child name or guardian phone"),
    status: Optional[PatientStatus] = None,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    q = db.query(Patient)
    if status:
        q = q.filter(Patient.status == status)
    if search:
        term = f"%{search}%"
        q = q.filter(
            Patient.child_name.ilike(term) | Patient.guardian_phone.ilike(term)
        )
    return q.order_by(Patient.child_name).all()


@router.post("", response_model=PatientRead, status_code=201)
def create_patient(
    payload: PatientCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    patient = Patient(
        child_name=payload.child_name,
        date_of_birth=payload.date_of_birth,
        guardian_name=payload.guardian_name,
        guardian_relationship=payload.guardian_relationship,
        guardian_phone=payload.guardian_phone,
        registered_by_id=admin.id,
    )
    db.add(patient)
    db.flush()
    write_audit(db, admin.id, AuditAction.created, "Patient", patient.id)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientReadDetail)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    patient = (
        db.query(Patient)
        .options(
            joinedload(Patient.service_episodes)
        )
        .filter(Patient.id == patient_id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    write_audit(db, caller.id, AuditAction.viewed, "Patient", patient.id)
    db.commit()
    return patient


@router.patch("/{patient_id}", response_model=PatientRead)
def update_patient(
    patient_id: int,
    payload: PatientUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)

    write_audit(db, admin.id, AuditAction.updated, "Patient", patient.id, str(update_data))
    db.commit()
    db.refresh(patient)
    return patient
