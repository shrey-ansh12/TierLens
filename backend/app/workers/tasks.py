import os
import asyncio
import logging
from datetime import datetime, timezone
import uuid
from typing import Optional, Dict, Any, List

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.core.concurrency import concurrency_manager
from app.workers.job_store import job_store, JobState
from app.workers.celery_app import celery_app
from app.models.relational.entities import (
    DeviceProfile, TestRun, TestMetric, TestFailure, TestArtifact,
    Recommendation, TestStatus, Project, ProjectType
)
from app.engines.web.runner import run_web_performance_test
from app.engines.web.profiles import resolve_device_profile_config
from app.intelligence.rca_engine import generate_root_cause_analysis
from app.models.graph.queries import sync_run_to_neo4j
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)


async def _execute_single_tier(
    target_url: str,
    profile_item: Any,
    project_id: str,
    comparison_group_id: Optional[str],
    workspace_name: str,
    project_name: str,
    db,
    job_id: Optional[str] = None
):
    """
    Executes a single browser test run for a given device profile configuration.
    Persists test run, metrics, failures, artifacts, RCA findings, and Neo4j knowledge nodes.
    """
    resolved_config = resolve_device_profile_config(profile_item)
    profile_name = resolved_config.get("name", "Custom Profile")
    tier_label = resolved_config.get("tier", "CUSTOM")

    # Match or resolve database DeviceProfile entity
    profile = None
    if isinstance(profile_item, str):
        dp_stmt = select(DeviceProfile).where(
            or_(
                DeviceProfile.id == profile_item,
                DeviceProfile.tier == profile_item,
                DeviceProfile.name == profile_item
            )
        )
        dp_res = await db.execute(dp_stmt)
        profile = dp_res.scalars().first()
    elif isinstance(profile_item, dict) and profile_item.get("id"):
        dp_stmt = select(DeviceProfile).where(DeviceProfile.id == profile_item["id"])
        dp_res = await db.execute(dp_stmt)
        profile = dp_res.scalars().first()

    profile_id = profile.id if profile else resolved_config.get("id")

    # Create Initial Test Run Record
    test_run = TestRun(
        project_id=project_id,
        device_profile_id=profile_id,
        comparison_group_id=comparison_group_id,
        target_url=target_url,
        status=TestStatus.RUNNING.value,
        configuration_snapshot=resolved_config,
        started_at=datetime.now(timezone.utc),
        is_synthetic=False
    )
    if profile:
        test_run.device_profile = profile
    db.add(test_run)
    await db.commit()
    await db.refresh(test_run)

    async def on_runner_event(stage_id: int, stage_name: str, message: str, level: str = "INFO", metric: Optional[Dict] = None):
        if job_id:
            await job_store.append_log(job_id, f"[{profile_name}] {message}", level=level, stage_id=stage_id, stage_name=stage_name, metric=metric)

    await on_runner_event(1, "Browser Initialization", f"Allocating headless container and applying emulation specs...")

    # Execute Playwright Performance Test with CDP throttling
    result = await run_web_performance_test(
        target_url=target_url,
        profile_input=resolved_config,
        test_run_id=test_run.id,
        on_event=on_runner_event
    )

    # Update TestRun status & duration
    if result.success and result.completed_with_warnings:
        test_run.status = TestStatus.COMPLETED_WITH_WARNINGS.value
    elif result.success:
        test_run.status = TestStatus.COMPLETED.value
    else:
        test_run.status = TestStatus.FAILED.value

    test_run.duration_ms = result.duration_ms
    test_run.completed_at = datetime.now(timezone.utc)
    test_run.failure_count = len(result.failures)
    test_run.failure_summary = result.error_message or (f"{len(result.failures)} issue(s) detected" if result.failures else "Clean run")
    test_run.configuration_snapshot = resolved_config

    # Persist Metrics
    for m in result.metrics:
        db_metric = TestMetric(
            test_run_id=test_run.id,
            name=m["name"],
            value=m["value"],
            unit=m["unit"],
            rating=m["rating"],
            is_emulated=True,
            details=m["details"]
        )
        db.add(db_metric)

    # Extract primary screenshot URL
    primary_screenshot_url = None
    for a in result.artifacts:
        if a.get("artifact_type") == "SCREENSHOT" and a.get("file_path"):
            fname = os.path.basename(a["file_path"])
            primary_screenshot_url = f"/artifacts/{fname}"
            break

    # Persist Failures
    for f in result.failures:
        db_fail = TestFailure(
            test_run_id=test_run.id,
            failure_type=f["failure_type"],
            title=f["title"],
            message=f["message"],
            error_signature=f["error_signature"],
            component=f.get("component"),
            url_or_file=f.get("url_or_file"),
            screenshot_url=f.get("screenshot_url") or primary_screenshot_url
        )
        db.add(db_fail)

    # Persist Artifacts
    for a in result.artifacts:
        db_art = TestArtifact(
            test_run_id=test_run.id,
            artifact_type=a["artifact_type"],
            file_path=a["file_path"],
            file_size_bytes=a["file_size_bytes"],
            mime_type=a["mime_type"]
        )
        db.add(db_art)
        db.add(db_art)

    await db.flush()

    # Generate Evidence-Grounded Root Cause Analysis
    rca_items = await generate_root_cause_analysis(
        metrics=result.metrics,
        failures=result.failures,
        tier=tier_label,
        project_name=project_name,
        device_name=profile_name
    )

    for r in rca_items:
        db_rec = Recommendation(
            test_run_id=test_run.id,
            title=r["title"],
            category=r.get("category", "Performance"),
            impact=r.get("impact", "HIGH"),
            probable_cause=r["probable_cause"],
            supporting_evidence=r.get("supporting_evidence"),
            remediation=r["remediation"],
            verification_steps=r["verification_steps"],
            status="OPEN"
        )
        db.add(db_rec)

    await db.commit()

    # Sync to Neo4j Knowledge Graph
    await sync_run_to_neo4j(
        workspace_name=workspace_name,
        project_id=project_id,
        project_name=project_name,
        run_id=test_run.id,
        profile_data=resolved_config,
        status=test_run.status,
        metrics=result.metrics,
        failures=result.failures,
        recommendations=rca_items,
        duration_ms=result.duration_ms,
        target_url=target_url
    )

    return test_run, result


async def orchestrate_web_test_job(
    job_id: str,
    target_url: str,
    tier: str,
    mode: str,
    project_id: str,
    workspace_id: str,
    workspace_name: str,
    project_name: str,
    device_profile_ids: Optional[List[str]] = None,
    custom_profiles: Optional[List[Dict[str, Any]]] = None
):
    """
    Multi-configuration background job execution orchestrator:
    Supports arbitrary device profiles (preset, database ID, or custom dictionary).
    Sequentially tests target application under real CDP emulation, updates real-time job state,
    and produces side-by-side performance comparison.
    """
    logger.info(f"Starting orchestration for job {job_id} ({target_url}, mode={mode})")
    start_time = datetime.now(timezone.utc)
    slot_acquired = False

    try:
        # Check cancellation
        job_rec = await job_store.get_job(job_id)
        if job_rec and job_rec.get("cancelled"):
            logger.info(f"Job {job_id} was cancelled before execution.")
            return

        # Stage 1: PREPARING
        await job_store.update_job(
            job_id,
            status=JobState.PREPARING.value,
            stage="Acquiring Browser Slot",
            progress_message="Waiting for browser execution slot...",
            started_at=start_time.isoformat()
        )

        slot_acquired = await concurrency_manager.acquire_slot(timeout=30.0)
        if not slot_acquired:
            raise RuntimeError("Concurrency limit reached: no browser execution slot available within timeout.")

        # Re-check cancellation after slot acquisition
        job_rec = await job_store.get_job(job_id)
        if job_rec and job_rec.get("cancelled"):
            logger.info(f"Job {job_id} was cancelled while acquiring slot.")
            return

        async with AsyncSessionLocal() as session:
            from app.api.v1.comparisons import build_comparison_payload, serialize_test_run

            # Ensure project exists
            if not project_id and workspace_id:
                p_stmt = select(Project).where(
                    Project.workspace_id == workspace_id,
                    Project.name == target_url
                )
                p_res = await session.execute(p_stmt)
                p_obj = p_res.scalars().first()
                if not p_obj:
                    p_obj = Project(
                        workspace_id=workspace_id,
                        name=target_url,
                        type=ProjectType.WEB.value,
                        target_url=target_url
                    )
                    session.add(p_obj)
                    await session.commit()
                    await session.refresh(p_obj)
                project_id = p_obj.id

            # Determine list of profile targets to execute
            targets_to_run: List[Any] = []
            if device_profile_ids and len(device_profile_ids) > 0:
                targets_to_run = list(device_profile_ids)
            elif custom_profiles and len(custom_profiles) > 0:
                targets_to_run = list(custom_profiles)
            elif tier == "BOTH":
                targets_to_run = ["GOOD_BUDGET", "ENTRY_LEVEL"]
            else:
                targets_to_run = [tier]

            is_comparison = len(targets_to_run) > 1 or mode in ("DUAL_COMPARISON", "MULTI_COMPARISON")
            comparison_group_id = job_id if is_comparison else None

            completed_runs = []
            failed_errors = []

            for idx, target_profile in enumerate(targets_to_run):
                # Check cancellation between profile iterations
                job_rec = await job_store.get_job(job_id)
                if job_rec and job_rec.get("cancelled"):
                    logger.info(f"Job {job_id} was cancelled before testing profile #{idx+1}.")
                    break

                resolved_cfg = resolve_device_profile_config(target_profile)
                prof_name = resolved_cfg.get("name", f"Profile #{idx+1}")

                await job_store.update_job(
                    job_id,
                    status=JobState.RUNNING.value,
                    stage=f"Testing Configuration ({idx+1}/{len(targets_to_run)})",
                    progress_message=f"Executing {prof_name} ({resolved_cfg['cpu_throttle_rate']}x CPU, {resolved_cfg['network']['name']})...",
                    comparison_group_id=comparison_group_id
                )

                try:
                    run_obj, res_obj = await _execute_single_tier(
                        target_url=target_url,
                        profile_item=target_profile,
                        project_id=project_id,
                        comparison_group_id=comparison_group_id,
                        workspace_name=workspace_name,
                        project_name=project_name,
                        db=session,
                        job_id=job_id
                    )
                    completed_runs.append((run_obj, res_obj))
                except Exception as tier_err:
                    logger.exception(f"Profile {prof_name} failed in job {job_id}: {tier_err}")
                    failed_errors.append((prof_name, str(tier_err)))
                    try:
                        await session.rollback()
                    except Exception:
                        pass

            # Stage 6: ANALYZING & BUILDING COMPARISON
            duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

            if is_comparison:
                await job_store.update_job(
                    job_id,
                    status=JobState.ANALYZING.value,
                    stage="Analyzing Discrepancies",
                    stage_id=6,
                    stage_name="Result Analysis",
                    progress_message="Aggregating performance metrics, degradation percentages, and RCA findings..."
                )
                await job_store.append_log(job_id, "Aggregating performance metrics, degradation percentages, and RCA findings...", stage_id=6, stage_name="Result Analysis")

                session.expire_all()
                comp_payload = await build_comparison_payload(comparison_group_id, session)

                if len(completed_runs) == 0:
                    final_status = JobState.FAILED.value
                    progress_msg = f"All {len(targets_to_run)} device configurations failed. Errors: {'; '.join(f'{k}: {v}' for k, v in failed_errors)}"
                elif len(completed_runs) < len(targets_to_run):
                    final_status = JobState.PARTIAL.value
                    progress_msg = f"{len(completed_runs)} of {len(targets_to_run)} configurations completed. Failures: {'; '.join(f'{k}: {v}' for k, v in failed_errors)}"
                else:
                    has_warnings = any(r[0].status == TestStatus.COMPLETED_WITH_WARNINGS.value for r in completed_runs)
                    has_failed = any(r[0].status == TestStatus.FAILED.value for r in completed_runs)
                    if has_failed:
                        final_status = JobState.FAILED.value
                        failed_reasons = [r[1].error_message for r in completed_runs if r[1] and r[1].error_message]
                        progress_msg = f"Target application issue: {'; '.join(dict.fromkeys(failed_reasons))}" if failed_reasons else "Device test execution failed on target application."
                    elif has_warnings:
                        final_status = JobState.COMPLETED_WITH_WARNINGS.value
                        progress_msg = "Multi-device comparison completed with non-fatal warnings."
                    else:
                        final_status = JobState.COMPLETED.value
                        progress_msg = f"Multi-device comparison of {len(completed_runs)} configurations completed successfully."

                await job_store.append_log(job_id, f"Multi-device shootout completed ({final_status}). Generated audit matrix.", level="SUCCESS", stage_id=7, stage_name="Report Generation")

                await job_store.update_job(
                    job_id,
                    status=final_status,
                    stage="Completed" if final_status != JobState.FAILED.value else "Execution Failed",
                    stage_id=7,
                    stage_name="Report Generation",
                    progress_message=progress_msg,
                    comparison_group_id=comparison_group_id,
                    comparison_data=comp_payload,
                    recommendations=comp_payload.get("recommendations", []) if comp_payload else [],
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    duration_ms=duration
                )

            else:
                # Single run handling
                if len(completed_runs) == 0:
                    final_status = JobState.FAILED.value
                    err_msg = failed_errors[0][1] if failed_errors else "Unknown execution error"
                    await job_store.update_job(
                        job_id,
                        status=final_status,
                        stage="Execution Failed",
                        progress_message=f"Test failed: {err_msg}",
                        completed_at=datetime.now(timezone.utc).isoformat(),
                        duration_ms=duration
                    )
                else:
                    single_run, single_result = completed_runs[0]
                    single_status = (
                        JobState.FAILED.value if single_run.status == TestStatus.FAILED.value else (
                            JobState.COMPLETED_WITH_WARNINGS.value if single_run.status == TestStatus.COMPLETED_WITH_WARNINGS.value else JobState.COMPLETED.value
                        )
                    )

                    stmt_single = (
                        select(TestRun)
                        .where(TestRun.id == single_run.id)
                        .options(
                            selectinload(TestRun.metrics),
                            selectinload(TestRun.failures),
                            selectinload(TestRun.artifacts),
                            selectinload(TestRun.recommendations),
                            selectinload(TestRun.device_profile),
                        )
                    )
                    sr_res = await session.execute(stmt_single)
                    fresh_run = sr_res.scalars().first()
                    serialized_single = serialize_test_run(fresh_run)

                    await job_store.append_log(job_id, f"Execution completed ({single_status}). Generated audit report.", level="SUCCESS", stage_id=7, stage_name="Report Generation")

                    await job_store.update_job(
                        job_id,
                        status=single_status,
                        stage="Completed" if single_status != JobState.FAILED.value else "Execution Failed",
                        stage_id=7,
                        stage_name="Report Generation",
                        progress_message=f"Test run completed ({single_run.status.replace('_', ' ')}).",
                        test_run_id=single_run.id,
                        single_run_id=single_run.id,
                        single_run_data=serialized_single,
                        metrics_summary={m.name: m.value for m in (fresh_run.metrics or [])},
                        recommendations=[{
                            "id": r.id,
                            "title": r.title,
                            "impact": r.impact,
                            "category": r.category,
                            "probable_cause": r.probable_cause,
                            "remediation": r.remediation,
                            "verification_steps": r.verification_steps,
                            "status": r.status
                        } for r in (fresh_run.recommendations or [])],
                        completed_at=datetime.now(timezone.utc).isoformat(),
                        duration_ms=duration
                    )

    except Exception as exc:
        logger.exception(f"Unhandled exception in orchestrate_web_test_job {job_id}: {exc}")
        await job_store.update_job(
            job_id,
            status=JobState.FAILED.value,
            stage="Execution Failed",
            progress_message=f"System error: {str(exc)}",
            error=str(exc),
            completed_at=datetime.now(timezone.utc).isoformat()
        )
    finally:
        if slot_acquired:
            concurrency_manager.release_slot()
        await concurrency_manager.release_workspace_slot(workspace_id, job_id)
        logger.info(f"Orchestration completed for job {job_id}. Slots released.")
