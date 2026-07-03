export interface SwLane {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowNode {
  id: string;
  text: string;
  type: string; // 'process' | 'decision' | 'start' | 'end' | 'offpage' | 'connector'
  x: number;
  y: number;
  width: number;
  height: number;
  swimlane_id?: string;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
  exitX?: number;
  exitY?: number;
  entryX?: number;
  entryY?: number;
  points?: Array<{x: number; y: number}>;
}

export interface Page {
  name: string;
  swimlanes: SwLane[];
  nodes: FlowNode[];
  edges: Edge[];
}

export type SOPData = Page[];
