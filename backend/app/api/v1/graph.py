from typing import Dict, Any
from fastapi import APIRouter
from app.core.neo4j_client import neo4j_manager
from app.models.graph.queries import get_project_graph

router = APIRouter(prefix="/graph", tags=["Neo4j Intelligence Graph"])

@router.get("/status")
async def get_graph_status():
    """Returns real-time Neo4j connection health and diagnostic details."""
    health = await neo4j_manager.check_health()
    return health

@router.get("/project/{project_id}")
async def get_intelligence_graph_for_project(project_id: str):
    """
    Fetches real Neo4j nodes and relationships.
    Strict Real Data Policy: If disconnected, returns connected: False. Never fabricates fake graph data.
    """
    data = await get_project_graph(project_id)
    return data
