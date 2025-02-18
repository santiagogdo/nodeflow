import 'vitest-canvas-mock';
import { afterEach, beforeEach, afterAll, vi } from 'vitest';

// Clean up DOM after each test
beforeEach(() => {
  vi.clearAllMocks();

  // Add roundRect polyfill
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + width, y, x + width, y + height, radius);
    this.arcTo(x + width, y + height, x, y + height, radius);
    this.arcTo(x, y + height, x, y, radius);
    this.arcTo(x, y, x + width, y, radius);
    this.closePath();
    return this;
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});
