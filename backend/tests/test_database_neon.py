import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.engine.url import make_url
from app.core.db_url import normalize_database_url, mask_database_url
from app.config import Settings
from app.core.database import Base, init_db
import app.models.relational  # Ensure all relational models are loaded


def test_standard_postgresql_url_normalization():
    """Verify standard postgresql:// and postgres:// URLs are converted to postgresql+asyncpg://."""
    url1 = "postgresql://test_user:test_password@localhost:5432/tierlens_db"
    normalized1 = normalize_database_url(url1, is_async=True)
    assert normalized1.startswith("postgresql+asyncpg://")
    parsed1 = make_url(normalized1)
    assert parsed1.username == "test_user"
    assert parsed1.password == "test_password"
    assert parsed1.host == "localhost"
    assert parsed1.port == 5432
    assert parsed1.database == "tierlens_db"

    url2 = "postgres://test_user:test_password@localhost:5432/tierlens_db"
    normalized2 = normalize_database_url(url2, is_async=True)
    assert normalized2.startswith("postgresql+asyncpg://")


def test_neon_url_normalization():
    """Verify Neon PostgreSQL URLs with sslmode=require and pooler/standard hostnames."""
    neon_url = "postgres://neon_user:neon_pass@ep-cool-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"
    normalized = normalize_database_url(neon_url, is_async=True)
    assert normalized.startswith("postgresql+asyncpg://")
    parsed = make_url(normalized)
    assert parsed.username == "neon_user"
    assert parsed.password == "neon_pass"
    assert parsed.host == "ep-cool-sample.us-east-2.aws.neon.tech"
    assert parsed.database == "neondb"
    # Must convert sslmode=require to ssl=require for asyncpg compatibility
    assert "ssl" in parsed.query
    assert parsed.query["ssl"] == "require"
    assert "sslmode" not in parsed.query


def test_already_normalized_async_url():
    """Verify an already normalized postgresql+asyncpg:// URL is safely preserved."""
    url = "postgresql+asyncpg://user:pass@localhost:5432/tierlens_db"
    normalized = normalize_database_url(url, is_async=True)
    assert normalized == url


def test_sync_url_conversion():
    """Verify sync URL normalization produces postgresql+psycopg2:// and retains sslmode."""
    raw_url = "postgres://neon_user:neon_pass@ep-cool.neon.tech/neondb?sslmode=require"
    sync_url = normalize_database_url(raw_url, is_async=False)
    assert sync_url.startswith("postgresql+psycopg2://")
    parsed = make_url(sync_url)
    assert parsed.drivername == "postgresql+psycopg2"
    assert parsed.query.get("sslmode") == "require"

    # Also check conversion when raw URL has ssl=require
    raw_url_ssl = "postgres://neon_user:neon_pass@ep-cool.neon.tech/neondb?ssl=require"
    sync_url_ssl = normalize_database_url(raw_url_ssl, is_async=False)
    assert sync_url_ssl.startswith("postgresql+psycopg2://")
    parsed_ssl = make_url(sync_url_ssl)
    assert parsed_ssl.query.get("sslmode") == "require"


def test_ssl_parameter_handling_and_filtering():
    """Verify asyncpg incompatible libpq query arguments are stripped and sslmode is mapped."""
    # channel_binding and gssencmode cause asyncpg.connect() to crash with TypeError
    raw = "postgres://u:p@host:5432/db?sslmode=require&channel_binding=require&gssencmode=disable"
    normalized = normalize_database_url(raw, is_async=True)
    parsed = make_url(normalized)
    assert parsed.query.get("ssl") == "require"
    assert "channel_binding" not in parsed.query
    assert "gssencmode" not in parsed.query
    assert "sslmode" not in parsed.query

    # When sslmode=disable, ssl should not be set
    raw_disabled = "postgres://u:p@host:5432/db?sslmode=disable"
    norm_disabled = normalize_database_url(raw_disabled, is_async=True)
    assert "ssl" not in make_url(norm_disabled).query


def test_credential_preservation_and_masking():
    """Verify special URL characters are preserved and credentials never leak in masked strings."""
    raw = "postgres://user%40domain.com:p%40ss%3Aword%21@db.host:5432/test_db?sslmode=require"
    normalized = normalize_database_url(raw, is_async=True)
    parsed = make_url(normalized)
    assert parsed.username == "user@domain.com"
    assert parsed.password == "p@ss:word!"

    masked = mask_database_url(normalized)
    assert "p@ss:word!" not in masked
    assert "***" in masked
    assert "user%40domain.com" in masked
    assert "db.host" in masked


def test_missing_database_url_handling():
    """Verify empty or None database URLs do not raise exceptions and return safe defaults."""
    assert normalize_database_url("", is_async=True) == ""
    assert normalize_database_url(None, is_async=True) == ""
    assert mask_database_url("") == "<not-configured>"
    assert mask_database_url(None) == "<not-configured>"
    assert mask_database_url("not an actual url ::::") == "<invalid-database-url>"


def test_production_mode_safety_and_sqlite_disabled():
    """Verify production settings disable SQLite fallback and enforce postgres_required mode."""
    prod_settings = Settings(
        ENVIRONMENT="production",
        DATABASE_URL="postgres://neon_user:fake_password@ep-cool.neon.tech/neondb?sslmode=require"
    )
    assert prod_settings.ENVIRONMENT == "production"
    assert prod_settings.DATABASE_MODE == "postgres_required"
    assert prod_settings.SQLITE_FALLBACK_ENABLED is False
    assert prod_settings.DATABASE_URL.startswith("postgresql+asyncpg://")
    assert prod_settings.SYNC_DATABASE_URL.startswith("postgresql+psycopg2://")
    # Verify masked output hides secrets
    masked = prod_settings.get_masked_database_url()
    assert "fake_password" not in masked
    assert "***" in masked


@pytest.mark.asyncio
async def test_database_table_initialization_all_entities():
    """Verify all 11 application tables are defined and registered on Base.metadata."""
    expected_tables = {
        "users",
        "workspaces",
        "projects",
        "application_versions",
        "device_profiles",
        "test_runs",
        "test_metrics",
        "test_failures",
        "test_artifacts",
        "recommendations",
        "audit_logs"
    }
    actual_tables = set(Base.metadata.tables.keys())
    assert expected_tables.issubset(actual_tables), f"Missing tables: {expected_tables - actual_tables}"

    # Verify table creation against an in-memory SQLite engine
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await test_engine.dispose()


def test_cors_origins_parsing():
    """Verify CORS_ORIGINS parses wildcard, comma-separated, and list formats without SettingsError."""
    import os
    os.environ["CORS_ORIGINS"] = "*"
    s1 = Settings()
    assert s1.CORS_ORIGINS == ["*"]

    os.environ["CORS_ORIGINS"] = "https://tierlens.vercel.app,http://localhost:3000"
    s2 = Settings()
    assert s2.CORS_ORIGINS == ["https://tierlens.vercel.app", "http://localhost:3000"]
    del os.environ["CORS_ORIGINS"]

