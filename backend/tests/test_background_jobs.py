import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.workers.job_store import job_store, JobState
from app.core.concurrency import concurrency_manager

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_database_fallback():
    # Trigger health check to ensure database fallback initializes if postgres is offline
    client.get("/api/v1/system/health")

def get_auth_token():
    # Login as default test account
    resp = client.post("/api/v1/auth/login", json={
        "email": "demo@tierlens.com",
        "password": "Password123!"
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # Register if not present
    reg = client.post("/api/v1/auth/register", json={
        "email": "demo@tierlens.com",
        "password": "Password123!",
        "full_name": "Demo User"
    })
    if reg.status_code == 200:
        return reg.json()["access_token"]
    return None

def test_job_submission_returns_immediate_202_accepted():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    response = client.post(
        "/api/v1/tests/web/run",
        headers=headers,
        json={
            "target_url": "https://example.com",
            "tier": "BOTH"
        }
    )
    
    # Must return immediate 202 Accepted, not block for 20+ seconds!
    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["job_id"].startswith("job_web_")
    assert data["status"] == "QUEUED"
    assert data["mode"] == "DUAL_COMPARISON"
    assert "poll_url" in data
    assert f"/api/v1/tests/web/jobs/{data['job_id']}" in data["poll_url"]

def test_job_status_retrieval():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    # 1. Submit job
    submit_res = client.post(
        "/api/v1/tests/web/run",
        headers=headers,
        json={
            "target_url": "https://example.com",
            "tier": "GOOD_BUDGET"
        }
    )
    assert submit_res.status_code == 202
    job_id = submit_res.json()["job_id"]
    
    # 2. Query status
    status_res = client.get(f"/api/v1/tests/web/jobs/{job_id}", headers=headers)
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["job_id"] == job_id
    assert status_data["status"] in ["QUEUED", "PREPARING", "RUNNING", "COMPLETED"]
    assert "stage" in status_data
    assert "progress_message" in status_data

def test_job_cancellation():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    # 1. Submit job
    submit_res = client.post(
        "/api/v1/tests/web/run",
        headers=headers,
        json={
            "target_url": "https://example.com",
            "tier": "ENTRY_LEVEL"
        }
    )
    assert submit_res.status_code == 202
    job_id = submit_res.json()["job_id"]
    
    # 2. Cancel job
    cancel_res = client.post(f"/api/v1/tests/web/jobs/{job_id}/cancel", headers=headers)
    # Cancellation may succeed if still queued/running
    assert cancel_res.status_code in [200, 400]
    if cancel_res.status_code == 200:
        assert cancel_res.json()["status"] == "CANCELLED"

def test_invalid_job_id_returns_404():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    
    resp = client.get("/api/v1/tests/web/jobs/non_existent_job_12345", headers=headers)
    assert resp.status_code == 404

def test_concurrency_manager_tracks_slots():
    assert concurrency_manager.get_max_concurrent_browsers() == settings.MAX_CONCURRENT_BROWSER_JOBS
