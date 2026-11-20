from typing import Dict, Any, List, Optional

def calculate_vital_rating(name: str, value: Optional[float]) -> str:
    """
    Standard Web Vitals thresholds. Returns 'UNAVAILABLE' if value is None.
    - LCP: Good <= 2500ms, Needs Improvement <= 4000ms, Poor > 4000ms
    - FCP: Good <= 1800ms, Needs Improvement <= 3000ms, Poor > 3000ms
    - CLS: Good <= 0.1, Needs Improvement <= 0.25, Poor > 0.25
    - TTFB: Good <= 800ms, Needs Improvement <= 1800ms, Poor > 1800ms
    - PAGE_LOAD_TIME: Good <= 3000ms, Needs Improvement <= 6000ms, Poor > 6000ms
    - DOM_CONTENT_LOADED: Good <= 1500ms, Needs Improvement <= 3000ms, Poor > 3000ms
    - INP: Good <= 200ms, Needs Improvement <= 500ms, Poor > 500ms
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
        let transferSize = null;
        let domElementCount = null;

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
                if (nav.transferSize !== undefined) {
                    transferSize = nav.transferSize;
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
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
            if (lcpEntries && lcpEntries.length > 0) {
                lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
            }
        } catch (e) {}

        // Cumulative Layout Shift (CLS)
        try {
            const layoutEntries = performance.getEntriesByType('layout-shift');
            for (const entry of layoutEntries) {
                if (!entry.hadRecentInput && entry.value > 0) {
                    cls += entry.value;
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
            transfer_size_bytes: transferSize,
            dom_element_count: domElementCount
        });
    });
}
"""
