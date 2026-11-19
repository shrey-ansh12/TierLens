from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class GraphNode(BaseModel):
    id: str
    label: str # e.g. "Application", "TestRun", "Failure", "Metric"
    name: str
    properties: Dict[str, Any] = {}

class GraphRelationship(BaseModel):
    id: str
    source: str
    target: str
    type: str # e.g. "EXECUTED_ON", "PRODUCED_FAILURE", "HAS_METRIC", "PROBABLE_CAUSE"
    properties: Dict[str, Any] = {}

class GraphDataResponse(BaseModel):
    nodes: List[GraphNode] = []
    edges: List[GraphRelationship] = []
    connected: bool = True
    error: Optional[str] = None
    is_synthetic: bool = False
