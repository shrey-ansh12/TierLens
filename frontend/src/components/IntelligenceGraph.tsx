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
  Application: "#06B6D4",      // Cyan
  TestRun: "#3B82F6",          // Blue
  DeviceProfile: "#8B5CF6",    // Purple
  Failure: "#EF4444",          // Red
  ErrorSignature: "#F59E0B",   // Amber
  Metric: "#10B981",           // Emerald
  Recommendation: "#EC4899",   // Pink
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

    // Initialize positions in a circle/galaxy layout
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

    // Simple force layout simulation loop
    let animId: number;
    let ticks = 0;

    const simulate = () => {
      if (ticks > 80) return; // Settle after 80 steps
      ticks++;

      // Repulsion between nodes
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

      // Attraction along edges
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

    // Pan & Zoom
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
        ctx.strokeStyle = "rgba(71, 85, 105, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Edge type label in small font
        const midX = (source.x! + target.x!) / 2;
        const midY = (source.y! + target.y!) / 2;
        ctx.font = "9px monospace";
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.textAlign = "center";
        ctx.fillText(e.type, midX, midY - 3);
      }
    }

    // Draw Nodes
    for (const n of nodesRef.current) {
      const color = COLOR_MAP[n.label] || "#94A3B8";
      const isSelected = selectedNode?.id === n.id;

      ctx.beginPath();
      ctx.arc(n.x!, n.y!, isSelected ? 14 : 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 15 : 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Outer ring if selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, 18, 0, 2 * Math.PI);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label text
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#E2E8F0";
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

    // Convert mouse coords back through pan & zoom
    const transformedX = (mouseX - (pan.x + canvas.width / 2)) / zoom + canvas.width / 2;
    const transformedY = (mouseY - (pan.y + canvas.height / 2)) / zoom + canvas.height / 2;

    // Check hit test for node selection
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
      <div className="bg-[#0D131F] border border-amber-900/40 rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[420px]">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
          <Database className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Neo4j Intelligence Graph Disconnected</h3>
        <p className="text-sm text-slate-400 max-w-lg mb-6 leading-relaxed">
          {data.error || "The Neo4j graph database container is offline or unreachable at bolt://localhost:7687."}
          <br />
          Per the <strong className="text-slate-300">Strict Real Data Policy</strong>, TierLens never generates synthetic graph relationships when the database is unavailable.
        </p>
        <div className="bg-[#080C14] border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-400 mb-6 max-w-md w-full text-left">
          $ docker compose up -d neo4j
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black font-semibold text-sm transition"
          >
            <RefreshCw className="w-4 h-4" />
            Check Neo4j Connection
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-[#0D131F] border border-slate-800 rounded-xl overflow-hidden">
      {/* Controls Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-[#080C14]/80 backdrop-blur border border-slate-700/60 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-400">
          <Layers className="w-3.5 h-3.5" />
          <span>{data.nodes.length} Nodes</span>
          <span className="text-slate-600">|</span>
          <span>{data.edges.length} Relationships</span>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-[#080C14]/80 backdrop-blur border border-slate-700/60 p-1 rounded-lg">
        <button
          onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))}
          className="p-1.5 hover:bg-slate-800 rounded text-slate-300 transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}
          className="p-1.5 hover:bg-slate-800 rounded text-slate-300 transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 rounded transition font-mono"
        >
          Reset
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2.5 bg-[#080C14]/90 backdrop-blur border border-slate-800 px-3 py-2 rounded-lg text-[11px]">
        {Object.entries(COLOR_MAP).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-300">{label}</span>
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
        <div className="absolute top-4 right-4 w-72 bg-[#0F172A] border border-cyan-500/40 rounded-xl p-4 shadow-2xl z-20 text-xs">
          <div className="flex justify-between items-start mb-2">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ backgroundColor: `${COLOR_MAP[selectedNode.label]}25`, color: COLOR_MAP[selectedNode.label] }}
            >
              {selectedNode.label}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <h4 className="font-bold text-white text-sm mb-2">{selectedNode.name}</h4>
          <div className="space-y-1.5 font-mono text-[11px] text-slate-300 bg-[#080C14] p-2.5 rounded-lg border border-slate-800 max-h-48 overflow-y-auto">
            {Object.entries(selectedNode.properties || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-slate-500">{k}:</span>
                <span className="text-cyan-300 truncate max-w-[140px]">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
