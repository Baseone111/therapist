/**
 * Therapist view of a patient file.
 * - Can VIEW all episodes and notes (cross-therapist continuity of care)
 * - Can WRITE notes only for episodes assigned to them
 * - Can request reassignment for their own active episodes
 * - Can mark their active episode as ready-to-close
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getPatient, getPatientEpisodes, getNotes,
  markReadyToClose, requestReassignment,
} from '../../api/endpoints';
import {
  Spinner, ErrorMsg, EpisodeStatusBadge, Modal,
} from '../../components/common/UI';
import { serviceLabel, formatDate, formatDateTime } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function TherapistPatientFile() {
  const { patientId } = useParams();
  const { user } = useAuth();

  const [patient, setPatient] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [notesByEpisode, setNotesByEpisode] = useState({});
  const [expandedEpisodes, setExpandedEpisodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reassignment modal
  const [rrModal, setRrModal] = useState(null);
  const [rrReason, setRrReason] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, eRes] = await Promise.all([
        getPatient(patientId),
        getPatientEpisodes(patientId),
      ]);
      setPatient(pRes.data);
      setEpisodes(eRes.data);
    } catch {
      setError('Failed to load patient record');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const loadNotes = async (episodeId) => {
    if (notesByEpisode[episodeId] !== undefined) return;
    try {
      const res = await getNotes(episodeId);
      setNotesByEpisode((n) => ({ ...n, [episodeId]: res.data }));
    } catch {
      toast.error('Failed to load notes');
    }
  };

  const toggleEpisode = async (episodeId) => {
    const next = !expandedEpisodes[episodeId];
    setExpandedEpisodes((e) => ({ ...e, [episodeId]: next }));
    if (next) await loadNotes(episodeId);
  };

  const handleReadyToClose = async (ep) => {
    if (!window.confirm(`Mark the ${serviceLabel(ep.service_type)} episode as ready to close?`)) return;
    try {
      await markReadyToClose(ep.id);
      toast.success('Episode marked as ready to close. Admin will confirm completion.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    }
  };

  const handleRequestReassignment = async () => {
    if (!rrReason.trim()) { toast.error('Reason is required'); return; }
    setWorking(true);
    try {
      await requestReassignment({ episode_id: rrModal.id, reason: rrReason });
      toast.success('Reassignment request submitted. You retain full treatment rights while it is reviewed.');
      setRrModal(null);
      setRrReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Request failed');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;
  if (!patient) return null;

  const myEpisodes = episodes.filter((ep) => ep.assigned_therapist_id === user?.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{patient.child_name}</h1>
          <p className="page-subtitle">
            DOB: {formatDate(patient.date_of_birth)} &nbsp;·&nbsp;
            Guardian: {patient.guardian_name} ({patient.guardian_relationship}) — {patient.guardian_phone}
          </p>
        </div>
      </div>

      {/* My active episodes — actions */}
      {myEpisodes.filter((e) => e.status === 'active' || e.status === 'ready_to_close').length > 0 && (
        <div className="card">
          <div className="card-title">My Episodes for This Patient</div>
          {myEpisodes
            .filter((e) => e.status === 'active' || e.status === 'ready_to_close')
            .map((ep) => (
              <div key={ep.id} style={{ marginBottom: 14 }}>
                <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{serviceLabel(ep.service_type)}</strong>
                  <EpisodeStatusBadge status={ep.status} />
                  <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
                    <Link
                      to={`/therapist/episodes/${ep.id}/notes/new`}
                      className="btn btn-primary btn-sm"
                    >
                      + Add Note
                    </Link>
                    {ep.status === 'active' && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleReadyToClose(ep)}
                        >
                          Mark Ready to Close
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setRrModal(ep); setRrReason(''); }}
                        >
                          Request Reassignment
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Full documentation timeline */}
      <div className="card">
        <div className="card-title">Documentation Timeline</div>
        <p className="text-sm text-muted mb-2">
          All services and notes for this patient, across all therapists.
        </p>
        {episodes.map((ep) => (
          <div key={ep.id} style={{ marginBottom: 16 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => toggleEpisode(ep.id)}
              style={{ marginBottom: 8 }}
            >
              {serviceLabel(ep.service_type)}
              {ep.assigned_therapist ? ` — ${ep.assigned_therapist.full_name}` : ' — (unassigned)'}
              {' '}
              <EpisodeStatusBadge status={ep.status} />
              {expandedEpisodes[ep.id] ? ' ▲' : ' ▼'}
            </button>

            {expandedEpisodes[ep.id] && (
              <div style={{ paddingLeft: 16 }}>
                {notesByEpisode[ep.id] === undefined && <Spinner />}
                {notesByEpisode[ep.id]?.length === 0 && (
                  <div className="empty-state" style={{ padding: '12px 0' }}>No notes.</div>
                )}
                {(notesByEpisode[ep.id] || []).map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reassignment Modal */}
      {rrModal && (
        <Modal
          title={`Request Reassignment — ${serviceLabel(rrModal.service_type)}`}
          onClose={() => setRrModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setRrModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRequestReassignment} disabled={working}>
                {working ? 'Submitting…' : 'Submit Request'}
              </button>
            </>
          }
        >
          <div className="alert alert-info">
            You will retain full treatment and documentation rights for{' '}
            <strong>{patient.child_name}</strong> until Admin approves this request.
          </div>
          <div className="form-group mt-2">
            <label className="form-label required">Reason for Reassignment</label>
            <textarea
              className="form-control"
              value={rrReason}
              onChange={(e) => setRrReason(e.target.value)}
              rows={4}
              placeholder="Describe the clinical or scheduling reason for this request…"
              required
            />
            <p className="form-hint">This reason is reviewed by Admin and becomes part of the record.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NoteCard({ note }) {
  const [showClinical, setShowClinical] = useState(false);
  return (
    <div className={`note-card ${note.is_draft ? 'draft' : ''}`}>
      <div className="note-meta">
        <span><strong>{note.authored_by?.full_name || 'Unknown'}</strong></span>
        <span>{formatDateTime(note.created_at)}</span>
        {note.is_draft && <span className="badge badge-pending">Draft</span>}
        {note.corrects_note_id && (
          <span className="badge badge-warning">Corrects #{note.corrects_note_id}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="text-sm text-muted">Session Goal</div>
          <div>{note.session_goal}</div>
        </div>
        <div>
          <div className="text-sm text-muted">Progress (1–5)</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1,2,3,4,5].map((i) => (
              <div key={i} className={`progress-dot ${i <= note.progress_rating ? 'filled' : ''}`} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Next Steps</div>
          <div>{note.next_steps}</div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowClinical(!showClinical)}>
          {showClinical ? 'Hide' : 'Show'} Clinical Note
        </button>
        {showClinical && (
          <div style={{
            marginTop: 8, padding: '12px 16px', background: 'var(--color-bg)',
            borderRadius: 'var(--radius-sm)', fontSize: 13.5, lineHeight: 1.7
          }}>
            {note.clinical_note}
          </div>
        )}
      </div>
      {note.summary_for_guardian ? (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--color-success-light)', borderRadius: 'var(--radius-sm)', fontSize: 13
        }}>
          <strong style={{ fontSize: 12, color: 'var(--color-success)' }}>GUARDIAN SUMMARY:</strong>
          <p style={{ marginTop: 4 }}>{note.summary_for_guardian}</p>
        </div>
      ) : (
        <div className="text-sm text-muted mt-1">No guardian summary written for this note.</div>
      )}
      {note.attachments?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span className="text-sm text-muted">Attachments: </span>
          {note.attachments.map((att) => (
            <span key={att.id} style={{
              display: 'inline-block', padding: '2px 8px', marginRight: 6,
              border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12.5
            }}>📎 {att.filename}</span>
          ))}
        </div>
      )}
    </div>
  );
}
