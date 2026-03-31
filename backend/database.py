from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./fuegopro.db"

# connect_args is SQLite-specific: allows the same connection to be used
# across threads (needed because FastAPI runs handlers in a thread pool)
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

# Enable foreign key enforcement — SQLite has it but it's off by default
@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Each request gets its own session, closed when the request is done
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All ORM models inherit from this base
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and ensures it is closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and seed default simulation config if not present."""
    from sqlalchemy import inspect, text
    from models.db_models import Base, SimulationConfig  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Migrate: add representative_returns column if it doesn't exist yet
    inspector = inspect(engine)
    existing_sim_cols = {c["name"] for c in inspector.get_columns("simulation_results")}
    if "representative_returns" not in existing_sim_cols:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE simulation_results ADD COLUMN representative_returns TEXT"
            ))
            conn.commit()

    # Migrate: add start_age column to accounts if it doesn't exist yet
    existing_acct_cols = {c["name"] for c in inspector.get_columns("accounts")}
    if "start_age" not in existing_acct_cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN start_age INTEGER"))
            conn.commit()

    # Seed the single simulation_config row if it doesn't exist yet;
    # migrate old default percentiles (10/90) to the new defaults (20/80).
    db = SessionLocal()
    try:
        cfg = db.query(SimulationConfig).filter_by(id=1).first()
        if not cfg:
            db.add(SimulationConfig(id=1, num_runs=1000, lower_percentile=20, upper_percentile=80))
            db.commit()
        elif cfg.lower_percentile == 10 and cfg.upper_percentile == 90:
            cfg.lower_percentile = 20
            cfg.upper_percentile = 80
            db.commit()
    finally:
        db.close()
