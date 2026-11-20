# CheapPhone Lab — Universal Website Compatibility & Reliable Testing Engine Report

**Project**: TierLens (CheapPhone Lab Engine)  
**Date**: November 21, 2026  
**Status**: Completed & Verified  

---

## 1. Executive Summary

The testing engine of CheapPhone Lab has been significantly upgraded from a narrow synthetic tester to an industrial, universal web performance evaluation engine. The engine now supports testing arbitrary publicly accessible HTTP/HTTPS websites under realistic budget-phone hardware and network throttling profiles.

Crucially, testing failures are **never indiscriminately classified as target website crashes**. All navigation issues, infrastructure errors, HTTP statuses, and client runtime bugs are categorized deterministically across 8 distinct error classes, and real performance metrics (Web Vitals) are collected without synthetic fallbacks.

---

## 2. Changes Implemented

### 2.1 Deterministic Error Classifier (`backend/app/engines/web/classifier.py`)
- Created a deterministic classification engine mapping execution outcomes to 8 distinct categories:
  1. `TARGET_APPLICATION_ERROR`: Uncaught JS runtime errors (`TypeError`, `ReferenceError`, `window.onerror`, unhandled promise rejections).
  2. `NETWORK_ERROR`: DNS resolution failures (`ERR_NAME_NOT_RESOLVED`), connection refused (`ECONNREFUSED`), connection reset, unreachable hosts.
  3. `HTTP_ERROR`: Explicit HTTP 4xx (client) and 5xx (server) responses, retaining exact HTTP status codes.
  4. `BROWSER_INFRASTRUCTURE_ERROR`: Missing browser binaries, Chromium launch timeouts, or browser process crashes.
  5. `ACCESS_RESTRICTION`: Cloudflare Turnstile, CAPTCHA challenges, bot protection gates, or 403 access barriers.
  6. `NAVIGATION_TIMEOUT`: Failure to reach interactive DOM state within configured device timeout budgets.
  7. `SSL_ERROR`: TLS handshake failures, expired or self-signed certificates, and cipher mismatches.
  8. `UNKNOWN_ERROR`: Non-deterministic anomalies that cannot be safely attributed to the target site.

### 2.2 Truthful Performance Metric Extraction (`backend/app/engines/web/metrics.py`)
- **Removed all synthetic metric fallbacks**: Removed hardcoded fallbacks (`350ms`, `600ms`) and mathematical fabrications (`fcp * 1.35`).
- Employs genuine `PerformanceObserver` and Navigation Timing API v2:
  - TTFB (Time to First Byte)
  - FCP (First Contentful Paint)
  - LCP (Largest Contentful Paint)
  - CLS (Cumulative Layout Shift)
  - DOM Content Loaded duration
  - Total Page Load duration
  - JavaScript console error count & network request failure count.
- If a metric cannot be captured (e.g., LCP observer didn't trigger before page close or headless rendering stopped), it returns `null`/`None` and displays `UNAVAILABLE`, strictly avoiding fabricated values.

### 2.3 Browser Resilience & Multi-Tier Navigation (`backend/app/engines/web/runner.py`)
- **Pre-flight Chromium verification**: Probes binary existence and system libraries prior to test dispatch.
- **Transient launch retry**: Handles transient OS process lockups with exponential backoff (up to 2 retries).
- **Intelligent multi-tier navigation**:
  - Uses `wait_until="domcontentloaded"` as primary milestone.
  - Soft-waits for `"load"` (capped at 8 seconds) so long-running analytics or streaming websockets never hang tests.
  - Awaits `body` element rendering and allows a brief hydration settle (500ms) for SPAs (React, Next.js, Vue).
- **Resource isolation & guaranteed cleanup**: Closes CDP sessions, pages, contexts, and browser instances in strict `finally` blocks, eliminating memory and zombie process leaks.

### 2.4 Security & SSRF Protection on Redirects (`backend/app/core/security.py`)
- Validates every HTTP redirect against strict SSRF filter rules:
  - Resolves destination hostnames and blocks private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
  - Prohibits cloud metadata endpoints (`169.254.169.254`).
  - Preserves loopback and private network isolation throughout multi-hop redirects.

### 2.5 Relational Entities & Background Worker (`backend/app/models/relational/entities.py`, `backend/app/workers/tasks.py`)
- Added `COMPLETED_WITH_WARNINGS` test status for runs where navigation succeeded but target pages experienced non-fatal console exceptions or missing vitals.
- Updated database schemas and job responses to expose `error_category`, `error_details`, `final_url`, and `redirect_count`.

### 2.6 Frontend Diagnostics & Error Badges (`frontend/src/app/page.tsx`)
- Updated Active Job progress cards and Failure Explorer with color-coded badges for all 8 error categories.
- Distinguishes clearly between:
  - Test Completed (Green)
  - Test Completed with Warnings (Amber)
  - Target Application Error (Red)
  - Access Restricted / Bot Challenge (Purple)
  - Network Error / DNS Failure (Orange)
  - Navigation Timeout (Yellow)
  - Infrastructure Failure (Slate)

---

## 3. Supported Website Categories

The upgraded engine supports testing across real-world architectures:
1. **Static HTML Websites**: Instant DOM rendering and fast metric collection.
2. **React & Next.js SPAs**: Waits for client-side root mounting and hydration.
3. **Vue & Angular Single Page Applications**: Handles asynchronous component injection.
4. **JavaScript-Heavy & Dynamic Content**: Captures DOM updates and client-side route transitions.
5. **E-Commerce & Media Portals**: Captures real layout shifts (CLS) and largest paint items without locking on background marketing pixels.
6. **Websites with Multiple Redirects**: Tracks initial and final URLs, preserving SSRF validation at every hop.

---

## 4. Test Suite & Validation Results

A dedicated compatibility test suite (`backend/tests/test_website_compatibility.py`) was executed using Playwright and pytest:

| Test Case | Scenario / Target | Expected Classification | Actual Result |
| :--- | :--- | :--- | :--- |
| `test_classify_network_errors` | DNS failure (`ERR_NAME_NOT_RESOLVED`), connection refused | `NETWORK_ERROR` | **PASSED** |
| `test_classify_ssl_errors` | Untrusted/expired TLS cert (`ERR_CERT_COMMON_NAME_INVALID`) | `SSL_ERROR` | **PASSED** |
| `test_classify_navigation_timeouts` | Page load timeout exceeded | `NAVIGATION_TIMEOUT` | **PASSED** |
| `test_classify_http_errors` | Server error 500, Client error 404 | `HTTP_ERROR` | **PASSED** |
| `test_classify_access_restrictions` | Cloudflare Turnstile, CAPTCHA, 403 challenge | `ACCESS_RESTRICTION` | **PASSED** |
| `test_classify_browser_infrastructure` | Executable missing, browser process crash | `BROWSER_INFRASTRUCTURE_ERROR` | **PASSED** |
| `test_classify_target_application_errors`| Uncaught TypeError, syntax errors | `TARGET_APPLICATION_ERROR` | **PASSED** |
| `test_ssrf_blocks_private_networks` | Target URL pointing to `127.0.0.1` or `169.254.169.254` | Blocked with HTTP 400/403 | **PASSED** |
| `test_ssrf_redirect_validation` | Public site redirecting to internal private network | Blocked with ValueError | **PASSED** |
| `test_browser_execution_on_static_html` | Real Chromium rendering of HTML fixture | DOM content verified & metrics collected | **PASSED** |
| `test_browser_execution_on_spa` | Async React DOM insertion fixture | Waited for element, extracted CLS & timings | **PASSED** |
| `test_browser_captures_runtime_js_errors`| Script throwing `undefined.foo()` | Caught and classified as `TARGET_APPLICATION_ERROR` | **PASSED** |
| `test_runner_on_public_live_website` | Live execution against `https://example.com` | `COMPLETED`, TTFB & FCP gathered | **PASSED** |
| `test_runner_on_unresolvable_domain` | Non-existent domain `https://unresolvable-...org` | `FAILED`, classified as `NETWORK_ERROR` | **PASSED** |
| `test_metric_vital_rating_ratings` | None/null vitals handling | Returned `UNAVAILABLE` without fabricating | **PASSED** |

**Summary of Test Run**:
- `test_website_compatibility.py`: **16 of 16 tests passed** (100%).
- Full regression suite (`test_api.py`, `test_background_jobs.py`, `test_database_neon.py`, `test_website_compatibility.py`): **39 of 39 tests passed**.
- Frontend Next.js build: **Compiled with zero errors**.

---

## 5. Known Limitations & Scope Boundaries

1. **Anti-Bot & CAPTCHA Walls**: Websites protected by aggressive bot-mitigation engines (Cloudflare Turnstile, Arkose Labs, Akamai Bot Manager, reCAPTCHA) will be classified accurately as `ACCESS_RESTRICTION`. By design and security policy, the engine does not solve or bypass CAPTCHAs.
2. **Authenticated / Paywalled Portals**: Pages requiring corporate SSO, OAuth logins, or hard paywalls will return `ACCESS_RESTRICTION` or `HTTP_ERROR (401/403)`.
3. **Private IP Addresses**: Access to `localhost`, internal RFC 1918 subnets, and cloud instance metadata (`169.254.169.254`) is strictly blocked by SSRF defense mechanisms.

---

## 6. Deployment & Environment Readiness

- **Playwright Dependencies**: Configured in Dockerfile using Debian 12 packages (`fonts-liberation`, `fonts-noto-color-emoji`, `libx11-xcb1`, etc.) with `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
- **Database Engine**: Neon PostgreSQL connected over SSL using connection pooling compatibility (`NullPool` for external PgBouncer pooler).
- **Frontend**: Fully compatible with Vercel deployment under `frontend` root directory.
