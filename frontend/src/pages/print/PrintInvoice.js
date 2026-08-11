/**
 * Printable invoice — usable at moment of payment or re-printed at any time.
 * Route: /print/invoice/payment/:paymentId  (single invoice)
 * Route: /print/invoice/:patientId          (all invoices for patient)
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPayment, getPayments, getPatient, getPatientEpisodes } from '../../api/endpoints';
import { Spinner, ErrorMsg } from '../../components/common/UI';
import { serviceLabel, formatDateTime, formatDate, formatCurrency } from '../../utils/helpers';

function InvoiceHeader({ patient }) {
  return (
    <div style={{ borderBottom: '2px solid #000', paddingBottom: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Children's Therapy Center</h1>
          <p style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            Receipt / Payment Invoice
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div>Date Printed: {formatDateTime(new Date().toISOString())}</div>
        </div>
      </div>
      {patient && (
        <div style={{ marginTop: 20, fontSize: 13 }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ paddingRight: 24, fontWeight: 600 }}>Patient:</td><td>{patient.child_name}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Date of Birth:</td><td>{formatDate(patient.date_of_birth)}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Guardian:</td><td>{patient.guardian_name} ({patient.guardian_relationship})</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Phone:</td><td>{patient.guardian_phone}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PrintSingleInvoice() {
  const { paymentId } = useParams();
  const [payment, setPayment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const pmRes = await getPayment(paymentId);
        setPayment(pmRes.data);
        const [ptRes, epRes] = await Promise.all([
          getPatient(pmRes.data.patient_id),
          getPatientEpisodes(pmRes.data.patient_id),
        ]);
        setPatient(ptRes.data);
        setEpisodes(epRes.data);
      } catch {
        setError('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };
    load().then(() => setTimeout(() => window.print(), 500));
  }, [paymentId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;

  const ep = episodes.find((e) => e.id === payment.episode_id);

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px', fontFamily: 'serif' }}>
      <InvoiceHeader patient={patient} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #aaa' }}>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Service</th>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Date</th>
            <th style={{ textAlign: 'right', padding: '8px 0' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px 0' }}>{ep ? serviceLabel(ep.service_type) : 'General'}</td>
            <td>{formatDate(payment.payment_date)}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(payment.amount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #000' }}>
            <td colSpan={2} style={{ padding: '10px 0', fontWeight: 700 }}>TOTAL PAID (Cash)</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(payment.amount)}</td>
          </tr>
        </tfoot>
      </table>
      <div style={{ marginTop: 24, fontSize: 12, color: '#555' }}>
        Recorded by: {payment.recorded_by?.full_name} on {formatDateTime(payment.payment_date)}<br />
        Receipt #: {payment.id} &nbsp;|&nbsp; Payment method: Cash<br />
        <br />
        This receipt is valid as proof of payment.
      </div>
    </div>
  );
}

export function PrintAllInvoices() {
  const { patientId } = useParams();
  const [payments, setPayments] = useState([]);
  const [patient, setPatient] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [ptRes, pmRes, epRes] = await Promise.all([
          getPatient(patientId),
          getPayments(patientId),
          getPatientEpisodes(patientId),
        ]);
        setPatient(ptRes.data);
        setPayments(pmRes.data);
        setEpisodes(epRes.data);
      } catch {
        setError('Failed to load invoices');
      } finally {
        setLoading(false);
      }
    };
    load().then(() => setTimeout(() => window.print(), 500));
  }, [patientId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;

  const total = payments.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px', fontFamily: 'serif' }}>
      <InvoiceHeader patient={patient} />
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>Complete Payment History</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #aaa' }}>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>#</th>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Service</th>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Recorded By</th>
            <th style={{ textAlign: 'right', padding: '8px 0' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((pm, i) => {
            const ep = episodes.find((e) => e.id === pm.episode_id);
            return (
              <tr key={pm.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 0' }}>{i + 1}</td>
                <td>{formatDate(pm.payment_date)}</td>
                <td>{ep ? serviceLabel(ep.service_type) : '—'}</td>
                <td>{pm.recorded_by?.full_name}</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(pm.amount)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #000' }}>
            <td colSpan={4} style={{ padding: '10px 0', fontWeight: 700 }}>TOTAL PAID</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
      <div style={{ marginTop: 24, fontSize: 12, color: '#555' }}>
        All payments are cash. Printed: {formatDateTime(new Date().toISOString())}
      </div>
    </div>
  );
}
