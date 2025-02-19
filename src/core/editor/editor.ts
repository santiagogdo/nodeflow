import { Node } from '../components/node';
import { Connection } from '../components/connection';
import { Port } from '../components/port';
import { Position, Size } from '../../utils/interfaces';
import { Animatable, ComputedStyleChange, StyleManager, StyleStateParams } from '../styles/styles';
import { AnimationManager } from '../animation/animationManager';
import { Renderer } from '../../rendering/renderer';
import { Component, ComponentType, Entity } from '../components/component';
import { Easing, getEasingFunction } from '../animation/easingFunctions';
import { InterpolatableValue } from '../animation/animation';
import { createContextMenu } from '../contextMenu/contextMenu';
import { EditorDomEvents } from '../events/editorDomEvents';
import { EventEmitter } from '../events/eventEmitter';
import { BackgroundRenderer } from '../../rendering/backgroundRenderer';
import { AddNodeParams, EditorConfig } from './types';

/**
 * The main Editor class:
 * - Manages nodes and connections
 * - Handles mouse events for panning, node dragging, connecting ports
 * - Has a single animation loop that calls `AnimationManager.update()`
 *   and re-renders the entire scene each frame.
 */
export class Editor {
  // Scene Data
  private nodes: Node[] = [];
  private connections: Connection[] = [];

  // Pan/zoom
  private scale = 1.0;
  private offsetX = 0;
  private offsetY = 0;

  // For connecting ports
  private pendingConnectionPort: Port | null = null;
  private mousePosition: Position | null = null;

  private hoveredComponent: Component<any> | null = null;

  // The canvas + 2D context
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backgroundCanvas: HTMLCanvasElement;
  private backgroundCtx: CanvasRenderingContext2D;

  // Style & animation
  public styleManager = new StyleManager();
  private animationManager = new AnimationManager();

  // The renderer that draws full scene
  private renderer: Renderer;
  private backgroundRenderer: BackgroundRenderer;
  public editorConfig?: EditorConfig;

  public domEvents: EditorDomEvents;
  public customEvents = new EventEmitter();

  constructor(container: HTMLElement, config?: EditorConfig) {
    if (config) {
      this.editorConfig = config;
    }

    this.canvas = document.createElement('canvas');
    this.backgroundCanvas = document.createElement('canvas');

    this.backgroundCanvas.style.width = '100%';
    this.backgroundCanvas.style.height = '100%';
    this.backgroundCanvas.style.background = config?.background || 'transparent';
    this.backgroundCanvas.style.position = 'absolute';
    this.backgroundCanvas.style.top = '0';
    this.backgroundCanvas.style.left = '0';
    this.backgroundCanvas.style.zIndex = '-1';

    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.background = 'transparent';

    container.appendChild(this.backgroundCanvas);
    container.appendChild(this.canvas);

    const contextMenu = createContextMenu();

    if (container.style.position !== 'relative') {
      container.style.position = 'relative';
    }

    container.appendChild(contextMenu);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Cannot get 2D canvas context');
    }

    const backgroundCtx = this.backgroundCanvas.getContext('2d');
    if (!backgroundCtx) {
      throw new Error('Cannot get 2D canvas context');
    }

    this.ctx = ctx;
    this.backgroundCtx = backgroundCtx;

    this.renderer = new Renderer(this, ctx);
    this.backgroundRenderer = new BackgroundRenderer(this, backgroundCtx);

    this.domEvents = new EditorDomEvents(this, container, this.canvas, this.backgroundCanvas);

    this.styleManager.onTransitionableStyleChanged(
      ComponentType.Node,
      this.onTransitionableStyleChanged.bind(this)
    );
    this.styleManager.onTransitionableStyleChanged(
      ComponentType.Port,
      this.onTransitionableStyleChanged.bind(this)
    );
    this.styleManager.onTransitionableStyleChanged(
      ComponentType.Connection,
      this.onTransitionableStyleChanged.bind(this)
    );

    this.styleManager.onAnimation(ComponentType.Node, this.onAnimation.bind(this));
    this.styleManager.onAnimation(ComponentType.Port, this.onAnimation.bind(this));
    this.styleManager.onAnimation(ComponentType.Connection, this.onAnimation.bind(this));

    // Start the main animation + render loop
    this.backgroundRenderer.render({
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
    requestAnimationFrame(this.frameLoop.bind(this));
  }

  /**
   * The main loop (once per frame).
   * Updates animations and re-render the entire scene.
   */
  private frameLoop(currentTime: number) {
    // Let the animation manager run its animations
    this.animationManager.update(currentTime);

    // Re-draw the scene in a single pass
    this.render();

    this.renderer.fpsCounter.frame(currentTime);

    // Schedule the next frame
    requestAnimationFrame(this.frameLoop.bind(this));
  }

  private onAnimation<T>(
    component: Component<T> | Entity,
    style: ComputedStyleChange<StyleStateParams<T>>
  ) {
    if (style.currentState.animation) {
      Object.entries(style.currentState.animation as Record<string, Animatable<T>>).forEach(
        ([animatableProp, animatablePropSettings]) => {
          console.log(animatableProp, animatablePropSettings);

          this.animationManager.requestAnimation({
            from: animatablePropSettings.from as InterpolatableValue,
            to: animatablePropSettings.to as InterpolatableValue,
            duration: animatablePropSettings.duration ?? 1000,
            easing: getEasingFunction(animatablePropSettings.easing) ?? Easing.linear,
            loop: animatablePropSettings.loop ?? false,
            loopMode: animatablePropSettings.loopMode ?? 'none',

            onUpdate: (currentValue) => {
              // Retrieve existing transitions (if any)
              const existing =
                this.animationManager.activeAnimations.get(component as Component<T>) || {};

              // Merge the single updated property
              existing[animatableProp] = currentValue;

              // Save back
              this.animationManager.activeAnimations.set(component as Component<T>, existing);

              this.render();
            },
            onComplete: (finalValue) => {
              console.log('Animation completed');
              const propName = animatableProp as keyof StyleStateParams<T>;
              style.currentState[propName] = finalValue as any;
            },
          });
        }
      );
    }
  }

  private onTransitionableStyleChanged<T>(
    component: Component<T> | Entity,
    updatedStyles: ComputedStyleChange<T>
  ) {
    console.log('onTransitionableNodeStyleChanged: ', updatedStyles);
    const { currentState, previousState } = updatedStyles;
    Object.entries(currentState).forEach(([key, value]) => {
      const unwrappedPreviousValue = this.styleManager.getTransitionableProp(
        previousState[key as keyof T]
      ) as InterpolatableValue;
      const unwrappedCurrentValue = this.styleManager.getTransitionableProp(
        value
      ) as InterpolatableValue;

      if (unwrappedCurrentValue && unwrappedPreviousValue) {
        this.animationManager.requestAnimation({
          from: unwrappedPreviousValue,
          to: unwrappedCurrentValue,
          duration: 150,
          easing: Easing.linear,
          onUpdate: (currentValue) => {
            console.log('Transition update: ', currentValue);
            this.render();
          },
          onComplete: (currentValue) => {
            console.log('Transition complete: ', currentValue);
          },
        });
      }
    });
  }

  /**
   * The single pass render: draws all nodes & connections.
   */
  public render() {
    this.renderer.renderScene({
      nodes: this.nodes,
      connections: this.connections,
      transform: {
        scale: this.scale,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
      },
      pendingConnection: {
        port: this.pendingConnectionPort,
        mousePosition: this.mousePosition,
      },
    });
  }

  /**
   * Add a node to the editor.
   */
  public addNode(params: AddNodeParams) {
    const defaultStyle = this.styleManager.getDefaultStyles();

    const unwrappedNodeStyle = this.styleManager.getTransitionableProps(
      params.style || defaultStyle.node
    );

    const ports = params.ports?.map((p) => {
      let position;
      if (p.type === 'input') {
        position = {
          // inputs are fixed to the left side of the node
          x: 0,
          y: Math.min(unwrappedNodeStyle.height, Math.max(0, p.position.y)),
        };
      } else if (p.type === 'output') {
        position = {
          // outputs are fixed to the right side of the node
          x: unwrappedNodeStyle.width,
          y: Math.min(unwrappedNodeStyle.height, Math.max(0, p.position.y)),
        };
      }

      const port = new Port({
        position: position ?? p.position,
        type: p.type,
        styleManager: this.styleManager,
      });

      // this.styleManager.setPortStyle(port, p.style);

      return port;
    });
    const node = new Node({
      position:
        params.position ||
        this.getRandomPositionInViewport(unwrappedNodeStyle.width, unwrappedNodeStyle.height),
      label: params.label,
      ports,
      data: params.data,
      styleManager: this.styleManager,
    });

    if (node.ports) {
      node.ports.forEach((p) => {
        p.node = node;
      });
    }

    if (params.style) {
      this.styleManager.setNodeStyle(node, params.style);
    }

    this.nodes.push(node);
    this.render();
    return node;
  }

  /**
   * Remove a node + its connections.
   */
  public removeNode(nodeId: string) {
    // remove connections referencing ports of this node
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error('Node not found');
    }

    this.connections = this.connections.filter(
      (c) => !(c.sourcePort.node === node || c.targetPort.node === node)
    );

    // remove node
    this.nodes = this.nodes.filter((n) => n !== node);
    this.styleManager.deleteNodeStyle(node);
    this.render();
  }

  /**
   * Connect two ports together. Also checks for duplicates.
   */
  public connectPorts(portA: Port, portB: Port) {
    // Validate ports are of compatible types
    if (portA.type === portB.type) {
      throw new Error('Cannot connect ports of the same type');
    }

    // Don't connect if they're on the same node, or already connected
    if (portA.node === portB.node) return;

    const existing = this.connections.find(
      (c) =>
        (c.sourcePort === portA && c.targetPort === portB) ||
        (c.sourcePort === portB && c.targetPort === portA)
    );
    if (existing) return; // already connected

    // Determine source and target ports based on type
    const [sourcePort, targetPort] = portA.type === 'output' ? [portA, portB] : [portB, portA];

    // Create connection
    const conn = new Connection(sourcePort, targetPort, this.styleManager);
    this.styleManager.setConnectionStyle(conn);

    this.connections.push(conn);
    this.render();
  }

  /**
   * Disconnect a connection from the editor.
   */
  public disconnect(connection: Connection) {
    this.connections = this.connections.filter((c) => c !== connection);
    connection.disconnect();
    this.render();
  }

  /**
   * Clears all nodes & connections
   */
  public clear() {
    this.nodes = [];
    this.connections = [];
    this.render();
  }

  public getNodes() {
    return this.nodes;
  }

  public getConnections() {
    return this.connections;
  }

  public getScale() {
    return this.scale;
  }

  public getOffsetX() {
    return this.offsetX;
  }

  public getOffsetY() {
    return this.offsetY;
  }

  /**
   * Returns the device pixel ratio of the window.
   */
  public getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
  }

  public setOffsetX(x: number): void {
    this.offsetX = x;
  }
  public setOffsetY(y: number): void {
    this.offsetY = y;
  }

  public setScale(scale: number): void {
    this.scale = scale;
  }

  public setMousePosition(position: Position | null): void {
    this.mousePosition = position;
  }

  public getHoveredComponent(): Component<any> | null {
    return this.hoveredComponent;
  }

  public setHoveredComponent(component: Component<any> | null): void {
    this.hoveredComponent = component;
  }

  public getViewportSize(): Size {
    const rect = this.canvas.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  }

  public getPendingConnectionPort(): Port | null {
    return this.pendingConnectionPort;
  }

  public setPendingConnectionPort(port: Port | null): void {
    this.pendingConnectionPort = port;
  }

  // Convert from screen coords => world coords
  public toWorld(screenX: number, screenY: number): Position {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale,
    };
  }

  public findComponentAt(screenX: number, screenY: number): Component<any> | null {
    const defaultStyle = this.styleManager.getDefaultStyles();
    const unwrappedDefaultNodeStyle = this.styleManager.getTransitionableProps(defaultStyle.node);
    const unwrappedDefaultPortStyle = this.styleManager.getTransitionableProps(defaultStyle.port);

    // Convert screen coordinates to world coordinates
    const wPos = this.toWorld(screenX, screenY);

    // First, check for ports since they are often smaller and might be "on top" of nodes.
    for (const node of this.nodes) {
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
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
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

  public getAnimationManager() {
    return this.animationManager;
  }

  public getBackgroundRenderer() {
    return this.backgroundRenderer;
  }

  public getCanvas() {
    return this.canvas;
  }

  public getBackgroundCanvas() {
    return this.backgroundCanvas;
  }

  /**
   * Picks a random point *in screen coordinates* within the visible canvas,
   * converts it to *world coordinates*, and returns it.
   */
  private getRandomPositionInViewport(width: number, height: number): Position {
    const viewportSize = this.getViewportSize();
    const viewportWidth = viewportSize.width;
    const viewportHeight = viewportSize.height;

    // Calculate the visible area in world coordinates
    const worldLeft = -this.offsetX / this.scale;
    const worldRight = (viewportWidth - this.offsetX) / this.scale;
    const worldTop = -this.offsetY / this.scale;
    const worldBottom = (viewportHeight - this.offsetY) / this.scale;

    // Determine the maximum x and y where the component can fit
    const maxX = Math.max(worldLeft, worldRight - width);
    const maxY = Math.max(worldTop, worldBottom - height);

    // Generate a random position within the valid range
    const x = Math.random() * (maxX - worldLeft) + worldLeft;
    const y = Math.random() * (maxY - worldTop) + worldTop;

    return { x, y };
  }
}
