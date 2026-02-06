from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from contextlib import asynccontextmanager
from database import engine, Base
from routers import auth_router, api_router, websocket_router, room_router, message_router, file_router, sync_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create database tables if they don't exist
    Base.metadata.create_all(bind=engine)
    yield

from fastapi.staticfiles import StaticFiles
import os

# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app = FastAPI(title="WebChat API", lifespan=lifespan)

# Mount static files
app.mount("/media", StaticFiles(directory=UPLOAD_DIR), name="media")
load_dotenv()
# CORS Configuration
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(api_router.router)
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
