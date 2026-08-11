"""
Dashboard router — aggregated "needs action" views for Admin and Therapist.
"""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func, not_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    EpisodeStatus,
    Patient,
    PatientServiceEpisode,
    Payment,
    ReassignmentRequest,
    ReassignmentStatus,
    User,
    UserRole,
    UserStatus,
    PaymentStatus,
)
from app.schemas import AdminDashboard, TherapistDashboard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

CAPACITY_THRESHOLD = 10  # Admin sees a warning when therapist has >= this many active patients


@router.get("/admin", response_model=AdminDashboard)
def admin_dashboard(
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    # --- Unpaid patients: patients whose latest/current episode has no payment ---
    # Patients with active episodes but zero payments recorded for that episode
    patients_with_active = (
        db.query(PatientServiceEpisode)
        .options(joinedload(PatientServiceEpisode.patient))
        .filter(PatientServiceEpisode.status.in_([EpisodeStatus.active, EpisodeStatus.queued]))
        .all()
    )

    paid_episode_ids = {
        row[0]
        for row in db.query(Payment.episode_id).filter(
            Payment.episode_id.isnot(None),
            Payment.status == PaymentStatus.paid,
        ).all()
    }

    unpaid_episodes = [ep for ep in patients_with_active if ep.id not in paid_episode_ids]
    unpaid_patients_map = {ep.patient_id: ep.patient for ep in unpaid_episodes}
    unpaid_patients = list(unpaid_patients_map.values())

    # --- Unassigned active episodes (queued and no therapist) ---
    unassigned_episodes = (
        db.query(PatientServiceEpisode)
        .options(
            joinedload(PatientServiceEpisode.patient),
            joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(
            PatientServiceEpisode.status == EpisodeStatus.queued,
            PatientServiceEpisode.assigned_therapist_id.is_(None),
        )
        .all()
    )

    # --- Pending reassignment requests ---
    pending_reassignments = (
        db.query(ReassignmentRequest)
        .options(
            joinedload(ReassignmentRequest.requested_by),
            joinedload(ReassignmentRequest.episode).joinedload(PatientServiceEpisode.patient),
            joinedload(ReassignmentRequest.episode).joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(ReassignmentRequest.status == ReassignmentStatus.pending)
        .order_by(ReassignmentRequest.created_at)
        .all()
    )

    # --- Therapists at or above capacity ---
    active_counts = (
        db.query(
            PatientServiceEpisode.assigned_therapist_id,
            func.count(PatientServiceEpisode.id).label("cnt"),
        )
        .filter(
            PatientServiceEpisode.status.in_([EpisodeStatus.active, EpisodeStatus.ready_to_close]),
            PatientServiceEpisode.assigned_therapist_id.isnot(None),
        )
        .group_by(PatientServiceEpisode.assigned_therapist_id)
        .all()
    )
    at_capacity_count = sum(1 for row in active_counts if row.cnt >= CAPACITY_THRESHOLD)

    return AdminDashboard(
        unpaid_patients_count=len(unpaid_patients),
        unassigned_episodes_count=len(unassigned_episodes),
        pending_reassignments_count=len(pending_reassignments),
        therapists_at_capacity_count=at_capacity_count,
        unpaid_patients=unpaid_patients,
        unassigned_episodes=unassigned_episodes,
        pending_reassignments=pending_reassignments,
    )


@router.get("/therapist", response_model=TherapistDashboard)
def therapist_dashboard(
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    # Newly assigned: active episodes assigned to this therapist
    # "Newly" means started in the last 7 days without any committed note yet
    from datetime import timedelta, datetime, timezone
    from app.models import DocumentationNote

    recently_active = (
        db.query(PatientServiceEpisode)
        .options(
            joinedload(PatientServiceEpisode.patient),
            joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(
            PatientServiceEpisode.assigned_therapist_id == caller.id,
            PatientServiceEpisode.status == EpisodeStatus.active,
        )
        .all()
    )

    # Flag episodes that have no committed notes (i.e., treatment not yet started)
    newly_assigned = []
    for ep in recently_active:
        committed_count = db.query(DocumentationNote).filter(
            DocumentationNote.episode_id == ep.id,
            DocumentationNote.is_draft == False,
        ).count()
        if committed_count == 0:
            newly_assigned.append(ep)

    # My pending reassignment requests
    pending_rrs = (
        db.query(ReassignmentRequest)
        .options(
            joinedload(ReassignmentRequest.requested_by),
            joinedload(ReassignmentRequest.episode).joinedload(PatientServiceEpisode.patient),
            joinedload(ReassignmentRequest.episode).joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(
            ReassignmentRequest.requested_by_id == caller.id,
            ReassignmentRequest.status == ReassignmentStatus.pending,
        )
        .all()
    )

    # All my active episodes
    my_active = (
        db.query(PatientServiceEpisode)
        .options(
            joinedload(PatientServiceEpisode.patient),
            joinedload(PatientServiceEpisode.assigned_therapist),
        )
        .filter(
            PatientServiceEpisode.assigned_therapist_id == caller.id,
            PatientServiceEpisode.status.in_([EpisodeStatus.active, EpisodeStatus.ready_to_close]),
        )
        .all()
    )

    return TherapistDashboard(
        newly_assigned=newly_assigned,
        pending_reassignment_requests=pending_rrs,
        my_active_episodes=my_active,
    )
