from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.v1.auth import get_current_user, get_user_workspace
from app.models.relational.entities import User, Workspace, Project, ApplicationVersion
from app.schemas.projects import ProjectCreate, ProjectResponse, ApplicationVersionCreate, ApplicationVersionResponse

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ws_res = await db.execute(select(Workspace).where(Workspace.owner_id == current_user.id))
    ws = ws_res.scalars().first()
    if not ws:
        return []

    stmt = select(Project).where(Project.workspace_id == ws.id).options(selectinload(Project.versions))
    res = await db.execute(stmt)
    projects = res.scalars().all()
    return projects

@router.post("", response_model=ProjectResponse)
async def create_project(
    project_in: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ws_res = await db.execute(select(Workspace).where(Workspace.owner_id == current_user.id))
    ws = ws_res.scalars().first()
    if not ws:
        raise HTTPException(status_code=400, detail="User workspace not found.")

    new_project = Project(
        workspace_id=ws.id,
        name=project_in.name,
        type=project_in.type,
        target_url=project_in.target_url,
        package_name=project_in.package_name,
        description=project_in.description
    )
    db.add(new_project)
    await db.flush()

    # Initial default version 1.0.0
    initial_ver = ApplicationVersion(
        project_id=new_project.id,
        version_name="1.0.0",
        build_number=1,
        changelog="Initial baseline project version"
    )
    db.add(initial_ver)

    await db.commit()
    
    # Reload with relationships
    stmt = select(Project).where(Project.id == new_project.id).options(selectinload(Project.versions))
    res = await db.execute(stmt)
    return res.scalars().first()

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id).options(selectinload(Project.versions))
    res = await db.execute(stmt)
    project = res.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    
    ws = await get_user_workspace(current_user, db)
    if project.workspace_id != ws.id:
        raise HTTPException(status_code=403, detail="Access denied: Project does not belong to your workspace.")
    return project

@router.post("/{project_id}/versions", response_model=ApplicationVersionResponse)
async def create_project_version(
    project_id: str,
    ver_in: ApplicationVersionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    project = res.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    ws = await get_user_workspace(current_user, db)
    if project.workspace_id != ws.id:
        raise HTTPException(status_code=403, detail="Access denied: Project does not belong to your workspace.")

    new_ver = ApplicationVersion(
        project_id=project.id,
        version_name=ver_in.version_name,
        build_number=ver_in.build_number or 1,
        changelog=ver_in.changelog
    )
    db.add(new_ver)
    await db.commit()
    await db.refresh(new_ver)
    return new_ver
