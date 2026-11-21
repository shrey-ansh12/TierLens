from typing import Dict, Any

WEB_DEVICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "GOOD_BUDGET": {
        "name": "₹15,000 Indian Mid-Tier (Good Budget)",
        "description": "Emulates modern mid-budget hardware in India (e.g. Samsung Galaxy A14 / Moto G54 / Realme 11).",
        "viewport": {"width": 390, "height": 844},
        "device_scale_factor": 2.5,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_throttle_rate": 4.0, # 4x slowdown
        "network": {
            "offline": False,
            "latency": 50, # ms
            "download_throughput": 1.6 * 1024 * 1024 / 8, # 1.6 Mbps
            "upload_throughput": 750 * 1024 / 8,          # 750 kbps
            "connection_type": "cellular3g"
        },
        "ram_mb": 4096,
        "indian_market_share_pct": 36.0,
        "indian_users_millions": 180,
        "market_segment_name": "₹12,000 - ₹20,000 Mid-Tier",
        "network_profile_name": "Standard Urban 4G",
        "is_emulated": True,
        "emulation_disclaimer": "Metrics represent browser-level CPU & network throttling, not native Android kernel metrics."
    },
    "ENTRY_LEVEL": {
        "name": "The ₹8,000 Cheap Phone Test (Entry-Level)",
        "description": "The Cheap Phone Test: Emulates ₹8,000 budget hardware (Redmi 9A / Poco C51 / JioPhone Next / Unisoc) under congested Tier-2/3 Indian cellular data.",
        "viewport": {"width": 360, "height": 800},
        "device_scale_factor": 2.0,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 11; M2006C3LG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_throttle_rate": 8.0, # 8x slowdown
        "network": {
            "offline": False,
            "latency": 250, # ms (congested cell tower)
            "download_throughput": 500 * 1024 / 8, # 500 kbps
            "upload_throughput": 250 * 1024 / 8,   # 250 kbps
            "connection_type": "cellular2g"
        },
        "ram_mb": 2048,
        "indian_market_share_pct": 38.5,
        "indian_users_millions": 190,
        "market_segment_name": "Sub-₹8,000 Entry-Level Devices",
        "network_profile_name": "Jio/Airtel Congested Tier-2/3 Cellular",
        "is_emulated": True,
        "emulation_disclaimer": "Metrics represent aggressive browser CPU & 2G/3G throttling matching sub-₹8k Indian phones."
    }
}
