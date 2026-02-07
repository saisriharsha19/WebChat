from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from contextlib import asynccontextmanager
from database import engine, Base
from routers import auth_router, api_router, websocket_router, room_router, message_router, file_router, sync_router, friend_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Check if we should reset the database
    if os.getenv("RESET_DB") == "True":
        print("⚠️ RESETTING DATABASE (RESET_DB=True) ⚠️")
        try:
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

    # Create database tables if they don't exist
    Base.metadata.create_all(bind=engine)
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
load_dotenv()
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

# Include routers
app.include_router(auth_router.router)
app.include_router(api_router.router)
app.include_router(friend_router.router)
app.include_router(room_router.router)
app.include_router(message_router.router)
app.include_router(file_router.router)
app.include_router(sync_router.router)
app.include_router(websocket_router.router)

@app.get("/")
async def root():
    return {"message": "WebChat API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
