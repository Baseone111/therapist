from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import (
    AuditAction,
    EpisodeStatus,
    PatientServiceEpisode,
    ReassignmentRequest,
    ReassignmentStatus,
    User,
    UserRole,
    UserStatus,
)
from app.schemas import ReassignmentCreate, ReassignmentRead, ReassignmentReview
from app.services import write_audit

router = APIRouter(prefix="/api/reassignments", tags=["reassignments"])


def _load_request(db: Session, request_id: int) -> ReassignmentRequest:
    req = (
        db.query(ReassignmentRequest)
        .options(
            joinedload(ReassignmentRequest.requested_by),
            joinedload(ReassignmentRequest.episode).joinedload(
                PatientServiceEpisode.patient
            ),
            joinedload(ReassignmentRequest.episode).joinedload(
                PatientServiceEpisode.assigned_therapist
            ),
        )
        .filter(ReassignmentRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Reassignment request not found")
    return req


@router.post("", response_model=ReassignmentRead, status_code=201)
def request_reassignment(
    payload: ReassignmentCreate,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    """Therapist submits a reassignment request.
    They retain full treatment and documentation rights while it is pending."""
    if caller.role != UserRole.therapist:
        raise HTTPException(status_code=403, detail="Only therapists can request reassignment")

    episode = db.query(PatientServiceEpisode).filter(
        PatientServiceEpisode.id == payload.episode_id
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if episode.assigned_therapist_id != caller.id:
        raise HTTPException(
            status_code=403,
            detail="You can only request reassignment for episodes assigned to you",
        )

    if episode.status not in [EpisodeStatus.active, EpisodeStatus.ready_to_close]:
        raise HTTPException(
            status_code=400,
            detail="Reassignment only makes sense for active episodes",
        )

    # Check for existing pending request on this episode
    existing = db.query(ReassignmentRequest).filter(
        ReassignmentRequest.episode_id == payload.episode_id,
        ReassignmentRequest.status == ReassignmentStatus.pending,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A pending reassignment request already exists for this episode",
        )

    # Validate proposed therapist if provided
    if payload.proposed_therapist_id:
        proposed = db.query(User).filter(User.id == payload.proposed_therapist_id).first()
        if not proposed or proposed.role != UserRole.therapist:
            raise HTTPException(status_code=400, detail="Invalid proposed therapist")
        if proposed.status == UserStatus.on_leave:
            raise HTTPException(
                status_code=400, detail="Proposed therapist is on leave"
            )

    req = ReassignmentRequest(
        episode_id=payload.episode_id,
        requested_by_id=caller.id,
        reason=payload.reason.strip(),
        proposed_therapist_id=payload.proposed_therapist_id,
        status=ReassignmentStatus.pending,
    )
    db.add(req)
    db.flush()
    write_audit(
        db, caller.id, AuditAction.created, "ReassignmentRequest", req.id,
        f"episode_id={payload.episode_id}"
    )
    db.commit()
    db.refresh(req)
    return _load_request(db, req.id)


@router.get("", response_model=List[ReassignmentRead])
def list_reassignments(
    status: ReassignmentStatus = None,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    q = db.query(ReassignmentRequest).options(
        joinedload(ReassignmentRequest.requested_by),
        joinedload(ReassignmentRequest.episode).joinedload(PatientServiceEpisode.patient),
        joinedload(ReassignmentRequest.episode).joinedload(PatientServiceEpisode.assigned_therapist),
    )

    if caller.role == UserRole.therapist:
        # Therapists only see their own requests
        q = q.filter(ReassignmentRequest.requested_by_id == caller.id)
    # Admins see all

    if status:
        q = q.filter(ReassignmentRequest.status == status)

    return q.order_by(ReassignmentRequest.created_at.desc()).all()


@router.post("/{request_id}/review", response_model=ReassignmentRead)
def review_reassignment(
    request_id: int,
    payload: ReassignmentReview,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin approves or rejects a reassignment request.
    On approval, the episode's assigned_therapist_id is updated."""
    req = _load_request(db, request_id)

    if req.status != ReassignmentStatus.pending:
        raise HTTPException(status_code=400, detail="This request has already been reviewed")

    req.status = payload.status
    req.reviewed_by_id = admin.id
    req.reviewed_at = datetime.now(timezone.utc)
    req.admin_note = payload.admin_note

    if payload.status == ReassignmentStatus.approved:
        # Determine the new therapist: use payload override, then proposed, then leave unassigned
        new_therapist_id = payload.new_therapist_id or req.proposed_therapist_id
        if new_therapist_id:
            new_therapist = db.query(User).filter(User.id == new_therapist_id).first()
            if not new_therapist or new_therapist.role != UserRole.therapist:
                raise HTTPException(status_code=400, detail="Invalid new therapist")
            if new_therapist.status == UserStatus.on_leave:
                raise HTTPException(status_code=400, detail="New therapist is on leave")
            req.episode.assigned_therapist_id = new_therapist_id
        else:
            # No new therapist specified — unassign so Admin can re-assign from the dashboard
            req.episode.assigned_therapist_id = None
            req.episode.status = EpisodeStatus.queued

    write_audit(
        db, admin.id, AuditAction.status_changed, "ReassignmentRequest", req.id,
        f"status→{payload.status}, admin_note={payload.admin_note}"
    )
    db.commit()
    return _load_request(db, req.id)


@router.get("/{request_id}", response_model=ReassignmentRead)
def get_reassignment(
    request_id: int,
    db: Session = Depends(get_db),
    _caller: User = Depends(get_current_user),
):
    return _load_request(db, request_id)
