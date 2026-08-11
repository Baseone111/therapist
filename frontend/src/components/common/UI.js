import React, { useState } from 'react';

export function Modal({ title, children, onClose, footer }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex-between mb-2">
          <h2 className="modal-title" style={{ marginBottom: 0 }}>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
      Loading…
    </div>
  );
}

export function ErrorMsg({ message }) {
  if (!message) return null;
  return <div className="alert alert-danger">{message}</div>;
}

export function EpisodeStatusBadge({ status }) {
  const cls = {
    queued: 'badge-queued',
    active: 'badge-active',
    ready_to_close: 'badge-ready',
    completed: 'badge-completed',
  };
  const label = {
    queued: 'Queued',
    active: 'Active',
    ready_to_close: 'Ready to Close',
    completed: 'Completed',
  };
  return <span className={`badge ${cls[status] || ''}`}>{label[status] || status}</span>;
}

export function UserStatusBadge({ status }) {
  return (
    <span className={`badge ${status === 'active' ? 'badge-active' : 'badge-on-leave'}`}>
      {status === 'active' ? 'Active' : 'On Leave'}
    </span>
  );
}

export function PatientStatusBadge({ status }) {
  return (
    <span className={`badge ${status === 'active' ? 'badge-active' : 'badge-discharged'}`}>
      {status === 'active' ? 'Active' : 'Discharged'}
    </span>
  );
}

export function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };

  return (
    <Modal title={title} onClose={onCancel} footer={
      <>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </>
    }>
      <p style={{ color: 'var(--color-text)', lineHeight: 1.7 }}>{message}</p>
    </Modal>
  );
}
