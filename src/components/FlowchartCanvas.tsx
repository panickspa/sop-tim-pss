'use client';

import { useMemo, useState, useCallback } from 'react';
import { Page, FlowNode, Edge, SwLane } from '@/lib/types';
import { getSwimlaneColor } from '@/lib/parseSOP';

interface FlowchartCanvasProps {
  page: Page;
  onNodeClick: (node: FlowNode) => void;
  highlightedNodeId?: string | null;
}

interface NormalizedLane extends SwLane {
  normX: number;
  normY: number;
}

interface NormalizedNode extends FlowNode {
  normX: number;
  normY: number;
}

interface EdgePath {
  path: string;
  label: string;
  labelX: number;
  labelY: number;
}

const PADDING = 40;
const SWIMLANE_HEADER_HEIGHT = 36;

export default function FlowchartCanvas({ page, onNodeClick, highlightedNodeId }: FlowchartCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Normalize coordinates
  const { swimlanes, nodes, edges, canvasWidth, canvasHeight } = useMemo(() => {
    if (!page || page.swimlanes.length === 0) {
      return { swimlanes: [] as NormalizedLane[], nodes: [] as NormalizedNode[], edges: [] as Edge[], canvasWidth: 800, canvasHeight: 600 };
    }

    const roleLanes = page.swimlanes;
    let allX = roleLanes.map(l => l.x);
    let allY = roleLanes.map(l => l.y);
    let allXW = roleLanes.map(l => l.x + l.width);
    let allYH = roleLanes.map(l => l.y + l.height);

    for (const node of page.nodes) {
      allX.push(node.x);
      allY.push(node.y);
      allXW.push(node.x + node.width);
      allYH.push(node.y + node.height);
    }

    const mnX = Math.min(...allX) - PADDING;
    const mnY = Math.min(...allY) - PADDING;
    const mxX = Math.max(...allXW) + PADDING;
    const mxY = Math.max(...allYH) + PADDING;

    const normLanes = roleLanes.map(l => ({ ...l, normX: l.x - mnX, normY: l.y - mnY }));
    const normNodes = page.nodes.map(n => ({ ...n, normX: n.x - mnX, normY: n.y - mnY }));

    return { swimlanes: normLanes, nodes: normNodes, edges: page.edges, canvasWidth: mxX - mnX, canvasHeight: mxY - mnY };
  }, [page]);

  // Compute edge paths
  const edgePaths = useMemo(() => {
    const nodeMap = new Map<string, NormalizedNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    return edges.map((edge) => {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) return null;

      const srcCX = src.normX + src.width / 2;
      const srcCY = src.normY + src.height / 2;
      const srcBot = src.normY + src.height;
      const tgtCX = tgt.normX + tgt.width / 2;
      const tgtTop = tgt.normY;
      const tgtBot = tgt.normY + tgt.height;

      // Determine exit/entry sides based on positions and labels
      const isYesOrEquivalent = edge.label && /^(Ya|Iya|Setuju|Lengkap|Disetujui)$/i.test(edge.label);
      const isNoOrEquivalent = edge.label && /^(Tidak|Belum|Ditolak)$/i.test(edge.label);

      let srcX: number, srcY: number;
      if (isYesOrEquivalent) {
        // Right side exit
        srcX = src.normX + src.width;
        srcY = srcCY;
      } else if (isNoOrEquivalent) {
        // Left side exit
        srcX = src.normX;
        srcY = srcCY;
      } else if (tgtTop > srcBot) {
        // Target is below source: exit from bottom
        srcX = srcCX;
        srcY = srcBot;
      } else {
        // Target is above or beside: exit from bottom with a loop
        srcX = srcCX;
        srcY = srcBot;
      }

      const tgtAbove = tgtTop < srcBot - 20;
      const tgtBelow = tgtTop > srcBot + 20;

      let tgtX: number, tgtY: number;
      if (tgtBelow) {
        // Target below: enter from top
        tgtX = tgtCX;
        tgtY = tgtTop;
      } else if (tgtAbove) {
        // Target above: enter from bottom
        tgtX = tgtCX;
        tgtY = tgtBot;
      } else {
        // Side-to-side connection
        if (tgtCX > srcX) {
          tgtX = tgt.normX;
          tgtY = tgtCY;
        } else {
          tgtX = tgt.normX + tgt.width;
          tgtY = tgtCY;
        }
      }

      // Build orthogonal path
      const midX = (srcX + tgtX) / 2;
      const midY1 = srcY + Math.max(30, Math.abs(tgtY - srcY) * 0.4);
      const midY2 = tgtY - Math.max(30, Math.abs(tgtY - srcY) * 0.4);

      let path: string;
      if (tgtBelow && Math.abs(srcX - tgtX) < 15) {
        // Straight vertical down
        path = `M ${srcX} ${srcY} L ${tgtX} ${tgtY}`;
      } else if (tgtBelow) {
        // Down, across, down
        path = `M ${srcX} ${srcY} L ${srcX} ${midY1} L ${tgtX} ${midY1} L ${tgtX} ${tgtY}`;
      } else if (tgtAbove) {
        // Up and around
        const loopY = srcBot + 60;
        path = `M ${srcX} ${srcY} L ${srcX} ${loopY} L ${midX} ${loopY} L ${midX} ${tgtY - 20} L ${tgtX} ${tgtY - 20} L ${tgtX} ${tgtY}`;
      } else {
        // Side to side
        path = `M ${srcX} ${srcY} L ${srcX} ${midY1} L ${tgtX} ${midY1} L ${tgtX} ${tgtY}`;
      }

      const labelX = (srcX + tgtX) / 2;
      const labelY = (srcY + tgtY) / 2;

      return { path, label: edge.label, labelX, labelY };
    }).filter(Boolean) as EdgePath[];
  }, [edges, nodes]);

  const effectiveWidth = canvasWidth;
  const effectiveHeight = canvasHeight + SWIMLANE_HEADER_HEIGHT;

  const zoomIn = useCallback(() => setZoom(z => Math.min(z * 1.2, 3)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z / 1.2, 0.2)), []);
  const resetZoom = useCallback(() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      e.preventDefault();
    }
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Render a single node
  const renderNode = (n: NormalizedNode) => {
    const isHighlighted = highlightedNodeId === n.id;
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      left: n.normX,
      top: n.normY + SWIMLANE_HEADER_HEIGHT,
      width: n.width,
      height: n.height,
      zIndex: isHighlighted ? 20 : 5,
    };

    let content: React.ReactNode;
    let className: string;

    switch (n.type) {
      case 'process':
        className = 'node-process' + (isHighlighted ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary' : '');
        content = <span className="text-[10px] md:text-[11px] leading-tight px-1">{n.text}</span>;
        break;

      case 'decision': {
        className = 'node-decision' + (isHighlighted ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary' : '');
        const maxDim = Math.max(n.width, n.height);
        baseStyle.width = maxDim;
        baseStyle.height = maxDim;
        baseStyle.left = n.normX - (maxDim - n.width) / 2;
        baseStyle.top = n.normY - (maxDim - n.height) / 2 + SWIMLANE_HEADER_HEIGHT;
        content = (
          <div className="w-full h-full flex items-center justify-center p-1.5" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}>
            <span className="text-[9px] md:text-[10px] leading-tight">{n.text}</span>
          </div>
        );
        break;
      }

      case 'start':
        className = 'node-start' + (isHighlighted ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary' : '');
        {
          const size = Math.max(n.width, n.height, 40);
          baseStyle.width = size;
          baseStyle.height = size;
          baseStyle.left = n.normX - (size - n.width) / 2;
          baseStyle.top = n.normY - (size - n.height) / 2 + SWIMLANE_HEADER_HEIGHT;
        }
        content = <span className="text-[9px] font-bold">Mulai</span>;
        break;

      case 'end':
        className = 'node-end' + (isHighlighted ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary' : '');
        {
          const size = Math.max(n.width, n.height, 40);
          baseStyle.width = size;
          baseStyle.height = size;
          baseStyle.left = n.normX - (size - n.width) / 2;
          baseStyle.top = n.normY - (size - n.height) / 2 + SWIMLANE_HEADER_HEIGHT;
        }
        content = <span className="text-[9px] font-bold">Selesai</span>;
        break;

      case 'offpage':
        className = 'node-offpage' + (isHighlighted ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary' : '');
        content = <span className="text-[11px] font-bold">{n.text}</span>;
        break;

      default:
        className = 'bg-slate-700/50 border border-slate-500/30 rounded cursor-default flex items-center justify-center text-[10px] text-slate-400 p-1';
        content = <span>{n.text}</span>;
        break;
    }

    return (
      <div
        key={n.id}
        className={className}
        style={baseStyle}
        onClick={() => n.type !== 'connector' && onNodeClick(n)}
        title={n.text}
      >
        {content}
      </div>
    );
  };

  if (!page || page.swimlanes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <p>Diagram tidak tersedia untuk halaman ini</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-secondary border-b border-border-primary flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button onClick={zoomIn} className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors" title="Perbesar">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
            </svg>
          </button>
          <button onClick={zoomOut} className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors" title="Perkecil">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button onClick={resetZoom} className="px-2 py-1 rounded text-xs hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors" title="Atur ulang zoom">
            {Math.round(zoom * 100)}%
          </button>
          <span className="text-xs text-text-muted ml-2">
            {page.nodes.length} langkah · {page.edges.length} koneksi
          </span>
        </div>
        <div className="text-xs text-text-muted">Shift+Seret untuk geser</div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-auto relative bg-bg-primary"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <div
          className="relative"
          style={{
            width: effectiveWidth,
            height: effectiveHeight,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {/* Swimlane column backgrounds */}
          {swimlanes.map((lane, i) => (
            <div
              key={lane.id}
              className={`absolute border-r border-border-primary/50 ${getSwimlaneColor(i)}`}
              style={{
                left: lane.normX,
                top: lane.normY + SWIMLANE_HEADER_HEIGHT,
                width: lane.width,
                height: lane.height,
              }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <span className="text-[10px] text-text-muted/20 uppercase tracking-wider font-medium select-none">
                  {lane.name}
                </span>
              </div>
            </div>
          ))}

          {/* Swimlane headers */}
          {swimlanes.map((lane, i) => (
            <div
              key={`hdr-${lane.id}`}
              className={`absolute flex items-center justify-center border-b border-r border-border-primary/60 
                          bg-bg-secondary text-xs font-semibold text-text-secondary uppercase tracking-wider
                          ${getSwimlaneColor(i)}`}
              style={{
                left: lane.normX,
                top: lane.normY,
                width: lane.width,
                height: SWIMLANE_HEADER_HEIGHT,
              }}
            >
              <span className="truncate px-2 text-center">{lane.name}</span>
            </div>
          ))}

          {/* SVG edges layer */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: effectiveWidth, height: effectiveHeight }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#60a5fa" />
              </marker>
            </defs>
            {edgePaths.map((ep, i) => (
              <g key={i}>
                <path
                  d={ep.path}
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                  markerEnd="url(#arrowhead)"
                  className="pointer-events-auto"
                />
                {ep.label && (
                  <text
                    x={ep.labelX}
                    y={ep.labelY}
                    fill="#f59e0b"
                    fontSize="10"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-auto select-none font-medium"
                  >
                    <tspan
                      dx="0" dy="0"
                      style={{ paintOrder: 'stroke', stroke: '#0b1424', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }}
                    >
                      {ep.label}
                    </tspan>
                    <tspan dx="0" dy="0">{ep.label}</tspan>
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* Nodes layer */}
          {nodes.map(renderNode)}
        </div>
      </div>
    </div>
  );
}
