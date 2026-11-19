# TierLens Windows 11 Setup Guide

This guide walks through configuring TierLens on a native Windows 11 workstation.

## System Prerequisites
- **Python 3.11+** installed (check with `python --version`)
- **Node.js 18+** installed (check with `node --version`)
- **PowerShell 7+** or Windows PowerShell 5.1
- *(Optional)* **Docker Desktop for Windows** with WSL2 backend enabled (for containerized PostgreSQL, Neo4j, Redis)
- *(Optional for APK testing)* **Android Studio** or Android Commandline Tools (for ADB and AVD emulators)

---

## 1. Quick Start (No Docker Required)
TierLens includes an automatic zero-friction SQLite fallback for local development.

### Step 1: Initialize Backend
Open PowerShell in the project directory:
```powershell
cd "c:\Users\shrey\OneDrive\Desktop\hackfront 1"

# Create Virtual Environment if not created:
python -m venv backend\.venv

# Activate Virtual Environment:
.\backend\.venv\Scripts\Activate.ps1

# Install requirements & Playwright Chromium:
pip install -r backend\requirements.txt
playwright install chromium

# Launch the FastAPI backend:
$env:PYTHONPATH="backend"
python -m uvicorn app.main:app --reload --port 8000
```
The backend API is now running on `http://localhost:8000`.

### Step 2: Initialize Frontend
Open a second PowerShell window:
```powershell
cd "c:\Users\shrey\OneDrive\Desktop\hackfront 1\frontend"
npm install
npm run dev
```
Open `http://localhost:3000` to interact with the TierLens platform.

---

## 2. Full Stack with Docker Desktop (PostgreSQL + Neo4j + Redis)
If Docker Desktop is installed on your machine:
```powershell
cd "c:\Users\shrey\OneDrive\Desktop\hackfront 1"
docker compose up -d postgres neo4j redis
```

- **PostgreSQL:** Running on `localhost:5432` (`tierlens_db`)
- **Neo4j Browser UI:** Open `http://localhost:7474` (Auth: `neo4j` / `tierlens_graph_pass`)
- **Redis:** Running on `localhost:6379`

The backend will automatically detect and connect to PostgreSQL and Neo4j.

---

## 3. Configuring Android APK Testing (Engine B)
To enable Android testing:
1. Install [Android Studio](https://developer.android.com/studio).
2. Open Android Studio → SDK Manager → SDK Tools tab → Install **Android SDK Platform-Tools**.
3. Add the `platform-tools` path to your User Environment Variables:
   - Typically: `%LOCALAPPDATA%\Android\Sdk\platform-tools`
4. Connect an Android phone with USB Debugging enabled, or create an Android Virtual Device (AVD).
5. Verify in PowerShell:
   ```powershell
   adb devices
   ```
6. TierLens will automatically detect the device and switch ADB status to `READY`.
