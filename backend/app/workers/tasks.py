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
    test_run.status = TestStatus.COMPLETED.value if result.success else TestStatus.FAILED.value
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

    return test_run


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
                if mode == "DUAL_COMPARISON":
                    comparison_group_id = str(uuid.uuid4())
                    await job_store.update_job(
                        job_id,
                        status=JobState.RUNNING.value,
                        stage="Executing Good Budget Test",
                        progress_message="Simulating 4G network & 4x CPU throttle (Good Budget profile)...",
                        comparison_group_id=comparison_group_id
                    )

                    run_gb = await _execute_single_tier(
                        target_url=target_url,
                        tier_key="GOOD_BUDGET",
                        project_id=project_id,
                        comparison_group_id=comparison_group_id,
                        workspace_name=workspace_name,
                        project_name=project_name,
                        db=session
                    )

                    await job_store.update_job(
                        job_id,
                        stage="Executing Entry-Level Test",
                        progress_message="Simulating 3G network & 6x CPU throttle (Entry-Level profile)...",
                        good_budget_run_id=run_gb.id
                    )

                    run_el = await _execute_single_tier(
                        target_url=target_url,
                        tier_key="ENTRY_LEVEL",
                        project_id=project_id,
                        comparison_group_id=comparison_group_id,
                        workspace_name=workspace_name,
                        project_name=project_name,
                        db=session
                    )

                    await job_store.update_job(
                        job_id,
                        status=JobState.ANALYZING.value,
                        stage="Analyzing Discrepancies",
                        progress_message="Correlating differential performance drop & generating RCA...",
                        entry_level_run_id=run_el.id
                    )

                    # Complete
                    duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
                    await job_store.update_job(
                        job_id,
                        status=JobState.COMPLETED.value,
                        stage="Completed",
                        progress_message="Dual device comparison completed successfully.",
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

                    single_run = await _execute_single_tier(
                        target_url=target_url,
                        tier_key=tier,
                        project_id=project_id,
                        comparison_group_id=None,
                        workspace_name=workspace_name,
                        project_name=project_name,
                        db=session
                    )

                    duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
                    await job_store.update_job(
                        job_id,
                        status=JobState.COMPLETED.value,
                        stage="Completed",
                        progress_message=f"Web test for {tier} completed successfully.",
                        test_run_id=single_run.id,
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
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_ms=duration
        )
    except Exception as e:
        logger.exception(f"Job {job_id} failed with error: {e}")
        duration = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        await job_store.update_job(
            job_id,
            status=JobState.FAILED.value,
            stage="Execution Failed",
            progress_message=f"Error during execution: {str(e)}",
            error=str(e),
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
