import { Page, SwLane, FlowNode, Edge } from './types';

interface RawSwLane {
  id: string;
  name: string;
  geometry: { x: number; y: number; width: number; height: number; relative?: string };
  style?: string;
  [key: string]: unknown;
}

interface RawNode {
  id: string;
  value?: string;
  style?: string;
  geometry: { x: number; y: number; width: number; height: number; relative?: string };
  is_rhombus?: boolean;
  belongs_to?: string;
  parent?: string;
  [key: string]: unknown;
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: string;
  points?: Array<{ x: number; y: number }>;
  parent?: string;
  [key: string]: unknown;
}

interface RawPage {
  name: string;
  swimlanes: RawSwLane[];
  nodes: RawNode[];
  edges: RawEdge[];
  textboxes?: unknown[];
  containers?: RawNode[];
}

function getNodeType(node: RawNode): string {
  const style = node.style || '';
  const value = (node.value || '').toLowerCase();

  if (node.is_rhombus || style.includes('rhombus')) return 'decision';
  if (style.includes('mxgraph.flowchart.start_2') || style.includes('mxgraph.dfd.start')) return 'start';
  if (style.includes('ellipse') && value === 'selesai') return 'end';
  if (style.includes('ellipse') && value === 'mulai') return 'start';
  if (value === 'mulai') return 'start';
  if (value === 'selesai') return 'end';
  if (style.includes('offPageConnector')) return 'offpage';
  if (style.includes('ellipse')) {
    if (value.includes('selesai') || value.includes('end')) return 'end';
    if (value.includes('mulai') || value.includes('start')) return 'start';
    if (value === '') return 'connector';
    return 'process';
  }
  return 'process';
}

export function shortPageName(name: string, index: number): string {
  const trimmed = name.trim();

  // If it starts with a number like "01  Pengajuan Pelatihan" or "03-Pemanggilan Peserta"
  const match = trimmed.match(/^(\d{2})\s*[-–— ]?\s*(.+)/);
  if (match) {
    const num = match[1];
    const label = match[2].trim();
    return `${num} ${label}`;
  }

  // Known mappings for non-numbered pages
  const knownMappings: Record<string, string> = {
    'Full SOP - Activity Diagram': '00 Diagram Lengkap',
    'General Flow - Activity Diagram': 'General Flow',
    'General Flow w Descripttion - Activity Diagram': 'Flow + Deskripsi',
  };

  if (knownMappings[trimmed]) return knownMappings[trimmed];

  // Fallback
  return trimmed;
}

const ROLE_NAMES = [
  'Sekretaris Utama',
  'Kedeputian Bidang Teknis',
  'Tim Pelatihan Sensus Survei Pusdiklat',
  'Learning Partner',
  'Subject Matter',
  'Peserta',
  'Manajer Kelas',
  'Pengajar',
  'Tim TIPD Pusdiklat',
  'Sekretaris',
  'Tim Keuangan Pusdiklat',
  'Tim Humas',
  'Eselon',
];

export function isRoleSwimlane(lane: RawSwLane): boolean {
  return ROLE_NAMES.some((r) => lane.name.trim().startsWith(r));
}

const swimlaneColors = [
  'bg-blue-800/30 border-blue-500/40',
  'bg-emerald-800/25 border-emerald-500/35',
  'bg-purple-800/25 border-purple-500/35',
  'bg-amber-800/25 border-amber-500/35',
  'bg-rose-800/25 border-rose-500/35',
  'bg-cyan-800/25 border-cyan-500/35',
  'bg-lime-800/25 border-lime-500/35',
  'bg-orange-800/25 border-orange-500/35',
  'bg-teal-800/25 border-teal-500/35',
  'bg-pink-800/25 border-pink-500/35',
  'bg-indigo-800/25 border-indigo-500/35',
  'bg-sky-800/25 border-sky-500/35',
  'bg-violet-800/25 border-violet-500/35',
  'bg-yellow-800/25 border-yellow-500/35',
  'bg-red-800/25 border-red-500/35',
  'bg-green-800/25 border-green-500/35',
];

export function getSwimlaneColor(index: number): string {
  return swimlaneColors[index % swimlaneColors.length];
}

export function parsePage(raw: RawPage, index: number): Page {
  const parentMap = new Map<string, RawSwLane | RawNode>();

  // Build parent map from all swimlanes, nodes, AND containers
  for (const lane of raw.swimlanes) {
    parentMap.set(lane.id, lane);
  }
  for (const node of raw.nodes) {
    parentMap.set(node.id, node);
  }
  for (const container of (raw.containers || [])) {
    parentMap.set(container.id, container);
  }

  // Filter to role swimlanes only, sorted by x position
  const roleLanes = raw.swimlanes.filter(isRoleSwimlane);
  roleLanes.sort((a, b) => a.geometry.x - b.geometry.x);

  const swimlanes: SwLane[] = roleLanes.map((l) => ({
    id: l.id,
    name: l.name,
    x: l.geometry.x,
    y: l.geometry.y,
    width: l.geometry.width,
    height: l.geometry.height,
  }));

  // Calculate absolute positions for nodes and assign to swimlanes
  const nodes: FlowNode[] = raw.nodes
    .filter((n) => {
      const style = n.style || '';
      // Filter out purely decorative connector nodes (small circles)
      if (style.includes('mxgraph.flowchart.start_2') && !n.value && n.geometry.width < 30) return false;
      return true;
    })
    .map((n) => {
      const parentId = n.parent || n.belongs_to || '';
      const parent = parentMap.get(parentId);

      let absX = n.geometry.x ?? 0;
      let absY = n.geometry.y ?? 0;

      if (parent && 'geometry' in parent) {
        absX = parent.geometry.x + (n.geometry.x ?? 0);
        absY = parent.geometry.y + (n.geometry.y ?? 0);
      }

      const nodeType = getNodeType(n);

      // Determine which role swimlane this node belongs to
      // 1. Check if parent/belongs_to is a role swimlane
      let swimlaneId: string | undefined;
      const directLaneId = n.belongs_to || n.parent || '';
      const directLane = parentMap.get(directLaneId) as RawSwLane | undefined;

      if (directLane && isRoleSwimlane(directLane)) {
        swimlaneId = directLane.id;
      } else if (roleLanes.length > 0) {
        // 2. Position-based detection: find which role lane contains this node's x position
        // Use a small margin for the x-range check
        const containingLane = roleLanes.find((l) => {
          const laneX = l.geometry.x;
          const laneW = l.geometry.width;
          return absX >= laneX - 5 && absX < laneX + laneW + 5;
        });
        if (containingLane) {
          swimlaneId = containingLane.id;
        }
      }

      return {
        id: n.id,
        text: n.value || '',
        type: nodeType,
        x: absX,
        y: absY,
        width: n.geometry.width,
        height: n.geometry.height,
        swimlane_id: swimlaneId,
      };
    });

  // Parse float from style string like "exitX=0.5;exitY=1"
  function parseFloatFromStyle(style: string, key: string): number | undefined {
    const regex = new RegExp(`${key}=([^;\\s]+)`);
    const match = style.match(regex);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) return val;
    }
    return undefined;
  }

  // Parse edges
  const edges: Edge[] = raw.edges.map((e) => {
    const style = e.style || '';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || '',
      exitX: parseFloatFromStyle(style, 'exitX'),
      exitY: parseFloatFromStyle(style, 'exitY'),
      entryX: parseFloatFromStyle(style, 'entryX'),
      entryY: parseFloatFromStyle(style, 'entryY'),
      points: e.points || undefined,
    };
  });

  return {
    name: raw.name,
    swimlanes,
    nodes,
    edges,
  };
}

export function parseSOPData(rawData: RawPage[]): Page[] {
  return rawData.map((raw, i) => parsePage(raw, i));
}
