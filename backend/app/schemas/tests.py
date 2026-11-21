from typing import Optional, List, Dict, Any
from pydantic import BaseModel, HttpUrl
from datetime import datetime
from app.schemas.device_profiles import DeviceProfileResponse

class WebTestSubmitRequest(BaseModel):
    project_id: Optional[str] = None
    target_url: str
    tier: Optional[str] = "BOTH" # "GOOD_BUDGET", "ENTRY_LEVEL", "BOTH", or custom tier name
    device_profile_ids: Optional[List[str]] = None # List of profile IDs to execute
    custom_profiles: Optional[List[Dict[str, Any]]] = None # List of dynamic profile specs to execute
    scenario_name: Optional[str] = "Full Page Load & Vitals"
    is_demo: bool = False

class AndroidTestSubmitRequest(BaseModel):
    project_id: Optional[str] = None
    package_name: Optional[str] = None
    tier: str = "BOTH"
    scenario_name: Optional[str] = "App Launch & Cold Start"
    is_demo: bool = False

class MetricResponse(BaseModel):
    id: str
    name: str
    value: float
    unit: str
    rating: str
    is_emulated: bool
    details: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

class FailureResponse(BaseModel):
    id: str
    failure_type: str
    title: str
    message: str
    stack_trace: Optional[str] = None
    error_signature: str
    component: Optional[str] = None
    url_or_file: Optional[str] = None
    screenshot_url: Optional[str] = None
    users_hit_millions: Optional[int] = None
    population_pct: Optional[float] = None
    rank: Optional[int] = None

    class Config:
        from_attributes = True

class ArtifactResponse(BaseModel):
    id: str
    artifact_type: str
    file_path: str
    file_size_bytes: int
    mime_type: str

    class Config:
        from_attributes = True

class RecommendationResponse(BaseModel):
    id: str
    title: str
    category: str
    impact: str
    probable_cause: str
    supporting_evidence: Optional[List[Any]] = None
    remediation: str
    verification_steps: str
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TestRunResponse(BaseModel):
    id: str
    project_id: str
    comparison_group_id: Optional[str] = None
    status: str
    target_url: Optional[str] = None
    apk_path: Optional[str] = None
    duration_ms: int
    failure_count: int
    failure_summary: Optional[str] = None
    configuration_snapshot: Optional[Dict[str, Any]] = None
    is_synthetic: bool
    device_profile: Optional[DeviceProfileResponse] = None
    metrics: List[MetricResponse] = []
    failures: List[FailureResponse] = []
    artifacts: List[ArtifactResponse] = []
    recommendations: List[RecommendationResponse] = []
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DualComparisonResponse(BaseModel):
    comparison_group_id: str
    good_budget_run: Optional[TestRunResponse] = None
    entry_level_run: Optional[TestRunResponse] = None
    runs: Optional[List[TestRunResponse]] = None
    configurations: Optional[List[Dict[str, Any]]] = None
    best_configuration: Optional[Dict[str, Any]] = None
    worst_configuration: Optional[Dict[str, Any]] = None
    multi_metrics_diff: Optional[Dict[str, Dict[str, Any]]] = None
    metrics_diff: Dict[str, Dict[str, Any]] = {}
    regressions: List[Dict[str, Any]] = []
    device_specific_failures: List[Dict[str, Any]] = []
    recommendations: Optional[List[Dict[str, Any]]] = None
    root_cause_summary: Optional[Dict[str, Any]] = None
    limitation_notice: Optional[str] = None
    # Demographic reach & Cheap Phone Test verdict
    ranked_failures: Optional[List[FailureResponse]] = None
    cheap_phone_verdict: Optional[Dict[str, Any]] = None
