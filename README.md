# Children's Therapy Center — Clinical System

A lean clinical documentation and patient-flow system for a children's therapy center.

## Quick Start

### Backend (FastAPI)

```bash
cd backend
.\venv\Scripts\activate   # Windows
pip install -r requirements.txt  # if not already done
uvicorn app.main:app --reload --port 8000
```

**Default admin credentials (change on first login):**
- Email: `admin@clinic.local`
- Password: `Admin1234!`

### Frontend (React)

```bash
cd frontend
npm start
```

App runs at http://localhost:3000

---

## Architecture

```
backend/
  app/
    main.py          — FastAPI app, DB init, SQLite trigger install
    database.py      — SQLAlchemy engine + session
    models.py        — All ORM models with full enum state machines
    schemas.py       — Pydantic request/response schemas
    security.py      — JWT + bcrypt
    dependencies.py  — Auth dependencies & role guards
    services.py      — Business logic helpers
    routers/
      auth.py        — Login, /me
      users.py       — User/therapist management + workload query
      patients.py    — Patient CRUD + search
      episodes.py    — Episode lifecycle (queued→active→ready_to_close→completed)
      notes.py       — Append-only documentation notes + file upload
      payments.py    — Cash payment recording
      reassignments.py — Reassignment request workflow
      dashboard.py   — Aggregated dashboard views

frontend/src/
  api/               — Axios client + all endpoint functions
  context/           — Auth context (JWT storage)
  styles/            — Global clinical CSS
  utils/             — Date/format helpers
  components/
    common/UI.js     — Modal, Spinner, Badges, ConfirmModal
    layout/Layout.js — Sidebar + main area
  pages/
    LoginPage.js
    admin/
      AdminDashboard.js    — "Needs action today" stats + tables
      PatientList.js       — Search + list
      PatientFile.js       — Full patient record + episode timeline + payments
      RegisterPatient.js   — 2-step registration wizard
      ReassignmentAdmin.js — Review queue
      TherapistManagement.js
    therapist/
      TherapistDashboard.js    — New assignments + active patients
      TherapistPatientList.js  — View all patients
      TherapistPatientFile.js  — Episode view + request reassignment
      NoteEntry.js             — Structured note entry with autosave
    print/
      PrintInvoice.js          — Single or all invoices (re-printable any time)
      PrintGuardianSummary.js  — Plain-language family summary (never shows clinical notes)
  routes/AppRoutes.js
```

---

## Critical Business Rules Enforced

| Rule | Where enforced |
|------|---------------|
| One active episode per patient at a time | SQLite TRIGGER (DB layer) + app-layer check |
| Notes are append-only once committed | API rejects PATCH on committed notes |
| Reassignment reason non-empty | DB CHECK constraint + Pydantic validator |
| On-leave therapists not assignable | API + assignment dropdown filter |
| Therapist can only write notes for assigned episodes | API write guard |
| Guardian summary never auto-derived from clinical note | Separate DB fields; print view explicitly shows "none written" |
| Every write is attributed (who + when) | `created_by_id + created_at` on all clinical entities |
| Audit log for all significant actions | AuditLog table, written in every mutation |

---

## Print Views

- **Invoice (single):** `/print/invoice/payment/:paymentId`
- **Invoice (all for patient):** `/print/invoice/:patientId`
- **Guardian summary:** `/print/guardian-summary/:patientId`

Print views auto-trigger `window.print()` on load.
