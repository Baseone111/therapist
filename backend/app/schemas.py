"""
Pydantic schemas (request / response) for the API.
All schema names use the convention:  EntityBase / EntityCreate / EntityRead
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import (
    AuditAction,
    EpisodeStatus,
    PaymentStatus,
    ReassignmentStatus,
    ServiceType,
    UserRole,
    UserStatus,
    PatientStatus,
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: UserRole
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# User / Therapist
# ---------------------------------------------------------------------------

class UserBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    role: UserRole
    service_type: Optional[ServiceType] = None
    status: UserStatus = UserStatus.active


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)

    @field_validator("service_type")
    @classmethod
    def therapist_needs_service(cls, v, info):
        if info.data.get("role") == UserRole.therapist and v is None:
            raise ValueError("Therapists must have a service_type")
        return v


class UserRead(UserBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class UserReadWithLoad(UserRead):
    """Used on assignment screen — includes active patient count."""
    active_patient_count: int = 0


# ---------------------------------------------------------------------------
# Patient
# ---------------------------------------------------------------------------

class PatientBase(BaseModel):
    child_name: str = Field(..., min_length=1, max_length=200)
    date_of_birth: datetime
    guardian_name: str = Field(..., min_length=1, max_length=200)
    guardian_relationship: str = Field(..., min_length=1, max_length=100)
    guardian_phone: str = Field(..., min_length=1, max_length=50)


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    child_name: Optional[str] = Field(None, min_length=1, max_length=200)
    guardian_name: Optional[str] = Field(None, min_length=1, max_length=200)
    guardian_relationship: Optional[str] = Field(None, min_length=1, max_length=100)
    guardian_phone: Optional[str] = Field(None, min_length=1, max_length=50)
    status: Optional[PatientStatus] = None


class PatientRead(PatientBase):
    id: int
    registration_date: datetime
    status: PatientStatus
    registered_by_id: int

    model_config = {"from_attributes": True}


class PatientReadDetail(PatientRead):
    service_episodes: List["EpisodeReadBrief"] = []


# ---------------------------------------------------------------------------
# PatientServiceEpisode
# ---------------------------------------------------------------------------

class EpisodeCreate(BaseModel):
    patient_id: int
    service_type: ServiceType
    sequence_order: int = Field(..., ge=1)


class EpisodeAssign(BaseModel):
    therapist_id: int


class EpisodeReadBrief(BaseModel):
    id: int
    service_type: ServiceType
    status: EpisodeStatus
    sequence_order: int
    assigned_therapist_id: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EpisodeRead(EpisodeReadBrief):
    patient_id: int
    created_by_id: int
    assigned_therapist: Optional[UserRead] = None
    patient: Optional[PatientRead] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# DocumentationNote
# ---------------------------------------------------------------------------

class NoteAttachmentRead(BaseModel):
    id: int
    note_id: int
    filename: str
    file_size_bytes: int
    content_type: str
    uploaded_by_id: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class NoteCreate(BaseModel):
    episode_id: int
    session_goal: str = Field(..., min_length=1, max_length=500)
    progress_rating: int = Field(..., ge=1, le=5)
    next_steps: str = Field(..., min_length=1, max_length=500)
    clinical_note: str = Field(..., min_length=1)
    summary_for_guardian: Optional[str] = None
    corrects_note_id: Optional[int] = None
    is_draft: bool = True


class NoteDraftSave(BaseModel):
    """Partial save for autosave — only drafts can be updated."""
    episode_id: Optional[int] = None
    session_goal: Optional[str] = Field(None, max_length=500)
    progress_rating: Optional[int] = Field(None, ge=1, le=5)
    next_steps: Optional[str] = Field(None, max_length=500)
    clinical_note: Optional[str] = None
    summary_for_guardian: Optional[str] = None
    corrects_note_id: Optional[int] = None


class NoteRead(BaseModel):
    id: int
    episode_id: int
    session_goal: str
    progress_rating: int
    next_steps: str
    clinical_note: str
    summary_for_guardian: Optional[str]
    authored_by_id: int
    authored_by: Optional[UserRead] = None
    created_at: datetime
    is_draft: bool
    draft_last_saved_at: Optional[datetime]
    corrects_note_id: Optional[int]
    attachments: List[NoteAttachmentRead] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

class PaymentCreate(BaseModel):
    patient_id: int
    episode_id: Optional[int] = None
    amount: int = Field(..., gt=0, description="Amount in cents")
    payment_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=500)


class PaymentRead(BaseModel):
    id: int
    patient_id: int
    episode_id: Optional[int]
    amount: int
    payment_date: datetime
    status: PaymentStatus
    notes: Optional[str]
    recorded_by_id: int
    recorded_by: Optional[UserRead] = None
    patient: Optional[PatientRead] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# ReassignmentRequest
# ---------------------------------------------------------------------------

class ReassignmentCreate(BaseModel):
    episode_id: int
    reason: str = Field(..., min_length=1)
    proposed_therapist_id: Optional[int] = None

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, v):
        if not v.strip():
            raise ValueError("Reason must not be blank")
        return v.strip()


class ReassignmentReview(BaseModel):
    status: ReassignmentStatus  # approved or rejected only
    admin_note: Optional[str] = None
    new_therapist_id: Optional[int] = None  # If approving, can set the new therapist

    @field_validator("status")
    @classmethod
    def only_final_states(cls, v):
        if v == ReassignmentStatus.pending:
            raise ValueError("Cannot set status back to pending")
        return v


class ReassignmentRead(BaseModel):
    id: int
    episode_id: int
    requested_by_id: int
    reason: str
    proposed_therapist_id: Optional[int]
    status: ReassignmentStatus
    reviewed_by_id: Optional[int]
    reviewed_at: Optional[datetime]
    admin_note: Optional[str]
    created_at: datetime
    requested_by: Optional[UserRead] = None
    episode: Optional[EpisodeRead] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Dashboard summary schemas
# ---------------------------------------------------------------------------

class AdminDashboard(BaseModel):
    unpaid_patients_count: int
    unassigned_episodes_count: int
    pending_reassignments_count: int
    therapists_at_capacity_count: int
    unpaid_patients: List[PatientRead]
    unassigned_episodes: List[EpisodeRead]
    pending_reassignments: List[ReassignmentRead]


class TherapistDashboard(BaseModel):
    newly_assigned: List[EpisodeRead]
    pending_reassignment_requests: List[ReassignmentRead]
    my_active_episodes: List[EpisodeRead]


# Allow forward references to resolve
PatientReadDetail.model_rebuild()
