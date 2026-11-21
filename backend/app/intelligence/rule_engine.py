from typing import Dict, Any, List

def analyze_performance_rules(
    metrics: List[Dict[str, Any]],
    failures: List[Dict[str, Any]],
    tier: str = "Configured Profile",
    device_name: str = "Configured Device"
) -> List[Dict[str, Any]]:
    """
    Deterministic evidence-grounded Root Cause Analysis engine.
    Every finding strictly provides:
    - detected_issue
    - evidence
    - affected_metric
    - affected_device_configuration
    - probable_cause
    - confidence_level
    - recommended_fix (remediation)
    - verification_steps
    """
    recommendations = []
    metric_map = {m["name"]: m["value"] for m in metrics}

    # 1. High LCP + Payload Decoding / Image Delay
    lcp = metric_map.get("LCP", 0)
    transfer_kb = metric_map.get("TRANSFER_SIZE_KB", 0)
    if lcp > 3000:
        evidence_list = [
            {"type": "METRIC", "metric": "LCP", "value": f"{lcp:.0f}ms", "threshold": "2500ms"},
            {"type": "DEVICE_CONFIGURATION", "device": device_name, "profile": tier}
        ]
        if transfer_kb > 2048:
            evidence_list.append({"type": "METRIC", "metric": "TRANSFER_SIZE_KB", "value": f"{transfer_kb:.1f} KB", "threshold": "2048 KB"})

        confidence = "HIGH (92%)" if (lcp > 4000 or transfer_kb > 3000) else "MEDIUM (78%)"
        recommendations.append({
            "title": "Severe Largest Contentful Paint (LCP) Delay",
            "detected_issue": f"LCP exceeded performance budget at {lcp:.0f}ms",
            "affected_metric": "LCP",
            "affected_device_configuration": f"{device_name} ({tier})",
            "confidence_level": confidence,
            "category": "Performance",
            "impact": "HIGH",
            "probable_cause": (
                f"LCP measured at {lcp:.0f}ms on {device_name}. Heavy hero asset transfer "
                f"({transfer_kb:.0f} KB total page assets) or render-blocking stylesheets delayed above-the-fold painting."
            ),
            "evidence": evidence_list,
            "supporting_evidence": evidence_list,
            "recommended_fix": (
                "1. Preload the primary above-the-fold hero image via `<link rel='preload' as='image'>`.\n"
                "2. Transcode imagery to next-gen formats (AVIF / WebP) with `srcset` responsive breakpoints.\n"
                "3. Inline critical CSS and defer non-critical third-party fonts and widgets."
            ),
            "remediation": (
                "1. Preload the primary above-the-fold hero image via `<link rel='preload' as='image'>`.\n"
                "2. Transcode imagery to next-gen formats (AVIF / WebP) with `srcset` responsive breakpoints.\n"
                "3. Inline critical CSS and defer non-critical third-party fonts and widgets."
            ),
            "verification_steps": (
                f"1. Deploy optimized images and preload tags.\n"
                f"2. Rerun performance test with the {device_name} profile.\n"
                "3. Verify LCP decreases below 2500ms."
            )
        })

    # 2. Main-Thread Blocking / Long Tasks under CPU Throttling
    long_task_duration = metric_map.get("LONG_TASKS_DURATION", 0)
    long_task_count = metric_map.get("LONG_TASKS_COUNT", 0)
    if long_task_duration > 300 or long_task_count > 3:
        evidence_list = [
            {"type": "METRIC", "metric": "LONG_TASKS_DURATION", "value": f"{long_task_duration:.0f}ms", "threshold": "200ms"},
            {"type": "METRIC", "metric": "LONG_TASKS_COUNT", "value": f"{long_task_count}", "threshold": "2 tasks"},
            {"type": "DEVICE_CONFIGURATION", "device": device_name, "profile": tier}
        ]
        confidence = "HIGH (94%)" if long_task_duration > 600 else "MEDIUM (82%)"
        recommendations.append({
            "title": "Main-Thread JavaScript Execution Bottleneck",
            "detected_issue": f"Main-thread frozen by {long_task_count} long tasks totaling {long_task_duration:.0f}ms",
            "affected_metric": "LONG_TASKS_DURATION",
            "affected_device_configuration": f"{device_name} ({tier})",
            "confidence_level": confidence,
            "category": "CPU / Main Thread",
            "impact": "HIGH",
            "probable_cause": (
                f"Monolithic JavaScript bundle execution on {device_name} consumed {long_task_duration:.0f}ms of main thread time, "
                "causing UI freezes, input lag, and frame drops under CPU-constrained hardware."
            ),
            "evidence": evidence_list,
            "supporting_evidence": evidence_list,
            "recommended_fix": (
                "1. Break up monolithic script bundles using dynamic `import()` and code-splitting.\n"
                "2. Offload heavy computational routines (parsing, crypto, sorting) to Web Workers.\n"
                "3. Yield execution back to the browser event loop using `scheduler.yield()` or `requestIdleCallback()`."
            ),
            "remediation": (
                "1. Break up monolithic script bundles using dynamic `import()` and code-splitting.\n"
                "2. Offload heavy computational routines (parsing, crypto, sorting) to Web Workers.\n"
                "3. Yield execution back to the browser event loop using `scheduler.yield()` or `requestIdleCallback()`."
            ),
            "verification_steps": (
                f"1. Implement bundle splitting and lazy loading.\n"
                f"2. Rerun test on {device_name}.\n"
                "3. Verify long task blocking duration drops below 200ms."
            )
        })

    # 3. Cumulative Layout Shift (CLS)
    cls = metric_map.get("CLS", 0)
    if cls > 0.12:
        evidence_list = [
            {"type": "METRIC", "metric": "CLS", "value": str(cls), "threshold": "0.10"},
            {"type": "DEVICE_CONFIGURATION", "device": device_name, "profile": tier}
        ]
        confidence = "HIGH (90%)" if cls > 0.25 else "MEDIUM (76%)"
        recommendations.append({
            "title": "Substantial Layout Instability (CLS Reflow)",
            "detected_issue": f"Page layout shifted abruptly with CLS score of {cls:.3f}",
            "affected_metric": "CLS",
            "affected_device_configuration": f"{device_name} ({tier})",
            "confidence_level": confidence,
            "category": "Visual Stability",
            "impact": "MEDIUM",
            "probable_cause": (
                f"CLS measured at {cls:.3f} on {device_name}. Visual reflows occurred because images, "
                "embeds, or web fonts loaded without explicit CSS aspect-ratio or dimension reservations."
            ),
            "evidence": evidence_list,
            "supporting_evidence": evidence_list,
            "recommended_fix": (
                "1. Ensure all `<img>`, `<video>`, and `<iframe>` elements specify `width` and `height` attributes or CSS `aspect-ratio`.\n"
                "2. Reserve bounding space for dynamically injected banner components or ads using `min-height`.\n"
                "3. Use `font-display: optional` or match fallback font metrics with `size-adjust` to avoid FOIT/FOUT reflows."
            ),
            "remediation": (
                "1. Ensure all `<img>`, `<video>`, and `<iframe>` elements specify `width` and `height` attributes or CSS `aspect-ratio`.\n"
                "2. Reserve bounding space for dynamically injected banner components or ads using `min-height`.\n"
                "3. Use `font-display: optional` or match fallback font metrics with `size-adjust` to avoid FOIT/FOUT reflows."
            ),
            "verification_steps": (
                f"1. Add dimensional constraints to volatile containers.\n"
                f"2. Retest against {device_name}.\n"
                "3. Verify CLS remains <= 0.10."
            )
        })

    # 4. Time To First Byte (TTFB) / Server Latency
    ttfb = metric_map.get("TTFB", 0)
    if ttfb > 1200:
        evidence_list = [
            {"type": "METRIC", "metric": "TTFB", "value": f"{ttfb:.0f}ms", "threshold": "800ms"},
            {"type": "DEVICE_CONFIGURATION", "device": device_name, "profile": tier}
        ]
        confidence = "HIGH (88%)" if ttfb > 2000 else "MEDIUM (74%)"
        recommendations.append({
            "title": "High Server Response Latency (TTFB)",
            "detected_issue": f"Initial server response delayed ({ttfb:.0f}ms TTFB)",
            "affected_metric": "TTFB",
            "affected_device_configuration": f"{device_name} ({tier})",
            "confidence_level": confidence,
            "category": "Network & Backend",
            "impact": "HIGH",
            "probable_cause": (
                f"TTFB measured at {ttfb:.0f}ms. Severe server delay before transmitting initial HTML, "
                "attributable to cold starts, unindexed database queries, or lack of reverse-proxy edge caching."
            ),
            "evidence": evidence_list,
            "supporting_evidence": evidence_list,
            "recommended_fix": (
                "1. Enable Edge CDN HTML caching (Cloudflare, CloudFront, Fastly) with `Cache-Control: s-maxage`.\n"
                "2. Optimize backend database queries and connection pooling.\n"
                "3. Preconnect to critical API origins using `<link rel='preconnect'>`."
            ),
            "remediation": (
                "1. Enable Edge CDN HTML caching (Cloudflare, CloudFront, Fastly) with `Cache-Control: s-maxage`.\n"
                "2. Optimize backend database queries and connection pooling.\n"
                "3. Preconnect to critical API origins using `<link rel='preconnect'>`."
            ),
            "verification_steps": (
                f"1. Deploy edge caching or database optimizations.\n"
                f"2. Rerun test against {device_name}.\n"
                "3. Verify TTFB stays below 800ms."
            )
        })

    # 5. Failed Subresource Requests
    net_failures = [f for f in failures if f.get("failure_type") in ("NETWORK_ERROR", "HTTP_FAILURE")]
    if net_failures:
        evidence_list = [
            {"type": "FAILURE_COUNT", "failed_requests": len(net_failures)},
            {"type": "FIRST_FAILED_RESOURCE", "url": net_failures[0].get("url_or_file", "unknown")},
            {"type": "DEVICE_CONFIGURATION", "device": device_name, "profile": tier}
        ]
        recommendations.append({
            "title": f"Subresource Request Failures ({len(net_failures)} resource(s) failed)",
            "detected_issue": f"{len(net_failures)} subresources failed to load during page execution",
            "affected_metric": "TOTAL_RESOURCES",
            "affected_device_configuration": f"{device_name} ({tier})",
            "confidence_level": "HIGH (95%)",
            "category": "Resource Availability",
            "impact": "HIGH",
            "probable_cause": (
                f"{len(net_failures)} subresource requests failed on {device_name}. Broken CDN links, "
                "missing assets (404), or CORS rejection prevented critical page assets from loading."
            ),
            "evidence": evidence_list,
            "supporting_evidence": evidence_list,
            "recommended_fix": (
                "1. Check the failed URLs listed in Failure Explorer.\n"
                "2. Verify cross-origin headers (`Access-Control-Allow-Origin`) for font and API endpoints.\n"
                "3. Ensure CDN endpoints are online and not rate-limiting or blocking automated requests."
            ),
            "remediation": (
                "1. Check the failed URLs listed in Failure Explorer.\n"
                "2. Verify cross-origin headers (`Access-Control-Allow-Origin`) for font and API endpoints.\n"
                "3. Ensure CDN endpoints are online and not rate-limiting or blocking automated requests."
            ),
            "verification_steps": (
                f"1. Fix URL endpoints and CORS policies.\n"
                f"2. Rerun test against {device_name}.\n"
                "3. Confirm all subresources return HTTP 200/304."
            )
        })

    # 6. Uncaught JavaScript Runtime Errors
    js_errors = [f for f in failures if f.get("failure_type") in ("TARGET_APPLICATION_ERROR", "JS_ERROR")]
    if js_errors:
        err_titles = [e.get("title", "") for e in js_errors[:2]]
        evidence_list = [
            {"type": "EXCEPTION_COUNT", "count": len(js_errors)},
            {"type": "SIGNATURE", "signature": js_errors[0].get("error_signature", "unknown")},
            {"type": "SAMPLE_MESSAGE", "message": js_errors[0].get("message", "")[:200]},
            {"type": "DEVICE_CONFIGURATION", "device": device_name, "profile": tier}
        ]
        recommendations.append({
            "title": f"Uncaught Runtime JavaScript Exceptions ({len(js_errors)} error(s))",
            "detected_issue": f"Client script crashed with: {err_titles[0] if err_titles else 'Runtime Exception'}",
            "affected_metric": "DOM_CONTENT_LOADED",
            "affected_device_configuration": f"{device_name} ({tier})",
            "confidence_level": "HIGH (98%)",
            "category": "Client Stability",
            "impact": "HIGH",
            "probable_cause": (
                f"Uncaught JavaScript exceptions occurred during execution on {device_name}. "
                "Missing null-checks on API responses or unsupported modern browser APIs in throttled runtimes."
            ),
            "evidence": evidence_list,
            "supporting_evidence": evidence_list,
            "recommended_fix": (
                "1. Inspect stack trace in Failure Explorer.\n"
                "2. Use safe optional chaining (`?.`) when accessing nested properties.\n"
                "3. Wrap component trees in React Error Boundaries to prevent total page crashes."
            ),
            "remediation": (
                "1. Inspect stack trace in Failure Explorer.\n"
                "2. Use safe optional chaining (`?.`) when accessing nested properties.\n"
                "3. Wrap component trees in React Error Boundaries to prevent total page crashes."
            ),
            "verification_steps": (
                f"1. Apply error handling patch in application code.\n"
                f"2. Rerun test against {device_name}.\n"
                "3. Verify zero runtime exceptions in console logs."
            )
        })

    return recommendations
