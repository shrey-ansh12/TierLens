param (
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = $PSScriptRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   TIERLENS - Application Performance and Device Intelligence" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Locate best available unblocked Python executable
$PythonCandidates = @(
    "C:\Users\Harsh\AppData\Local\Python\bin\python.exe",
    (Get-Command python -ErrorAction SilentlyContinue).Source,
    "$WorkspaceRoot\backend\.venv\Scripts\python.exe"
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
    Write-Host "[!] Error: Working Python executable not found." -ForegroundColor Red
    exit 1
}

if ($Mode -eq "test") {
    Write-Host "`n[+] Executing Automated Backend Pytest Suite..." -ForegroundColor Yellow
    $env:PYTHONPATH = "$WorkspaceRoot\backend"
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
