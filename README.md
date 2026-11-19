# TierLens

**Application Performance & Device Intelligence Platform**

TierLens empowers engineering teams to measure, compare, diagnose, and optimize web and Android applications under realistic hardware and network constraints.

Developers build and test on flagship hardware, 32GB RAM, and gigabit fiber. Meanwhile, real users across global markets run budget processors, 2GB–4GB RAM, and unstable cellular networks. TierLens exposes regressions and device-specific failures before end users experience them.

---

## Key Highlights

- **Dual Testing Engines:**
  - **Engine A (Web):** Real browser execution via Playwright, Chromium, and Chrome DevTools Protocol (CDP). Measures Core Web Vitals (FCP, LCP, CLS, TTFB, INP), console exceptions, and network request failures under 4x and 8x CPU slowdowns and simulated 2G/3G networks.
  - **Engine B (Android APK):** Host-level ADB bridge. Inspects APK archives, extracts package manifests and permissions, and profiles memory (`dumpsys meminfo`), CPU (`top`), and Logcat exception traces on connected devices or emulators.
- **Central Differentiator (Device Comparison):**
  - Side-by-side comparative diff between **Good Budget** (~$150–$200 bracket) and **Entry-Level** (~$70–$100 bracket).
  - Automated calculation of degradation percentages, layout shift deltas, and detection of device-specific exclusive crashes.
- **Dual-Database Architecture:**
  - **PostgreSQL:** Relational source of truth for accounts, workspaces, applications, test runs, metrics, and audit logs. (Includes automatic local SQLite fallback for instant zero-dependency execution).
  - **Neo4j Graph Database:** Knowledge graph modeling complex relationships between Applications, Runs, Hardware Profiles, Metrics, Failures, and Error Signatures.
- **Evidence-Grounded Root Cause Analysis:**
  - Deterministic rule engine providing verified recommendations without AI hallucinations.
  - Optional LLM integration (Google Gemini / OpenAI) strictly bounded by captured evidence.
- **Strict Real Data Policy:**
  - Zero fabricated metrics. If ADB or emulator is missing, displays an explicit `SETUP_REQUIRED` status. If Neo4j is offline, reports disconnected status rather than inventing graph nodes.

---

## System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               TierLens Frontend              │
                    │   Next.js 14+ (App Router) + Tailwind + shadcn│
                    │  - Side-by-Side Comparator & Failure Explorer│
                    │  - Neo4j D3/Canvas Graph & Live Test Monitor │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTPS / SSE / WSS
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │               FastAPI Backend                │
                    │ - Auth, Workspaces & Project Governance     │
                    │ - Real-time SSE / WebSocket Event Hub        │
                    │ - Security Gate (SSRF / APK Sanitizer)       │
                    │ - Graph Intelligence & AI RCA Orchestrator   │
                    └──────┬───────────────┬──────────────┬────────┘
                           │               │              │
             SQLAlchemy    │               │ Async Jobs   │ Cypher Queries
                           ▼               ▼              ▼
                    ┌────────────┐   ┌───────────┐  ┌───────────┐
                    │ PostgreSQL │   │   Redis   │  │   Neo4j   │
                    │ (Relational│   │  (Broker  │  │(Intelligence│
                    │   Store)   │   │  & Cache) │  │  Graph)   │
                    └────────────┘   └─────┬─────┘  └───────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │            Asynchronous Test Workers         │
                    │                    (Celery)                  │
                    ├──────────────────────────────┬───────────────┤
                    │   ENGINE A: Web Performance  │ ENGINE B: APK │
                    │   - Playwright / Chromium    │ - ADB Client  │
                    │   - Lighthouse Audits        │ - AVD Manager │
                    │   - CDP (Network/CPU Emul)   │ - Logcat/ANR  │
                    │   - HAR & Console Traces     │ - Mem/CPU Mon │
                    └──────────────────────────────┴───────────────┘
```

---

## Quickstart Guide (Local Development)

### Prerequisites
- **Python:** 3.11+
- **Node.js:** 18+ (Node 20 or 24 recommended)
- **Git**
- *(Optional for full stack)* Docker Desktop (for containerized PostgreSQL, Neo4j, Redis)
- *(Optional for APK testing)* Android Studio / ADB

### 1. Setup Backend
```bash
# In project root:
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium

# Run FastAPI backend:
$env:PYTHONPATH="."
uvicorn app.main:app --reload --port 8000
```
Backend API interactive documentation is available at `http://localhost:8000/docs`.

### 2. Setup Frontend
```bash
# In frontend folder:
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### 3. Run with Docker Compose
To run the full stack including PostgreSQL, Neo4j, and Redis:
```bash
docker compose up -d
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Neo4j Browser UI: `http://localhost:7474`
- PostgreSQL: `localhost:5432`

---

## Verification & Automated Testing

Run the automated backend test suite:
```bash
# In project root:
$env:PYTHONPATH="backend"
backend\.venv\Scripts\pytest.exe backend\tests -v
```

Tests cover:
- SSRF prevention (blocking private subnets, loopbacks, cloud metadata endpoints)
- System health diagnostic checks
- User registration, workspace provisioning, and JWT authentication
- Deterministic Root Cause Analysis rule engine
- Playwright Chromium execution

---

## Real Data Policy & Constraints
- Browser-throttled CPU / network emulation is distinct from physical device measurements and is clearly marked in all data schemas (`is_emulated: true`).
- If an Android device/emulator is not connected, TierLens explicitly reports `SETUP_REQUIRED: ADB / Android SDK not found` rather than mocking execution results.
- Neo4j graph visualizations display real Neo4j database entities; if disconnected, the UI displays a clear connectivity banner and setup command.
