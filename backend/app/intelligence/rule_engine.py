from typing import Dict, Any, List

def analyze_performance_rules(
    metrics: List[Dict[str, Any]],
    failures: List[Dict[str, Any]],
    tier: str = "ENTRY_LEVEL"
) -> List[Dict[str, Any]]:
    """
    Deterministic rule-based Root Cause Analysis engine.
    Produces evidence-backed hypotheses and optimization recommendations.
    """
    recommendations = []
    metric_map = {m["name"]: m["value"] for m in metrics}

    # 1. LCP Degradation Rule
    lcp = metric_map.get("LCP", 0)
    if lcp > 3500:
        recommendations.append({
            "title": "Severe Largest Contentful Paint (LCP) Delay",
            "category": "Performance",
            "impact": "HIGH",
            "probable_cause": (
                f"LCP measured at {lcp:.0f}ms under {tier} conditions. "
                "The browser main thread is saturated by heavy payload decoding or render-blocking scripts."
            ),
            "supporting_evidence": [
                {"type": "METRIC", "metric": "LCP", "value": f"{lcp:.0f}ms", "threshold": "2500ms"},
                {"type": "TIER_CONDITION", "condition": f"Aggressive CPU and Network Throttling ({tier})"}
            ],
            "remediation": (
                "1. Preload the hero image using `<link rel='preload' as='image'>`.\n"
                "2. Convert hero imagery to WebP or AVIF format with responsive sizes.\n"
                "3. Defer non-critical third-party analytics and chat widgets."
            ),
            "verification_steps": (
                "1. Implement image optimization and script deferral.\n"
                "2. Rerun test against the Entry-Level profile.\n"
                "3. Verify that LCP drops below 2500ms."
            )
        })

    # 2. Cumulative Layout Shift (CLS) Rule
    cls = metric_map.get("CLS", 0)
    if cls > 0.15:
        recommendations.append({
            "title": "Substantial Layout Instability (CLS)",
            "category": "Stability",
            "impact": "MEDIUM",
            "probable_cause": (
                f"CLS measured at {cls:.3f}. Elements without reserved dimensions are reflowing the page "
                "as images or fonts finish loading."
            ),
            "supporting_evidence": [
                {"type": "METRIC", "metric": "CLS", "value": str(cls), "threshold": "0.10"}
            ],
            "remediation": (
                "1. Always include explicit `width` and `height` attributes on `<img>` and video tags.\n"
                "2. Reserve space for dynamic ad banners or notification banners using CSS `min-height`."
            ),
            "verification_steps": (
                "1. Add aspect-ratio or dimensional styles to shifting elements.\n"
                "2. Rerun test and verify CLS remains under 0.10."
            )
        })

    # 3. High TTFB / Server Latency Rule
    ttfb = metric_map.get("TTFB", 0)
    if ttfb > 1500:
        recommendations.append({
            "title": "High Time To First Byte (TTFB)",
            "category": "Network",
            "impact": "HIGH",
            "probable_cause": (
                f"TTFB measured at {ttfb:.0f}ms. Significant latency observed before the initial HTML response arrived."
            ),
            "supporting_evidence": [
                {"type": "METRIC", "metric": "TTFB", "value": f"{ttfb:.0f}ms", "threshold": "800ms"}
            ],
            "remediation": (
                "1. Check backend database query timings and server cold starts.\n"
                "2. Leverage edge CDN caching for static HTML or caching headers (`Cache-Control: s-maxage`)."
            ),
            "verification_steps": (
                "1. Enable edge caching or optimize server response pipeline.\n"
                "2. Rerun test and observe TTFB under 800ms."
            )
        })

    # 4. JavaScript Exception Rule
    js_errors = [f for f in failures if f.get("failure_type") == "JS_ERROR"]
    if js_errors:
        err_titles = [e.get("title", "") for e in js_errors[:3]]
        recommendations.append({
            "title": f"Uncaught JavaScript Exceptions Detected ({len(js_errors)} instance(s))",
            "category": "Code Stability",
            "impact": "HIGH",
            "probable_cause": (
                f"Client script threw fatal runtime errors: {'; '.join(err_titles)}. "
                "Can cause frozen UI and unresponsive controls for end users."
            ),
            "supporting_evidence": [
                {"type": "FAILURE_SIGNATURE", "signature": js_errors[0].get("error_signature", "unknown")},
                {"type": "LOG_MESSAGE", "message": js_errors[0].get("message", "")[:200]}
            ],
            "remediation": (
                "1. Inspect the stack trace in Failure Explorer.\n"
                "2. Use defensive optional chaining (`?.`) when dereferencing nested API response payloads.\n"
                "3. Wrap non-essential dynamic widgets in React Error Boundaries."
            ),
            "verification_steps": (
                "1. Apply fix in codebase.\n"
                "2. Rerun test and verify zero uncaught exceptions in console logs."
            )
        })

    # 5. Failed HTTP Requests
    http_fails = [f for f in failures if f.get("failure_type") == "HTTP_FAILURE"]
    if http_fails:
        recommendations.append({
            "title": f"Failed Network Requests ({len(http_fails)} resource(s) failed to load)",
            "category": "Network",
            "impact": "MEDIUM",
            "probable_cause": "Key resources (images, fonts, or APIs) failed to resolve or returned 4xx/5xx status.",
            "supporting_evidence": [
                {"type": "URL", "url": http_fails[0].get("url_or_file", "")}
            ],
            "remediation": "Check the resource URL path, ensure correct CORS headers, and verify CDN endpoint availability.",
            "verification_steps": "Rerun test and confirm all critical assets load with HTTP 200/304 status."
        })

    return recommendations
