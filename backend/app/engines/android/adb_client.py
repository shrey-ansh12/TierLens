import os
import shutil
import subprocess
import logging
from typing import Dict, Any, List, Optional
from app.config import settings

logger = logging.getLogger(__name__)

class ADBClient:
    def __init__(self):
        self._adb_path: Optional[str] = None
        self._locate_adb()

    def _locate_adb(self):
        # 1. Configured path
        if settings.ADB_PATH and shutil.which(settings.ADB_PATH):
            self._adb_path = settings.ADB_PATH
            return

        # 2. Check ANDROID_HOME / ANDROID_SDK_ROOT
        candidates = [
            os.path.join(settings.ANDROID_HOME or "", "platform-tools", "adb.exe"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk", "platform-tools", "adb.exe"),
            os.path.join(os.environ.get("ANDROID_SDK_ROOT", ""), "platform-tools", "adb.exe"),
            "adb"
        ]
        for c in candidates:
            if c and (os.path.isfile(c) or shutil.which(c)):
                self._adb_path = c
                logger.info(f"Located ADB binary at: {c}")
                return

        self._adb_path = None
        logger.warning("ADB binary not found on host. Android testing will be marked as SETUP_REQUIRED.")

    def is_available(self) -> bool:
        return self._adb_path is not None

    def get_adb_info(self) -> Dict[str, Any]:
        if not self.is_available():
            return {
                "available": False,
                "path": None,
                "version": None,
                "status": "SETUP_REQUIRED",
                "instructions": (
                    "Android SDK / ADB was not detected in system PATH or LocalAppData. "
                    "Install Android Studio or Android Commandline Tools, and ensure platform-tools is added to PATH."
                )
            }
        try:
            res = subprocess.run([self._adb_path, "version"], capture_output=True, text=True, timeout=5)
            version_line = res.stdout.splitlines()[0] if res.stdout else "ADB Active"
            return {
                "available": True,
                "path": self._adb_path,
                "version": version_line,
                "status": "READY"
            }
        except Exception as e:
            return {
                "available": False,
                "path": self._adb_path,
                "version": None,
                "status": "ERROR",
                "error": str(e)
            }

    def list_devices(self) -> List[Dict[str, Any]]:
        if not self.is_available():
            return []
        try:
            res = subprocess.run([self._adb_path, "devices", "-l"], capture_output=True, text=True, timeout=5)
            lines = res.stdout.strip().splitlines()
            devices = []
            for line in lines[1:]: # Skip 'List of devices attached'
                if not line.strip(): continue
                parts = line.split()
                if len(parts) >= 2:
                    serial = parts[0]
                    state = parts[1]
                    details = " ".join(parts[2:]) if len(parts) > 2 else ""
                    is_emulator = serial.startswith("emulator-")
                    devices.append({
                        "serial": serial,
                        "state": state,
                        "is_emulator": is_emulator,
                        "model": "Android Emulator" if is_emulator else "Physical Device",
                        "details": details
                    })
            return devices
        except Exception as e:
            logger.error(f"Failed to query adb devices: {e}")
            return []

    def execute_app_test(
        self,
        apk_path: str,
        package_name: str,
        device_serial: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Installs APK, launches it, monitors Logcat for exceptions, and samples RAM/CPU.
        """
        if not self.is_available():
            raise RuntimeError("ADB is not available on host system.")

        devices = self.list_devices()
        if not devices:
            raise RuntimeError("No active Android device or emulator detected. Connect a device or start an emulator.")

        target_serial = device_serial or devices[0]["serial"]
        cmd_prefix = [self._adb_path, "-s", target_serial]

        result = {
            "device_serial": target_serial,
            "installed": False,
            "launched": False,
            "crashes": [],
            "anrs": [],
            "memory_usage_mb": 0.0,
            "cpu_usage_pct": 0.0,
            "logcat_lines": []
        }

        # Clear logcat first
        subprocess.run(cmd_prefix + ["logcat", "-c"], capture_output=True, timeout=5)

        # Install APK
        install_res = subprocess.run(cmd_prefix + ["install", "-r", apk_path], capture_output=True, text=True, timeout=60)
        if "Success" not in install_res.stdout:
            raise RuntimeError(f"APK installation failed: {install_res.stderr or install_res.stdout}")
        result["installed"] = True

        # Launch App
        launch_res = subprocess.run(
            cmd_prefix + ["shell", "monkey", "-p", package_name, "-c", "android.intent.category.LAUNCHER", "1"],
            capture_output=True, text=True, timeout=10
        )
        result["launched"] = "Events injected: 1" in launch_res.stdout or launch_res.returncode == 0

        # Wait 3 seconds of active runtime
        import time
        time.sleep(3)

        # Query Memory
        mem_res = subprocess.run(cmd_prefix + ["shell", "dumpsys", "meminfo", package_name], capture_output=True, text=True, timeout=10)
        for line in mem_res.stdout.splitlines():
            if "TOTAL PSS:" in line or "TOTAL:" in line:
                parts = line.split()
                for p in parts:
                    if p.isdigit():
                        result["memory_usage_mb"] = round(int(p) / 1024, 2)
                        break

        # Query Logcat for fatal exceptions & ANR
        logcat_res = subprocess.run(cmd_prefix + ["logcat", "-d", "-t", "500"], capture_output=True, text=True, timeout=10)
        logs = logcat_res.stdout.splitlines()
        result["logcat_lines"] = logs[-100:] # Keep latest 100 lines

        for i, line in enumerate(logs):
            if "FATAL EXCEPTION" in line:
                crash_snippet = "\n".join(logs[i:i+15])
                result["crashes"].append({
                    "title": "Android Application Fatal Exception",
                    "snippet": crash_snippet
                })
            elif "ANR in " in line:
                anr_snippet = "\n".join(logs[i:i+10])
                result["anrs"].append({
                    "title": "Application Not Responding (ANR)",
                    "snippet": anr_snippet
                })

        return result

adb_client = ADBClient()
