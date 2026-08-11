import React, { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser } from '../../api/endpoints';
import { Spinner, ErrorMsg, UserStatusBadge, Modal } from '../../components/common/UI';
import { serviceLabel } from '../../utils/helpers';
import toast from 'react-hot-toast';

const SERVICE_OPTIONS = [
  { value: 'occupational_therapy', label: 'Occupational Therapy' },
  { value: 'speech_language', label: 'Speech & Language Therapy' },
  { value: 'physiotherapy', label: 'Physiotherapy' },
];

export default function TherapistManagement() {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    full_name: '', email: '', password: '',
    service_type: '', role: 'therapist', status: 'active',
  });
  const [formError, setFormError] = useState('');
  const [working, setWorking] = useState(false);

  const load = async () => {
    try {
      const res = await getUsers({ role: 'therapist' });
      setTherapists(res.data);
    } catch {
      setError('Failed to load therapists');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setWorking(true);
    try {
      await createUser(form);
      toast.success('Therapist account created');
      setShowCreate(false);
      setForm({ full_name: '', email: '', password: '', service_type: '', role: 'therapist', status: 'active' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Creation failed');
    } finally {
      setWorking(false);
    }
  };

  const toggleStatus = async (t) => {
    const newStatus = t.status === 'active' ? 'on_leave' : 'active';
    try {
      await updateUser(t.id, { status: newStatus });
      toast.success(`${t.full_name} marked as ${newStatus === 'active' ? 'active' : 'on leave'}`);
      load();
    } catch {
      toast.error('Failed to update status');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Therapist Management</h1>
          <p className="page-subtitle">Manage therapist accounts and availability</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Add Therapist
        </button>
      </div>

      {error && <ErrorMsg message={error} />}

      <div className="card">
        {loading ? <Spinner /> : therapists.length === 0 ? (
          <div className="empty-state">No therapists registered yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {therapists.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.full_name}</strong></td>
                    <td>{t.email}</td>
                    <td>{t.service_type ? serviceLabel(t.service_type) : '—'}</td>
                    <td><UserStatusBadge status={t.status} /></td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleStatus(t)}
                      >
                        {t.status === 'active' ? 'Mark On Leave' : 'Mark Active'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <Modal
          title="Add Therapist Account"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={working}
              >
                {working ? 'Creating…' : 'Create Account'}
              </button>
            </>
          }
        >
          {formError && <ErrorMsg message={formError} />}
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label required">Full Name</label>
              <input
                className="form-control"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Email Address</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Initial Password (min 8 chars)</label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Primary Service</label>
              <select
                className="form-control"
                value={form.service_type}
                onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
                required
              >
                <option value="">Select service…</option>
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
