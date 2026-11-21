<#
.SYNOPSIS
    TierLens Launch Orchestrator for Windows 11
.DESCRIPTION
    Starts the TierLens FastAPI backend and Next.js frontend services.
.EXAMPLE
    .\run.ps1
#>

param (
    [string]$Mode = "all" # "all", "backend", "frontend", "test"
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   TIERLENS — Application Performance & Device Intelligence" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Locate best available Python executable
$PythonExe = "$WorkspaceRoot\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    if (Test-Path "C:\Users\Harsh\AppData\Local\Python\bin\python.exe") {
        $PythonExe = "C:\Users\Harsh\AppData\Local\Python\bin\python.exe"
    } else {
        $PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
    }
}

if (-not $PythonExe) {
    Write-Host "[!] Error: Python executable not found." -ForegroundColor Red
    exit 1
}

if ($Mode -eq "test") {
    Write-Host "`n[+] Executing Automated Backend Pytest Suite..." -ForegroundColor Yellow
    $env:PYTHONPATH = "$WorkspaceRoot\backend"
    & $PythonExe -m pytest "$WorkspaceRoot\backend\tests" -v
    exit 0
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
    $FrontendJob = Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory "$WorkspaceRoot\frontend" `
        -PassThru
    Write-Host "    Frontend Process ID: $($FrontendJob.Id)" -ForegroundColor DarkGray
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "TierLens is live!" -ForegroundColor Green
Write-Host "  - Frontend UI:  http://localhost:3000" -ForegroundColor White
Write-Host "  - Backend Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
