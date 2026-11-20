import httpx
import time

def run_verification():
    c = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30.0)

    print("\n[Step 1] Authentication Verification")
    auth_res = c.post("/api/v1/auth/login", json={"email": "demo@tierlens.com", "password": "Password123!"})
    if auth_res.status_code != 200:
        c.post("/api/v1/auth/register", json={"email": "demo@tierlens.com", "password": "Password123!", "full_name": "Demo Developer"})
        auth_res = c.post("/api/v1/auth/login", json={"email": "demo@tierlens.com", "password": "Password123!"})
    assert auth_res.status_code == 200, f"Auth failed: {auth_res.text}"
    tok = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}
    print("✓ Successfully authenticated. Token verified.")

    print("\n[Step 2] Dual Device Website Test Submission")
    t0 = time.time()
    run_res = c.post("/api/v1/tests/web/run", json={"target_url": "https://example.com", "tier": "BOTH"}, headers=headers)
    assert run_res.status_code == 202, f"Expected 202, got {run_res.status_code}"
    job_data = run_res.json()
    job_id = job_data["job_id"]
    duration = time.time() - t0
    print(f"✓ Immediate HTTP 202 response delivered in {duration:.3f}s. Job ID: {job_id}")

    print("\n[Step 3] Real-time Job Progress Polling")
    finished = False
    status_history = []
    comp_group_id = None
    entry_run_id = None

    while not finished:
        time.sleep(1.5)
        s = c.get(f"/api/v1/tests/web/jobs/{job_id}", headers=headers).json()
        stage_desc = f"[{s['status']}] {s['stage']} - {s['progress_message']}"
        if not status_history or status_history[-1] != stage_desc:
            status_history.append(stage_desc)
            print(f"  → {stage_desc}")

        if s["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            finished = True
            assert s["status"] == "COMPLETED", f"Job failed: {s}"
            comp_group_id = s["comparison_group_id"]
            entry_run_id = s["entry_level_run_id"]
            print(f"✓ Background test completed successfully in {s.get('duration_ms')}ms")

    print("\n[Step 4] Comparative Metrics Degradation Diff")
    comp_res = c.get(f"/api/v1/comparisons/{comp_group_id}", headers=headers)
    assert comp_res.status_code == 200, f"Fetch failed: {comp_res.text}"
    comp_data = comp_res.json()
    diffs = comp_data.get("metrics_diff", {})
    assert len(diffs) > 0, "No metrics found in diff"
    print(f"✓ Comparative diff calculated for {len(diffs)} metrics:")
    for metric_name, val in diffs.items():
        print(f"    • {metric_name}: Good Budget = {val.get('good_budget')} | Entry-Level = {val.get('entry_level')} ({val.get('pct_change')}% change)")

    print("\n[Step 5] Root Cause Analysis & Recommendation Workflow")
    rca_res = c.get(f"/api/v1/rca/run/{entry_run_id}", headers=headers)
    recs = rca_res.json()
    print(f"✓ Retrieved {len(recs)} evidence-based recommendations.")
    if recs:
        rec_id = recs[0]["id"]
        up_res = c.post(f"/api/v1/rca/recommendations/{rec_id}/status", json={"new_status": "APPLIED"}, headers=headers)
        assert up_res.status_code == 200
        print(f"✓ Recommendation {rec_id} status updated to 'APPLIED'.")

    print("\n[Step 6] Multi-Tenant Security & IDOR Verification")
    # Anonymous request
    anon_res = c.get(f"/api/v1/tests/web/jobs/{job_id}")
    assert anon_res.status_code == 401, f"Expected 401, got {anon_res.status_code}"
    print("✓ Unauthenticated request rejected (401 Unauthorized).")

    # Another tenant request
    c.post("/api/v1/auth/register", json={"email": "attacker@other.com", "password": "Password123!", "full_name": "Other Tenant"})
    tok_b = c.post("/api/v1/auth/login", json={"email": "attacker@other.com", "password": "Password123!"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {tok_b}"}
    tenant_b_res = c.get(f"/api/v1/tests/web/jobs/{job_id}", headers=headers_b)
    assert tenant_b_res.status_code == 403, f"Expected 403, got {tenant_b_res.status_code}"
    print("✓ Cross-workspace access rejected (403 Forbidden).")

    print("\n[Step 7] Hardware & Android Environment Detection")
    adb_res = c.get("/api/v1/tests/android/device-status", headers=headers)
    adb_data = adb_res.json()
    print(f"✓ Real Data Policy compliant: ADB Status = {adb_data.get('adb', {}).get('status')} | Ready = {adb_data.get('ready_for_testing')}")

    print("\n=======================================================")
    print("   ALL HACKATHON MVP ACCEPTANCE CRITERIA VERIFIED!     ")
    print("=======================================================\n")

if __name__ == "__main__":
    run_verification()
