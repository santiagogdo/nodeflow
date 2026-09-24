import { Position, Size } from '../../utils/interfaces';
import { EventBus } from '../events/eventBus';
import { EventType } from '../events/eventType';
import { RenderTransform } from '../rendering/renderer';

export default class ViewportManager {
  private transform: RenderTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  private panStart: Position | null = null;
  private panOffset: Position = { x: 0, y: 0 };
  private mouse: Position | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private events: EventBus,
  ) {
    events.on(EventType.VIEW_PAN_STARTED, (payload) => {
      if (!payload) return;
      this.panStart = payload.position;
      this.panOffset = { x: this.transform.offsetX, y: this.transform.offsetY };
    });
    events.on(EventType.VIEW_PANNED, (payload) => {
      if (!payload || !this.panStart) return;
      this.setViewport({
        offsetX: this.panOffset.x + payload.position.x - this.panStart.x,
        offsetY: this.panOffset.y + payload.position.y - this.panStart.y,
      });
    });
    events.on(EventType.VIEW_PAN_ENDED, () => {
      this.panStart = null;
    });
    events.on(EventType.VIEW_ZOOMED, (payload) => {
      if (!payload) return;
      const before = this.toWorld(payload.offset.x, payload.offset.y);
      const scale = Math.min(5, Math.max(0.1, payload.scale));
      this.setViewport({
        scale,
        offsetX: payload.offset.x - before.x * scale,
        offsetY: payload.offset.y - before.y * scale,
      });
    });
  }

  public getViewport(): RenderTransform {
    return { ...this.transform };
  }
  public setViewport(update: Partial<RenderTransform>): void {
    const next = { ...this.transform, ...update };
    if (![next.scale, next.offsetX, next.offsetY].every(Number.isFinite) || next.scale <= 0) {
      throw new Error('Viewport requires finite offsets and a positive scale');
    }
    next.scale = Math.min(5, Math.max(0.1, next.scale));
    this.transform = next;
    this.events.emit(EventType.VIEW_CHANGED, this.getViewport());
    this.events.emit(EventType.SCENE_CHANGED);
  }
  public getScale(): number {
    return this.transform.scale;
  }
  public getOffsetX(): number {
    return this.transform.offsetX;
  }
  public getOffsetY(): number {
    return this.transform.offsetY;
  }
  public setScale(scale: number): void {
    this.setViewport({ scale });
  }
  public setOffsetX(offsetX: number): void {
    this.setViewport({ offsetX });
  }
  public setOffsetY(offsetY: number): void {
    this.setViewport({ offsetY });
  }
  public getIsPanning(): boolean {
    return this.panStart !== null;
  }
  public stopPanning(): void {
    this.panStart = null;
  }
  public getViewportSize(): Size {
    const { width, height } = this.canvas.getBoundingClientRect();
    return { width, height };
  }
  public toWorld(x: number, y: number): Position {
    return {
      x: (x - this.transform.offsetX) / this.transform.scale,
      y: (y - this.transform.offsetY) / this.transform.scale,
    };
  }
  public getMousePosition(): Position | null {
    return this.mouse;
  }
  public setMousePosition(position: Position | null): void {
    this.mouse = position;
  }
  public getDevicePixelRatio(): number {
    return window.devicePixelRatio || 1;
  }
}
