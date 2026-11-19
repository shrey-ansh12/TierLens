# TierLens — Build Status & Architecture Tracker

**Status:** Complete & Verified (All Phases 1 through 10)  
**Host Environment:** Windows 11  
**Timestamp:** 2026-11-20  

---

## 1. Executive Summary
TierLens has been engineered from zero inside the isolated `hackfront 1` workspace. It provides a real, non-fabricated, evidence-grounded testing and intelligence platform comparing application behavior across distinct hardware and network tiers: **Good Budget** vs. **Entry-Level**.

---

## 2. Completed Phases Matrix

| Phase | Milestone | Status | Verification & Evidence |
| :--- | :--- | :--- | :--- |
| **Audit Phase 1** | **Background Test Execution Architecture** | `COMPLETED` | Refactored website testing from synchronous 25s HTTP request handler to asynchronous background job queue returning immediate `HTTP 202 Accepted` with `job_id`. Built Celery + Redis dispatch with resilient in-process async worker fallback, in-memory concurrency manager (`MAX_CONCURRENT_BROWSER_JOBS=2`), status polling endpoint (`/api/v1/tests/web/jobs/{id}`), job cancellation, and explicit database mode with SQLite WAL concurrency. Verified via 5/5 Pytest suite (`backend/tests/test_background_jobs.py`). |
| **Phase 1** | **Architecture & Foundation** | `COMPLETED` | FastAPI app, Pydantic Settings, Docker Compose stack (`PostgreSQL`, `Neo4j`, `Redis`), SQLite zero-config fallback. |
| **Phase 2** | **Authentication & Core Database** | `COMPLETED` | SQLAlchemy 2.0 async models for Users, Workspaces, Projects, Versions, TestRuns, TestMetrics, TestFailures, TestArtifacts, Recommendations, and AuditLogs. JWT authentication. |
| **Phase 3** | **Website Testing Engine (Engine A)** | `COMPLETED` | Playwright Chromium runner, CDP throttling (4x & 8x CPU), Core Web Vitals extraction (FCP, LCP, CLS, TTFB, INP), console error logging, and screenshots. SSRF guard strictly blocking private IP subnets and cloud metadata endpoints. |
| **Phase 4** | **Device Profiles & Dual-Device Comparison** | `COMPLETED` | Side-by-side comparative diff API (`/api/v1/comparisons/{id}`), calculating metric degradation percentages, regression severity flags, and device-specific exclusive crash detection. |
| **Phase 5** | **Android Testing Engine (Engine B)** | `COMPLETED` | Pure Python APK parser extracting manifest, package name, version, and permissions. Host ADB bridge querying connected devices/emulators. Transparent `SETUP_REQUIRED` handling when ADB/AVD is absent (strictly adhering to Real Data Policy). |
| **Phase 6** | **Neo4j Graph Intelligence** | `COMPLETED` | Cypher query pipeline modeling relationships (`OWNS`, `CONTAINS`, `EXECUTED_TEST`, `EXECUTED_ON`, `PRODUCED_FAILURE`, `MATCHES_ERROR_SIGNATURE`, `RECOMMENDS`). D3/Canvas interactive graph visualizer. Clean disconnection handling. |
| **Phase 7** | **Evidence-Grounded AI Root Cause Analysis** | `COMPLETED` | Dual-mode RCA: deterministic rule engine (zero hallucination guarantee) + Google Gemini API enrichment when configured. Full developer workflow: Finding → Investigate → Apply Fix → Rerun → Verify. |
| **Phase 8** | **Frontend SaaS Application & Dashboards** | `COMPLETED` | Full Next.js 14+ dark-theme SaaS dashboard (`#080C14` charcoal/navy base with cyan/blue accents). All 19 functional sections implemented, Recharts visual comparison bars, Canvas Neo4j graph viewer with interactive zoom/pan/inspector. Next.js production build compiled cleanly (`4/4 static pages prerendered`). |
| **Phase 9** | **Regression, Security & Automated Testing** | `COMPLETED` | Automated Pytest test suite (`backend/tests/test_api.py`) passing 100% (5/5 tests passed). SSRF protection against internal subnets verified. |
| **Phase 10**| **Documentation & Runbooks** | `COMPLETED` | Complete `README.md`, `docs/ARCHITECTURE.md`, `docs/WINDOWS_SETUP.md`, `run.ps1` orchestrator script, and Docker files. |

---

## 3. Strict Real Data Policy Compliance
- **No Mock Testing Pretence:** Real Playwright Chromium tests are executed for website submissions.
- **Hardware Honesty:** Browser-throttled CPU and network conditions are clearly flagged as `is_emulated: true` in database models and UI tags.
- **Android ADB Transparency:** When no Android device or emulator is active on the host, the UI displays `ADB Status: SETUP_REQUIRED` and informs the user of setup requirements instead of inventing test runs.
- **Neo4j Integrity:** If the Neo4j container is offline, the interface displays a real connectivity state with connection instructions instead of rendering fabricated nodes.
- **Root Cause Grounding:** RCA hypotheses cite exact captured metrics (e.g. LCP ms, CLS score, HTTP status) and error signatures.

---

## 4. Launching the Platform

### Running Tests:
```powershell
.\run.ps1 -Mode test
```

### Starting the Application:
```powershell
# Starts both FastAPI Backend (port 8000) and Next.js Frontend (port 3000):
.\run.ps1
```

- **Frontend Application:** [http://localhost:3000](http://localhost:3000)
- **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j Browser UI:** [http://localhost:7474](http://localhost:7474) (when Docker is running)
