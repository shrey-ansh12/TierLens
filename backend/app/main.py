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
    await init_db()
    logger.info("Database schema initialized.")
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

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static Files for Artifacts
os.makedirs(settings.ARTIFACTS_DIR, exist_ok=True)
app.mount("/artifacts", StaticFiles(directory=settings.ARTIFACTS_DIR), name="artifacts")

# Register API Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
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
