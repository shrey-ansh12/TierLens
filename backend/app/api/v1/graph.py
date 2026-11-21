from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.neo4j_client import neo4j_manager
from app.models.graph.queries import (
    get_project_graph,
    get_relational_project_topology,
    get_graph_stats,
    get_explorer_graph,
    get_failure_patterns,
    get_device_impact,
    get_root_cause_chains,
    get_historical_runs_graph,
    get_node_details,
    get_distinct_graph_projects
)

router = APIRouter(prefix="/graph", tags=["Neo4j Intelligence Graph"])


@router.get("/status")
async def get_graph_status():
    """Returns real-time Neo4j connection health and diagnostic details."""
    health = await neo4j_manager.check_health()
    return health


@router.get("/projects")
async def get_tested_graph_projects(db: AsyncSession = Depends(get_db)):
    """Returns distinct tested websites/projects stored in Neo4j knowledge graph."""
    return await get_distinct_graph_projects(db)


@router.get("/stats")
async def get_intelligence_stats(
    project_id: Optional[str] = Query(None, description="Optional project filter"),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns actual counts of Projects, Test Runs, Device Profiles, Metrics, Failures,
    Error Signatures, Root Causes, and Recommendations.
    Calculated from real database records (Neo4j Aura with PostgreSQL fallback).
    When project_id is provided, calculates strictly for that tested website.
    """
    stats = await get_graph_stats(db=db, project_id=project_id)
    return stats


@router.get("/explorer")
async def get_interactive_explorer_graph(
    project_id: Optional[str] = Query(None, description="Optional project filter"),
    node_type: Optional[str] = Query(None, description="Filter by node label, e.g. Failure, DeviceProfile"),
    search: Optional[str] = Query(None, description="Search query matching name, title, or signature"),
    limit: int = Query(150, ge=10, le=500),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns an interactive relationship graph for the Neo4j Intelligence Explorer.
    Features real nodes and edges, visual styles, and relationship labels.
    """
    graph_data = await get_explorer_graph(
        project_id=project_id,
        node_type=node_type,
        search=search,
        limit=limit,
        db=db
    )
    return graph_data


@router.get("/failure-patterns")
async def get_recurring_failure_patterns(
    project_id: Optional[str] = Query(None, description="Optional project filter"),
    db: AsyncSession = Depends(get_db)
):
    """
    Failure Pattern Explorer: Identifies repeated failure signatures across historical test runs,
    grouping failures by their error signature with frequency and affected environments.
    """
    patterns = await get_failure_patterns(db=db, project_id=project_id)
    return patterns


@router.get("/device-impact")
async def get_device_profile_impact(
    project_id: Optional[str] = Query(None, description="Optional project filter"),
    db: AsyncSession = Depends(get_db)
):
    """
    Device Impact Explorer: Evaluates how performance issues and failure distributions
    differ across device profiles (e.g., Sub-₹8,000 Budget vs Mid-Tier vs Flagship).
    """
    impact_data = await get_device_impact(db=db, project_id=project_id)
    return impact_data


@router.get("/root-causes")
async def get_root_cause_recommendations(
    project_id: Optional[str] = Query(None, description="Optional project filter"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Root Cause & Recommendation Explorer: Traces verified relationship chains:
    Project -> TestRun -> Failure -> ErrorSignature -> RootCause -> Recommendation
    """
    chains = await get_root_cause_chains(limit=limit, db=db, project_id=project_id)
    return chains


@router.get("/historical-runs")
async def get_historical_test_runs(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Historical Test Explorer: Allows users to browse previous test runs and explore
    their metrics, failures, and connected Neo4j knowledge nodes.
    """
    runs = await get_historical_runs_graph(
        project_id=project_id,
        status=status,
        limit=limit,
        db=db
    )
    return runs


@router.get("/node/{node_id}")
async def get_single_node_inspection(
    node_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Inspects a single node in depth, including all incoming/outgoing relationships
    and connected neighbor entities.
    """
    details = await get_node_details(node_id=node_id, db=db)
    return details


@router.get("/project/{project_id}")
async def get_intelligence_graph_for_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Fetches real Neo4j nodes and relationships for a specific project.
    Backwards-compatible endpoint for existing components.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        data = await get_project_graph(project_id)
        if data.get("nodes"):
            return data

    fallback_data = await get_relational_project_topology(project_id, db)
    fallback_data["neo4j_connected"] = health.get("connected", False)
    fallback_data["neo4j_error"] = health.get("error")
    return fallback_data
