"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Database,
  Layers,
  Search,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  AlertOctagon,
  Brain,
  CheckCircle2,
  ChevronRight,
  Filter,
  Activity,
  Globe,
  Cpu,
  TrendingDown,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  X,
  Share2,
  List,
  GitBranch,
  Calendar,
  Clock
} from "lucide-react";
import { ApiClient } from "@/lib/api";

interface Node {
  id: string;
  label: string;
  name: string;
  properties: Record<string, any>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
}

// Warm Minimal Node Palette
const NODE_COLORS: Record<string, { bg: string; border: string; text: string; fill: string }> = {
  Project: { bg: "#EDF3F9", border: "#557DAA", text: "#557DAA", fill: "#557DAA" },
  TestRun: { bg: "#F8E9DF", border: "#D97745", text: "#D97745", fill: "#D97745" },
  DeviceProfile: { bg: "#F4EFEA", border: "#8B6A56", text: "#8B6A56", fill: "#8B6A56" },
  Failure: { bg: "#FBEBEA", border: "#C6534B", text: "#C6534B", fill: "#C6534B" },
  ErrorSignature: { bg: "#FBF4E8", border: "#C58A35", text: "#C58A35", fill: "#C58A35" },
  RootCause: { bg: "#FCEEEA", border: "#B95E32", text: "#B95E32", fill: "#B95E32" },
  Recommendation: { bg: "#F1EDF4", border: "#7A6F82", text: "#7A6F82", fill: "#7A6F82" },
  Metric: { bg: "#EBF5F0", border: "#36865A", text: "#36865A", fill: "#36865A" },
  MarketSegment: { bg: "#FBF4E8", border: "#C58A35", text: "#C58A35", fill: "#C58A35" },
  NetworkCohort: { bg: "#EBF5F0", border: "#36865A", text: "#36865A", fill: "#36865A" },
  Workspace: { bg: "#EEECE5", border: "#6B6B65", text: "#6B6B65", fill: "#6B6B65" },
};

const DEFAULT_NODE_COLOR = { bg: "#EEECE5", border: "#6B6B65", text: "#6B6B65", fill: "#6B6B65" };

export default function IntelligenceExplorer() {
  const [activeTab, setActiveTab] = useState<"graph" | "patterns" | "device_impact" | "root_causes" | "historical">("graph");
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Scoped Website / Project Filter
  const [testedWebsites, setTestedWebsites] = useState<any[]>([]);
  const [selectedWebsite, setSelectedWebsite] = useState<string>("ALL");
  const [isLoadingWebsites, setIsLoadingWebsites] = useState(true);

  // Graph state
  const [graphData, setGraphData] = useState<{ nodes: Node[]; edges: Edge[]; connected: boolean }>({ nodes: [], edges: [], connected: true });
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [nodeTypeFilter, setNodeTypeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeDetails, setNodeDetails] = useState<any>(null);
  const [isLoadingNodeDetails, setIsLoadingNodeDetails] = useState(false);

  // Section states
  const [failurePatterns, setFailurePatterns] = useState<any[]>([]);
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false);

  const [deviceImpact, setDeviceImpact] = useState<any[]>([]);
  const [isLoadingImpact, setIsLoadingImpact] = useState(false);

  const [rootCauses, setRootCauses] = useState<any[]>([]);
  const [isLoadingRootCauses, setIsLoadingRootCauses] = useState(false);

  const [historicalRuns, setHistoricalRuns] = useState<any[]>([]);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false);
  const [historicalStatusFilter, setHistoricalStatusFilter] = useState("ALL");

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  // Fetch Projects List
  const loadProjects = async () => {
    setIsLoadingWebsites(true);
    try {
      const data = await ApiClient.getGraphProjects();
      if (Array.isArray(data) && data.length > 0) {
        setTestedWebsites(data);
        // Retain current selection if valid; otherwise default to "ALL" so all tested projects are visible
        setSelectedWebsite((prev) => (prev && prev !== "ALL" && data.some(d => d.id === prev || d.name === prev) ? prev : "ALL"));
      }
    } catch (e) {
      console.error("Failed to load tested websites:", e);
    } finally {
      setIsLoadingWebsites(false);
    }
  };

  // Fetch Stats
  const loadStats = async (siteId?: string) => {
    setIsLoadingStats(true);
    try {
      const target = siteId !== undefined ? siteId : selectedWebsite;
      const data = await ApiClient.getGraphStats(target !== "ALL" ? target : undefined);
      setStats(data);
    } catch (e) {
      console.error("Failed to load graph stats:", e);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch Graph
  const loadGraph = async (siteId?: string) => {
    setIsLoadingGraph(true);
    try {
      const target = siteId !== undefined ? siteId : selectedWebsite;
      const data = await ApiClient.getExplorerGraph({
        projectId: target !== "ALL" ? target : undefined,
        nodeType: nodeTypeFilter !== "ALL" ? nodeTypeFilter : undefined,
        search: searchQuery.trim() || undefined,
        limit: 120
      });
      setGraphData({
        nodes: data.nodes || [],
        edges: data.edges || [],
        connected: data.connected !== false
      });
    } catch (e) {
      console.error("Failed to load explorer graph:", e);
    } finally {
      setIsLoadingGraph(false);
    }
  };

  // Fetch Failure Patterns
  const loadFailurePatterns = async (siteId?: string) => {
    setIsLoadingPatterns(true);
    try {
      const target = siteId !== undefined ? siteId : selectedWebsite;
      const data = await ApiClient.getFailurePatterns(target !== "ALL" ? target : undefined);
      setFailurePatterns(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load failure patterns:", e);
    } finally {
      setIsLoadingPatterns(false);
    }
  };

  // Fetch Device Impact
  const loadDeviceImpact = async (siteId?: string) => {
    setIsLoadingImpact(true);
    try {
      const target = siteId !== undefined ? siteId : selectedWebsite;
      const data = await ApiClient.getDeviceImpact(target !== "ALL" ? target : undefined);
      setDeviceImpact(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load device impact:", e);
    } finally {
      setIsLoadingImpact(false);
    }
  };

  // Fetch Root Cause Chains
  const loadRootCauses = async (siteId?: string) => {
    setIsLoadingRootCauses(true);
    try {
      const target = siteId !== undefined ? siteId : selectedWebsite;
      const data = await ApiClient.getRootCauseChains(50, target !== "ALL" ? target : undefined);
      setRootCauses(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load root causes:", e);
    } finally {
      setIsLoadingRootCauses(false);
    }
  };

  // Fetch Historical Runs
  const loadHistoricalRuns = async (siteId?: string) => {
    setIsLoadingHistorical(true);
    try {
      const target = siteId !== undefined ? siteId : selectedWebsite;
      const data = await ApiClient.getHistoricalRuns({
        projectId: target !== "ALL" ? target : undefined,
        status: historicalStatusFilter !== "ALL" ? historicalStatusFilter : undefined,
        limit: 30
      });
      setHistoricalRuns(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load historical runs:", e);
    } finally {
      setIsLoadingHistorical(false);
    }
  };

  // Load detailed properties & edges when a node is selected
  const handleSelectNode = async (node: Node) => {
    setSelectedNode(node);
    setIsLoadingNodeDetails(true);
    try {
      const details = await ApiClient.getNodeDetails(node.id);
      setNodeDetails(details);
    } catch (e) {
      setNodeDetails({ node, incoming: [], outgoing: [] });
    } finally {
      setIsLoadingNodeDetails(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadProjects();
  }, []);

  // When selected website changes, re-fetch all active sections
  useEffect(() => {
    loadStats(selectedWebsite);
    loadGraph(selectedWebsite);
    if (activeTab === "patterns") loadFailurePatterns(selectedWebsite);
    if (activeTab === "device_impact") loadDeviceImpact(selectedWebsite);
    if (activeTab === "root_causes") loadRootCauses(selectedWebsite);
    if (activeTab === "historical") loadHistoricalRuns(selectedWebsite);
  }, [selectedWebsite]);

  // When changing tab, load relevant data
  useEffect(() => {
    if (activeTab === "patterns") loadFailurePatterns(selectedWebsite);
    if (activeTab === "device_impact") loadDeviceImpact(selectedWebsite);
    if (activeTab === "root_causes") loadRootCauses(selectedWebsite);
    if (activeTab === "historical") loadHistoricalRuns(selectedWebsite);
  }, [activeTab]);

  // When search or filter changes, reload graph
  useEffect(() => {
    if (activeTab === "graph") {
      const timeout = setTimeout(() => {
        loadGraph(selectedWebsite);
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [nodeTypeFilter, searchQuery]);

  // Physics simulation for graph canvas
  useEffect(() => {
    if (!graphData.nodes || graphData.nodes.length === 0) return;

    const width = 900;
    const height = 560;
    const count = graphData.nodes.length;

    // Cluster nodes roughly by label
    const labelAngles: Record<string, number> = {
      Project: 0,
      TestRun: Math.PI / 4,
      DeviceProfile: Math.PI / 2,
      Metric: (3 * Math.PI) / 4,
      Failure: Math.PI,
      ErrorSignature: (5 * Math.PI) / 4,
      RootCause: (3 * Math.PI) / 2,
      Recommendation: (7 * Math.PI) / 4,
    };

    const nodes = graphData.nodes.map((n, i) => {
      const baseAngle = labelAngles[n.label] ?? (i / count) * 2 * Math.PI;
      const angle = baseAngle + ((i % 5) - 2) * 0.15;
      const radius = 110 + (i % 4) * 65;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });

    nodesRef.current = nodes;
    edgesRef.current = graphData.edges || [];

    let animId: number;
    let ticks = 0;

    const simulate = () => {
      if (ticks > 90) return;
      ticks++;

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x! - nodes[i].x!;
          const dy = nodes[j].y! - nodes[i].y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 180) {
            const force = ((180 - dist) / dist) * 0.05;
            nodes[i].x! -= dx * force;
            nodes[i].y! -= dy * force;
            nodes[j].x! += dx * force;
            nodes[j].y! += dy * force;
          }
        }
      }

      // Spring force along edges
      for (const edge of edgesRef.current) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (sourceNode && targetNode && sourceNode.x && sourceNode.y && targetNode.x && targetNode.y) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 140) * 0.02;
          sourceNode.x += (dx / dist) * force;
          sourceNode.y += (dy / dist) * force;
          targetNode.x -= (dx / dist) * force;
          targetNode.y -= (dy / dist) * force;
        }
      }

      draw();
      animId = requestAnimationFrame(simulate);
    };

    simulate();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [graphData]);

  // Canvas drawing
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Warm Minimal Canvas Background
    ctx.fillStyle = "#FAF9F6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle warm dotted grid
    ctx.fillStyle = "#E8E4DA";
    const gridSize = 28;
    for (let x = 0; x < canvas.width; x += gridSize) {
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.translate(pan.x + canvas.width / 2, pan.y + canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // 1. Draw Edges with Arrows & Relationship Labels
    for (const edge of edgesRef.current) {
      const source = nodesRef.current.find((n) => n.id === edge.source);
      const target = nodesRef.current.find((n) => n.id === edge.target);
      if (source && target && source.x && source.y && target.x && target.y) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = "#D8D4C9";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Directional arrow head
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const nodeRadius = 18;
        const arrowX = target.x - Math.cos(angle) * (nodeRadius + 2);
        const arrowY = target.y - Math.sin(angle) * (nodeRadius + 2);

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 8 * Math.cos(angle - Math.PI / 6), arrowY - 8 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowX - 8 * Math.cos(angle + Math.PI / 6), arrowY - 8 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = "#B8B3A6";
        ctx.fill();

        // Relationship label
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        ctx.fillStyle = "#96948D";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(edge.type, midX, midY - 4);
      }
    }

    // 2. Draw Nodes
    for (const node of nodesRef.current) {
      if (!node.x || !node.y) continue;
      const isSelected = selectedNode?.id === node.id;
      const palette = NODE_COLORS[node.label] || DEFAULT_NODE_COLOR;

      // Outer glow for selected node
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 24, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(217, 119, 69, 0.15)";
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, isSelected ? 18 : 14, 0, Math.PI * 2);
      ctx.fillStyle = palette.fill;
      ctx.fill();
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = isSelected ? "#252525" : "#FFFFFF";
      ctx.stroke();

      // Node label badge below
      const labelText = node.name.length > 22 ? `${node.name.slice(0, 20)}…` : node.name;
      ctx.fillStyle = isSelected ? "#252525" : "#6B6B65";
      ctx.font = isSelected ? "bold 11px Inter, sans-serif" : "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labelText, node.x, node.y + 26);
    }

    ctx.restore();
  };

  useEffect(() => {
    draw();
  }, [selectedNode, zoom, pan]);

  // Canvas mouse interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const transformedX = (mouseX - (pan.x + canvas.width / 2)) / zoom + canvas.width / 2;
    const transformedY = (mouseY - (pan.y + canvas.height / 2)) / zoom + canvas.height / 2;

    const hit = nodesRef.current.find((n) => {
      const dx = n.x! - transformedX;
      const dy = n.y! - transformedY;
      return Math.sqrt(dx * dx + dy * dy) <= 20;
    });

    if (hit) {
      handleSelectNode(hit);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP INTELLIGENCE DASHBOARD STATS */}
      <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-[#F8E9DF] text-[#D97745] px-2 py-0.5 rounded border border-[#F1D5C4]">
                Neo4j Aura Intelligence
              </span>
              <span className="text-[10px] font-mono text-[#36865A] bg-[#EBF5F0] px-2 py-0.5 rounded border border-[#CDE5D8] flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#36865A]" />
                {stats?.source || "Neo4j Connected"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#252525] tracking-tight flex items-center gap-2.5">
              <Database className="w-6 h-6 text-[#D97745]" />
              Neo4j Intelligence Explorer
            </h2>
            <p className="text-xs sm:text-sm text-[#6B6B65] mt-1 max-w-3xl leading-relaxed">
              Explore multi-hop relationships between Projects, Test Runs, Device Profiles, Measured Metrics, Failures, Error Signatures, and Verified Recommendations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Real Tested Website Selector */}
            <div className="flex items-center gap-2 bg-[#FAF9F6] border border-[#E6E2D9] px-3 py-1.5 rounded-lg shadow-xs">
              <Globe className="w-4 h-4 text-[#D97745]" />
              <div className="flex flex-col">
                <span className="text-[9px] text-[#6B6B65] font-semibold uppercase tracking-wider">Scoped Website</span>
                <select
                  value={selectedWebsite}
                  onChange={(e) => setSelectedWebsite(e.target.value)}
                  className="bg-transparent text-xs font-bold text-[#252525] focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">All Tested Websites (Global)</option>
                  {testedWebsites.map((w) => (
                    <option key={w.id || w.name} value={w.id || w.name}>
                      {w.name} ({w.test_runs_count} runs)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                loadProjects();
                loadStats(selectedWebsite);
                loadGraph(selectedWebsite);
              }}
              className="px-3.5 py-2.5 bg-[#EEECE5] hover:bg-[#EAE7DF] text-[#252525] font-medium text-xs rounded-lg border border-[#E6E2D9] transition-warm flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#D97745] ${isLoadingStats ? "animate-spin" : ""}`} />
              Refresh Graph
            </button>
          </div>
        </div>

        {/* 8 Database Count Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-4 border-t border-[#E6E2D9]">
          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Projects</div>
            <div className="text-xl font-bold text-[#252525] font-mono mt-0.5">{stats?.projects ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Active apps</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Test Runs</div>
            <div className="text-xl font-bold text-[#252525] font-mono mt-0.5">{stats?.test_runs ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Total runs</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Profiles</div>
            <div className="text-xl font-bold text-[#252525] font-mono mt-0.5">{stats?.device_profiles ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Hardware tiers</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Metrics</div>
            <div className="text-xl font-bold text-[#252525] font-mono mt-0.5">{stats?.metrics ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Core Web Vitals</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Failures</div>
            <div className="text-xl font-bold text-[#C6534B] font-mono mt-0.5">{stats?.failures ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Exceptions hit</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Signatures</div>
            <div className="text-xl font-bold text-[#C58A35] font-mono mt-0.5">{stats?.error_signatures ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Unique patterns</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Root Causes</div>
            <div className="text-xl font-bold text-[#252525] font-mono mt-0.5">{stats?.root_causes ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Diagnosed</div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9]">
            <div className="text-[10px] text-[#6B6B65] font-medium">Recommendations</div>
            <div className="text-xl font-bold text-[#36865A] font-mono mt-0.5">{stats?.recommendations ?? 0}</div>
            <div className="text-[9px] text-[#96948D]">Actionable fixes</div>
          </div>
        </div>
      </div>

      {/* 2. SUB-SECTION NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E6E2D9] pb-3">
        <button
          onClick={() => setActiveTab("graph")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-warm ${
            activeTab === "graph"
              ? "bg-[#D97745] text-white shadow-warm"
              : "bg-[#FFFFFF] text-[#6B6B65] border border-[#E6E2D9] hover:bg-[#FAF9F6] hover:text-[#252525]"
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          Interactive Graph
        </button>

        <button
          onClick={() => setActiveTab("patterns")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-warm ${
            activeTab === "patterns"
              ? "bg-[#D97745] text-white shadow-warm"
              : "bg-[#FFFFFF] text-[#6B6B65] border border-[#E6E2D9] hover:bg-[#FAF9F6] hover:text-[#252525]"
          }`}
        >
          <AlertOctagon className="w-3.5 h-3.5" />
          Failure Pattern Explorer
          {failurePatterns.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
              {failurePatterns.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("device_impact")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-warm ${
            activeTab === "device_impact"
              ? "bg-[#D97745] text-white shadow-warm"
              : "bg-[#FFFFFF] text-[#6B6B65] border border-[#E6E2D9] hover:bg-[#FAF9F6] hover:text-[#252525]"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Device Impact Explorer
        </button>

        <button
          onClick={() => setActiveTab("root_causes")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-warm ${
            activeTab === "root_causes"
              ? "bg-[#D97745] text-white shadow-warm"
              : "bg-[#FFFFFF] text-[#6B6B65] border border-[#E6E2D9] hover:bg-[#FAF9F6] hover:text-[#252525]"
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          Root Cause & Recommendations
        </button>

        <button
          onClick={() => setActiveTab("historical")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-warm ${
            activeTab === "historical"
              ? "bg-[#D97745] text-white shadow-warm"
              : "bg-[#FFFFFF] text-[#6B6B65] border border-[#E6E2D9] hover:bg-[#FAF9F6] hover:text-[#252525]"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Historical Test Runs
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: INTERACTIVE RELATIONSHIP GRAPH */}
      {/* ========================================================================= */}
      {activeTab === "graph" && (
        <div className="space-y-4">
          {/* Graph Toolbar: Filters & Controls */}
          <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#96948D] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter nodes by name / signature..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-[#FAF9F6] border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-none focus:border-[#D97745] focus:ring-1 focus:ring-[#D97745] w-64"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[#6B6B65]">
                <Filter className="w-3.5 h-3.5 text-[#96948D]" />
                <select
                  value={nodeTypeFilter}
                  onChange={(e) => setNodeTypeFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-[#FAF9F6] border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-none focus:border-[#D97745]"
                >
                  <option value="ALL">All Node Types</option>
                  <option value="Project">Project</option>
                  <option value="TestRun">TestRun</option>
                  <option value="DeviceProfile">DeviceProfile</option>
                  <option value="Failure">Failure</option>
                  <option value="ErrorSignature">ErrorSignature</option>
                  <option value="RootCause">RootCause</option>
                  <option value="Recommendation">Recommendation</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs font-mono text-[#6B6B65] bg-[#FAF9F6] px-2.5 py-1 rounded-lg border border-[#E6E2D9]">
                {graphData.nodes.length} Nodes • {graphData.edges.length} Edges
              </div>
              <div className="flex items-center gap-1 bg-[#FAF9F6] p-1 rounded-lg border border-[#E6E2D9]">
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))}
                  className="p-1 hover:bg-[#EEECE5] rounded text-[#6B6B65]"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.2, 0.4))}
                  className="p-1 hover:bg-[#EEECE5] rounded text-[#6B6B65]"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="px-2 py-1 text-xs text-[#6B6B65] hover:bg-[#EEECE5] rounded font-mono"
                  title="Reset View"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Canvas & Side Inspection Panel */}
          <div className="relative rounded-xl overflow-hidden border border-[#E6E2D9] bg-[#FFFFFF] shadow-warm">
            {/* Color Legend */}
            <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 bg-[#FFFFFF]/95 backdrop-blur border border-[#E6E2D9] px-3 py-2 rounded-lg text-[10px] shadow-warm">
              {Object.entries(NODE_COLORS).map(([label, color]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color.fill }} />
                  <span className="text-[#252525] font-medium">{label}</span>
                </div>
              ))}
            </div>

            {/* Interactive Canvas */}
            <canvas
              ref={canvasRef}
              width={900}
              height={560}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="w-full h-[560px] cursor-grab active:cursor-grabbing block"
            />

            {/* Selected Node Details Drawer */}
            {selectedNode && (
              <div className="absolute top-4 right-4 w-80 max-h-[520px] bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl p-4 shadow-warm-lg z-20 text-xs overflow-y-auto">
                <div className="flex justify-between items-start mb-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold"
                    style={{
                      backgroundColor: (NODE_COLORS[selectedNode.label] || DEFAULT_NODE_COLOR).bg,
                      color: (NODE_COLORS[selectedNode.label] || DEFAULT_NODE_COLOR).text,
                      border: `1px solid ${(NODE_COLORS[selectedNode.label] || DEFAULT_NODE_COLOR).border}`,
                    }}
                  >
                    {selectedNode.label}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedNode(null);
                      setNodeDetails(null);
                    }}
                    className="text-[#96948D] hover:text-[#252525] text-sm p-0.5 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h4 className="font-bold text-[#252525] text-sm mb-2">{selectedNode.name}</h4>

                {/* Node Properties */}
                <div className="space-y-1.5 font-mono text-[11px] text-[#252525] bg-[#FAF9F6] p-2.5 rounded-lg border border-[#E6E2D9] mb-3 max-h-40 overflow-y-auto">
                  {Object.entries(selectedNode.properties || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-[#E6E2D9]/50 py-0.5 last:border-0">
                      <span className="text-[#6B6B65]">{k}:</span>
                      <span className="text-[#D97745] font-semibold truncate max-w-[150px]">{String(v)}</span>
                    </div>
                  ))}
                </div>

                {/* Connected Relationships */}
                {nodeDetails && (
                  <div className="space-y-3 pt-2 border-t border-[#E6E2D9]">
                    {nodeDetails.incoming && nodeDetails.incoming.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-[#6B6B65] uppercase tracking-wider mb-1">
                          Incoming Connections ({nodeDetails.incoming.length})
                        </div>
                        <div className="space-y-1">
                          {nodeDetails.incoming.map((edge: any, idx: number) => (
                            <div key={idx} className="p-1.5 rounded bg-[#FAF9F6] border border-[#E6E2D9] text-[10px] flex items-center justify-between">
                              <span className="font-semibold text-[#557DAA] truncate max-w-[130px]">{edge.source_name}</span>
                              <span className="text-[9px] font-mono text-[#96948D] bg-white px-1.5 py-0.2 rounded border border-[#E6E2D9]">
                                -{edge.rel}➔
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {nodeDetails.outgoing && nodeDetails.outgoing.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold text-[#6B6B65] uppercase tracking-wider mb-1">
                          Outgoing Connections ({nodeDetails.outgoing.length})
                        </div>
                        <div className="space-y-1">
                          {nodeDetails.outgoing.map((edge: any, idx: number) => (
                            <div key={idx} className="p-1.5 rounded bg-[#FAF9F6] border border-[#E6E2D9] text-[10px] flex items-center justify-between">
                              <span className="text-[9px] font-mono text-[#96948D] bg-white px-1.5 py-0.2 rounded border border-[#E6E2D9]">
                                ➔{edge.rel}-
                              </span>
                              <span className="font-semibold text-[#D97745] truncate max-w-[130px]">{edge.target_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: FAILURE PATTERN EXPLORER */}
      {/* ========================================================================= */}
      {activeTab === "patterns" && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-bold text-[#252525] flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-[#C6534B]" />
                  Recurring Failure Pattern Intelligence
                </h3>
                <p className="text-xs text-[#6B6B65]">
                  Failures grouped across historical test runs by their unique Error Signature in Neo4j.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold bg-[#FAF9F6] text-[#252525] px-3 py-1 rounded-lg border border-[#E6E2D9]">
                {failurePatterns.length} Unique Signatures
              </span>
            </div>

            {isLoadingPatterns ? (
              <div className="p-12 text-center text-xs text-[#6B6B65] animate-pulse">
                Querying recurring failure patterns from Neo4j Aura...
              </div>
            ) : failurePatterns.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B6B65] bg-[#FAF9F6] rounded-xl border border-[#E6E2D9]">
                Zero recurring error signatures recorded.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {failurePatterns.map((pat, idx) => (
                  <div key={idx} className="p-5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-3 hover:border-[#D97745]/50 transition-warm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FBF4E8] text-[#C58A35] border border-[#F5DFBF]">
                          Sig: {pat.signature}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FBEBEA] text-[#C6534B] border border-[#F5C6C3]">
                          {pat.frequency} Occurrences
                        </span>
                      </div>
                    </div>

                    <h4 className="font-bold text-sm text-[#252525]">{pat.title}</h4>

                    {/* Affected Environments */}
                    <div className="space-y-1.5 text-xs text-[#6B6B65] pt-1 border-t border-[#E6E2D9]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[11px] text-[#96948D]">Affected Projects:</span>
                        <div className="flex flex-wrap gap-1">
                          {pat.affected_projects?.map((p: string, pIdx: number) => (
                            <span key={pIdx} className="text-[10px] bg-white border border-[#E6E2D9] px-2 py-0.5 rounded text-[#252525] font-semibold">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[11px] text-[#96948D]">Device Profiles:</span>
                        <div className="flex flex-wrap gap-1">
                          {pat.affected_device_profiles?.map((dp: string, dpIdx: number) => (
                            <span key={dpIdx} className="text-[10px] bg-white border border-[#E6E2D9] px-2 py-0.5 rounded text-[#8B6A56] font-semibold">
                              {dp}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sample Remediations */}
                    {pat.sample_remediations && pat.sample_remediations.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-white border border-[#E6E2D9] text-[11px] text-[#252525] space-y-1">
                        <span className="text-[10px] font-bold text-[#36865A] block uppercase">Suggested Fix:</span>
                        <p className="line-clamp-2 text-[#6B6B65]">{pat.sample_remediations[0]}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: DEVICE IMPACT EXPLORER */}
      {/* ========================================================================= */}
      {activeTab === "device_impact" && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm">
            <h3 className="text-base font-bold text-[#252525] flex items-center gap-2 mb-1">
              <Cpu className="w-5 h-5 text-[#8B6A56]" />
              Device Profile Failure & Performance Differential
            </h3>
            <p className="text-xs text-[#6B6B65] mb-5">
              Compare how performance issues and failure distributions differ between entry-level phones and high-tier hardware.
            </p>

            {isLoadingImpact ? (
              <div className="p-12 text-center text-xs text-[#6B6B65] animate-pulse">
                Evaluating device impact metrics from Neo4j...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deviceImpact.map((dev, idx) => (
                  <div key={idx} className="p-5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-[#252525]">{dev.name}</div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F8E9DF] text-[#D97745] border border-[#F1D5C4] font-semibold">
                        {dev.tier || "CUSTOM"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-white p-3 rounded-lg border border-[#E6E2D9]">
                      <div>
                        <span className="text-[#96948D] block text-[10px]">CPU Throttle</span>
                        <span className="font-bold text-[#252525]">{dev.cpu_throttle_rate}x Slowdown</span>
                      </div>
                      <div>
                        <span className="text-[#96948D] block text-[10px]">RAM Capacity</span>
                        <span className="font-bold text-[#252525]">{Math.round((dev.ram_mb || 2048) / 1024)} GB</span>
                      </div>
                      <div>
                        <span className="text-[#96948D] block text-[10px]">Network Profile</span>
                        <span className="font-bold text-[#252525]">{dev.network_profile || "Fast 3G"}</span>
                      </div>
                      <div>
                        <span className="text-[#96948D] block text-[10px]">Failures Captured</span>
                        <span className={`font-bold ${dev.failure_count > 0 ? "text-[#C6534B]" : "text-[#36865A]"}`}>
                          {dev.failure_count} Failures
                        </span>
                      </div>
                    </div>

                    {dev.sample_failures && dev.sample_failures.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-[#6B6B65] uppercase block mb-1">
                          Top Failures Observed:
                        </span>
                        <div className="space-y-1">
                          {dev.sample_failures.map((f: string, fIdx: number) => (
                            <div key={fIdx} className="text-[11px] text-[#C6534B] bg-[#FBEBEA] border border-[#F5C6C3] px-2.5 py-1 rounded">
                              • {f}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: ROOT CAUSE & RECOMMENDATION EXPLORER */}
      {/* ========================================================================= */}
      {activeTab === "root_causes" && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm">
            <h3 className="text-base font-bold text-[#252525] flex items-center gap-2 mb-1">
              <Brain className="w-5 h-5 text-[#B95E32]" />
              Verified Causal Chains: Project ➔ TestRun ➔ Failure ➔ Root Cause ➔ Recommendation
            </h3>
            <p className="text-xs text-[#6B6B65] mb-5">
              Deterministic causal linkages verified across Neo4j relationships.
            </p>

            {isLoadingRootCauses ? (
              <div className="p-12 text-center text-xs text-[#6B6B65] animate-pulse">
                Traversing causal chains in Neo4j Aura...
              </div>
            ) : rootCauses.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B6B65] bg-[#FAF9F6] rounded-xl border border-[#E6E2D9]">
                Zero causal chains recorded yet.
              </div>
            ) : (
              <div className="space-y-4">
                {rootCauses.map((chain, idx) => (
                  <div key={idx} className="p-5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    {/* Chain Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono border-b border-[#E6E2D9] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[#557DAA] font-bold">{chain.project_name}</span>
                        <span className="text-[#96948D]">/</span>
                        <span className="text-[#D97745]">Run {chain.test_run_id?.slice(0, 8)}</span>
                        <span className="text-[#96948D]">/</span>
                        <span className="text-[#8B6A56] font-semibold">{chain.device_profile_name}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#F8E9DF] text-[#D97745] border border-[#F1D5C4]">
                        {chain.impact} IMPACT
                      </span>
                    </div>

                    {/* Step-by-Step Flow */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {/* 1. Failure */}
                      <div className="p-3 rounded-lg bg-white border border-[#E6E2D9]">
                        <span className="text-[10px] font-bold text-[#C6534B] uppercase block mb-1">1. Detected Failure</span>
                        <div className="font-semibold text-[#252525]">{chain.failure_title}</div>
                        <div className="text-[10px] text-[#96948D] font-mono mt-1">Sig: {chain.signature}</div>
                      </div>

                      {/* 2. Root Cause */}
                      <div className="p-3 rounded-lg bg-white border border-[#E6E2D9]">
                        <span className="text-[10px] font-bold text-[#B95E32] uppercase block mb-1">2. Diagnosed Root Cause</span>
                        <div className="text-[#252525]">{chain.probable_cause}</div>
                        <div className="text-[10px] text-[#36865A] font-bold mt-1">Confidence: {chain.confidence}</div>
                      </div>

                      {/* 3. Recommendation */}
                      <div className="p-3 rounded-lg bg-white border border-[#E6E2D9]">
                        <span className="text-[10px] font-bold text-[#36865A] uppercase block mb-1">3. Concrete Remediation</span>
                        <div className="font-semibold text-[#252525] mb-1">{chain.recommendation_title}</div>
                        <pre className="whitespace-pre-wrap font-sans text-[11px] text-[#6B6B65] line-clamp-3">
                          {chain.remediation}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 5: HISTORICAL TEST EXPLORER */}
      {/* ========================================================================= */}
      {activeTab === "historical" && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#252525] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#557DAA]" />
                  Historical Test Runs & Graph Nodes
                </h3>
                <p className="text-xs text-[#6B6B65]">
                  Browse previous executions and navigate to their connected Neo4j knowledge nodes.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6B6B65]">Status:</span>
                <select
                  value={historicalStatusFilter}
                  onChange={(e) => setHistoricalStatusFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-[#FAF9F6] border border-[#E6E2D9] rounded-lg text-[#252525]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="COMPLETED_WITH_WARNINGS">Completed with Warnings</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
            </div>

            {isLoadingHistorical ? (
              <div className="p-12 text-center text-xs text-[#6B6B65] animate-pulse">
                Loading historical runs from Neo4j...
              </div>
            ) : historicalRuns.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B6B65] bg-[#FAF9F6] rounded-xl border border-[#E6E2D9]">
                Zero test runs match criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#E6E2D9] text-[#6B6B65] font-semibold bg-[#FAF9F6]">
                      <th className="py-2.5 px-3">Run ID</th>
                      <th className="py-2.5 px-3">Project</th>
                      <th className="py-2.5 px-3">Device Profile</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Connected Nodes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E2D9]">
                    {historicalRuns.map((r, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF9F6] transition-warm">
                        <td className="py-3 px-3 font-bold text-[#D97745]">
                          {r.run_id ? r.run_id.slice(0, 8) : `run_${idx}`}
                        </td>
                        <td className="py-3 px-3 text-[#252525] font-sans font-medium">{r.project_name}</td>
                        <td className="py-3 px-3 text-[#8B6A56] font-sans">{r.device_profile_name}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.status === "COMPLETED"
                              ? "bg-[#EBF5F0] text-[#36865A] border border-[#CDE5D8]"
                              : r.status === "COMPLETED_WITH_WARNINGS"
                              ? "bg-[#FBF4E8] text-[#C58A35] border border-[#F5DFBF]"
                              : "bg-[#FBEBEA] text-[#C6534B] border border-[#F5C6C3]"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#6B6B65]">
                          {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "-"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[10px] bg-white border border-[#E6E2D9] px-2 py-0.5 rounded text-[#252525]">
                            {r.metric_count} Metrics • {r.failure_count} Failures • {r.recommendation_count} Recs
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
