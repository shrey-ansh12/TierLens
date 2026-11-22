import asyncio
import logging
from typing import Dict, Set, Optional
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

    async def _prune_stale_jobs_locked(self, workspace_id: Optional[str] = None):
        """
        Cleans up jobs that have reached terminal states or are no longer actively executing.
        Ensures workspaces are never permanently deadlocked by completed or crashed runs.
        """
        try:
            from app.workers.job_store import job_store, JobState
            terminal_states = {
                JobState.COMPLETED.value,
                JobState.COMPLETED_WITH_WARNINGS.value,
                JobState.PARTIAL.value,
                JobState.FAILED.value,
                JobState.CANCELLED.value
            }
            target_workspaces = [workspace_id] if workspace_id else list(self._workspace_active_jobs.keys())
            for ws_id in target_workspaces:
                active_set = self._workspace_active_jobs.get(ws_id, set())
                stale = set()
                for j_id in list(active_set):
                    job_rec = await job_store.get_job(j_id)
                    # If job not in store or in terminal state, it is no longer active
                    if not job_rec or job_rec.get("status") in terminal_states:
                        stale.add(j_id)
                for j_id in stale:
                    active_set.discard(j_id)
                    for url, mapped_jid in list(self._active_target_urls.items()):
                        if mapped_jid == j_id:
                            del self._active_target_urls[url]
                if not active_set and ws_id in self._workspace_active_jobs:
                    del self._workspace_active_jobs[ws_id]
        except Exception as e:
            logger.warning(f"Error while pruning stale jobs in concurrency manager: {e}")

    async def try_reserve_workspace_slot(self, workspace_id: str, job_id: str, target_url: str) -> bool:
        """
        Atomically checks workspace active job quota and reserves slot.
        Prevents TOCTOU race conditions under simultaneous requests.
        """
        async with self._lock:
            await self._prune_stale_jobs_locked(workspace_id)
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
            await self._prune_stale_jobs_locked(workspace_id)
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

    async def release_workspace_slot(self, workspace_id: str, job_id: str, target_url: Optional[str] = None):
        """
        Releases an acquired workspace slot when a test completes, fails, or is cancelled.
        """
        async with self._lock:
            if workspace_id in self._workspace_active_jobs:
                self._workspace_active_jobs[workspace_id].discard(job_id)
                if not self._workspace_active_jobs[workspace_id]:
                    del self._workspace_active_jobs[workspace_id]
            if target_url and self._active_target_urls.get(target_url) == job_id:
                del self._active_target_urls[target_url]
            else:
                for url, mapped_jid in list(self._active_target_urls.items()):
                    if mapped_jid == job_id:
                        del self._active_target_urls[url]

    async def unregister_job(self, job_id: str, workspace_id: str, target_url: Optional[str] = None):
        """Unregisters a completed or failed job (backward compatibility alias)."""
        await self.release_workspace_slot(workspace_id, job_id, target_url)

    async def clear_workspace(self, workspace_id: str):
        """Force resets active slots for a specific workspace."""
        async with self._lock:
            if workspace_id in self._workspace_active_jobs:
                del self._workspace_active_jobs[workspace_id]

concurrency_manager = ConcurrencyManager()
