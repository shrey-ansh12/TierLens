import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine, text
from app.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

# Determine active database URL (PostgreSQL by default, auto-fallback to SQLite if requested or on connection failure)
_active_async_url = settings.DATABASE_URL
_active_sync_url = settings.SYNC_DATABASE_URL
_using_fallback = False

def get_engine():
    global _active_async_url, _active_sync_url, _using_fallback
    try:
        # Test basic connection string configuration
        engine = create_async_engine(
            _active_async_url,
            echo=False,
            future=True,
            pool_pre_ping=True
        )
        return engine
    except Exception as e:
        if settings.SQLITE_FALLBACK_ENABLED:
            logger.warning(f"Failed to initialize async PostgreSQL engine ({e}). Falling back to SQLite: {settings.SQLITE_DATABASE_URL}")
            _active_async_url = settings.SQLITE_DATABASE_URL
            _active_sync_url = settings.SQLITE_SYNC_DATABASE_URL
            _using_fallback = True
            return create_async_engine(_active_async_url, echo=False, future=True)
        raise e

async_engine = get_engine()
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def check_db_health() -> dict:
    global _active_async_url, _using_fallback
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            val = result.scalar()
            return {
                "status": "connected",
                "database_type": "sqlite" if "sqlite" in _active_async_url else "postgresql",
                "is_fallback": _using_fallback,
                "ping": val == 1
            }
    except Exception as e:
        # Attempt fallback if not already on sqlite
        if settings.SQLITE_FALLBACK_ENABLED and not _using_fallback:
            try:
                logger.warning(f"PostgreSQL connection test failed ({e}). Switching to SQLite fallback...")
                _active_async_url = settings.SQLITE_DATABASE_URL
                _active_sync_url = settings.SQLITE_SYNC_DATABASE_URL
                _using_fallback = True
                new_engine = create_async_engine(_active_async_url, echo=False, future=True)
                AsyncSessionLocal.configure(bind=new_engine)
                # Initialize SQLite tables
                async with new_engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
                return {
                    "status": "connected_fallback",
                    "database_type": "sqlite",
                    "is_fallback": True,
                    "note": f"Primary PostgreSQL connection failed ({str(e)}). Switched to SQLite fallback."
                }
            except Exception as fe:
                return {
                    "status": "error",
                    "error": str(fe)
                }
        return {
            "status": "error",
            "error": str(e)
        }

async def init_db():
    """Initializes tables on startup if using SQLite or fresh db."""
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.warning(f"Auto init_db noticed: {e}")
