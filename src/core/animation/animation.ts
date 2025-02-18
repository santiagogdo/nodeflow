import { GradientDefinition } from '../styles/styles';
import { EasingFunction, Easing } from './easingFunctions';
import {
  Interpolator,
  numberInterpolator,
  colorInterpolator,
  arrayInterpolator,
  gradientInterpolator,
} from './interpolators';

export type InterpolatableValue = number | string;

export type LoopMode = 'none' | 'ping-pong' | 'wrap-around';

export interface AnimationOptions {
  from: InterpolatableValue;
  to: InterpolatableValue;
  duration?: number;
  easing?: EasingFunction;
  onUpdate?: (currentValue: InterpolatableValue) => void;
  onComplete?: (currentValue: InterpolatableValue) => void;
  loop?: boolean;
  loopMode?: LoopMode;
}

export class Animation {
  private static colorRegex =
    /^(?:#(?:[a-fA-F0-9]{3,4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})|rgba?\([^\)]+\)|hsla?\([^\)]+\)|[a-z]+)$/i;

  private from: InterpolatableValue;
  private to: InterpolatableValue;
  private duration: number;
  private easing: EasingFunction;
  private onUpdate?: (currentValue: InterpolatableValue) => void;
  private onComplete?: (currentValue: InterpolatableValue) => void;

  private startTime: number;
  private interpolator: Interpolator<any>;

  // Loop flags
  private loop: boolean;
  private loopMode: LoopMode;

  constructor(options: AnimationOptions) {
    this.from = options.from;
    this.to = options.to;
    this.duration = options.duration ?? 1000; // default 1s
    this.easing = options.easing || Easing.linear;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
    this.startTime = performance.now();

    this.loop = !!options.loop;
    this.loopMode = options.loopMode ?? 'none';

    // Choose interpolator
    if (typeof this.from === 'number' && typeof this.to === 'number') {
      this.interpolator = numberInterpolator;
    } else if (
      typeof this.from === 'string' &&
      typeof this.to === 'string' &&
      Animation.colorRegex.test(this.from) &&
      Animation.colorRegex.test(this.to)
    ) {
      this.interpolator = colorInterpolator;
    } else if (Array.isArray(this.from) && Array.isArray(this.to)) {
      this.interpolator = arrayInterpolator;
    } else if (this.isGradientDefinition(this.from) && this.isGradientDefinition(this.to)) {
      this.interpolator = gradientInterpolator;
    } else {
      throw new Error(`No valid interpolator found for from="${this.from}" and to="${this.to}".`);
    }
  }

  public isGradientDefinition(val: any): val is GradientDefinition {
    return val && typeof val === 'object' && val.colorStops;
  }

  /**
   * Called every frame by your animation manager.
   * @returns true if the animation is finished (not looping), false otherwise.
   */
  public update(currentTime: number): boolean {
    const elapsed = currentTime - this.startTime;

    // If no loop
    if (!this.loop) {
      // Just do a standard 0..1 run
      return this.updateOnce(elapsed);
    }

    // If looping is enabled, pick the loop mode
    switch (this.loopMode) {
      case 'ping-pong':
        return this.updatePingPong(elapsed);
      case 'wrap-around':
        return this.updateWrapAround(elapsed);
      case 'none':
      default:
        // "none" here means "snap loop"
        return this.updateSnapLoop(elapsed);
    }
  }

  /**
   * Standard single run: 0..1, then complete.
   */
  private updateOnce(elapsed: number): boolean {
    const t = Math.min(elapsed / this.duration, 1);
    const easedT = this.easing(t);
    const newValue = this.interpolator(this.from, this.to, easedT);

    this.onUpdate?.(newValue);

    if (t === 1) {
      this.onComplete?.(newValue);
      return true;
    }
    return false;
  }

  /**
   * "Snap loop": 0..1, then jump back to 0..1, etc.
   * - We do a standard 0..1 interpolation
   * - If t == 1, we instantly reset startTime so next frame is at t=0
   */
  private updateSnapLoop(elapsed: number): boolean {
    let t = elapsed / this.duration;
    if (t >= 1) {
      // We reached or passed the end => snap back
      t = 1;
    }
    const easedT = this.easing(Math.min(t, 1));
    const newValue = this.interpolator(this.from, this.to, easedT);

    this.onUpdate?.(newValue);

    if (t >= 1) {
      // We "completed" one cycle. Snap back to 0:
      this.startTime = performance.now(); // or currentTime if passed in
      // We do NOT call onComplete() every cycle unless you want that.
      return false; // still running
    }

    return false;
  }

  /**
   * Ping-pong loop: forward 0..1, then backward 1..0, repeat.
   */
  private updatePingPong(elapsed: number): boolean {
    // Each forward/back cycle is 2x duration
    const cycle = this.duration * 2;
    let rawCycle = (elapsed % cycle) / this.duration; // 0..2
    if (rawCycle > 1) {
      // "Back" portion of the trip
      rawCycle = 2 - rawCycle;
    }
    const easedT = this.easing(rawCycle);
    const newValue = this.interpolator(this.from, this.to, easedT);

    this.onUpdate?.(newValue);
    return false;
  }

  /**
   * Wrap-around loop: 0..1, then back to 0 in a cyclical manner.
   * (no "jump" if the property is cyclical, like dash offset)
   */
  private updateWrapAround(elapsed: number): boolean {
    const rawT = (elapsed % this.duration) / this.duration;
    const easedT = this.easing(rawT);
    const newValue = this.interpolator(this.from, this.to, easedT);

    this.onUpdate?.(newValue);
    return false;
  }
}
