import os
import asyncio
import pytest

# Ensure tests run with SQLite fallback
os.environ["DATABASE_MODE"] = "auto"
os.environ["SQLITE_FALLBACK_ENABLED"] = "true"

from app.core.database import init_db, check_db_health

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Initializes the database schema once before running tests."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(check_db_health())
    loop.run_until_complete(init_db())
    yield
    loop.close()
