import uuid
import asyncio
import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db, AsyncSessionLocal
from app.api.v1.auth import get_current_user
from app.models.relational.entities import (
    User, Workspace, Project, DeviceProfile, TestRun, TestMetric,
    TestFailure, TestArtifact, Recommendation, TestStatus
)
from app.schemas.tests import WebTestSubmitRequest, TestRunResponse, DualComparisonResponse
from app.core.redis_client import redis_client
from app.core.concurrency import concurrency_manager
from app.workers.job_store import job_store, JobState, JobStatusResponse
from app.workers.tasks import orchestrate_web_test_job, run_web_test_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tests/web", tags=["Website Performance Testing"])


@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def queue_web_test(
    payload: WebTestSubmitRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a website performance test for asynchronous background execution.
    Returns HTTP 202 Accepted immediately with a unique job_id and status polling URL.
    """
    # 1. Resolve workspace
    ws_res = await db.execute(select(Workspace).where(Workspace.owner_id == current_user.id))
    ws = ws_res.scalars().first()
    workspace_id = ws.id if ws else str(uuid.uuid4())
    workspace_name = ws.name if ws else "Workspace"

    # 2. Check workspace concurrency quota
    can_proceed = await concurrency_manager.check_workspace_quota(workspace_id)
    if not can_proceed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Workspace active job quota reached. Please wait for in-progress tests to complete."
        )

    # 3. Resolve or create project
    project = None
    if payload.project_id:
        p_res = await db.execute(select(Project).where(Project.id == payload.project_id))
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
    mode = "DUAL_COMPARISON" if payload.tier == "BOTH" else "SINGLE_RUN"

    # 4. Generate unique job ID and register in job store
    job_id = f"job_web_{uuid.uuid4().hex[:12]}"
    await concurrency_manager.register_job(job_id, workspace_id, payload.target_url)
    job_rec = await job_store.create_job(
        job_id=job_id,
        target_url=payload.target_url,
        tier=payload.tier,
        mode=mode,
        workspace_id=workspace_id,
        project_id=project_id
    )

    # 5. Dispatch to Celery if Redis is connected, otherwise fallback to async event loop task
    redis_health = await redis_client.check_health()
    dispatched_via = "in_process_worker"
    if redis_health.get("connected"):
        try:
            run_web_test_task.delay(
                job_id=job_id,
                target_url=payload.target_url,
                tier=payload.tier,
                mode=mode,
                project_id=project_id,
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                project_name=project_name
            )
            dispatched_via = "celery_redis_queue"
        except Exception as e:
            logger.warning(f"Celery dispatch failed ({e}). Falling back to async event loop task.")
            asyncio.create_task(
                orchestrate_web_test_job(
                    job_id=job_id,
                    target_url=payload.target_url,
                    tier=payload.tier,
                    mode=mode,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    workspace_name=workspace_name,
                    project_name=project_name
                )
            )
    else:
        # Resilient background dispatch via non-blocking asyncio task
        asyncio.create_task(
            orchestrate_web_test_job(
                job_id=job_id,
                target_url=payload.target_url,
                tier=payload.tier,
                mode=mode,
                project_id=project_id,
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                project_name=project_name
            )
        )

    response.status_code = status.HTTP_202_ACCEPTED
    return {
        "job_id": job_id,
        "status": JobState.QUEUED.value,
        "stage": "Queue Dispatch",
        "target_url": payload.target_url,
        "tier": payload.tier,
        "mode": mode,
        "dispatched_via": dispatched_via,
        "poll_url": f"/api/v1/tests/web/jobs/{job_id}",
        "message": "Web performance test accepted and queued for background execution."
    }


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_web_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Returns the real-time execution status, stage, and output references for a background test job.
    """
    record = await job_store.get_job(job_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found."
        )

    return JobStatusResponse(
        job_id=record["job_id"],
        status=record["status"],
        stage=record["stage"],
        progress_message=record["progress_message"],
        target_url=record["target_url"],
        tier=record["tier"],
        mode=record["mode"],
        created_at=record["created_at"],
        started_at=record.get("started_at"),
        completed_at=record.get("completed_at"),
        duration_ms=record.get("duration_ms"),
        error=record.get("error"),
        comparison_group_id=record.get("comparison_group_id"),
        good_budget_run_id=record.get("good_budget_run_id"),
        entry_level_run_id=record.get("entry_level_run_id"),
        test_run_id=record.get("test_run_id")
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_web_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Cancels a queued or currently executing background test job.
    """
    cancelled = await job_store.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job cannot be cancelled (it may have already completed or failed)."
        )
    return {
        "job_id": job_id,
        "status": "CANCELLED",
        "message": "Job cancellation request registered successfully."
    }
