import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
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
    duration_ms: int = 0
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
      ON CREATE SET proj.name = $project_name, proj.created_at = datetime()
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
        timestamp: datetime()
    })
    CREATE (proj)-[:HAS_TEST]->(run)
    CREATE (run)-[:USED_PROFILE]->(dp)

    WITH run, entrySeg, midSeg, congestedNet
    UNWIND $metrics AS m
    CREATE (met:Metric {
        name: m.name,
        value: m.value,
        unit: m.unit,
        rating: m.rating,
        is_emulated: m.is_emulated
    })
    CREATE (run)-[:PRODUCED]->(met)

    WITH run, entrySeg, midSeg, congestedNet
    UNWIND $failures AS f
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

    WITH run, fail, f
    UNWIND $recommendations AS r
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
    CREATE (fail)-[:INDICATES]->(rc)
    CREATE (rc)-[:SUGGESTS]->(rec)
    CREATE (run)-[:PRODUCED_RECOMMENDATION]->(rec)
    """

    tier = profile_data.get("tier", "ENTRY_LEVEL")
    profile_id = profile_data.get("id") or f"profile_{profile_data.get('name', 'custom').lower().replace(' ', '_')}"
    params = {
        "ws_name": workspace_name,
        "project_id": project_id,
        "project_name": project_name,
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
