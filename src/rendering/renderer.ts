import { Editor } from '../core/editor/editor';
import { Node } from '../core/components/node';
import { Connection } from '../core/components/connection';
import { Port } from '../core/components/port';
import { Position } from '../utils/interfaces';
import FPSCounter from '../utils/fpsCounter';

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
    mousePosition: Position | null;
  };
}

export class Renderer {
  public fpsCounter = new FPSCounter();
  public showFPSCounter: boolean;
  constructor(private editor: Editor, private ctx: CanvasRenderingContext2D) {
    this.showFPSCounter = editor.editorConfig?.showFPSCounter || false;
  }

  public renderScene(request: RenderRequest) {
    const { nodes, connections, transform, pendingConnection } = request;

    const devicePixelRatio = this.editor.getDevicePixelRatio();

    // clear entire canvas
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    // apply devicePixelRatio scaling, then scene transform
    this.ctx.save();
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    this.ctx.translate(transform.offsetX, transform.offsetY);
    this.ctx.scale(transform.scale, transform.scale);

    // 1) Draw all connections (behind)
    connections.forEach((conn) => {
      conn.draw(this.ctx, this.editor.getAnimationManager());
    });

    // 2) If there's a pending connection (dragging from port to mouse), draw it
    if (pendingConnection.port && pendingConnection.mousePosition) {
      this.drawPendingConnection(pendingConnection.port, pendingConnection.mousePosition);
    }

    // 3) Draw all nodes (on top)
    nodes.forEach((node) => {
      node.draw(this.ctx, this.editor.getAnimationManager());
      node.ports.forEach((port) => port.draw(this.ctx), this.editor.getAnimationManager());
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

  // Example method to draw a "pending connection" line from a port to mouse
  private drawPendingConnection(port: Port, mousePos: Position) {
    if (!port.node) return;

    const sourceX = port.node.position.x + port.position.x;
    const sourceY = port.node.position.y + port.position.y;
    const targetX = mousePos.x;
    const targetY = mousePos.y;

    // if you have default style:
    const defConnStyle = this.editor.styleManager.getDefaultStyles().connection;
    const { color, width, dashArray } =
      this.editor.styleManager.getTransitionableProps(defConnStyle);

    const isGradient = this.editor.styleManager.isGradientDefinition(color);

    if (isGradient) {
      const gradDef = color;
      const grad = this.ctx.createLinearGradient(
        gradDef.x0 || 0,
        gradDef.y0 || 0,
        gradDef.x1 || 1,
        gradDef.y1 || 1
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
      targetY
    );
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
}
