from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.v1.auth import get_current_user, get_user_workspace
from app.models.relational.entities import Recommendation, RecommendationStatus, User, TestRun, Project
from app.schemas.tests import RecommendationResponse

router = APIRouter(prefix="/rca", tags=["Root Cause Analysis & Developer Workflow"])

@router.get("/run/{run_id}", response_model=List[RecommendationResponse])
async def get_run_recommendations(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ws = await get_user_workspace(current_user, db)
    # Check that run belongs to project in workspace
    r_res = await db.execute(select(TestRun).where(TestRun.id == run_id))
    run = r_res.scalars().first()
    if run:
        p_res = await db.execute(select(Project).where(Project.id == run.project_id))
        proj = p_res.scalars().first()
        if proj and proj.workspace_id != ws.id:
            raise HTTPException(status_code=403, detail="Access denied: Run does not belong to your workspace.")

    stmt = select(Recommendation).where(Recommendation.test_run_id == run_id)
    res = await db.execute(stmt)
    recs = res.scalars().all()
    return recs

@router.post("/recommendations/{rec_id}/status")
async def update_recommendation_status(
    rec_id: str,
    new_status: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Recommendation).where(Recommendation.id == rec_id)
    res = await db.execute(stmt)
    rec = res.scalars().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found.")

    if new_status not in [s.value for s in RecommendationStatus]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    rec.status = new_status
    await db.commit()
    await db.refresh(rec)
    return {
        "id": rec.id,
        "status": rec.status,
        "message": f"Recommendation status updated to '{rec.status}'."
    }

@router.post("/recommendations/{rec_id}/verify")
async def verify_recommendation_fix(
    rec_id: str,
    verification_run_id: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Developer Workflow:
    Marks recommendation as VERIFIED by linking the subsequent test run.
    """
    stmt = select(Recommendation).where(Recommendation.id == rec_id)
    res = await db.execute(stmt)
    rec = res.scalars().first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found.")

    rec.status = RecommendationStatus.VERIFIED.value
    rec.verified_by_run_id = verification_run_id
    await db.commit()
    await db.refresh(rec)

    return {
        "id": rec.id,
        "status": rec.status,
        "verified_by_run_id": rec.verified_by_run_id,
        "message": "Optimization fix marked as verified."
    }
