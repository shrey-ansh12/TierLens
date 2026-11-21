import asyncio
from app.core.database import async_engine
from sqlalchemy import text

async def upgrade_schema():
    async with async_engine.begin() as conn:
        print("Checking and upgrading Neon PostgreSQL schema for Device Profiles...")
        
        # 1. Add columns to device_profiles
        dp_columns = [
            ("device_type", "VARCHAR(64) DEFAULT 'Custom Device'"),
            ("cpu_cores", "INTEGER DEFAULT 4"),
            ("cpu_category", "VARCHAR(64) DEFAULT 'Budget'"),
            ("cpu_slowdown_multiplier", "DOUBLE PRECISION DEFAULT 1.0"),
            ("storage_profile", "VARCHAR(64) DEFAULT 'Standard'"),
            ("storage_capacity_gb", "INTEGER DEFAULT 64"),
            ("storage_available_gb", "INTEGER DEFAULT 16"),
            ("network_down_kbps", "DOUBLE PRECISION DEFAULT 1600.0"),
            ("network_up_kbps", "DOUBLE PRECISION DEFAULT 750.0"),
            ("network_latency_ms", "INTEGER DEFAULT 40"),
            ("network_packet_loss", "DOUBLE PRECISION DEFAULT 0.0"),
            ("device_scale_factor", "DOUBLE PRECISION DEFAULT 2.0"),
            ("is_mobile", "BOOLEAN DEFAULT true"),
            ("has_touch", "BOOLEAN DEFAULT true"),
            ("user_agent", "VARCHAR(1024)"),
            ("is_custom", "BOOLEAN DEFAULT false"),
            ("workspace_id", "VARCHAR(36)"),
            ("description", "TEXT")
        ]
        
        for col_name, col_type in dp_columns:
            try:
                await conn.execute(text(f"ALTER TABLE device_profiles ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                print(f"  Column device_profiles.{col_name} checked/added.")
            except Exception as e:
                print(f"  Column device_profiles.{col_name} notice: {e}")

        # 2. Add configuration_snapshot to test_runs
        try:
            await conn.execute(text("ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS configuration_snapshot JSON"))
            print("  Column test_runs.configuration_snapshot checked/added.")
        except Exception as e:
            print(f"  Column test_runs.configuration_snapshot notice: {e}")

        # 3. Seed standard profiles if they do not exist
        profiles_to_seed = [
            {
                "id": "prof-android-entry",
                "name": "Entry-level Android (2-Core, 2GB)",
                "tier": "ENTRY_LEVEL",
                "platform": "WEB",
                "device_type": "Entry-level Android",
                "cpu_cores": 2,
                "cpu_category": "2-core low-end",
                "cpu_throttle_rate": 8.0,
                "cpu_slowdown_multiplier": 8.0,
                "storage_profile": "Low-speed storage profile",
                "storage_capacity_gb": 32,
                "storage_available_gb": 4,
                "network_profile": "Slow 3G",
                "network_down_kbps": 500.0,
                "network_up_kbps": 250.0,
                "network_latency_ms": 200,
                "network_packet_loss": 0.0,
                "viewport_width": 360,
                "viewport_height": 800,
                "device_scale_factor": 2.0,
                "is_mobile": True,
                "has_touch": True,
                "user_agent": "Mozilla/5.0 (Linux; Android 11; M2006C3LG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
                "ram_mb": 2048,
                "is_custom": False,
                "description": "Emulates constrained entry-level Android hardware (~$70-$100 bracket, e.g. Redmi 9A / Nokia C-series)."
            },
            {
                "id": "prof-android-budget",
                "name": "Budget Android (4-Core, 4GB)",
                "tier": "GOOD_BUDGET",
                "platform": "WEB",
                "device_type": "Budget Android",
                "cpu_cores": 4,
                "cpu_category": "4-core budget",
                "cpu_throttle_rate": 4.0,
                "cpu_slowdown_multiplier": 4.0,
                "storage_profile": "Standard storage profile",
                "storage_capacity_gb": 64,
                "storage_available_gb": 16,
                "network_profile": "Fast 3G",
                "network_down_kbps": 1600.0,
                "network_up_kbps": 750.0,
                "network_latency_ms": 40,
                "network_packet_loss": 0.0,
                "viewport_width": 390,
                "viewport_height": 844,
                "device_scale_factor": 2.5,
                "is_mobile": True,
                "has_touch": True,
                "user_agent": "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
                "ram_mb": 4096,
                "is_custom": False,
                "description": "Emulates modern budget Android hardware (~$150-$200 bracket, e.g. Samsung Galaxy A14 / Moto G)."
            },
            {
                "id": "prof-android-midrange",
                "name": "Mid-range Android (6-Core, 6GB)",
                "tier": "MID_RANGE",
                "platform": "WEB",
                "device_type": "Mid-range Android",
                "cpu_cores": 6,
                "cpu_category": "6-core mid-range",
                "cpu_throttle_rate": 2.0,
                "cpu_slowdown_multiplier": 2.0,
                "storage_profile": "Standard storage profile",
                "storage_capacity_gb": 128,
                "storage_available_gb": 48,
                "network_profile": "4G",
                "network_down_kbps": 9000.0,
                "network_up_kbps": 3000.0,
                "network_latency_ms": 20,
                "network_packet_loss": 0.0,
                "viewport_width": 412,
                "viewport_height": 915,
                "device_scale_factor": 2.625,
                "is_mobile": True,
                "has_touch": True,
                "user_agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
                "ram_mb": 6144,
                "is_custom": False,
                "description": "Emulates balanced mid-range Android hardware (~$350-$450 bracket, e.g. Pixel 7a / Galaxy A54)."
            },
            {
                "id": "prof-android-flagship",
                "name": "Flagship Android (8-Core, 12GB)",
                "tier": "FLAGSHIP",
                "platform": "WEB",
                "device_type": "Flagship Android",
                "cpu_cores": 8,
                "cpu_category": "8-core high-performance",
                "cpu_throttle_rate": 1.0,
                "cpu_slowdown_multiplier": 1.0,
                "storage_profile": "High-speed SSD profile",
                "storage_capacity_gb": 256,
                "storage_available_gb": 128,
                "network_profile": "5G",
                "network_down_kbps": 30000.0,
                "network_up_kbps": 12000.0,
                "network_latency_ms": 10,
                "network_packet_loss": 0.0,
                "viewport_width": 412,
                "viewport_height": 915,
                "device_scale_factor": 3.5,
                "is_mobile": True,
                "has_touch": True,
                "user_agent": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
                "ram_mb": 12288,
                "is_custom": False,
                "description": "Emulates premium flagship Android hardware (~$1000+ bracket, e.g. Galaxy S24 Ultra / Pixel 8 Pro)."
            },
            {
                "id": "prof-desktop-lowend",
                "name": "Low-end Desktop (2-Core, 4GB)",
                "tier": "DESKTOP_LOW",
                "platform": "WEB",
                "device_type": "Low-end Desktop",
                "cpu_cores": 2,
                "cpu_category": "2-core low-end",
                "cpu_throttle_rate": 4.0,
                "cpu_slowdown_multiplier": 4.0,
                "storage_profile": "Low-speed storage profile",
                "storage_capacity_gb": 128,
                "storage_available_gb": 20,
                "network_profile": "Fast 3G",
                "network_down_kbps": 1600.0,
                "network_up_kbps": 750.0,
                "network_latency_ms": 50,
                "network_packet_loss": 0.0,
                "viewport_width": 1366,
                "viewport_height": 768,
                "device_scale_factor": 1.0,
                "is_mobile": False,
                "has_touch": False,
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
                "ram_mb": 4096,
                "is_custom": False,
                "description": "Emulates entry-level Celeron/Athlon office PC or budget Chromebook."
            },
            {
                "id": "prof-desktop-standard",
                "name": "Standard Desktop (4-Core, 8GB)",
                "tier": "DESKTOP_STANDARD",
                "platform": "WEB",
                "device_type": "Standard Desktop",
                "cpu_cores": 4,
                "cpu_category": "4-core budget",
                "cpu_throttle_rate": 2.0,
                "cpu_slowdown_multiplier": 2.0,
                "storage_profile": "Standard storage profile",
                "storage_capacity_gb": 256,
                "storage_available_gb": 80,
                "network_profile": "Wi-Fi",
                "network_down_kbps": 25000.0,
                "network_up_kbps": 10000.0,
                "network_latency_ms": 15,
                "network_packet_loss": 0.0,
                "viewport_width": 1920,
                "viewport_height": 1080,
                "device_scale_factor": 1.0,
                "is_mobile": False,
                "has_touch": False,
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
                "ram_mb": 8192,
                "is_custom": False,
                "description": "Emulates standard enterprise workstation or contemporary home laptop."
            },
            {
                "id": "prof-desktop-highperf",
                "name": "High-performance Desktop (8-Core, 16GB)",
                "tier": "DESKTOP_HIGH",
                "platform": "WEB",
                "device_type": "High-performance Desktop",
                "cpu_cores": 8,
                "cpu_category": "8-core high-performance",
                "cpu_throttle_rate": 1.0,
                "cpu_slowdown_multiplier": 1.0,
                "storage_profile": "NVMe profile",
                "storage_capacity_gb": 1024,
                "storage_available_gb": 512,
                "network_profile": "Wi-Fi",
                "network_down_kbps": 100000.0,
                "network_up_kbps": 50000.0,
                "network_latency_ms": 5,
                "network_packet_loss": 0.0,
                "viewport_width": 1920,
                "viewport_height": 1080,
                "device_scale_factor": 1.0,
                "is_mobile": False,
                "has_touch": False,
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
                "ram_mb": 16384,
                "is_custom": False,
                "description": "Emulates unthrottled high-performance developer / gaming workstation on high-speed connection."
            }
        ]

        for p in profiles_to_seed:
            try:
                # Upsert profile by id
                upsert_sql = """
                INSERT INTO device_profiles (
                    id, name, tier, platform, device_type, cpu_cores, cpu_category,
                    cpu_throttle_rate, cpu_slowdown_multiplier, storage_profile,
                    storage_capacity_gb, storage_available_gb, network_profile,
                    network_down_kbps, network_up_kbps, network_latency_ms,
                    network_packet_loss, viewport_width, viewport_height,
                    device_scale_factor, is_mobile, has_touch, user_agent,
                    ram_mb, is_custom, description
                ) VALUES (
                    :id, :name, :tier, :platform, :device_type, :cpu_cores, :cpu_category,
                    :cpu_throttle_rate, :cpu_slowdown_multiplier, :storage_profile,
                    :storage_capacity_gb, :storage_available_gb, :network_profile,
                    :network_down_kbps, :network_up_kbps, :network_latency_ms,
                    :network_packet_loss, :viewport_width, :viewport_height,
                    :device_scale_factor, :is_mobile, :has_touch, :user_agent,
                    :ram_mb, :is_custom, :description
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    device_type = EXCLUDED.device_type,
                    cpu_cores = EXCLUDED.cpu_cores,
                    cpu_category = EXCLUDED.cpu_category,
                    cpu_throttle_rate = EXCLUDED.cpu_throttle_rate,
                    cpu_slowdown_multiplier = EXCLUDED.cpu_slowdown_multiplier,
                    storage_profile = EXCLUDED.storage_profile,
                    storage_capacity_gb = EXCLUDED.storage_capacity_gb,
                    storage_available_gb = EXCLUDED.storage_available_gb,
                    network_profile = EXCLUDED.network_profile,
                    network_down_kbps = EXCLUDED.network_down_kbps,
                    network_up_kbps = EXCLUDED.network_up_kbps,
                    network_latency_ms = EXCLUDED.network_latency_ms,
                    viewport_width = EXCLUDED.viewport_width,
                    viewport_height = EXCLUDED.viewport_height,
                    ram_mb = EXCLUDED.ram_mb,
                    description = EXCLUDED.description;
                """
                await conn.execute(text(upsert_sql), p)
                print(f"  Profile '{p['name']}' seeded/verified.")
            except Exception as e:
                print(f"  Profile seeding notice for {p['id']}: {e}")

    print("Neon PostgreSQL schema upgrade complete!")

if __name__ == "__main__":
    asyncio.run(upgrade_schema())
