from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    name: str
    type: str = "WEB" # "WEB" or "ANDROID"
    target_url: Optional[str] = None
    package_name: Optional[str] = None
    description: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ApplicationVersionCreate(BaseModel):
    version_name: str
    build_number: Optional[int] = 1
    changelog: Optional[str] = None

class ApplicationVersionResponse(BaseModel):
    id: str
    project_id: str
    version_name: str
    build_number: int
    artifact_path: Optional[str] = None
    changelog: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectResponse(ProjectBase):
    id: str
    workspace_id: str
    created_at: datetime
    updated_at: datetime
    versions: List[ApplicationVersionResponse] = []

    class Config:
        from_attributes = True
