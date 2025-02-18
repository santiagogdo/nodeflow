import { Editor } from '../core/editor/editor';
import parseColor from '../core/animation/colorParser';
import { getRGBAString } from '../utils/getRgbaString';

export interface RenderTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class BackgroundRenderer {
  constructor(private editor: Editor, private ctx: CanvasRenderingContext2D) {}

  public render(transform: RenderTransform) {
    const devicePixelRatio = this.editor.getDevicePixelRatio();
    const canvasWidth = this.ctx.canvas.width;
    const canvasHeight = this.ctx.canvas.height;

    // Clear entire canvas
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    this.ctx.save();

    // Scale for devicePixelRatio
    this.ctx.scale(devicePixelRatio, devicePixelRatio);

    const { grid } = this.editor.editorConfig || {};
    const minorGridSize = grid?.size || 20;

    // Convert canvas size to world size
    const unscaledWidth = canvasWidth / devicePixelRatio / transform.scale;
    const unscaledHeight = canvasHeight / devicePixelRatio / transform.scale;

    // Calculate visible bounds in world coordinates
    const viewportLeft = -transform.offsetX / transform.scale;
    const viewportTop = -transform.offsetY / transform.scale;
    const viewportRight = viewportLeft + unscaledWidth;
    const viewportBottom = viewportTop + unscaledHeight;

    // Calculate the start and end grid lines that are visible
    // Round to nearest grid line to prevent floating point errors
    const startX = Math.floor(viewportLeft / minorGridSize) * minorGridSize;
    const startY = Math.floor(viewportTop / minorGridSize) * minorGridSize;
    const endX = Math.ceil(viewportRight / minorGridSize) * minorGridSize;
    const endY = Math.ceil(viewportBottom / minorGridSize) * minorGridSize;

    // Apply scale transformation only
    this.ctx.scale(transform.scale, transform.scale);

    // Apply translation to align with world coordinates
    // This is the key change - we translate by the world-space grid offset
    this.ctx.translate(transform.offsetX / transform.scale, transform.offsetY / transform.scale);

    // Now we can draw the grid using world coordinates:
    if (grid) {
      const {
        showCrosses,
        showDots,
        showMajorLines,
        showMinorLines,
        color = 'rgba(255, 255, 255, 0.8)',
      } = grid;

      const gridColor = parseColor(color);
      if (!gridColor) return;

      const majorGridSize = minorGridSize * 5;

      if (showMinorLines) {
        const minorColor = { ...gridColor, a: gridColor.a * 0.2 };
        this.ctx.strokeStyle = getRGBAString(minorColor);
        // Because we're in world coords, lineWidth = 1 / transform.scale is typical
        this.ctx.lineWidth = 1 / transform.scale;

        this.ctx.beginPath();
        for (let x = startX; x <= endX; x += minorGridSize) {
          this.ctx.moveTo(x, startY);
          this.ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += minorGridSize) {
          this.ctx.moveTo(startX, y);
          this.ctx.lineTo(endX, y);
        }
        this.ctx.stroke();
      }

      if (showMajorLines) {
        const majorColor = { ...gridColor, a: gridColor.a * 0.75 };
        this.ctx.strokeStyle = getRGBAString(majorColor);
        this.ctx.lineWidth = 2 / transform.scale;

        this.ctx.beginPath();
        const startMajorX = Math.floor(startX / majorGridSize) * majorGridSize;
        const startMajorY = Math.floor(startY / majorGridSize) * majorGridSize;
        for (let x = startMajorX; x <= endX; x += majorGridSize) {
          this.ctx.moveTo(x, startY);
          this.ctx.lineTo(x, endY);
        }
        for (let y = startMajorY; y <= endY; y += majorGridSize) {
          this.ctx.moveTo(startX, y);
          this.ctx.lineTo(endX, y);
        }
        this.ctx.stroke();
      }

      if (showDots) {
        this.ctx.fillStyle = getRGBAString(gridColor);
        const dotSize = 2 / transform.scale;
        const startMajorX = Math.floor(startX / majorGridSize) * majorGridSize;
        const startMajorY = Math.floor(startY / majorGridSize) * majorGridSize;
        for (let x = startMajorX; x <= endX; x += majorGridSize) {
          for (let y = startMajorY; y <= endY; y += majorGridSize) {
            this.ctx.beginPath();
            this.ctx.arc(x, y, dotSize, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
      }

      if (showCrosses) {
        this.ctx.strokeStyle = getRGBAString(gridColor);
        this.ctx.lineWidth = 2 / transform.scale;
        const crossSize = 10 / transform.scale;
        const startMajorX = Math.floor(startX / majorGridSize) * majorGridSize;
        const startMajorY = Math.floor(startY / majorGridSize) * majorGridSize;

        for (let x = startMajorX; x <= endX; x += majorGridSize) {
          for (let y = startMajorY; y <= endY; y += majorGridSize) {
            const horizontalLeft = Math.max(x - crossSize, startX);
            const horizontalRight = Math.min(x + crossSize, endX);
            const verticalTop = Math.max(y - crossSize, startY);
            const verticalBottom = Math.min(y + crossSize, endY);

            // If there's some overlap, draw the partial cross
            // (If horizontalLeft > horizontalRight, there's no overlap, so skip)
            if (horizontalLeft <= horizontalRight && verticalTop <= verticalBottom) {
              this.ctx.beginPath();

              // Horizontal line
              this.ctx.moveTo(horizontalLeft, y);
              this.ctx.lineTo(horizontalRight, y);

              // Vertical line
              this.ctx.moveTo(x, verticalTop);
              this.ctx.lineTo(x, verticalBottom);

              this.ctx.stroke();
            }
          }
        }
      }
    }

    this.ctx.restore();
  }
}
