import logging
from typing import Any, Dict, List, Optional
from neo4j import GraphDatabase, AsyncGraphDatabase, AsyncDriver
from app.config import settings

logger = logging.getLogger(__name__)

class Neo4jManager:
    def __init__(self):
        self._driver: Optional[AsyncDriver] = None
        self._connected: bool = False
        self._last_error: Optional[str] = None

    async def get_driver(self) -> Optional[AsyncDriver]:
        if self._driver is None:
            try:
                self._driver = AsyncGraphDatabase.driver(
                    settings.NEO4J_URI,
                    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                    connection_timeout=2.0,
                    max_connection_lifetime=300
                )
                # Verify connectivity
                await self._driver.verify_connectivity()
                self._connected = True
                self._last_error = None
                logger.info(f"Successfully connected to Neo4j at {settings.NEO4J_URI}")
            except Exception as e:
                self._connected = False
                self._last_error = str(e)
                logger.warning(f"Neo4j connection failed ({settings.NEO4J_URI}): {e}")
                self._driver = None
        return self._driver

    async def check_health(self) -> Dict[str, Any]:
        try:
            driver = await self.get_driver()
            if driver:
                await driver.verify_connectivity()
                return {
                    "status": "connected",
                    "uri": settings.NEO4J_URI,
                    "connected": True,
                    "error": None
                }
            return {
                "status": "disconnected",
                "uri": settings.NEO4J_URI,
                "connected": False,
                "error": self._last_error or "Neo4j connection could not be established"
            }
        except Exception as e:
            self._connected = False
            self._last_error = str(e)
            return {
                "status": "error",
                "uri": settings.NEO4J_URI,
                "connected": False,
                "error": str(e)
            }

    async def run_query(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        driver = await self.get_driver()
        if not driver:
            raise ConnectionError(f"Neo4j is currently disconnected: {self._last_error}")
        
        async with driver.session() as session:
            result = await session.run(query, parameters or {})
            records = await result.data()
            return records

    async def close(self):
        if self._driver:
            await self._driver.close()
            self._driver = None
            self._connected = False

neo4j_manager = Neo4jManager()
