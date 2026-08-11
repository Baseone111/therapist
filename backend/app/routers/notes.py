"""
Documentation notes router.
CRITICAL: Notes are append-only once committed (is_draft=False).
Only draft notes can be updated (autosave). Once finalized, immutable.
"""
import json
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    AuditAction,
    DocumentationNote,
    EpisodeStatus,
    NoteAttachment,
    PatientServiceEpisode,
    User,
    UserRole,
)
from app.schemas import NoteCreate, NoteDraftSave, NoteRead
from app.services import write_audit

router = APIRouter(prefix="/api/notes", tags=["notes"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _can_write_to_episode(caller: User, episode: PatientServiceEpisode) -> bool:
    """
    Therapist can write to an episode if they are currently or were previously
    the assigned therapist. Admins can always view but are not clinical authors.
    """
    if caller.role == UserRole.therapist:
        return episode.assigned_therapist_id == caller.id
    return False


def _load_note(db: Session, note_id: int) -> DocumentationNote:
    note = (
        db.query(DocumentationNote)
        .options(
            joinedload(DocumentationNote.author),
            joinedload(DocumentationNote.attachments),
        )
        .filter(DocumentationNote.id == note_id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.get("/episode/{episode_id}", response_model=List[NoteRead])
def list_notes_for_episode(
    episode_id: int,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    """Any authenticated user can read notes (cross-therapist visibility for continuity of care)."""
    notes = (
        db.query(DocumentationNote)
        .options(
            joinedload(DocumentationNote.author),
            joinedload(DocumentationNote.attachments),
        )
        .filter(DocumentationNote.episode_id == episode_id)
        .order_by(DocumentationNote.created_at)
        .all()
    )
    # Log file access for audit trail
    for note in notes:
        write_audit(db, caller.id, AuditAction.viewed, "DocumentationNote", note.id)
    db.commit()
    return notes


@router.get("/{note_id}", response_model=NoteRead)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    note = _load_note(db, note_id)
    write_audit(db, caller.id, AuditAction.viewed, "DocumentationNote", note.id)
    db.commit()
    return note


@router.post("", response_model=NoteRead, status_code=201)
def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    """Create a new note (draft or committed). Only assigned therapist can author."""
    episode = db.query(PatientServiceEpisode).filter(
        PatientServiceEpisode.id == payload.episode_id
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    if not _can_write_to_episode(caller, episode):
        raise HTTPException(
            status_code=403,
            detail="Only the assigned therapist can author notes for this episode",
        )

    if episode.status == EpisodeStatus.completed:
        # Allow notes even on completed episodes (late documentation allowed)
        pass

    note = DocumentationNote(
        episode_id=payload.episode_id,
        session_goal=payload.session_goal,
        progress_rating=payload.progress_rating,
        next_steps=payload.next_steps,
        clinical_note=payload.clinical_note,
        summary_for_guardian=payload.summary_for_guardian,
        authored_by_id=caller.id,
        is_draft=payload.is_draft,
        corrects_note_id=payload.corrects_note_id,
        draft_last_saved_at=datetime.now(timezone.utc) if payload.is_draft else None,
    )
    db.add(note)
    db.flush()
    write_audit(
        db, caller.id,
        AuditAction.created,
        "DocumentationNote",
        note.id,
        json.dumps({"is_draft": payload.is_draft}),
    )
    db.commit()
    db.refresh(note)
    return _load_note(db, note.id)


@router.patch("/{note_id}/draft", response_model=NoteRead)
def update_draft(
    note_id: int,
    payload: NoteDraftSave,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    """Autosave endpoint — ONLY works on is_draft=True notes authored by the caller.
    Once a note is committed (is_draft=False), it is immutable."""
    note = _load_note(db, note_id)

    if not note.is_draft:
        raise HTTPException(
            status_code=409,
            detail="This note has been committed and is immutable. Create a new note to make corrections.",
        )
    if note.authored_by_id != caller.id:
        raise HTTPException(status_code=403, detail="Cannot edit another therapist's draft")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(note, field, value)
    note.draft_last_saved_at = datetime.now(timezone.utc)

    db.commit()
    return _load_note(db, note.id)


@router.post("/{note_id}/commit", response_model=NoteRead)
def commit_note(
    note_id: int,
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    """Commit a draft note to the permanent record. Immutable after this point."""
    note = _load_note(db, note_id)

    if not note.is_draft:
        raise HTTPException(status_code=409, detail="Note is already committed")
    if note.authored_by_id != caller.id:
        raise HTTPException(status_code=403, detail="Cannot commit another therapist's note")

    # Validate required fields before committing
    if not note.session_goal or not note.clinical_note or not note.next_steps:
        raise HTTPException(
            status_code=400,
            detail="session_goal, clinical_note, and next_steps are required before committing",
        )

    note.is_draft = False
    note.draft_last_saved_at = None

    write_audit(
        db, caller.id, AuditAction.status_changed, "DocumentationNote", note.id,
        "committed — now immutable"
    )
    db.commit()
    return _load_note(db, note.id)


@router.post("/{note_id}/attachments", response_model=NoteRead)
async def upload_attachment(
    note_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    caller: User = Depends(get_current_user),
):
    note = _load_note(db, note_id)

    if note.authored_by_id != caller.id and caller.role != UserRole.therapist:
        raise HTTPException(status_code=403, detail="Only the note author can attach files")

    # Reject obviously dangerous file types
    BLOCKED_EXTENSIONS = {".exe", ".bat", ".sh", ".cmd", ".ps1", ".js", ".php"}
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed")

    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    attachment = NoteAttachment(
        note_id=note.id,
        filename=file.filename,
        stored_filename=stored_name,
        file_size_bytes=len(contents),
        content_type=file.content_type or "application/octet-stream",
        uploaded_by_id=caller.id,
    )
    db.add(attachment)
    db.flush()
    write_audit(
        db, caller.id, AuditAction.file_uploaded, "NoteAttachment", attachment.id,
        json.dumps({"note_id": note.id, "filename": file.filename}),
    )
    db.commit()
    return _load_note(db, note.id)
