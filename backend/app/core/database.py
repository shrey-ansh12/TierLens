import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine, text, event
from app.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

def configure_sqlite_engine(engine):
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
    return engine

# Determine active database URL (PostgreSQL by default, auto-fallback to SQLite if requested or on connection failure)
_active_async_url = settings.DATABASE_URL
_active_sync_url = settings.SYNC_DATABASE_URL
_using_fallback = False

def get_engine():
    global _active_async_url, _active_sync_url, _using_fallback
    
    # 1. Explicit SQLite only mode
    if settings.DATABASE_MODE == "sqlite_only":
        logger.info(f"Using explicitly configured SQLite database: {settings.SQLITE_DATABASE_URL}")
        _active_async_url = settings.SQLITE_DATABASE_URL
        _active_sync_url = settings.SQLITE_SYNC_DATABASE_URL
        _using_fallback = True
        return configure_sqlite_engine(create_async_engine(
            _active_async_url,
            echo=False,
            future=True,
            connect_args={"timeout": 30.0}
        ))

    # 2. Strict PostgreSQL mode (Production)
    if settings.DATABASE_MODE == "postgres_required" or settings.ENVIRONMENT == "production":
        logger.info(f"Strict PostgreSQL mode enforced. Connecting to: {_active_async_url}")
        return create_async_engine(
            _active_async_url,
            echo=False,
            future=True,
            pool_pre_ping=True
        )

    # 3. Auto mode (Development fallback)
    try:
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
            return configure_sqlite_engine(create_async_engine(
                _active_async_url,
                echo=False,
                future=True,
                connect_args={"timeout": 30.0}
            ))
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
    global _active_async_url, _active_sync_url, _using_fallback, async_engine, AsyncSessionLocal
    fallback_allowed = (
        settings.SQLITE_FALLBACK_ENABLED 
        and not _using_fallback 
        and settings.DATABASE_MODE != "postgres_required" 
        and settings.ENVIRONMENT != "production"
    )
    try:
        async with AsyncSessionLocal() as session:
            yield session
    except Exception as e:
        if fallback_allowed:
            logger.warning(f"Database session connection failed ({e}). Switching to SQLite fallback...")
            _active_async_url = settings.SQLITE_DATABASE_URL
            _active_sync_url = settings.SQLITE_SYNC_DATABASE_URL
            _using_fallback = True
            async_engine = configure_sqlite_engine(create_async_engine(_active_async_url, echo=False, future=True, connect_args={"timeout": 30.0}))
            AsyncSessionLocal.configure(bind=async_engine)
            async with async_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            async with AsyncSessionLocal() as fallback_session:
                yield fallback_session
        else:
            raise e

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
        # Check if fallback is permitted
        fallback_allowed = (
            settings.SQLITE_FALLBACK_ENABLED 
            and not _using_fallback 
            and settings.DATABASE_MODE != "postgres_required" 
            and settings.ENVIRONMENT != "production"
        )
        if fallback_allowed:
            try:
                logger.warning(f"PostgreSQL connection test failed ({e}). Switching to SQLite fallback...")
                _active_async_url = settings.SQLITE_DATABASE_URL
                _active_sync_url = settings.SQLITE_SYNC_DATABASE_URL
                _using_fallback = True
                new_engine = configure_sqlite_engine(create_async_engine(_active_async_url, echo=False, future=True, connect_args={"timeout": 30.0}))
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
            "database_type": "postgresql" if "postgresql" in _active_async_url else "sqlite",
            "error": str(e),
            "fallback_blocked": settings.DATABASE_MODE == "postgres_required" or settings.ENVIRONMENT == "production"
        }

async def init_db():
    """Initializes tables on startup if using SQLite or fresh db."""
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.warning(f"Auto init_db noticed: {e}")
