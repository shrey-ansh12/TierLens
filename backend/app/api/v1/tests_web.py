import uuid
import asyncio
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db, AsyncSessionLocal
from app.api.v1.auth import get_current_user, get_user_workspace
from app.models.relational.entities import (
    User, Workspace, Project, DeviceProfile, TestRun, TestMetric,
    TestFailure, TestArtifact, Recommendation, TestStatus
)
from app.schemas.tests import WebTestSubmitRequest, TestRunResponse, DualComparisonResponse
from app.core.concurrency import concurrency_manager
from app.workers.job_store import job_store, JobState, JobStatusResponse
from app.workers.tasks import orchestrate_web_test_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tests/web", tags=["Website Performance Testing"])


@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def queue_web_test(
    payload: WebTestSubmitRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a website performance test for in-process asynchronous execution.
    Returns HTTP 202 Accepted immediately with a unique job_id and status polling URL.
    """
    # 1. Resolve workspace strictly from authenticated user (never trusted from frontend)
    ws = await get_user_workspace(current_user, db)
    workspace_id = ws.id
    workspace_name = ws.name

    # 2. Generate unique job ID upfront
    job_id = f"job_web_{uuid.uuid4().hex[:12]}"

    # 3. Atomically check quota and reserve slot (prevents TOCTOU race conditions)
    reserved = await concurrency_manager.try_reserve_workspace_slot(workspace_id, job_id, payload.target_url)
    if not reserved:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Workspace active job quota reached (maximum 4 concurrent jobs). Please wait for active tests to complete.",
            headers={"Retry-After": "15"}
        )

    # 4. Resolve or create project within the user's workspace
    try:
        project = None
        if payload.project_id:
            p_res = await db.execute(
                select(Project).where(Project.id == payload.project_id, Project.workspace_id == workspace_id)
            )
            project = p_res.scalars().first()

        if not project:
            from urllib.parse import urlparse
            domain = urlparse(payload.target_url).hostname or "Web Project"
            # Check if project already exists for this domain or target_url
            p_res = await db.execute(
                select(Project).where(
                    Project.workspace_id == workspace_id,
                    (Project.target_url == payload.target_url) | (Project.name == domain)
                )
            )
            project = p_res.scalars().first()

        if not project:
            from urllib.parse import urlparse
            domain = urlparse(payload.target_url).hostname or "Web Project"
            project = Project(
                workspace_id=workspace_id,
                name=f"{domain}",
                type="WEB",
                target_url=payload.target_url
            )
            db.add(project)
            await db.commit()
            await db.refresh(project)

        project_id = project.id
        project_name = project.name

        # Determine execution mode based on configuration selection
        if payload.device_profile_ids and len(payload.device_profile_ids) > 1:
            mode = "MULTI_COMPARISON"
            tier_label = f"{len(payload.device_profile_ids)} Devices"
        elif payload.custom_profiles and len(payload.custom_profiles) > 1:
            mode = "MULTI_COMPARISON"
            tier_label = f"{len(payload.custom_profiles)} Custom Devices"
        elif payload.tier == "BOTH":
            mode = "DUAL_COMPARISON"
            tier_label = "BOTH"
        else:
            mode = "SINGLE_RUN"
            tier_label = payload.tier or (payload.device_profile_ids[0] if payload.device_profile_ids else "CUSTOM")

        # 5. Register in job store
        await job_store.create_job(
            job_id=job_id,
            target_url=payload.target_url,
            tier=tier_label,
            mode=mode,
            workspace_id=workspace_id,
            project_id=project_id
        )

        # 6. Dispatch via in-process asyncio task with task handle registration for clean preemption
        task = asyncio.create_task(
            orchestrate_web_test_job(
                job_id=job_id,
                target_url=payload.target_url,
                tier=payload.tier or "GOOD_BUDGET",
                mode=mode,
                project_id=project_id,
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                project_name=project_name,
                device_profile_ids=payload.device_profile_ids,
                custom_profiles=payload.custom_profiles
            )
        )
        job_store.register_active_task(job_id, task)
    except Exception as exc:
        await concurrency_manager.release_workspace_slot(workspace_id, job_id, payload.target_url)
        raise exc

    response.status_code = status.HTTP_202_ACCEPTED
    return {
        "job_id": job_id,
        "status": JobState.QUEUED.value,
        "stage": "Queue Dispatch",
        "target_url": payload.target_url,
        "tier": tier_label,
        "mode": mode,
        "workspace_id": workspace_id,
        "poll_url": f"/api/v1/tests/web/jobs/{job_id}",
        "message": "Web performance test accepted and queued for background execution."
    }


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_web_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns real-time execution status for a test job.
    Strictly verifies workspace ownership to prevent cross-workspace data leakage.
    """
    record = await job_store.get_job(job_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found."
        )

    # Multi-tenant security check
    ws = await get_user_workspace(current_user, db)
    if record.get("workspace_id") and record["workspace_id"] != ws.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not have permission to view this job."
        )

    # Dynamically load comparison or single run payload if completed and missing from in-memory record
    comp_data = record.get("comparison_data")
    comp_id = record.get("comparison_group_id")
    if not comp_data and comp_id:
        from app.api.v1.comparisons import build_comparison_payload
        comp_data = await build_comparison_payload(comp_id, db)

    single_data = record.get("single_run_data")
    test_run_id = record.get("test_run_id")
    if not single_data and test_run_id:
        from app.api.v1.comparisons import serialize_test_run
        stmt = select(TestRun).where(TestRun.id == test_run_id).options(
            selectinload(TestRun.metrics),
            selectinload(TestRun.failures),
            selectinload(TestRun.artifacts),
            selectinload(TestRun.recommendations),
            selectinload(TestRun.device_profile)
        )
        s_res = await db.execute(stmt)
        s_run = s_res.scalars().first()
        if s_run:
            single_data = serialize_test_run(s_run)

    # Resolve metrics_summary from record, current_metrics, single_run_data, or comparison_data
    resolved_metrics_summary = record.get("metrics_summary") or {}
    if not resolved_metrics_summary:
        if record.get("current_metrics"):
            resolved_metrics_summary = record["current_metrics"]
        elif single_data and single_data.get("metrics"):
            resolved_metrics_summary = {m["name"]: m["value"] for m in single_data["metrics"]}
        elif comp_data:
            gb_metrics = comp_data.get("good_budget", {}).get("metrics") or []
            for m in gb_metrics:
                resolved_metrics_summary[m["name"]] = m["value"]
            if not resolved_metrics_summary and comp_data.get("runs") and len(comp_data["runs"]) > 0:
                for m in comp_data["runs"][0].get("metrics", []):
                    resolved_metrics_summary[m["name"]] = m["value"]
            if not resolved_metrics_summary and comp_data.get("configurations"):
                for m in comp_data["configurations"][0].get("metrics", []):
                    resolved_metrics_summary[m["name"]] = m["value"]

    return JobStatusResponse(
        job_id=record["job_id"],
        status=record["status"],
        stage=record["stage"],
        progress_message=record["progress_message"],
        target_url=record["target_url"],
        tier=record["tier"],
        mode=record["mode"],
        workspace_id=record.get("workspace_id"),
        created_at=record["created_at"],
        started_at=record.get("started_at"),
        completed_at=record.get("completed_at"),
        duration_ms=record.get("duration_ms"),
        error=record.get("error"),
        error_category=record.get("error_category"),
        error_details=record.get("error_details"),
        final_url=record.get("final_url"),
        redirect_count=record.get("redirect_count", 0),
        metrics_summary=resolved_metrics_summary,
        comparison_group_id=comp_id,
        good_budget_run_id=record.get("good_budget_run_id"),
        entry_level_run_id=record.get("entry_level_run_id"),
        test_run_id=test_run_id,
        comparison_data=comp_data,
        single_run_data=single_data,
        recommendations=record.get("recommendations") or (comp_data.get("recommendations") if comp_data else None),
        stage_id=record.get("stage_id", 1),
        stage_name=record.get("stage_name", record.get("stage")),
        logs=record.get("logs", []),
        current_metrics=record.get("current_metrics", {})
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_web_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancels an active or queued background test job.
    Pre-emptively aborts running Playwright processes and verifies workspace ownership.
    """
    record = await job_store.get_job(job_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found."
        )

    # Multi-tenant authorization check
    ws = await get_user_workspace(current_user, db)
    if record.get("workspace_id") and record["workspace_id"] != ws.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot cancel jobs belonging to another workspace."
        )

    cancelled = await job_store.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job cannot be cancelled (it may have already completed or failed)."
        )
    await concurrency_manager.release_workspace_slot(ws.id, job_id)
    return {
        "job_id": job_id,
        "status": "CANCELLED",
        "message": "Job cancellation request registered successfully."
    }


@router.get("/audit-reports")
async def get_audit_reports(
    limit: int = Query(50, ge=1, le=100),
    target_url: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns actual, verified audit reports generated from completed live website tests.
    Strictly filters for runs that have real recorded Web Vitals metrics from browser sessions.
    """
    from app.api.v1.comparisons import serialize_test_run
    from app.models.relational.entities import TestRun
    from sqlalchemy.orm import selectinload

    stmt = (
        select(TestRun)
        .where(TestRun.metrics.any())
        .options(
            selectinload(TestRun.project),
            selectinload(TestRun.device_profile),
            selectinload(TestRun.metrics),
            selectinload(TestRun.failures),
            selectinload(TestRun.recommendations),
            selectinload(TestRun.artifacts)
        )
        .order_by(TestRun.created_at.desc())
        .limit(limit)
    )
    if target_url:
        stmt = stmt.where(TestRun.target_url == target_url)
    if status:
        stmt = stmt.where(TestRun.status == status)

    res = await db.execute(stmt)
    runs = res.scalars().all()

    return [serialize_test_run(r) for r in runs if r]
