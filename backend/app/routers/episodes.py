"""
Episode router — manages service episode lifecycle:
  queued → active → ready_to_close → completed

CRITICAL BUSINESS RULES enforced here:
1. Only one active/ready_to_close episode per patient at any time
2. Only Admin can assign therapists and confirm completions
3. Only the assigned therapist (or Admin) can mark ready_to_close
4. Next queued episode becomes assignable only after Admin confirms completion
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import (
    AuditAction,
    EpisodeStatus,
    Patient,
    PatientServiceEpisode,
    User,
    UserRole,
    UserStatus,
)
from app.schemas import EpisodeAssign, EpisodeCreate, EpisodeRead
from app.services import assert_no_active_episode, write_audit

router = APIRouter(prefix="/api/episodes", tags=["episodes"])


def _load_episode(db: Session, episode_id: int) -> PatientServiceEpisode:
    ep = (
        db.query(PatientServiceEpisode)
        .options(
            joinedload(PatientServiceEpisode.patient),
            joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(PatientServiceEpisode.id == episode_id)
        .first()
    )
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")
    return ep


@router.post("", response_model=EpisodeRead, status_code=201)
def create_episode(
    payload: EpisodeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    episode = PatientServiceEpisode(
        patient_id=payload.patient_id,
        service_type=payload.service_type,
        sequence_order=payload.sequence_order,
        status=EpisodeStatus.queued,
        created_by_id=admin.id,
    )
    db.add(episode)
    db.flush()
    write_audit(db, admin.id, AuditAction.created, "PatientServiceEpisode", episode.id)
    db.commit()
    db.refresh(episode)
    return _load_episode(db, episode.id)


@router.get("/patient/{patient_id}", response_model=List[EpisodeRead])
def get_patient_episodes(
    patient_id: int,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    return (
        db.query(PatientServiceEpisode)
        .options(
            joinedload(PatientServiceEpisode.patient),
            joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(PatientServiceEpisode.patient_id == patient_id)
        .order_by(PatientServiceEpisode.sequence_order)
        .all()
    )


@router.post("/{episode_id}/assign", response_model=EpisodeRead)
def assign_therapist(
    episode_id: int,
    payload: EpisodeAssign,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Assign a therapist to a queued episode → transitions to active."""
    ep = _load_episode(db, episode_id)

    if ep.status != EpisodeStatus.queued:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot assign a therapist to an episode in status '{ep.status}'. "
                   "Only queued episodes can be assigned.",
        )

    # Guard: patient must not have another active episode
    try:
        assert_no_active_episode(db, ep.patient_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    therapist = db.query(User).filter(User.id == payload.therapist_id).first()
    if not therapist or therapist.role != UserRole.therapist:
        raise HTTPException(status_code=400, detail="Invalid therapist")
    if therapist.status == UserStatus.on_leave:
        raise HTTPException(status_code=400, detail="Therapist is on leave and cannot be assigned")

    ep.assigned_therapist_id = payload.therapist_id
    ep.status = EpisodeStatus.active
    ep.started_at = datetime.now(timezone.utc)

    write_audit(
        db, admin.id, AuditAction.status_changed, "PatientServiceEpisode", ep.id,
        f"assigned therapist_id={payload.therapist_id}, status→active"
    )
    db.commit()
    return _load_episode(db, ep.id)


@router.post("/{episode_id}/ready-to-close", response_model=EpisodeRead)
def mark_ready_to_close(
    episode_id: int,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    """Therapist marks an episode as ready to close (treatment complete).
    Admin must confirm before it actually completes and the queue advances."""
    ep = _load_episode(db, episode_id)

    if ep.status != EpisodeStatus.active:
        raise HTTPException(
            status_code=400,
            detail="Only active episodes can be marked ready to close",
        )

    # Only the assigned therapist or Admin can mark ready-to-close
    if caller.role == UserRole.therapist and ep.assigned_therapist_id != caller.id:
        raise HTTPException(
            status_code=403,
            detail="Only the assigned therapist can mark this episode ready to close",
        )

    ep.status = EpisodeStatus.ready_to_close
    write_audit(
        db, caller.id, AuditAction.status_changed, "PatientServiceEpisode", ep.id,
        "status→ready_to_close"
    )
    db.commit()
    return _load_episode(db, ep.id)


@router.post("/{episode_id}/complete", response_model=EpisodeRead)
def confirm_completion(
    episode_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin confirms episode completion → transitions next queued episode to assignable."""
    ep = _load_episode(db, episode_id)

    if ep.status != EpisodeStatus.ready_to_close:
        raise HTTPException(
            status_code=400,
            detail="Episode must be in ready_to_close status for Admin to confirm",
        )

    ep.status = EpisodeStatus.completed
    ep.completed_at = datetime.now(timezone.utc)

    write_audit(
        db, admin.id, AuditAction.status_changed, "PatientServiceEpisode", ep.id,
        "Admin confirmed completion, status→completed"
    )
    db.commit()
    # Note: the next queued episode now becomes visible on the assignment screen.
    # No automatic status change — Admin explicitly assigns it when ready.
    return _load_episode(db, ep.id)


@router.get("/{episode_id}", response_model=EpisodeRead)
def get_episode(
    episode_id: int,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    return _load_episode(db, episode_id)
