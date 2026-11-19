import logging
from typing import Any, Dict, Optional
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger(__name__)

class RedisManager:
    def __init__(self):
        self._client: Optional[aioredis.Redis] = None
        self._connected: bool = False
        self._last_error: Optional[str] = None

    async def get_client(self) -> Optional[aioredis.Redis]:
        if self._client is None:
            try:
                self._client = aioredis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=2.0
                )
                await self._client.ping()
                self._connected = True
                self._last_error = None
            except Exception as e:
                self._connected = False
                self._last_error = str(e)
                logger.warning(f"Redis connection failed ({settings.REDIS_URL}): {e}")
                self._client = None
        return self._client

    async def check_health(self) -> Dict[str, Any]:
        try:
            client = await self.get_client()
            if client:
                await client.ping()
                return {
                    "status": "connected",
                    "url": settings.REDIS_URL,
                    "connected": True,
                    "error": None
                }
            return {
                "status": "disconnected",
                "url": settings.REDIS_URL,
                "connected": False,
                "error": self._last_error or "Redis is unreachable"
            }
        except Exception as e:
            self._connected = False
            self._last_error = str(e)
            return {
                "status": "error",
                "url": settings.REDIS_URL,
                "connected": False,
                "error": str(e)
            }

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None
            self._connected = False

redis_manager = RedisManager()
redis_client = redis_manager
