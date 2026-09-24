import type { Point, Rect } from "../core/types.ts";
export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}
export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}
export interface LayoutGroup {
  id: string;
  nodeIds: readonly string[];
  parentId?: string;
}
export interface LayoutInput {
  nodes: readonly LayoutNode[];
  edges: readonly LayoutEdge[];
  groups?: readonly LayoutGroup[];
}
export interface LayoutOptions {
  direction?: "right" | "down";
  rankSpacing?: number;
  nodeSpacing?: number;
  origin?: Point;
  signal?: AbortSignal;
}
export interface LayoutResult {
  positions: Record<string, Point>;
  groups: Record<string, Rect>;
  bounds: Rect;
}
export interface LayoutWorkerRequest {
  id: string;
  input: LayoutInput;
  options?: Omit<LayoutOptions, "signal">;
}
export interface LayoutWorkerResponse {
  id: string;
  result?: LayoutResult;
  error?: string;
}
