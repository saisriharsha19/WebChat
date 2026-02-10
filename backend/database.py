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

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}

from sqlalchemy.pool import NullPool

engine_args = {
    "connect_args": connect_args
}

if "postgresql" in DATABASE_URL:
    # Use NullPool for PostgreSQL to work better with Supabase Transaction Pooler
    # This prevents the application from holding onto connections unnecessarily
    engine_args["poolclass"] = NullPool
    # keeping the connection alive
    engine_args["pool_pre_ping"] = True

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
    finally:
        db.close()
