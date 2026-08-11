import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, confirmCompletion } from '../../api/endpoints';
import { Spinner, ErrorMsg, EpisodeStatusBadge, ConfirmModal } from '../../components/common/UI';
import { serviceLabel, formatDate, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmEpisode, setConfirmEpisode] = useState(null);

  const load = async () => {
    try {
      const res = await getAdminDashboard();
      setData(res.data);
    } catch (e) {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConfirmComplete = async () => {
    await confirmCompletion(confirmEpisode.id);
    toast.success('Episode completed. Next queued service is now assignable.');
    setConfirmEpisode(null);
    load();
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;

  const { unpaid_patients_count, unassigned_episodes_count, pending_reassignments_count,
    therapists_at_capacity_count, unpaid_patients, unassigned_episodes, pending_reassignments } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Needs action today</p>
        </div>
        <Link to="/admin/register" className="btn btn-primary">+ Register Patient</Link>
      </div>

      <div className="stat-grid">
        <div className={`stat-card ${unpaid_patients_count > 0 ? 'stat-warning' : 'stat-success'}`}>
          <div className="stat-value">{unpaid_patients_count}</div>
          <div className="stat-label">Patients Without Payment</div>
        </div>
        <div className={`stat-card ${unassigned_episodes_count > 0 ? 'stat-danger' : 'stat-success'}`}>
          <div className="stat-value">{unassigned_episodes_count}</div>
          <div className="stat-label">Unassigned Episodes</div>
        </div>
        <div className={`stat-card ${pending_reassignments_count > 0 ? 'stat-warning' : 'stat-success'}`}>
          <div className="stat-value">{pending_reassignments_count}</div>
          <div className="stat-label">Pending Reassignments</div>
        </div>
        <div className={`stat-card ${therapists_at_capacity_count > 0 ? 'stat-warning' : 'stat-neutral'}`}>
          <div className="stat-value">{therapists_at_capacity_count}</div>
          <div className="stat-label">Therapists at Capacity</div>
        </div>
      </div>

      {/* Unassigned Episodes */}
      {unassigned_episodes.length > 0 && (
        <div className="card">
          <div className="card-title">⚠ Unassigned Episodes — Needs Therapist Assignment</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Service</th>
                  <th>Queue Position</th>
                  <th>Registered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {unassigned_episodes.map((ep) => (
                  <tr key={ep.id}>
                    <td>
                      <Link to={`/admin/patients/${ep.patient_id}`}>
                        {ep.patient?.child_name}
                      </Link>
                    </td>
                    <td>{serviceLabel(ep.service_type)}</td>
                    <td>#{ep.sequence_order}</td>
                    <td>{formatDate(ep.created_at)}</td>
                    <td>
                      <Link to={`/admin/patients/${ep.patient_id}`} className="btn btn-primary btn-sm">
                        Assign Therapist
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unpaid Patients */}
      {unpaid_patients.length > 0 && (
        <div className="card">
          <div className="card-title">💳 Patients Without Payment Record</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Guardian</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {unpaid_patients.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/admin/patients/${p.id}`}>{p.child_name}</Link></td>
                    <td>{p.guardian_name}</td>
                    <td>{p.guardian_phone}</td>
                    <td>{formatDate(p.registration_date)}</td>
                    <td>
                      <Link to={`/admin/patients/${p.id}`} className="btn btn-secondary btn-sm">
                        Record Payment
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Reassignments */}
      {pending_reassignments.length > 0 && (
        <div className="card">
          <div className="card-title">🔄 Pending Reassignment Requests</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Service</th>
                  <th>Requested By</th>
                  <th>Reason (excerpt)</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pending_reassignments.map((rr) => (
                  <tr key={rr.id}>
                    <td>
                      <Link to={`/admin/patients/${rr.episode?.patient_id}`}>
                        {rr.episode?.patient?.child_name}
                      </Link>
                    </td>
                    <td>{serviceLabel(rr.episode?.service_type)}</td>
                    <td>{rr.requested_by?.full_name}</td>
                    <td style={{ maxWidth: 200 }}>
                      <span title={rr.reason}>
                        {rr.reason.length > 60 ? rr.reason.substring(0, 60) + '…' : rr.reason}
                      </span>
                    </td>
                    <td>{formatDate(rr.created_at)}</td>
                    <td>
                      <Link to={`/admin/reassignments`} className="btn btn-secondary btn-sm">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {unpaid_patients.length === 0 && unassigned_episodes.length === 0 &&
       pending_reassignments.length === 0 && (
        <div className="card">
          <div className="empty-state">
            ✓ All caught up — no immediate actions required.
          </div>
        </div>
      )}

      {confirmEpisode && (
        <ConfirmModal
          title="Confirm Episode Completion"
          message={`Mark this episode as completed? This will allow the next queued service for ${confirmEpisode.patient?.child_name} to become assignable.`}
          onConfirm={handleConfirmComplete}
          onCancel={() => setConfirmEpisode(null)}
          confirmLabel="Confirm Completion"
        />
      )}
    </div>
  );
}
