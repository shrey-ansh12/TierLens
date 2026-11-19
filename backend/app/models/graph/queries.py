import logging
from typing import Dict, Any, List, Optional
from app.core.neo4j_client import neo4j_manager

logger = logging.getLogger(__name__)

async def sync_run_to_neo4j(
    workspace_name: str,
    project_id: str,
    project_name: str,
    run_id: str,
    tier: str,
    status: str,
    metrics: List[Dict[str, Any]],
    failures: List[Dict[str, Any]],
    recommendations: List[Dict[str, Any]]
) -> bool:
    """
    Persists test run nodes and meaningful relationships to Neo4j graph.
    Returns True on success, False if Neo4j is disconnected.
    """
    health = await neo4j_manager.check_health()
    if not health.get("connected"):
        logger.info("Neo4j is currently disconnected; graph sync deferred.")
        return False

    cypher = """
    MERGE (ws:Workspace {name: $ws_name})
    MERGE (app:Application {id: $project_id})
      ON CREATE SET app.name = $project_name
    MERGE (ws)-[:CONTAINS]->(app)

    MERGE (profile:DeviceProfile {name: $tier})
      ON CREATE SET profile.tier = $tier

    CREATE (run:TestRun {
        id: $run_id,
        status: $status,
        timestamp: datetime()
    })
    CREATE (app)-[:EXECUTED_TEST]->(run)
    CREATE (run)-[:EXECUTED_ON]->(profile)

    WITH run
    UNWIND $metrics AS m
    CREATE (met:Metric {
        name: m.name,
        value: m.value,
        unit: m.unit,
        rating: m.rating
    })
    CREATE (run)-[:HAS_METRIC]->(met)

    WITH run
    UNWIND $failures AS f
    CREATE (fail:Failure {
        title: f.title,
        type: f.failure_type,
        signature: f.error_signature
    })
    CREATE (run)-[:PRODUCED_FAILURE]->(fail)

    MERGE (sig:ErrorSignature {signature: f.error_signature})
      ON CREATE SET sig.title = f.title, sig.first_seen = datetime()
    CREATE (fail)-[:MATCHES_ERROR_SIGNATURE]->(sig)

    WITH run
    UNWIND $recommendations AS r
    CREATE (rec:Recommendation {
        title: r.title,
        impact: r.impact,
        probable_cause: r.probable_cause
    })
    CREATE (run)-[:RECOMMENDS]->(rec)
    """

    params = {
        "ws_name": workspace_name,
        "project_id": project_id,
        "project_name": project_name,
        "run_id": run_id,
        "tier": tier,
        "status": status,
        "metrics": metrics,
        "failures": failures,
        "recommendations": recommendations
    }

    try:
        await neo4j_manager.run_query(cypher, params)
        logger.info(f"Successfully synced run {run_id} to Neo4j graph.")
        return True
    except Exception as e:
        logger.error(f"Failed to sync run to Neo4j: {e}")
        return False


async def get_project_graph(project_id: str) -> Dict[str, Any]:
    """
    Fetches actual Neo4j graph nodes and edges for the specified project.
    Strict Real Data Policy: If Neo4j is offline, returns connected: False without fake data.
    """
    health = await neo4j_manager.check_health()
    if not health.get("connected"):
        return {
            "nodes": [],
            "edges": [],
            "connected": False,
            "error": "Neo4j is disconnected. Please start Neo4j container to explore live graph intelligence.",
            "is_synthetic": False
        }

    cypher = """
    MATCH (app:Application {id: $project_id})-[r1:EXECUTED_TEST]->(run:TestRun)
    OPTIONAL MATCH (run)-[r2:EXECUTED_ON]->(dp:DeviceProfile)
    OPTIONAL MATCH (run)-[r3:PRODUCED_FAILURE]->(fail:Failure)-[r4:MATCHES_ERROR_SIGNATURE]->(sig:ErrorSignature)
    OPTIONAL MATCH (run)-[r5:HAS_METRIC]->(m:Metric)
    OPTIONAL MATCH (run)-[r6:RECOMMENDS]->(rec:Recommendation)
    RETURN app, run, dp, fail, sig, m, rec LIMIT 150
    """

    try:
        records = await neo4j_manager.run_query(cypher, {"project_id": project_id})
        nodes_dict = {}
        edges_list = []

        def add_node(node_id: str, label: str, name: str, props: Dict[str, Any]):
            if node_id not in nodes_dict:
                nodes_dict[node_id] = {
                    "id": node_id,
                    "label": label,
                    "name": name,
                    "properties": props
                }

        for rec in records:
            if rec.get("app"):
                a = rec["app"]
                add_node(a["id"], "Application", a.get("name", "App"), a)
            if rec.get("run"):
                r = rec["run"]
                add_node(r["id"], "TestRun", f"Run {r['id'][:8]}", r)
                edges_list.append({
                    "id": f"{rec['app']['id']}_{r['id']}",
                    "source": rec["app"]["id"],
                    "target": r["id"],
                    "type": "EXECUTED_TEST"
                })
            if rec.get("dp") and rec.get("run"):
                dp = rec["dp"]
                dp_id = f"dp_{dp['name']}"
                add_node(dp_id, "DeviceProfile", dp["name"], dp)
                edges_list.append({
                    "id": f"{rec['run']['id']}_{dp_id}",
                    "source": rec["run"]["id"],
                    "target": dp_id,
                    "type": "EXECUTED_ON"
                })
            if rec.get("fail") and rec.get("run"):
                f = rec["fail"]
                f_id = f"fail_{f.get('signature', 'err')}_{rec['run']['id'][:6]}"
                add_node(f_id, "Failure", f.get("title", "Failure")[:30], f)
                edges_list.append({
                    "id": f"{rec['run']['id']}_{f_id}",
                    "source": rec["run"]["id"],
                    "target": f_id,
                    "type": "PRODUCED_FAILURE"
                })
                if rec.get("sig"):
                    s = rec["sig"]
                    s_id = f"sig_{s['signature']}"
                    add_node(s_id, "ErrorSignature", f"Sig: {s['signature'][:8]}", s)
                    edges_list.append({
                        "id": f"{f_id}_{s_id}",
                        "source": f_id,
                        "target": s_id,
                        "type": "MATCHES_ERROR_SIGNATURE"
                    })
            if rec.get("rec") and rec.get("run"):
                rc = rec["rec"]
                rc_id = f"rec_{rc.get('title', 'rec')[:15]}_{rec['run']['id'][:6]}"
                add_node(rc_id, "Recommendation", rc.get("title", "Recommendation")[:30], rc)
                edges_list.append({
                    "id": f"{rec['run']['id']}_{rc_id}",
                    "source": rec["run"]["id"],
                    "target": rc_id,
                    "type": "RECOMMENDS"
                })

        return {
            "nodes": list(nodes_dict.values()),
            "edges": edges_list,
            "connected": True,
            "error": None,
            "is_synthetic": False
        }
    except Exception as e:
        logger.error(f"Error querying project graph: {e}")
        return {
            "nodes": [],
            "edges": [],
            "connected": False,
            "error": str(e),
            "is_synthetic": False
        }
