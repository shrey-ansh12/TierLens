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

def get_auth_token(email="demo@tierlens.com", password="Password123!", name="Demo User"):
    # Login as test account
    resp = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": password
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # Register if not present
    reg = client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "full_name": name
    })
    if reg.status_code == 200:
        return reg.json()["access_token"]
    return None

def test_unauthenticated_request_rejected():
    """Verify that omitting Bearer token returns 401 Unauthorized (backdoor removed)."""
    resp = client.get("/api/v1/tests/web/jobs/job_web_test123")
    assert resp.status_code == 401
    assert "Authentication required" in resp.json()["detail"]

def test_job_submission_returns_immediate_202_accepted():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    
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
    headers = {"Authorization": f"Bearer {token}"}
    
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
    assert status_data["status"] in ["QUEUED", "PREPARING", "RUNNING", "COMPLETED", "CANCELLED"]
    assert "stage" in status_data
    assert "progress_message" in status_data

def test_job_cancellation():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    
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
    assert cancel_res.status_code in [200, 400]
    if cancel_res.status_code == 200:
        assert cancel_res.json()["status"] == "CANCELLED"

def test_cross_workspace_access_forbidden():
    """Security Test: User B must not access or cancel User A's jobs (IDOR protection)."""
    token_a = get_auth_token("user_a@tierlens.com", "Password123!", "User Alpha")
    token_b = get_auth_token("user_b@tierlens.com", "Password123!", "User Beta")
    
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    
    # User A creates a job
    submit_res = client.post(
        "/api/v1/tests/web/run",
        headers=headers_a,
        json={"target_url": "https://example.com", "tier": "GOOD_BUDGET"}
    )
    assert submit_res.status_code == 202
    job_id = submit_res.json()["job_id"]
    
    # User B attempts to access User A's job status -> 403 Forbidden
    resp_b = client.get(f"/api/v1/tests/web/jobs/{job_id}", headers=headers_b)
    assert resp_b.status_code == 403
    assert "Access denied" in resp_b.json()["detail"]
    
    # User B attempts to cancel User A's job -> 403 Forbidden
    cancel_b = client.post(f"/api/v1/tests/web/jobs/{job_id}/cancel", headers=headers_b)
    assert cancel_b.status_code == 403
    assert "Access denied" in cancel_b.json()["detail"]

def test_terminal_state_immutability():
    """Verify JobStore cannot overwrite CANCELLED state with COMPLETED."""
    async def _test():
        jid = "job_immutability_test"
        await job_store.create_job(jid, "https://example.com", "GOOD_BUDGET", "SINGLE_RUN", "ws1", "p1")
        await job_store.cancel_job(jid)
        j_cancelled = await job_store.get_job(jid)
        assert j_cancelled["status"] == "CANCELLED"
        
        # Attempt late update to COMPLETED
        await job_store.update_job(jid, status=JobState.COMPLETED.value, stage="Completed")
        j_after = await job_store.get_job(jid)
        # Status MUST remain CANCELLED!
        assert j_after["status"] == "CANCELLED"
        
    asyncio.run(_test())

def test_atomic_workspace_quota_enforcement():
    """Verify concurrency manager limits active jobs to 4 per workspace."""
    async def _test():
        ws_id = "ws_test_quota_123"
        # Reserve 4 slots (maximum)
        r1 = await concurrency_manager.try_reserve_workspace_slot(ws_id, "j1", "http://ex1.com")
        r2 = await concurrency_manager.try_reserve_workspace_slot(ws_id, "j2", "http://ex2.com")
        r3 = await concurrency_manager.try_reserve_workspace_slot(ws_id, "j3", "http://ex3.com")
        r4 = await concurrency_manager.try_reserve_workspace_slot(ws_id, "j4", "http://ex4.com")
        assert r1 and r2 and r3 and r4
        
        # 5th attempt must be rejected atomically
        r5 = await concurrency_manager.try_reserve_workspace_slot(ws_id, "j5", "http://ex5.com")
        assert not r5
        
        # Cleanup
        await concurrency_manager.unregister_job("j1", ws_id, "http://ex1.com")
        await concurrency_manager.unregister_job("j2", ws_id, "http://ex2.com")
        await concurrency_manager.unregister_job("j3", ws_id, "http://ex3.com")
        await concurrency_manager.unregister_job("j4", ws_id, "http://ex4.com")
        
    asyncio.run(_test())

def test_invalid_job_id_returns_404():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = client.get("/api/v1/tests/web/jobs/non_existent_job_12345", headers=headers)
    assert resp.status_code == 404
