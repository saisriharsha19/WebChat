from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

from urllib.parse import quote_plus

DATABASE_URL = os.getenv("DATABASE_URL")

# Prioritize constructing URL from components if available
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_host = os.getenv("DB_HOST")
db_port = os.getenv("DB_PORT", "5432")
db_name = os.getenv("DB_NAME", "postgres")

if db_user and db_password and db_host:
    encoded_password = quote_plus(db_password)
    DATABASE_URL = f"postgresql://{db_user}:{encoded_password}@{db_host}:{db_port}/{db_name}"
elif not DATABASE_URL:
    DATABASE_URL = "sqlite:///./webchat.db"

# Fix dialect for SQLAlchemy (postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# FORCE Supabase Transaction Pooler (Port 6543) if using pooler hostname
# This fixes the "MaxClientsInSessionMode" error by using Transaction Mode
if "pooler.supabase.com" in DATABASE_URL and ":5432" in DATABASE_URL:
    print("⚠️ Detected Supabase Pooler on Port 5432 (Session Mode). Switching to Port 6543 (Transaction Mode) to avoid connection limits.")
    DATABASE_URL = DATABASE_URL.replace(":5432", ":6543")

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}

engine_args = {
    "connect_args": connect_args,
    "echo_pool": False,  # Set to True for debugging
}

if "postgresql" in DATABASE_URL:
    # Use QueuePool with proper limits for production reliability
    # This prevents connection exhaustion while maintaining good performance
    engine_args["pool_size"] = 5          # Base pool size
    engine_args["max_overflow"] = 10      # Extra connections when needed
    engine_args["pool_recycle"] = 300     # Recycle connections after 5 min (prevents SSL timeout)
    engine_args["pool_pre_ping"] = True   # Health check before using connection
    engine_args["pool_timeout"] = 30      # Wait max 30s for available connection
    engine_args["pool_use_lifo"] = True   # Use LIFO to recycle connections more frequently
    print(f"✓ Configured PostgreSQL connection pool: size=5, max_overflow=10, recycle=300s")

engine = create_engine(
    DATABASE_URL, **engine_args
)

# Enable foreign keys for SQLite
if "sqlite" in DATABASE_URL:
    from sqlalchemy import event
    def _fk_pragma_on_connect(dbapi_con, con_record):
        dbapi_con.execute('pragma foreign_keys=ON')
    event.listen(engine, 'connect', _fk_pragma_on_connect)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # Always rollback on error to prevent PendingRollbackError
        db.rollback()
        raise
    finally:
        db.close()
