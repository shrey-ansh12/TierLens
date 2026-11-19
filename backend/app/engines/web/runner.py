import os
import time
import uuid
import hashlib
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Error as PlaywrightError

from app.config import settings
from app.engines.web.profiles import WEB_DEVICE_PROFILES
from app.engines.web.metrics import calculate_vital_rating, WEB_VITALS_INJECTION_SCRIPT
from app.core.security import validate_target_url

logger = logging.getLogger(__name__)

class WebTestResult:
    def __init__(self, profile_key: str, target_url: str):
        self.profile_key = profile_key
        self.target_url = target_url
        self.success = False
        self.duration_ms = 0
        self.metrics: List[Dict[str, Any]] = []
        self.failures: List[Dict[str, Any]] = []
        self.artifacts: List[Dict[str, Any]] = []
        self.network_requests: List[Dict[str, Any]] = []
        self.console_logs: List[Dict[str, Any]] = []
        self.error_message: Optional[str] = None
        self.is_synthetic = False

async def run_web_performance_test(
    target_url: str,
    profile_key: str = "GOOD_BUDGET",
    test_run_id: Optional[str] = None
) -> WebTestResult:
    """
    Executes a real Playwright headless Chromium test with CDP-level CPU and network throttling.
    Collects actual Web Vitals, console exceptions, failed network calls, and screenshot.
    """
    # 1. SSRF Safety Check
    safe_url = validate_target_url(target_url)

    if profile_key not in WEB_DEVICE_PROFILES:
        profile_key = "GOOD_BUDGET"
    profile = WEB_DEVICE_PROFILES[profile_key]

    result = WebTestResult(profile_key, safe_url)
    run_id = test_run_id or str(uuid.uuid4())
    start_time = time.time()

    screenshot_filename = f"screenshot_{run_id}_{profile_key.lower()}.png"
    screenshot_path = os.path.join(settings.ARTIFACTS_DIR, screenshot_filename)

    async with async_playwright() as p:
        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None
        try:
            # Launch Chromium
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ]
            )

            # Create context with profile viewport & mobile emulation
            context = await browser.new_context(
                viewport=profile["viewport"],
                device_scale_factor=profile["device_scale_factor"],
                is_mobile=profile["is_mobile"],
                has_touch=profile["has_touch"],
                user_agent=profile["user_agent"],
                bypass_csp=True,
                ignore_https_errors=True
            )

            page = await context.new_page()

            # Listen to console messages
            def on_console(msg):
                result.console_logs.append({
                    "type": msg.type,
                    "text": msg.text,
                    "location": msg.location
                })
                if msg.type == "error":
                    sig = hashlib.sha256(f"CONSOLE_{msg.text[:120]}".encode()).hexdigest()[:16]
                    result.failures.append({
                        "failure_type": "JS_ERROR",
                        "title": f"JavaScript Console Error: {msg.text[:80]}",
                        "message": msg.text,
                        "error_signature": sig,
                        "component": "Console",
                        "url_or_file": msg.location.get("url") if msg.location else safe_url
                    })

            # Listen to uncaught page errors
            def on_page_error(exc):
                err_text = str(exc)
                sig = hashlib.sha256(f"UNCAUGHT_{err_text[:120]}".encode()).hexdigest()[:16]
                result.failures.append({
                    "failure_type": "JS_ERROR",
                    "title": f"Uncaught Exception: {err_text[:80]}",
                    "message": err_text,
                    "error_signature": sig,
                    "component": "Window.onerror",
                    "url_or_file": safe_url
                })

            # Listen to failed requests
            def on_request_failed(request):
                failure_text = request.failure or "Request Failed"
                sig = hashlib.sha256(f"HTTP_FAIL_{request.url[:100]}_{failure_text}".encode()).hexdigest()[:16]
                result.failures.append({
                    "failure_type": "HTTP_FAILURE",
                    "title": f"Network Request Failed ({request.method})",
                    "message": f"URL: {request.url}\nFailure: {failure_text}",
                    "error_signature": sig,
                    "component": "Network",
                    "url_or_file": request.url
                })

            page.on("console", on_console)
            page.on("pageerror", on_page_error)
            page.on("requestfailed", on_request_failed)

            # Apply Chrome DevTools Protocol (CDP) Throttling
            cdp_session = await context.new_cdp_session(page)
            
            # 1. CPU Throttling
            await cdp_session.send("Emulation.setCPUThrottlingRate", {
                "rate": profile["cpu_throttle_rate"]
            })

            # 2. Network Throttling
            net_conf = profile["network"]
            await cdp_session.send("Network.emulateNetworkConditions", {
                "offline": net_conf["offline"],
                "latency": net_conf["latency"],
                "downloadThroughput": net_conf["download_throughput"],
                "uploadThroughput": net_conf["upload_throughput"],
                "connectionType": net_conf["connection_type"]
            })

            # Navigate to URL
            nav_start = time.time()
            try:
                response = await page.goto(
                    safe_url,
                    wait_until="load",
                    timeout=30000 # 30s timeout
                )
                status_code = response.status if response else 0
                if status_code >= 400:
                    sig = hashlib.sha256(f"HTTP_{status_code}_{safe_url}".encode()).hexdigest()[:16]
                    result.failures.append({
                        "failure_type": "HTTP_FAILURE",
                        "title": f"HTTP Response Status {status_code}",
                        "message": f"Server responded with error status code {status_code} for target URL.",
                        "error_signature": sig,
                        "component": "HTTP Response",
                        "url_or_file": safe_url
                    })
            except PlaywrightError as pe:
                sig = hashlib.sha256(f"NAV_TIMEOUT_{str(pe)[:80]}".encode()).hexdigest()[:16]
                result.failures.append({
                    "failure_type": "PERFORMANCE_REGRESSION",
                    "title": "Page Load Timeout Exceeded",
                    "message": f"Navigation timed out under {profile['name']} conditions: {str(pe)}",
                    "error_signature": sig,
                    "component": "Navigation",
                    "url_or_file": safe_url
                })

            # Wait an additional 1s for layout shifts / lazy loaded resources
            await page.wait_for_timeout(1000)

            # Capture Screenshot
            try:
                await page.screenshot(path=screenshot_path, full_page=False)
                file_size = os.path.getsize(screenshot_path) if os.path.exists(screenshot_path) else 0
                result.artifacts.append({
                    "artifact_type": "SCREENSHOT",
                    "file_path": screenshot_path,
                    "file_size_bytes": file_size,
                    "mime_type": "image/png"
                })
            except Exception as se:
                logger.warning(f"Could not capture screenshot: {se}")

            # Extract Web Vitals & Timings
            raw_vitals = await page.evaluate(WEB_VITALS_INJECTION_SCRIPT)

            # Record standard Web Vitals
            metrics_def = [
                ("FCP", float(raw_vitals.get("fcp", 0)), "ms"),
                ("LCP", float(raw_vitals.get("lcp", 0)), "ms"),
                ("CLS", float(raw_vitals.get("cls", 0)), "score"),
                ("TTFB", float(raw_vitals.get("ttfb", 0)), "ms"),
                ("PAGE_LOAD_TIME", float(raw_vitals.get("page_load_time", 0)), "ms"),
            ]

            for name, val, unit in metrics_def:
                rating = calculate_vital_rating(name, val)
                result.metrics.append({
                    "name": name,
                    "value": round(val, 2),
                    "unit": unit,
                    "rating": rating,
                    "is_emulated": True,
                    "details": {
                        "device_profile": profile["name"],
                        "cpu_throttle_rate": profile["cpu_throttle_rate"],
                        "network_latency_ms": profile["network"]["latency"],
                        "disclaimer": profile["emulation_disclaimer"]
                    }
                })

            result.success = True

        except Exception as e:
            result.success = False
            result.error_message = str(e)
            sig = hashlib.sha256(f"TEST_EXEC_ERROR_{str(e)[:80]}".encode()).hexdigest()[:16]
            result.failures.append({
                "failure_type": "CRASH",
                "title": "Test Execution Exception",
                "message": f"Engine execution halted: {str(e)}",
                "error_signature": sig,
                "component": "PlaywrightRunner",
                "url_or_file": safe_url
            })
        finally:
            if context:
                await context.close()
            if browser:
                await browser.close()
            result.duration_ms = int((time.time() - start_time) * 1000)

    return result
