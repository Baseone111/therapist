import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTherapistDashboard } from '../../api/endpoints';
import { Spinner, ErrorMsg, EpisodeStatusBadge } from '../../components/common/UI';
import { serviceLabel, formatDate } from '../../utils/helpers';

export default function TherapistDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getTherapistDashboard()
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;

  const { newly_assigned, pending_reassignment_requests, my_active_episodes } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Dashboard</h1>
          <p className="page-subtitle">What needs your attention</p>
        </div>
      </div>

      {/* New assignments — front-and-center notification */}
      {newly_assigned.length > 0 && (
        <div className="alert alert-info" style={{ fontSize: 14, marginBottom: 24 }}>
          <strong>🔔 New Patient{newly_assigned.length > 1 ? 's' : ''} Assigned to You</strong>
          <div style={{ marginTop: 8 }}>
            {newly_assigned.map((ep) => (
              <div key={ep.id} style={{ marginTop: 4 }}>
                <strong>{ep.patient?.child_name}</strong> — {serviceLabel(ep.service_type)}{' '}
                <Link to={`/therapist/patients/${ep.patient_id}`} className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }}>
                  Open Patient →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending reassignment requests */}
      {pending_reassignment_requests.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 24 }}>
          <strong>⏳ Pending Reassignment Request{pending_reassignment_requests.length > 1 ? 's' : ''}</strong>
          <div style={{ marginTop: 8 }}>
            {pending_reassignment_requests.map((rr) => (
              <div key={rr.id} style={{ marginTop: 4 }}>
                <strong>{rr.episode?.patient?.child_name}</strong> —{' '}
                {serviceLabel(rr.episode?.service_type)}{' '}
                <span className="text-sm text-muted">(submitted {formatDate(rr.created_at)})</span>
                <br />
                <span style={{ fontSize: 12.5 }}>
                  You retain full treatment rights while this is pending admin review.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My active episodes */}
      <div className="card">
        <div className="card-title">My Active Patients</div>
        {my_active_episodes.length === 0 ? (
          <div className="empty-state">No active patients assigned.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {my_active_episodes.map((ep) => (
                  <tr key={ep.id}>
                    <td><strong>{ep.patient?.child_name}</strong></td>
                    <td>{serviceLabel(ep.service_type)}</td>
                    <td><EpisodeStatusBadge status={ep.status} /></td>
                    <td>{formatDate(ep.started_at)}</td>
                    <td>
                      <Link to={`/therapist/patients/${ep.patient_id}`} className="btn btn-ghost btn-sm">
                        View Patient →
                      </Link>
                      <Link to={`/therapist/episodes/${ep.id}/notes/new`} className="btn btn-primary btn-sm" style={{ marginLeft: 6 }}>
                        + Add Note
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
