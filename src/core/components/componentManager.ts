import { Port } from './port';
import { Connection } from './connection';
import { ConnectionStyle, StyleManager, StyleStateParams } from '../styles/styles';
import { AddNodeParams } from '../editor/types';
import { Position } from '../../utils/interfaces';
import { Component } from './component';
import ViewportManager from '../editor/viewportManager';
import { EventBus } from '../events/eventBus';
import { EventPayloads, EventType } from '../events/eventType';
import { GraphModel } from '../graph/graphModel';

export default class ComponentManager {
  private styleManager: StyleManager;
  private viewportManager: ViewportManager;
  private eventBus: EventBus;

  private graph: GraphModel;
  private hoveredComponent: Component<any> | null = null;
  private selectedComponent: Component<any> | null = null;
  private pendingConnectionPosition: Position | null = null;
  private draggingComponent: Component<any> | null = null;
  private pendingConnectionPort: Port | null = null;
  private dragStartOffset: Position | null = null;

  constructor(
    styleManager: StyleManager,
    viewportManager: ViewportManager,
    eventBus: EventBus,
  ) {
    this.styleManager = styleManager;
    this.viewportManager = viewportManager;
    this.eventBus = eventBus;
    this.graph = new GraphModel(styleManager, eventBus);
    this.eventBus.on(EventType.ENTITY_REMOVED, (payload) => {
      const entity = payload?.entity;
      if (this.hoveredComponent === entity) this.hoveredComponent = null;
      if (this.selectedComponent === entity) this.selectedComponent = null;
      if (this.draggingComponent === entity) {
        this.draggingComponent = null;
        this.dragStartOffset = null;
      }
      if (this.pendingConnectionPort === entity) this.onPendingConnectionCancelled();
    });

    this.eventBus.on(EventType.COMPONENT_HOVER, this.onComponentHovered.bind(this));
    this.eventBus.on(EventType.COMPONENT_SELECTED, this.onComponentSelected.bind(this));
    this.eventBus.on(EventType.COMPONENT_DRAG_STARTED, this.onComponentDragStarted.bind(this));
    this.eventBus.on(EventType.COMPONENT_DRAGGED, this.onComponentDragged.bind(this));
    this.eventBus.on(EventType.COMPONENT_DRAG_ENDED, this.onComponentDragEnded.bind(this));

    this.eventBus.on(EventType.CONNECTION_STARTED, this.onPendingConnectionStarted.bind(this));
    this.eventBus.on(EventType.CONNECTION_UPDATED, this.onPendingConnectionUpdated.bind(this));
    this.eventBus.on(
      EventType.CONNECTION_COMPLETED,
      this.onPendingConnectionCompleted.bind(this),
    );
    this.eventBus.on(
      EventType.CONNECTION_CANCELLED,
      this.onPendingConnectionCancelled.bind(this),
    );
  }

  // Event handlers
  private onComponentHovered(payload?: EventPayloads[EventType.COMPONENT_HOVER]) {
    if (payload) {
      this.hoveredComponent = payload.component;
      this.hoveredComponent?.handleHover(payload.isHovered);
    }
  }

  private onComponentSelected(payload?: EventPayloads[EventType.COMPONENT_SELECTED]) {
    if (payload) {
      this.selectedComponent = payload.component;
      // this.selectedComponent.handleSelect(payload.isSelected);
    }
  }

  private onComponentDragStarted(payload?: EventPayloads[EventType.COMPONENT_DRAG_STARTED]) {
    if (!payload) return;
    this.draggingComponent = payload.component;
    this.dragStartOffset = {
      x: payload.offset.x - payload.component.position.x,
      y: payload.offset.y - payload.component.position.y,
    };
  }

  private onComponentDragged(payload?: EventPayloads[EventType.COMPONENT_DRAGGED]) {
    if (!payload || !this.draggingComponent || !this.dragStartOffset) return;

    // Update component position, accounting for the initial click offset
    this.draggingComponent.position = {
      x: payload.position.x - this.dragStartOffset.x,
      y: payload.position.y - this.dragStartOffset.y,
    };
  }

  private onComponentDragEnded(payload?: EventPayloads[EventType.COMPONENT_DRAG_ENDED]) {
    if (!payload) return;
    this.draggingComponent = null;
    this.dragStartOffset = null;
  }

  private onPendingConnectionStarted(payload?: EventPayloads[EventType.CONNECTION_STARTED]) {
    if (!payload) return;
    this.pendingConnectionPort = payload.port;
    this.pendingConnectionPosition = payload.position;
    this.styleManager.invalidate();
  }

  private onPendingConnectionUpdated(payload?: EventPayloads[EventType.CONNECTION_UPDATED]) {
    if (!payload) return;
    this.pendingConnectionPort = payload.port;
    this.pendingConnectionPosition = payload.position;
    this.styleManager.invalidate();
  }

  private onPendingConnectionCompleted(
    payload?: EventPayloads[EventType.CONNECTION_COMPLETED],
  ) {
    if (!payload) return;
    this.pendingConnectionPort = null;
    this.pendingConnectionPosition = null;

    // Invalid interactive targets cancel the preview without throwing into the DOM event loop.
    if (
      payload.sourcePort.type !== payload.targetPort.type &&
      this.graph.ownsPort(payload.sourcePort) &&
      this.graph.ownsPort(payload.targetPort)
    ) {
      this.connectPorts(payload.sourcePort, payload.targetPort);
    }
    this.styleManager.invalidate();
  }

  private onPendingConnectionCancelled() {
    this.pendingConnectionPort = null;
    this.pendingConnectionPosition = null;
    this.styleManager.invalidate();
  }

  public clear() {
    this.graph.clear();
    this.hoveredComponent = null;
    this.selectedComponent = null;
    this.draggingComponent = null;
    this.dragStartOffset = null;
    this.onPendingConnectionCancelled();
    this.styleManager.invalidate();
  }

  public setPendingConnectionPort(port: Port | null) {
    if (port && !this.graph.ownsPort(port)) throw new Error('Port must belong to this editor');
    this.pendingConnectionPort = port;
    this.pendingConnectionPosition = port?.node
      ? {
          x: port.node.position.x + port.position.x,
          y: port.node.position.y + port.position.y,
        }
      : null;
    this.styleManager.invalidate();
  }

  public addNode(params: AddNodeParams) {
    const style = this.styleManager.getTransitionableProps({
      ...this.styleManager.getDefaultStyles().node,
      ...params.style,
    });
    return this.graph.addNode({
      ...params,
      position: params.position ?? this.getRandomPositionInViewport(style.width, style.height),
    });
  }

  public connectPorts(
    source: Port,
    target: Port,
    options?: { id?: string; style?: StyleStateParams<ConnectionStyle> },
  ) {
    return this.graph.connectPorts(source, target, options);
  }
  public removeNode(id: string) {
    this.graph.removeNode(id);
  }
  public disconnect(connection: Connection) {
    this.graph.disconnect(connection);
  }
  public getNodes() {
    return this.graph.getNodes();
  }
  public getConnections() {
    return this.graph.getConnections();
  }

  public getPendingConnectionPort() {
    return this.pendingConnectionPort;
  }

  public getPendingConnectionPosition() {
    return this.pendingConnectionPosition;
  }

  public getNodeById(id: string) {
    return this.graph.getNodeById(id);
  }

  public getConnectionById(id: string) {
    return this.graph.getConnectionById(id);
  }

  public getNodeByPortId(portId: string) {
    return this.getNodes().find((n) => n.ports.some((p) => p.id === portId));
  }

  public getConnectionByPortId(portId: string) {
    return this.getConnections().find(
      (c) => c.sourcePort.id === portId || c.targetPort.id === portId,
    );
  }

  public getHoveredComponent(): Component<any> | null {
    return this.hoveredComponent;
  }

  public setHoveredComponent(component: Component<any> | null): void {
    this.hoveredComponent?.handleHover(false);
    this.hoveredComponent = component;
    component?.handleHover(true);
  }

  public getDraggingComponent(): Component<any> | null {
    return this.draggingComponent;
  }

  public findComponentAt(screenX: number, screenY: number): Component<any> | null {
    const defaultStyle = this.styleManager.getDefaultStyles();
    const unwrappedDefaultNodeStyle = this.styleManager.getTransitionableProps(
      defaultStyle.node,
    );
    const unwrappedDefaultPortStyle = this.styleManager.getTransitionableProps(
      defaultStyle.port,
    );

    // Convert screen coordinates to world coordinates
    const wPos = this.viewportManager.toWorld(screenX, screenY);

    const nodes = this.getNodes();

    // First, check for ports since they are often smaller and might be "on top" of nodes.
    for (const node of [...nodes].reverse()) {
      for (const port of node.ports) {
        const portStyle = this.styleManager.getPortStyle(port);
        const unwrappedPortStyle = portStyle
          ? this.styleManager.getTransitionableProps(portStyle.currentState)
          : unwrappedDefaultPortStyle;
        const px = node.position.x + port.position.x;
        const py = node.position.y + port.position.y;
        const clickableRadius = unwrappedPortStyle.radius;
        const dx = wPos.x - px;
        const dy = wPos.y - py;
        if (dx * dx + dy * dy <= clickableRadius * clickableRadius) {
          return port;
        }
      }
    }

    // If no port is found, check the nodes.
    // Iterate from topmost (last in array) to bottom-most.
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const nodeStyle = this.styleManager.getNodeStyle(node);
      const unwrappedNodeStyle = nodeStyle
        ? this.styleManager.getTransitionableProps(nodeStyle.currentState)
        : unwrappedDefaultNodeStyle;
      if (
        wPos.x >= node.position.x &&
        wPos.x <= node.position.x + unwrappedNodeStyle.width &&
        wPos.y >= node.position.y &&
        wPos.y <= node.position.y + unwrappedNodeStyle.height
      ) {
        return node;
      }
    }

    return null;
  }

  /**
   * Picks a random point *in screen coordinates* within the visible canvas,
   * converts it to *world coordinates*, and returns it.
   */
  private getRandomPositionInViewport(width: number, height: number): Position {
    const viewportSize = this.viewportManager.getViewportSize();
    const viewportWidth = viewportSize.width;
    const viewportHeight = viewportSize.height;

    // Calculate the visible area in world coordinates
    const worldLeft = -this.viewportManager.getOffsetX() / this.viewportManager.getScale();
    const worldRight =
      (viewportWidth - this.viewportManager.getOffsetX()) / this.viewportManager.getScale();
    const worldTop = -this.viewportManager.getOffsetY() / this.viewportManager.getScale();
    const worldBottom =
      (viewportHeight - this.viewportManager.getOffsetY()) / this.viewportManager.getScale();

    // Determine the maximum x and y where the component can fit
    const maxX = Math.max(worldLeft, worldRight - width);
    const maxY = Math.max(worldTop, worldBottom - height);

    // Generate a random position within the valid range
    const x = Math.random() * (maxX - worldLeft) + worldLeft;
    const y = Math.random() * (maxY - worldTop) + worldTop;

    return { x, y };
  }
}
