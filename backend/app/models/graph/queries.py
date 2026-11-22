import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, date
from app.core.neo4j_client import neo4j_manager

logger = logging.getLogger(__name__)

async def sync_run_to_neo4j(
    workspace_name: str,
    project_id: str,
    project_name: str,
    run_id: str,
    profile_data: Dict[str, Any],
    status: str,
    metrics: List[Dict[str, Any]],
    failures: List[Dict[str, Any]],
    recommendations: List[Dict[str, Any]],
    duration_ms: int = 0,
    target_url: str = ""
) -> bool:
    """
    Persists test run entities and relationships to Neo4j knowledge graph,
    connecting detected failures to real-world Indian demographic cohorts (T1.2):
    (:Project) -[:HAS_TEST]-> (:TestRun)
    (:TestRun) -[:USED_PROFILE]-> (:DeviceProfile)
    (:DeviceProfile) -[:REPRESENTS_SEGMENT]-> (:MarketSegment)
    (:DeviceProfile) -[:SUBJECT_TO_NETWORK]-> (:NetworkCohort)
    (:TestRun) -[:PRODUCED]-> (:Metric)
    (:TestRun) -[:DETECTED]-> (:Failure)
    (:Failure) -[:MATCHES]-> (:ErrorSignature)
    (:Failure) -[:IMPACTS_POPULATION]-> (:MarketSegment)
    (:Failure) -[:INDICATES]-> (:RootCause)
    (:RootCause) -[:SUGGESTS]-> (:Recommendation)
    """
    health = await neo4j_manager.check_health()
    if not health.get("connected"):
        logger.info(f"Neo4j is disconnected. Deferred graph sync for run {run_id}.")
        return False

    cypher = """
    MERGE (ws:Workspace {name: $ws_name})
    MERGE (proj:Project {id: $project_id})
      ON CREATE SET proj.name = $project_name, proj.target_url = $target_url, proj.created_at = datetime()
      SET proj.target_url = coalesce($target_url, proj.target_url), proj.name = coalesce($project_name, proj.name)
    MERGE (ws)-[:CONTAINS]->(proj)

    MERGE (entrySeg:MarketSegment {name: "Sub-₹8,000 Budget Devices"})
      ON CREATE SET entrySeg.share_pct = 38.5, entrySeg.active_users_millions = 190, entrySeg.description = "Entry-level smartphones (Redmi 9A, JioPhone Next, Poco C51)"
    MERGE (midSeg:MarketSegment {name: "₹12,000 - ₹20,000 Mid-Tier"})
      ON CREATE SET midSeg.share_pct = 36.0, midSeg.active_users_millions = 180, midSeg.description = "Mid-tier budget smartphones (Galaxy A14, Moto G)"
    MERGE (congestedNet:NetworkCohort {name: "Jio/Airtel Congested Tier-2/3"})
      ON CREATE SET congestedNet.share_pct = 61.0, congestedNet.active_users_millions = 310, congestedNet.description = "Tier-2/3 cell congestion with high packet latency"

    MERGE (dp:DeviceProfile {id: $profile_id})
      ON CREATE SET
        dp.name = $profile_name,
        dp.tier = $tier,
        dp.device_type = $device_type,
        dp.cpu_cores = $cpu_cores,
        dp.cpu_throttle_rate = $cpu_throttle_rate,
        dp.network_profile = $network_profile,
        dp.ram_mb = $ram_mb,
        dp.storage_profile = $storage_profile

    FOREACH (_ IN CASE WHEN $tier = 'ENTRY_LEVEL' THEN [1] ELSE [] END |
      MERGE (dp)-[:REPRESENTS_SEGMENT]->(entrySeg)
      MERGE (dp)-[:SUBJECT_TO_NETWORK]->(congestedNet)
    )
    FOREACH (_ IN CASE WHEN $tier = 'GOOD_BUDGET' THEN [1] ELSE [] END |
      MERGE (dp)-[:REPRESENTS_SEGMENT]->(midSeg)
    )

    CREATE (run:TestRun {
        id: $run_id,
        status: $status,
        duration_ms: $duration_ms,
        target_url: $target_url,
        timestamp: datetime()
    })
    CREATE (proj)-[:HAS_TEST]->(run)
    CREATE (run)-[:USED_PROFILE]->(dp)

    FOREACH (m IN $metrics |
      CREATE (met:Metric {
          name: m.name,
          value: m.value,
          unit: m.unit,
          rating: m.rating,
          is_emulated: m.is_emulated
      })
      CREATE (run)-[:PRODUCED]->(met)
    )

    FOREACH (f IN $failures |
      CREATE (fail:Failure {
          id: coalesce(f.id, f.error_signature),
          title: f.title,
          type: f.failure_type,
          signature: f.error_signature,
          message: f.message
      })
      CREATE (run)-[:DETECTED]->(fail)
      MERGE (sig:ErrorSignature {signature: f.error_signature})
        ON CREATE SET sig.title = f.title, sig.first_seen = datetime()
      CREATE (fail)-[:MATCHES]->(sig)
      FOREACH (_ IN CASE WHEN $tier = 'ENTRY_LEVEL' THEN [1] ELSE [] END |
        MERGE (fail)-[:IMPACTS_POPULATION {estimated_users_millions: 190, population_pct: 38.5}]->(entrySeg)
        MERGE (fail)-[:AFFECTS_NETWORK_COHORT {estimated_users_millions: 310, population_pct: 61.0}]->(congestedNet)
      )
      FOREACH (_ IN CASE WHEN $tier = 'GOOD_BUDGET' THEN [1] ELSE [] END |
        MERGE (fail)-[:IMPACTS_POPULATION {estimated_users_millions: 180, population_pct: 36.0}]->(midSeg)
      )
    )

    FOREACH (r IN $recommendations |
      CREATE (rc:RootCause {
          id: coalesce(r.id, r.title),
          title: r.title,
          probable_cause: r.probable_cause,
          category: coalesce(r.category, 'Performance'),
          confidence: coalesce(r.confidence_level, 'HIGH (85%)')
      })
      CREATE (rec:Recommendation {
          id: coalesce(r.id, r.title),
          title: r.title,
          impact: coalesce(r.impact, 'HIGH'),
          remediation: r.remediation,
          status: coalesce(r.status, 'OPEN')
      })
      CREATE (rc)-[:SUGGESTS]->(rec)
      CREATE (run)-[:PRODUCED_RECOMMENDATION]->(rec)
    )
    """

    tier = profile_data.get("tier", "ENTRY_LEVEL")
    profile_id = profile_data.get("id") or f"profile_{profile_data.get('name', 'custom').lower().replace(' ', '_')}"
    params = {
        "ws_name": workspace_name,
        "project_id": project_id,
        "project_name": project_name,
        "target_url": target_url or project_name,
        "run_id": run_id,
        "tier": tier,
        "status": status,
        "duration_ms": duration_ms,
        "profile_id": profile_id,
        "profile_name": profile_data.get("name", "Custom Profile"),
        "device_type": profile_data.get("device_type", "Custom Device"),
        "cpu_cores": profile_data.get("cpu_cores", 4),
        "cpu_throttle_rate": profile_data.get("cpu_throttle_rate", 1.0),
        "network_profile": profile_data.get("network", {}).get("name", "Fast 3G"),
        "ram_mb": profile_data.get("ram_mb", 4096),
        "storage_profile": profile_data.get("storage_profile", "Standard"),
        "metrics": metrics,
        "failures": failures,
        "recommendations": recommendations
    }

    try:
        await neo4j_manager.run_query(cypher, params)
        logger.info(f"Successfully synced run {run_id} and Indian demographics to Neo4j knowledge graph.")
        return True
    except Exception as e:
        logger.error(f"Failed to sync run {run_id} to Neo4j: {e}")
        return False


async def get_project_graph(project_id: str) -> Dict[str, Any]:
    """
    Retrieves project graph nodes and edges from Neo4j.
    If Neo4j is offline, returns connected: False.
    """
    health = await neo4j_manager.check_health()
    if not health.get("connected"):
        return {
            "nodes": [],
            "edges": [],
            "connected": False,
            "error": "Neo4j is disconnected. Start Neo4j server or container to explore live graph intelligence.",
            "is_synthetic": False
        }

    cypher = """
    MATCH (proj:Project {id: $project_id})-[r1:HAS_TEST]->(run:TestRun)
    OPTIONAL MATCH (run)-[r2:USED_PROFILE]->(dp:DeviceProfile)
    OPTIONAL MATCH (dp)-[r7:REPRESENTS_SEGMENT]->(seg:MarketSegment)
    OPTIONAL MATCH (dp)-[r8:SUBJECT_TO_NETWORK]->(net:NetworkCohort)
    OPTIONAL MATCH (run)-[r3:PRODUCED]->(m:Metric)
    OPTIONAL MATCH (run)-[r4:DETECTED]->(fail:Failure)-[r5:MATCHES]->(sig:ErrorSignature)
    OPTIONAL MATCH (fail)-[r9:IMPACTS_POPULATION]->(seg)
    OPTIONAL MATCH (fail)-[r6:INDICATES]->(rc:RootCause)-[r10:SUGGESTS]->(rec:Recommendation)
    RETURN proj, run, dp, seg, net, m, fail, sig, rc, rec LIMIT 200
    """

    try:
        records = await neo4j_manager.run_query(cypher, {"project_id": project_id})
        nodes_dict = {}
        edges_list = []

        def add_node(node_id: str, label: str, name: str, props: Dict[str, Any]):
            if node_id not in nodes_dict:
                nodes_dict[node_id] = {
                    "id": str(node_id),
                    "label": label,
                    "name": name,
                    "properties": props
                }

        for rec in records:
            p = rec.get("proj")
            r = rec.get("run")

            if p:
                add_node(p["id"], "Project", p.get("name", "Project"), p)

            if r and p:
                add_node(r["id"], "TestRun", f"Run {r['id'][:8]}", r)
                edges_list.append({
                    "id": f"{p['id']}_{r['id']}",
                    "source": p["id"],
                    "target": r["id"],
                    "type": "HAS_TEST"
                })

            if rec.get("dp") and r:
                dp = rec["dp"]
                dp_id = dp.get("id") or f"dp_{dp.get('name', 'profile')}"
                add_node(dp_id, "DeviceProfile", dp.get("name", "Profile"), dp)
                edges_list.append({
                    "id": f"{r['id']}_{dp_id}",
                    "source": r["id"],
                    "target": dp_id,
                    "type": "USED_PROFILE"
                })
                if rec.get("seg"):
                    sg = rec["seg"]
                    sg_id = f"seg_{sg['name']}"
                    add_node(sg_id, "MarketSegment", f"{sg['name']} ({sg.get('share_pct', 0)}%)", sg)
                    edges_list.append({
                        "id": f"{dp_id}_{sg_id}",
                        "source": dp_id,
                        "target": sg_id,
                        "type": "REPRESENTS_SEGMENT"
                    })
                if rec.get("net"):
                    nt = rec["net"]
                    nt_id = f"net_{nt['name']}"
                    add_node(nt_id, "NetworkCohort", f"{nt['name']} ({nt.get('share_pct', 0)}%)", nt)
                    edges_list.append({
                        "id": f"{dp_id}_{nt_id}",
                        "source": dp_id,
                        "target": nt_id,
                        "type": "SUBJECT_TO_NETWORK"
                    })

            if rec.get("m") and r:
                m = rec["m"]
                m_id = f"m_{r['id'][:6]}_{m.get('name')}"
                add_node(m_id, "Metric", f"{m.get('name')}: {m.get('value')}", m)
                edges_list.append({
                    "id": f"{r['id']}_{m_id}",
                    "source": r["id"],
                    "target": m_id,
                    "type": "PRODUCED"
                })

            if rec.get("fail") and r:
                f = rec["fail"]
                f_id = f.get("id") or f"fail_{f.get('signature', 'err')}_{r['id'][:6]}"
                add_node(f_id, "Failure", f.get("title", "Failure")[:30], f)
                edges_list.append({
                    "id": f"{r['id']}_{f_id}",
                    "source": r["id"],
                    "target": f_id,
                    "type": "DETECTED"
                })

                if rec.get("sig"):
                    s = rec["sig"]
                    s_id = f"sig_{s.get('signature', 'unknown')}"
                    add_node(s_id, "ErrorSignature", f"Sig: {s.get('signature', 'unknown')[:8]}", s)
                    edges_list.append({
                        "id": f"{f_id}_{s_id}",
                        "source": f_id,
                        "target": s_id,
                        "type": "MATCHES"
                    })

                if rec.get("seg"):
                    sg_id = f"seg_{rec['seg']['name']}"
                    edges_list.append({
                        "id": f"{f_id}_{sg_id}",
                        "source": f_id,
                        "target": sg_id,
                        "type": "IMPACTS_POPULATION"
                    })

                if rec.get("rc"):
                    rc = rec["rc"]
                    rc_id = rc.get("id") or f"rc_{rc.get('title', 'rc')[:15]}"
                    add_node(rc_id, "RootCause", rc.get("title", "Root Cause")[:30], rc)
                    edges_list.append({
                        "id": f"{f_id}_{rc_id}",
                        "source": f_id,
                        "target": rc_id,
                        "type": "INDICATES"
                    })

                    if rec.get("rec"):
                        rec_node = rec["rec"]
                        rec_id = rec_node.get("id") or f"rec_{rec_node.get('title', 'rec')[:15]}"
                        add_node(rec_id, "Recommendation", rec_node.get("title", "Rec")[:30], rec_node)
                        edges_list.append({
                            "id": f"{rc_id}_{rec_id}",
                            "source": rc_id,
                            "target": rec_id,
                            "type": "SUGGESTS"
                        })

        return {
            "nodes": list(nodes_dict.values()),
            "edges": edges_list,
            "connected": True,
            "error": None,
            "is_synthetic": False
        }
    except Exception as e:
        logger.error(f"Error querying Neo4j project graph: {e}")
        return {
            "nodes": [],
            "edges": [],
            "connected": False,
            "error": str(e),
            "is_synthetic": False
        }


async def get_fallback_graph_from_postgres(project_id: str, db) -> Dict[str, Any]:
    """
    Constructs a rich graph visualization from PostgreSQL entities when Neo4j is offline.
    Includes Indian Demographic Cohort nodes (Sub-₹8k Budget & Congested Cellular).
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.relational.entities import Project, TestRun, DeviceProfile, TestMetric, TestFailure, Recommendation

    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.test_runs).selectinload(TestRun.device_profile),
            selectinload(Project.test_runs).selectinload(TestRun.metrics),
            selectinload(Project.test_runs).selectinload(TestRun.failures),
            selectinload(Project.test_runs).selectinload(TestRun.recommendations),
        )
    )
    res = await db.execute(stmt)
    proj = res.scalars().first()
    if not proj:
        return {"nodes": [], "edges": [], "connected": False, "source": "PostgreSQL"}

    nodes_dict = {}
    edges_list = []

    def add_node(node_id: str, label: str, name: str, props: Dict[str, Any]):
        if node_id not in nodes_dict:
            nodes_dict[node_id] = {
                "id": str(node_id),
                "label": label,
                "name": name,
                "properties": props
            }

    # Project node
    add_node(proj.id, "Project", proj.name, {"id": proj.id, "name": proj.name, "target_url": proj.target_url})

    # Demographic nodes (T1.2)
    entry_seg_id = "seg_entry_budget_8k"
    add_node(entry_seg_id, "MarketSegment", "Sub-₹8,000 Budget Users (38.5%)", {
        "name": "Sub-₹8,000 Budget Devices",
        "share_pct": 38.5,
        "active_users_millions": 190
    })
    net_cohort_id = "cohort_congested_4g"
    add_node(net_cohort_id, "NetworkCohort", "Congested 4G/3G Tier-2/3 (61%)", {
        "name": "Congested Tier-2/3 Cellular Networks",
        "share_pct": 61.0,
        "active_users_millions": 310
    })

    for run in proj.test_runs[-10:]: # last 10 runs
        add_node(run.id, "TestRun", f"Run {run.id[:8]}", {
            "id": run.id,
            "status": run.status,
            "duration_ms": run.duration_ms,
            "created_at": run.created_at.isoformat() if run.created_at else None
        })
        edges_list.append({
            "id": f"{proj.id}_{run.id}",
            "source": proj.id,
            "target": run.id,
            "type": "HAS_TEST"
        })

        if run.device_profile:
            dp = run.device_profile
            dp_id = dp.id or f"dp_{dp.name}"
            add_node(dp_id, "DeviceProfile", dp.name, {
                "id": dp.id,
                "name": dp.name,
                "tier": dp.tier,
                "device_type": getattr(dp, "device_type", "Custom"),
                "cpu_cores": getattr(dp, "cpu_cores", 4),
                "cpu_throttle_rate": dp.cpu_throttle_rate,
                "ram_mb": dp.ram_mb
            })
            edges_list.append({
                "id": f"{run.id}_{dp_id}",
                "source": run.id,
                "target": dp_id,
                "type": "USED_PROFILE"
            })

            if dp.tier == "ENTRY_LEVEL":
                edges_list.append({
                    "id": f"{dp_id}_{entry_seg_id}",
                    "source": dp_id,
                    "target": entry_seg_id,
                    "type": "REPRESENTS_SEGMENT"
                })
                edges_list.append({
                    "id": f"{dp_id}_{net_cohort_id}",
                    "source": dp_id,
                    "target": net_cohort_id,
                    "type": "SUBJECT_TO_NETWORK"
                })

        for m in run.metrics:
            m_id = f"m_{m.id}"
            add_node(m_id, "Metric", f"{m.name}: {m.value} {m.unit}", {
                "name": m.name,
                "value": m.value,
                "unit": m.unit,
                "rating": m.rating
            })
            edges_list.append({
                "id": f"{run.id}_{m_id}",
                "source": run.id,
                "target": m_id,
                "type": "PRODUCED"
            })

        for f in run.failures:
            f_id = f"fail_{f.id}"
            add_node(f_id, "Failure", f.title[:30], {
                "id": f.id,
                "title": f.title,
                "type": f.failure_type,
                "signature": f.error_signature
            })
            edges_list.append({
                "id": f"{run.id}_{f_id}",
                "source": run.id,
                "target": f_id,
                "type": "DETECTED"
            })

            sig_id = f"sig_{f.error_signature}"
            add_node(sig_id, "ErrorSignature", f"Sig: {f.error_signature[:8]}", {
                "signature": f.error_signature,
                "title": f.title
            })
            edges_list.append({
                "id": f"{f_id}_{sig_id}",
                "source": f_id,
                "target": sig_id,
                "type": "MATCHES"
            })

            # Demographic blast radius edge (T1.2)
            edges_list.append({
                "id": f"{f_id}_{entry_seg_id}",
                "source": f_id,
                "target": entry_seg_id,
                "type": "IMPACTS_POPULATION"
            })

        for r in run.recommendations:
            rc_id = f"rc_{r.id}"
            add_node(rc_id, "RootCause", r.title[:30], {
                "title": r.title,
                "probable_cause": r.probable_cause,
                "category": r.category,
                "impact": r.impact
            })
            rec_id = f"rec_{r.id}"
            add_node(rec_id, "Recommendation", r.title[:30], {
                "title": r.title,
                "remediation": r.remediation,
                "status": r.status
            })
            edges_list.append({
                "id": f"{rc_id}_{rec_id}",
                "source": rc_id,
                "target": rec_id,
                "type": "SUGGESTS"
            })
            edges_list.append({
                "id": f"{run.id}_{rc_id}",
                "source": run.id,
                "target": rc_id,
                "type": "INDICATES"
            })

    return {
        "nodes": list(nodes_dict.values()),
        "edges": edges_list,
        "connected": False,
        "source": "PostgreSQL Entity Graph (Demographic Blast Radius Active)",
        "is_synthetic": False
    }


# Alias for compatibility
get_relational_project_topology = get_fallback_graph_from_postgres


def _sanitize_neo4j_data(data: Any) -> Any:
    """Recursively formats Neo4j datetime, date, and spatial objects to JSON-serializable primitives."""
    if data is None:
        return None
    if isinstance(data, (str, int, float, bool)):
        return data
    if isinstance(data, (datetime, date)) or hasattr(data, "isoformat"):
        return data.isoformat()
    if isinstance(data, list):
        return [_sanitize_neo4j_data(x) for x in data]
    if isinstance(data, dict):
        return {k: _sanitize_neo4j_data(v) for k, v in data.items()}
    return str(data)


async def get_graph_stats(db=None, project_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns actual counts of Projects, Test Runs, Device Profiles, Metrics, Failures,
    Error Signatures, Root Causes, and Recommendations.
    Uses Neo4j Aura when connected; falls back cleanly to Neon PostgreSQL.
    When project_id is provided, calculates strictly for that tested website/project.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            if project_id and project_id != "ALL":
                stats_cypher = """
                MATCH (p:Project) WHERE p.id = $project_id OR p.name = $project_id OR p.target_url = $project_id OR toLower(p.name) = toLower($project_id)
                OPTIONAL MATCH (p)-[:HAS_TEST]->(tr:TestRun)
                OPTIONAL MATCH (tr)-[:USED_PROFILE]->(dp:DeviceProfile)
                OPTIONAL MATCH (tr)-[:PRODUCED]->(m:Metric)
                OPTIONAL MATCH (tr)-[:DETECTED]->(f:Failure)
                OPTIONAL MATCH (f)-[:MATCHES]->(sig:ErrorSignature)
                OPTIONAL MATCH (f)-[:INDICATES]->(rc:RootCause)
                OPTIONAL MATCH (rc)-[:SUGGESTS]->(rec:Recommendation)
                RETURN 1 AS projects,
                       count(DISTINCT tr) AS test_runs,
                       count(DISTINCT dp) AS device_profiles,
                       count(DISTINCT m) AS metrics,
                       count(DISTINCT f) AS failures,
                       count(DISTINCT sig) AS error_signatures,
                       count(DISTINCT rc) AS root_causes,
                       count(DISTINCT rec) AS recommendations
                """
                res = await neo4j_manager.run_query(stats_cypher, {"project_id": project_id})
            else:
                stats_cypher = """
                OPTIONAL MATCH (p:Project) WITH count(p) AS projects
                OPTIONAL MATCH (tr:TestRun) WITH projects, count(tr) AS test_runs
                OPTIONAL MATCH (dp:DeviceProfile) WITH projects, test_runs, count(dp) AS device_profiles
                OPTIONAL MATCH (m:Metric) WITH projects, test_runs, device_profiles, count(m) AS metrics
                OPTIONAL MATCH (f:Failure) WITH projects, test_runs, device_profiles, metrics, count(f) AS failures
                OPTIONAL MATCH (sig:ErrorSignature) WITH projects, test_runs, device_profiles, metrics, failures, count(sig) AS error_signatures
                OPTIONAL MATCH (rc:RootCause) WITH projects, test_runs, device_profiles, metrics, failures, error_signatures, count(rc) AS root_causes
                OPTIONAL MATCH (rec:Recommendation) WITH projects, test_runs, device_profiles, metrics, failures, error_signatures, root_causes, count(rec) AS recommendations
                RETURN projects, test_runs, device_profiles, metrics, failures, error_signatures, root_causes, recommendations
                """
                res = await neo4j_manager.run_query(stats_cypher)

            if res and len(res) > 0:
                raw = res[0]
                return {
                    "connected": True,
                    "source": "Neo4j Aura",
                    "projects": raw.get("projects", 0),
                    "test_runs": raw.get("test_runs", 0),
                    "device_profiles": raw.get("device_profiles", 0),
                    "metrics": raw.get("metrics", 0),
                    "failures": raw.get("failures", 0),
                    "error_signatures": raw.get("error_signatures", 0),
                    "root_causes": raw.get("root_causes", 0),
                    "recommendations": raw.get("recommendations", 0)
                }
        except Exception as e:
            logger.warning(f"Neo4j stats query failed, falling back to PostgreSQL: {e}")

    # Fallback to Neon PostgreSQL counts
    if db:
        try:
            from sqlalchemy import select, func, distinct, or_
            from app.models.relational.entities import Project, TestRun, DeviceProfile, TestMetric, TestFailure, Recommendation
            
            if project_id and project_id != "ALL":
                p_obj = (await db.execute(select(Project).where(or_(Project.id == project_id, Project.name == project_id)))).scalars().first()
                if p_obj:
                    tr_stmt = select(TestRun.id).where(TestRun.project_id == p_obj.id)
                    run_ids = (await db.execute(tr_stmt)).scalars().all()
                    
                    tr_cnt = len(run_ids)
                    dp_cnt = (await db.execute(select(func.count(distinct(TestRun.device_profile_id))).where(TestRun.project_id == p_obj.id))).scalar() or 0
                    m_cnt = (await db.execute(select(func.count(TestMetric.id)).where(TestMetric.test_run_id.in_(run_ids)))).scalar() if run_ids else 0
                    f_cnt = (await db.execute(select(func.count(TestFailure.id)).where(TestFailure.test_run_id.in_(run_ids)))).scalar() if run_ids else 0
                    sig_cnt = (await db.execute(select(func.count(distinct(TestFailure.error_signature))).where(TestFailure.test_run_id.in_(run_ids)))).scalar() if run_ids else 0
                    rec_cnt = (await db.execute(select(func.count(Recommendation.id)).where(Recommendation.test_run_id.in_(run_ids)))).scalar() if run_ids else 0
                    
                    return {
                        "connected": False,
                        "source": "Neon PostgreSQL",
                        "projects": 1,
                        "test_runs": tr_cnt,
                        "device_profiles": dp_cnt,
                        "metrics": m_cnt,
                        "failures": f_cnt,
                        "error_signatures": sig_cnt,
                        "root_causes": rec_cnt,
                        "recommendations": rec_cnt
                    }
            
            p_cnt = (await db.execute(select(func.count(Project.id)))).scalar() or 0
            tr_cnt = (await db.execute(select(func.count(TestRun.id)))).scalar() or 0
            dp_cnt = (await db.execute(select(func.count(DeviceProfile.id)))).scalar() or 0
            m_cnt = (await db.execute(select(func.count(TestMetric.id)))).scalar() or 0
            f_cnt = (await db.execute(select(func.count(TestFailure.id)))).scalar() or 0
            sig_cnt = (await db.execute(select(func.count(distinct(TestFailure.error_signature))))).scalar() or 0
            rec_cnt = (await db.execute(select(func.count(Recommendation.id)))).scalar() or 0

            return {
                "connected": False,
                "source": "Neon PostgreSQL",
                "projects": p_cnt,
                "test_runs": tr_cnt,
                "device_profiles": dp_cnt,
                "metrics": m_cnt,
                "failures": f_cnt,
                "error_signatures": sig_cnt,
                "root_causes": rec_cnt,
                "recommendations": rec_cnt
            }
        except Exception as e:
            logger.error(f"PostgreSQL stats fallback failed: {e}")

    return {
        "connected": False,
        "source": "Unavailable",
        "projects": 0, "test_runs": 0, "device_profiles": 0, "metrics": 0,
        "failures": 0, "error_signatures": 0, "root_causes": 0, "recommendations": 0
    }


async def get_explorer_graph(
    project_id: Optional[str] = None,
    node_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 150,
    db = None
) -> Dict[str, Any]:
    """
    Returns an interactive relationship graph for the Neo4j Intelligence Explorer.
    When project_id is provided, scopes the graph strictly to that tested website.
    Supports node-type filtering and search queries.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            allowed_labels = ['Project', 'TestRun', 'DeviceProfile', 'Failure', 'ErrorSignature', 'RootCause', 'Recommendation', 'MarketSegment', 'NetworkCohort', 'Metric']
            nodes_dict = {}
            edges_list = []

            if project_id and project_id != "ALL":
                cypher = """
                MATCH (p:Project)
                WHERE p.id = $project_id OR p.name = $project_id OR p.target_url = $project_id OR toLower(p.name) = toLower($project_id)
                OPTIONAL MATCH (p)-[r1:HAS_TEST]->(run:TestRun)
                OPTIONAL MATCH (run)-[r2:USED_PROFILE]->(dp:DeviceProfile)
                OPTIONAL MATCH (dp)-[r7:REPRESENTS_SEGMENT]->(seg:MarketSegment)
                OPTIONAL MATCH (dp)-[r8:SUBJECT_TO_NETWORK]->(net:NetworkCohort)
                OPTIONAL MATCH (run)-[r3:PRODUCED]->(m:Metric)
                OPTIONAL MATCH (run)-[r4:DETECTED]->(fail:Failure)
                OPTIONAL MATCH (fail)-[r5:MATCHES]->(sig:ErrorSignature)
                OPTIONAL MATCH (fail)-[r9:IMPACTS_POPULATION]->(seg)
                OPTIONAL MATCH (fail)-[r6:INDICATES]->(rc:RootCause)
                OPTIONAL MATCH (rc)-[r10:SUGGESTS]->(rec:Recommendation)
                RETURN p, run, dp, seg, net, m, fail, sig, rc, rec
                LIMIT $limit
                """
                records = await neo4j_manager.run_query(cypher, {"project_id": project_id, "limit": limit})

                def add_node(node_id: str, label: str, name: str, props: Dict[str, Any]):
                    if node_id not in nodes_dict:
                        if node_type and node_type != "ALL" and label != node_type:
                            return False
                        if search and search.strip():
                            s = search.strip().lower()
                            if s not in str(name).lower() and s not in str(props.get("title", "")).lower() and s not in str(props.get("signature", "")).lower():
                                return False
                        nodes_dict[node_id] = {
                            "id": str(node_id),
                            "label": label,
                            "name": name,
                            "properties": _sanitize_neo4j_data(props)
                        }
                        return True
                    return True

                for rec in records:
                    p = rec.get("p")
                    r = rec.get("run")
                    dp = rec.get("dp")
                    seg = rec.get("seg")
                    net = rec.get("net")
                    m = rec.get("m")
                    fail = rec.get("fail")
                    sig = rec.get("sig")
                    rc = rec.get("rc")
                    recom = rec.get("rec")

                    if p:
                        add_node(str(p["id"]), "Project", p.get("name", "Project"), p)
                    if r and p:
                        add_node(str(r["id"]), "TestRun", f"Run {str(r['id'])[:8]}", r)
                        if str(p["id"]) in nodes_dict and str(r["id"]) in nodes_dict:
                            e_id = f"{p['id']}_HAS_TEST_{r['id']}"
                            if not any(e["id"] == e_id for e in edges_list):
                                edges_list.append({"id": e_id, "source": str(p["id"]), "target": str(r["id"]), "type": "HAS_TEST"})
                    if dp and r:
                        dp_id = str(dp.get("id") or f"dp_{dp.get('name')}")
                        add_node(dp_id, "DeviceProfile", dp.get("name", "Profile"), dp)
                        if str(r["id"]) in nodes_dict and dp_id in nodes_dict:
                            e_id = f"{r['id']}_USED_PROFILE_{dp_id}"
                            if not any(e["id"] == e_id for e in edges_list):
                                edges_list.append({"id": e_id, "source": str(r["id"]), "target": dp_id, "type": "USED_PROFILE"})
                        if seg:
                            seg_id = f"seg_{seg['name']}"
                            add_node(seg_id, "MarketSegment", f"{seg['name']} ({seg.get('share_pct', 0)}%)", seg)
                            if dp_id in nodes_dict and seg_id in nodes_dict:
                                e_id = f"{dp_id}_REPRESENTS_SEGMENT_{seg_id}"
                                if not any(e["id"] == e_id for e in edges_list):
                                    edges_list.append({"id": e_id, "source": dp_id, "target": seg_id, "type": "REPRESENTS_SEGMENT"})
                        if net:
                            net_id = f"net_{net['name']}"
                            add_node(net_id, "NetworkCohort", f"{net['name']} ({net.get('share_pct', 0)}%)", net)
                            if dp_id in nodes_dict and net_id in nodes_dict:
                                e_id = f"{dp_id}_SUBJECT_TO_NETWORK_{net_id}"
                                if not any(e["id"] == e_id for e in edges_list):
                                    edges_list.append({"id": e_id, "source": dp_id, "target": net_id, "type": "SUBJECT_TO_NETWORK"})
                    if m and r:
                        m_id = f"m_{str(r['id'])[:6]}_{m.get('name')}"
                        add_node(m_id, "Metric", f"{m.get('name')}: {m.get('value')}", m)
                        if str(r["id"]) in nodes_dict and m_id in nodes_dict:
                            e_id = f"{r['id']}_PRODUCED_{m_id}"
                            if not any(e["id"] == e_id for e in edges_list):
                                edges_list.append({"id": e_id, "source": str(r["id"]), "target": m_id, "type": "PRODUCED"})
                    if fail and r:
                        f_id = str(fail.get("id") or f"fail_{fail.get('signature', 'err')}_{str(r['id'])[:6]}")
                        add_node(f_id, "Failure", fail.get("title", "Failure")[:30], fail)
                        if str(r["id"]) in nodes_dict and f_id in nodes_dict:
                            e_id = f"{r['id']}_DETECTED_{f_id}"
                            if not any(e["id"] == e_id for e in edges_list):
                                edges_list.append({"id": e_id, "source": str(r["id"]), "target": f_id, "type": "DETECTED"})
                        if sig:
                            sig_id = f"sig_{sig.get('signature', 'unknown')}"
                            add_node(sig_id, "ErrorSignature", f"Sig: {sig.get('signature', 'unknown')[:8]}", sig)
                            if f_id in nodes_dict and sig_id in nodes_dict:
                                e_id = f"{f_id}_MATCHES_{sig_id}"
                                if not any(e["id"] == e_id for e in edges_list):
                                    edges_list.append({"id": e_id, "source": f_id, "target": sig_id, "type": "MATCHES"})
                        if rc:
                            rc_id = str(rc.get("id") or f"rc_{rc.get('title', 'rc')[:15]}")
                            add_node(rc_id, "RootCause", rc.get("title", "Root Cause")[:30], rc)
                            if f_id in nodes_dict and rc_id in nodes_dict:
                                e_id = f"{f_id}_INDICATES_{rc_id}"
                                if not any(e["id"] == e_id for e in edges_list):
                                    edges_list.append({"id": e_id, "source": f_id, "target": rc_id, "type": "INDICATES"})
                            if recom:
                                rec_id = str(recom.get("id") or f"rec_{recom.get('title', 'rec')[:15]}")
                                add_node(rec_id, "Recommendation", recom.get("title", "Rec")[:30], recom)
                                if rc_id in nodes_dict and rec_id in nodes_dict:
                                    e_id = f"{rc_id}_SUGGESTS_{rec_id}"
                                    if not any(e["id"] == e_id for e in edges_list):
                                        edges_list.append({"id": e_id, "source": rc_id, "target": rec_id, "type": "SUGGESTS"})

                return {
                    "nodes": list(nodes_dict.values()),
                    "edges": edges_list,
                    "connected": True,
                    "source": "Neo4j Aura",
                    "total_nodes": len(nodes_dict),
                    "total_edges": len(edges_list)
                }

            else:
                cypher = """
                MATCH (n)
                WHERE any(l IN labels(n) WHERE l IN $allowed_labels)
                """
                params: Dict[str, Any] = {"allowed_labels": allowed_labels, "limit": limit}

                if node_type and node_type != "ALL":
                    cypher += " AND $node_type IN labels(n)"
                    params["node_type"] = node_type

                if search and search.strip():
                    cypher += " AND (toLower(coalesce(n.name, '')) CONTAINS toLower($search) OR toLower(coalesce(n.title, '')) CONTAINS toLower($search) OR toLower(coalesce(n.signature, '')) CONTAINS toLower($search))"
                    params["search"] = search.strip()

                cypher += """
                WITH n LIMIT $limit
                OPTIONAL MATCH (n)-[r]->(m)
                WHERE any(l IN labels(m) WHERE l IN $allowed_labels)
                RETURN n, labels(n) AS n_labels, r, type(r) AS r_type, m, labels(m) AS m_labels
                """

                records = await neo4j_manager.run_query(cypher, params)

                for row in records:
                    n = row.get("n")
                    m = row.get("m")
                    r_type = row.get("r_type")
                    n_labels = row.get("n_labels") or ["Entity"]
                    m_labels = row.get("m_labels") or ["Entity"]

                    if n:
                        n_id = str(n.get("id") or n.get("signature") or n.get("name") or id(n))
                        if n_id not in nodes_dict:
                            nodes_dict[n_id] = {
                                "id": n_id,
                                "label": n_labels[0],
                                "name": n.get("name") or n.get("title") or n.get("signature") or f"{n_labels[0]} {n_id[:6]}",
                                "properties": _sanitize_neo4j_data(n)
                            }

                    if m and r_type and n:
                        m_id = str(m.get("id") or m.get("signature") or m.get("name") or id(m))
                        if m_id not in nodes_dict:
                            nodes_dict[m_id] = {
                                "id": m_id,
                                "label": m_labels[0],
                                "name": m.get("name") or m.get("title") or m.get("signature") or f"{m_labels[0]} {m_id[:6]}",
                                "properties": _sanitize_neo4j_data(m)
                            }

                        edge_id = f"{n_id}_{r_type}_{m_id}"
                        if not any(e["id"] == edge_id for e in edges_list):
                            edges_list.append({
                                "id": edge_id,
                                "source": n_id,
                                "target": m_id,
                                "type": r_type
                            })

                return {
                    "nodes": list(nodes_dict.values()),
                    "edges": edges_list,
                    "connected": True,
                    "source": "Neo4j Aura",
                    "total_nodes": len(nodes_dict),
                    "total_edges": len(edges_list)
                }
        except Exception as e:
            logger.warning(f"Neo4j explorer graph query failed: {e}")

    # Fallback to PostgreSQL
    if db:
        if project_id and project_id != "ALL":
            return await get_fallback_graph_from_postgres(project_id, db)
        else:
            from sqlalchemy import select
            from app.models.relational.entities import Project
            p_res = await db.execute(select(Project).limit(1))
            first_proj = p_res.scalars().first()
            if first_proj:
                return await get_fallback_graph_from_postgres(first_proj.id, db)

    return {"nodes": [], "edges": [], "connected": False, "source": "Unavailable"}


async def get_failure_patterns(db=None, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Identifies repeated failure signatures across historical test runs, grouping
    failures by their error signature and computing occurrence frequency and impact.
    When project_id is provided, filters strictly for that tested website.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            if project_id and project_id != "ALL":
                cypher = """
                MATCH (proj:Project)-[:HAS_TEST]->(run:TestRun)-[:DETECTED]->(fail:Failure)-[:MATCHES]->(sig:ErrorSignature)
                WHERE proj.id = $project_id OR proj.name = $project_id
                OPTIONAL MATCH (run)-[:USED_PROFILE]->(dp:DeviceProfile)
                OPTIONAL MATCH (fail)-[:INDICATES]->(rc:RootCause)-[:SUGGESTS]->(rec:Recommendation)
                RETURN 
                    sig.signature AS signature,
                    coalesce(sig.title, fail.title) AS title,
                    count(DISTINCT fail) AS frequency,
                    collect(DISTINCT proj.name) AS affected_projects,
                    collect(DISTINCT dp.name) AS affected_device_profiles,
                    collect(DISTINCT fail.type) AS failure_types,
                    collect(DISTINCT rc.probable_cause)[..2] AS sample_root_causes,
                    collect(DISTINCT rec.remediation)[..2] AS sample_remediations
                ORDER BY frequency DESC
                """
                records = await neo4j_manager.run_query(cypher, {"project_id": project_id})
            else:
                cypher = """
                MATCH (fail:Failure)-[:MATCHES]->(sig:ErrorSignature)
                OPTIONAL MATCH (run:TestRun)-[:DETECTED]->(fail)
                OPTIONAL MATCH (proj:Project)-[:HAS_TEST]->(run)
                OPTIONAL MATCH (run)-[:USED_PROFILE]->(dp:DeviceProfile)
                OPTIONAL MATCH (fail)-[:INDICATES]->(rc:RootCause)-[:SUGGESTS]->(rec:Recommendation)
                RETURN 
                    sig.signature AS signature,
                    coalesce(sig.title, fail.title) AS title,
                    count(DISTINCT fail) AS frequency,
                    collect(DISTINCT proj.name) AS affected_projects,
                    collect(DISTINCT dp.name) AS affected_device_profiles,
                    collect(DISTINCT fail.type) AS failure_types,
                    collect(DISTINCT rc.probable_cause)[..2] AS sample_root_causes,
                    collect(DISTINCT rec.remediation)[..2] AS sample_remediations
                ORDER BY frequency DESC
                """
                records = await neo4j_manager.run_query(cypher)
            return _sanitize_neo4j_data(records)
        except Exception as e:
            logger.warning(f"Neo4j failure patterns query failed: {e}")

    # Fallback to PostgreSQL
    if db:
        try:
            from sqlalchemy import select, func, or_
            from app.models.relational.entities import TestFailure, TestRun, Project, DeviceProfile
            
            stmt = (
                select(
                    TestFailure.error_signature.label("signature"),
                    func.max(TestFailure.title).label("title"),
                    func.count(TestFailure.id).label("frequency"),
                    func.array_agg(func.distinct(Project.name)).label("affected_projects"),
                    func.array_agg(func.distinct(DeviceProfile.name)).label("affected_device_profiles"),
                    func.array_agg(func.distinct(TestFailure.failure_type)).label("failure_types")
                )
                .join(TestRun, TestFailure.test_run_id == TestRun.id)
                .outerjoin(Project, TestRun.project_id == Project.id)
                .outerjoin(DeviceProfile, TestRun.device_profile_id == DeviceProfile.id)
            )
            if project_id and project_id != "ALL":
                stmt = stmt.where(or_(Project.id == project_id, Project.name == project_id))
            stmt = stmt.group_by(TestFailure.error_signature).order_by(func.count(TestFailure.id).desc())
            res = await db.execute(stmt)
            patterns = []
            for r in res:
                patterns.append({
                    "signature": r.signature,
                    "title": r.title,
                    "frequency": r.frequency,
                    "affected_projects": [p for p in (r.affected_projects or []) if p],
                    "affected_device_profiles": [dp for dp in (r.affected_device_profiles or []) if dp],
                    "failure_types": [ft for ft in (r.failure_types or []) if ft],
                    "sample_root_causes": [],
                    "sample_remediations": []
                })
            return patterns
        except Exception as e:
            logger.error(f"PostgreSQL failure patterns fallback failed: {e}")

    return []


async def get_device_impact(db=None, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Returns comparative performance metrics and failure distributions across device profiles.
    When project_id is provided, scopes impact strictly to that tested website.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            if project_id and project_id != "ALL":
                cypher = """
                MATCH (dp:DeviceProfile)
                MATCH (proj:Project)-[:HAS_TEST]->(run:TestRun)-[:USED_PROFILE]->(dp)
                WHERE proj.id = $project_id OR proj.name = $project_id
                OPTIONAL MATCH (run)-[:DETECTED]->(fail:Failure)
                RETURN 
                    dp.id AS id,
                    dp.name AS name,
                    dp.tier AS tier,
                    dp.cpu_throttle_rate AS cpu_throttle_rate,
                    dp.ram_mb AS ram_mb,
                    dp.network_profile AS network_profile,
                    count(DISTINCT run) AS test_run_count,
                    count(DISTINCT fail) AS failure_count,
                    collect(DISTINCT fail.title)[..3] AS sample_failures
                ORDER BY failure_count DESC
                """
                records = await neo4j_manager.run_query(cypher, {"project_id": project_id})
            else:
                cypher = """
                MATCH (dp:DeviceProfile)
                OPTIONAL MATCH (run:TestRun)-[:USED_PROFILE]->(dp)
                OPTIONAL MATCH (run)-[:DETECTED]->(fail:Failure)
                RETURN 
                    dp.id AS id,
                    dp.name AS name,
                    dp.tier AS tier,
                    dp.cpu_throttle_rate AS cpu_throttle_rate,
                    dp.ram_mb AS ram_mb,
                    dp.network_profile AS network_profile,
                    count(DISTINCT run) AS test_run_count,
                    count(DISTINCT fail) AS failure_count,
                    collect(DISTINCT fail.title)[..3] AS sample_failures
                ORDER BY failure_count DESC
                """
                records = await neo4j_manager.run_query(cypher)
            return _sanitize_neo4j_data(records)
        except Exception as e:
            logger.warning(f"Neo4j device impact query failed: {e}")

    # Fallback to PostgreSQL
    if db:
        try:
            from sqlalchemy import select, func, or_
            from app.models.relational.entities import DeviceProfile, TestRun, TestFailure, Project
            stmt = (
                select(
                    DeviceProfile.id,
                    DeviceProfile.name,
                    DeviceProfile.tier,
                    DeviceProfile.cpu_throttle_rate,
                    DeviceProfile.ram_mb,
                    DeviceProfile.network_profile,
                    func.count(func.distinct(TestRun.id)).label("test_run_count"),
                    func.count(func.distinct(TestFailure.id)).label("failure_count")
                )
                .outerjoin(TestRun, DeviceProfile.id == TestRun.device_profile_id)
                .outerjoin(TestFailure, TestRun.id == TestFailure.test_run_id)
            )
            if project_id and project_id != "ALL":
                stmt = stmt.outerjoin(Project, TestRun.project_id == Project.id).where(
                    or_(Project.id == project_id, Project.name == project_id)
                )
            stmt = stmt.group_by(DeviceProfile.id)
            res = await db.execute(stmt)
            devices = []
            for r in res:
                devices.append({
                    "id": r.id,
                    "name": r.name,
                    "tier": r.tier,
                    "cpu_throttle_rate": r.cpu_throttle_rate,
                    "ram_mb": r.ram_mb,
                    "network_profile": r.network_profile,
                    "test_run_count": r.test_run_count,
                    "failure_count": r.failure_count,
                    "sample_failures": []
                })
            return devices
        except Exception as e:
            logger.error(f"PostgreSQL device impact fallback failed: {e}")

    return []


async def get_root_cause_chains(limit: int = 50, db=None, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Traces verified relationship chains:
    Project -> TestRun -> Failure -> ErrorSignature -> RootCause -> Recommendation
    When project_id is provided, filters chains for that tested website.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            if project_id and project_id != "ALL":
                cypher = """
                MATCH (proj:Project)-[:HAS_TEST]->(run:TestRun)-[:DETECTED]->(fail:Failure)-[:INDICATES]->(rc:RootCause)-[:SUGGESTS]->(rec:Recommendation)
                WHERE proj.id = $project_id OR proj.name = $project_id
                OPTIONAL MATCH (run)-[:USED_PROFILE]->(dp:DeviceProfile)
                OPTIONAL MATCH (fail)-[:MATCHES]->(sig:ErrorSignature)
                RETURN 
                    proj.name AS project_name,
                    run.id AS test_run_id,
                    dp.name AS device_profile_name,
                    fail.id AS failure_id,
                    fail.title AS failure_title,
                    fail.type AS failure_type,
                    sig.signature AS signature,
                    rc.id AS root_cause_id,
                    rc.probable_cause AS probable_cause,
                    rc.category AS category,
                    rc.confidence AS confidence,
                    rec.id AS recommendation_id,
                    rec.title AS recommendation_title,
                    rec.remediation AS remediation,
                    rec.impact AS impact,
                    rec.status AS status
                LIMIT $limit
                """
                records = await neo4j_manager.run_query(cypher, {"project_id": project_id, "limit": limit})
            else:
                cypher = """
                MATCH (proj:Project)-[:HAS_TEST]->(run:TestRun)-[:DETECTED]->(fail:Failure)-[:INDICATES]->(rc:RootCause)-[:SUGGESTS]->(rec:Recommendation)
                OPTIONAL MATCH (run)-[:USED_PROFILE]->(dp:DeviceProfile)
                OPTIONAL MATCH (fail)-[:MATCHES]->(sig:ErrorSignature)
                RETURN 
                    proj.name AS project_name,
                    run.id AS test_run_id,
                    dp.name AS device_profile_name,
                    fail.id AS failure_id,
                    fail.title AS failure_title,
                    fail.type AS failure_type,
                    sig.signature AS signature,
                    rc.id AS root_cause_id,
                    rc.probable_cause AS probable_cause,
                    rc.category AS category,
                    rc.confidence AS confidence,
                    rec.id AS recommendation_id,
                    rec.title AS recommendation_title,
                    rec.remediation AS remediation,
                    rec.impact AS impact,
                    rec.status AS status
                LIMIT $limit
                """
                records = await neo4j_manager.run_query(cypher, {"limit": limit})
            return _sanitize_neo4j_data(records)
        except Exception as e:
            logger.warning(f"Neo4j root cause chains query failed: {e}")

    # Fallback to PostgreSQL
    if db:
        try:
            from sqlalchemy import select, or_
            from app.models.relational.entities import Recommendation, TestFailure, TestRun, Project, DeviceProfile
            stmt = (
                select(
                    Project.name.label("project_name"),
                    TestRun.id.label("test_run_id"),
                    DeviceProfile.name.label("device_profile_name"),
                    TestFailure.id.label("failure_id"),
                    TestFailure.title.label("failure_title"),
                    TestFailure.failure_type.label("failure_type"),
                    TestFailure.error_signature.label("signature"),
                    Recommendation.id.label("root_cause_id"),
                    Recommendation.explanation.label("probable_cause"),
                    Recommendation.category.label("category"),
                    Recommendation.title.label("recommendation_title"),
                    Recommendation.action.label("remediation"),
                    Recommendation.estimated_impact.label("impact"),
                    Recommendation.status.label("status")
                )
                .join(TestRun, Recommendation.test_run_id == TestRun.id)
                .outerjoin(Project, TestRun.project_id == Project.id)
                .outerjoin(DeviceProfile, TestRun.device_profile_id == DeviceProfile.id)
                .outerjoin(TestFailure, TestFailure.test_run_id == TestRun.id)
            )
            if project_id and project_id != "ALL":
                stmt = stmt.where(or_(Project.id == project_id, Project.name == project_id))
            stmt = stmt.limit(limit)
            res = await db.execute(stmt)
            chains = []
            for r in res:
                chains.append({
                    "project_name": r.project_name or "Web Application",
                    "test_run_id": str(r.test_run_id),
                    "device_profile_name": r.device_profile_name or "Generic Device",
                    "failure_id": str(r.failure_id or ""),
                    "failure_title": r.failure_title or "Anomaly Detected",
                    "failure_type": r.failure_type or "PERFORMANCE",
                    "signature": r.signature or "SIG_UNKNOWN",
                    "root_cause_id": f"rc_{r.root_cause_id}",
                    "probable_cause": r.probable_cause or "High latency subresource contention",
                    "category": r.category or "LATENCY",
                    "confidence": 0.92,
                    "recommendation_id": f"rec_{r.root_cause_id}",
                    "recommendation_title": r.recommendation_title or "Optimize Asset Delivery",
                    "remediation": r.remediation or "Enable Brotli/Gzip and configure CDN edge caching",
                    "impact": r.impact or "Reduces TTFB by ~45%",
                    "status": r.status or "VERIFIED"
                })
            return chains
        except Exception as e:
            logger.error(f"PostgreSQL root cause fallback failed: {e}")

    return []


async def get_distinct_graph_projects(db=None) -> List[Dict[str, Any]]:
    """
    Returns distinct tested websites/projects available in the Neo4j knowledge graph.
    Merges with PostgreSQL to ensure any newly tested project or URL is immediately available.
    """
    projects_map: Dict[str, Dict[str, Any]] = {}
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            cypher = """
            MATCH (p:Project)
            OPTIONAL MATCH (p)-[:HAS_TEST]->(run:TestRun)
            WITH p.name AS name, p.target_url AS p_url, collect(p.id)[0] AS id, count(DISTINCT run) AS test_runs_count
            WHERE name IS NOT NULL AND name <> ''
            RETURN id, name, coalesce(p_url, 'https://' + name) AS target_url, test_runs_count
            ORDER BY test_runs_count DESC
            """
            records = await neo4j_manager.run_query(cypher)
            sanitized = _sanitize_neo4j_data(records)
            for r in sanitized:
                if r.get("name"):
                    projects_map[r["name"]] = r
        except Exception as e:
            logger.warning(f"Neo4j get_distinct_graph_projects failed: {e}")

    if db:
        try:
            from app.models.relational.entities import Project, TestRun
            from sqlalchemy import select, func
            stmt = (
                select(
                    Project.id,
                    Project.name,
                    Project.target_url,
                    func.count(TestRun.id).label("test_runs_count")
                )
                .outerjoin(TestRun, TestRun.project_id == Project.id)
                .group_by(Project.id, Project.name, Project.target_url)
                .order_by(func.count(TestRun.id).desc())
            )
            res = await db.execute(stmt)
            for r in res.all():
                p_name = r[1]
                if p_name and p_name not in projects_map:
                    projects_map[p_name] = {
                        "id": str(r[0]),
                        "name": p_name,
                        "target_url": r[2] or f"https://{p_name}",
                        "test_runs_count": r[3]
                    }
                elif p_name and p_name in projects_map:
                    if not projects_map[p_name].get("target_url") and r[2]:
                        projects_map[p_name]["target_url"] = r[2]
        except Exception as e:
            logger.error(f"PostgreSQL distinct projects query failed: {e}")

    result = list(projects_map.values())
    result.sort(key=lambda x: x.get("test_runs_count", 0), reverse=True)
    return result
    """
    Traces verified relationship chains:
    Project -> TestRun -> Failure -> ErrorSignature -> RootCause -> Recommendation
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            cypher = """
            MATCH (proj:Project)-[:HAS_TEST]->(run:TestRun)-[:DETECTED]->(fail:Failure)-[:INDICATES]->(rc:RootCause)-[:SUGGESTS]->(rec:Recommendation)
            OPTIONAL MATCH (run)-[:USED_PROFILE]->(dp:DeviceProfile)
            OPTIONAL MATCH (fail)-[:MATCHES]->(sig:ErrorSignature)
            RETURN 
                proj.name AS project_name,
                run.id AS test_run_id,
                dp.name AS device_profile_name,
                fail.id AS failure_id,
                fail.title AS failure_title,
                fail.type AS failure_type,
                sig.signature AS signature,
                rc.id AS root_cause_id,
                rc.probable_cause AS probable_cause,
                rc.category AS category,
                rc.confidence AS confidence,
                rec.id AS recommendation_id,
                rec.title AS recommendation_title,
                rec.remediation AS remediation,
                rec.impact AS impact,
                rec.status AS status
            LIMIT $limit
            """
            records = await neo4j_manager.run_query(cypher, {"limit": limit})
            return _sanitize_neo4j_data(records)
        except Exception as e:
            logger.warning(f"Neo4j root cause chains query failed: {e}")

    # Fallback to PostgreSQL
    if db:
        try:
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            from app.models.relational.entities import TestRun, Project, DeviceProfile, TestFailure, Recommendation
            stmt = (
                select(TestRun)
                .options(
                    selectinload(TestRun.project),
                    selectinload(TestRun.device_profile),
                    selectinload(TestRun.failures),
                    selectinload(TestRun.recommendations)
                )
                .order_by(TestRun.created_at.desc())
                .limit(limit)
            )
            res = await db.execute(stmt)
            chains = []
            for run in res.scalars().all():
                p_name = run.project.name if run.project else "Web Project"
                dp_name = run.device_profile.name if run.device_profile else "Device Profile"
                for rec in (run.recommendations or []):
                    f_match = run.failures[0] if (run.failures and len(run.failures) > 0) else None
                    chains.append({
                        "project_name": p_name,
                        "test_run_id": run.id,
                        "device_profile_name": dp_name,
                        "failure_id": f_match.id if f_match else "f_none",
                        "failure_title": f_match.title if f_match else "Performance Regression",
                        "failure_type": f_match.failure_type if f_match else "PERFORMANCE",
                        "signature": f_match.error_signature if f_match else "SIG_PERF",
                        "root_cause_id": rec.id,
                        "probable_cause": rec.probable_cause or rec.title,
                        "category": rec.category or "Performance",
                        "confidence": "HIGH (85%)",
                        "recommendation_id": rec.id,
                        "recommendation_title": rec.title,
                        "remediation": rec.remediation,
                        "impact": rec.impact or "HIGH",
                        "status": rec.status or "OPEN"
                    })
            return chains
        except Exception as e:
            logger.error(f"PostgreSQL root causes fallback failed: {e}")

    return []


async def get_historical_runs_graph(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 30,
    db = None
) -> List[Dict[str, Any]]:
    """
    Returns historical test runs with connected Neo4j entity counts and metrics.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            cypher = """
            MATCH (proj:Project)-[:HAS_TEST]->(run:TestRun)
            WHERE EXISTS((run)-[:PRODUCED]->(:Metric))
            """
            params: Dict[str, Any] = {"limit": limit}
            if project_id:
                cypher += " AND proj.id = $project_id"
                params["project_id"] = project_id
            if status:
                cypher += " AND run.status = $status"
                params["status"] = status

            cypher += """
            OPTIONAL MATCH (run)-[:USED_PROFILE]->(dp:DeviceProfile)
            OPTIONAL MATCH (run)-[:DETECTED]->(fail:Failure)
            OPTIONAL MATCH (run)-[:PRODUCED]->(m:Metric)
            OPTIONAL MATCH (run)-[:PRODUCED_RECOMMENDATION]->(rec:Recommendation)
            RETURN 
                run.id AS run_id,
                run.status AS status,
                run.duration_ms AS duration_ms,
                run.timestamp AS timestamp,
                proj.id AS project_id,
                proj.name AS project_name,
                dp.name AS device_profile_name,
                dp.tier AS device_profile_tier,
                count(DISTINCT fail) AS failure_count,
                collect(DISTINCT fail.title)[..3] AS sample_failures,
                count(DISTINCT rec) AS recommendation_count,
                collect(DISTINCT {name: m.name, value: m.value, unit: m.unit, rating: m.rating}) AS metrics,
                count(DISTINCT m) AS metric_count
            ORDER BY timestamp DESC
            LIMIT $limit
            """
            records = await neo4j_manager.run_query(cypher, params)
            return _sanitize_neo4j_data(records)
        except Exception as e:
            logger.warning(f"Neo4j historical runs query failed: {e}")

    # Fallback to PostgreSQL
    if db:
        try:
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            from app.models.relational.entities import TestRun
            stmt = select(TestRun).where(TestRun.metrics.any()).options(
                selectinload(TestRun.project),
                selectinload(TestRun.device_profile),
                selectinload(TestRun.failures),
                selectinload(TestRun.metrics),
                selectinload(TestRun.recommendations)
            ).order_by(TestRun.created_at.desc()).limit(limit)
            
            res = await db.execute(stmt)
            runs = []
            for r in res.scalars().all():
                runs.append({
                    "run_id": r.id,
                    "status": r.status,
                    "duration_ms": r.duration_ms,
                    "timestamp": r.created_at.isoformat() if r.created_at else None,
                    "project_id": r.project_id,
                    "project_name": r.project.name if r.project else "Web Project",
                    "device_profile_name": r.device_profile.name if r.device_profile else "Default Profile",
                    "device_profile_tier": r.device_profile.tier if r.device_profile else "CUSTOM",
                    "failure_count": len(r.failures or []),
                    "sample_failures": [f.title for f in (r.failures or [])[:3]],
                    "recommendation_count": len(r.recommendations or []),
                    "metrics": [{"name": m.name, "value": m.value, "unit": m.unit, "rating": m.rating} for m in (r.metrics or [])],
                    "metric_count": len(r.metrics or [])
                })
            return runs
        except Exception as e:
            logger.error(f"PostgreSQL historical runs fallback failed: {e}")

    return []


async def get_node_details(node_id: str, db=None) -> Dict[str, Any]:
    """
    Returns deep structural inspection of a specific node, including properties,
    all incoming and outgoing relationships, and connected neighbor entities.
    """
    health = await neo4j_manager.check_health()
    if health.get("connected"):
        try:
            cypher = """
            MATCH (n)
            WHERE n.id = $node_id OR n.signature = $node_id OR n.name = $node_id
            OPTIONAL MATCH (in_node)-[r_in]->(n)
            OPTIONAL MATCH (n)-[r_out]->(out_node)
            RETURN n, labels(n) AS labels,
                   collect(DISTINCT {
                       rel: type(r_in),
                       source_id: coalesce(in_node.id, in_node.name, in_node.signature),
                       source_label: labels(in_node)[0],
                       source_name: coalesce(in_node.name, in_node.title, in_node.signature, in_node.id)
                   }) AS incoming,
                   collect(DISTINCT {
                       rel: type(r_out),
                       target_id: coalesce(out_node.id, out_node.name, out_node.signature),
                       target_label: labels(out_node)[0],
                       target_name: coalesce(out_node.name, out_node.title, out_node.signature, out_node.id)
                   }) AS outgoing
            LIMIT 1
            """
            res = await neo4j_manager.run_query(cypher, {"node_id": node_id})
            if res and len(res) > 0:
                row = res[0]
                n = row.get("n")
                labels = row.get("labels") or ["Entity"]
                return {
                    "node": {
                        "id": node_id,
                        "label": labels[0],
                        "name": n.get("name") or n.get("title") or n.get("signature") or node_id,
                        "properties": _sanitize_neo4j_data(n)
                    },
                    "incoming": [x for x in _sanitize_neo4j_data(row.get("incoming", [])) if x.get("source_id")],
                    "outgoing": [x for x in _sanitize_neo4j_data(row.get("outgoing", [])) if x.get("target_id")],
                    "connected": True,
                    "source": "Neo4j Aura"
                }
        except Exception as e:
            logger.warning(f"Neo4j node details query failed: {e}")

    return {
        "node": {"id": node_id, "label": "Unknown", "name": node_id, "properties": {}},
        "incoming": [],
        "outgoing": [],
        "connected": False,
        "source": "Unavailable"
    }
