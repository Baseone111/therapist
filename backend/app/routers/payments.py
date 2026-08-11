from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import AuditAction, Patient, PatientServiceEpisode, Payment, User
from app.schemas import PaymentCreate, PaymentRead
from app.services import write_audit

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _load_payment(db: Session, payment_id: int) -> Payment:
    payment = (
        db.query(Payment)
        .options(
            joinedload(Payment.recorded_by),
            joinedload(Payment.patient),
        )
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


@router.post("", response_model=PaymentRead, status_code=201)
def record_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if payload.episode_id:
        episode = db.query(PatientServiceEpisode).filter(
            PatientServiceEpisode.id == payload.episode_id,
            PatientServiceEpisode.patient_id == payload.patient_id,
        ).first()
        if not episode:
            raise HTTPException(status_code=400, detail="Episode not found or does not belong to this patient")

    payment = Payment(
        patient_id=payload.patient_id,
        episode_id=payload.episode_id,
        amount=payload.amount,
        payment_date=payload.payment_date or datetime.now(timezone.utc),
        notes=payload.notes,
        recorded_by_id=admin.id,
    )
    db.add(payment)
    db.flush()
    write_audit(
        db, admin.id, AuditAction.created, "Payment", payment.id,
        f"amount={payload.amount} cents"
    )
    db.commit()
    db.refresh(payment)
    return _load_payment(db, payment.id)


@router.get("/patient/{patient_id}", response_model=List[PaymentRead])
def list_patient_payments(
    patient_id: int,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    return (
        db.query(Payment)
        .options(joinedload(Payment.recorded_by), joinedload(Payment.patient))
        .filter(Payment.patient_id == patient_id)
        .order_by(Payment.payment_date.desc())
        .all()
    )


@router.get("/{payment_id}", response_model=PaymentRead)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    return _load_payment(db, payment_id)
