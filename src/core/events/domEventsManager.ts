import { Editor } from '../editor/editor';
import { Node } from '../components/node';
import { Port } from '../components/port';
import { EventBus } from './eventBus';
import { EventType } from './eventType';
import { MouseButton } from '../../utils/buttonType';

/** Translates DOM input into editor events and owns all browser subscriptions. */
export class DomEventsManager {
  private cleanups: (() => void)[] = [];
  private resizeObserver?: ResizeObserver;
  private activePointer: number | null = null;
  private destroyed = false;

  constructor(
    private editor: Editor,
    private container: HTMLElement,
    private canvas: HTMLCanvasElement,
    private backgroundCanvas: HTMLCanvasElement,
    private eventBus: EventBus,
  ) {
    const pointer = typeof window.PointerEvent !== 'undefined';
    this.listen(canvas, pointer ? 'pointerdown' : 'mousedown', (event) =>
      this.onDown(event as MouseEvent),
    );
    this.listen(window, pointer ? 'pointermove' : 'mousemove', (event) =>
      this.onMove(event as MouseEvent),
    );
    this.listen(window, pointer ? 'pointerup' : 'mouseup', () => this.endInteraction());
    if (pointer) {
      this.listen(canvas, 'pointercancel', () => this.endInteraction());
      this.listen(canvas, 'lostpointercapture', () => this.endInteraction());
    }
    this.listen(window, 'blur', () => this.endInteraction());
    this.listen(canvas, 'wheel', (event) => this.onWheel(event as WheelEvent), {
      passive: false,
    });
    this.listen(canvas, 'contextmenu', (event) => {
      event.preventDefault();
    });
    this.listen(
      document,
      pointer ? 'pointerdown' : 'mousedown',
      (event) => {
        if (!this.editor.getContextMenuElement().contains(event.target as globalThis.Node))
          this.editor.closeContextMenu();
      },
      true,
    );
    this.listen(canvas, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') {
        this.eventBus.emit(EventType.CONNECTION_CANCELLED);
        this.editor.closeContextMenu();
        this.endInteraction();
      }
    });
    this.listen(window, 'resize', () => this.handleResize());
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);
    }
    this.handleResize();
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  public handleResize(): void {
    if (this.destroyed) return;
    const { width, height } = this.container.getBoundingClientRect();
    const ratio = this.editor.getDevicePixelRatio();
    const size = {
      width: Math.max(0, Math.floor(width * ratio)),
      height: Math.max(0, Math.floor(height * ratio)),
    };
    let changed = false;
    for (const canvas of [this.canvas, this.backgroundCanvas]) {
      if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width;
        canvas.height = size.height;
        changed = true;
      }
    }
    if (changed) {
      this.eventBus.emit(EventType.CANVAS_RESIZED, { size, devicePixelRatio: ratio });
      this.editor.renderBackground();
      this.eventBus.emit(EventType.SCENE_CHANGED);
    }
  }

  private local(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onDown(event: MouseEvent): void {
    if ('isPrimary' in event && !event.isPrimary) return;
    const position = this.local(event);
    const component = this.editor.findComponentAt(position.x, position.y);
    this.canvas.focus({ preventScroll: true });
    if (event.button === MouseButton.RIGHT) {
      event.preventDefault();
      this.eventBus.emit(EventType.CONTEXT_MENU_OPEN, {
        position,
        component: component instanceof Node ? component : undefined,
      });
      return;
    }
    if (event.button !== MouseButton.LEFT && event.button !== MouseButton.MIDDLE) return;
    event.preventDefault();
    if ('pointerId' in event && typeof event.pointerId === 'number') {
      this.activePointer = event.pointerId;
      this.canvas.setPointerCapture?.(event.pointerId);
    }
    this.canvas.style.cursor = 'grabbing';
    if (event.button === MouseButton.LEFT) {
      if (component instanceof Port) {
        const pending = this.editor.getPendingConnectionPort();
        if (pending && pending !== component) {
          this.eventBus.emit(EventType.CONNECTION_COMPLETED, {
            sourcePort: pending,
            targetPort: component,
          });
        } else if (pending) {
          this.eventBus.emit(EventType.CONNECTION_CANCELLED);
        } else {
          this.eventBus.emit(EventType.CONNECTION_STARTED, {
            port: component,
            position: this.editor.toWorld(position.x, position.y),
          });
        }
        return;
      }
      if (component instanceof Node) {
        this.eventBus.emit(EventType.COMPONENT_DRAG_STARTED, {
          component,
          offset: this.editor.toWorld(position.x, position.y),
        });
        return;
      }
      if (this.editor.getPendingConnectionPort()) {
        this.eventBus.emit(EventType.CONNECTION_CANCELLED);
        return;
      }
    }
    this.eventBus.emit(EventType.VIEW_PAN_STARTED, { position });
  }

  private onMove(event: MouseEvent): void {
    if (
      this.activePointer !== null &&
      'pointerId' in event &&
      event.pointerId !== this.activePointer
    )
      return;
    const components = this.editor.getComponentManager();
    const viewport = this.editor.getViewportManager();
    const inside = event.target === this.canvas;
    if (!inside && !components.getDraggingComponent() && !viewport.getIsPanning()) {
      if (components.getHoveredComponent()) components.setHoveredComponent(null);
      return;
    }
    const position = this.local(event);
    viewport.setMousePosition(this.editor.toWorld(position.x, position.y));
    const hovered = inside ? this.editor.findComponentAt(position.x, position.y) : null;
    if (hovered !== components.getHoveredComponent()) components.setHoveredComponent(hovered);
    if (viewport.getIsPanning()) this.eventBus.emit(EventType.VIEW_PANNED, { position });
    else if (components.getDraggingComponent()) {
      this.eventBus.emit(EventType.COMPONENT_DRAGGED, {
        component: components.getDraggingComponent()!,
        position: this.editor.toWorld(position.x, position.y),
      });
    } else if (components.getPendingConnectionPort()) {
      this.eventBus.emit(EventType.CONNECTION_UPDATED, {
        port: components.getPendingConnectionPort()!,
        position: this.editor.toWorld(position.x, position.y),
      });
    }
  }

  private endInteraction(): void {
    const dragging = this.editor.getComponentManager().getDraggingComponent();
    if (dragging) this.eventBus.emit(EventType.COMPONENT_DRAG_ENDED, { component: dragging });
    if (this.editor.getViewportManager().getIsPanning())
      this.eventBus.emit(EventType.VIEW_PAN_ENDED);
    const pointer = this.activePointer;
    this.activePointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture?.(pointer))
      this.canvas.releasePointerCapture(pointer);
    this.canvas.style.cursor = 'grab';
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const offset = this.local(event);
    const scale = this.editor.getViewport().scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1);
    this.eventBus.emit(EventType.VIEW_ZOOMED, { scale, offset });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.endInteraction();
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
  }
}
