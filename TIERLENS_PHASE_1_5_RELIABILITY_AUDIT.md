# TierLens — Phase 1.5: Background Job Architecture Verification & Reliability Audit

**Document Reference:** `TL-AUDIT-PHASE-1.5`  
**Date:** 2026-11-20  
**Author:** Senior Backend Architect, Distributed Systems Engineer, QA Automation Engineer, and Security Reviewer  
**Audit Scope:** Background Execution Pipeline, Celery/Redis Integration, JobStore Persistence, Concurrency Control, Cancellation Cleanup, Database Reliability, API/Frontend Consistency  
**Mode:** Strictly Read-Only Forensic Engineering Audit  

---

## 1. Executive Summary

Following the initial development of Phase 1 (Background Test Execution Architecture), this audit was executed under a strict read-only directive to verify the actual runtime reliability, fault tolerance, distributed safety, and process isolation of the new background pipeline.

While Phase 1 successfully resolved the immediate HTTP latency issue (`TL-AUDIT-001`, cutting synchronous request handler blocking from ~25 seconds to an immediate `HTTP 202 Accepted` in ~2.0 seconds), **our empirical verification reveals critical distributed systems defects that block horizontal scaling and production readiness.**

### High-Level Verdict Matrix

| Subsystem | Audit Status | Key Finding |
| :--- | :--- | :--- |
| **JobStore Persistence** | **FAILED** | Pure in-memory dictionary. Zero persistence across API restarts. Zero IPC between FastAPI and Celery worker processes. |
| **Celery & Redis Worker** | **FAILED** | Celery task autodiscovery is broken (`tasks.run_web_test_task` is unregistered when starting Celery CLI). Celery workers cannot communicate job state back to the API process. |
| **In-Process Fallback** | **PARTIALLY VERIFIED** | Operational in single-process development, but orphaned `TestRun` records remain stuck in `RUNNING` in SQLite/PostgreSQL upon server restart. |
| **Concurrency & Quotas** | **PARTIALLY VERIFIED** | Global browser semaphore works in-process, but workspace quota contains a severe Time-of-Check to Time-of-Use (TOCTOU) race condition permitting quota breach. |
| **Cancellation & Cleanup** | **FAILED** | Cancellation is cosmetic: setting `cancelled: True` in memory does not abort active Playwright Chromium processes. Terminal `CANCELLED` state is overwritten by late completion. |
| **Authorization & Security**| **FAILED** | IDOR vulnerability on `/jobs/{job_id}` and `/jobs/{job_id}/cancel`. Any authenticated user can inspect or cancel jobs belonging to any other workspace. |
| **Database Reliability** | **VERIFIED** | `DATABASE_MODE = "postgres_required"` strictly blocks fallback. SQLite WAL mode and 30s busy timeout successfully resolve database locks. |
| **API & Frontend Consistency**| **VERIFIED** | Non-blocking polling, stage transitions, and light theme comparative rendering function properly in the happy path. |

**Final Recommendation:** **BLOCKED — CRITICAL ARCHITECTURE FIXES REQUIRED**

---

## 2. Actual Architecture and Execution Flow

```
[ Frontend: Next.js 14 ]
       │
       ▼ (1) POST /api/v1/tests/web/run (URL, tier)
[ FastAPI Request Handler: tests_web.py ]
       │
       ├─► (2) Checks workspace quota (TOCTOU Race Condition)
       ├─► (3) Registers job in in-memory ConcurrencyManager
       ├─► (4) Creates job record in in-memory JobStore._jobs {}
       │
       ├───► [ Branch A: Redis Online ] ──────────► [ Celery Task Queue: Redis ]
       │                                                    │
       │                                                    ▼ (5A) Celery Worker Process
       │                                            [ tasks.py: run_web_test_task ]
       │                                                    │
       │                                                    ├─► Updates *Local* JobStore (Isolated!)
       │                                                    └─► API sees job stuck in QUEUED forever!
       │
       └───► [ Branch B: Redis Offline / Fallback ]
               │
               ▼ (5B) asyncio.create_task(orchestrate_web_test_job)
       [ Local Async Event Loop Worker ]
               │
               ├─► (6) Acquires in-memory browser semaphore slot (Max: 2)
               ├─► (7) Updates in-memory JobStore (PREPARING -> RUNNING -> ANALYZING)
               ├─► (8) Executes Playwright Chromium (with CDP CPU/network throttle)
               ├─► (9) Writes TestRun, Metrics, Failures, Artifacts to DB
               └─► (10) Updates JobStore status -> COMPLETED (overwriting any CANCELLED state)
```

---

## 3. JobStore Persistence Findings (AUDIT A)

**Target:** `backend/app/workers/job_store.py`

### 3.1 Pure In-Memory Ephemeral Storage
`JobStore` is implemented as an in-memory class:
```python
class JobStore:
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
```
- **Evidence:** Line 29 of `job_store.py`. `self._jobs` is a standard Python heap dictionary.
- **Process Restart Amnesia:** When the Uvicorn process restarts, all in-memory job records are instantly wiped. If a user was executing a 20-second test or polling for results, the next polling request to `GET /api/v1/tests/web/jobs/{job_id}` returns **`HTTP 404 Not Found`**.
- **Cross-Process Blindness (IPC Missing):** In Python, separate OS processes (e.g., Uvicorn worker process vs. Celery worker process) have isolated virtual address spaces. When `JobStore` is instantiated in the API process, it is invisible to the Celery worker process.
- **Terminal State Mutability:**
  In `job_store.py` line 52:
  ```python
  async def update_job(self, job_id: str, **kwargs) -> Optional[Dict[str, Any]]:
      async with self._lock:
          if job_id not in self._jobs:
              return None
          record = self._jobs[job_id]
          for k, v in kwargs.items():
              record[k] = v
          return record
  ```
  `update_job` contains no guard checking whether `record["status"]` is already in a terminal state (`COMPLETED`, `FAILED`, `CANCELLED`).
  **Empirical Test:**
  When a job is cancelled via `cancel_job()`, its status is `"CANCELLED"`. When the in-flight background worker subsequently finishes `_execute_single_tier`, it calls `update_job(status="COMPLETED")`. The method blindly updates the dictionary, **resurrecting the cancelled job to `"COMPLETED"`**.

---

## 4. Celery and Redis Integration Verification (AUDIT B)

**Targets:** `backend/app/workers/celery_app.py`, `backend/app/workers/tasks.py`, `backend/app/api/v1/tests_web.py`

### 4.1 Broken Celery Task Discovery
In `backend/app/workers/celery_app.py`:
```python
celery_app = Celery(
    "tierlens_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
```
- **Evidence:** `celery_app.py` specifies neither `include=["app.workers.tasks"]` nor `celery_app.autodiscover_tasks()`.
- **Empirical CLI Test:**
  ```python
  from app.workers.celery_app import celery_app
  print([t for t in celery_app.tasks.keys() if 'web' in t])
  # Output: []
  ```
  When an operator starts a Celery worker via standard command `celery -A app.workers.celery_app worker`, the worker registers zero application tasks. Dispatching a job triggers `celery.exceptions.NotRegistered: 'tasks.run_web_test_task'`.

### 4.2 Distributed State Blackhole
Even if tasks are manually imported into Celery:
When `run_web_test_task` executes inside the Celery worker process, it invokes `orchestrate_web_test_job`. This function calls:
`await job_store.update_job(job_id, status="RUNNING")`
Because `job_store` is purely in-memory, the Celery worker updates **its own private memory space**. The FastAPI process serving the user's HTTP status requests never sees this update.
**Result:** The user polls `GET /api/v1/tests/web/jobs/{job_id}` and is permanently served `status: "QUEUED"` until the client times out, even if the worker successfully finishes the test!

### 4.3 Unverified Celery Claims
The Phase 1 summary reported that Celery worker dispatch was ready. Under rigorous multi-process inspection, **Celery worker execution is NOT operational and cannot be used in production without Redis-backed shared state.**

---

## 5. In-Process Fallback Verification (AUDIT C)

**Target:** `backend/app/workers/tasks.py`

### 5.1 Event Loop Scheduling
In `backend/app/api/v1/tests_web.py` line 125:
`asyncio.create_task(orchestrate_web_test_job(...))`
- **Verified:** Schedules the coroutine directly onto the active FastAPI event loop.
- **Latency Result:** The HTTP response returns in **2.05s** (non-blocking).

### 5.2 Server Shutdown & Zombie Records
- If Uvicorn is stopped or restarted while an in-process task is running Playwright, the coroutine is abruptly terminated.
- **Evidence in Database:** At line 43 of `tasks.py`, `TestRun` is committed to the relational database with `status = "RUNNING"`. When the process dies, this row is never updated.
- **Missing Lifecycle Reconciliation:** `main.py` lifespan startup contains no query to scan for and mark zombie `RUNNING` runs as `FAILED`.

---

## 6. Concurrency and Workspace Quota Verification (AUDIT D)

**Target:** `backend/app/core/concurrency.py`

### 6.1 Process-Isolated Semaphore
`self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_BROWSER_JOBS)`
- **Verified:** Within a single Python process, slot acquisition is limited to 2 concurrent executions.
- **Defect:** In a multi-worker deployment (e.g. `uvicorn --workers 4`), each worker maintains its own independent semaphore of 2, allowing up to 8 concurrent Chromium processes to saturate the host.

### 6.2 Time-of-Check to Time-of-Use (TOCTOU) Race Condition
In `backend/app/api/v1/tests_web.py`:
```python
# Step 2: Non-atomic quota check
can_proceed = await concurrency_manager.check_workspace_quota(workspace_id)
if not can_proceed:
    raise HTTPException(status_code=429, ...)

# Step 3: Database operations yielding control to event loop
project = Project(...)
db.add(project)
await db.commit() # <-- EVENT LOOP SWITCHES TO OTHER REQUESTS HERE

# Step 4: Late registration
await concurrency_manager.register_job(job_id, workspace_id, payload.target_url)
```
- **Empirical Proof:** We executed a controlled benchmark submitting 6 concurrent requests simultaneously against a limit of 4:
  ```
  Results of 6 concurrent requests (limit is 4): [True, True, True, True, True, True]
  Total active jobs registered: 6
  ```
  All 6 requests passed the quota check because the check and reservation are non-atomic.

### 6.3 Dead Code: Inactive Duplicate URL Check
`ConcurrencyManager` initializes `self._active_target_urls = {}` and populates it in `register_job`. However, **`tests_web.py` never inspects this dictionary before admitting a job.** Submitting identical target URLs simultaneously spawns redundant browser instances without warning.

### 6.4 Resource Monopolization
Because `WORKSPACE_MAX_ACTIVE_JOBS = 4` while `MAX_CONCURRENT_BROWSER_JOBS = 2`, a single workspace can submit 2 jobs, acquire 100% of the active browser execution slots, and starve every other workspace.

---

## 7. Cancellation and Resource Cleanup (AUDIT E)

**Targets:** `backend/app/workers/job_store.py`, `backend/app/workers/tasks.py`

### 7.1 Cosmetic Cancellation (Missing Process Abortion)
In `backend/app/api/v1/tests_web.py`:
```python
@router.post("/jobs/{job_id}/cancel")
async def cancel_web_job(job_id: str, ...):
    cancelled = await job_store.cancel_job(job_id)
```
In `backend/app/workers/job_store.py`:
```python
async def cancel_job(self, job_id: str) -> bool:
    record["status"] = "CANCELLED"
    record["cancelled"] = True
    return True
```
- **Observed Behavior:** Calling `POST /cancel` immediately returns `200 OK {"status": "CANCELLED"}`.
- **Defect:** `tasks.py` only checks `job_rec.get("cancelled")` **before** acquiring a slot. Once Playwright begins (`await _execute_single_tier`), the task holds no reference to `asyncio.Task`, the Playwright `BrowserContext`, or the `Page`.
- **Result:** The Chromium browser continues executing for another 15–20 seconds, downloading assets, taking screenshots, generating RCA recommendations, writing records to the database, and finally overwriting the status to `COMPLETED`. **Cancellation is completely non-preemptive.**

---

## 8. Database Reliability Verification (AUDIT F)

**Target:** `backend/app/core/database.py`

### 8.1 Explicit Mode Enforcement
- **`DATABASE_MODE = "postgres_required"` Verified:**
  Under empirical testing with PostgreSQL offline, `check_db_health()` returned:
  `{'status': 'error', 'database_type': 'postgresql', 'fallback_blocked': True}`
  Silent fallback to SQLite is strictly prevented.
- **SQLite WAL Mode & Concurrency:**
  Configured `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=30000;`. In stress testing with concurrent background writes, `sqlite3.OperationalError: database is locked` was 100% eliminated.

---

## 9. API and Frontend Consistency (AUDIT G)

**Targets:** `backend/app/api/v1/tests_web.py`, `frontend/src/app/page.tsx`

### 9.1 Insecure Direct Object Reference (IDOR)
In `backend/app/api/v1/tests_web.py`:
```python
@router.get("/jobs/{job_id}")
async def get_web_job_status(job_id: str, current_user: User = Depends(get_current_user)):
    record = await job_store.get_job(job_id)
    return JobStatusResponse(...)

@router.post("/jobs/{job_id}/cancel")
async def cancel_web_job(job_id: str, current_user: User = Depends(get_current_user)):
    cancelled = await job_store.cancel_job(job_id)
```
- **Defect:** While `current_user` is authenticated, the handler **never checks if `record["workspace_id"]` matches `current_user.workspace_id`**.
- **Impact:** Any authenticated user can read test progress, inspect target URLs, and cancel in-flight jobs belonging to any other company or workspace simply by enumerating or guessing job IDs.

### 9.2 Frontend Unmount Polling Leak
In `frontend/src/app/page.tsx`, `handleExecuteWebTest` executes a `while (!finished)` polling loop without an `AbortController`. If a user navigates to another page, the browser continues polling in the background until the job reaches a terminal state.

---

## 10. Test Results with Actual Evidence

| Test Scenario | Commanded Action | Observed Outcome | Evidence / Log | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Immediate 202 Latency** | `POST /tests/web/run` with URL | Response delivered in 2.052s with `status: QUEUED` | `Status: 202 returned in 2.0521s` | **VERIFIED** |
| **Status Polling** | `GET /tests/web/jobs/{id}` | Returns live status and stage transitions | `{'status': 'RUNNING', 'stage': 'Executing Good Budget Test'}` | **VERIFIED** |
| **Job Cancellation API** | `POST /tests/web/jobs/{id}/cancel` | Returns `CANCELLED` status | `{"status": "CANCELLED"}` | **PARTIALLY VERIFIED** |
| **Preemptive Browser Termination** | Cancel during active Playwright run | Browser continues running; status overwritten to `COMPLETED` | `After cancel: CANCELLED -> After late update: COMPLETED` | **FAILED** |
| **Celery CLI Task Discovery** | Inspect `celery_app.tasks` | Zero application tasks discovered | `Registered tasks: []` | **FAILED** |
| **Celery Cross-Process State** | Worker updates state in process B | State invisible to API process A | Memory isolated heap dictionaries | **FAILED** |
| **Workspace Quota Atomicity** | 6 concurrent submissions (quota: 4) | All 6 accepted; quota breached | `Total active jobs registered: 6` | **FAILED** |
| **Duplicate URL Prevention** | 2 submissions of identical URL | Both accepted simultaneously | `_active_target_urls` populated but never checked | **FAILED** |
| **PostgreSQL Strict Mode** | `DATABASE_MODE = "postgres_required"` | Strictly refuses fallback on postgres failure | `{'fallback_blocked': True}` | **VERIFIED** |
| **SQLite WAL Concurrency** | Concurrent background test writes | Zero `database is locked` errors | 5/5 Pytest suite passed in 19.35s | **VERIFIED** |

---

## 11. Critical and High-Severity Defects

### Issue TL-REL-001 (CRITICAL) — Cross-Process Memory Isolation Between Celery and FastAPI
- **File & Function:** `backend/app/workers/job_store.py` (`JobStore`), `backend/app/workers/tasks.py` (`run_web_test_task`).
- **Observed:** `job_store._jobs` is an in-memory dictionary. When tasks run in a Celery worker, updates are written to the worker's private process memory. The FastAPI process querying `/jobs/{id}` never receives updates, leaving jobs permanently stuck in `QUEUED`.
- **Expected:** Job state must be stored in a shared persistent layer (Redis hashes or PostgreSQL table).
- **Reproduction Steps:** Start Celery worker in terminal 1; submit job via FastAPI in terminal 2; poll status via FastAPI. Job stays in `QUEUED` indefinitely.
- **Recommended Fix:** Migrate `JobStore` to read and write directly to Redis (`HSET tierlens:jobs:{job_id}`) or PostgreSQL `test_jobs` table.

### Issue TL-REL-002 (CRITICAL) — Celery Worker Task Discovery Failure
- **File & Function:** `backend/app/workers/celery_app.py` (`celery_app`).
- **Observed:** `celery_app.py` does not include `app.workers.tasks` in `include` or configure autodiscovery. Running `celery -A app.workers.celery_app worker` registers zero test tasks.
- **Expected:** `celery_app = Celery(..., include=["app.workers.tasks"])` so the worker discovers all tasks on startup.
- **Reproduction:** Run `celery -A app.workers.celery_app inspect registered` -> empty.
- **Recommended Fix:** Add `include=["app.workers.tasks"]` in `celery_app.py`.

### Issue TL-REL-003 (HIGH) — State Loss and 404s on API Restart
- **File & Function:** `backend/app/workers/job_store.py` (`JobStore._jobs`).
- **Observed:** API restart wipes all job records. Any active or recently completed job immediately returns `404 Not Found`.
- **Expected:** Active and historical jobs must persist across restarts.
- **Recommended Fix:** Back job records in the database with foreign key to `TestRun`.

### Issue TL-REL-004 (HIGH) — Terminal State Mutability and Job Resurrection
- **File & Function:** `backend/app/workers/job_store.py` (`update_job`).
- **Observed:** `update_job` blindly overwrites status without checking if the current status is `CANCELLED` or `FAILED`. A cancelled job is resurrected to `COMPLETED` when the worker finishes.
- **Expected:** Once in `CANCELLED`, `FAILED`, or `COMPLETED`, status updates must be rejected.
- **Recommended Fix:** Check `if record["status"] in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED): return record`.

### Issue TL-REL-005 (HIGH) — Cosmetic Cancellation Failing to Abort Chromium
- **File & Function:** `backend/app/workers/tasks.py` (`orchestrate_web_test_job`).
- **Observed:** Cancellation flips a boolean flag in memory. It holds no handle to the `asyncio.Task` or Playwright process, allowing Chromium to consume system resources until test completion.
- **Expected:** Cancelling a job must call `task.cancel()` on the running asyncio task or invoke `browser_context.close()`.
- **Recommended Fix:** Maintain an active task registry (`Dict[str, asyncio.Task]`) and call `task.cancel()` upon cancellation request.

### Issue TL-REL-006 (HIGH) — Insecure Direct Object Reference (IDOR) on Job Endpoints
- **File & Function:** `backend/app/api/v1/tests_web.py` (`get_web_job_status`, `cancel_web_job`).
- **Observed:** Any authenticated user can query status or cancel jobs belonging to any other user or workspace.
- **Expected:** The handler must verify `if record["workspace_id"] != current_user.workspace_id: raise HTTPException(403)`.
- **Recommended Fix:** Add tenant workspace validation in both `/jobs/{job_id}` and `/jobs/{job_id}/cancel`.

### Issue TL-REL-007 (HIGH) — TOCTOU Race Condition in Workspace Quota
- **File & Function:** `backend/app/api/v1/tests_web.py` (lines 40-75).
- **Observed:** `check_workspace_quota` is separated from `register_job` by asynchronous database commits, allowing concurrent requests to bypass `WORKSPACE_MAX_ACTIVE_JOBS`.
- **Expected:** Quota check and job reservation must be combined into an atomic call.
- **Recommended Fix:** Implement `try_reserve_slot(workspace_id, job_id, target_url)` protected by an atomic lock or Redis Lua script.

---

## 12. Medium and Low-Severity Defects

### Issue TL-REL-008 (MEDIUM) — Orphaned RUNNING TestRuns on Server Crash
- **File:** `backend/app/main.py` (`lifespan`).
- **Observed:** No startup recovery sweeps `TestRun` records left in `RUNNING` status by an abrupt crash.
- **Recommended Fix:** Add a startup reconciliation query: `UPDATE test_runs SET status = 'FAILED', failure_summary = 'Server restarted' WHERE status = 'RUNNING'`.

### Issue TL-REL-009 (MEDIUM) — Single Workspace Can Monopolize All Browser Slots
- **File:** `backend/app/core/concurrency.py`.
- **Observed:** `WORKSPACE_MAX_ACTIVE_JOBS (4)` exceeds `MAX_CONCURRENT_BROWSER_JOBS (2)`. One workspace can starve all other tenants.
- **Recommended Fix:** Enforce `WORKSPACE_MAX_CONCURRENT_BROWSERS = 1` while global limit is 2.

### Issue TL-REL-010 (LOW) — Missing HTTP 429 Retry-After Header
- **File:** `backend/app/api/v1/tests_web.py`.
- **Observed:** `HTTPException(429)` returns no `Retry-After` header.
- **Recommended Fix:** Return `headers={"Retry-After": "15"}`.

### Issue TL-REL-011 (LOW) — Dead Code: Unused Duplicate URL Registry
- **File:** `backend/app/core/concurrency.py`.
- **Observed:** `self._active_target_urls` is tracked but never queried to reject duplicate submissions.
- **Recommended Fix:** Check `is_target_url_running(target_url)` during admission.

---

## 13. Multi-Process and Horizontal Scaling Readiness

| Requirement | Current Status | Blocker |
| :--- | :--- | :--- |
| **Multiple Uvicorn Workers (`-w 4`)** | **FAILED** | In-memory `JobStore` and `ConcurrencyManager` are not shared between worker processes. Polling hits worker B for a job created by worker A → 404. |
| **Dedicated Celery Workers** | **FAILED** | Celery worker cannot write job state to API memory space. Autodiscovery missing. |
| **Multiple API Replicas (K8s/Docker)**| **FAILED** | No centralized state store for active jobs or semaphores. |
| **Worker Process Crash Recovery** | **FAILED** | No dead-letter queue or heartbeat monitor for active jobs. |

**Verdict:** The current architecture is suitable **only for single-process local development with in-process worker fallback**. It cannot scale horizontally or run separate Celery worker processes without architectural changes.

---

## 14. Recommended Architecture for Phase 1.5 Stabilization

```
[ Frontend: Next.js ]
       │
       ▼ (1) POST /api/v1/tests/web/run
[ FastAPI Instance ]
       │
       ├─► (2) Atomic Reservation via Redis Lua Script:
       │        - Checks workspace active quota
       │        - Checks duplicate target URL
       │        - Atomically increments active count & reserves slot
       │
       ├─► (3) Writes Job Record to PostgreSQL `test_jobs` & Redis Hash (`tierlens:job:{id}`)
       │
       ├─► (4) Dispatches Job ID to Redis Queue / Celery Task
       │
       └─► Returns HTTP 202 Accepted + poll_url
               │
               ▼
       [ Worker Engine: Celery Worker OR Async Background Task ]
               │
               ├─► (5) Acquires Distributed Lock / Semaphore in Redis
               ├─► (6) Updates Redis Hash + PostgreSQL status (RUNNING -> ANALYZING)
               ├─► (7) Tracks active asyncio.Task / Playwright PID for preemption
               ├─► (8) On Cancel: terminates Playwright PID & marks CANCELLED
               └─► (9) On Complete: atomically releases Redis slot & marks COMPLETED
```

---

## 15. Prioritized Phase 1.5 Bug-Fixing Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1.5 Bug-Fixing Roadmap                                          │
└────────────────────────────────────────────────────────────────────────┘

  [ Priority 1: High Security & Integrity ]
  1. Fix TL-REL-006: Add tenant workspace authorization to /jobs/{id} and /jobs/{id}/cancel.
  2. Fix TL-REL-004: Enforce terminal state immutability in JobStore.
  3. Fix TL-REL-007: Unify workspace quota check and registration into an atomic method.

  [ Priority 2: Distributed Architecture & Celery ]
  4. Fix TL-REL-002: Add `include=["app.workers.tasks"]` in celery_app.py.
  5. Fix TL-REL-001 & TL-REL-003: Back JobStore with Redis hashes and PostgreSQL persistence.
  6. Fix TL-REL-005: Store running `asyncio.Task` references to enable true preemptive cancellation.

  [ Priority 3: Reliability & Cleanup ]
  7. Fix TL-REL-008: Add startup reconciliation for orphaned RUNNING TestRuns in main.py.
  8. Fix TL-REL-009 & TL-REL-011: Implement duplicate URL rejection and workspace browser throttling.
```

---

## 16. Explicit List of Unverified Claims

1. **"Celery background execution is operational"** — **UNVERIFIED / FAILED**. Tasks are not autodiscovered by Celery CLI, and worker processes cannot communicate job state to the API.
2. **"Jobs can be safely cancelled during execution"** — **UNVERIFIED / FAILED**. Calling cancel does not stop the running Chromium browser process.
3. **"Duplicate submission protection is implemented"** — **UNVERIFIED / FAILED**. `_active_target_urls` is tracked in memory but never queried to block requests.
4. **"Multi-worker scalability is supported"** — **FAILED**. In-memory structures make horizontal scaling impossible without Redis backing.

---

## FINAL DECISION

# **BLOCKED — CRITICAL ARCHITECTURE FIXES REQUIRED**

**Reasoning:**  
While Phase 1 succeeded in eliminating synchronous HTTP request blocking (~2.0s response latency) and implemented rock-solid SQLite WAL concurrency for local development, the distributed foundation has critical structural flaws:
1. Celery workers cannot communicate job state back to the API.
2. Celery CLI cannot discover test tasks.
3. Cancellation is purely cosmetic and fails to abort Chromium processes.
4. An IDOR vulnerability allows cross-tenant job inspection and cancellation.
5. In-memory job state is completely lost upon server restart.

Proceeding to Phase 2 (Device Profile expansion, APK test execution, or multi-tenant analytics) without fixing these core architectural defects would build upon an unstable foundation. Implementing the Priority 1 & 2 fixes outlined in Section 15 will fully unblock Phase 2.
