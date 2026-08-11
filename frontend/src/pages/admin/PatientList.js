import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPatients } from '../../api/endpoints';
import { Spinner, ErrorMsg, PatientStatusBadge } from '../../components/common/UI';
import { formatDate } from '../../utils/helpers';

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await getPatients(params);
      setPatients(res.data);
    } catch {
      setError('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="page-subtitle">All registered patients</p>
        </div>
        <Link to="/admin/register" className="btn btn-primary">+ Register Patient</Link>
      </div>

      <div className="card">
        <div className="flex gap-2 mb-2" style={{ alignItems: 'center' }}>
          <input
            type="search"
            className="form-control"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ maxWidth: 160 }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="discharged">Discharged</option>
          </select>
        </div>

        {error && <ErrorMsg message={error} />}
        {loading ? <Spinner /> : (
          patients.length === 0 ? (
            <div className="empty-state">
              {search ? 'No patients match your search.' : 'No patients registered yet.'}
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Child's Name</th>
                    <th>Date of Birth</th>
                    <th>Guardian</th>
                    <th>Phone</th>
                    <th>Registered</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.child_name}</strong></td>
                      <td>{formatDate(p.date_of_birth)}</td>
                      <td>{p.guardian_name} ({p.guardian_relationship})</td>
                      <td>{p.guardian_phone}</td>
                      <td>{formatDate(p.registration_date)}</td>
                      <td><PatientStatusBadge status={p.status} /></td>
                      <td>
                        <Link to={`/admin/patients/${p.id}`} className="btn btn-ghost btn-sm">
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
