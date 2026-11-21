param (
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = $PSScriptRoot
$env:PYTHONPATH = "$WorkspaceRoot\backend"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   TIERLENS - Application Performance and Device Intelligence" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Locate best available unblocked Python executable
$PythonCandidates = @(
    "$WorkspaceRoot\backend\.venv\Scripts\python.exe",
    "$WorkspaceRoot\.venv\Scripts\python.exe",
    (Get-Command python -ErrorAction SilentlyContinue).Source,
    (Get-Command python3 -ErrorAction SilentlyContinue).Source,
    (Get-Command py -ErrorAction SilentlyContinue).Source,
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
    "C:\Python311\python.exe",
    "C:\Python312\python.exe",
    "C:\Users\shrey\AppData\Local\Programs\Python\Python311\python.exe",
    "C:\Users\Harsh\AppData\Local\Python\bin\python.exe"
)
$PythonExe = $null
foreach ($cand in $PythonCandidates) {
    if ($cand -and (Test-Path $cand)) {
        try {
            $testOut = & $cand --version 2>&1
            if ($LASTEXITCODE -eq 0 -or $testOut -match "Python") {
                $PythonExe = $cand
                break
            }
        } catch {}
    }
}

if (-not $PythonExe) {
    Write-Host "[!] Error: Working Python executable not found on this machine. Please install Python 3.10+." -ForegroundColor Red
    exit 1
}

# Auto-provision local .env if missing on fresh clone
if (-not (Test-Path "$WorkspaceRoot\.env")) {
    if (Test-Path "$WorkspaceRoot\.env.example") {
        Write-Host "[*] Creating .env from template..." -ForegroundColor Yellow
        Copy-Item "$WorkspaceRoot\.env.example" "$WorkspaceRoot\.env"
    }
}

# Auto-provision backend virtualenv if missing on new laptop
$VenvPython = "$WorkspaceRoot\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython) -and $PythonExe -notmatch "\\backend\\\.venv\\") {
    Write-Host "[*] Setting up local backend virtual environment..." -ForegroundColor Yellow
    & $PythonExe -m venv "$WorkspaceRoot\backend\.venv"
    if (Test-Path $VenvPython) {
        $PythonExe = $VenvPython
        & $PythonExe -m pip install --upgrade pip -q
        if (Test-Path "$WorkspaceRoot\backend\requirements.txt") {
            Write-Host "[*] Installing backend dependencies..." -ForegroundColor Yellow
            & $PythonExe -m pip install -r "$WorkspaceRoot\backend\requirements.txt" -q
        }
    }
}

# Auto-provision frontend dependencies if missing on new laptop
if (-not (Test-Path "$WorkspaceRoot\frontend\node_modules")) {
    Write-Host "[*] Installing frontend npm dependencies..." -ForegroundColor Yellow
    Push-Location "$WorkspaceRoot\frontend"
    npm.cmd install --silent
    Pop-Location
}

if ($Mode -eq "test") {
    Write-Host "`n[+] Executing Automated Backend Pytest Suite..." -ForegroundColor Yellow
    & $PythonExe -m pytest "$WorkspaceRoot\backend\tests" -q
    exit $LASTEXITCODE
}

if ($Mode -eq "backend" -or $Mode -eq "all") {
    Write-Host "`n[+] Starting FastAPI Backend on http://localhost:8000 using $PythonExe..." -ForegroundColor Green
    $BackendJob = Start-Process -FilePath $PythonExe `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload" `
        -WorkingDirectory "$WorkspaceRoot\backend" `
        -PassThru
    Write-Host "    Backend Process ID: $($BackendJob.Id)" -ForegroundColor DarkGray
}

if ($Mode -eq "frontend" -or $Mode -eq "all") {
    Write-Host "`n[+] Starting Next.js Frontend on http://localhost:3000..." -ForegroundColor Green
    $FrontendJob = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm.cmd", "run", "dev" `
        -WorkingDirectory "$WorkspaceRoot\frontend" `
        -PassThru
    Write-Host "    Frontend Process ID: $($FrontendJob.Id)" -ForegroundColor DarkGray
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "TierLens is live!" -ForegroundColor Green
Write-Host "  - Frontend UI:  http://localhost:3000" -ForegroundColor White
Write-Host "  - Backend Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
