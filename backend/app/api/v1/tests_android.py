import os
import shutil
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.models.relational.entities import User, Workspace, Project, ApplicationVersion, TestRun, TestStatus
from app.engines.android.adb_client import adb_client
from app.engines.android.apk_parser import inspect_apk, APKValidationError

router = APIRouter(prefix="/tests/android", tags=["Android APK Testing"])

@router.get("/device-status")
async def get_device_lab_status():
    """Returns real host ADB and connected Android hardware/emulator status."""
    adb_info = adb_client.get_adb_info()
    devices = adb_client.list_devices()
    return {
        "adb": adb_info,
        "device_count": len(devices),
        "devices": devices,
        "ready_for_testing": adb_info["available"] and len(devices) > 0,
        "real_data_policy_notice": "Device and resource metrics are only captured from actual ADB instrumentation."
    }

@router.post("/upload-apk")
async def upload_apk(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Uploads APK, verifies zip structure, and extracts manifest properties."""
    if not file.filename or not file.filename.endswith(".apk"):
        raise HTTPException(status_code=400, detail="Uploaded file must have an .apk extension.")

    safe_filename = os.path.basename(file.filename)
    upload_id = str(uuid.uuid4())
    stored_filename = f"{upload_id}_{safe_filename}"
    save_path = os.path.join(settings.ARTIFACTS_DIR, stored_filename)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        manifest_info = inspect_apk(save_path, max_size_mb=settings.MAX_UPLOAD_SIZE_MB)
    except APKValidationError as e:
        if os.path.exists(save_path):
            os.remove(save_path)
        raise HTTPException(status_code=400, detail=str(e))

    # Associate with Project and create ApplicationVersion if project_id provided
    version_id = None
    if project_id:
        p_res = await db.execute(select(Project).where(Project.id == project_id))
        proj = p_res.scalars().first()
        if proj:
            app_ver = ApplicationVersion(
                project_id=proj.id,
                version_name=manifest_info["version_name"],
                artifact_path=save_path,
                changelog=f"Uploaded {file.filename} (SHA256: {manifest_info['sha256'][:12]}...)"
            )
            db.add(app_ver)
            await db.commit()
            await db.refresh(app_ver)
            version_id = app_ver.id

    return {
        "success": True,
        "artifact_path": save_path,
        "manifest": manifest_info,
        "version_id": version_id,
        "message": "APK validated and parsed successfully."
    }

@router.post("/run")
async def run_android_test(
    apk_path: str = Form(...),
    package_name: str = Form(...),
    project_id: Optional[str] = Form(None),
    device_serial: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Executes an APK performance test.
    Per strict Real Data Policy, if ADB or emulator is unavailable, returns explicit SETUP_REQUIRED.
    """
    # Safety check: ensure apk_path resides inside artifacts directory
    abs_artifacts = os.path.abspath(settings.ARTIFACTS_DIR)
    abs_apk = os.path.abspath(apk_path)
    if not abs_apk.startswith(abs_artifacts) or not os.path.exists(abs_apk):
        raise HTTPException(status_code=400, detail="Security Violation: Invalid or non-existent APK artifact path.")

    adb_info = adb_client.get_adb_info()
    if not adb_info["available"]:
        return {
            "status": "SETUP_REQUIRED",
            "message": "Android SDK / ADB is not detected on the Windows host.",
            "instructions": adb_info.get("instructions"),
            "test_executed": False
        }

    devices = adb_client.list_devices()
    if not devices:
        return {
            "status": "DEVICE_REQUIRED",
            "message": "No active Android device or emulator detected. Connect a physical Android device via USB or launch an AVD emulator.",
            "test_executed": False
        }

    try:
        execution_data = adb_client.execute_app_test(
            apk_path=apk_path,
            package_name=package_name,
            device_serial=device_serial
        )
        return {
            "status": "COMPLETED",
            "execution": execution_data,
            "test_executed": True
        }
    except Exception as e:
        return {
            "status": "FAILED",
            "error": str(e),
            "test_executed": False
        }
