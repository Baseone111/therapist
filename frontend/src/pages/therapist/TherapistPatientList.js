import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPatients } from '../../api/endpoints';
import { Spinner, ErrorMsg, PatientStatusBadge } from '../../components/common/UI';
import { formatDate } from '../../utils/helpers';

export default function TherapistPatientList() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const res = await getPatients(params);
      setPatients(res.data);
    } catch {
      setError('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Patients</h1>
          <p className="page-subtitle">
            View any patient's full documentation timeline.
            You can only add notes to patients currently assigned to you.
          </p>
        </div>
      </div>

      <div className="card">
        <input
          type="search"
          className="form-control mb-2"
          placeholder="Search by name or guardian phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
        {error && <ErrorMsg message={error} />}
        {loading ? <Spinner /> : (
          patients.length === 0 ? (
            <div className="empty-state">
              {search ? 'No patients match your search.' : 'No patients found.'}
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Child's Name</th>
                    <th>Guardian</th>
                    <th>Phone</th>
                    <th>DOB</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.child_name}</strong></td>
                      <td>{p.guardian_name}</td>
                      <td>{p.guardian_phone}</td>
                      <td>{formatDate(p.date_of_birth)}</td>
                      <td><PatientStatusBadge status={p.status} /></td>
                      <td>
                        <Link to={`/therapist/patients/${p.id}`} className="btn btn-ghost btn-sm">
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
