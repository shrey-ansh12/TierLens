# TierLens Architecture Documentation

## 1. Architectural Principles
TierLens is designed from scratch to solve the critical gap between development environments and real-world consumer devices.

### Non-Negotiable Tenets:
1. **Real Data Integrity:** Never fake metrics or successful runs. If a system component or emulator is unconfigured, display explicit setup states.
2. **Deep Database Separation:**
   - **PostgreSQL:** Relational integrity for user accounts, workspaces, application versions, raw metrics, and audit logs.
   - **Neo4j:** Graph intelligence for mapping applications, versions, failure signatures, and causal connections.
3. **Decoupled Execution:** Long-running browser and device tests are asynchronously executed by dedicated workers without blocking client API threads.
4. **Zero-Hallucination Intelligence:** Root Cause Analysis is grounded first by a deterministic rule engine, optionally enhanced by an LLM prompt strictly constrained by captured evidence.

---

## 2. Testing Engines

### Engine A: Playwright Web Testing
- Controls headless Chromium instances via asynchronous Playwright.
- Connects through Chrome DevTools Protocol (CDP) to enforce:
  - `Emulation.setCPUThrottlingRate`: 4x for Good Budget, 8x for Entry-Level.
  - `Network.emulateNetworkConditions`: Custom download/upload bandwidth and latency.
- Extracts standard Web Vitals:
  - **FCP (First Contentful Paint)**
  - **LCP (Largest Contentful Paint)**
  - **CLS (Cumulative Layout Shift)**
  - **TTFB (Time to First Byte)**
  - **Page Load Duration**
- Intercepts and captures runtime JavaScript console errors, uncaught exceptions, and failed HTTP requests (4xx/5xx).
- Captures full-page screenshots stored under `/artifacts`.

### Engine B: Android APK Testing
- Pure Python ZIP manifest inspector extracts package name, version, and declared permissions.
- Interfaces with host ADB to query `adb devices -l`.
- If ADB or device is not present, returns a structured `SETUP_REQUIRED` response without falsifying tests.
- When an emulator or device is connected:
  - Installs APK via `adb install -r`.
  - Injects monkey launch intent.
  - Samples PSS memory via `dumpsys meminfo`.
  - Captures fatal exceptions and ANRs via `logcat -d`.

---

## 3. Neo4j Graph Model

### Node Labels:
- `Workspace`
- `Application`
- `DeviceProfile`
- `TestRun`
- `Metric`
- `Failure`
- `ErrorSignature`
- `Recommendation`

### Relationships:
- `(:Workspace)-[:CONTAINS]->(:Application)`
- `(:Application)-[:EXECUTED_TEST]->(:TestRun)`
- `(:TestRun)-[:EXECUTED_ON]->(:DeviceProfile)`
- `(:TestRun)-[:HAS_METRIC]->(:Metric)`
- `(:TestRun)-[:PRODUCED_FAILURE]->(:Failure)`
- `(:Failure)-[:MATCHES_ERROR_SIGNATURE]->(:ErrorSignature)`
- `(:TestRun)-[:RECOMMENDS]->(:Recommendation)`
