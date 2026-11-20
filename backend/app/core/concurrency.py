import asyncio
import logging
from typing import Dict, Set
from app.config import settings

logger = logging.getLogger(__name__)

class ConcurrencyManager:
    """
    Coordinates browser concurrency, workspace execution quotas,
    and duplicate job prevention across background runners.
    """
    def __init__(self):
        self._max_browsers = settings.MAX_CONCURRENT_BROWSER_JOBS
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(self._max_browsers)
        # Maps workspace_id -> set of active job_ids
        self._workspace_active_jobs: Dict[str, Set[str]] = {}
        # Active target URLs currently running tests -> set of job_ids
        self._active_target_urls: Dict[str, str] = {}
        self._lock = asyncio.Lock()

    def get_max_concurrent_browsers(self) -> int:
        return self._max_browsers

    async def get_active_browser_count(self) -> int:
        return self._max_browsers - self._semaphore._value

    async def try_reserve_workspace_slot(self, workspace_id: str, job_id: str, target_url: str) -> bool:
        """
        Atomically checks workspace active job quota and reserves slot.
        Prevents TOCTOU race conditions under simultaneous requests.
        """
        async with self._lock:
            active = self._workspace_active_jobs.get(workspace_id, set())
            if len(active) >= settings.WORKSPACE_MAX_ACTIVE_JOBS:
                return False
            if workspace_id not in self._workspace_active_jobs:
                self._workspace_active_jobs[workspace_id] = set()
            self._workspace_active_jobs[workspace_id].add(job_id)
            self._active_target_urls[target_url] = job_id
            return True

    async def check_workspace_quota(self, workspace_id: str) -> bool:
        """Returns True if the workspace can submit a new job."""
        async with self._lock:
            active = self._workspace_active_jobs.get(workspace_id, set())
            return len(active) < settings.WORKSPACE_MAX_ACTIVE_JOBS

    async def register_job(self, job_id: str, workspace_id: str, target_url: str):
        """Registers a newly queued job."""
        async with self._lock:
            if workspace_id not in self._workspace_active_jobs:
                self._workspace_active_jobs[workspace_id] = set()
            self._workspace_active_jobs[workspace_id].add(job_id)
            self._active_target_urls[target_url] = job_id

    async def acquire_slot(self, timeout: float = 60.0) -> bool:
        """Acquires a browser execution slot with timeout."""
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning("Browser slot acquisition timed out.")
            return False

    def release_slot(self):
        """Releases an acquired browser execution slot."""
        try:
            self._semaphore.release()
        except ValueError:
            pass

    async def unregister_job(self, job_id: str, workspace_id: str, target_url: str):
        """Unregisters a completed or failed job."""
        async with self._lock:
            if workspace_id in self._workspace_active_jobs:
                self._workspace_active_jobs[workspace_id].discard(job_id)
                if not self._workspace_active_jobs[workspace_id]:
                    del self._workspace_active_jobs[workspace_id]
            if self._active_target_urls.get(target_url) == job_id:
                del self._active_target_urls[target_url]

concurrency_manager = ConcurrencyManager()
