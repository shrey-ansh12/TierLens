import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.models.relational.entities import (
    User, Workspace, Project, DeviceProfile, TestRun, TestMetric,
    TestFailure, TestArtifact, Recommendation, TestStatus
)
from app.schemas.tests import WebTestSubmitRequest, TestRunResponse, DualComparisonResponse
from app.engines.web.runner import run_web_performance_test
from app.intelligence.rca_engine import generate_root_cause_analysis
from app.models.graph.queries import sync_run_to_neo4j

router = APIRouter(prefix="/tests/web", tags=["Website Performance Testing"])

async def execute_web_run_internal(
    target_url: str,
    tier_key: str,
    project_id: str,
    comparison_group_id: Optional[str],
    workspace_name: str,
    project_name: str,
    db: AsyncSession
) -> TestRun:
    """Helper that runs Playwright test, persists relational data, creates RCA, and syncs to Neo4j."""
    # Find or create device profile
    dp_res = await db.execute(select(DeviceProfile).where(DeviceProfile.tier == tier_key))
    profile = dp_res.scalars().first()
    profile_id = profile.id if profile else None

    # Create Initial Test Run Record
    test_run = TestRun(
        project_id=project_id,
        device_profile_id=profile_id,
        comparison_group_id=comparison_group_id,
        target_url=target_url,
        status=TestStatus.RUNNING.value,
        started_at=datetime.now(timezone.utc),
        is_synthetic=False
    )
    db.add(test_run)
    await db.commit()
    await db.refresh(test_run)

    # Execute Playwright Test
    result = await run_web_performance_test(
        target_url=target_url,
        profile_key=tier_key,
        test_run_id=test_run.id
    )

    # Update TestRun status & duration
    test_run.status = TestStatus.COMPLETED.value if result.success else TestStatus.FAILED.value
    test_run.duration_ms = result.duration_ms
    test_run.completed_at = datetime.now(timezone.utc)
    test_run.failure_count = len(result.failures)
    test_run.failure_summary = result.error_message or (f"{len(result.failures)} issue(s) detected" if result.failures else "Clean run")

    # Persist Metrics
    for m in result.metrics:
        db_metric = TestMetric(
            test_run_id=test_run.id,
            name=m["name"],
            value=m["value"],
            unit=m["unit"],
            rating=m["rating"],
            is_emulated=True,
            details=m["details"]
        )
        db.add(db_metric)

    # Persist Failures
    db_failures = []
    for f in result.failures:
        db_fail = TestFailure(
            test_run_id=test_run.id,
            failure_type=f["failure_type"],
            title=f["title"],
            message=f["message"],
            error_signature=f["error_signature"],
            component=f.get("component"),
            url_or_file=f.get("url_or_file"),
            screenshot_url=f.get("screenshot_url")
        )
        db.add(db_fail)
        db_failures.append(db_fail)

    # Persist Artifacts
    for a in result.artifacts:
        db_art = TestArtifact(
            test_run_id=test_run.id,
            artifact_type=a["artifact_type"],
            file_path=a["file_path"],
            file_size_bytes=a["file_size_bytes"],
            mime_type=a["mime_type"]
        )
        db.add(db_art)

    await db.flush()

    # Generate Root Cause Analysis & Recommendations
    rca_items = await generate_root_cause_analysis(
        metrics=result.metrics,
        failures=result.failures,
        tier=tier_key,
        project_name=project_name
    )

    for r in rca_items:
        db_rec = Recommendation(
            test_run_id=test_run.id,
            title=r["title"],
            category=r.get("category", "Performance"),
            impact=r.get("impact", "HIGH"),
            probable_cause=r["probable_cause"],
            supporting_evidence=r.get("supporting_evidence"),
            remediation=r["remediation"],
            verification_steps=r["verification_steps"],
            status="OPEN"
        )
        db.add(db_rec)

    await db.commit()

    # Sync into Neo4j Knowledge Graph
    await sync_run_to_neo4j(
        workspace_name=workspace_name,
        project_id=project_id,
        project_name=project_name,
        run_id=test_run.id,
        tier=tier_key,
        status=test_run.status,
        metrics=result.metrics,
        failures=result.failures,
        recommendations=rca_items
    )

    # Reload test run with eager relationships
    stmt = (
        select(TestRun)
        .where(TestRun.id == test_run.id)
        .options(
            selectinload(TestRun.metrics),
            selectinload(TestRun.failures),
            selectinload(TestRun.artifacts),
            selectinload(TestRun.recommendations),
            selectinload(TestRun.device_profile),
        )
    )
    reloaded = await db.execute(stmt)
    return reloaded.scalars().first()


@router.post("/run")
async def run_web_test(
    payload: WebTestSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify or obtain project
    ws_res = await db.execute(select(Workspace).where(Workspace.owner_id == current_user.id))
    ws = ws_res.scalars().first()
    ws_name = ws.name if ws else "Workspace"

    project = None
    if payload.project_id:
        p_res = await db.execute(select(Project).where(Project.id == payload.project_id))
        project = p_res.scalars().first()

    if not project:
        # Create an ad-hoc project for this URL test
        from urllib.parse import urlparse
        domain = urlparse(payload.target_url).hostname or "Web Project"
        project = Project(
            workspace_id=ws.id if ws else str(uuid.uuid4()),
            name=f"{domain}",
            type="WEB",
            target_url=payload.target_url
        )
        db.add(project)
        await db.flush()

    if payload.tier == "BOTH":
        comparison_group_id = str(uuid.uuid4())
        
        # 1. Run Good Budget
        run_gb = await execute_web_run_internal(
            target_url=payload.target_url,
            tier_key="GOOD_BUDGET",
            project_id=project.id,
            comparison_group_id=comparison_group_id,
            workspace_name=ws_name,
            project_name=project.name,
            db=db
        )

        # 2. Run Entry-Level
        run_el = await execute_web_run_internal(
            target_url=payload.target_url,
            tier_key="ENTRY_LEVEL",
            project_id=project.id,
            comparison_group_id=comparison_group_id,
            workspace_name=ws_name,
            project_name=project.name,
            db=db
        )

        return {
            "mode": "DUAL_COMPARISON",
            "comparison_group_id": comparison_group_id,
            "good_budget_run_id": run_gb.id,
            "entry_level_run_id": run_el.id,
            "message": "Dual device comparison test completed successfully."
        }
    else:
        # Single profile run
        run_single = await execute_web_run_internal(
            target_url=payload.target_url,
            tier_key=payload.tier,
            project_id=project.id,
            comparison_group_id=None,
            workspace_name=ws_name,
            project_name=project.name,
            db=db
        )
        return {
            "mode": "SINGLE_RUN",
            "test_run_id": run_single.id,
            "status": run_single.status,
            "message": f"Web performance test ({payload.tier}) completed."
        }
