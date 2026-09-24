import type { Rect } from "../core/index.ts";

/** Broad-phase spatial hash, including an overflow bucket for very long connections. */
export class SpatialIndex {
  private cells = new Map<string, Set<string>>();
  private bounds = new Map<string, Rect>();
  private overflow = new Set<string>();
  constructor(private cellSize = 256) {}
  clear() {
    this.cells.clear();
    this.bounds.clear();
    this.overflow.clear();
  }
  insert(id: string, rect: Rect) {
    this.bounds.set(id, rect);
    const left = Math.floor(rect.x / this.cellSize),
      right = Math.floor((rect.x + rect.width) / this.cellSize),
      top = Math.floor(rect.y / this.cellSize),
      bottom = Math.floor((rect.y + rect.height) / this.cellSize);
    if ((right - left + 1) * (bottom - top + 1) > 128) {
      this.overflow.add(id);
      return;
    }
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const key = `${x},${y}`;
        const cell = this.cells.get(key) ?? new Set();
        cell.add(id);
        this.cells.set(key, cell);
      }
    }
  }
  query(rect: Rect): string[] {
    const left = Math.floor(rect.x / this.cellSize),
      right = Math.floor((rect.x + rect.width) / this.cellSize),
      top = Math.floor(rect.y / this.cellSize),
      bottom = Math.floor((rect.y + rect.height) / this.cellSize);
    const candidates = new Set(this.overflow);
    if ((right - left + 1) * (bottom - top + 1) > 1024) {
      this.bounds.forEach((_, id) => candidates.add(id));
    } else {
      for (let x = left; x <= right; x++) {
        for (let y = top; y <= bottom; y++) {
          this.cells.get(`${x},${y}`)?.forEach((id) => candidates.add(id));
        }
      }
    }
    return [...candidates].filter((id) =>
      intersects(rect, this.bounds.get(id)!)
    );
  }
}
export function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}
export function union(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map((rect) => rect.x)),
    y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
}
