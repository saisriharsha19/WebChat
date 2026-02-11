"""
Middleware for request timeout, logging, and error handling
"""
import time
import uuid
from typing import Callable
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import logging
import asyncio

logger = logging.getLogger(__name__)


class TimeoutMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce request timeouts"""
    
    def __init__(self, app: ASGIApp, timeout_seconds: int = 30):
        super().__init__(app)
        self.timeout_seconds = timeout_seconds
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout_seconds
            )
        except asyncio.TimeoutError:
            logger.error(f"Request timeout: {request.method} {request.url.path}")
            return JSONResponse(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                content={
                    "detail": f"Request timeout after {self.timeout_seconds} seconds",
                    "path": str(request.url.path)
                }
            )


class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """Add correlation ID to all requests for tracing"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        request.state.correlation_id = correlation_id
        
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with duration and status"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        correlation_id = getattr(request.state, "correlation_id", "unknown")
        
        # Don't log health checks to reduce noise
        if request.url.path in ["/health", "/api/version"]:
            return await call_next(request)
        
        logger.info(f"Request started: {request.method} {request.url.path} [CID: {correlation_id}]")
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            level = logging.WARNING if response.status_code >= 400 else logging.INFO
            logger.log(
                level,
                f"Request completed: {request.method} {request.url.path} "
                f"Status: {response.status_code} Duration: {duration:.2f}s [CID: {correlation_id}]"
            )
            
            return response
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"Request failed: {request.method} {request.url.path} "
                f"Error: {str(e)} Duration: {duration:.2f}s [CID: {correlation_id}]"
            )
            raise
