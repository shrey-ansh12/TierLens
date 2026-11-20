# TierLens — Neon PostgreSQL Deployment Readiness Report

**Status**: Verified & Ready for Render Deployment  
**Audited**: November 2026  
**Scope**: Database URL Normalization, Neon SSL Compatibility, Production Safety, Table Initialization, Startup Health

---

## 1. Summary of Changes

The database configuration has been updated with minimal, targeted modifications to guarantee zero-downtime compatibility with Neon PostgreSQL on Render:

| File Path | Action | Description |
| :--- | :--- | :--- |
| `backend/app/core/db_url.py` | **Created** | Dedicated URL normalization and masking engine. Safely converts Neon/PostgreSQL URLs (`postgres://`, `postgresql://`) to `postgresql+asyncpg://` (async) or `postgresql+psycopg2://` (sync), transforms `sslmode=require` to asyncpg-compatible `ssl=require`, strips unsupported libpq keywords (`channel_binding`, `gssencmode`), and provides credential-safe logging via `mask_database_url()`. |
| `backend/app/config.py` | **Modified** | Added Pydantic `field_validator` hooks for `DATABASE_URL` and `SYNC_DATABASE_URL`, a `model_validator` that auto-derives `SYNC_DATABASE_URL` if omitted, enforces strict PostgreSQL mode in production (`ENVIRONMENT="production"` or `DATABASE_MODE="postgres_required"`), and disables SQLite fallback. Added `get_masked_database_url()` and `get_masked_sync_database_url()`. |
| `backend/app/core/database.py` | **Modified** | Updated PostgreSQL `create_async_engine` with conservative connection pool settings (`pool_size=5`, `max_overflow=5`, `pool_recycle=300`, `pool_pre_ping=True`, `pool_timeout=30.0`). Replaced raw URL logging with `mask_database_url()`. Updated `init_db()` to explicitly import and register all 11 relational models before `Base.metadata.create_all`, raising clean errors in production. |
| `backend/app/main.py` | **Modified** | Added pre-flight PostgreSQL connectivity probe (`SELECT 1`) during startup `lifespan` in production. Fails fast with descriptive diagnostics if PostgreSQL is unreachable, never leaking passwords. |
| `backend/tests/test_database_neon.py` | **Created** | Comprehensive automated test suite covering URL normalization, SSL translation, credential encoding, missing variables, production mode guardrails, and table initialization. |

---

## 2. Exact URL Formats Expected for Render

Render environment variables can provide either standard `postgres://`, `postgresql://`, or pre-normalized `postgresql+asyncpg://` URLs:

| Context | Expected Format on Render | Normalized Engine Format | Driver |
| :--- | :--- | :--- | :--- |
| **`DATABASE_URL` (Async)** | `postgres://user:pass@ep-cool.neon.tech/neondb?sslmode=require`<br>*(or `postgresql://...`)* | `postgresql+asyncpg://user:pass@ep-cool.neon.tech/neondb?ssl=require` | `asyncpg` (`0.29.0`) |
| **`SYNC_DATABASE_URL` (Sync)** | *(Optional, auto-derived from `DATABASE_URL`)* | `postgresql+psycopg2://user:pass@ep-cool.neon.tech/neondb?sslmode=require` | `psycopg2-binary` (`2.9.9`) |
| **`SQLITE_DATABASE_URL` (Dev)** | `sqlite+aiosqlite:///./tierlens.db` | `sqlite+aiosqlite:///./tierlens.db` | `aiosqlite` (`0.20.0`) |

### Key Handling Capabilities:
- **Neon Direct Endpoint**: Fully supported (e.g., `ep-*.neon.tech`).
- **URL-Encoded Passwords**: Usernames and passwords containing special characters (e.g. `@`, `:`, `!`, `%`) are accurately decoded and preserved via SQLAlchemy's `make_url`.
- **Secret Masking**: All logs and exceptions render URLs as `postgresql+asyncpg://user:***@host:5432/dbname?ssl=require`. Passwords are never output in plain text.

---

## 3. SSL Configuration Behavior

### The Problem Identified in Audit:
- Neon connection strings use `?sslmode=require` (the standard libpq convention).
- While `psycopg2` expects `sslmode`, `asyncpg.connect()` does **not** accept an `sslmode` keyword argument. Passing `sslmode=require` to `asyncpg.connect()` causes an immediate `TypeError: connect() got an unexpected keyword argument 'sslmode'`.
- Neon strings may also append `channel_binding=require` or `gssencmode=disable`, which also trigger `TypeError` in `asyncpg`.

### The Solution Implemented:
1. **Async Engine (`asyncpg`)**:
   - `normalize_database_url(url, is_async=True)` extracts `sslmode`.
   - If `sslmode != "disable"`, it sets `ssl="require"` in the query string, which `asyncpg.connect()` natively accepts.
   - It purges `channel_binding` and `gssencmode` from the async query parameters.
2. **Sync Engine (`psycopg2`)**:
   - `normalize_database_url(url, is_async=False)` retains or ensures `sslmode=require` for libpq compatibility.

---

## 4. Connection Pooling Configuration

Configured on `create_async_engine` in `backend/app/core/database.py`:
- `pool_size`: `5` (Conservative for a single Render free/starter instance)
- `max_overflow`: `5`
- `pool_recycle`: `300` (Recycles idle connections every 5 minutes to avoid Neon connection dropouts)
- `pool_pre_ping`: `True` (Checks socket liveness before checkout to prevent dead connection errors)
- `pool_timeout`: `30.0` seconds

---

## 5. Production Database Safety & Schema Initialization

- **No Silent Fallback**: When `ENVIRONMENT="production"` or `DATABASE_MODE="postgres_required"`, SQLite fallback is strictly disabled (`SQLITE_FALLBACK_ENABLED = False`). If PostgreSQL is unavailable, the application immediately logs a clear diagnostic error and halts, rather than creating an ephemeral `./tierlens.db` file.
- **Model Registration**: In `init_db()`, `import app.models.relational` is explicitly executed before `Base.metadata.create_all`. All 11 relational entities are guaranteed to be registered:
  - `users`
  - `workspaces`
  - `projects`
  - `application_versions`
  - `device_profiles`
  - `test_runs`
  - `test_metrics`
  - `test_failures`
  - `test_artifacts`
  - `recommendations`
  - `audit_logs`
- **Startup Probe**: On application launch, FastAPI's lifespan executes a test `SELECT 1` ping. If credentials or network configuration to Neon fail, startup aborts immediately with a masked URL error, preventing degraded operation.

---

## 6. Automated Tests Executed & Results

All 22 automated tests in the test suite passed:

```text
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-8.2.0, pluggy-1.7.0
rootdir: C:\Users\shrey\OneDrive\Desktop\hackfront 1
plugins: anyio-4.16.0, asyncio-0.23.6
collected 22 items

backend/tests/test_api.py::test_root_endpoint PASSED                     [  4%]
backend/tests/test_api.py::test_system_health_endpoint PASSED            [  9%]
backend/tests/test_api.py::test_ssrf_protection_blocks_private_networks PASSED [ 13%]
backend/tests/test_api.py::test_rule_based_rca_engine PASSED             [ 18%]
backend/tests/test_api.py::test_user_registration_and_auth_flow PASSED   [ 22%]
backend/tests/test_background_jobs.py::test_unauthenticated_request_rejected PASSED [ 27%]
backend/tests/test_background_jobs.py::test_job_submission_returns_immediate_202_accepted PASSED [ 31%]
backend/tests/test_background_jobs.py::test_job_status_retrieval PASSED  [ 36%]
backend/tests/test_background_jobs.py::test_job_cancellation PASSED      [ 40%]
backend/tests/test_background_jobs.py::test_cross_workspace_access_forbidden PASSED [ 45%]
backend/tests/test_background_jobs.py::test_terminal_state_immutability PASSED [ 50%]
backend/tests/test_background_jobs.py::test_atomic_workspace_quota_enforcement PASSED [ 54%]
backend/tests/test_background_jobs.py::test_invalid_job_id_returns_404 PASSED [ 59%]
backend/tests/test_database_neon.py::test_standard_postgresql_url_normalization PASSED [ 63%]
backend/tests/test_database_neon.py::test_neon_url_normalization PASSED  [ 68%]
backend/tests/test_database_neon.py::test_already_normalized_async_url PASSED [ 72%]
backend/tests/test_database_neon.py::test_sync_url_conversion PASSED     [ 77%]
backend/tests/test_database_neon.py::test_ssl_parameter_handling_and_filtering PASSED [ 81%]
backend/tests/test_database_neon.py::test_credential_preservation_and_masking PASSED [ 86%]
backend/tests/test_database_neon.py::test_missing_database_url_handling PASSED [ 90%]
backend/tests/test_database_neon.py::test_production_mode_safety_and_sqlite_disabled PASSED [ 95%]
backend/tests/test_database_neon.py::test_database_table_initialization_all_entities PASSED [100%]

====================== 22 passed, 12 warnings in 24.89s =======================
```

---

## 7. Remaining Blockers

**Zero database blockers remain for Neon deployment.**

### Deployment Checklist for Render:
1. In Render Dashboard for the Web Service, set:
   - `ENVIRONMENT` = `production`
   - `DATABASE_URL` = `<your-neon-connection-string>` (can be pasted directly with `postgres://` or `postgresql://` and `?sslmode=require`)
   - `SECRET_KEY` = `<strong-random-jwt-key>`
2. Direct connection strings (`ep-*.neon.tech`) are supported out-of-the-box.
3. No secrets or complete connection strings were printed or committed.
