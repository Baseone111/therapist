import React, { useState, useEffect } from 'react';
import { getReassignments, getTherapists, reviewReassignment } from '../../api/endpoints';
import { Spinner, ErrorMsg, Modal } from '../../components/common/UI';
import { serviceLabel, formatDate, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function ReassignmentAdmin() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewForm, setReviewForm] = useState({ decision: '', admin_note: '', new_therapist_id: '' });
  const [therapists, setTherapists] = useState([]);
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = filter ? { status: filter } : {};
      const res = await getReassignments(params);
      setRequests(res.data);
    } catch {
      setError('Failed to load reassignment requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const openReview = async (rr) => {
    setReviewModal(rr);
    setReviewForm({ decision: '', admin_note: '', new_therapist_id: '' });
    const tRes = await getTherapists({ available_only: true });
    setTherapists(tRes.data.filter((t) => t.id !== rr.requested_by_id));
  };

  const handleReview = async () => {
    if (!reviewForm.decision) { toast.error('Select approve or reject'); return; }
    setWorking(true);
    try {
      await reviewReassignment(reviewModal.id, {
        status: reviewForm.decision,
        admin_note: reviewForm.admin_note || null,
        new_therapist_id: reviewForm.new_therapist_id ? parseInt(reviewForm.new_therapist_id) : null,
      });
      toast.success(`Request ${reviewForm.decision}`);
      setReviewModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Review failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reassignment Requests</h1>
          <p className="page-subtitle">Therapist-requested patient reassignments</p>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <button
            key={s}
            className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter(s)}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {error && <ErrorMsg message={error} />}

      <div className="card">
        {loading ? <Spinner /> : requests.length === 0 ? (
          <div className="empty-state">No reassignment requests found.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Service</th>
                  <th>Current Therapist</th>
                  <th>Reason</th>
                  <th>Proposed Therapist</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((rr) => (
                  <tr key={rr.id}>
                    <td>
                      <strong>{rr.episode?.patient?.child_name}</strong>
                    </td>
                    <td>{serviceLabel(rr.episode?.service_type)}</td>
                    <td>{rr.requested_by?.full_name}</td>
                    <td style={{ maxWidth: 220 }}>
                      <span title={rr.reason}>
                        {rr.reason.length > 70 ? rr.reason.substring(0, 70) + '…' : rr.reason}
                      </span>
                    </td>
                    <td>{rr.proposed_therapist_id ? `ID #${rr.proposed_therapist_id}` : '—'}</td>
                    <td>{formatDate(rr.created_at)}</td>
                    <td>
                      <span className={`badge ${
                        rr.status === 'pending' ? 'badge-pending' :
                        rr.status === 'approved' ? 'badge-approved' : 'badge-rejected'
                      }`}>
                        {rr.status.charAt(0).toUpperCase() + rr.status.slice(1)}
                      </span>
                    </td>
                    <td>
                      {rr.status === 'pending' && (
                        <button className="btn btn-primary btn-sm" onClick={() => openReview(rr)}>
                          Review
                        </button>
                      )}
                      {rr.status !== 'pending' && rr.admin_note && (
                        <span className="text-sm text-muted" title={rr.admin_note}>Note</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewModal && (
        <Modal
          title={`Review Reassignment — ${reviewModal.episode?.patient?.child_name}`}
          onClose={() => setReviewModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setReviewModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleReview} disabled={working}>
                {working ? 'Submitting…' : 'Submit Decision'}
              </button>
            </>
          }
        >
          <div className="alert alert-info">
            <strong>Reason given:</strong><br />
            {reviewModal.reason}
          </div>

          <div className="form-group">
            <label className="form-label required">Decision</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn ${reviewForm.decision === 'approved' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setReviewForm((f) => ({ ...f, decision: 'approved' }))}
              >
                ✓ Approve
              </button>
              <button
                type="button"
                className={`btn ${reviewForm.decision === 'rejected' ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                onClick={() => setReviewForm((f) => ({ ...f, decision: 'rejected' }))}
              >
                ✗ Reject
              </button>
            </div>
          </div>

          {reviewForm.decision === 'approved' && (
            <div className="form-group">
              <label className="form-label">New Therapist (leave blank to unassign for manual reassignment)</label>
              <select
                className="form-control"
                value={reviewForm.new_therapist_id}
                onChange={(e) => setReviewForm((f) => ({ ...f, new_therapist_id: e.target.value }))}
              >
                <option value="">Unassign (queue for reassignment)</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({t.active_patient_count} active)
                    {t.active_patient_count >= 10 ? ' ⚠ AT CAPACITY' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Admin Note (optional)</label>
            <textarea
              className="form-control"
              value={reviewForm.admin_note}
              onChange={(e) => setReviewForm((f) => ({ ...f, admin_note: e.target.value }))}
              rows={3}
              placeholder="Internal note about this decision…"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
