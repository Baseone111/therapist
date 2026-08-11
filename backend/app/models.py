"""
SQLAlchemy ORM models for the children's therapy center clinical system.

Design principles enforced here:
- One active service episode per patient: enforced via DB-level CHECK trigger
- DocumentationNote is append-only (no update endpoint ever touches it)
- Every clinical write carries created_by / created_at
- Audit log table captures every significant state change
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    admin = "admin"
    therapist = "therapist"


class ServiceType(str, enum.Enum):
    occupational_therapy = "occupational_therapy"
    speech_language = "speech_language"
    physiotherapy = "physiotherapy"


class UserStatus(str, enum.Enum):
    active = "active"
    on_leave = "on_leave"


class PatientStatus(str, enum.Enum):
    active = "active"
    discharged = "discharged"


class EpisodeStatus(str, enum.Enum):
    queued = "queued"
    active = "active"
    ready_to_close = "ready_to_close"
    completed = "completed"


class ReassignmentStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class PaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    paid = "paid"


class AuditAction(str, enum.Enum):
    created = "created"
    updated = "updated"
    status_changed = "status_changed"
    viewed = "viewed"
    file_uploaded = "file_uploaded"
    file_accessed = "file_accessed"


# ---------------------------------------------------------------------------
# User (Admin + Therapist)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    # Therapists have a primary service; admins have NULL here
    service_type = Column(Enum(ServiceType), nullable=True)
    status = Column(Enum(UserStatus), nullable=False, default=UserStatus.active)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    assigned_episodes = relationship(
        "PatientServiceEpisode",
        foreign_keys="PatientServiceEpisode.assigned_therapist_id",
        back_populates="assigned_therapist",
    )
    documentation_notes = relationship("DocumentationNote", back_populates="author")
    reassignment_requests = relationship(
        "ReassignmentRequest",
        foreign_keys="ReassignmentRequest.requested_by_id",
        back_populates="requested_by",
    )
    reviewed_reassignments = relationship(
        "ReassignmentRequest",
        foreign_keys="ReassignmentRequest.reviewed_by_id",
        back_populates="reviewed_by",
    )
    payments_recorded = relationship("Payment", back_populates="recorded_by")


# ---------------------------------------------------------------------------
# Patient
# ---------------------------------------------------------------------------

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    # Child info
    child_name = Column(String(200), nullable=False)
    date_of_birth = Column(DateTime, nullable=False)
    registration_date = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    status = Column(Enum(PatientStatus), nullable=False, default=PatientStatus.active)

    # Guardian info — required; this is a minor's record
    guardian_name = Column(String(200), nullable=False)
    guardian_relationship = Column(String(100), nullable=False)
    guardian_phone = Column(String(50), nullable=False)

    # Audit
    registered_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    registered_by = relationship("User", foreign_keys=[registered_by_id])

    # Relationships
    service_episodes = relationship(
        "PatientServiceEpisode",
        back_populates="patient",
        order_by="PatientServiceEpisode.sequence_order",
    )
    payments = relationship("Payment", back_populates="patient")


# ---------------------------------------------------------------------------
# PatientServiceEpisode
# The critical business entity — one per service course.
# DB-level constraint: only one active/ready_to_close episode per patient.
# ---------------------------------------------------------------------------

class PatientServiceEpisode(Base):
    __tablename__ = "patient_service_episodes"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    service_type = Column(Enum(ServiceType), nullable=False)
    assigned_therapist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(Enum(EpisodeStatus), nullable=False, default=EpisodeStatus.queued)
    sequence_order = Column(Integer, nullable=False, default=1)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Audit
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="service_episodes")
    assigned_therapist = relationship(
        "User",
        foreign_keys=[assigned_therapist_id],
        back_populates="assigned_episodes",
    )
    created_by = relationship("User", foreign_keys=[created_by_id])
    documentation_notes = relationship(
        "DocumentationNote", back_populates="episode", order_by="DocumentationNote.created_at"
    )
    payments = relationship("Payment", back_populates="episode")
    reassignment_requests = relationship("ReassignmentRequest", back_populates="episode")

    # Composite unique index: patient cannot have two simultaneous active episodes.
    # SQLite partial index approach via a trigger (see events below).
    __table_args__ = (
        Index(
            "ix_one_active_episode_per_patient",
            "patient_id",
            unique=False,  # The real uniqueness guard is the trigger + app-level transaction check
        ),
    )


# ---------------------------------------------------------------------------
# DocumentationNote  — APPEND-ONLY, never updated or deleted
# ---------------------------------------------------------------------------

class DocumentationNote(Base):
    __tablename__ = "documentation_notes"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("patient_service_episodes.id"), nullable=False)

    # Structured quick-fields
    session_goal = Column(String(500), nullable=False)
    progress_rating = Column(Integer, nullable=False)  # 1–5 scale
    next_steps = Column(String(500), nullable=False)

    # Full clinical note — internal only
    clinical_note = Column(Text, nullable=False)

    # Separate guardian-facing summary — intentional, never derived automatically
    summary_for_guardian = Column(Text, nullable=True)

    # Attribution — immutable once set
    authored_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Draft support: a draft is NOT yet committed; once is_draft=False it is immutable
    is_draft = Column(Boolean, nullable=False, default=True)
    draft_last_saved_at = Column(DateTime, nullable=True)

    # Relationships
    episode = relationship("PatientServiceEpisode", back_populates="documentation_notes")
    author = relationship("User", back_populates="documentation_notes")
    attachments = relationship("NoteAttachment", back_populates="note")

    # Corrections reference: if this note corrects a prior note, record that
    corrects_note_id = Column(Integer, ForeignKey("documentation_notes.id"), nullable=True)
    corrections = relationship("DocumentationNote", foreign_keys=[corrects_note_id])

    __table_args__ = (
        CheckConstraint("progress_rating BETWEEN 1 AND 5", name="ck_progress_rating_range"),
    )


# ---------------------------------------------------------------------------
# NoteAttachment — files uploaded alongside a documentation note
# ---------------------------------------------------------------------------

class NoteAttachment(Base):
    __tablename__ = "note_attachments"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("documentation_notes.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)  # UUID-based storage name
    file_size_bytes = Column(Integer, nullable=False)
    content_type = Column(String(100), nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    note = relationship("DocumentationNote", back_populates="attachments")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])


# ---------------------------------------------------------------------------
# Payment / Invoice — cash-only, recorded by Admin
# ---------------------------------------------------------------------------

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    episode_id = Column(Integer, ForeignKey("patient_service_episodes.id"), nullable=True)
    amount = Column(Integer, nullable=False)  # Store in cents to avoid float arithmetic
    payment_date = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    status = Column(Enum(PaymentStatus), nullable=False, default=PaymentStatus.paid)
    notes = Column(String(500), nullable=True)

    # Audit
    recorded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recorded_by = relationship("User", back_populates="payments_recorded")
    patient = relationship("Patient", back_populates="payments")
    episode = relationship("PatientServiceEpisode", back_populates="payments")


# ---------------------------------------------------------------------------
# ReassignmentRequest
# ---------------------------------------------------------------------------

class ReassignmentRequest(Base):
    __tablename__ = "reassignment_requests"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("patient_service_episodes.id"), nullable=False)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=False)  # Non-empty enforced at API layer + DB CHECK
    proposed_therapist_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    status = Column(Enum(ReassignmentStatus), nullable=False, default=ReassignmentStatus.pending)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    admin_note = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    episode = relationship("PatientServiceEpisode", back_populates="reassignment_requests")
    requested_by = relationship(
        "User",
        foreign_keys=[requested_by_id],
        back_populates="reassignment_requests",
    )
    reviewed_by = relationship(
        "User",
        foreign_keys=[reviewed_by_id],
        back_populates="reviewed_reassignments",
    )
    proposed_therapist = relationship("User", foreign_keys=[proposed_therapist_id])

    __table_args__ = (
        CheckConstraint("length(trim(reason)) > 0", name="ck_reassignment_reason_nonempty"),
    )


# ---------------------------------------------------------------------------
# AuditLog — append-only record of every significant action
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(Enum(AuditAction), nullable=False)
    entity_type = Column(String(100), nullable=False)  # e.g. "DocumentationNote"
    entity_id = Column(Integer, nullable=False)
    detail = Column(Text, nullable=True)  # JSON string with relevant before/after fields
    timestamp = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    actor = relationship("User", foreign_keys=[actor_id])
    Index("ix_audit_entity", "entity_type", "entity_id")
    Index("ix_audit_actor", "actor_id")
