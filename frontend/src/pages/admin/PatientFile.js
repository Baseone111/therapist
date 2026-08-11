import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPatient, getPatientEpisodes, getPayments, getTherapists,
  assignEpisode, confirmCompletion, recordPayment, getPayment,
  updatePatient, getNotes,
} from '../../api/endpoints';
import {
  Spinner, ErrorMsg, EpisodeStatusBadge, ConfirmModal, Modal, PatientStatusBadge
} from '../../components/common/UI';
import { serviceLabel, formatDate, formatDateTime, formatCurrency } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

const SERVICE_LABELS = {
  occupational_therapy: 'OT',
  speech_language: 'SLT',
  physiotherapy: 'PT',
};

export default function PatientFile() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [patient, setPatient] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [assignModal, setAssignModal] = useState(null); // episode to assign
  const [completeModal, setCompleteModal] = useState(null); // episode to complete
  const [paymentModal, setPaymentModal] = useState(null); // episode to pay for
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState('');
  const [payForm, setPayForm] = useState({ amount_display: '', notes: '' });
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, eRes, pmRes] = await Promise.all([
        getPatient(patientId),
        getPatientEpisodes(patientId),
        getPayments(patientId),
      ]);
      setPatient(pRes.data);
      setEpisodes(eRes.data);
      setPayments(pmRes.data);
    } catch {
      setError('Failed to load patient record');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const openAssign = async (episode) => {
    const tRes = await getTherapists({ service_type: episode.service_type, available_only: true });
    setTherapists(tRes.data);
    setSelectedTherapist('');
    setAssignModal(episode);
  };

  const handleAssign = async () => {
    if (!selectedTherapist) { toast.error('Select a therapist'); return; }
    setWorking(true);
    try {
      await assignEpisode(assignModal.id, parseInt(selectedTherapist));
      toast.success('Therapist assigned. Episode is now active.');
      setAssignModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Assignment failed');
    } finally {
      setWorking(false);
    }
  };

  const handleConfirmComplete = async () => {
    setWorking(true);
    try {
      await confirmCompletion(completeModal.id);
      toast.success('Episode completed.');
      setCompleteModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setWorking(false);
    }
  };

  const handleRecordPayment = async () => {
    const cents = Math.round(parseFloat(payForm.amount_display) * 100);
    if (!cents || cents <= 0) { toast.error('Enter a valid amount'); return; }
    setWorking(true);
    try {
      await recordPayment({
        patient_id: parseInt(patientId),
        episode_id: paymentModal?.id || null,
        amount: cents,
        notes: payForm.notes || null,
      });
      toast.success('Payment recorded.');
      setPaymentModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed');
    } finally {
      setWorking(false);
    }
  };

  const handleDischarge = async () => {
    if (!window.confirm('Mark this patient as discharged?')) return;
    await updatePatient(patientId, { status: 'discharged' });
    toast.success('Patient discharged');
    load();
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;
  if (!patient) return null;

  const activeEpisode = episodes.find(
    (e) => e.status === 'active' || e.status === 'ready_to_close'
  );

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{patient.child_name}</h1>
          <p className="page-subtitle">
            Patient Record &nbsp;·&nbsp;
            DOB: {formatDate(patient.date_of_birth)} &nbsp;·&nbsp;
            Registered: {formatDate(patient.registration_date)}
          </p>
        </div>
        <div className="flex gap-2">
          <PatientStatusBadge status={patient.status} />
          {isAdmin && patient.status === 'active' && (
            <button className="btn btn-secondary btn-sm" onClick={handleDischarge}>
              Discharge
            </button>
          )}
        </div>
      </div>

      {/* Guardian Info */}
      <div className="card">
        <div className="card-title">Guardian / Responsible Adult</div>
        <div className="form-row">
          <div>
            <div className="text-sm text-muted">Name</div>
            <div className="bold">{patient.guardian_name}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Relationship</div>
            <div>{patient.guardian_relationship}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Phone</div>
            <div>{patient.guardian_phone}</div>
          </div>
        </div>
      </div>

      {/* Service Queue — episode timeline */}
      <div className="card">
        <div className="flex-between mb-2">
          <div className="card-title" style={{ marginBottom: 0 }}>Service Queue</div>
          {isAdmin && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPaymentModal(null)}
            >
              + Record Payment
            </button>
          )}
        </div>

        <div className="episode-timeline">
          {episodes.length === 0 && (
            <div className="empty-state">No service episodes created.</div>
          )}
          {episodes.map((ep) => (
            <div key={ep.id} className={`episode-node ${ep.status}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <strong>{serviceLabel(ep.service_type)}</strong>
                <EpisodeStatusBadge status={ep.status} />
                {ep.assigned_therapist && (
                  <span className="text-sm text-muted">
                    Therapist: {ep.assigned_therapist.full_name}
                  </span>
                )}
                {ep.started_at && (
                  <span className="text-sm text-muted">
                    Started: {formatDate(ep.started_at)}
                  </span>
                )}
                {ep.completed_at && (
                  <span className="text-sm text-muted">
                    Completed: {formatDate(ep.completed_at)}
                  </span>
                )}
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="flex gap-2 mt-1">
                  {ep.status === 'queued' && (
                    <button className="btn btn-primary btn-sm" onClick={() => openAssign(ep)}>
                      Assign Therapist
                    </button>
                  )}
                  {ep.status === 'ready_to_close' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setCompleteModal(ep)}>
                      Confirm Completion
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setPaymentModal(ep); setPayForm({ amount_display: '', notes: '' }); }}
                  >
                    Record Payment
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Payment History */}
      <div className="card">
        <div className="flex-between mb-2">
          <div className="card-title" style={{ marginBottom: 0 }}>Payment History</div>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.open(`/print/invoice/${patientId}`, '_blank')}
            >
              🖨 All Invoices
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.open(`/print/guardian-summary/${patientId}`, '_blank')}
            >
              🖨 Guardian Summary
            </button>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="empty-state">No payments recorded.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th>Recorded By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pm) => {
                  const ep = episodes.find((e) => e.id === pm.episode_id);
                  return (
                    <tr key={pm.id}>
                      <td>{formatDateTime(pm.payment_date)}</td>
                      <td>{ep ? serviceLabel(ep.service_type) : '—'}</td>
                      <td><strong>{formatCurrency(pm.amount)}</strong></td>
                      <td className="text-muted">{pm.notes || '—'}</td>
                      <td className="text-muted">{pm.recorded_by?.full_name}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => window.open(`/print/invoice/payment/${pm.id}`, '_blank')}
                        >
                          🖨 Invoice
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documentation timeline — all episodes */}
      <DocumentationTimeline
        episodes={episodes}
        patientId={parseInt(patientId)}
        isAdmin={isAdmin}
        currentUserId={user?.id}
      />

      {/* Assign Therapist Modal */}
      {assignModal && (
        <Modal
          title={`Assign Therapist — ${serviceLabel(assignModal.service_type)}`}
          onClose={() => setAssignModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={working}>
                {working ? 'Assigning…' : 'Assign'}
              </button>
            </>
          }
        >
          {therapists.length === 0 ? (
            <div className="alert alert-warning">No available therapists for this service.</div>
          ) : (
            <div className="form-group">
              <label className="form-label required">Select Therapist</label>
              <select
                className="form-control"
                value={selectedTherapist}
                onChange={(e) => setSelectedTherapist(e.target.value)}
              >
                <option value="">Choose therapist…</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} — {t.active_patient_count} active patient{t.active_patient_count !== 1 ? 's' : ''}
                    {t.active_patient_count >= 10 ? ' ⚠ AT CAPACITY' : ''}
                  </option>
                ))}
              </select>
              <p className="form-hint">Active patient count shown so you can distribute workload.</p>
            </div>
          )}
        </Modal>
      )}

      {/* Confirm Completion Modal */}
      {completeModal && (
        <ConfirmModal
          title="Confirm Episode Completion"
          message={`Confirm that the ${serviceLabel(completeModal.service_type)} episode is complete? This will unblock the next queued service.`}
          onConfirm={handleConfirmComplete}
          onCancel={() => setCompleteModal(null)}
          confirmLabel="Mark Complete"
        />
      )}

      {/* Record Payment Modal */}
      {paymentModal !== undefined && (
        <Modal
          title="Record Payment"
          onClose={() => setPaymentModal(undefined)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPaymentModal(undefined)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRecordPayment} disabled={working}>
                {working ? 'Recording…' : 'Record Payment'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label required">Amount (cash)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-control"
              placeholder="0.00"
              value={payForm.amount_display}
              onChange={(e) => setPayForm((f) => ({ ...f, amount_display: e.target.value }))}
              style={{ maxWidth: 200 }}
            />
          </div>
          {paymentModal && (
            <div className="alert alert-info">
              Payment for: <strong>{serviceLabel(paymentModal.service_type)}</strong>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input
              className="form-control"
              value={payForm.notes}
              onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Partial payment, receipt #..."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Embedded Documentation Timeline component ----

function DocumentationTimeline({ episodes, patientId, isAdmin, currentUserId }) {
  const [notes, setNotes] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState({});

  const loadNotes = async (episodeId) => {
    if (notes[episodeId] !== undefined) return;
    setLoading((l) => ({ ...l, [episodeId]: true }));
    try {
      const res = await getNotes(episodeId);
      setNotes((n) => ({ ...n, [episodeId]: res.data }));
    } finally {
      setLoading((l) => ({ ...l, [episodeId]: false }));
    }
  };

  const toggle = async (episodeId) => {
    const next = !expanded[episodeId];
    setExpanded((e) => ({ ...e, [episodeId]: next }));
    if (next) await loadNotes(episodeId);
  };

  return (
    <div className="card">
      <div className="card-title">Documentation Timeline</div>
      <p className="text-sm text-muted mb-2">
        Full cross-therapist, cross-episode clinical record.
        All entries are immutable once committed.
      </p>
      {episodes.map((ep) => (
        <div key={ep.id} style={{ marginBottom: 16 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => toggle(ep.id)}
            style={{ marginBottom: 8 }}
          >
            {serviceLabel(ep.service_type)} ({ep.status})
            {expanded[ep.id] ? ' ▲' : ' ▼'}
            {ep.assigned_therapist ? ` — ${ep.assigned_therapist.full_name}` : ''}
          </button>

          {expanded[ep.id] && (
            <div style={{ paddingLeft: 16 }}>
              {loading[ep.id] && <Spinner />}
              {notes[ep.id]?.length === 0 && !loading[ep.id] && (
                <div className="empty-state" style={{ padding: '16px 0' }}>
                  No notes for this episode.
                </div>
              )}
              {(notes[ep.id] || []).map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
              {/* Note entry link for the assigned therapist or any therapist viewing */}
              {!isAdmin && (
                <a
                  href={`/therapist/episodes/${ep.id}/notes/new`}
                  className="btn btn-ghost btn-sm"
                >
                  + Add Note
                </a>
              )}
            </div>
          )}
        </div>
      ))}
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
          <span className="badge badge-warning" title={`Corrects note #${note.corrects_note_id}`}>
            Correction
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="text-sm text-muted">Session Goal</div>
          <div>{note.session_goal}</div>
        </div>
        <div>
          <div className="text-sm text-muted">Progress</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5].map((i) => (
              <div
                key={i}
                className={`progress-dot ${i <= note.progress_rating ? 'filled' : ''}`}
                title={`${note.progress_rating}/5`}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted">Next Steps</div>
          <div>{note.next_steps}</div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowClinical(!showClinical)}
        >
          {showClinical ? 'Hide' : 'Show'} Clinical Note
        </button>
        {showClinical && (
          <div style={{
            marginTop: 8,
            padding: '12px 16px',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13.5,
            lineHeight: 1.7,
          }}>
            {note.clinical_note}
          </div>
        )}
      </div>

      {note.summary_for_guardian !== null && note.summary_for_guardian !== undefined ? (
        <div style={{
          marginTop: 10,
          padding: '10px 14px',
          background: 'var(--color-success-light)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
        }}>
          <strong style={{ fontSize: 12, color: 'var(--color-success)' }}>
            GUARDIAN SUMMARY:
          </strong>
          <p style={{ marginTop: 4 }}>{note.summary_for_guardian}</p>
        </div>
      ) : (
        <div className="text-sm text-muted mt-1">
          No guardian summary written for this note.
        </div>
      )}

      {note.attachments?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="text-sm text-muted mb-1">Attachments:</div>
          {note.attachments.map((att) => (
            <span key={att.id} style={{
              display: 'inline-block',
              padding: '3px 10px',
              marginRight: 6,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12.5,
            }}>
              📎 {att.filename} ({(att.file_size_bytes / 1024).toFixed(1)} KB)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
