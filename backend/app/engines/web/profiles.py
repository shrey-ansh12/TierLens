from typing import Dict, Any, Optional

WEB_DEVICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "GOOD_BUDGET": {
"id": "prof-android-budget",
        "name": "₹15,000 Indian Mid-Tier (Good Budget)",
        "tier": "GOOD_BUDGET",
        "device_type": "Budget Android",
        "description": "Emulates modern mid-budget hardware in India (e.g. Samsung Galaxy A14 / Moto G54 / Realme 11).",
        "viewport": {"width": 390, "height": 844},
        "device_scale_factor": 2.5,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_cores": 4,
        "cpu_category": "4-core budget",
        "cpu_throttle_rate": 4.0, # 4x slowdown
        "storage_profile": "Standard storage profile",
        "storage_capacity_gb": 64,
        "storage_available_gb": 16,
        "network": {
            "name": "Fast 3G",
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
        "emulation_disclaimer": "Simulated parameters: CPU throttling (4.0x via CDP) and Network throttling (Fast 3G via CDP). RAM (4096MB) and Storage (64GB Standard) are recorded as analytical target specifications."
    },
    "ENTRY_LEVEL": {
"id": "prof-android-entry",
        "name": "The ₹8,000 Cheap Phone Test (Entry-Level)",
        "tier": "ENTRY_LEVEL",
        "device_type": "Entry-level Android",
        "description": "The Cheap Phone Test: Emulates ₹8,000 budget hardware (Redmi 9A / Poco C51 / JioPhone Next / Unisoc) under congested Tier-2/3 Indian cellular data.",
        "viewport": {"width": 360, "height": 800},
        "device_scale_factor": 2.0,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 11; M2006C3LG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_cores": 2,
        "cpu_category": "2-core low-end",
        "cpu_throttle_rate": 8.0, # 8x slowdown
        "storage_profile": "Low-speed storage profile",
        "storage_capacity_gb": 32,
        "storage_available_gb": 4,
        "network": {
            "name": "Slow 3G",
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

def resolve_device_profile_config(profile_data: Any) -> Dict[str, Any]:
    """
    Normalizes any profile input (preset key, database model instance, or custom dictionary)
    into a standardized runtime configuration dictionary for Playwright & CDP.
    """
    if isinstance(profile_data, str):
        key = profile_data.upper()
        if key in WEB_DEVICE_PROFILES:
            return WEB_DEVICE_PROFILES[key]
        # Check by id
        for p in WEB_DEVICE_PROFILES.values():
            if p.get("id") == profile_data:
                return p
        return WEB_DEVICE_PROFILES["GOOD_BUDGET"]

    # If it's an SQLAlchemy DeviceProfile entity
    if hasattr(profile_data, "name") and hasattr(profile_data, "cpu_throttle_rate"):
        down_kbps = getattr(profile_data, "network_down_kbps", 1600.0) or 1600.0
        up_kbps = getattr(profile_data, "network_up_kbps", 750.0) or 750.0
        latency_ms = getattr(profile_data, "network_latency_ms", 40) or 40
        net_name = getattr(profile_data, "network_profile", "Fast 3G") or "Fast 3G"
        cpu_rate = getattr(profile_data, "cpu_throttle_rate", 1.0) or 1.0

        is_offline = (net_name.lower() == "offline")
        conn_type = "none" if is_offline else ("wifi" if "wi-fi" in net_name.lower() or "wifi" in net_name.lower() else ("cellular4g" if "4g" in net_name.lower() or "5g" in net_name.lower() else "cellular3g"))

        return {
            "id": getattr(profile_data, "id", None),
            "name": profile_data.name,
            "tier": getattr(profile_data, "tier", "CUSTOM"),
            "device_type": getattr(profile_data, "device_type", "Custom Device"),
            "description": getattr(profile_data, "description", None) or f"{profile_data.name} configuration",
            "viewport": {
                "width": getattr(profile_data, "viewport_width", 390) or 390,
                "height": getattr(profile_data, "viewport_height", 844) or 844
            },
            "device_scale_factor": getattr(profile_data, "device_scale_factor", 2.0) or 2.0,
            "is_mobile": getattr(profile_data, "is_mobile", True),
            "has_touch": getattr(profile_data, "has_touch", True),
            "user_agent": getattr(profile_data, "user_agent", None) or "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
            "cpu_cores": getattr(profile_data, "cpu_cores", 4) or 4,
            "cpu_category": getattr(profile_data, "cpu_category", "Budget") or "Budget",
            "cpu_throttle_rate": cpu_rate,
            "storage_profile": getattr(profile_data, "storage_profile", "Standard") or "Standard",
            "storage_capacity_gb": getattr(profile_data, "storage_capacity_gb", 64) or 64,
            "storage_available_gb": getattr(profile_data, "storage_available_gb", 16) or 16,
            "network": {
                "name": net_name,
                "offline": is_offline,
                "latency": latency_ms,
                "download_throughput": down_kbps * 1024 / 8,
                "upload_throughput": up_kbps * 1024 / 8,
                "connection_type": conn_type
            },
            "ram_mb": getattr(profile_data, "ram_mb", 4096) or 4096,
            "is_emulated": True,
            "emulation_disclaimer": (
                f"Simulated parameters: CPU throttling ({cpu_rate}x via CDP) and Network throttling ({net_name} via CDP). "
                f"RAM ({getattr(profile_data, 'ram_mb', 4096)}MB) and Storage ({getattr(profile_data, 'storage_capacity_gb', 64)}GB {getattr(profile_data, 'storage_profile', 'Standard')}) "
                "are recorded as analytical target specifications."
            )
        }

    # If it's a dict
    if isinstance(profile_data, dict):
        down_kbps = float(profile_data.get("network_down_kbps", 1600.0) or 1600.0)
        up_kbps = float(profile_data.get("network_up_kbps", 750.0) or 750.0)
        latency_ms = int(profile_data.get("network_latency_ms", 40) or 40)
        net_name = str(profile_data.get("network_profile", "Fast 3G") or "Fast 3G")
        cpu_rate = float(profile_data.get("cpu_throttle_rate", 1.0) or 1.0)
        is_offline = (net_name.lower() == "offline")
        conn_type = "none" if is_offline else ("wifi" if "wi-fi" in net_name.lower() or "wifi" in net_name.lower() else ("cellular4g" if "4g" in net_name.lower() or "5g" in net_name.lower() else "cellular3g"))

        width = int(profile_data.get("viewport_width", 390) or 390)
        height = int(profile_data.get("viewport_height", 844) or 844)
        if "viewport" in profile_data and isinstance(profile_data["viewport"], dict):
            width = profile_data["viewport"].get("width", width)
            height = profile_data["viewport"].get("height", height)

        return {
            "id": profile_data.get("id"),
            "name": profile_data.get("name", "Custom Device Profile"),
            "tier": profile_data.get("tier", "CUSTOM"),
            "device_type": profile_data.get("device_type", "Custom Device"),
            "description": profile_data.get("description", "Custom device configuration"),
            "viewport": {"width": width, "height": height},
            "device_scale_factor": float(profile_data.get("device_scale_factor", 2.0) or 2.0),
            "is_mobile": bool(profile_data.get("is_mobile", True)),
            "has_touch": bool(profile_data.get("has_touch", True)),
            "user_agent": profile_data.get("user_agent") or "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
            "cpu_cores": int(profile_data.get("cpu_cores", 4) or 4),
            "cpu_category": profile_data.get("cpu_category", "4-core budget"),
            "cpu_throttle_rate": cpu_rate,
            "storage_profile": profile_data.get("storage_profile", "Standard storage profile"),
            "storage_capacity_gb": int(profile_data.get("storage_capacity_gb", 64) or 64),
            "storage_available_gb": int(profile_data.get("storage_available_gb", 16) or 16),
            "network": {
                "name": net_name,
                "offline": is_offline,
                "latency": latency_ms,
                "download_throughput": down_kbps * 1024 / 8,
                "upload_throughput": up_kbps * 1024 / 8,
                "connection_type": conn_type
            },
            "ram_mb": int(profile_data.get("ram_mb", 4096) or 4096),
            "is_emulated": True,
            "emulation_disclaimer": (
                f"Simulated parameters: CPU throttling ({cpu_rate}x via CDP) and Network throttling ({net_name} via CDP). "
                f"RAM ({profile_data.get('ram_mb', 4096)}MB) and Storage ({profile_data.get('storage_capacity_gb', 64)}GB {profile_data.get('storage_profile', 'Standard')}) "
                "are recorded as analytical target specifications."
            )
        }

    return WEB_DEVICE_PROFILES["GOOD_BUDGET"]