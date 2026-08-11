"""
Shared service helpers used by multiple routers.
Keeps business logic out of route handlers.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import (
    AuditAction,
    AuditLog,
    EpisodeStatus,
    PatientServiceEpisode,
)


def assert_no_active_episode(db: Session, patient_id: int, exclude_episode_id: Optional[int] = None) -> None:
    """
    Raise ValueError if the patient already has an active or ready_to_close episode.
    This is the application-layer guard that backs up the DB-level uniqueness trigger.
    """
    q = db.query(PatientServiceEpisode).filter(
        PatientServiceEpisode.patient_id == patient_id,
        PatientServiceEpisode.status.in_([EpisodeStatus.active, EpisodeStatus.ready_to_close]),
    )
    if exclude_episode_id:
        q = q.filter(PatientServiceEpisode.id != exclude_episode_id)

    conflict = q.first()
    if conflict:
        raise ValueError(
            f"Patient already has an active episode (id={conflict.id}, "
            f"service={conflict.service_type}). Complete it before activating another."
        )


def write_audit(
    db: Session,
    actor_id: int,
    action: AuditAction,
    entity_type: str,
    entity_id: int,
    detail: Optional[str] = None,
) -> None:
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(log)
    # No db.commit() here — caller is responsible for the transaction
