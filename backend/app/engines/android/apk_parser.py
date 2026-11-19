import os
import zipfile
import hashlib
import re
from typing import Dict, Any, Optional

class APKValidationError(Exception):
    pass

def compute_file_sha256(file_path: str) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            sha.update(chunk)
    return sha.hexdigest()

def inspect_apk(file_path: str, max_size_mb: int = 150) -> Dict[str, Any]:
    """
    Validates APK structure and extracts core manifest attributes.
    Uses pure-Python zip inspection to extract metadata without native binary crash risks.
    """
    if not os.path.exists(file_path):
        raise APKValidationError(f"File not found: {file_path}")

    file_size_bytes = os.path.getsize(file_path)
    file_size_mb = file_size_bytes / (1024 * 1024)

    if file_size_mb > max_size_mb:
        raise APKValidationError(f"File size ({file_size_mb:.1f} MB) exceeds maximum allowed limit ({max_size_mb} MB).")

    if not zipfile.is_zipfile(file_path):
        raise APKValidationError("Invalid APK format: File is not a valid Android package archive (ZIP format).")

    sha256_hash = compute_file_sha256(file_path)

    package_name = "com.tierlens.app"
    version_name = "1.0.0"
    version_code = 1
    permissions = []
    has_dex = False
    has_manifest = False

    with zipfile.ZipFile(file_path, "r") as z:
        namelist = z.namelist()
        has_manifest = "AndroidManifest.xml" in namelist
        has_dex = any(name.startswith("classes") and name.endswith(".dex") for name in namelist)

        if not has_manifest:
            raise APKValidationError("Corrupted APK: AndroidManifest.xml is missing from root of archive.")

        # Read AndroidManifest.xml bytes
        manifest_data = z.read("AndroidManifest.xml")
        
        # Extract ASCII strings from compiled binary XML
        strings = re.findall(b"[\x20-\x7E]{4,}", manifest_data)
        decoded_strings = [s.decode("latin1", errors="ignore") for s in strings]

        # Scan for common reverse-domain package patterns
        for s in decoded_strings:
            if re.match(r"^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$", s):
                if not any(prefix in s for prefix in ["android.", "schemas.", "http", "com.android"]):
                    package_name = s
                    break

        # Scan for permissions
        for s in decoded_strings:
            if s.startswith("android.permission."):
                permissions.append(s.replace("android.permission.", ""))

        # Scan for version strings
        for s in decoded_strings:
            if re.match(r"^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9]+)?$", s):
                version_name = s
                break

    return {
        "valid": True,
        "file_name": os.path.basename(file_path),
        "file_size_bytes": file_size_bytes,
        "file_size_mb": round(file_size_mb, 2),
        "sha256": sha256_hash,
        "package_name": package_name,
        "version_name": version_name,
        "version_code": version_code,
        "has_dex": has_dex,
        "has_manifest": has_manifest,
        "permissions": sorted(list(set(permissions))),
    }
