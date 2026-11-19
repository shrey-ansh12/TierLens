from typing import Dict, Any

WEB_DEVICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "GOOD_BUDGET": {
        "name": "Good Budget Device Profile",
        "description": "Emulates modern budget hardware (~$150-$200 bracket, e.g. Samsung Galaxy A14 / Moto G).",
        "viewport": {"width": 390, "height": 844},
        "device_scale_factor": 2.5,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_throttle_rate": 4.0, # 4x slowdown
        "network": {
            "offline": False,
            "latency": 40, # ms
            "download_throughput": 1.6 * 1024 * 1024 / 8, # 1.6 Mbps
            "upload_throughput": 750 * 1024 / 8,          # 750 kbps
            "connection_type": "cellular3g"
        },
        "ram_mb": 4096,
        "is_emulated": True,
        "emulation_disclaimer": "Metrics represent browser-level CPU & network throttling, not native Android kernel metrics."
    },
    "ENTRY_LEVEL": {
        "name": "Entry-Level Device Profile",
        "description": "Emulates constrained entry-level hardware (~$70-$100 bracket, e.g. Redmi 9A / Nokia C-series).",
        "viewport": {"width": 360, "height": 800},
        "device_scale_factor": 2.0,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 11; M2006C3LG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_throttle_rate": 8.0, # 8x slowdown
        "network": {
            "offline": False,
            "latency": 200, # ms
            "download_throughput": 500 * 1024 / 8, # 500 kbps
            "upload_throughput": 250 * 1024 / 8,   # 250 kbps
            "connection_type": "cellular2g"
        },
        "ram_mb": 2048,
        "is_emulated": True,
        "emulation_disclaimer": "Metrics represent aggressive browser CPU & 2G/3G throttling, not native Android kernel metrics."
    }
}
