"""
Application entry point.
DB tables are created on startup (suitable for SQLite dev; use Alembic for production migrations).
A SQLite trigger enforces the one-active-episode-per-patient rule at the DB layer.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import event, text

from app.database import Base, engine, SessionLocal
from app.models import User, UserRole, UserStatus
from app.security import hash_password

# Import all models so they are registered with Base before create_all
import app.models  # noqa: F401

from app.routers import auth, users, patients, episodes, notes, payments, reassignments, dashboard


def _install_active_episode_trigger():
    """
    SQLite trigger: BEFORE INSERT or UPDATE on patient_service_episodes,
    raise an error if the patient would end up with more than one episode
    in status 'active' or 'ready_to_close'.
    
    This is the database-layer enforcement of the single-active-episode rule.
    SQLAlchemy's event system runs this after table creation.
    """
    trigger_sql_insert = """
    CREATE TRIGGER IF NOT EXISTS trg_one_active_episode_insert
    BEFORE INSERT ON patient_service_episodes
    WHEN NEW.status IN ('active', 'ready_to_close')
    BEGIN
        SELECT RAISE(ABORT, 'Patient already has an active service episode')
        WHERE EXISTS (
            SELECT 1 FROM patient_service_episodes
            WHERE patient_id = NEW.patient_id
              AND status IN ('active', 'ready_to_close')
              AND id != NEW.id
        );
    END;
    """
    trigger_sql_update = """
    CREATE TRIGGER IF NOT EXISTS trg_one_active_episode_update
    BEFORE UPDATE ON patient_service_episodes
    WHEN NEW.status IN ('active', 'ready_to_close')
    BEGIN
        SELECT RAISE(ABORT, 'Patient already has an active service episode')
        WHERE EXISTS (
            SELECT 1 FROM patient_service_episodes
            WHERE patient_id = NEW.patient_id
              AND status IN ('active', 'ready_to_close')
              AND id != NEW.id
        );
    END;
    """
    with engine.connect() as conn:
        conn.execute(text(trigger_sql_insert))
        conn.execute(text(trigger_sql_update))
        conn.commit()


def _seed_default_admin():
    """Create a default admin account if no admin exists yet."""
    db = SessionLocal()
    try:
        admin_exists = db.query(User).filter(User.role == UserRole.admin).first()
        if not admin_exists:
            admin = User(
                full_name="System Admin",
                email="admin@clinic.local",
                hashed_password=hash_password("Admin1234!"),
                role=UserRole.admin,
                status=UserStatus.active,
            )
            db.add(admin)
            db.commit()
            print("Default admin created: admin@clinic.local / Admin1234!")
            print("  Change this password immediately after first login.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    _install_active_episode_trigger()
    _seed_default_admin()
    yield
    # Shutdown (nothing to teardown for SQLite)


app = FastAPI(
    title="Children's Therapy Center",
    description="Clinical documentation and patient-flow system",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(patients.router)
app.include_router(episodes.router)
app.include_router(notes.router)
app.include_router(payments.router)
app.include_router(reassignments.router)
app.include_router(dashboard.router)


@app.get("/health")
def health():
    return {"status": "ok"}
