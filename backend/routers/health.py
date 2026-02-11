"""
Health check endpoints for monitoring and observability
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
import os
import sys

from database import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Comprehensive health check endpoint
    Returns 200 if healthy, 503 if unhealthy
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {}
    }
    
    # Database connectivity check
    try:
        db.execute(text("SELECT 1"))
        health_status["checks"]["database"] = {
            "status": "healthy",
            "message": "Database connection successful"
        }
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "message": f"Database connection failed: {str(e)}"
        }
        return health_status, status.HTTP_503_SERVICE_UNAVAILABLE
    
    return health_status


@router.get("/version")
async def version_info():
    """
    Return backend version and build information
    """
    return {
        "version": os.getenv("APP_VERSION", "dev"),
        "build_time": os.getenv("BUILD_TIME", datetime.now(timezone.utc).isoformat()),
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.patch}",
        "environment": os.getenv("ENVIRONMENT", "development")
    }


@router.get("/metrics")
async def metrics():
    """
    Basic metrics endpoint for monitoring
    """
    import psutil
    
    return {
        "memory": {
            "total": psutil.virtual_memory().total,
            "available": psutil.virtual_memory().available,
            "percent": psutil.virtual_memory().percent
        },
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
