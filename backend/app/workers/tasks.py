import asyncio
import logging
from datetime import datetime, timezone
import uuid
from typing import Optional, Dict, Any

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.core.concurrency import concurrency_manager
from app.workers.job_store import job_store, JobState
from app.workers.celery_app import celery_app
from app.models.relational.entities import (
    DeviceProfile, TestRun, TestMetric, TestFailure, TestArtifact,
    Recommendation, TestStatus
)
from app.engines.web.runner import run_web_performance_test
from app.intelligence.rca_engine import generate_root_cause_analysis
from app.models.graph.queries import sync_run_to_neo4j
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)


async def _execute_single_tier(
    target_url: str,
    tier_key: str,
    project_id: str,
    comparison_group_id: Optional[str],
    workspace_name: str,
    project_name: str,
    db
) -> TestRun:
    """Runs Playwright, saves metrics, failures, artifacts, RCA recommendations and Neo4j sync."""
    # Find device profile
    dp_res = await db.execute(select(DeviceProfile).where(DeviceProfile.tier == tier_key))
    profile = dp_res.scalars().first()
    profile_id = profile.id if profile else None

    # Create Initial Test Run Record
    test_run = TestRun(
        project_id=project_id,
        device_profile_id=profile_id,
        comparison_group_id=comparison_group_id,
        target_url=target_url,
        status=TestStatus.RUNNING.value,
        started_at=datetime.now(timezone.utc),
        is_synthetic=False
    )
    if profile:
        test_run.device_profile = profile
    db.add(test_run)
    await db.commit()
    await db.refresh(test_run)

    # Execute Playwright Test
    result = await run_web_performance_test(
        target_url=target_url,
        profile_key=tier_key,
        test_run_id=test_run.id
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
            screenshot_url=f.get("screenshot_url")
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

    await db.flush()

    # Generate Root Cause Analysis & Recommendations
    rca_items = await generate_root_cause_analysis(
        metrics=result.metrics,
        failures=result.failures,
        tier=tier_key,
        project_name=project_name
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

    # Sync to Neo4j
    await sync_run_to_neo4j(
        workspace_name=workspace_name,
        project_id=project_id,
        project_name=project_name,
        run_id=test_run.id,
        tier=tier_key,
        status=test_run.status,
        metrics=result.metrics,
        failures=result.failures,
        recommendations=rca_items
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
    project_name: str
):
    """
    Background job execution engine:
    1. Checks cancellation before starting.
    2. Acquires browser execution slot (semaphore-limited).
    3. Executes Playwright test(s) under timeout protection.
    4. Updates job status at each stage (PREPARING -> RUNNING -> ANALYZING -> COMPLETED/FAILED).
    5. Always releases concurrency slots and guarantees jobs never stay in RUNNING.
    """
    logger.info(f"Starting background orchestration for job {job_id} ({target_url}, {tier})")
    start_time = datetime.now(timezone.utc)
    slot_acquired = False

    try:
        # Check cancellation
        job_rec = await job_store.get_job(job_id)
        if job_rec and job_rec.get("cancelled"):
            logger.info(f"Job {job_id} was cancelled before execution.")
            return

        # Stage 1: PREPARING - Acquire browser slot
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

        # Stage 2: RUNNING & ANALYZING with Timeout
        timeout_secs = settings.WEB_TEST_TIMEOUT_SECONDS

        async def _run_workload():
            async with AsyncSessionLocal() as session:
                from app.api.v1.comparisons import build_comparison_payload, serialize_test_run

                if mode == "DUAL_COMPARISON":
                    comparison_group_id = job_id
                    await job_store.update_job(
                        job_id,
                        status=JobState.RUNNING.value,
                        stage="Executing Good Budget Test",
                        progress_message="Simulating 4G network & 4x CPU throttle (Good Budget profile)...",
                        comparison_group_id=comparison_group_id
                    )

                    run_gb, res_gb = None, None
                    gb_error = None
                    try:
                        run_gb, res_gb = await _execute_single_tier(
                            target_url=target_url,
                            tier_key="GOOD_BUDGET",
                            project_id=project_id,
                            comparison_group_id=comparison_group_id,
                            workspace_name=workspace_name,
                            project_name=project_name,
                            db=session
                        )
                    except Exception as e:
                        gb_error = str(e)
                        logger.exception(f"Good Budget tier failed for job {job_id}: {e}")

                    await job_store.update_job(
                        job_id,
                        stage="Executing Entry-Level Test",
                        progress_message="Simulating 3G network & 8x CPU throttle (Entry-Level profile)...",
                        good_budget_run_id=run_gb.id if run_gb else None
                    )

                    run_el, res_el = None, None
                    el_error = None
                    try:
                        run_el, res_el = await _execute_single_tier(
                            target_url=target_url,
                            tier_key="ENTRY_LEVEL",
                            project_id=project_id,
                            comparison_group_id=comparison_group_id,
                            workspace_name=workspace_name,
                            project_name=project_name,
                            db=session
                        )
                    except Exception as e:
                        el_error = str(e)
                        logger.exception(f"Entry-Level tier failed for job {job_id}: {e}")

                    await job_store.update_job(
                        job_id,
                        status=JobState.ANALYZING.value,
                        stage="Analyzing Discrepancies",
                        progress_message="Correlating differential performance drop & generating RCA...",
                        entry_level_run_id=run_el.id if run_el else None
                    )

                    # Build comparison payload
                    comp_payload = await build_comparison_payload(comparison_group_id, session)

                    # Evaluate final status based on both runs
                    duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
                    both_succeeded = run_gb is not None and run_el is not None
                    neither_succeeded = run_gb is None and run_el is None

                    if neither_succeeded:
                        final_status = JobState.FAILED.value
                        progress_msg = f"Both device profiles failed to complete. Good Budget: {gb_error} | Entry-Level: {el_error}"
                    elif not both_succeeded:
                        final_status = JobState.PARTIAL.value
                        if run_gb:
                            progress_msg = f"Good Budget profile completed, but Entry-Level profile failed ({el_error})."
                        else:
                            progress_msg = f"Entry-Level profile completed, but Good Budget profile failed ({gb_error})."
                    else:
                        has_warnings = (
                            run_gb.status == TestStatus.COMPLETED_WITH_WARNINGS.value or
                            run_el.status == TestStatus.COMPLETED_WITH_WARNINGS.value
                        )
                        has_failed = (
                            run_gb.status == TestStatus.FAILED.value or
                            run_el.status == TestStatus.FAILED.value
                        )
                        if has_failed:
                            final_status = JobState.FAILED.value
                            progress_msg = "Device test execution failed on target application."
                        elif has_warnings:
                            final_status = JobState.COMPLETED_WITH_WARNINGS.value
                            progress_msg = "Dual device comparison completed with non-fatal warnings."
                        else:
                            final_status = JobState.COMPLETED.value
                            progress_msg = "Dual device comparison completed successfully."

                    await job_store.update_job(
                        job_id,
                        status=final_status,
                        stage="Completed" if final_status != JobState.FAILED.value else "Execution Failed",
                        progress_message=progress_msg,
                        comparison_group_id=comparison_group_id,
                        good_budget_run_id=run_gb.id if run_gb else None,
                        entry_level_run_id=run_el.id if run_el else None,
                        comparison_data=comp_payload,
                        recommendations=comp_payload.get("recommendations", []) if comp_payload else [],
                        completed_at=datetime.now(timezone.utc).isoformat(),
                        duration_ms=duration
                    )

                else:
                    # Single profile run
                    await job_store.update_job(
                        job_id,
                        status=JobState.RUNNING.value,
                        stage=f"Executing {tier} Test",
                        progress_message=f"Simulating {tier} profile under throttled conditions..."
                    )

                    single_run, single_result = await _execute_single_tier(
                        target_url=target_url,
                        tier_key=tier,
                        project_id=project_id,
                        comparison_group_id=None,
                        workspace_name=workspace_name,
                        project_name=project_name,
                        db=session
                    )

                    duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
                    single_status = (
                        JobState.FAILED.value if single_run.status == TestStatus.FAILED.value else (
                            JobState.COMPLETED_WITH_WARNINGS.value if single_run.status == TestStatus.COMPLETED_WITH_WARNINGS.value else JobState.COMPLETED.value
                        )
                    )
                    primary_fail = single_result.failures[0] if (single_result and single_result.failures) else None
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
                    single_res = await session.execute(stmt_single)
                    fresh_single = single_res.scalars().first()
                    serialized_single = serialize_test_run(fresh_single or single_run)

                    await job_store.update_job(
                        job_id,
                        status=single_status,
                        stage="Completed",
                        progress_message=f"Web test for {tier} finished ({single_run.failure_summary}).",
                        test_run_id=single_run.id,
                        single_run_data=serialized_single,
                        recommendations=serialized_single.get("recommendations", []) if serialized_single else [],
                        error_category=primary_fail["failure_type"] if (primary_fail and single_status == JobState.FAILED.value) else None,
                        error=single_run.failure_summary if single_status == JobState.FAILED.value else None,
                        completed_at=datetime.now(timezone.utc).isoformat(),
                        duration_ms=duration
                    )

        # Run with overall timeout
        await asyncio.wait_for(_run_workload(), timeout=timeout_secs)

    except asyncio.CancelledError:
        logger.info(f"Job {job_id} task was cancelled in-flight.")
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        await job_store.update_job(
            job_id,
            status=JobState.CANCELLED.value,
            stage="Cancelled",
            progress_message="Test execution was cancelled by user.",
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_ms=duration
        )
    except asyncio.TimeoutError:
        logger.error(f"Job {job_id} exceeded maximum timeout of {settings.WEB_TEST_TIMEOUT_SECONDS}s.")
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        await job_store.update_job(
            job_id,
            status=JobState.FAILED.value,
            stage="Timeout Exceeded",
            progress_message=f"Execution timed out after {settings.WEB_TEST_TIMEOUT_SECONDS}s.",
            error="Test execution timed out.",
            error_category="NAVIGATION_TIMEOUT",
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_ms=duration
        )
    except Exception as e:
        logger.exception(f"Job {job_id} failed with error: {e}")
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        from app.engines.web.classifier import classify_navigation_error
        classified = classify_navigation_error(str(e))
        await job_store.update_job(
            job_id,
            status=JobState.FAILED.value,
            stage="Execution Failed",
            progress_message=f"{classified.category}: {classified.explanation}",
            error=str(e),
            error_category=classified.category,
            error_details=classified.to_dict(),
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_ms=duration
        )
    finally:
        job_store.unregister_active_task(job_id)
        if slot_acquired:
            concurrency_manager.release_slot()
        await concurrency_manager.unregister_job(job_id, workspace_id, target_url)


@celery_app.task(name="tasks.run_web_test_task", bind=True, max_retries=1)
def run_web_test_task(
    self,
    job_id: str,
    target_url: str,
    tier: str,
    mode: str,
    project_id: str,
    workspace_id: str,
    workspace_name: str,
    project_name: str
):
    """Celery worker task wrapper to execute the async orchestration."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(
        orchestrate_web_test_job(
            job_id=job_id,
            target_url=target_url,
            tier=tier,
            mode=mode,
            project_id=project_id,
            workspace_id=workspace_id,
            workspace_name=workspace_name,
            project_name=project_name
        )
    )
