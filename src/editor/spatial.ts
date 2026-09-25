import type { Rect } from "../core/index.ts";

function cellRange(rect: Rect, cellSize: number, limit: number) {
  const left = Math.floor(rect.x / cellSize),
    right = Math.floor((rect.x + rect.width) / cellSize),
    top = Math.floor(rect.y / cellSize),
    bottom = Math.floor((rect.y + rect.height) / cellSize);
  const columns = right - left + 1, rows = bottom - top + 1;
  // A small span alone does not ensure that incrementing its coordinates makes
  // progress. Unsafe coordinates and overflowing extents use the fallback.
  if (
    ![left, right, top, bottom].every(Number.isSafeInteger) ||
    columns <= 0 || rows <= 0 || columns * rows > limit
  ) return null;
  return { left, top, columns, rows };
}

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
    const range = cellRange(rect, this.cellSize, 128);
    if (!range) {
      this.overflow.add(id);
      return;
    }
    for (let x = 0; x < range.columns; x++) {
      for (let y = 0; y < range.rows; y++) {
        const key = `${range.left + x},${range.top + y}`;
        const cell = this.cells.get(key) ?? new Set();
        cell.add(id);
        this.cells.set(key, cell);
      }
    }
  }
  query(rect: Rect): string[] {
    const range = cellRange(rect, this.cellSize, 1024);
    const candidates = new Set(this.overflow);
    if (!range) {
      this.bounds.forEach((_, id) => candidates.add(id));
    } else {
      for (let x = 0; x < range.columns; x++) {
        for (let y = 0; y < range.rows; y++) {
          this.cells.get(`${range.left + x},${range.top + y}`)?.forEach((id) =>
            candidates.add(id)
          );
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
