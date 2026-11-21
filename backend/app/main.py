import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.database import init_db
from app.core.neo4j_client import neo4j_manager
from app.core.redis_client import redis_manager

from app.api.v1.auth import router as auth_router
from app.api.v1.projects import router as projects_router
from app.api.v1.device_profiles import router as device_profiles_router
from app.api.v1.tests_web import router as tests_web_router
from app.api.v1.tests_android import router as tests_android_router
from app.api.v1.comparisons import router as comparisons_router
from app.api.v1.graph import router as graph_router
from app.api.v1.rca import router as rca_router
from app.api.v1.system import router as system_router

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("tierlens")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting TierLens Platform...")

    # In production, validate PostgreSQL database connectivity before proceeding
    if settings.ENVIRONMENT == "production" or settings.DATABASE_MODE == "postgres_required":
        logger.info(f"Validating production PostgreSQL connectivity against: {settings.get_masked_database_url()}")
        try:
            from sqlalchemy import text
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            logger.info("Production PostgreSQL connectivity verified successfully.")
        except Exception as e:
            logger.error(f"Production database connectivity check failed: {e}")
            raise RuntimeError(
                f"Production database connection error: Unable to connect to PostgreSQL at "
                f"{settings.get_masked_database_url()}. Ensure DATABASE_URL is correct and the database is accessible."
            ) from e

    await init_db()
    logger.info("Database schema initialized.")

    # Reconcile any orphaned RUNNING test runs left by prior unexpected server shutdowns
    try:
        from app.models.relational.entities import TestRun, TestStatus
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import update
        async with AsyncSessionLocal() as session:
            stmt = (
                update(TestRun)
                .where(TestRun.status == TestStatus.RUNNING.value)
                .values(
                    status=TestStatus.FAILED.value,
                    failure_summary="Test interrupted by backend restart."
                )
            )
            await session.execute(stmt)
            await session.commit()
    except Exception as e:
        logger.warning(f"Startup zombie run reconciliation noticed: {e}")

    yield
    # Shutdown
    logger.info("Shutting down TierLens Platform...")
    await neo4j_manager.close()
    await redis_manager.close()

app = FastAPI(
    title="TierLens API",
    description="Application Performance & Device Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware - Support all origins securely with credentials by matching any http/https origin
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Strict OWASP ZAP compliant Security Headers Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' data:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)
# Static Files for Artifacts
os.makedirs(settings.ARTIFACTS_DIR, exist_ok=True)
app.mount("/artifacts", StaticFiles(directory=settings.ARTIFACTS_DIR), name="artifacts")

# Register API Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(device_profiles_router, prefix="/api/v1")
app.include_router(tests_web_router, prefix="/api/v1")
app.include_router(tests_android_router, prefix="/api/v1")
app.include_router(comparisons_router, prefix="/api/v1")
app.include_router(graph_router, prefix="/api/v1")
app.include_router(rca_router, prefix="/api/v1")
app.include_router(system_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {
        "platform": "TierLens Application Performance & Device Intelligence",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_url": "/api/v1/system/health"
    }

@app.get("/health")
async def health():
    return {"status": "ok", "service": "TierLens Backend"}
