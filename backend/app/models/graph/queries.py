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
    Persists test run entities and relationships to Neo4j knowledge graph:
    (:Project) -[:HAS_TEST]-> (:TestRun)
    (:TestRun) -[:USED_PROFILE]-> (:DeviceProfile)
    (:TestRun) -[:PRODUCED]-> (:Metric)
    (:TestRun) -[:DETECTED]-> (:Failure)
    (:Failure) -[:MATCHES]-> (:ErrorSignature)
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

    MERGE (dp:DeviceProfile {id: $profile_id})
      ON CREATE SET
        dp.name = $profile_name,
        dp.device_type = $device_type,
        dp.cpu_cores = $cpu_cores,
        dp.cpu_throttle_rate = $cpu_throttle_rate,
        dp.network_profile = $network_profile,
        dp.ram_mb = $ram_mb,
        dp.storage_profile = $storage_profile

    CREATE (run:TestRun {
        id: $run_id,
        status: $status,
        duration_ms: $duration_ms,
        timestamp: datetime()
    })
    CREATE (proj)-[:HAS_TEST]->(run)
    CREATE (run)-[:USED_PROFILE]->(dp)

    WITH run
    UNWIND $metrics AS m
    CREATE (met:Metric {
        name: m.name,
        value: m.value,
        unit: m.unit,
        rating: m.rating,
        is_emulated: m.is_emulated
    })
    CREATE (run)-[:PRODUCED]->(met)

    WITH run
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

    profile_id = profile_data.get("id") or f"profile_{profile_data.get('name', 'custom').lower().replace(' ', '_')}"
    params = {
        "ws_name": workspace_name,
        "project_id": project_id,
        "project_name": project_name,
        "run_id": run_id,
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
        logger.info(f"Successfully synced run {run_id} to Neo4j knowledge graph.")
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
            "error": "Neo4j is disconnected. Start Neo4j server or container to explore live knowledge graph.",
            "is_synthetic": False
        }

    cypher = """
    MATCH (proj:Project {id: $project_id})-[r1:HAS_TEST]->(run:TestRun)
    OPTIONAL MATCH (run)-[r2:USED_PROFILE]->(dp:DeviceProfile)
    OPTIONAL MATCH (run)-[r3:PRODUCED]->(m:Metric)
    OPTIONAL MATCH (run)-[r4:DETECTED]->(fail:Failure)-[r5:MATCHES]->(sig:ErrorSignature)
    OPTIONAL MATCH (fail)-[r6:INDICATES]->(rc:RootCause)-[r7:SUGGESTS]->(rec:Recommendation)
    RETURN proj, run, dp, m, fail, sig, rc, rec LIMIT 200
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
                dp_id = dp.get("id") or f"dp_{dp['name']}"
                add_node(dp_id, "DeviceProfile", dp["name"], dp)
                edges_list.append({
                    "id": f"{r['id']}_{dp_id}",
                    "source": r["id"],
                    "target": dp_id,
                    "type": "USED_PROFILE"
                })

            if rec.get("m") and r:
                m = rec["m"]
                m_id = f"m_{r['id'][:8]}_{m['name']}"
                add_node(m_id, "Metric", f"{m['name']}: {m['value']} {m['unit']}", m)
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
                    s_id = f"sig_{s['signature']}"
                    add_node(s_id, "ErrorSignature", f"Sig: {s['signature'][:8]}", s)
                    edges_list.append({
                        "id": f"{f_id}_{s_id}",
                        "source": f_id,
                        "target": s_id,
                        "type": "MATCHES"
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
                        recomm = rec["rec"]
                        rec_id = recomm.get("id") or f"rec_{recomm.get('title', 'rec')[:15]}"
                        add_node(rec_id, "Recommendation", recomm.get("title", "Recommendation")[:30], recomm)
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
            "source": "Neo4j Knowledge Graph",
            "error": None,
            "is_synthetic": False
        }
    except Exception as e:
        logger.error(f"Error querying project graph from Neo4j: {e}")
        return {
            "nodes": [],
            "edges": [],
            "connected": False,
            "error": str(e),
            "is_synthetic": False
        }


async def get_relational_project_topology(project_id: str, db) -> Dict[str, Any]:
    """
    Constructs an authentic graph topology representation directly from PostgreSQL database records.
    Used for resilience when Neo4j is offline, guaranteeing zero fake data while maintaining
    full relationship exploration of actual persisted entities.
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
        "source": "PostgreSQL Entity Graph (Neo4j Offline)",
        "is_synthetic": False
    }
