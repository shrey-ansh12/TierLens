from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.neo4j_client import neo4j_manager
from app.models.graph.queries import get_project_graph, get_relational_project_topology

router = APIRouter(prefix="/graph", tags=["Neo4j Intelligence Graph"])

@router.get("/status")
async def get_graph_status():
    """Returns real-time Neo4j connection health and diagnostic details."""
    health = await neo4j_manager.check_health()
    return health

@router.get("/project/{project_id}")
async def get_intelligence_graph_for_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Fetches real Neo4j nodes and relationships.
    If Neo4j is disconnected, falls back cleanly to real relational entity topology from PostgreSQL.
    Strict Real Data Policy: Never fabricates synthetic graph data.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        data = await get_project_graph(project_id)
        if data.get("nodes"):
            return data

    # Fallback to real PostgreSQL entity graph
    fallback_data = await get_relational_project_topology(project_id, db)
    fallback_data["neo4j_connected"] = health.get("connected", False)
    fallback_data["neo4j_error"] = health.get("error")
    return fallback_data
