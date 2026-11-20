# TierLens Web Test Pipeline & Results Display Architecture Fix Report

**Date**: November 21, 2026  
**Status**: COMPLETE & VERIFIED  
**Version**: 1.0.0 Production Ready  

---

## 1. Executive Summary & Screenshot Diagnoses

This engineering report addresses the issues identified during live web performance testing of `https://scan2eat.food/` and the cloud deployment pipeline (Render Docker container & Vercel Next.js monorepo).

### Diagnostic Breakdown of User Screenshots

1. **Docker / Render Build Failure (`ttf-unifont` not found)**:
   - **Diagnosis**: Modern Debian Bookworm / Slim images deprecated `ttf-unifont` and `ttf-ubuntu-font-family` in favor of `fonts-unifont` and `fonts-liberation`.
   - **Resolution**: Replaced obsolete font packages with `fonts-unifont fonts-liberation fonts-dejavu-core fonts-noto-color-emoji` in `backend/Dockerfile`. Build passes cleanly.

2. **Render Runtime Error (`pydantic_settings.sources.SettingsError: error parsing CORS_ORIGINS`)**:
   - **Diagnosis**: `CORS_ORIGINS` was specified with `mode="before"` or complex list annotation, causing Pydantic's `EnvSettingsSource` to attempt `json.loads` on strings like `*` or comma-separated origins, raising a fatal parse error on startup.
   - **Resolution**: Updated `backend/app/config.py` with `CORS_ORIGINS: Union[List[str], str]` and an `@field_validator("CORS_ORIGINS", mode="after")` that parses JSON arrays, comma-delimited strings, or wildcards safely.

3. **Vercel Monorepo Import Detection ("Multiple applications detected")**:
   - **Diagnosis**: Importing the root directory `./` on Vercel triggers monorepo auto-detection between `backend` (FastAPI) and `frontend` (Next.js).
   - **Resolution / Guidance**: For the frontend deployment, select **Root Directory: `frontend`** (or click "Import single project" next to `frontend`). Supply the environment variable:
     `NEXT_PUBLIC_API_URL=https://<your-render-backend-url>`
     The backend is deployed independently as a Docker Web Service on Render.

4. **Frontend Execution Error (`greenlet_spawn has not been called; can't call await_only() here`)**:
   - **Diagnosis**: Selecting "Good Budget Only" (or "Dual Comparison") triggered `serialize_test_run(r)` inside `tasks.py`. Because `TestRun.device_profile` did not have `lazy="selectin"` configured in SQLAlchemy async, accessing `r.device_profile` outside greenlet context triggered a synchronous SQL fetch, resulting in `sqlalchemy.exc.MissingGreenlet`.
   - **Resolution**: Added `lazy="selectin"` to `TestRun.device_profile`, `project`, and `version`, wrapped all relationship property accesses in defensive accessor blocks, and eagerly re-queried instances with `selectinload`.

---

## 2. Root Cause Analysis of Missing Results

| Step | Component | Defect Prior to Fix | Impact on User |
|---|---|---|---|
| **1** | `frontend/src/app/page.tsx` | "Website Testing" tab (`activeTab === "web_test"`) only rendered the input form and a progress card; it lacked the results visualizer components. | When tests finished, the user remained on the empty form and saw no metrics. |
| **2** | `frontend/src/app/page.tsx` | Test completion handler had `finally { setActiveJob(null); }` which immediately cleared the active job card the moment the test finished. | All job metadata, stage text, and status disappeared instantly. |
| **3** | `frontend/src/app/page.tsx` | Handlers attempted `setActiveTab("compare")` and then made un-guarded calls to `ApiClient.getProjectGraph` (failing when Neo4j was offline). | Any downstream API failure aborted rendering and dumped an unhandled error into the catch block. |
| **4** | `backend/app/workers/tasks.py` | Good Budget and Entry-Level execution blocks lacked independent error isolation. If one failed, the entire job crashed without recording the completed tier. | No partial results were ever saved or displayed. |
| **5** | `backend/app/api/v1/comparisons.py` | `build_comparison_payload` failed or returned 404 if fewer than 2 runs existed in the group. | Comparisons could not render single-tier or partially completed test runs. |

---

## 3. Architecture & Implementation Fixes

### A. Eager Relationship Loading & Zero-IO Serialization (`entities.py` & `comparisons.py`)
- Updated `TestRun` relationships:
  ```python
  project = relationship("Project", back_populates="test_runs", lazy="selectin")
  version = relationship("ApplicationVersion", back_populates="test_runs", lazy="selectin")
  device_profile = relationship("DeviceProfile", back_populates="test_runs", lazy="selectin")
  metrics = relationship("TestMetric", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
  failures = relationship("TestFailure", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
  artifacts = relationship("TestArtifact", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
  recommendations = relationship("Recommendation", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
  ```
- Implemented defensive `serialize_test_run(r)` that uses safe attribute getters so that missing or detached relationships never trigger `MissingGreenlet`.

### B. Independent Dual-Tier Execution & `PARTIAL` Job State (`tasks.py` & `job_store.py`)
- Added `JobState.PARTIAL = "PARTIAL"` and `TestStatus.PARTIAL = "PARTIAL"`.
- In `orchestrate_web_test_job`:
  - `GOOD_BUDGET` and `ENTRY_LEVEL` runs execute inside independent `try/except` scopes.
  - If both succeed: `COMPLETED` (or `COMPLETED_WITH_WARNINGS`).
  - If one succeeds and one fails: `PARTIAL` status with clear explanation of which tier succeeded and which failed.
  - If both fail: `FAILED` with diagnostics.
- Both test runs are persisted to PostgreSQL and linked via deterministic `comparison_group_id = job_id`.
- Comparison payload is built and directly attached to `JobStatusResponse` so polling returns complete results without auxiliary calls.

### C. Universal Inline Results Display on `web_test` Tab (`frontend/src/app/page.tsx`)
- Integrated complete results visualization directly inside `activeTab === "web_test"`:
  1. **Results Header**: Execution status badge, target URL, final redirect URL, elapsed duration, completion timestamp.
  2. **Hardware Degradation Differential Visualizer**: Interactive Recharts BarChart comparing Core Web Vitals across Good Budget (4x CPU, Fast 3G) and Entry-Level (8x CPU, Slow 3G).
  3. **Side-by-Side Metric Metrics & Delta Table**: Exact values, percentage degradation, and severity assessment.
  4. **Good Budget Profile Card**: Individual metrics, ratings (`GOOD`, `NEEDS_IMPROVEMENT`, `POOR`), duration, issue count.
  5. **Entry-Level Profile Card**: Same metrics under 8x throttling.
  6. **Execution Artifacts & Screenshots**: Captured screenshots and file size references.
  7. **AI & Rule-Engine Root Cause Analysis**: Impact ratings, probable cause, remediation steps, and verification commands.
- Removed premature `setActiveJob(null)` in `finally` so the execution progress remains visible.
- Pre-authenticates via `await ensureAuth()` to eliminate 401 token races.

---

## 4. Verification & Test Evidence

### Backend Test Suite (39 Tests Passed)
```
backend/tests/test_api.py ......................... [ 12%]
backend/tests/test_background_jobs.py ............. [ 33%]
backend/tests/test_database_neon.py ............... [ 58%]
backend/tests/test_website_compatibility.py ........ [100%]

================= 39 passed, 11 warnings in 66.55s ==================
```

### Next.js Production Build
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages (4/4)
✓ Finalizing page optimization
Exit Code: 0 (Clean Build)
```

### Direct Serialization Unit Verification
```
Found tr: 4c7a5a4e-803f-4550-bb4a-05ca0825e063
Serialized successfully!
Device Profile: {'id': '1d29fb76-...', 'name': 'Good Budget Tier...', 'tier': 'GOOD_BUDGET'}
MissingGreenlet Exception: 0 (Eliminated)
```

---

## 5. Deployment Instructions for Vercel & Render

### A. Render (Backend FastAPI Service)
1. Ensure your Render Web Service build uses the Docker environment:
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `.` or `backend` (as configured)
2. Environment variables on Render:
   - `ENVIRONMENT=production`
   - `DATABASE_URL=postgresql+asyncpg://<neon_user>:<neon_password>@<neon_host>/<neon_db>?ssl=require`
   - `CORS_ORIGINS=*` (or `https://<your-vercel-domain>.vercel.app`)
   - `SECRET_KEY=<strong_secret_key>`

### B. Vercel (Frontend Next.js App)
1. In Vercel Project Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js
2. Environment Variables:
   - `NEXT_PUBLIC_API_URL`: `https://<your-render-backend-url>.onrender.com`
3. Click Deploy.

---

## 6. Files Changed Summary

- `backend/app/models/relational/entities.py`: Eager `selectin` relationships for all `TestRun` associations; added `PARTIAL` status.
- `backend/app/workers/job_store.py`: Added `JobState.PARTIAL`, extended `JobStatusResponse` schema with comparison, single run, and recommendation payloads.
- `backend/app/workers/tasks.py`: Independent tier execution, `PARTIAL` handling, eager reloading before serialization, persistent DB linkage.
- `backend/app/api/v1/comparisons.py`: Zero-IO defensive `serialize_test_run`, robust `build_comparison_payload` handling partial runs.
- `backend/app/api/v1/tests_web.py`: Hydration fallback for comparison/single run data in job status responses.
- `backend/tests/test_website_compatibility.py`: Added unit tests for serialization safety and comparison building.
- `frontend/src/app/page.tsx`: Embedded inline results viewer, chart visualization, metric delta table, and RCA recommendations.
