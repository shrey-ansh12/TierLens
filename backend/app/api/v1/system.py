from fastapi import APIRouter
from app.core.database import check_db_health
from app.core.neo4j_client import neo4j_manager
from app.core.redis_client import redis_manager
from app.engines.android.adb_client import adb_client

router = APIRouter(prefix="/system", tags=["System & Infrastructure Health"])

import asyncio

@router.get("/health")
async def get_system_health():
    results = await asyncio.gather(
        check_db_health(),
        neo4j_manager.check_health(),
        redis_manager.check_health(),
        return_exceptions=True
    )
    db_health = results[0] if not isinstance(results[0], Exception) else {"status": "error", "error": str(results[0])}
    neo4j_health = results[1] if not isinstance(results[1], Exception) else {"status": "error", "connected": False, "error": str(results[1])}
    redis_health = results[2] if not isinstance(results[2], Exception) else {"status": "disconnected", "connected": False, "error": str(results[2])}
    adb_info = adb_client.get_adb_info()

    return {
        "status": "healthy" if db_health.get("status") in ["connected", "connected_fallback"] else "degraded",
        "database": db_health,
        "neo4j": neo4j_health,
        "redis": redis_health,
        "android_adb": adb_info,
        "version": "1.0.0",
        "service": "TierLens Intelligence Platform"
    }
