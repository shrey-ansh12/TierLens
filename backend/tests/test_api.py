import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import validate_target_url
from app.intelligence.rule_engine import analyze_performance_rules
from fastapi import HTTPException

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "TierLens" in data["platform"]
    assert data["version"] == "1.0.0"

def test_system_health_endpoint():
    response = client.get("/api/v1/system/health")
    assert response.status_code == 200
    data = response.json()
    assert "database" in data
    assert "neo4j" in data
    assert "android_adb" in data

def test_ssrf_protection_blocks_private_networks():
    # Loopback
    with pytest.raises(HTTPException) as exc1:
        validate_target_url("http://127.0.0.1:8080/admin")
    assert exc1.value.status_code in [400, 403]

    # Cloud metadata
    with pytest.raises(HTTPException) as exc2:
        validate_target_url("http://169.254.169.254/latest/meta-data")
    assert exc2.value.status_code in [400, 403]

    # Localhost string
    with pytest.raises(HTTPException) as exc3:
        validate_target_url("http://localhost:3000")
    assert exc3.value.status_code in [400, 403]

    # Unsupported protocol
    with pytest.raises(HTTPException) as exc4:
        validate_target_url("ftp://example.com/file")
    assert exc4.value.status_code == 400

def test_rule_based_rca_engine():
    mock_metrics = [
        {"name": "LCP", "value": 4800, "unit": "ms"},
        {"name": "CLS", "value": 0.28, "unit": "score"},
        {"name": "TTFB", "value": 1600, "unit": "ms"}
    ]
    mock_failures = [
        {
            "failure_type": "JS_ERROR",
            "title": "Uncaught TypeError: cannot read property of undefined",
            "message": "TypeError in bundle.js",
            "error_signature": "SIG_MOCK_1"
        }
    ]

    recs = analyze_performance_rules(mock_metrics, mock_failures, tier="ENTRY_LEVEL")
    assert len(recs) >= 3
    titles = [r["title"] for r in recs]
    assert any("LCP" in t for t in titles)
    assert any("CLS" in t or "Layout" in t for t in titles)
    assert any("JavaScript" in t for t in titles)

def test_user_registration_and_auth_flow():
    test_email = "architect@tierlens.io"
    payload = {
        "email": test_email,
        "password": "SecurePassword123!",
        "full_name": "Senior Architect"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    if response.status_code == 400 and "already exists" in response.text:
        # Already registered, test login
        login_resp = client.post("/api/v1/auth/login", json={"email": test_email, "password": "SecurePassword123!"})
        assert login_resp.status_code == 200
        data = login_resp.json()
    else:
        assert response.status_code == 200
        data = response.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "workspace_id" in data
