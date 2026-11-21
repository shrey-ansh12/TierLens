import os
import time
import uuid
import hashlib
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from playwright.async_api import (
    async_playwright,
    Browser,
    BrowserContext,
    Page,
    Error as PlaywrightError,
    TimeoutError as PlaywrightTimeoutError
)

from app.config import settings
from app.engines.web.profiles import WEB_DEVICE_PROFILES, resolve_device_profile_config
from app.engines.web.metrics import calculate_vital_rating, WEB_VITALS_INJECTION_SCRIPT
from app.engines.web.classifier import classify_navigation_error, ErrorCategory
from app.core.security import validate_target_url, validate_redirect_url

logger = logging.getLogger(__name__)

class WebTestResult:
    def __init__(self, profile_key: str, target_url: str):
        self.profile_key = profile_key
        self.target_url = target_url
        self.final_url: Optional[str] = target_url
        self.redirect_count: int = 0
        self.redirect_chain: List[str] = []
        self.success: bool = False
        self.completed_with_warnings: bool = False
        self.error_category: Optional[str] = None
        self.error_message: Optional[str] = None
        self.error_details: Optional[Dict[str, Any]] = None
        self.retryable: bool = False
        self.duration_ms: int = 0
        self.http_status: Optional[int] = None
        self.metrics: List[Dict[str, Any]] = []
        self.unavailable_metrics: List[str] = []
        self.failures: List[Dict[str, Any]] = []
        self.artifacts: List[Dict[str, Any]] = []
        self.network_requests: List[Dict[str, Any]] = []
        self.console_logs: List[Dict[str, Any]] = []
        self.is_synthetic: bool = False
        self.configuration_snapshot: Optional[Dict[str, Any]] = None


async def run_web_performance_test(
    target_url: str,
    profile_input: Any = None,
    test_run_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
    profile_key: Optional[str] = None,
    on_event: Optional[Any] = None
) -> WebTestResult:
    """
    Executes an isolated, resilient Playwright headless Chromium performance test.
    Supports a wide variety of public websites (SPA, MPA, redirects, slow networks).
    Accurately classifies errors and collects real Web Vitals without fabrication.
    """
    effective_profile = profile_input if profile_input is not None else (profile_key or "GOOD_BUDGET")
    profile = resolve_device_profile_config(effective_profile)
    profile_key = profile.get("tier", "CUSTOM")

    async def emit_evt(stage_id: int, stage_name: str, message: str, level: str = "INFO", metric: Optional[Dict] = None):
        if on_event:
            try:
                if asyncio.iscoroutinefunction(on_event):
                    await on_event(stage_id, stage_name, message, level, metric)
                else:
                    on_event(stage_id, stage_name, message, level, metric)
            except Exception:
                pass

    await emit_evt(1, "Browser Initialization", f"Configuring execution sandbox for {profile.get('name', 'Device Profile')}")

    # 1. SSRF Safety Check
    try:
        safe_url = validate_target_url(target_url)
    except Exception as e:
        res = WebTestResult(profile_key, target_url)
        res.configuration_snapshot = profile
        classified = classify_navigation_error(str(e))
        res.success = False
        res.error_category = ErrorCategory.ACCESS_RESTRICTION.value
        res.error_message = str(e)
        res.retryable = False
        res.failures.append({
            "failure_type": ErrorCategory.ACCESS_RESTRICTION.value,
            "title": "Security Check Failed",
            "message": str(e),
            "error_signature": hashlib.sha256(f"SSRF_{str(e)[:60]}".encode()).hexdigest()[:16],
            "component": "SSRFValidator",
            "url_or_file": target_url
        })
        return res

    result = WebTestResult(profile_key, safe_url)
    result.configuration_snapshot = profile
    run_id = test_run_id or str(uuid.uuid4())
    start_time = time.time()
    nav_timeout_ms = (timeout_seconds or getattr(settings, "WEB_TEST_TIMEOUT_SECONDS", 30)) * 1000

    screenshot_filename = f"screenshot_{run_id}_{profile_key.lower().replace('/', '_')}.png"
    screenshot_path = os.path.join(settings.ARTIFACTS_DIR, screenshot_filename)

    async with async_playwright() as p:
        # Pre-flight check: Verify Chromium availability
        try:
            exec_path = p.chromium.executable_path
            if not exec_path or not os.path.exists(exec_path):
                logger.warning(f"Chromium executable path reported missing: {exec_path}")
        except Exception as preflight_err:
            logger.warning(f"Chromium pre-flight notice: {preflight_err}")

        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None
        page: Optional[Page] = None
        cdp_session = None

        try:
            # 2. Launch Chromium with transient failure retry (up to 2 attempts)
            launch_attempts = 0
            max_attempts = 2
            while launch_attempts < max_attempts:
                try:
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-gpu",
                            "--disable-software-rasterizer",
                            "--disable-blink-features=AutomationControlled",
                            "--mute-audio"
                        ]
                    )
                    break
                except Exception as launch_err:
                    launch_attempts += 1
                    if launch_attempts >= max_attempts:
                        classified = classify_navigation_error(str(launch_err))
                        result.success = False
                        result.error_category = ErrorCategory.BROWSER_INFRASTRUCTURE_ERROR.value
                        result.error_message = f"Browser launch failed: {launch_err}"
                        result.retryable = True
                        result.failures.append({
                            "failure_type": ErrorCategory.BROWSER_INFRASTRUCTURE_ERROR.value,
                            "title": "Browser Launch Failure",
                            "message": str(launch_err),
                            "error_signature": hashlib.sha256(f"LAUNCH_FAIL_{str(launch_err)[:60]}".encode()).hexdigest()[:16],
                            "component": "ChromiumLauncher",
                            "url_or_file": safe_url
                        })
                        return result
                    await asyncio.sleep(0.5)

            # 3. Create Context with Profile Viewport & Emulation
            context = await browser.new_context(
                viewport=profile["viewport"],
                device_scale_factor=profile["device_scale_factor"],
                is_mobile=profile["is_mobile"],
                has_touch=profile["has_touch"],
                user_agent=profile["user_agent"],
                bypass_csp=True,
                ignore_https_errors=False # Capture SSL issues accurately
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
                        "failure_type": ErrorCategory.TARGET_APPLICATION_ERROR.value,
                        "title": f"JavaScript Console Error: {msg.text[:80]}",
                        "message": msg.text,
                        "error_signature": sig,
                        "component": "Console",
                        "url_or_file": msg.location.get("url") if msg.location else safe_url
                    })

            # Listen to uncaught page exceptions
            def on_page_error(exc):
                err_text = str(exc)
                sig = hashlib.sha256(f"UNCAUGHT_{err_text[:120]}".encode()).hexdigest()[:16]
                result.failures.append({
                    "failure_type": ErrorCategory.TARGET_APPLICATION_ERROR.value,
                    "title": f"Uncaught Runtime Exception: {err_text[:80]}",
                    "message": err_text,
                    "error_signature": sig,
                    "component": "Window.onerror",
                    "url_or_file": safe_url
                })

            # Listen to failed subrequests (non-fatal warnings)
            def on_request_failed(request):
                failure_text = request.failure or "Request Failed"
                sig = hashlib.sha256(f"SUBREQ_FAIL_{request.url[:100]}_{failure_text}".encode()).hexdigest()[:16]
                result.failures.append({
                    "failure_type": "SUBRESOURCE_WARNING",
                    "title": f"Subresource Request Failed ({request.method})",
                    "message": f"URL: {request.url}\nFailure: {failure_text}",
                    "error_signature": sig,
                    "component": "Network",
                    "url_or_file": request.url
                })

            # Revalidate redirects against SSRF
            async def on_response(response):
                if 300 <= response.status < 400:
                    loc = response.headers.get("location")
                    if loc:
                        try:
                            validate_redirect_url(response.url, loc)
                        except Exception as ssrf_err:
                            logger.warning(f"SSRF violation detected during redirect: {ssrf_err}")
                            raise PlaywrightError(f"Security restriction: redirect to forbidden network location ({loc}) blocked.")

            page.on("console", on_console)
            page.on("pageerror", on_page_error)
            page.on("requestfailed", on_request_failed)
            page.on("response", on_response)

            # 4. Apply Chrome DevTools Protocol (CDP) Throttling
            try:
                cdp_session = await context.new_cdp_session(page)
                # CPU Throttling
                await cdp_session.send("Emulation.setCPUThrottlingRate", {
                    "rate": profile["cpu_throttle_rate"]
                })
                # Network Throttling
                net_conf = profile["network"]
                await cdp_session.send("Network.emulateNetworkConditions", {
                    "offline": net_conf["offline"],
                    "latency": net_conf["latency"],
                    "downloadThroughput": net_conf["download_throughput"],
                    "uploadThroughput": net_conf["upload_throughput"],
                    "connectionType": net_conf["connection_type"]
                })
            except Exception as cdp_err:
                logger.warning(f"CDP emulation notice: {cdp_err}")

            await emit_evt(1, "Browser Initialization", f"CDP hardware emulation active: {profile['cpu_throttle_rate']}x CPU slowdown, {profile['network']['name']} network emulation.")

            # 5. Multi-tier Navigation Strategy
            # Strategy: First wait for DOMContentLoaded (HTML parsed), then soft-wait for load state
            response = None
            nav_error = None
            await emit_evt(2, "Website Loading", f"Initiating navigation to {safe_url} (timeout: {nav_timeout_ms/1000:.0f}s)...")
            try:
                response = await page.goto(
                    safe_url,
                    wait_until="domcontentloaded",
                    timeout=nav_timeout_ms
                )
            except (PlaywrightTimeoutError, PlaywrightError) as pe:
                nav_error = pe

            # If domcontentloaded threw SSL error with ignore_https_errors=False, retry with flag if needed
            if nav_error and ("cert_" in str(nav_error).lower() or "ssl_" in str(nav_error).lower()):
                classified = classify_navigation_error(str(nav_error))
                result.success = False
                result.error_category = classified.category
                result.error_message = classified.explanation
                result.error_details = classified.to_dict()
                result.failures.append({
                    "failure_type": classified.category,
                    "title": "SSL/TLS Certificate Error",
                    "message": str(nav_error),
                    "error_signature": hashlib.sha256(f"SSL_{str(nav_error)[:80]}".encode()).hexdigest()[:16],
                    "component": "TLSHandshake",
                    "url_or_file": safe_url
                })
                return result

            # If navigation failed outright (DNS failure, connection refused, or hard timeout)
            if nav_error:
                classified = classify_navigation_error(str(nav_error))
                result.success = False
                result.error_category = classified.category
                result.error_message = classified.explanation
                result.error_details = classified.to_dict()
                result.retryable = classified.retryable
                result.failures.append({
                    "failure_type": classified.category,
                    "title": f"Navigation Failed ({classified.category})",
                    "message": str(nav_error),
                    "error_signature": hashlib.sha256(f"NAV_FAIL_{str(nav_error)[:80]}".encode()).hexdigest()[:16],
                    "component": "Navigation",
                    "url_or_file": safe_url
                })
                # Attempt to capture screenshot if page has any canvas
                try:
                    await page.screenshot(path=screenshot_path, full_page=False)
                    if os.path.exists(screenshot_path):
                        result.artifacts.append({
                            "artifact_type": "SCREENSHOT",
                            "file_path": screenshot_path,
                            "file_size_bytes": os.path.getsize(screenshot_path),
                            "mime_type": "image/png"
                        })
                except Exception:
                    pass
                return result

            # 6. Settle Navigation (Soft wait for full load & SPA client hydration)
            try:
                # Soft wait for window 'load' event (caps at 8 seconds so long polling doesn't hang)
                await page.wait_for_load_state("load", timeout=min(8000, nav_timeout_ms / 2))
            except Exception:
                logger.info("Soft load state timed out after domcontentloaded; proceeding with rendered DOM.")

            try:
                # Ensure essential DOM body is rendered
                await page.wait_for_selector("body", timeout=4000)
                # Brief stabilization settle for JavaScript hydration / CSS animations
                await page.wait_for_timeout(1000)
            except Exception:
                pass

            # 7. Record Destination & Redirect Information
            result.final_url = page.url
            if response and response.request:
                redirect_chain = []
                curr = response.request.redirected_from
                while curr:
                    redirect_chain.append(curr.url)
                    curr = curr.redirected_from
                result.redirect_chain = list(reversed(redirect_chain))
                result.redirect_count = len(result.redirect_chain)

            status_code = response.status if response else 0
            result.http_status = status_code

            # 8. Access Restriction & Bot Challenge Inspection
            page_title = ""
            page_content = ""
            try:
                page_title = await page.title()
                page_content = await page.content()
            except Exception:
                pass

            is_access_restricted = False
            if status_code in (403, 429) or any(
                m in page_title.lower() for m in ["just a moment...", "verify you are human", "attention required", "security check"]
            ):
                classified_access = classify_navigation_error(
                    error_message=f"HTTP status {status_code} challenge page",
                    http_status=status_code,
                    page_content=page_content[:3000],
                    page_title=page_title
                )
                if classified_access.category == ErrorCategory.ACCESS_RESTRICTION.value:
                    is_access_restricted = True
                    result.success = False
                    result.error_category = ErrorCategory.ACCESS_RESTRICTION.value
                    result.error_message = classified_access.explanation
                    result.error_details = classified_access.to_dict()
                    result.retryable = False
                    result.failures.append({
                        "failure_type": ErrorCategory.ACCESS_RESTRICTION.value,
                        "title": "Access Restricted / Bot Challenge Detected",
                        "message": (
                            f"Target website presented anti-bot security controls or CAPTCHA at {result.final_url}. "
                            "Automated testing cannot proceed past bot protection gates."
                        ),
                        "error_signature": hashlib.sha256(f"ACCESS_RESTRICT_{result.final_url}".encode()).hexdigest()[:16],
                        "component": "AccessControl",
                        "url_or_file": result.final_url
                    })

            # Check for HTTP 4xx / 5xx
            if not is_access_restricted and status_code >= 400:
                classified_http = classify_navigation_error(http_status=status_code)
                result.success = False
                result.error_category = ErrorCategory.HTTP_ERROR.value
                result.error_message = classified_http.explanation
                result.error_details = classified_http.to_dict()
                result.retryable = classified_http.retryable
                result.failures.append({
                    "failure_type": ErrorCategory.HTTP_ERROR.value,
                    "title": f"HTTP Response Status {status_code}",
                    "message": f"Server responded with error status code {status_code} for target URL.",
                    "error_signature": hashlib.sha256(f"HTTP_{status_code}_{safe_url}".encode()).hexdigest()[:16],
                    "component": "HTTP Response",
                    "url_or_file": safe_url
                })

            # 9. Capture Screenshot
            try:
                await page.screenshot(path=screenshot_path, full_page=False)
                if os.path.exists(screenshot_path):
                    result.artifacts.append({
                        "artifact_type": "SCREENSHOT",
                        "file_path": screenshot_path,
                        "file_size_bytes": os.path.getsize(screenshot_path),
                        "mime_type": "image/png"
                    })
                    await emit_evt(5, "Failure Detection", f"Visual rendering snapshot captured: {screenshot_filename}", level="INFO")
            except Exception as se:
                logger.warning(f"Could not capture screenshot: {se}")

            # 10. Extract Accurate Performance Metrics (No Fake Metrics)
            if not is_access_restricted and status_code < 400:
                await emit_evt(4, "Performance Measurement", "Evaluating browser Web Vitals via PerformanceObserver...")
                try:
                    raw_vitals = await page.evaluate(WEB_VITALS_INJECTION_SCRIPT)
                except Exception as eval_err:
                    logger.warning(f"Failed to evaluate web vitals script: {eval_err}")
                    raw_vitals = {}

                collection_ts = datetime.now(timezone.utc).isoformat()
                metrics_specs = [
                    ("TTFB", raw_vitals.get("ttfb"), "ms"),
                    ("FCP", raw_vitals.get("fcp"), "ms"),
                    ("LCP", raw_vitals.get("lcp"), "ms"),
                    ("CLS", raw_vitals.get("cls"), "score"),
                    ("DOM_CONTENT_LOADED", raw_vitals.get("dom_content_loaded"), "ms"),
                    ("PAGE_LOAD_TIME", raw_vitals.get("page_load_time"), "ms"),
                    ("TOTAL_RESOURCES", raw_vitals.get("total_resources"), "count"),
                    ("TRANSFER_SIZE_KB", raw_vitals.get("transfer_size_kb"), "KB"),
                    ("LONG_TASKS_COUNT", raw_vitals.get("long_task_count"), "count"),
                    ("LONG_TASKS_DURATION", raw_vitals.get("long_task_duration_ms"), "ms"),
                ]

                # INP is only added if actual interactions occurred
                if raw_vitals.get("inp") is not None:
                    metrics_specs.append(("INP", raw_vitals.get("inp"), "ms"))
                else:
                    result.unavailable_metrics.append("INP (No user interactions triggered)")

                for name, val, unit in metrics_specs:
                    if val is not None:
                        rating = calculate_vital_rating(name, float(val))
                        await emit_evt(4, "Performance Measurement", f"Vital measured: {name} = {round(float(val), 2)} {unit} ({rating})", level="METRIC", metric={"name": name, "value": round(float(val), 2), "rating": rating})
                        result.metrics.append({
                            "name": name,
                            "value": round(float(val), 2),
                            "unit": unit,
                            "rating": rating,
                            "available": True,
                            "is_emulated": True,
                            "measurement_status": "MEASURED",
                            "collected_at": collection_ts,
                            "details": {
                                "device_profile": profile["name"],
                                "device_type": profile.get("device_type", "Custom"),
                                "cpu_cores": profile.get("cpu_cores", 4),
                                "cpu_throttle_rate": profile["cpu_throttle_rate"],
                                "network_profile": profile["network"].get("name", "Custom"),
                                "network_latency_ms": profile["network"]["latency"],
                                "ram_mb": profile.get("ram_mb", 4096),
                                "storage_profile": profile.get("storage_profile", "Standard"),
                                "disclaimer": profile["emulation_disclaimer"]
                            }
                        })
                    else:
                        result.unavailable_metrics.append(name)

                # Determine overall completion state
                # If page succeeded without fatal failures, check for warnings
                fatal_categories = {
                    ErrorCategory.NETWORK_ERROR.value,
                    ErrorCategory.BROWSER_INFRASTRUCTURE_ERROR.value,
                    ErrorCategory.ACCESS_RESTRICTION.value,
                    ErrorCategory.NAVIGATION_TIMEOUT.value,
                    ErrorCategory.SSL_ERROR.value,
                    ErrorCategory.HTTP_ERROR.value
                }
                has_fatal = any(f["failure_type"] in fatal_categories for f in result.failures)
                if len(result.metrics) > 0 and status_code < 400 and not is_access_restricted:
                    # Page loaded and vital metrics were successfully collected
                    result.success = True
                    result.completed_with_warnings = len(result.failures) > 0
                elif not has_fatal:
                    result.success = True
                    result.completed_with_warnings = len(result.failures) > 0
                else:
                    result.success = False

        except Exception as e:
            classified = classify_navigation_error(str(e))
            result.success = False
            result.error_category = classified.category
            result.error_message = str(e)
            result.error_details = classified.to_dict()
            result.retryable = classified.retryable
            result.failures.append({
                "failure_type": classified.category,
                "title": f"Engine Exception ({classified.category})",
                "message": f"Execution halted: {str(e)}",
                "error_signature": hashlib.sha256(f"UNHANDLED_{str(e)[:80]}".encode()).hexdigest()[:16],
                "component": "PlaywrightRunner",
                "url_or_file": safe_url
            })
        finally:
            # Deterministic Resource Cleanup
            if cdp_session:
                try:
                    await cdp_session.detach()
                except Exception:
                    pass
            if page:
                try:
                    await page.close()
                except Exception:
                    pass
            if context:
                try:
                    await context.close()
                except Exception:
                    pass
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
            result.duration_ms = int((time.time() - start_time) * 1000)

    return result
