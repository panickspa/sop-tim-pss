'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Page, FlowNode, Edge } from '@/lib/types';
import { getSwimlaneColor } from '@/lib/parseSOP';

interface FlowchartCanvasProps {
  page: Page;
  onNodeClick: (node: FlowNode) => void;
  highlightedNodeId?: string | null;
}

interface NormalizedLane {
  id: string;
  name: string;
  normX: number;
  normY: number;
  width: number;
  height: number;
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

const PADDING = 50;
const SWIMLANE_HEADER_HEIGHT = 36;
/** Offset between swimlane container coordinates and node content coordinates */
const NODE_Y_OFFSET = SWIMLANE_HEADER_HEIGHT;

/**
 * Compute an orthogonal (right-angle) SVG path from one point to another,
 * ensuring the path goes from the edge of the source node to the edge of the target node.
 * Uses at most 3 segments (bend at two waypoints) for clean routing.
 */
function computeOrthogonalPath(
  sx: number, sy: number,
  tx: number, ty: number,
): string {
  const dx = Math.abs(tx - sx);
  const dy = Math.abs(ty - sy);
  const GAP = 30;

  // Case 1: Points are very close — just draw a straight line
  if (dx < 4 && dy < 4) {
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }

  // Determine relative position
  const sourceAbove = sy < ty;
  const sourceBelow = sy > ty;
  const sourceLeft = sx < tx;
  const sourceRight = sx > tx;

  // Case 2: Source is directly above target (within a reasonable horizontal range)
  if (sourceAbove && !sourceBelow && dx < 120) {
    // Simple vertical-down path, possibly with a slight jog
    if (dx < 15) {
      return `M ${sx} ${sy} L ${tx} ${ty}`;
    }
    const midY = (sy + ty) / 2;
    return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
  }

  // Case 3: Source above and to the left — go down, across, down
  if (sourceAbove && sourceLeft) {
    const midY = sy + Math.max(GAP, dy * 0.4);
    return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
  }

  // Case 4: Source above and to the right — go down, across-left, down
  if (sourceAbove && sourceRight) {
    const midY = sy + Math.max(GAP, dy * 0.5);
    return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
  }

  // Case 5: Source below target — route goes upward or loops around downward
  if (sourceBelow) {
    // Check if there's enough room above the source to route upward
    if (dy > 40) {
      // Route upward: go up from source, across, then up to target
      const midY = (sy + ty) / 2;
      return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
    } else {
      // Not enough vertical room — loop below the source
      const loopY = sy + Math.max(GAP * 2, 60);
      const midX = (sx + tx) / 2;
      return `M ${sx} ${sy} L ${sx} ${loopY} L ${midX} ${loopY} L ${midX} ${ty} L ${tx} ${ty}`;
    }
  }

  // Case 6: Source left of target but at same height
  if (sourceLeft) {
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`;
  }

  // Case 7: Source right of target but at same height
  if (sourceRight) {
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`;
  }

  // Fallback: 3-segment path
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${midX} ${midY} L ${midX} ${ty} L ${tx} ${ty}`;
}

/**
 * Compute the exit point on the source node based on exitX/exitY ratios.
 * exitX/exitY are normalized ratios (0–1) within the node bounding box.
 */
function computeExitPoint(
  node: NormalizedNode,
  exitX: number | undefined,
  exitY: number | undefined,
  label?: string,
): { x: number; y: number } {
  const ny = node.normY + NODE_Y_OFFSET;

  if (exitX !== undefined && exitY !== undefined) {
    // Use explicit exit point from draw.io
    // exitX/exitY are ratios 0-1 within the node bounding box
    const cx = node.normX + node.width / 2;
    const cy = ny + node.height / 2;
    if (exitY === 0 || exitY === 1) {
      return {
        x: node.normX + node.width * exitX,
        y: exitY === 0 ? ny : ny + node.height,
      };
    }
    if (exitX === 0 || exitX === 1) {
      return {
        x: exitX === 0 ? node.normX : node.normX + node.width,
        y: ny + node.height * exitY,
      };
    }
    // Compute point on the perimeter
    const rx = (exitX - 0.5) * 2;
    const ry = (exitY - 0.5) * 2;
    const hScale = node.width / 2;
    const vScale = node.height / 2;
    const absRx = Math.abs(rx);
    const absRy = Math.abs(ry);
    let scale: number;
    if (absRx * vScale >= absRy * hScale) {
      scale = hScale / (absRx || 0.001);
    } else {
      scale = vScale / (absRy || 0.001);
    }
    return {
      x: cx + rx * scale,
      y: cy + ry * scale,
    };
  }

  // No explicit exit info — use heuristics based on label
  const isYes = label && /^(Ya|Iya|Setuju|Lengkap|Disetujui)$/i.test(label);
  const isNo = label && /^(Tidak|Belum|Ditolak)$/i.test(label);

  if (isYes) {
    return {
      x: node.normX + node.width,
      y: ny + node.height / 2,
    };
  }
  if (isNo) {
    return {
      x: node.normX + node.width / 2,
      y: ny + node.height,
    };
  }

  // Default: bottom center
  return {
    x: node.normX + node.width / 2,
    y: ny + node.height,
  };
}

/**
 * Compute the entry point on the target node based on entryX/entryY ratios.
 */
function computeEntryPoint(
  node: NormalizedNode,
  entryX: number | undefined,
  entryY: number | undefined,
): { x: number; y: number } {
  const ny = node.normY + NODE_Y_OFFSET;

  if (entryX !== undefined && entryY !== undefined) {
    if (entryY === 0 || entryY === 1) {
      return {
        x: node.normX + node.width * entryX,
        y: entryY === 0 ? ny : ny + node.height,
      };
    }
    if (entryX === 0 || entryX === 1) {
      return {
        x: entryX === 0 ? node.normX : node.normX + node.width,
        y: ny + node.height * entryY,
      };
    }
    const cx = node.normX + node.width / 2;
    const cy = ny + node.height / 2;
    const rx = (entryX - 0.5) * 2;
    const ry = (entryY - 0.5) * 2;
    const absRx = Math.abs(rx);
    const absRy = Math.abs(ry);
    const hScale = node.width / 2;
    const vScale = node.height / 2;
    let scale: number;
    if (absRx * vScale >= absRy * hScale) {
      scale = hScale / (absRx || 0.001);
    } else {
      scale = vScale / (absRy || 0.001);
    }
    return {
      x: cx + rx * scale,
      y: cy + ry * scale,
    };
  }

  // Default: top center
  return {
    x: node.normX + node.width / 2,
    y: ny,
  };
}

export default function FlowchartCanvas({ page, onNodeClick, highlightedNodeId }: FlowchartCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  // ── Coordinate normalization ──────────────────────────────────────
  const { swimlanes, nodes, edges, canvasWidth, canvasHeight } = useMemo(() => {
    if (!page || page.nodes.length === 0) {
      return {
        swimlanes: [] as NormalizedLane[],
        nodes: [] as NormalizedNode[],
        edges: [] as Edge[],
        canvasWidth: 800,
        canvasHeight: 600,
      };
    }

    const roleLanes = page.swimlanes;

    // Collect all coordinate extents from nodes (primary) and swimlanes
    const allX: number[] = [];
    const allY: number[] = [];
    const allXW: number[] = [];
    const allYH: number[] = [];

    for (const node of page.nodes) {
      allX.push(node.x);
      allY.push(node.y);
      allXW.push(node.x + node.width);
      allYH.push(node.y + node.height);
    }

    for (const lane of roleLanes) {
      allX.push(lane.x);
      allY.push(lane.y);
      allXW.push(lane.x + lane.width);
      allYH.push(lane.y + lane.height);
    }

    const mnX = allX.length > 0 ? Math.min(...allX) : 0;
    const mnY = allY.length > 0 ? Math.min(...allY) : 0;
    const mxX = allXW.length > 0 ? Math.max(...allXW) : 800;
    const mxY = allYH.length > 0 ? Math.max(...allYH) : 600;

    // Normalize: offset so min x,y becomes 0, add padding
    const normLanes: NormalizedLane[] = roleLanes.map((l) => ({
      id: l.id,
      name: l.name,
      normX: l.x - mnX + PADDING,
      normY: l.y - mnY + PADDING,
      width: l.width,
      height: l.height,
    }));

    const normNodes: NormalizedNode[] = page.nodes.map((n) => ({
      ...n,
      normX: n.x - mnX + PADDING,
      normY: n.y - mnY + PADDING,
    }));

    return {
      swimlanes: normLanes,
      nodes: normNodes,
      edges: page.edges,
      canvasWidth: mxX - mnX + PADDING * 2,
      canvasHeight: mxY - mnY + PADDING * 2,
    };
  }, [page]);

  // ── Fit-to-viewport auto-scale ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || canvasWidth === 0) return;

    const updateScale = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const availableWidth = parent.clientWidth - 4;
      if (availableWidth > 0 && canvasWidth > 0) {
        const s = Math.min(1, availableWidth / canvasWidth);
        setFitScale(s);
      }
    };

    // Initial calculation
    updateScale();

    // Listen for resize
    const observer = new ResizeObserver(updateScale);
    const parentEl = el.parentElement;
    if (parentEl) observer.observe(parentEl);
    return () => observer.disconnect();
  }, [canvasWidth]);

  // ── Edge path computation ─────────────────────────────────────────
  const edgePaths = useMemo(() => {
    const nodeMap = new Map<string, NormalizedNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    return edges
      .map((edge) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return null;

        // Compute exit point on source node
        const exitPt = computeExitPoint(src, edge.exitX, edge.exitY, edge.label);

        // Compute entry point on target node
        const entryPt = computeEntryPoint(tgt, edge.entryX, edge.entryY);

        // Build orthogonal path
        const path = computeOrthogonalPath(exitPt.x, exitPt.y, entryPt.x, entryPt.y);

        // Label placement — at midpoint of the path
        const labelX = (exitPt.x + entryPt.x) / 2;
        const labelY = (exitPt.y + entryPt.y) / 2;

        return { path, label: edge.label, labelX, labelY };
      })
      .filter(Boolean) as EdgePath[];
  }, [edges, nodes]);

  // ── Zoom controls ─────────────────────────────────────────────────
  const effectiveZoom = zoom * fitScale;

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.3, 5)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.3, 0.15)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  // ── Pan via mouse ─────────────────────────────────────────────────
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        e.preventDefault();
      }
    },
    [panOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      }
    },
    [isPanning, panStart],
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // ── Node rendering ────────────────────────────────────────────────
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
        className =
          'node-process' +
          (isHighlighted
            ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary'
            : '');
        content = (
          <span className="text-[10px] md:text-[11px] leading-tight px-1">
            {n.text}
          </span>
        );
        break;

      case 'decision': {
        className =
          'node-decision' +
          (isHighlighted
            ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary'
            : '');
        // Use max dimension for the diamond shape via CSS clip-path
        const maxDim = Math.max(n.width, n.height, 60);
        baseStyle.width = maxDim;
        baseStyle.height = maxDim;
        baseStyle.left = n.normX - (maxDim - n.width) / 2;
        baseStyle.top = n.normY - (maxDim - n.height) / 2 + SWIMLANE_HEADER_HEIGHT;
        content = (
          <span className="text-[9px] md:text-[10px] leading-tight px-1">
            {n.text}
          </span>
        );
        break;
      }

      case 'start':
        className =
          'node-start' +
          (isHighlighted
            ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary'
            : '');
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
        className =
          'node-end' +
          (isHighlighted
            ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary'
            : '');
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
        className =
          'node-offpage' +
          (isHighlighted
            ? ' ring-2 ring-accent-gold ring-offset-2 ring-offset-bg-primary'
            : '');
        content = <span className="text-[11px] font-bold">{n.text}</span>;
        break;

      default:
        className =
          'bg-slate-700/50 border border-slate-500/30 rounded cursor-default flex items-center justify-center text-[10px] text-slate-400 p-1';
        content = <span>{n.text}</span>;
        break;
    }

    return (
      <div
        key={n.id}
        className={className}
        style={baseStyle}
        onClick={() => n.type !== 'connector' && onNodeClick(n)}
        data-node-id={n.id}
        title={n.text}
      >
        {content}
      </div>
    );
  };

  // ── Empty state ───────────────────────────────────────────────────
  if (!page || page.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <p>Diagram tidak tersedia untuk halaman ini</p>
      </div>
    );
  }

  const effectiveWidth = canvasWidth;
  const effectiveHeight = canvasHeight + SWIMLANE_HEADER_HEIGHT;

  // ── Main render ───────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-bg-secondary border-b border-border-primary flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={zoomIn}
            className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Perbesar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
            </svg>
          </button>
          <button
            onClick={zoomOut}
            className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Perkecil"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 rounded text-xs hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Atur ulang zoom"
          >
            {Math.round(effectiveZoom * 100)}%
          </button>
          <span className="text-xs text-text-muted ml-2">
            {page.nodes.length} langkah · {page.edges.length} koneksi
          </span>
        </div>
        <div className="text-xs text-text-muted">Shift+Seret untuk geser</div>
      </div>

      {/* Canvas scroll container */}
      <div
        ref={containerRef}
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
            transform: `scale(${effectiveZoom})`,
            transformOrigin: 'top left',
            transition: 'transform 0.1s ease',
          }}
        >
          {/* ── Swimlane column backgrounds ── */}
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
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] text-text-muted/20 uppercase tracking-wider font-medium select-none">
                  {lane.name}
                </span>
              </div>
            </div>
          ))}

          {/* ── Swimlane headers ── */}
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

          {/* ── SVG edges layer ── */}
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
                  strokeOpacity="0.8"
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
                      dx="0"
                      dy="0"
                      style={{
                        paintOrder: 'stroke',
                        stroke: '#0b1424',
                        strokeWidth: 3,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }}
                    >
                      {ep.label}
                    </tspan>
                    <tspan dx="0" dy="0">
                      {ep.label}
                    </tspan>
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* ── Nodes layer ── */}
          {nodes.map(renderNode)}
        </div>
      </div>
    </div>
  );
}
