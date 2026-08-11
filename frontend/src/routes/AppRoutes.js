import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/layout/Layout';

// Auth
import LoginPage from '../pages/LoginPage';

// Admin pages
import AdminDashboard from '../pages/admin/AdminDashboard';
import PatientList from '../pages/admin/PatientList';
import PatientFile from '../pages/admin/PatientFile';
import RegisterPatient from '../pages/admin/RegisterPatient';
import ReassignmentAdmin from '../pages/admin/ReassignmentAdmin';
import TherapistManagement from '../pages/admin/TherapistManagement';

// Therapist pages
import TherapistDashboard from '../pages/therapist/TherapistDashboard';
import TherapistPatientList from '../pages/therapist/TherapistPatientList';
import TherapistPatientFile from '../pages/therapist/TherapistPatientFile';
import NoteEntry from '../pages/therapist/NoteEntry';

// Print views (no layout wrapper — full-page print)
import { PrintSingleInvoice, PrintAllInvoices } from '../pages/print/PrintInvoice';
import PrintGuardianSummary from '../pages/print/PrintGuardianSummary';

function RequireAuth({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/therapist/dashboard'} replace />;
  }
  return children;
}

function AdminRoutes() {
  return (
    <RequireAuth role="admin">
      <Layout>
        <Routes>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/:patientId" element={<PatientFile />} />
          <Route path="register" element={<RegisterPatient />} />
          <Route path="reassignments" element={<ReassignmentAdmin />} />
          <Route path="therapists" element={<TherapistManagement />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Routes>
      </Layout>
    </RequireAuth>
  );
}

function TherapistRoutes() {
  return (
    <RequireAuth role="therapist">
      <Layout>
        <Routes>
          <Route path="dashboard" element={<TherapistDashboard />} />
          <Route path="patients" element={<TherapistPatientList />} />
          <Route path="patients/:patientId" element={<TherapistPatientFile />} />
          <Route path="episodes/:episodeId/notes/new" element={<NoteEntry />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Routes>
      </Layout>
    </RequireAuth>
  );
}

export default function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Print views — no authentication wrapper, but token required for API calls */}
      <Route path="/print/invoice/payment/:paymentId" element={<PrintSingleInvoice />} />
      <Route path="/print/invoice/:patientId" element={<PrintAllInvoices />} />
      <Route path="/print/guardian-summary/:patientId" element={<PrintGuardianSummary />} />

      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="/therapist/*" element={<TherapistRoutes />} />

      {/* Root redirect */}
      <Route
        path="/"
        element={
          user
            ? <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/therapist/dashboard'} replace />
            : <Navigate to="/login" replace />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
