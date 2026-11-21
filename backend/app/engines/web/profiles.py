from typing import Dict, Any, Optional

WEB_DEVICE_PROFILES: Dict[str, Dict[str, Any]] = {
    "GOOD_BUDGET": {
        "id": "prof-android-budget",
        "name": "Budget Android (4-Core, 4GB)",
        "tier": "GOOD_BUDGET",
        "device_type": "Budget Android",
        "description": "Emulates modern budget hardware (~$150-$200 bracket, e.g. Samsung Galaxy A14 / Moto G).",
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
            "latency": 40, # ms
            "download_throughput": 1.6 * 1024 * 1024 / 8, # 1.6 Mbps
            "upload_throughput": 750 * 1024 / 8,          # 750 kbps
            "connection_type": "cellular3g"
        },
        "ram_mb": 4096,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: CPU throttling (4.0x via CDP) and Network throttling (Fast 3G via CDP). RAM (4096MB) and Storage (64GB Standard) are recorded as analytical target specifications."
    },
    "ENTRY_LEVEL": {
        "id": "prof-android-entry",
        "name": "Entry-Level Android (2-Core, 2GB)",
        "tier": "ENTRY_LEVEL",
        "device_type": "Entry-level Android",
        "description": "Emulates constrained entry-level hardware (~$70-$100 bracket, e.g. Redmi 9A / Nokia C-series).",
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
            "latency": 200, # ms
            "download_throughput": 500 * 1024 / 8, # 500 kbps
            "upload_throughput": 250 * 1024 / 8,   # 250 kbps
            "connection_type": "cellular2g"
        },
        "ram_mb": 2048,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: CPU throttling (8.0x via CDP) and Network throttling (Slow 3G via CDP). RAM (2048MB) and Storage (32GB Low-speed) are recorded as analytical target specifications."
    },
    "MID_RANGE": {
        "id": "prof-android-midrange",
        "name": "Mid-range Android (6-Core, 6GB)",
        "tier": "MID_RANGE",
        "device_type": "Mid-range Android",
        "description": "Emulates balanced mid-range Android hardware (~$350-$450 bracket, e.g. Pixel 7a / Galaxy A54).",
        "viewport": {"width": 412, "height": 915},
        "device_scale_factor": 2.625,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_cores": 6,
        "cpu_category": "6-core mid-range",
        "cpu_throttle_rate": 2.0,
        "storage_profile": "Standard storage profile",
        "storage_capacity_gb": 128,
        "storage_available_gb": 48,
        "network": {
            "name": "4G",
            "offline": False,
            "latency": 20,
            "download_throughput": 9000 * 1024 / 8,
            "upload_throughput": 3000 * 1024 / 8,
            "connection_type": "cellular4g"
        },
        "ram_mb": 6144,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: CPU throttling (2.0x via CDP) and Network throttling (4G LTE via CDP). RAM (6144MB) and Storage (128GB Standard) are recorded as analytical target specifications."
    },
    "FLAGSHIP": {
        "id": "prof-android-flagship",
        "name": "Flagship Android (8-Core, 12GB)",
        "tier": "FLAGSHIP",
        "device_type": "Flagship Android",
        "description": "Emulates premium flagship Android hardware (~$1000+ bracket, e.g. Galaxy S24 Ultra / Pixel 8 Pro).",
        "viewport": {"width": 412, "height": 915},
        "device_scale_factor": 3.5,
        "is_mobile": True,
        "has_touch": True,
        "user_agent": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
        "cpu_cores": 8,
        "cpu_category": "8-core high-performance",
        "cpu_throttle_rate": 1.0,
        "storage_profile": "High-speed SSD profile",
        "storage_capacity_gb": 256,
        "storage_available_gb": 128,
        "network": {
            "name": "5G",
            "offline": False,
            "latency": 10,
            "download_throughput": 30000 * 1024 / 8,
            "upload_throughput": 12000 * 1024 / 8,
            "connection_type": "cellular4g"
        },
        "ram_mb": 12288,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: Unthrottled CPU (1.0x via CDP) and High-speed 5G (via CDP). RAM (12288MB) and Storage (256GB SSD) are recorded as analytical target specifications."
    },
    "DESKTOP_LOW": {
        "id": "prof-desktop-lowend",
        "name": "Low-end Desktop (2-Core, 4GB)",
        "tier": "DESKTOP_LOW",
        "device_type": "Low-end Desktop",
        "description": "Emulates entry-level Celeron/Athlon office PC or budget Chromebook.",
        "viewport": {"width": 1366, "height": 768},
        "device_scale_factor": 1.0,
        "is_mobile": False,
        "has_touch": False,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
        "cpu_cores": 2,
        "cpu_category": "2-core low-end",
        "cpu_throttle_rate": 4.0,
        "storage_profile": "Low-speed storage profile",
        "storage_capacity_gb": 128,
        "storage_available_gb": 20,
        "network": {
            "name": "Fast 3G",
            "offline": False,
            "latency": 50,
            "download_throughput": 1600 * 1024 / 8,
            "upload_throughput": 750 * 1024 / 8,
            "connection_type": "cellular3g"
        },
        "ram_mb": 4096,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: CPU throttling (4.0x via CDP) and Network throttling (Fast 3G via CDP). RAM (4096MB) and Storage (128GB Low-speed) are recorded as analytical target specifications."
    },
    "DESKTOP_STANDARD": {
        "id": "prof-desktop-standard",
        "name": "Standard Desktop (4-Core, 8GB)",
        "tier": "DESKTOP_STANDARD",
        "device_type": "Standard Desktop",
        "description": "Emulates standard enterprise workstation or contemporary home laptop.",
        "viewport": {"width": 1920, "height": 1080},
        "device_scale_factor": 1.0,
        "is_mobile": False,
        "has_touch": False,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
        "cpu_cores": 4,
        "cpu_category": "4-core budget",
        "cpu_throttle_rate": 2.0,
        "storage_profile": "Standard storage profile",
        "storage_capacity_gb": 256,
        "storage_available_gb": 80,
        "network": {
            "name": "Wi-Fi",
            "offline": False,
            "latency": 15,
            "download_throughput": 25000 * 1024 / 8,
            "upload_throughput": 10000 * 1024 / 8,
            "connection_type": "wifi"
        },
        "ram_mb": 8192,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: CPU throttling (2.0x via CDP) and Wi-Fi network (via CDP). RAM (8192MB) and Storage (256GB Standard) are recorded as analytical target specifications."
    },
    "DESKTOP_HIGH": {
        "id": "prof-desktop-highperf",
        "name": "High-performance Desktop (8-Core, 16GB)",
        "tier": "DESKTOP_HIGH",
        "device_type": "High-performance Desktop",
        "description": "Emulates unthrottled high-performance developer / gaming workstation on high-speed connection.",
        "viewport": {"width": 1920, "height": 1080},
        "device_scale_factor": 1.0,
        "is_mobile": False,
        "has_touch": False,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
        "cpu_cores": 8,
        "cpu_category": "8-core high-performance",
        "cpu_throttle_rate": 1.0,
        "storage_profile": "NVMe profile",
        "storage_capacity_gb": 1024,
        "storage_available_gb": 512,
        "network": {
            "name": "Wi-Fi",
            "offline": False,
            "latency": 5,
            "download_throughput": 100000 * 1024 / 8,
            "upload_throughput": 50000 * 1024 / 8,
            "connection_type": "wifi"
        },
        "ram_mb": 16384,
        "is_emulated": True,
        "emulation_disclaimer": "Simulated parameters: Unthrottled CPU (1.0x via CDP) and High-speed Wi-Fi (via CDP). RAM (16384MB) and Storage (1024GB NVMe) are recorded as analytical target specifications."
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
