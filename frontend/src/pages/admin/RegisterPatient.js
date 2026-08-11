import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPatient, createEpisode } from '../../api/endpoints';
import { ErrorMsg } from '../../components/common/UI';
import toast from 'react-hot-toast';

const SERVICE_OPTIONS = [
  { value: 'occupational_therapy', label: 'Occupational Therapy' },
  { value: 'speech_language', label: 'Speech & Language Therapy' },
  { value: 'physiotherapy', label: 'Physiotherapy' },
];

export default function RegisterPatient() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=patient details, 2=services
  const [patientId, setPatientId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    child_name: '',
    date_of_birth: '',
    guardian_name: '',
    guardian_relationship: '',
    guardian_phone: '',
  });

  const [services, setServices] = useState([
    { service_type: '', checked: false },
  ]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await createPatient({
        ...form,
        date_of_birth: new Date(form.date_of_birth).toISOString(),
      });
      setPatientId(res.data.id);
      setStep(2);
      toast.success('Patient registered. Now add service(s).');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const addServiceRow = () => setServices((s) => [...s, { service_type: '', checked: false }]);
  const removeService = (i) => setServices((s) => s.filter((_, idx) => idx !== i));
  const updateService = (i, field, value) =>
    setServices((s) => s.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const handleServicesSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const selected = services.filter((s) => s.service_type);
    if (selected.length === 0) {
      toast.error('Add at least one service');
      return;
    }
    // Check for duplicates
    const types = selected.map((s) => s.service_type);
    if (new Set(types).size !== types.length) {
      setError('Each service type can only be added once per patient.');
      return;
    }
    setLoading(true);
    try {
      for (let i = 0; i < selected.length; i++) {
        await createEpisode({
          patient_id: patientId,
          service_type: selected[i].service_type,
          sequence_order: i + 1,
        });
      }
      toast.success('Patient registered with service queue.');
      navigate(`/admin/patients/${patientId}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add services');
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Register Patient — Step 2 of 2</h1>
            <p className="page-subtitle">Add required services in priority order</p>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="alert alert-success">Patient details saved. Now add the service(s) needed.</div>
          <ErrorMsg message={error} />
          <form onSubmit={handleServicesSubmit}>
            {services.map((svc, i) => (
              <div key={i} className="flex gap-2 mb-1" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Service #{i + 1} {i === 0 && <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>(first / highest priority)</span>}</label>
                  <select
                    className="form-control"
                    value={svc.service_type}
                    onChange={(e) => updateService(i, 'service_type', e.target.value)}
                  >
                    <option value="">Select service…</option>
                    {SERVICE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {services.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    style={{ marginTop: 22 }}
                    onClick={() => removeService(i)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm mt-1" onClick={addServiceRow}>
              + Add Another Service
            </button>
            <div className="modal-footer" style={{ borderTop: 'none', marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Complete Registration →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Register Patient — Step 1 of 2</h1>
          <p className="page-subtitle">Patient and guardian details</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 600 }}>
        <ErrorMsg message={error} />
        <form onSubmit={handlePatientSubmit}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--color-muted)' }}>
            CHILD INFORMATION
          </h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Child's Full Name</label>
              <input className="form-control" value={form.child_name} onChange={update('child_name')} required />
            </div>
            <div className="form-group">
              <label className="form-label required">Date of Birth</label>
              <input type="date" className="form-control" value={form.date_of_birth} onChange={update('date_of_birth')} required />
            </div>
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 14px', color: 'var(--color-muted)' }}>
            GUARDIAN / RESPONSIBLE ADULT
          </h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Guardian's Full Name</label>
              <input className="form-control" value={form.guardian_name} onChange={update('guardian_name')} required />
            </div>
            <div className="form-group">
              <label className="form-label required">Relationship to Child</label>
              <select className="form-control" value={form.guardian_relationship} onChange={update('guardian_relationship')} required>
                <option value="">Select…</option>
                <option>Mother</option>
                <option>Father</option>
                <option>Grandparent</option>
                <option>Aunt/Uncle</option>
                <option>Legal Guardian</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Contact Phone Number</label>
            <input className="form-control" value={form.guardian_phone} onChange={update('guardian_phone')} required style={{ maxWidth: 260 }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Next: Add Services →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
