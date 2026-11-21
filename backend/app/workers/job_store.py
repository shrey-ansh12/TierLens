import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class JobState(str, Enum):
    QUEUED = "QUEUED"
    PREPARING = "PREPARING"
    RUNNING = "RUNNING"
    ANALYZING = "ANALYZING"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_WARNINGS = "COMPLETED_WITH_WARNINGS"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class JobStatusResponse(BaseModel):
    job_id: str
    status: JobState
    stage: str
    progress_message: str
    target_url: str
    tier: str
    mode: str
    workspace_id: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    error_category: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    final_url: Optional[str] = None
    redirect_count: Optional[int] = 0
    metrics_summary: Optional[Dict[str, Any]] = None
    comparison_group_id: Optional[str] = None
    good_budget_run_id: Optional[str] = None
    entry_level_run_id: Optional[str] = None
    test_run_id: Optional[str] = None
    comparison_data: Optional[Dict[str, Any]] = None
    single_run_data: Optional[Dict[str, Any]] = None
    recommendations: Optional[List[Dict[str, Any]]] = None
    stage_id: Optional[int] = 1
    stage_name: Optional[str] = "Browser Initialization"
    logs: Optional[List[Dict[str, Any]]] = []
    current_metrics: Optional[Dict[str, Any]] = None

class JobStore:
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    def register_active_task(self, job_id: str, task: asyncio.Task):
        """Registers the in-process asyncio.Task for pre-emptive cancellation."""
        self._active_tasks[job_id] = task

    def unregister_active_task(self, job_id: str):
        """Unregisters the task once finished."""
        self._active_tasks.pop(job_id, None)

    async def create_job(
        self,
        job_id: str,
        target_url: str,
        tier: str,
        mode: str,
        workspace_id: str,
        project_id: str
    ) -> Dict[str, Any]:
        async with self._lock:
            record = {
                "job_id": job_id,
                "status": JobState.QUEUED.value,
                "stage": "Queue Dispatch",
                "progress_message": "Test job accepted and queued for execution.",
                "target_url": target_url,
                "tier": tier,
                "mode": mode,
                "workspace_id": workspace_id,
                "project_id": project_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "started_at": None,
                "completed_at": None,
                "duration_ms": None,
                "error": None,
                "comparison_group_id": None,
                "good_budget_run_id": None,
                "entry_level_run_id": None,
                "test_run_id": None,
                "cancelled": False,
                "stage_id": 1,
                "stage_name": "Browser Initialization",
                "logs": [
                    {
                        "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                        "level": "INFO",
                        "message": f"Job queued for target {target_url} in {mode} mode."
                    }
                ],
                "current_metrics": {}
            }
            self._jobs[job_id] = record
            return record

    async def append_log(
        self,
        job_id: str,
        message: str,
        level: str = "INFO",
        stage_id: Optional[int] = None,
        stage_name: Optional[str] = None,
        metric: Optional[Dict[str, Any]] = None
    ):
        async with self._lock:
            if job_id not in self._jobs:
                return
            rec = self._jobs[job_id]
            if "logs" not in rec or rec["logs"] is None:
                rec["logs"] = []
            rec["logs"].append({
                "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                "level": level,
                "message": message
            })
            if stage_id is not None:
                rec["stage_id"] = stage_id
            if stage_name is not None:
                rec["stage_name"] = stage_name
                rec["stage"] = stage_name
            if metric and "current_metrics" in rec:
                rec["current_metrics"][metric["name"]] = {
                    "value": metric.get("value"),
                    "rating": metric.get("rating")
                }

    async def update_job(self, job_id: str, **kwargs) -> Optional[Dict[str, Any]]:
        async with self._lock:
            if job_id not in self._jobs:
                return None
            record = self._jobs[job_id]

            # IMMUTABILITY GUARD: Prevent terminal states from being overwritten!
            # E.g. A CANCELLED or FAILED job must never be resurrected to COMPLETED by late worker completion
            terminal_states = (
                JobState.COMPLETED.value,
                JobState.COMPLETED_WITH_WARNINGS.value,
                JobState.PARTIAL.value,
                JobState.FAILED.value,
                JobState.CANCELLED.value
            )
            if record["status"] in terminal_states:
                requested_status = kwargs.get("status")
                if requested_status and requested_status != record["status"]:
                    logger.warning(
                        f"Terminal state guard: Blocked transition from '{record['status']}' to '{requested_status}' for job {job_id}."
                    )
                    kwargs.pop("status", None)
                    kwargs.pop("stage", None)
                    kwargs.pop("progress_message", None)

            for k, v in kwargs.items():
                record[k] = v
            return record

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            if job_id in self._jobs:
                return self._jobs[job_id]

        # FALLBACK: If not in memory (e.g. after backend restart), attempt to restore from Database
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.relational.entities import TestRun, Project
            from sqlalchemy import select
            async with AsyncSessionLocal() as session:
                # Check if job_id matches a comparison_group_id
                stmt = select(TestRun).where(TestRun.comparison_group_id == job_id)
                res = await session.execute(stmt)
                runs = res.scalars().all()

                if not runs:
                    # Check if job_id matches a single run id
                    stmt_single = select(TestRun).where(TestRun.id == job_id)
                    res_single = await session.execute(stmt_single)
                    runs = res_single.scalars().all()

                if runs:
                    first_run = runs[0]
                    # Lookup project for workspace_id
                    p_res = await session.execute(select(Project).where(Project.id == first_run.project_id))
                    proj = p_res.scalars().first()
                    ws_id = proj.workspace_id if proj else None

                    is_dual = len(runs) > 1 or first_run.comparison_group_id is not None
                    recovered_record = {
                        "job_id": job_id,
                        "status": first_run.status,
                        "stage": "Completed" if first_run.status == "COMPLETED" else first_run.status.capitalize(),
                        "progress_message": first_run.failure_summary or f"Test {first_run.status.lower()}.",
                        "target_url": first_run.target_url or "https://app.local",
                        "tier": "BOTH" if is_dual else "SINGLE",
                        "mode": "DUAL_COMPARISON" if is_dual else "SINGLE_RUN",
                        "workspace_id": ws_id,
                        "project_id": first_run.project_id,
                        "created_at": first_run.created_at.isoformat() if first_run.created_at else datetime.now(timezone.utc).isoformat(),
                        "started_at": first_run.started_at.isoformat() if first_run.started_at else None,
                        "completed_at": first_run.completed_at.isoformat() if first_run.completed_at else None,
                        "duration_ms": first_run.duration_ms,
                        "error": first_run.failure_summary if first_run.status == "FAILED" else None,
                        "comparison_group_id": first_run.comparison_group_id,
                        "good_budget_run_id": runs[0].id if len(runs) > 0 else None,
                        "entry_level_run_id": runs[1].id if len(runs) > 1 else None,
                        "test_run_id": first_run.id,
                        "cancelled": first_run.status == "CANCELLED",
                        "stage_id": 7 if first_run.status in ("COMPLETED", "COMPLETED_WITH_WARNINGS") else (1 if first_run.status == "FAILED" else 6),
                        "stage_name": "Report & Graph Generation" if first_run.status in ("COMPLETED", "COMPLETED_WITH_WARNINGS") else first_run.status.capitalize(),
                        "logs": [
                            {"timestamp": first_run.created_at.strftime("%H:%M:%S") if first_run.created_at else "00:00:00", "level": "INFO", "message": f"Test run loaded from database ({first_run.status})."}
                        ],
                        "current_metrics": {}
                    }
                    async with self._lock:
                        self._jobs[job_id] = recovered_record
                    return recovered_record
        except Exception as e:
            logger.warning(f"Database job recovery for {job_id} encountered: {e}")

        return None

    async def cancel_job(self, job_id: str) -> bool:
        async with self._lock:
            if job_id not in self._jobs:
                return False
            record = self._jobs[job_id]
            terminal_states = (
                JobState.COMPLETED.value,
                JobState.COMPLETED_WITH_WARNINGS.value,
                JobState.PARTIAL.value,
                JobState.FAILED.value,
                JobState.CANCELLED.value
            )
            if record["status"] in terminal_states:
                return False

            record["status"] = JobState.CANCELLED.value
            record["stage"] = "Cancelled"
            record["progress_message"] = "Job cancelled by user request."
            record["completed_at"] = datetime.now(timezone.utc).isoformat()
            record["cancelled"] = True

        # Pre-emptively abort the running asyncio.Task
        task = self._active_tasks.get(job_id)
        if task and not task.done():
            logger.info(f"Pre-emptively cancelling in-flight task for job {job_id}...")
            task.cancel()

        return True

job_store = JobStore()
