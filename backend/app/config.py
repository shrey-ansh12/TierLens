import os
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "tierlens_super_secret_jwt_key_replace_in_production_2026_xyz"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # PostgreSQL
    POSTGRES_USER: str = "tierlens"
    POSTGRES_PASSWORD: str = "tierlens_secure_pass"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "tierlens_db"
    DATABASE_URL: str = "postgresql+asyncpg://tierlens:tierlens_secure_pass@localhost:5432/tierlens_db"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://tierlens:tierlens_secure_pass@localhost:5432/tierlens_db"

    # SQLite fallback & Database Mode
    # DATABASE_MODE options: "auto" (fallback to sqlite in dev), "postgres_required" (strict postgres, no fallback), "sqlite_only"
    DATABASE_MODE: str = "auto"
    SQLITE_FALLBACK_ENABLED: bool = True
    SQLITE_DATABASE_URL: str = "sqlite+aiosqlite:///./tierlens.db"
    SQLITE_SYNC_DATABASE_URL: str = "sqlite:///./tierlens.db"

    # Concurrency & Background Job Limits
    MAX_CONCURRENT_BROWSER_JOBS: int = 2
    WORKSPACE_MAX_ACTIVE_JOBS: int = 4
    WEB_TEST_TIMEOUT_SECONDS: int = 120
    JOB_POLL_INTERVAL_MS: int = 1500

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "tierlens_graph_pass"

    # Redis & Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # AI Providers
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    # Android SDK
    ANDROID_HOME: Optional[str] = None
    ADB_PATH: str = "adb"

    # File uploads & Artifacts
    ARTIFACTS_DIR: str = "./artifacts"
    MAX_UPLOAD_SIZE_MB: int = 150

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]


settings = Settings()

# Ensure artifacts directory exists
os.makedirs(settings.ARTIFACTS_DIR, exist_ok=True)
