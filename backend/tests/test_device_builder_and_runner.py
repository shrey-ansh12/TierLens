import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.engines.web.runner import run_web_performance_test
from app.engines.web.profiles import resolve_device_profile_config
from app.api.v1.comparisons import build_comparison_payload
from app.core.database import AsyncSessionLocal
from app.models.relational.entities import DeviceProfile, TestRun, TestMetric, TestStatus

TestRun.__test__ = False
TestMetric.__test__ = False
TestStatus.__test__ = False

client = TestClient(app)

@pytest.fixture(scope="module")
def auth_headers():
    test_email = "test_tester@tierlens.io"
    password = "TestPassword123!"
    reg_resp = client.post("/api/v1/auth/register", json={"email": test_email, "password": password, "full_name": "Test Engineer"})
    if reg_resp.status_code == 200:
        token = reg_resp.json()["access_token"]
    else:
        login_resp = client.post("/api/v1/auth/login", json={"email": test_email, "password": password})
        token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_list_device_profiles(auth_headers):
    resp = client.get("/api/v1/device-profiles", headers=auth_headers)
    assert resp.status_code == 200
    profiles = resp.json()
    assert len(profiles) >= 2
    names = [p["name"] for p in profiles]
    assert any("Entry-level" in n or "Entry-Level" in n for n in names)
    assert any("Budget" in n for n in names)

def test_create_update_duplicate_delete_custom_profile(auth_headers):
    # 1. Create Custom Profile
    custom_payload = {
        "name": "Automated Test Custom Phone",
        "tier": "CUSTOM_TEST",
        "platform": "WEB",
        "device_type": "Mid-range Android",
        "cpu_cores": 6,
        "cpu_category": "6-core mid-range",
        "cpu_throttle_rate": 3.0,
        "cpu_slowdown_multiplier": 3.0,
        "storage_profile": "Standard storage profile",
        "storage_capacity_gb": 128,
        "storage_available_gb": 40,
        "network_profile": "Fast 3G",
        "network_down_kbps": 2000.0,
        "network_up_kbps": 1000.0,
        "network_latency_ms": 35,
        "network_packet_loss": 0.0,
        "viewport_width": 412,
        "viewport_height": 915,
        "device_scale_factor": 2.625,
        "is_mobile": True,
        "has_touch": True,
        "ram_mb": 6144,
        "description": "Created during automated integration testing."
    }
    create_resp = client.post("/api/v1/device-profiles", json=custom_payload, headers=auth_headers)
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    profile_id = created_data["id"]
    assert created_data["name"] == custom_payload["name"]
    assert created_data["ram_mb"] == 6144
    assert created_data["cpu_throttle_rate"] == 3.0

    # 2. Update Profile
    update_resp = client.put(f"/api/v1/device-profiles/{profile_id}", json={"name": "Updated Custom Phone", "cpu_throttle_rate": 2.5}, headers=auth_headers)
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Custom Phone"
    assert update_resp.json()["cpu_throttle_rate"] == 2.5

    # 3. Duplicate Profile
    dup_resp = client.post(f"/api/v1/device-profiles/{profile_id}/duplicate", headers=auth_headers)
    assert dup_resp.status_code == 201
    dup_data = dup_resp.json()
    assert "Copy of" in dup_data["name"]

    # 4. Cleanup
    del_resp = client.delete(f"/api/v1/device-profiles/{profile_id}", headers=auth_headers)
    assert del_resp.status_code == 204
    client.delete(f"/api/v1/device-profiles/{dup_data['id']}", headers=auth_headers)

@pytest.mark.asyncio
async def test_real_playwright_test_execution_with_throttling():
    # Test real Playwright execution against example.com with 4x CPU throttle
    test_config = {
        "name": "Test Profile 4x",
        "tier": "TEST_4X",
        "device_type": "Budget Android",
        "cpu_throttle_rate": 4.0,
        "network_profile": "Fast 3G",
        "network_down_kbps": 1600.0,
        "network_up_kbps": 750.0,
        "network_latency_ms": 40,
        "viewport_width": 390,
        "viewport_height": 844,
        "device_scale_factor": 2.0,
        "is_mobile": True,
        "has_touch": True,
        "ram_mb": 4096,
        "storage_profile": "Standard storage profile"
    }

    result = await run_web_performance_test(
        target_url="https://example.com",
        profile_input=test_config,
        timeout_seconds=25
    )

    assert result.success is True
    assert result.http_status == 200
    assert len(result.metrics) >= 5
    metric_names = [m["name"] for m in result.metrics]
    assert "TTFB" in metric_names
    assert "FCP" in metric_names
    assert "LCP" in metric_names
    assert "CLS" in metric_names
    assert "PAGE_LOAD_TIME" in metric_names

    # Check metric metadata
    sample_m = result.metrics[0]
    assert "collected_at" in sample_m
    assert sample_m["measurement_status"] == "MEASURED"
    assert "disclaimer" in sample_m["details"]
