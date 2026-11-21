"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Database, RefreshCw, ZoomIn, ZoomOut, Layers } from "lucide-react";

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

interface Props {
  data: {
    nodes: Node[];
    edges: Edge[];
    connected: boolean;
    error?: string;
  };
  onRefresh?: () => void;
}

// Warm Minimal graph palette
const COLOR_MAP: Record<string, string> = {
  Application: "#557DAA",      // Information blue
  Project: "#557DAA",          // Information blue
  TestRun: "#D97745",          // Terracotta
  DeviceProfile: "#8B6A56",    // Warm Taupe
  Failure: "#C6534B",          // Error red
  ErrorSignature: "#C58A35",   // Warning amber
  RootCause: "#B95E32",        // Dark terracotta
  Metric: "#36865A",           // Success green
  Recommendation: "#7A6F82",   // Slate purple
  MarketSegment: "#C58A35",    // Amber
  NetworkCohort: "#36865A",    // Green
};

export default function IntelligenceGraph({ data, onRefresh }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    if (!data.nodes || data.nodes.length === 0) return;

    const width = 800;
    const height = 500;
    const count = data.nodes.length;
    const nodes = data.nodes.map((n, i) => {
      const angle = (i / count) * 2 * Math.PI;
      const radius = 120 + (i % 3) * 60;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });

    nodesRef.current = nodes;
    edgesRef.current = data.edges || [];

    let animId: number;
    let ticks = 0;

    const simulate = () => {
      if (ticks > 80) return;
      ticks++;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x! - nodes[i].x!;
          const dy = nodes[j].y! - nodes[i].y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 180) {
            const force = (180 - dist) / dist * 0.05;
            nodes[i].x! -= dx * force;
            nodes[i].y! -= dy * force;
            nodes[j].x! += dx * force;
            nodes[j].y! += dy * force;
          }
        }
      }

      for (const edge of edgesRef.current) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (sourceNode && targetNode) {
          const dx = targetNode.x! - sourceNode.x!;
          const dy = targetNode.y! - sourceNode.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 140) * 0.015;
          sourceNode.x! += (dx / dist) * force;
          sourceNode.y! += (dy / dist) * force;
          targetNode.x! -= (dx / dist) * force;
          targetNode.y! -= (dy / dist) * force;
        }
      }

      draw();
      animId = requestAnimationFrame(simulate);
    };

    simulate();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [data]);

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

    // Subtle warm grid dots
    ctx.fillStyle = "#EAE6DE";
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

    // Draw Edges
    for (const edge of edgesRef.current) {
      const source = nodesRef.current.find(n => n.id === edge.source);
      const target = nodesRef.current.find(n => n.id === edge.target);
      if (source && target && source.x && source.y && target.x && target.y) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = "#D8D4C9";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Edge label
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        ctx.fillStyle = "#96948D";
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(edge.type, midX, midY - 3);
      }
    }

    // Draw Nodes
    for (const node of nodesRef.current) {
      if (!node.x || !node.y) continue;
      const isSelected = selectedNode?.id === node.id;
      const color = COLOR_MAP[node.label] || "#6B6B65";

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, isSelected ? 18 : 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = isSelected ? "#252525" : "#FFFFFF";
      ctx.stroke();

      // Node text label
      ctx.fillStyle = "#252525";
      ctx.font = isSelected ? "bold 11px Inter, sans-serif" : "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(node.name || node.label, node.x, node.y + 24);
    }

    ctx.restore();
  };

  useEffect(() => {
    draw();
  }, [selectedNode, zoom, pan]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const transformedX = (mouseX - (pan.x + canvas.width / 2)) / zoom + canvas.width / 2;
    const transformedY = (mouseY - (pan.y + canvas.height / 2)) / zoom + canvas.height / 2;

    const hit = nodesRef.current.find(n => {
      const dx = n.x! - transformedX;
      const dy = n.y! - transformedY;
      return Math.sqrt(dx * dx + dy * dy) <= 18;
    });

    if (hit) {
      setSelectedNode(hit);
    } else {
      setSelectedNode(null);
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

  if (!data.connected) {
    return (
      <div className="bg-[#FAF9F6] border border-[#E6E2D9] rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[420px]">
        <div className="w-12 h-12 rounded-full bg-[#F8E9DF] border border-[#E6E2D9] flex items-center justify-center mb-4 text-[#D97745]">
          <Database className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold text-[#252525] mb-2">Neo4j Intelligence Graph Disconnected</h3>
        <p className="text-xs text-[#6B6B65] max-w-lg mb-5 leading-relaxed">
          {data.error || "The Neo4j graph database container is offline or unreachable at bolt://localhost:7687."}
          <br />
          Per the <strong className="text-[#252525]">Strict Real Data Policy</strong>, TierLens never generates synthetic graph relationships when the database is unavailable.
        </p>
        <div className="bg-[#FFFFFF] border border-[#E6E2D9] rounded-lg p-3 text-xs font-mono text-[#252525] mb-5 max-w-md w-full text-left">
          $ docker compose up -d neo4j
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D97745] hover:bg-[#B95E32] text-white font-medium text-xs transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check Neo4j Connection
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl overflow-hidden shadow-warm">
      {/* Controls Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-[#FFFFFF]/95 backdrop-blur border border-[#E6E2D9] px-3 py-1.5 rounded-lg text-xs font-mono text-[#252525] shadow-warm">
          <Layers className="w-3.5 h-3.5 text-[#D97745]" />
          <span>{data.nodes.length} Nodes</span>
          <span className="text-[#E6E2D9]">|</span>
          <span>{data.edges.length} Relationships</span>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-[#FFFFFF]/95 backdrop-blur border border-[#E6E2D9] p-1 rounded-lg shadow-warm">
        <button
          onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))}
          className="p-1.5 hover:bg-[#EEECE5] rounded text-[#6B6B65] transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}
          className="p-1.5 hover:bg-[#EEECE5] rounded text-[#6B6B65] transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="px-2 py-1 text-xs text-[#6B6B65] hover:bg-[#EEECE5] rounded transition font-mono"
        >
          Reset
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2.5 bg-[#FFFFFF]/95 backdrop-blur border border-[#E6E2D9] px-3 py-2 rounded-lg text-[11px] shadow-warm">
        {Object.entries(COLOR_MAP).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[#252525] font-medium">{label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={900}
        height={500}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-[500px] cursor-grab active:cursor-grabbing block"
      />

      {/* Node Inspector Drawer */}
      {selectedNode && (
        <div className="absolute top-4 right-4 w-72 bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl p-4 shadow-warm-lg z-20 text-xs">
          <div className="flex justify-between items-start mb-2">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ backgroundColor: `${(COLOR_MAP[selectedNode.label] || "#6B6B65")}18`, color: (COLOR_MAP[selectedNode.label] || "#6B6B65") }}
            >
              {selectedNode.label}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-[#96948D] hover:text-[#252525] text-sm"
            >
              ✕
            </button>
          </div>
          <h4 className="font-semibold text-[#252525] text-sm mb-2">{selectedNode.name}</h4>
          <div className="space-y-1.5 font-mono text-[11px] text-[#252525] bg-[#FAF9F6] p-2.5 rounded-lg border border-[#E6E2D9] max-h-48 overflow-y-auto">
            {Object.entries(selectedNode.properties || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-[#6B6B65]">{k}:</span>
                <span className="text-[#D97745] font-semibold truncate max-w-[140px]">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
