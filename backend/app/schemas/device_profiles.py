from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class DeviceProfileBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    tier: str = Field(default="CUSTOM", max_length=64)
    platform: str = Field(default="WEB", max_length=32)
    device_type: str = Field(default="Custom Device", max_length=64)
    cpu_cores: int = Field(default=4, ge=1, le=128)
    cpu_category: str = Field(default="4-core budget", max_length=64)
    cpu_throttle_rate: float = Field(default=1.0, ge=1.0, le=20.0)
    cpu_slowdown_multiplier: float = Field(default=1.0, ge=1.0, le=20.0)
    storage_profile: str = Field(default="Standard storage profile", max_length=64)
    storage_capacity_gb: int = Field(default=64, ge=1)
    storage_available_gb: int = Field(default=16, ge=1)
    network_profile: str = Field(default="Fast 3G", max_length=64)
    network_down_kbps: float = Field(default=1600.0, ge=0.0)
    network_up_kbps: float = Field(default=750.0, ge=0.0)
    network_latency_ms: int = Field(default=40, ge=0, le=10000)
    network_packet_loss: float = Field(default=0.0, ge=0.0, le=100.0)
    viewport_width: int = Field(default=390, ge=240, le=7680)
    viewport_height: int = Field(default=844, ge=240, le=4320)
    device_scale_factor: float = Field(default=2.0, ge=0.5, le=5.0)
    is_mobile: bool = True
    has_touch: bool = True
    user_agent: Optional[str] = None
    ram_mb: int = Field(default=4096, ge=512, le=131072)
    description: Optional[str] = None

class DeviceProfileCreateRequest(DeviceProfileBase):
    pass

class DeviceProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    device_type: Optional[str] = None
    cpu_cores: Optional[int] = None
    cpu_category: Optional[str] = None
    cpu_throttle_rate: Optional[float] = None
    cpu_slowdown_multiplier: Optional[float] = None
    storage_profile: Optional[str] = None
    storage_capacity_gb: Optional[int] = None
    storage_available_gb: Optional[int] = None
    network_profile: Optional[str] = None
    network_down_kbps: Optional[float] = None
    network_up_kbps: Optional[float] = None
    network_latency_ms: Optional[int] = None
    network_packet_loss: Optional[float] = None
    viewport_width: Optional[int] = None
    viewport_height: Optional[int] = None
    device_scale_factor: Optional[float] = None
    is_mobile: Optional[bool] = None
    has_touch: Optional[bool] = None
    user_agent: Optional[str] = None
    ram_mb: Optional[int] = None
    description: Optional[str] = None

class DeviceProfileResponse(DeviceProfileBase):
    id: str
    is_custom: bool = False
    workspace_id: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
