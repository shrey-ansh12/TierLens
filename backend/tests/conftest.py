import asyncio
import pytest
from app.core.database import init_db

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Initializes the database schema once before running tests."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(init_db())
    yield
    loop.close()
