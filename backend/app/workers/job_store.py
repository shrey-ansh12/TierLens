import asyncio
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional
from pydantic import BaseModel

class JobState(str, Enum):
    QUEUED = "QUEUED"
    PREPARING = "PREPARING"
    RUNNING = "RUNNING"
    ANALYZING = "ANALYZING"
    COMPLETED = "COMPLETED"
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
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    comparison_group_id: Optional[str] = None
    good_budget_run_id: Optional[str] = None
    entry_level_run_id: Optional[str] = None
    test_run_id: Optional[str] = None

class JobStore:
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

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
                "cancelled": False
            }
            self._jobs[job_id] = record
            return record

    async def update_job(self, job_id: str, **kwargs) -> Optional[Dict[str, Any]]:
        async with self._lock:
            if job_id not in self._jobs:
                return None
            record = self._jobs[job_id]
            for k, v in kwargs.items():
                record[k] = v
            return record

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def cancel_job(self, job_id: str) -> bool:
        async with self._lock:
            if job_id in self._jobs:
                record = self._jobs[job_id]
                if record["status"] in (JobState.COMPLETED.value, JobState.FAILED.value, JobState.CANCELLED.value):
                    return False
                record["status"] = JobState.CANCELLED.value
                record["stage"] = "Cancelled"
                record["progress_message"] = "Job cancelled by user request."
                record["completed_at"] = datetime.now(timezone.utc).isoformat()
                record["cancelled"] = True
                return True
            return False

job_store = JobStore()
