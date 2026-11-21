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
    Persists test run nodes, metrics, failures, error signatures, and connects
    them to real-world Indian demographic cohorts (Sub-₹8k Budget & Congested Networks) in Neo4j.
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

    MERGE (entrySeg:MarketSegment {name: "Sub-₹8,000 Budget Devices"})
      ON CREATE SET entrySeg.share_pct = 38.5, entrySeg.active_users_millions = 190, entrySeg.description = "Entry-level smartphones (Redmi 9A, JioPhone, Poco C51)"
    MERGE (midSeg:MarketSegment {name: "₹12,000 - ₹20,000 Mid-Tier"})
      ON CREATE SET midSeg.share_pct = 36.0, midSeg.active_users_millions = 180, midSeg.description = "Mid-tier budget smartphones (Galaxy A14, Moto G)"
    MERGE (congestedNet:NetworkCohort {name: "Jio/Airtel Congested Tier-2/3"})
      ON CREATE SET congestedNet.share_pct = 61.0, congestedNet.active_users_millions = 310, congestedNet.description = "Tier-2/3 cell congestion with high packet latency"

    MERGE (profile:DeviceProfile {name: $tier})
      ON CREATE SET profile.tier = $tier

    FOREACH (_ IN CASE WHEN $tier = 'ENTRY_LEVEL' THEN [1] ELSE [] END |
      MERGE (profile)-[:REPRESENTS_SEGMENT]->(entrySeg)
      MERGE (profile)-[:SUBJECT_TO_NETWORK]->(congestedNet)
    )
    FOREACH (_ IN CASE WHEN $tier = 'GOOD_BUDGET' THEN [1] ELSE [] END |
      MERGE (profile)-[:REPRESENTS_SEGMENT]->(midSeg)
    )

    CREATE (run:TestRun {
        id: $run_id,
        status: $status,
        timestamp: datetime()
    })
    CREATE (app)-[:EXECUTED_TEST]->(run)
    CREATE (run)-[:EXECUTED_ON]->(profile)

    WITH run, entrySeg, midSeg, congestedNet
    UNWIND $metrics AS m
    CREATE (met:Metric {
        name: m.name,
        value: m.value,
        unit: m.unit,
        rating: m.rating
    })
    CREATE (run)-[:HAS_METRIC]->(met)

    WITH run, entrySeg, midSeg, congestedNet
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

    FOREACH (_ IN CASE WHEN $tier = 'ENTRY_LEVEL' THEN [1] ELSE [] END |
      MERGE (fail)-[:IMPACTS_POPULATION {estimated_users_millions: 190, population_pct: 38.5}]->(entrySeg)
      MERGE (fail)-[:AFFECTS_NETWORK_COHORT {estimated_users_millions: 310, population_pct: 61.0}]->(congestedNet)
    )
    FOREACH (_ IN CASE WHEN $tier = 'GOOD_BUDGET' THEN [1] ELSE [] END |
      MERGE (fail)-[:IMPACTS_POPULATION {estimated_users_millions: 180, population_pct: 36.0}]->(midSeg)
    )

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
        logger.info(f"Successfully synced run {run_id} and Indian demographics to Neo4j graph.")
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
    OPTIONAL MATCH (dp)-[r7:REPRESENTS_SEGMENT]->(seg:MarketSegment)
    OPTIONAL MATCH (dp)-[r8:SUBJECT_TO_NETWORK]->(net:NetworkCohort)
    OPTIONAL MATCH (run)-[r3:PRODUCED_FAILURE]->(fail:Failure)-[r4:MATCHES_ERROR_SIGNATURE]->(sig:ErrorSignature)
    OPTIONAL MATCH (fail)-[r9:IMPACTS_POPULATION]->(seg)
    OPTIONAL MATCH (run)-[r5:HAS_METRIC]->(m:Metric)
    OPTIONAL MATCH (run)-[r6:RECOMMENDS]->(rec:Recommendation)
    RETURN app, run, dp, seg, net, fail, sig, m, rec LIMIT 150
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
                if rec.get("seg"):
                    sg_id = f"seg_{rec['seg']['name']}"
                    edges_list.append({
                        "id": f"{f_id}_{sg_id}",
                        "source": f_id,
                        "target": sg_id,
                        "type": "IMPACTS_POPULATION"
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
