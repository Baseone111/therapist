/**
 * Note Entry — structured quick-fields + free text + optional guardian summary + file upload.
 * Autosaves drafts every 30 seconds. Committing is explicit and irreversible.
 * 
 * CRITICAL: Once committed, notes are immutable. Only the assigned therapist can author.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getEpisode, createNote, saveDraft, commitNote, uploadAttachment, getNotes
} from '../../api/endpoints';
import { Spinner, ErrorMsg } from '../../components/common/UI';
import { serviceLabel, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';

const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

export default function NoteEntry() {
  const { episodeId } = useParams();
  const navigate = useNavigate();

  const [episode, setEpisode] = useState(null);
  const [draftNote, setDraftNote] = useState(null); // existing uncommitted draft
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [existingNotes, setExistingNotes] = useState([]);

  const [form, setForm] = useState({
    session_goal: '',
    progress_rating: 3,
    next_steps: '',
    clinical_note: '',
    summary_for_guardian: '',
    corrects_note_id: '',
  });

  const [pendingFiles, setPendingFiles] = useState([]);
  const [committing, setCommitting] = useState(false);
  const autosaveTimer = useRef(null);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // Load episode and check for an existing uncommitted draft
  useEffect(() => {
    const init = async () => {
      try {
        const [epRes, notesRes] = await Promise.all([
          getEpisode(episodeId),
          getNotes(episodeId),
        ]);
        setEpisode(epRes.data);
        const allNotes = notesRes.data;
        setExistingNotes(allNotes.filter((n) => !n.is_draft));

        // Find existing draft by current user (the API only returns accessible notes)
        const myDraft = allNotes.find((n) => n.is_draft);
        if (myDraft) {
          setDraftNote(myDraft);
          setForm({
            session_goal: myDraft.session_goal || '',
            progress_rating: myDraft.progress_rating || 3,
            next_steps: myDraft.next_steps || '',
            clinical_note: myDraft.clinical_note || '',
            summary_for_guardian: myDraft.summary_for_guardian || '',
            corrects_note_id: myDraft.corrects_note_id || '',
          });
          setLastSaved(myDraft.draft_last_saved_at);
          toast('Restored unsaved draft.', { icon: '📋' });
        }
      } catch {
        setError('Failed to load episode');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [episodeId]);

  // Autosave logic
  const doAutosave = useCallback(async () => {
    if (!form.session_goal && !form.clinical_note) return; // nothing worth saving yet
    setSaving(true);
    try {
      const payload = {
        session_goal: form.session_goal,
        progress_rating: parseInt(form.progress_rating),
        next_steps: form.next_steps,
        clinical_note: form.clinical_note,
        summary_for_guardian: form.summary_for_guardian || null,
        corrects_note_id: form.corrects_note_id ? parseInt(form.corrects_note_id) : null,
        is_draft: true,
      };

      if (draftNote) {
        const res = await saveDraft(draftNote.id, payload);
        setLastSaved(res.data.draft_last_saved_at);
      } else {
        const res = await createNote({ ...payload, episode_id: parseInt(episodeId) });
        setDraftNote(res.data);
        setLastSaved(res.data.draft_last_saved_at);
      }
    } catch {
      // Autosave silently fails — don't disrupt the user; next save will retry
    } finally {
      setSaving(false);
    }
  }, [form, draftNote, episodeId]);

  useEffect(() => {
    autosaveTimer.current = setInterval(doAutosave, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(autosaveTimer.current);
  }, [doAutosave]);

  const handleManualSave = async () => {
    clearInterval(autosaveTimer.current);
    await doAutosave();
    autosaveTimer.current = setInterval(doAutosave, AUTOSAVE_INTERVAL_MS);
    toast.success('Draft saved');
  };

  const handleCommit = async () => {
    if (!form.session_goal.trim()) { toast.error('Session goal is required'); return; }
    if (!form.clinical_note.trim()) { toast.error('Clinical note is required'); return; }
    if (!form.next_steps.trim()) { toast.error('Next steps are required'); return; }

    if (!window.confirm(
      'Commit this note? Once committed, it cannot be edited or deleted. ' +
      'To make a correction, you will add a new note referencing this one.'
    )) return;

    setCommitting(true);
    try {
      // Save any unsaved changes first
      let noteId = draftNote?.id;
      const payload = {
        session_goal: form.session_goal,
        progress_rating: parseInt(form.progress_rating),
        next_steps: form.next_steps,
        clinical_note: form.clinical_note,
        summary_for_guardian: form.summary_for_guardian || null,
        corrects_note_id: form.corrects_note_id ? parseInt(form.corrects_note_id) : null,
        is_draft: true,
      };

      if (noteId) {
        await saveDraft(noteId, payload);
      } else {
        const res = await createNote({ ...payload, episode_id: parseInt(episodeId) });
        noteId = res.data.id;
        setDraftNote(res.data);
      }

      // Upload any pending files before committing
      for (const file of pendingFiles) {
        await uploadAttachment(noteId, file);
      }

      // Commit — now immutable
      await commitNote(noteId);
      toast.success('Note committed to patient record.');
      navigate(-1);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;

  const patientName = episode?.patient?.child_name;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {correctionMode ? 'Add Correction Note' : 'New Session Note'}
          </h1>
          <p className="page-subtitle">
            {patientName} — {episode ? serviceLabel(episode.service_type) : ''}{' '}
            · Drafts save automatically every 30 seconds
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-secondary" onClick={handleManualSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
        </div>
      </div>

      {lastSaved && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Draft last saved: {formatDateTime(lastSaved)}
        </div>
      )}

      {draftNote && (
        <div className="alert alert-warning">
          You have an unsaved draft. It will be discarded when you navigate away
          if you don't commit it.
        </div>
      )}

      <div className="card">
        {/* --- Structured quick-fields --- */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 16 }}>
          SESSION DETAILS
        </h3>

        <div className="form-group">
          <label className="form-label required">Session Goal</label>
          <input
            className="form-control"
            value={form.session_goal}
            onChange={update('session_goal')}
            placeholder="Primary goal for this session…"
            maxLength={500}
          />
        </div>

        <div className="form-group">
          <label className="form-label required">Progress Rating</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {[1, 2, 3, 4, 5].map((v) => (
              <label key={v} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  name="progress_rating"
                  value={v}
                  checked={parseInt(form.progress_rating) === v}
                  onChange={() => setForm((f) => ({ ...f, progress_rating: v }))}
                />
                <span style={{ fontSize: 12 }}>
                  {v === 1 ? 'Min' : v === 5 ? 'Max' : v}
                </span>
              </label>
            ))}
            <span className="text-muted text-sm" style={{ marginLeft: 12 }}>
              {form.progress_rating}/5
            </span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label required">Next Steps / Plan</label>
          <input
            className="form-control"
            value={form.next_steps}
            onChange={update('next_steps')}
            placeholder="Plan for next session…"
            maxLength={500}
          />
        </div>

        {/* --- Clinical Note (internal) --- */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted)', margin: '20px 0 14px' }}>
          CLINICAL NOTE <span style={{ fontWeight: 400 }}>(internal — not shared with guardian)</span>
        </h3>
        <div className="form-group">
          <textarea
            className="form-control"
            value={form.clinical_note}
            onChange={update('clinical_note')}
            rows={7}
            placeholder="Detailed clinical observations, interventions, and patient response…"
          />
        </div>

        {/* --- Guardian summary (optional, separate) --- */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted)', margin: '20px 0 8px' }}>
          GUARDIAN SUMMARY <span style={{ fontWeight: 400 }}>(optional — plain language for family)</span>
        </h3>
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          This is a <strong>separate, intentional</strong> summary written for the guardian.
          It is <strong>never</strong> automatically derived from the clinical note above.
          Leave blank if no summary is needed for this session.
        </div>
        <div className="form-group">
          <textarea
            className="form-control"
            value={form.summary_for_guardian}
            onChange={update('summary_for_guardian')}
            rows={4}
            placeholder="Plain-language summary for the guardian (optional)…"
          />
        </div>

        {/* --- Correction mode --- */}
        {existingNotes.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={correctionMode}
                onChange={(e) => {
                  setCorrectionMode(e.target.checked);
                  if (!e.target.checked) setForm((f) => ({ ...f, corrects_note_id: '' }));
                }}
              />
              <span className="text-sm">This note corrects a previous note</span>
            </label>
            {correctionMode && (
              <div className="form-group mt-1">
                <label className="form-label required">Note Being Corrected</label>
                <select
                  className="form-control"
                  value={form.corrects_note_id}
                  onChange={update('corrects_note_id')}
                >
                  <option value="">Select note…</option>
                  {existingNotes.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{n.id} — {formatDateTime(n.created_at)} — {n.session_goal.substring(0, 50)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* --- File Attachments --- */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-muted)', margin: '20px 0 12px' }}>
          ATTACHMENTS (optional)
        </h3>
        <input
          type="file"
          multiple
          onChange={(e) => setPendingFiles((f) => [...f, ...Array.from(e.target.files)])}
        />
        {pendingFiles.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {pendingFiles.map((f, i) => (
              <div key={i} style={{ fontSize: 12.5, marginTop: 4 }}>
                📎 {f.name} ({(f.size / 1024).toFixed(1)} KB)
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{ marginLeft: 8 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* --- Commit button --- */}
        <div style={{
          display: 'flex', gap: 12, justifyContent: 'flex-end',
          marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--color-border)'
        }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="btn btn-secondary" onClick={handleManualSave} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Draft'}
          </button>
          <button className="btn btn-primary" onClick={handleCommit} disabled={committing}>
            {committing ? 'Committing…' : '✓ Commit Note (Final)'}
          </button>
        </div>
        <p className="form-hint" style={{ textAlign: 'right', marginTop: 8 }}>
          Once committed, this note is part of the permanent clinical record and cannot be edited.
        </p>
      </div>
    </div>
  );
}
