from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load env vars immediately
load_dotenv()

from contextlib import asynccontextmanager
from database import engine, Base
from routers import auth_router, api_router, websocket_router, room_router, message_router, file_router, sync_router, friend_router, notification_router, health
from middleware import TimeoutMiddleware, CorrelationIDMiddleware, RequestLoggingMiddleware
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Check if we should reset the database
    # Robust check for true/True/TRUE/1/yes
    reset_db_val = str(os.getenv("RESET_DB", "False")).lower()
    should_reset = reset_db_val in ("true", "1", "yes", "on")
    
    if should_reset:
        print(f"⚠️ RESETTING DATABASE (RESET_DB={os.getenv('RESET_DB')}) ⚠️")
        try:
            # Force disconnect other clients (PostgreSQL specific)
            # This fixes "QueryCanceled" due to locks from other active sessions
            if "postgresql" in str(engine.url):
                try:
                    from sqlalchemy import text
                    with engine.connect() as conn:
                        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
                        print("Attempting to terminate other connections to release locks...")
                        conn.execute(text("""
                            SELECT pg_terminate_backend(pg_stat_activity.pid)
                            FROM pg_stat_activity
                            WHERE pg_stat_activity.datname = current_database()
                            AND pid <> pg_backend_pid();
                        """))
                        print("Active connections terminated.")
                except Exception as kill_err:
                    print(f"Warning: Could not kill external connections: {kill_err}")
            
            Base.metadata.drop_all(bind=engine)
            print("Database dropped successfully.")
            
            # Clean uploads directory
            if os.path.exists(UPLOAD_DIR):
                 print(f"🧹 Cleaning uploads directory: {UPLOAD_DIR}")
                 for filename in os.listdir(UPLOAD_DIR):
                     file_path = os.path.join(UPLOAD_DIR, filename)
                     try:
                         if os.path.isfile(file_path) or os.path.islink(file_path):
                             os.unlink(file_path)
                         elif os.path.isdir(file_path):
                             import shutil
                             shutil.rmtree(file_path)
                     except Exception as e:
                         print(f"Failed to delete {file_path}. Reason: {e}")

        except Exception as e:
            print(f"Error dropping database: {e}")

    # Create database tables if they don't exist - with retry logic for cold starts
    import asyncio
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            print(f"✓ Database initialized successfully")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⚠️ Database connection failed (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"   Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                print(f"❌ Database connection failed after {max_retries} attempts")
                raise
    
    # Initialize System Settings (Instance ID)
    from database import SessionLocal
    from models import SystemSetting
    import uuid
    
    db = SessionLocal()
    try:
        instance_id_setting = db.query(SystemSetting).filter(SystemSetting.key == "instance_id").first()
        if not instance_id_setting:
            new_id = str(uuid.uuid4())
            print(f"Generated new DB Instance ID: {new_id}")
            db.add(SystemSetting(key="instance_id", value=new_id))
            db.commit()
    except Exception as e:
        print(f"Error initializing system settings: {e}")
    finally:
        db.close()
        
    yield

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app = FastAPI(title="WebChat API", lifespan=lifespan)

# Mount static files - REPLACED WITH SMART SERVING
# app.mount("/media", StaticFiles(directory=UPLOAD_DIR), name="media")

@app.get("/media/{filename}")
async def serve_media(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # CASE 1: Client requested a .br file directly
    if filename.endswith(".br") and os.path.exists(file_path):
        import mimetypes
        original_filename = filename[:-3]
        media_type, _ = mimetypes.guess_type(original_filename)
        
        return FileResponse(
            file_path,
            media_type=media_type or "application/octet-stream",
            headers={"Content-Encoding": "br", "Content-Disposition": "inline"}
        )

    # CASE 2: Client requested original filename but we stored it as .br
    brotli_path = file_path + ".br"
    if os.path.exists(brotli_path):
        import mimetypes
        media_type, _ = mimetypes.guess_type(filename)
        
        return FileResponse(
            brotli_path, 
            media_type=media_type or "application/octet-stream",
            headers={"Content-Encoding": "br", "Content-Disposition": "inline"}
        )
    
    # CASE 3: Standard file
    if os.path.exists(file_path):
        return FileResponse(file_path, headers={"Content-Disposition": "inline"})
    
    return {"error": "File not found"}
# load_dotenv() - Moved to top
# CORS Configuration
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://web-chat-sandy-ten.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add middleware (order matters - last added runs first)
app.add_middleware(TimeoutMiddleware, timeout_seconds=30)
app.add_middleware(CorrelationIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# Include routers
app.include_router(health.router)
app.include_router(auth_router.router)
app.include_router(api_router.router)
app.include_router(friend_router.router)
app.include_router(room_router.router)
app.include_router(message_router.router)
app.include_router(file_router.router)
app.include_router(sync_router.router)
app.include_router(websocket_router.router)
app.include_router(notification_router.router)

@app.get("/")
async def root():
    return {"message": "WebChat API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
