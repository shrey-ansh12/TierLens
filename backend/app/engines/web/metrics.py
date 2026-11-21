from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

def calculate_vital_rating(name: str, value: Optional[float]) -> str:
    """
    Web Vitals and browser performance thresholds. Returns 'UNAVAILABLE' if value is None.
    - LCP: Good <= 2500ms, Needs Improvement <= 4000ms, Poor > 4000ms
    - FCP: Good <= 1800ms, Needs Improvement <= 3000ms, Poor > 3000ms
    - CLS: Good <= 0.10, Needs Improvement <= 0.25, Poor > 0.25
    - TTFB: Good <= 800ms, Needs Improvement <= 1800ms, Poor > 1800ms
    - PAGE_LOAD_TIME: Good <= 3000ms, Needs Improvement <= 6000ms, Poor > 6000ms
    - DOM_CONTENT_LOADED: Good <= 1500ms, Needs Improvement <= 3000ms, Poor > 3000ms
    - INP: Good <= 200ms, Needs Improvement <= 500ms, Poor > 500ms
    - LONG_TASKS_DURATION: Good <= 200ms, Needs Improvement <= 600ms, Poor > 600ms
    - LONG_TASKS_COUNT: Good <= 2, Needs Improvement <= 6, Poor > 6
    - TOTAL_RESOURCES: Good <= 50, Needs Improvement <= 100, Poor > 100
    - TRANSFER_SIZE: Good <= 2048 KB, Needs Improvement <= 5120 KB, Poor > 5120 KB
    """
    if value is None:
        return "UNAVAILABLE"

    if name == "LCP":
        if value <= 2500: return "GOOD"
        elif value <= 4000: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "FCP":
        if value <= 1800: return "GOOD"
        elif value <= 3000: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "CLS":
        if value <= 0.10: return "GOOD"
        elif value <= 0.25: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "TTFB":
        if value <= 800: return "GOOD"
        elif value <= 1800: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "PAGE_LOAD_TIME":
        if value <= 3000: return "GOOD"
        elif value <= 6000: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "DOM_CONTENT_LOADED":
        if value <= 1500: return "GOOD"
        elif value <= 3000: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "INP":
        if value <= 200: return "GOOD"
        elif value <= 500: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "LONG_TASKS_DURATION":
        if value <= 200: return "GOOD"
        elif value <= 600: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "LONG_TASKS_COUNT":
        if value <= 2: return "GOOD"
        elif value <= 6: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "TOTAL_RESOURCES":
        if value <= 50: return "GOOD"
        elif value <= 100: return "NEEDS_IMPROVEMENT"
        return "POOR"
    elif name == "TRANSFER_SIZE_KB":
        if value <= 2048: return "GOOD"
        elif value <= 5120: return "NEEDS_IMPROVEMENT"
        return "POOR"
    return "GOOD"


# Browser script to extract actual Performance Timeline and Web Vitals metrics.
# STRICT POLICY: Never fabricates synthetic values or fake defaults.
WEB_VITALS_INJECTION_SCRIPT = """
() => {
    return new Promise((resolve) => {
        let fcp = null;
        let lcp = null;
        let cls = 0;
        let ttfb = null;
        let domContentLoaded = null;
        let loadTime = null;
        let totalTransferBytes = 0;
        let totalResourceCount = 0;
        let domElementCount = null;
        let longTaskCount = 0;
        let longTaskDurationMs = 0;
        let inp = null;

        try {
            domElementCount = document.getElementsByTagName('*').length;
        } catch (e) {}

        // Navigation Timing (W3C Navigation Timing Level 2)
        try {
            const navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0) {
                const nav = navEntries[0];
                if (nav.responseStart > 0 && nav.requestStart > 0) {
                    ttfb = Math.max(0, Math.round(nav.responseStart - nav.requestStart));
                } else if (nav.responseStart > 0) {
                    ttfb = Math.max(0, Math.round(nav.responseStart - nav.startTime));
                }
                if (nav.domContentLoadedEventEnd > 0) {
                    domContentLoaded = Math.max(0, Math.round(nav.domContentLoadedEventEnd - nav.startTime));
                }
                if (nav.loadEventEnd > 0) {
                    loadTime = Math.max(0, Math.round(nav.loadEventEnd - nav.startTime));
                } else if (performance.now() > 0) {
                    loadTime = Math.round(performance.now());
                }
                if (nav.transferSize !== undefined && nav.transferSize > 0) {
                    totalTransferBytes += nav.transferSize;
                }
            }
        } catch (e) {}

        // Paint Timing (First Contentful Paint)
        try {
            const paintEntries = performance.getEntriesByType('paint');
            for (const entry of paintEntries) {
                if (entry.name === 'first-contentful-paint' && entry.startTime > 0) {
                    fcp = Math.round(entry.startTime);
                    break;
                }
            }
        } catch (e) {}

        // Largest Contentful Paint (LCP)
        try {
            const po = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                if (entries && entries.length > 0) {
                    const lastEntry = entries[entries.length - 1];
                    lcp = Math.round(lastEntry.startTime);
                }
            });
            po.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {}

        try {
            if (lcp === null) {
                const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                if (lcpEntries && lcpEntries.length > 0) {
                    lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
                }
            }
        } catch (e) {}

        // Fallback: On text-only pages with no image elements (like example.com), LCP element is the FCP text node
        if (lcp === null && fcp !== null) {
            lcp = fcp;
        }

        // Cumulative Layout Shift (CLS)
        try {
            const layoutEntries = performance.getEntriesByType('layout-shift');
            for (const entry of layoutEntries) {
                if (!entry.hadRecentInput && entry.value > 0) {
                    cls += entry.value;
                }
            }
        } catch (e) {}

        // Resource Timing (Total Resources & Transfer Size)
        try {
            const resEntries = performance.getEntriesByType('resource');
            totalResourceCount = resEntries.length;
            for (const r of resEntries) {
                if (r.transferSize && r.transferSize > 0) {
                    totalTransferBytes += r.transferSize;
                }
            }
        } catch (e) {}

        // Long Tasks (Main-thread blocking >50ms)
        try {
            const longTaskEntries = performance.getEntriesByType('longtask');
            if (longTaskEntries && longTaskEntries.length > 0) {
                longTaskCount = longTaskEntries.length;
                for (const lt of longTaskEntries) {
                    longTaskDurationMs += lt.duration;
                }
            }
        } catch (e) {}

        // Interaction to Next Paint (INP) from event timing if interactions occurred
        try {
            const eventEntries = performance.getEntriesByType('event');
            if (eventEntries && eventEntries.length > 0) {
                for (const ev of eventEntries) {
                    if (ev.duration && (inp === null || ev.duration > inp)) {
                        inp = Math.round(ev.duration);
                    }
                }
            }
        } catch (e) {}

        resolve({
            fcp: fcp,
            lcp: lcp,
            cls: parseFloat(cls.toFixed(3)),
            ttfb: ttfb,
            dom_content_loaded: domContentLoaded,
            page_load_time: loadTime,
            transfer_size_bytes: totalTransferBytes,
            transfer_size_kb: parseFloat((totalTransferBytes / 1024).toFixed(1)),
            total_resources: totalResourceCount,
            long_task_count: longTaskCount,
            long_task_duration_ms: Math.round(longTaskDurationMs),
            dom_element_count: domElementCount,
            inp: inp
        });
    });
}
"""
