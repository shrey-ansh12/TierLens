import logging
from typing import Optional
from sqlalchemy.engine.url import make_url, URL

logger = logging.getLogger(__name__)

def normalize_database_url(raw_url: Optional[str], is_async: bool = True) -> str:
    """
    Normalizes database connection URLs for Neon PostgreSQL or SQLite.
    
    Ensures:
    - postgres:// or postgresql:// are converted to postgresql+asyncpg:// for async
      or postgresql+psycopg2:// for sync.
    - asyncpg-compatible SSL parameter handling: converts sslmode=require to ssl=require
      and removes incompatible libpq-only parameters (channel_binding, gssencmode).
    - psycopg2-compatible SSL parameter handling: ensures sslmode=require is used.
    - Preserves URL-encoded credentials, hostname, port, database and query parameters.
    """
    if not raw_url or not str(raw_url).strip():
        return ""
    
    clean_url = str(raw_url).strip()
    try:
        url = make_url(clean_url)
    except Exception as e:
        logger.warning(f"Could not parse database URL for normalization: {e}")
        return clean_url

    driver = url.drivername.lower()
    query = dict(url.query)

    # SQLite normalization
    if "sqlite" in driver:
        if is_async:
            return url.set(drivername="sqlite+aiosqlite").render_as_string(hide_password=False)
        else:
            return url.set(drivername="sqlite").render_as_string(hide_password=False)

    # PostgreSQL normalization
    if is_async:
        target_driver = "postgresql+asyncpg"
        # asyncpg.connect() takes ssl, NOT sslmode keyword argument
        if "sslmode" in query:
            sslmode = str(query.pop("sslmode")).lower()
            if sslmode != "disable":
                query.setdefault("ssl", "require")
        # Remove libpq parameters that asyncpg.connect() rejects as unknown kwargs
        query.pop("channel_binding", None)
        query.pop("gssencmode", None)
    else:
        target_driver = "postgresql+psycopg2"
        # psycopg2/libpq expects sslmode, not ssl
        if "ssl" in query and "sslmode" not in query:
            ssl_val = str(query.pop("ssl")).lower()
            if ssl_val not in ("false", "0", "none", "disable"):
                query["sslmode"] = "require"

    normalized = url.set(drivername=target_driver, query=query)
    return normalized.render_as_string(hide_password=False)


def mask_database_url(url_str: Optional[str]) -> str:
    """
    Returns a safe representation of a database URL with passwords obscured.
    Never exposes credentials in logs, diagnostics, or error messages.
    """
    if not url_str or not str(url_str).strip():
        return "<not-configured>"
    try:
        url = make_url(str(url_str).strip())
        return url.render_as_string(hide_password=True)
    except Exception:
        return "<invalid-database-url>"
