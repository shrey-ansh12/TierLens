from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.v1.auth import get_current_user, get_user_workspace
from app.models.relational.entities import User, Workspace, Project, TestRun, DeviceProfile
from app.schemas.tests import DualComparisonResponse, TestRunResponse

router = APIRouter(prefix="/comparisons", tags=["Device Comparison & Degradation"])


def serialize_test_run(r: Optional[TestRun]) -> Optional[Dict[str, Any]]:
    if not r:
        return None

    # Defensive relationship access to strictly prevent greenlet_spawn / MissingGreenlet exceptions
    dp_data = None
    try:
        dp = getattr(r, "device_profile", None)
        if dp:
            dp_data = {
                "id": dp.id,
                "name": dp.name,
                "tier": dp.tier,
                "platform": dp.platform,
                "cpu_throttle_rate": dp.cpu_throttle_rate,
                "network_profile": dp.network_profile,
                "viewport_width": dp.viewport_width,
                "viewport_height": dp.viewport_height,
                "ram_mb": dp.ram_mb
            }
    except Exception:
        dp_data = None

    metrics_data = []
    try:
        raw_metrics = getattr(r, "metrics", None) or []
        for m in raw_metrics:
            metrics_data.append({
                "id": m.id,
                "name": m.name,
                "value": m.value,
                "unit": m.unit,
                "rating": m.rating,
                "is_emulated": m.is_emulated,
                "details": m.details
            })
    except Exception:
        metrics_data = []

    failures_data = []
    try:
        raw_failures = getattr(r, "failures", None) or []
        for f in raw_failures:
            failures_data.append({
                "id": f.id,
                "failure_type": f.failure_type,
                "title": f.title,
                "message": f.message,
                "error_signature": f.error_signature,
                "component": f.component,
                "url_or_file": f.url_or_file,
                "screenshot_url": f.screenshot_url
            })
    except Exception:
        failures_data = []

    artifacts_data = []
    try:
        raw_artifacts = getattr(r, "artifacts", None) or []
        for a in raw_artifacts:
            artifacts_data.append({
                "id": a.id,
                "artifact_type": a.artifact_type,
                "file_path": a.file_path,
                "file_size_bytes": a.file_size_bytes,
                "mime_type": a.mime_type
            })
    except Exception:
        artifacts_data = []

    recs_data = []
    try:
        raw_recs = getattr(r, "recommendations", None) or []
        for rec in raw_recs:
            recs_data.append({
                "id": rec.id,
                "title": rec.title,
                "category": rec.category,
                "impact": rec.impact,
                "probable_cause": rec.probable_cause,
                "supporting_evidence": rec.supporting_evidence,
                "remediation": rec.remediation,
                "verification_steps": rec.verification_steps,
                "status": rec.status
            })
    except Exception:
        recs_data = []

    return {
        "id": r.id,
        "project_id": r.project_id,
        "comparison_group_id": r.comparison_group_id,
        "status": r.status,
        "target_url": r.target_url,
        "apk_path": r.apk_path,
        "duration_ms": r.duration_ms or 0,
        "failure_count": r.failure_count or 0,
        "failure_summary": r.failure_summary,
        "is_synthetic": r.is_synthetic,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "device_profile": dp_data,
        "metrics": metrics_data,
        "failures": failures_data,
        "artifacts": artifacts_data,
        "recommendations": recs_data
    }


async def build_comparison_payload(comparison_group_id: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
    """
    Constructs a full Dual Comparison data dictionary.
    Handles both complete runs and PARTIAL runs gracefully without throwing 404.
    """
    stmt = (
        select(TestRun)
        .where(TestRun.comparison_group_id == comparison_group_id)
        .options(
            selectinload(TestRun.metrics),
            selectinload(TestRun.failures),
            selectinload(TestRun.artifacts),
            selectinload(TestRun.recommendations),
            selectinload(TestRun.device_profile),
        )
    )
    res = await db.execute(stmt)
    runs = res.scalars().all()

    if not runs:
        return None

    gb_run = next((r for r in runs if r.device_profile and r.device_profile.tier == "GOOD_BUDGET"), None)
    el_run = next((r for r in runs if r.device_profile and r.device_profile.tier == "ENTRY_LEVEL"), None)

    if not gb_run and len(runs) > 0:
        gb_run = runs[0]
    if not el_run and len(runs) > 1:
        el_run = runs[1]

    metrics_diff: Dict[str, Dict[str, Any]] = {}
    regressions: List[Dict[str, Any]] = []

    gb_map = {m.name: m for m in gb_run.metrics} if gb_run and gb_run.metrics else {}
    el_map = {m.name: m for m in el_run.metrics} if el_run and el_run.metrics else {}

    all_metric_names = set(gb_map.keys()).union(el_map.keys())
    for name in all_metric_names:
        gb_val = gb_map[name].value if name in gb_map else None
        el_val = el_map[name].value if name in el_map else None
        unit = gb_map[name].unit if name in gb_map else (el_map[name].unit if name in el_map else "")

        if gb_val is not None and el_val is not None:
            delta = round(el_val - gb_val, 2)
            pct_change = round(((el_val - gb_val) / gb_val * 100), 1) if gb_val > 0 else 0.0
        else:
            delta = None
            pct_change = None

        metrics_diff[name] = {
            "good_budget": gb_val,
            "entry_level": el_val,
            "delta": delta,
            "pct_change": pct_change,
            "unit": unit
        }

        if delta is not None and pct_change is not None and delta > 0:
            if pct_change >= 25.0 or (name == "CLS" and delta >= 0.05):
                regressions.append({
                    "metric": name,
                    "delta": delta,
                    "pct_change": pct_change,
                    "unit": unit,
                    "severity": "CRITICAL" if pct_change >= 100 or (name == "LCP" and el_val and el_val > 4000) else "MODERATE",
                    "explanation": f"{name} degraded by +{pct_change}% on Entry-Level hardware."
                })

    device_specific: List[Dict[str, Any]] = []
    if el_run and gb_run and el_run.failures:
        gb_signatures = {f.error_signature for f in (gb_run.failures or [])}
        for f in el_run.failures:
            if f.error_signature not in gb_signatures:
                device_specific.append({
                    "title": f.title,
                    "failure_type": f.failure_type,
                    "signature": f.error_signature,
                    "message": f.message,
                    "tier": "ENTRY_LEVEL_EXCLUSIVE",
                    "probable_cause": "Resource exhaustion or engine timeout specific to Entry-Level hardware constraints."
                })

    # Collect combined recommendations
    combined_recs = []
    seen_rec_titles = set()
    for run in [el_run, gb_run]:
        if run and run.recommendations:
            for rec in run.recommendations:
                if rec.title not in seen_rec_titles:
                    seen_rec_titles.add(rec.title)
                    combined_recs.append({
                        "id": rec.id,
                        "title": rec.title,
                        "category": rec.category,
                        "impact": rec.impact,
                        "probable_cause": rec.probable_cause,
                        "supporting_evidence": rec.supporting_evidence,
                        "remediation": rec.remediation,
                        "verification_steps": rec.verification_steps,
                        "status": rec.status
                    })

    return {
        "comparison_group_id": comparison_group_id,
        "good_budget_run": serialize_test_run(gb_run),
        "entry_level_run": serialize_test_run(el_run),
        "metrics_diff": metrics_diff,
        "regressions": regressions,
        "device_specific_failures": device_specific,
        "recommendations": combined_recs,
        "root_cause_summary": {
            "total_regressions": len(regressions),
            "exclusive_failures_count": len(device_specific)
        }
    }


@router.get("/{comparison_group_id}", response_model=DualComparisonResponse)
async def get_comparison_results(
    comparison_group_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(TestRun)
        .where(TestRun.comparison_group_id == comparison_group_id)
        .options(
            selectinload(TestRun.metrics),
            selectinload(TestRun.failures),
            selectinload(TestRun.artifacts),
            selectinload(TestRun.recommendations),
            selectinload(TestRun.device_profile),
        )
    )
    res = await db.execute(stmt)
    runs = res.scalars().all()

    if not runs:
        raise HTTPException(status_code=404, detail="Comparison group not found.")

    # Workspace authorization check
    ws = await get_user_workspace(current_user, db)
    first_run = runs[0]
    p_res = await db.execute(select(Project).where(Project.id == first_run.project_id))
    proj = p_res.scalars().first()
    if proj and proj.workspace_id != ws.id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: This comparison does not belong to your workspace."
        )

    payload = await build_comparison_payload(comparison_group_id, db)
    if not payload:
        raise HTTPException(status_code=404, detail="Comparison group not found.")
    return payload
