import os
from typing import List, Optional, Union, Any
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.core.db_url import normalize_database_url, mask_database_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
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
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def validate_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            clean = v.strip()
            if clean.startswith("[") and clean.endswith("]"):
                import json
                try:
                    return json.loads(clean)
                except Exception:
                    pass
            return [origin.strip() for origin in clean.split(",") if origin.strip()]
        if isinstance(v, (list, tuple)):
            return list(v)
        return ["*"]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: Optional[str]) -> str:
        return normalize_database_url(v, is_async=True)

    @field_validator("SYNC_DATABASE_URL", mode="before")
    @classmethod
    def validate_sync_database_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return normalize_database_url(v, is_async=False)

    @model_validator(mode="after")
    def validate_production_and_db_modes(self):
        # Automatically derive sync URL if not explicitly supplied
        if not self.SYNC_DATABASE_URL and self.DATABASE_URL:
            self.SYNC_DATABASE_URL = normalize_database_url(self.DATABASE_URL, is_async=False)

        # Enforce strict PostgreSQL in production; strictly forbid SQLite fallback
        if self.ENVIRONMENT == "production" or self.DATABASE_MODE == "postgres_required":
            self.SQLITE_FALLBACK_ENABLED = False
            if self.DATABASE_MODE == "auto":
                self.DATABASE_MODE = "postgres_required"
        return self

    def get_masked_database_url(self) -> str:
        return mask_database_url(self.DATABASE_URL)

    def get_masked_sync_database_url(self) -> str:
        return mask_database_url(self.SYNC_DATABASE_URL)


settings = Settings()

# Ensure artifacts directory exists
os.makedirs(settings.ARTIFACTS_DIR, exist_ok=True)
