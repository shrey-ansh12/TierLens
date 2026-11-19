from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.relational.entities import TestRun, DeviceProfile
from app.schemas.tests import DualComparisonResponse, TestRunResponse

router = APIRouter(prefix="/comparisons", tags=["Device Comparison & Degradation"])

@router.get("/{comparison_group_id}", response_model=DualComparisonResponse)
async def get_comparison_results(
    comparison_group_id: str,
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

    gb_run = next((r for r in runs if r.device_profile and r.device_profile.tier == "GOOD_BUDGET"), None)
    el_run = next((r for r in runs if r.device_profile and r.device_profile.tier == "ENTRY_LEVEL"), None)

    # If device_profile was not set, fall back by order
    if not gb_run and len(runs) > 0:
        gb_run = runs[0]
    if not el_run and len(runs) > 1:
        el_run = runs[1]

    # Compute metric differentials
    metrics_diff: Dict[str, Dict[str, Any]] = {}
    regressions: List[Dict[str, Any]] = []

    if gb_run and el_run:
        gb_map = {m.name: m for m in gb_run.metrics}
        el_map = {m.name: m for m in el_run.metrics}

        all_metric_names = set(gb_map.keys()).union(el_map.keys())
        for name in all_metric_names:
            gb_val = gb_map[name].value if name in gb_map else 0.0
            el_val = el_map[name].value if name in el_map else 0.0
            unit = gb_map[name].unit if name in gb_map else (el_map[name].unit if name in el_map else "")
            
            delta = round(el_val - gb_val, 2)
            pct_change = round(((el_val - gb_val) / gb_val * 100), 1) if gb_val > 0 else 0.0

            metrics_diff[name] = {
                "good_budget": gb_val,
                "entry_level": el_val,
                "delta": delta,
                "pct_change": pct_change,
                "unit": unit
            }

            # Flag as regression if degradation is significant
            if delta > 0 and (pct_change >= 25.0 or (name == "CLS" and delta >= 0.05)):
                regressions.append({
                    "metric": name,
                    "delta": delta,
                    "pct_change": pct_change,
                    "unit": unit,
                    "severity": "CRITICAL" if pct_change >= 100 or (name == "LCP" and el_val > 4000) else "MODERATE",
                    "explanation": f"{name} degraded by +{pct_change}% on Entry-Level hardware."
                })

    # Device-Specific Failures (e.g. issues appearing on Entry-Level but NOT on Good Budget)
    device_specific: List[Dict[str, Any]] = []
    if el_run and gb_run:
        gb_signatures = {f.error_signature for f in gb_run.failures}
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

    return {
        "comparison_group_id": comparison_group_id,
        "good_budget_run": gb_run,
        "entry_level_run": el_run,
        "metrics_diff": metrics_diff,
        "regressions": regressions,
        "device_specific_failures": device_specific,
        "root_cause_summary": {
            "total_regressions": len(regressions),
            "exclusive_failures_count": len(device_specific)
        }
    }
