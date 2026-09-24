import { Connection } from '../components/connection';
import { Port } from '../components/port';
import { Node } from '../components/node';
import { Component } from '../components/component';
import { StyleManager, NewDefaultEditorStyles } from '../styles/styles';
import { AnimationManager } from '../animation/animationManager';
import { StyleAnimator } from '../animation/styleAnimator';
import { Renderer, RenderTransform } from '../rendering/renderer';
import { BackgroundRenderer } from '../rendering/backgroundRenderer';
import { ContextMenu, ContextMenuContext } from '../contextMenu/contextMenu';
import { DomEventsManager } from '../events/domEventsManager';
import { EventBus } from '../events/eventBus';
import { EventEmitter } from '../events/eventEmitter';
import { EventPayloads, EventType } from '../events/eventType';
import { AddNodeParams, EditorConfig } from './types';
import ComponentManager from '../components/componentManager';
import ViewportManager from './viewportManager';
import { cloneJSON, EditorState, parseEditorState } from './serialization';

/** Public editor interface. Managers remain available for advanced integrations. */
export class Editor {
  private canvas: HTMLCanvasElement;
  private backgroundCanvas: HTMLCanvasElement;
  private menu: ContextMenu;
  private animationManager: AnimationManager;
  private componentManager: ComponentManager;
  private viewportManager: ViewportManager;
  private renderer: Renderer;
  private backgroundRenderer: BackgroundRenderer;
  private frameId: number | null = null;
  private dirty = true;
  private destroyed = false;
  private originalPosition: string;
  private changedPosition: boolean;

  public readonly styleManager: StyleManager;
  public readonly domEvents: DomEventsManager;
  public readonly eventBus: EventBus;
  /** Application-defined events, retained for compatibility. */
  public readonly customEvents = new EventEmitter();
  public readonly editorConfig: EditorConfig;

  constructor(
    private container: HTMLElement,
    config: EditorConfig = {},
  ) {
    // Invalid initial data must not attach DOM or register browser listeners.
    const initialState =
      config.initialState === undefined ? undefined : parseEditorState(config.initialState);
    this.editorConfig = { ...config };
    this.originalPosition = container.style.position;
    this.changedPosition = !container.style.position || container.style.position === 'static';
    if (this.changedPosition) container.style.position = 'relative';

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      position: 'relative',
      zIndex: '1',
      background: 'transparent',
      cursor: 'grab',
      touchAction: 'none',
    });
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Node editor');
    this.backgroundCanvas = document.createElement('canvas');
    Object.assign(this.backgroundCanvas.style, {
      width: '100%',
      height: '100%',
      position: 'absolute',
      inset: '0',
      zIndex: '0',
      pointerEvents: 'none',
      background: config.background ?? 'transparent',
    });
    this.backgroundCanvas.setAttribute('aria-hidden', 'true');
    this.menu = new ContextMenu();
    if (!this.canvas.getContext('2d') || !this.backgroundCanvas.getContext('2d')) {
      if (this.changedPosition) container.style.position = this.originalPosition;
      throw new Error('Cannot get 2D canvas context');
    }
    container.append(this.backgroundCanvas, this.canvas, this.menu.element);

    this.eventBus = new EventBus();
    this.eventBus.on(EventType.SCENE_CHANGED, () => this.invalidate());
    this.styleManager = new StyleManager(this.eventBus);
    this.animationManager = new AnimationManager(this.eventBus);
    new StyleAnimator(this.styleManager, this.animationManager);
    this.viewportManager = new ViewportManager(this.canvas, this.eventBus);
    this.componentManager = new ComponentManager(
      this.styleManager,
      this.viewportManager,
      this.eventBus,
    );
    this.renderer = new Renderer(this);
    this.backgroundRenderer = new BackgroundRenderer(this, this.eventBus);
    this.eventBus.on(EventType.VIEW_CHANGED, () => {
      if (!this.editorConfig.grid?.locked) this.renderBackground();
    });
    this.eventBus.on(EventType.CONTEXT_MENU_OPEN, (payload) => {
      if (payload) this.openContextMenu(payload);
    });
    this.eventBus.on(EventType.CONTEXT_MENU_REOPEN, (payload) => {
      if (payload) this.openContextMenu(payload);
    });
    this.eventBus.on(EventType.CONTEXT_MENU_CLOSE, () => this.closeContextMenu());
    this.domEvents = new DomEventsManager(
      this,
      container,
      this.canvas,
      this.backgroundCanvas,
      this.eventBus,
    );
    if (initialState) this.deserialize(initialState);
    this.renderBackground();
    this.invalidate();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Editor has been destroyed');
  }

  private invalidate(): void {
    if (this.destroyed) return;
    this.dirty = true;
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.frameId === null && !this.destroyed)
      this.frameId = requestAnimationFrame(this.frameLoop);
  }

  private frameLoop = (time: number): void => {
    this.frameId = null;
    if (this.destroyed) return;
    const animating = this.animationManager.hasActiveAnimations();
    this.animationManager.update(time);
    if (this.dirty || animating) this.render();
    this.renderer.fpsCounter.frame(time);
    if (this.dirty || this.animationManager.hasActiveAnimations()) this.scheduleFrame();
  };

  public render(): void {
    if (this.destroyed) return;
    this.dirty = false;
    this.renderer.renderScene({
      nodes: this.getNodes(),
      connections: this.getConnections(),
      transform: this.getViewport(),
      pendingConnection: {
        port: this.componentManager.getPendingConnectionPort(),
        position: this.componentManager.getPendingConnectionPosition(),
      },
    });
  }

  public renderBackground(): void {
    if (this.destroyed) return;
    this.backgroundRenderer.render(
      this.editorConfig.grid?.locked
        ? { scale: 1, offsetX: 0, offsetY: 0 }
        : this.getViewport(),
    );
  }

  public addNode(params: AddNodeParams): Node {
    this.assertAlive();
    return this.componentManager.addNode(params);
  }
  public removeNode(id: string): void {
    this.assertAlive();
    this.componentManager.removeNode(id);
  }
  public connectPorts(source: Port, target: Port): Connection | undefined {
    this.assertAlive();
    return this.componentManager.connectPorts(source, target);
  }
  public disconnect(connection: Connection): void {
    this.assertAlive();
    this.componentManager.disconnect(connection);
  }
  public clear(): void {
    this.assertAlive();
    this.closeContextMenu();
    this.componentManager.clear();
    this.viewportManager.stopPanning();
    this.animationManager.clear();
    this.invalidate();
  }
  public getNodes(): Node[] {
    return this.componentManager.getNodes();
  }
  public getConnections(): Connection[] {
    return this.componentManager.getConnections();
  }
  public getNodeById(id: string): Node | undefined {
    return this.componentManager.getNodeById(id);
  }
  public getConnectionById(id: string): Connection | undefined {
    return this.componentManager.getConnectionById(id);
  }
  public setDefaultStyles(styles: Partial<NewDefaultEditorStyles>): void {
    this.assertAlive();
    this.styleManager.setDefaultStyles(styles);
  }
  public getViewport(): RenderTransform {
    return this.viewportManager.getViewport();
  }
  public setViewport(viewport: Partial<RenderTransform>): void {
    this.assertAlive();
    this.viewportManager.setViewport(viewport);
  }
  public toWorld(x: number, y: number) {
    return this.viewportManager.toWorld(x, y);
  }
  public setOffsetX(offsetX: number): void {
    this.setViewport({ offsetX });
  }
  public setOffsetY(offsetY: number): void {
    this.setViewport({ offsetY });
  }
  public setScale(scale: number): void {
    this.setViewport({ scale });
  }
  public getOffsetX(): number {
    return this.viewportManager.getOffsetX();
  }
  public getOffsetY(): number {
    return this.viewportManager.getOffsetY();
  }
  public getScale(): number {
    return this.viewportManager.getScale();
  }
  public getDevicePixelRatio(): number {
    return this.viewportManager.getDevicePixelRatio();
  }
  public findComponentAt(x: number, y: number): Component<any> | null {
    return this.componentManager.findComponentAt(x, y);
  }
  public getHoveredComponent(): Component<any> | null {
    return this.componentManager.getHoveredComponent();
  }
  public setHoveredComponent(component: Component<any> | null): void {
    this.assertAlive();
    this.componentManager.setHoveredComponent(component);
  }
  public getPendingConnectionPort(): Port | null {
    return this.componentManager.getPendingConnectionPort();
  }
  public setPendingConnectionPort(port: Port | null): void {
    this.assertAlive();
    this.componentManager.setPendingConnectionPort(port);
  }
  public on<T extends EventType>(
    event: T,
    callback: (payload?: EventPayloads[T]) => void,
  ): () => void {
    this.assertAlive();
    this.eventBus.on(event, callback);
    return () => this.eventBus.off(event, callback);
  }

  /** Returns a detached snapshot, suitable for storage or inspection. */
  public toJSON(): EditorState {
    this.assertAlive();
    return cloneJSON({
      version: 1,
      viewport: this.getViewport(),
      styles: this.styleManager.getDefaultStyles(),
      nodes: this.getNodes().map((node) => ({
        id: node.id,
        position: { ...node.position },
        label: node.label,
        data: node.data,
        style: this.styleManager.getBaseStyle(node),
        ports: node.ports.map((port) => ({
          id: port.id,
          type: port.type,
          position: { ...port.position },
          style: this.styleManager.getBaseStyle(port),
        })),
      })),
      connections: this.getConnections().map((connection) => ({
        id: connection.id,
        sourcePortId: connection.sourcePort.id,
        targetPortId: connection.targetPort.id,
        style: this.styleManager.getBaseStyle(connection),
      })),
    }) as EditorState;
  }
  public serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  /** Replaces graph contents after validating the entire snapshot. */
  public deserialize(input: string | EditorState): void {
    this.assertAlive();
    const state = parseEditorState(input);
    this.clear();
    this.styleManager.replaceDefaultStyles(state.styles);
    const ports = new Map<string, Port>();
    for (const saved of state.nodes) {
      const node = this.addNode(saved);
      node.ports.forEach((port) => ports.set(port.id, port));
    }
    for (const saved of state.connections) {
      this.componentManager.connectPorts(
        ports.get(saved.sourcePortId)!,
        ports.get(saved.targetPortId)!,
        saved,
      );
    }
    this.setViewport(state.viewport);
  }

  private openContextMenu(
    payload: NonNullable<EventPayloads[EventType.CONTEXT_MENU_OPEN]>,
  ): void {
    if (this.editorConfig.contextMenu === false) return;
    const context: ContextMenuContext = {
      node: payload.component instanceof Node ? payload.component : undefined,
      position: this.toWorld(payload.position.x, payload.position.y),
    };
    const items =
      typeof this.editorConfig.contextMenu === 'function'
        ? this.editorConfig.contextMenu(context)
        : context.node
          ? [{ label: 'Delete node', onSelect: () => this.removeNode(context.node!.id) }]
          : [
              {
                label: 'Add node',
                onSelect: () => this.addNode({ position: context.position }),
              },
            ];
    this.menu.open(payload.position, context, items);
  }
  public closeContextMenu(): void {
    this.menu.close();
  }
  public getContextMenuElement(): HTMLElement {
    return this.menu.element;
  }
  public getAnimationManager() {
    return this.animationManager;
  }
  public getBackgroundRenderer() {
    return this.backgroundRenderer;
  }
  public getStyleManager() {
    return this.styleManager;
  }
  public getComponentManager() {
    return this.componentManager;
  }
  public getViewportManager() {
    return this.viewportManager;
  }
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
  public getBackgroundCanvas(): HTMLCanvasElement {
    return this.backgroundCanvas;
  }

  /** Stops frames, observers, input, and animations, preserving unrelated container content. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.domEvents.destroy();
    this.componentManager.clear();
    this.animationManager.clear();
    this.styleManager.resetAll();
    this.eventBus.clear();
    this.customEvents.clear();
    this.menu.destroy();
    this.canvas.remove();
    this.backgroundCanvas.remove();
    if (this.changedPosition && this.container.style.position === 'relative')
      this.container.style.position = this.originalPosition;
  }
  public dispose(): void {
    this.destroy();
  }
}
