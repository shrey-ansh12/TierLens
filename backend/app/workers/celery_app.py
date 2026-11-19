import os
import logging
from celery import Celery
from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "tierlens_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=settings.WEB_TEST_TIMEOUT_SECONDS + 30,
    task_soft_time_limit=settings.WEB_TEST_TIMEOUT_SECONDS,
    broker_connection_retry_on_startup=False,
)
