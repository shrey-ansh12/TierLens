from fastapi import APIRouter
from app.core.database import check_db_health
from app.core.neo4j_client import neo4j_manager
from app.core.redis_client import redis_manager
from app.engines.android.adb_client import adb_client

router = APIRouter(prefix="/system", tags=["System & Infrastructure Health"])

@router.get("/health")
async def get_system_health():
    db_health = await check_db_health()
    neo4j_health = await neo4j_manager.check_health()
    redis_health = await redis_manager.check_health()
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
