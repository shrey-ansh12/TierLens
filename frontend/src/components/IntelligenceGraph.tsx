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

const COLOR_MAP: Record<string, string> = {
  Application: "#2563EB",      // Blue
  Project: "#2563EB",          // Blue
  TestRun: "#0284C7",          // Sky
  DeviceProfile: "#7C3AED",    // Purple
  Failure: "#DC2626",          // Red
  ErrorSignature: "#D97706",   // Amber
  RootCause: "#EA580C",        // Orange
  Metric: "#16A34A",           // Emerald
  Recommendation: "#DB2777",   // Pink
  MarketSegment: "#F59E0B",    // Amber
  NetworkCohort: "#10B981",    // Emerald
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

      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      for (const e of edgesRef.current) {
        const source = nodeMap.get(e.source);
        const target = nodeMap.get(e.target);
        if (source && target) {
          const dx = target.x! - source.x!;
          const dy = target.y! - source.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desired = 100;
          const force = (dist - desired) * 0.03;
          source.x! += (dx / dist) * force;
          source.y! += (dy / dist) * force;
          target.x! -= (dx / dist) * force;
          target.y! -= (dy / dist) * force;
        }
      }

      draw();
      animId = requestAnimationFrame(simulate);
    };

    simulate();

    return () => cancelAnimationFrame(animId);
  }, [data]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Subtle background grid
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(pan.x + canvas.width / 2, pan.y + canvas.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

    // Draw Edges
    for (const e of edgesRef.current) {
      const source = nodeMap.get(e.source);
      const target = nodeMap.get(e.target);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.strokeStyle = "#CBD5E1";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const midX = (source.x! + target.x!) / 2;
        const midY = (source.y! + target.y!) / 2;
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#64748B";
        ctx.textAlign = "center";
        ctx.fillText(e.type, midX, midY - 4);
      }
    }

    // Draw Nodes
    for (const n of nodesRef.current) {
      const color = COLOR_MAP[n.label] || "#64748B";
      const isSelected = selectedNode?.id === n.id;

      ctx.beginPath();
      ctx.arc(n.x!, n.y!, isSelected ? 14 : 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, 17, 0, 2 * Math.PI);
        ctx.strokeStyle = "#1E293B";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#1E293B";
      ctx.textAlign = "center";
      ctx.fillText(n.name, n.x!, n.y! + 24);
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
      return Math.sqrt(dx * dx + dy * dy) <= 16;
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
      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[420px]">
        <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mb-4 text-amber-700">
          <Database className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Neo4j Intelligence Graph Disconnected</h3>
        <p className="text-xs text-slate-600 max-w-lg mb-5 leading-relaxed">
          {data.error || "The Neo4j graph database container is offline or unreachable at bolt://localhost:7687."}
          <br />
          Per the <strong className="text-slate-800">Strict Real Data Policy</strong>, TierLens never generates synthetic graph relationships when the database is unavailable.
        </p>
        <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-mono text-slate-700 mb-5 max-w-md w-full text-left shadow-sm">
          $ docker compose up -d neo4j
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check Neo4j Connection
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Controls Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-700 shadow-sm">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span>{data.nodes.length} Nodes</span>
          <span className="text-slate-300">|</span>
          <span>{data.edges.length} Relationships</span>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-200 p-1 rounded-lg shadow-sm">
        <button
          onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}
          className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition font-mono"
        >
          Reset
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2.5 bg-white/95 backdrop-blur border border-slate-200 px-3 py-2 rounded-lg text-[11px] shadow-sm">
        {Object.entries(COLOR_MAP).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-700 font-medium">{label}</span>
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
        <div className="absolute top-4 right-4 w-72 bg-white border border-slate-200 rounded-xl p-4 shadow-xl z-20 text-xs">
          <div className="flex justify-between items-start mb-2">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ backgroundColor: `${(COLOR_MAP[selectedNode.label] || "#64748B")}15`, color: (COLOR_MAP[selectedNode.label] || "#64748B") }}
            >
              {selectedNode.label}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-slate-700 text-sm"
            >
              ✕
            </button>
          </div>
          <h4 className="font-bold text-slate-900 text-sm mb-2">{selectedNode.name}</h4>
          <div className="space-y-1.5 font-mono text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
            {Object.entries(selectedNode.properties || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-slate-500">{k}:</span>
                <span className="text-blue-700 font-semibold truncate max-w-[140px]">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
