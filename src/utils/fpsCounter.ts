export default class FPSCounter {
  private frameCount: number = 0;
  private fps: number = 0;
  private lastUpdateTime: number = performance.now();
  private updateInterval: number = 1000;
  private lastFrameTimestamp: number = 0; // Track frame timestamps

  /**
   * Call this method once per frame, using the timestamp from
   * requestAnimationFrame to ensure single counting per frame.
   */
  public frame(timestamp: DOMHighResTimeStamp) {
    // Count only once per frame, even if called multiple times
    if (timestamp > this.lastFrameTimestamp) {
      this.frameCount++;
      this.lastFrameTimestamp = timestamp;
    }

    const now = performance.now();
    const deltaTime = now - this.lastUpdateTime;

    // Update FPS continuously but stabilize values over 1-second intervals
    if (deltaTime >= this.updateInterval) {
      this.fps = (this.frameCount * 1000) / deltaTime;
      this.lastUpdateTime = now;
      this.frameCount = 0;
    }
  }

  public getFPS(): number {
    return Math.round(this.fps); // Return rounded value for cleaner display
  }
}
