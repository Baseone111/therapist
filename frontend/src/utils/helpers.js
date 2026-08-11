import React from 'react';
import { format } from 'date-fns';

export function formatDate(dt) {
  if (!dt) return '—';
  return format(new Date(dt), 'dd MMM yyyy');
}

export function formatDateTime(dt) {
  if (!dt) return '—';
  return format(new Date(dt), 'dd MMM yyyy, HH:mm');
}

export function formatCurrency(cents) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

export function serviceLabel(type) {
  const map = {
    occupational_therapy: 'Occupational Therapy',
    speech_language: 'Speech & Language',
    physiotherapy: 'Physiotherapy',
  };
  return map[type] || type;
}

export function statusLabel(status) {
  const map = {
    queued: 'Queued',
    active: 'Active',
    ready_to_close: 'Ready to Close',
    completed: 'Completed',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    active_user: 'Active',
    on_leave: 'On Leave',
    discharged: 'Discharged',
  };
  return map[status] || status;
}

export function episodeBadgeClass(status) {
  const map = {
    queued: 'badge-queued',
    active: 'badge-active',
    ready_to_close: 'badge-ready',
    completed: 'badge-completed',
  };
  return `badge ${map[status] || 'badge-completed'}`;
}

export function reassignmentBadgeClass(status) {
  const map = {
    pending: 'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
  };
  return `badge ${map[status] || ''}`;
}

export function ProgressDots({ value }) {
  return (
    <div className="progress-dots" title={`Progress: ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`progress-dot ${i <= value ? 'filled' : ''}`} />
      ))}
    </div>
  );
}
