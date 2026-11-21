import json
import logging
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.intelligence.rule_engine import analyze_performance_rules

logger = logging.getLogger(__name__)

async def generate_root_cause_analysis(
    metrics: List[Dict[str, Any]],
    failures: List[Dict[str, Any]],
    tier: str = "ENTRY_LEVEL",
    project_name: str = "Target App",
    device_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Evidence-grounded RCA engine.
    Runs deterministic rules first.
    If LLM API is configured, enriches hypotheses while maintaining strict adherence to real evidence.
    """
    effective_device = device_name or tier
    # 1. Base deterministic rules (Always computed, 100% grounded)
    recommendations = analyze_performance_rules(metrics, failures, tier=tier, device_name=effective_device)

    # 2. Check for LLM enhancement if key exists
    if settings.GEMINI_API_KEY:
        try:
            llm_enriched = await _query_gemini_rca(metrics, failures, tier, project_name, effective_device)
            if llm_enriched:
                return llm_enriched
        except Exception as e:
            logger.warning(f"LLM RCA enrichment skipped ({e}). Falling back cleanly to deterministic rules.")

    return recommendations

async def _query_gemini_rca(
    metrics: List[Dict[str, Any]],
    failures: List[Dict[str, Any]],
    tier: str,
    project_name: str,
    device_name: str
) -> Optional[List[Dict[str, Any]]]:
    """Calls Gemini API with structured prompt and strict evidence boundaries."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    
    prompt = f"""
You are the TierLens Root Cause Analysis Engine.
Analyze the following real test execution data for '{project_name}' under '{device_name}' ({tier}) profile conditions:

METRICS:
{json.dumps(metrics, indent=2)}

FAILURES & LOGS:
{json.dumps(failures, indent=2)}

CRITICAL RULES:
1. Ground every claim directly in the provided metrics or logs.
2. Never invent fake metrics or imaginary code errors.
3. Include detected_issue, affected_metric, affected_device_configuration, confidence_level, probable_cause, and concrete recommended_fix.
4. Return a JSON array of recommendations matching this exact structure:
[
  {{
    "title": "Title of issue",
    "detected_issue": "Specific detected threshold violation",
    "affected_metric": "LCP|CLS|TTFB|LONG_TASKS_DURATION|etc",
    "affected_device_configuration": "{device_name}",
    "confidence_level": "HIGH (90%)|MEDIUM (75%)",
    "category": "Performance|Stability|Network|CPU / Main Thread",
    "impact": "HIGH|MEDIUM|LOW",
    "probable_cause": "Evidence-backed cause explanation",
    "supporting_evidence": [{{"type": "METRIC|LOG", "description": "..."}}],
    "remediation": "Concrete actionable steps",
    "recommended_fix": "Concrete actionable steps",
    "verification_steps": "How to verify after fix"
  }}
]
Return ONLY valid JSON.
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code == 200:
            data = resp.json()
            text_content = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text_content)
            if isinstance(parsed, list):
                return parsed
    return None
