import uuid
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.core.database import get_db
from app.api.v1.auth import get_current_user, get_user_workspace
from app.models.relational.entities import User, DeviceProfile
from app.schemas.device_profiles import (
    DeviceProfileCreateRequest,
    DeviceProfileUpdateRequest,
    DeviceProfileResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/device-profiles", tags=["Configurable Device Profiles"])


@router.get("", response_model=List[DeviceProfileResponse])
async def list_device_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all accessible device profiles:
    - Built-in system profiles (workspace_id IS NULL)
    - Custom profiles created within the authenticated user's workspace
    """
    ws = await get_user_workspace(current_user, db)
    stmt = (
        select(DeviceProfile)
        .where(
            or_(
                DeviceProfile.workspace_id.is_(None),
                DeviceProfile.workspace_id == ws.id
            ),
            or_(
                DeviceProfile.is_active.is_(True),
                DeviceProfile.is_active.is_(None)
            )
        )
        .order_by(DeviceProfile.is_custom.asc(), DeviceProfile.name.asc())
    )
    result = await db.execute(stmt)
    profiles = result.scalars().all()
    return profiles


@router.post("", response_model=DeviceProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_device_profile(
    payload: DeviceProfileCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Creates and persists a new custom device configuration profile for the workspace.
    """
    ws = await get_user_workspace(current_user, db)

    # Derive tier identifier slug
    tier_slug = payload.tier.upper().replace(" ", "_") if payload.tier != "CUSTOM" else f"CUSTOM_{uuid.uuid4().hex[:6].upper()}"

    profile = DeviceProfile(
        id=f"prof_custom_{uuid.uuid4().hex[:10]}",
        name=payload.name,
        tier=tier_slug,
        platform=payload.platform,
        device_type=payload.device_type,
        cpu_cores=payload.cpu_cores,
        cpu_category=payload.cpu_category,
        cpu_throttle_rate=payload.cpu_throttle_rate,
        cpu_slowdown_multiplier=payload.cpu_slowdown_multiplier or payload.cpu_throttle_rate,
        storage_profile=payload.storage_profile,
        storage_capacity_gb=payload.storage_capacity_gb,
        storage_available_gb=payload.storage_available_gb,
        network_profile=payload.network_profile,
        network_down_kbps=payload.network_down_kbps,
        network_up_kbps=payload.network_up_kbps,
        network_latency_ms=payload.network_latency_ms,
        network_packet_loss=payload.network_packet_loss,
        viewport_width=payload.viewport_width,
        viewport_height=payload.viewport_height,
        device_scale_factor=payload.device_scale_factor,
        is_mobile=payload.is_mobile,
        has_touch=payload.has_touch,
        user_agent=payload.user_agent,
        ram_mb=payload.ram_mb,
        is_custom=True,
        workspace_id=ws.id,
        description=payload.description,
        is_active=True
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    logger.info(f"Created custom device profile '{profile.name}' (ID: {profile.id}) in workspace {ws.id}")
    return profile


@router.get("/{profile_id}", response_model=DeviceProfileResponse)
async def get_device_profile(
    profile_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves details for a specific device profile.
    """
    ws = await get_user_workspace(current_user, db)
    stmt = select(DeviceProfile).where(
        DeviceProfile.id == profile_id,
        or_(
            DeviceProfile.workspace_id.is_(None),
            DeviceProfile.workspace_id == ws.id
        )
    )
    result = await db.execute(stmt)
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device profile '{profile_id}' not found."
        )
    return profile


@router.put("/{profile_id}", response_model=DeviceProfileResponse)
async def update_custom_device_profile(
    profile_id: str,
    payload: DeviceProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates an existing custom device profile.
    System presets (is_custom=False) are immutable and cannot be overwritten.
    """
    ws = await get_user_workspace(current_user, db)
    stmt = select(DeviceProfile).where(
        DeviceProfile.id == profile_id,
        DeviceProfile.workspace_id == ws.id
    )
    result = await db.execute(stmt)
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Custom device profile '{profile_id}' not found or belongs to system presets."
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(profile, field) and value is not None:
            setattr(profile, field, value)

    # Keep slowdown multiplier and throttle rate synced
    if "cpu_throttle_rate" in update_data and "cpu_slowdown_multiplier" not in update_data:
        profile.cpu_slowdown_multiplier = update_data["cpu_throttle_rate"]

    await db.commit()
    await db.refresh(profile)
    logger.info(f"Updated custom device profile '{profile.name}' (ID: {profile.id})")
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_device_profile(
    profile_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Soft-deletes / deactivates a custom device profile.
    """
    ws = await get_user_workspace(current_user, db)
    stmt = select(DeviceProfile).where(
        DeviceProfile.id == profile_id,
        DeviceProfile.workspace_id == ws.id
    )
    result = await db.execute(stmt)
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Custom device profile '{profile_id}' not found or is a system preset."
        )

    profile.is_active = False
    await db.commit()
    logger.info(f"Deactivated custom device profile '{profile.name}' (ID: {profile.id})")
    return None


@router.post("/{profile_id}/duplicate", response_model=DeviceProfileResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_device_profile(
    profile_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Clones any profile (preset or custom) into a new workspace-editable custom profile.
    """
    ws = await get_user_workspace(current_user, db)
    stmt = select(DeviceProfile).where(
        DeviceProfile.id == profile_id,
        or_(
            DeviceProfile.workspace_id.is_(None),
            DeviceProfile.workspace_id == ws.id
        )
    )
    result = await db.execute(stmt)
    source = result.scalars().first()
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source device profile '{profile_id}' not found."
        )

    clone_id = f"prof_clone_{uuid.uuid4().hex[:10]}"
    clone = DeviceProfile(
        id=clone_id,
        name=f"Copy of {source.name}",
        tier=f"CUSTOM_{uuid.uuid4().hex[:6].upper()}",
        platform=source.platform,
        device_type=source.device_type,
        cpu_cores=source.cpu_cores,
        cpu_category=source.cpu_category,
        cpu_throttle_rate=source.cpu_throttle_rate,
        cpu_slowdown_multiplier=source.cpu_slowdown_multiplier,
        storage_profile=source.storage_profile,
        storage_capacity_gb=source.storage_capacity_gb,
        storage_available_gb=source.storage_available_gb,
        network_profile=source.network_profile,
        network_down_kbps=source.network_down_kbps,
        network_up_kbps=source.network_up_kbps,
        network_latency_ms=source.network_latency_ms,
        network_packet_loss=source.network_packet_loss,
        viewport_width=source.viewport_width,
        viewport_height=source.viewport_height,
        device_scale_factor=source.device_scale_factor,
        is_mobile=source.is_mobile,
        has_touch=source.has_touch,
        user_agent=source.user_agent,
        ram_mb=source.ram_mb,
        is_custom=True,
        workspace_id=ws.id,
        description=f"Duplicated from '{source.name}'",
        is_active=True
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    logger.info(f"Duplicated profile {source.id} into new custom profile {clone.id}")
    return clone
