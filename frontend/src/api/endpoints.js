import api from './client';

// Auth
export const login = (email, password) => {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);
  return api.post('/api/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

// Users / Therapists
export const getTherapists = (params) => api.get('/api/users/therapists', { params });
export const getUsers = (params) => api.get('/api/users', { params });
export const createUser = (data) => api.post('/api/users', data);
export const updateUser = (id, data) => api.patch(`/api/users/${id}`, data);

// Patients
export const getPatients = (params) => api.get('/api/patients', { params });
export const getPatient = (id) => api.get(`/api/patients/${id}`);
export const createPatient = (data) => api.post('/api/patients', data);
export const updatePatient = (id, data) => api.patch(`/api/patients/${id}`, data);

// Episodes
export const getPatientEpisodes = (patientId) => api.get(`/api/episodes/patient/${patientId}`);
export const createEpisode = (data) => api.post('/api/episodes', data);
export const assignEpisode = (episodeId, therapistId) =>
  api.post(`/api/episodes/${episodeId}/assign`, { therapist_id: therapistId });
export const markReadyToClose = (episodeId) =>
  api.post(`/api/episodes/${episodeId}/ready-to-close`);
export const confirmCompletion = (episodeId) =>
  api.post(`/api/episodes/${episodeId}/complete`);
export const getEpisode = (id) => api.get(`/api/episodes/${id}`);

// Notes
export const getNotes = (episodeId) => api.get(`/api/notes/episode/${episodeId}`);
export const createNote = (data) => api.post('/api/notes', data);
export const saveDraft = (noteId, data) => api.patch(`/api/notes/${noteId}/draft`, data);
export const commitNote = (noteId) => api.post(`/api/notes/${noteId}/commit`);
export const uploadAttachment = (noteId, file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/api/notes/${noteId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Payments
export const getPayments = (patientId) => api.get(`/api/payments/patient/${patientId}`);
export const getPayment = (id) => api.get(`/api/payments/${id}`);
export const recordPayment = (data) => api.post('/api/payments', data);

// Reassignments
export const getReassignments = (params) => api.get('/api/reassignments', { params });
export const requestReassignment = (data) => api.post('/api/reassignments', data);
export const reviewReassignment = (id, data) => api.post(`/api/reassignments/${id}/review`, data);

// Dashboards
export const getAdminDashboard = () => api.get('/api/dashboard/admin');
export const getTherapistDashboard = () => api.get('/api/dashboard/therapist');
