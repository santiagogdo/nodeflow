import { Editor } from '../editor/editor';
import { Node } from '../components/node';
import { Connection } from '../components/connection';
import { Port } from '../components/port';
import { Position } from '../../utils/interfaces';
import FPSCounter from '../../utils/fpsCounter';
import { StyleManager } from '../styles/styles';

/** Basic transform interface for scale/offset */
export interface RenderTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** The shape for a full-scene render call */
export interface RenderRequest {
  nodes: Node[];
  connections: Connection[];
  transform: RenderTransform;
  pendingConnection: {
    port: Port | null;
    position: Position | null;
  };
}

export class Renderer {
  public fpsCounter = new FPSCounter();
  public showFPSCounter: boolean;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private styleManager: StyleManager;

  constructor(private editor: Editor) {
    this.styleManager = this.editor.getStyleManager();

    this.canvas = this.editor.getCanvas();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Cannot get 2D canvas context');
    }
    this.ctx = ctx;
    this.showFPSCounter = editor.editorConfig?.showFPSCounter || false;
  }

  public renderScene(request: RenderRequest) {
    const { nodes, connections, transform, pendingConnection } = request;

    const devicePixelRatio = this.editor.getViewportManager().getDevicePixelRatio();

    // Clear entire canvas
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    // Apply devicePixelRatio scaling, then scene transform
    this.ctx.save();
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    this.ctx.translate(transform.offsetX, transform.offsetY);
    this.ctx.scale(transform.scale, transform.scale);

    // Draw all connections (behind)
    connections.forEach((conn) => {
      conn.draw(this.ctx, this.editor.getAnimationManager());
    });

    // If there's a pending connection (dragging from port to mouse), draw it
    if (pendingConnection.port && pendingConnection.position) {
      this.drawPendingConnection(pendingConnection.port, pendingConnection.position);
    }

    // Draw all nodes (on top)
    nodes.forEach((node) => {
      node.draw(this.ctx, this.editor.getAnimationManager());
      node.ports.forEach((port) => port.draw(this.ctx, this.editor.getAnimationManager()));
    });

    this.ctx.restore();

    if (this.showFPSCounter) {
      this.ctx.save();
      this.ctx.scale(devicePixelRatio, devicePixelRatio);
      this.ctx.fillStyle = 'white';
      this.ctx.font = '16px Inter, serif';
      this.ctx.fillText(`FPS: ${this.fpsCounter.getFPS().toFixed(2)}`, 10, 20);
      this.ctx.restore();
    }
  }

  private drawPendingConnection(port: Port, mousePos: Position) {
    if (!port.node) return;

    const sourceX = port.node.position.x + port.position.x;
    const sourceY = port.node.position.y + port.position.y;
    const targetX = mousePos.x;
    const targetY = mousePos.y;

    const defConnStyle = this.styleManager.getDefaultStyles().connection;
    const { color, width, dashArray } = this.styleManager.getTransitionableProps(defConnStyle);

    const isGradient = this.styleManager.isGradientDefinition(color);

    if (isGradient) {
      const gradDef = color;
      const grad = this.ctx.createLinearGradient(
        gradDef.x0 || 0,
        gradDef.y0 || 0,
        gradDef.x1 || 1,
        gradDef.y1 || 1,
      );

      gradDef.colorStops.forEach((stop) => {
        grad.addColorStop(stop.offset, stop.color);
      });

      this.ctx.strokeStyle = grad;
    } else {
      this.ctx.strokeStyle = color;
    }

    this.ctx.lineWidth = width;
    this.ctx.setLineDash(dashArray);
    this.ctx.beginPath();
    this.ctx.moveTo(sourceX, sourceY);

    const cpOffset = 20;
    this.ctx.bezierCurveTo(
      sourceX,
      sourceY + cpOffset,
      targetX,
      targetY - cpOffset,
      targetX,
      targetY,
    );
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
}
