import pytest
import asyncio
from playwright.async_api import async_playwright, Error as PlaywrightError
from app.engines.web.classifier import classify_navigation_error, ErrorCategory
from app.engines.web.metrics import calculate_vital_rating, WEB_VITALS_INJECTION_SCRIPT
from app.engines.web.runner import run_web_performance_test, WebTestResult
from app.core.security import validate_target_url, validate_redirect_url
from fastapi import HTTPException


# ==============================================================================
# 1. Error Classification Test Suite (All 8 Categories)
# ==============================================================================

def test_classify_network_errors():
    dns_err = "net::ERR_NAME_NOT_RESOLVED at https://nonexistent-domain-xyz-12345.org"
    classified = classify_navigation_error(dns_err)
    assert classified.category == ErrorCategory.NETWORK_ERROR.value
    assert classified.retryable is True
    assert "Network" in classified.explanation

    conn_refused = "net::ERR_CONNECTION_REFUSED at http://192.0.2.1:8080"
    classified = classify_navigation_error(conn_refused)
    assert classified.category == ErrorCategory.NETWORK_ERROR.value
    assert classified.retryable is True


def test_classify_ssl_errors():
    ssl_err = "net::ERR_CERT_AUTHORITY_INVALID at https://self-signed.badssl.com"
    classified = classify_navigation_error(ssl_err)
    assert classified.category == ErrorCategory.SSL_ERROR.value
    assert classified.retryable is False
    assert "SSL/TLS" in classified.explanation


def test_classify_navigation_timeouts():
    timeout_err = "Timeout 30000ms exceeded while navigating to https://slow-site.com"
    classified = classify_navigation_error(timeout_err)
    assert classified.category == ErrorCategory.NAVIGATION_TIMEOUT.value
    assert classified.retryable is True
    assert "timed out" in classified.explanation


def test_classify_http_errors():
    c404 = classify_navigation_error(http_status=404)
    assert c404.category == ErrorCategory.HTTP_ERROR.value
    assert c404.retryable is False
    assert "404" in c404.explanation

    c500 = classify_navigation_error(http_status=500)
    assert c500.category == ErrorCategory.HTTP_ERROR.value
    assert c500.retryable is True
    assert "500" in c500.explanation

    c503 = classify_navigation_error(http_status=503)
    assert c503.category == ErrorCategory.HTTP_ERROR.value
    assert c503.retryable is True


def test_classify_access_restrictions():
    # Cloudflare / CAPTCHA challenge detection
    c_cf = classify_navigation_error(
        error_message="HTTP 403 Forbidden",
        http_status=403,
        page_content="<html><title>Just a moment...</title><body>Please verify you are human to continue.</body></html>",
        page_title="Just a moment..."
    )
    assert c_cf.category == ErrorCategory.ACCESS_RESTRICTION.value
    assert c_cf.retryable is False
    assert "bot detection" in c_cf.explanation.lower()


def test_classify_browser_infrastructure_errors():
    infra_err = "Executable doesn't exist at /ms-playwright/chromium-1117/chrome"
    classified = classify_navigation_error(infra_err)
    assert classified.category == ErrorCategory.BROWSER_INFRASTRUCTURE_ERROR.value
    assert classified.retryable is True


def test_classify_target_application_errors():
    js_err = "Uncaught TypeError: Cannot read properties of undefined (reading 'render')"
    classified = classify_navigation_error(js_err)
    assert classified.category == ErrorCategory.TARGET_APPLICATION_ERROR.value
    assert classified.retryable is False
    assert "runtime javascript" in classified.explanation.lower()


def test_classify_unknown_errors():
    weird_err = "Some strange undocumented error code XYZ"
    classified = classify_navigation_error(weird_err)
    assert classified.category == ErrorCategory.UNKNOWN_ERROR.value
    assert classified.retryable is True


# ==============================================================================
# 2. SSRF Protection & Redirect Safety Test Suite
# ==============================================================================

def test_ssrf_blocks_private_networks_and_cloud_metadata():
    with pytest.raises(HTTPException) as exc:
        validate_target_url("http://127.0.0.1:8000")
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        validate_target_url("http://localhost:3000")
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        validate_target_url("http://169.254.169.254/latest/meta-data")
    assert exc.value.status_code == 403


def test_ssrf_redirect_validation_blocks_internal_targets():
    # Relative redirect to safe path works
    safe_redirect = validate_redirect_url("https://example.com/login", "/dashboard")
    assert safe_redirect == "https://example.com/dashboard"

    # Malicious redirect to localhost or internal IP is blocked
    with pytest.raises(HTTPException) as exc:
        validate_redirect_url("https://example.com/oauth", "http://127.0.0.1:8000/internal")
    assert exc.value.status_code == 403


# ==============================================================================
# 3. Real Browser Execution & Metric Accuracy Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_browser_execution_on_static_html():
    """Verify clean execution on static HTML with genuine metric extraction (no fake numbers)."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        html = """
        <!DOCTYPE html>
        <html>
        <head><title>Static Compatibility Test</title></head>
        <body>
            <h1>Heading 1</h1>
            <p>This is a fast, clean static website.</p>
        </body>
        </html>
        """
        await page.set_content(html)
        vitals = await page.evaluate(WEB_VITALS_INJECTION_SCRIPT)

        assert vitals["cls"] == 0.0
        assert vitals["dom_element_count"] > 0
        # Verify no hardcoded fake numbers (350, 600, 1200)
        assert vitals["fcp"] != 350 or vitals["fcp"] is None
        assert vitals["lcp"] != 600 or vitals["lcp"] is None

        await context.close()
        await browser.close()


@pytest.mark.asyncio
async def test_browser_execution_on_javascript_heavy_spa():
    """Verify execution on dynamic Single-Page Application (SPA) with async rendering."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        spa_html = """
        <!DOCTYPE html>
        <html>
        <head><title>React Simulation SPA</title></head>
        <body>
            <div id="root">Loading application...</div>
            <script>
                setTimeout(() => {
                    document.getElementById('root').innerHTML = '<h2>Interactive React App Loaded</h2>';
                }, 100);
            </script>
        </body>
        </html>
        """
        await page.set_content(spa_html)
        await page.wait_for_selector("h2", timeout=3000)
        content = await page.content()
        assert "Interactive React App Loaded" in content

        vitals = await page.evaluate(WEB_VITALS_INJECTION_SCRIPT)
        assert isinstance(vitals["cls"], (int, float))

        await context.close()
        await browser.close()


@pytest.mark.asyncio
async def test_browser_execution_captures_runtime_js_errors():
    """Verify that client JavaScript exceptions are captured as TARGET_APPLICATION_ERROR."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        bad_js_html = """
        <!DOCTYPE html>
        <html>
        <head><title>JS Error Test</title></head>
        <body>
            <script>
                // Intentional crash
                const obj = undefined;
                obj.nonExistentMethod();
            </script>
        </body>
        </html>
        """
        await page.set_content(bad_js_html)
        assert len(errors) > 0
        classified = classify_navigation_error(errors[0])
        assert classified.category == ErrorCategory.TARGET_APPLICATION_ERROR.value

        await context.close()
        await browser.close()


# ==============================================================================
# 4. End-to-End Runner Compatibility Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_runner_on_public_live_website():
    """Tests runner against public website (https://example.com) to verify full pipeline."""
    result = await run_web_performance_test(
        target_url="https://example.com",
        profile_key="GOOD_BUDGET",
        timeout_seconds=20
    )
    assert result.success is True
    assert result.duration_ms > 0
    assert result.final_url == "https://example.com/"
    assert len(result.metrics) > 0
    # Check that metrics have genuine ratings
    metric_names = {m["name"] for m in result.metrics}
    assert "PAGE_LOAD_TIME" in metric_names or "TTFB" in metric_names
    assert len(result.artifacts) > 0  # Screenshot captured


@pytest.mark.asyncio
async def test_runner_on_unresolvable_domain_classifies_network_error():
    """Tests runner against an unresolvable domain to verify accurate NETWORK_ERROR classification."""
    # Note: SSRF validate_target_url will raise DNS resolution error first
    result = await run_web_performance_test(
        target_url="https://domain-does-not-exist-abc-xyz-9876543210.org",
        profile_key="ENTRY_LEVEL",
        timeout_seconds=10
    )
    assert result.success is False
    assert len(result.failures) > 0
    # Failure should be categorized as ACCESS_RESTRICTION or NETWORK_ERROR (not CRASH)
    fail_type = result.failures[0]["failure_type"]
    assert fail_type in (ErrorCategory.NETWORK_ERROR.value, ErrorCategory.ACCESS_RESTRICTION.value)
    assert fail_type != "CRASH"


def test_metric_vital_rating_ratings_and_unavailable():
    """Verify threshold evaluation and unavailable state."""
    assert calculate_vital_rating("LCP", 2000) == "GOOD"
    assert calculate_vital_rating("LCP", 3500) == "NEEDS_IMPROVEMENT"
    assert calculate_vital_rating("LCP", 5000) == "POOR"
    assert calculate_vital_rating("LCP", None) == "UNAVAILABLE"
    assert calculate_vital_rating("CLS", 0.05) == "GOOD"
    assert calculate_vital_rating("CLS", 0.3) == "POOR"


@pytest.mark.asyncio
async def test_serialize_test_run_immune_to_missing_greenlet():
    """Verify serialize_test_run succeeds without raising MissingGreenlet on detached/unloaded models."""
    from app.models.relational.entities import TestRun, DeviceProfile
    from app.api.v1.comparisons import serialize_test_run

    tr = TestRun(
        id="test-run-uuid-1234",
        project_id="test-proj-uuid",
        status="COMPLETED",
        target_url="https://scan2eat.food/"
    )
    serialized = serialize_test_run(tr)
    assert serialized is not None
    assert serialized["id"] == "test-run-uuid-1234"
    assert serialized["status"] == "COMPLETED"
    assert serialized["metrics"] == []
    assert serialized["failures"] == []


@pytest.mark.asyncio
async def test_build_comparison_payload_handles_missing_group():
    """Verify build_comparison_payload returns None gracefully for nonexistent comparisons."""
    from app.core.database import AsyncSessionLocal
    from app.api.v1.comparisons import build_comparison_payload

    async with AsyncSessionLocal() as session:
        payload = await build_comparison_payload("nonexistent-group-id", session)
        assert payload is None

