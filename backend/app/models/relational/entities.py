import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, Enum
)
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

def get_utc_now():
    return datetime.now(timezone.utc)

def generate_uuid():
    return str(uuid.uuid4())

class ProjectType(str, enum.Enum):
    WEB = "WEB"
    ANDROID = "ANDROID"

class DeviceTier(str, enum.Enum):
    GOOD_BUDGET = "GOOD_BUDGET"
    ENTRY_LEVEL = "ENTRY_LEVEL"

class TestStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PREPARING = "PREPARING"
    RUNNING = "RUNNING"
    ANALYZING = "ANALYZING"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_WARNINGS = "COMPLETED_WITH_WARNINGS"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class FailureType(str, enum.Enum):
    CRASH = "CRASH"
    ANR = "ANR"
    JS_ERROR = "JS_ERROR"
    HTTP_FAILURE = "HTTP_FAILURE"
    PERFORMANCE_REGRESSION = "PERFORMANCE_REGRESSION"
    OUT_OF_MEMORY = "OUT_OF_MEMORY"
    TARGET_APPLICATION_ERROR = "TARGET_APPLICATION_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    HTTP_ERROR = "HTTP_ERROR"
    BROWSER_INFRASTRUCTURE_ERROR = "BROWSER_INFRASTRUCTURE_ERROR"
    ACCESS_RESTRICTION = "ACCESS_RESTRICTION"
    NAVIGATION_TIMEOUT = "NAVIGATION_TIMEOUT"
    SSL_ERROR = "SSL_ERROR"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"

class MetricRating(str, enum.Enum):
    GOOD = "GOOD"
    NEEDS_IMPROVEMENT = "NEEDS_IMPROVEMENT"
    POOR = "POOR"

class RecommendationStatus(str, enum.Enum):
    OPEN = "OPEN"
    APPLIED = "APPLIED"
    VERIFIED = "VERIFIED"
    DISMISSED = "DISMISSED"

# ==============================================================================
# Entities
# ==============================================================================

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    workspaces = relationship("Workspace", back_populates="owner")
    audit_logs = relationship("AuditLog", back_populates="user")


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    owner = relationship("User", back_populates="workspaces")
    projects = relationship("Project", back_populates="workspace", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="workspace", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(32), default=ProjectType.WEB.value, nullable=False) # WEB or ANDROID
    target_url = Column(String(1024), nullable=True)
    package_name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    workspace = relationship("Workspace", back_populates="projects")
    versions = relationship("ApplicationVersion", back_populates="project", cascade="all, delete-orphan")
    test_runs = relationship("TestRun", back_populates="project", cascade="all, delete-orphan")


class ApplicationVersion(Base):
    __tablename__ = "application_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    version_name = Column(String(64), nullable=False) # e.g. "1.0.0", "v2-hotfix"
    build_number = Column(Integer, default=1)
    artifact_path = Column(String(1024), nullable=True) # e.g. path to uploaded APK
    changelog = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    project = relationship("Project", back_populates="versions")
    test_runs = relationship("TestRun", back_populates="version")


class DeviceProfile(Base):
    __tablename__ = "device_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(128), nullable=False) # e.g. "Samsung Galaxy A14 Tier (Good Budget)", "Redmi 9A Tier (Entry-Level)"
    tier = Column(String(64), nullable=False) # GOOD_BUDGET, ENTRY_LEVEL, MID_RANGE, FLAGSHIP, DESKTOP_LOW, etc.
    platform = Column(String(32), nullable=False) # WEB, ANDROID
    device_type = Column(String(64), default="Custom Device")
    cpu_cores = Column(Integer, default=4)
    cpu_category = Column(String(64), default="Budget")
    cpu_throttle_rate = Column(Float, default=1.0) # Slowdown multiplier
    cpu_slowdown_multiplier = Column(Float, default=1.0)
    storage_profile = Column(String(64), default="Standard")
    storage_capacity_gb = Column(Integer, default=64)
    storage_available_gb = Column(Integer, default=16)
    network_profile = Column(String(64), default="Fast 3G") # "Fast 3G", "Slow 3G", "4G", "5G", "Wi-Fi", "Offline", "Custom"
    network_down_kbps = Column(Float, default=1600.0)
    network_up_kbps = Column(Float, default=750.0)
    network_latency_ms = Column(Integer, default=40)
    network_packet_loss = Column(Float, default=0.0)
    viewport_width = Column(Integer, default=390)
    viewport_height = Column(Integer, default=844)
    device_scale_factor = Column(Float, default=2.0)
    is_mobile = Column(Boolean, default=True)
    has_touch = Column(Boolean, default=True)
    user_agent = Column(String(1024), nullable=True)
    ram_mb = Column(Integer, default=4096)
    is_custom = Column(Boolean, default=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    test_runs = relationship("TestRun", back_populates="device_profile")


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    version_id = Column(String(36), ForeignKey("application_versions.id"), nullable=True)
    device_profile_id = Column(String(36), ForeignKey("device_profiles.id"), nullable=True)
    comparison_group_id = Column(String(36), nullable=True, index=True) # Groups paired Good Budget & Entry-Level runs
    status = Column(String(32), default=TestStatus.QUEUED.value, nullable=False, index=True)
    target_url = Column(String(1024), nullable=True)
    apk_path = Column(String(1024), nullable=True)
    duration_ms = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    failure_summary = Column(Text, nullable=True)
    configuration_snapshot = Column(JSON, nullable=True) # Frozen snapshot of device config parameters
    is_synthetic = Column(Boolean, default=False) # Strict Real Data Policy: marks demo/sample data clearly
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    project = relationship("Project", back_populates="test_runs", lazy="selectin")
    version = relationship("ApplicationVersion", back_populates="test_runs", lazy="selectin")
    device_profile = relationship("DeviceProfile", back_populates="test_runs", lazy="selectin")
    metrics = relationship("TestMetric", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
    failures = relationship("TestFailure", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
    artifacts = relationship("TestArtifact", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")
    recommendations = relationship("Recommendation", back_populates="test_run", cascade="all, delete-orphan", lazy="selectin")


class TestMetric(Base):
    __tablename__ = "test_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    test_run_id = Column(String(36), ForeignKey("test_runs.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False, index=True) # e.g. "FCP", "LCP", "CLS", "TTFB", "CPU_USAGE_PCT", "MEM_USAGE_MB"
    value = Column(Float, nullable=False)
    unit = Column(String(32), nullable=False) # "ms", "s", "MB", "%", "score"
    rating = Column(String(32), default=MetricRating.GOOD.value) # GOOD, NEEDS_IMPROVEMENT, POOR
    is_emulated = Column(Boolean, default=True) # Distinguishes emulated CPU/network vs actual hardware
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    test_run = relationship("TestRun", back_populates="metrics")


class TestFailure(Base):
    __tablename__ = "test_failures"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    test_run_id = Column(String(36), ForeignKey("test_runs.id"), nullable=False, index=True)
    failure_type = Column(String(64), nullable=False, index=True) # CRASH, ANR, JS_ERROR, HTTP_FAILURE, etc.
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    stack_trace = Column(Text, nullable=True)
    error_signature = Column(String(255), nullable=False, index=True) # Deduplicated hash/signature
    component = Column(String(255), nullable=True)
    url_or_file = Column(String(1024), nullable=True)
    screenshot_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    test_run = relationship("TestRun", back_populates="failures")
    recommendations = relationship("Recommendation", back_populates="failure", cascade="all, delete-orphan")


class TestArtifact(Base):
    __tablename__ = "test_artifacts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    test_run_id = Column(String(36), ForeignKey("test_runs.id"), nullable=False, index=True)
    artifact_type = Column(String(64), nullable=False) # SCREENSHOT, HAR, LOGCAT, TRACE, LIGHTHOUSE_REPORT
    file_path = Column(String(1024), nullable=False)
    file_size_bytes = Column(Integer, default=0)
    mime_type = Column(String(128), default="application/octet-stream")
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    test_run = relationship("TestRun", back_populates="artifacts")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    test_run_id = Column(String(36), ForeignKey("test_runs.id"), nullable=False, index=True)
    failure_id = Column(String(36), ForeignKey("test_failures.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(64), default="Performance") # Performance, Stability, Network, Memory
    impact = Column(String(32), default="HIGH") # HIGH, MEDIUM, LOW
    probable_cause = Column(Text, nullable=False)
    supporting_evidence = Column(JSON, nullable=True) # list of metrics, log excerpts, trace references
    remediation = Column(Text, nullable=False)
    verification_steps = Column(Text, nullable=False)
    status = Column(String(32), default=RecommendationStatus.OPEN.value, nullable=False)
    verified_by_run_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    test_run = relationship("TestRun", back_populates="recommendations")
    failure = relationship("TestFailure", back_populates="recommendations")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(128), nullable=False)
    resource_type = Column(String(64), nullable=False)
    resource_id = Column(String(64), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    workspace = relationship("Workspace", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs")
