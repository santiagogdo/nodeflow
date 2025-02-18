import { Component, Entity } from '../components/component';
import { Animation, AnimationOptions } from './animation';

// export class AnimationManager {
//   private animations: Set<Animation> = new Set();
//   private animationRequests: Set<Animation> = new Set();
//   public activeAnimations = new Map<Component<any>, Partial<any>>();
//   private isRunning: boolean = false;

//   // constructor(private onFrame: () => void) {}

//   public requestAnimation<T>(animationParams: AnimationOptions) {
//     const animation = new Animation(animationParams);
//     this.animations.add(animation);
//     if (!this.isRunning) {
//       this.isRunning = true;
//       requestAnimationFrame(this.loop.bind(this));
//     }
//   }

//   private loop(currentTime: number) {
//     this.animations.forEach((animation) => {
//       const done = animation.update(currentTime);
//       if (done) {
//         this.animations.delete(animation);
//       }
//     });

//     // Continue the loop if there are animations left
//     if (this.animations.size > 0) {
//       requestAnimationFrame(this.loop.bind(this));
//     } else {
//       this.isRunning = false;
//     }
//   }

//   public clear() {
//     this.animations.clear();
//     this.isRunning = false;
//   }
// }

export class AnimationManager {
  private animations = new Set<Animation>();
  public activeAnimations = new Map<Component<any> | Entity, Partial<any>>();
  private isRunning = false;

  constructor() {}

  /**
   * Creates and stores a new Animation.
   * We'll handle the requestAnimationFrame loop externally or internally.
   *
   * NOTE: In a "unified" approach, you might call `animationManager.update(time)` in your own main loop,
   * rather than letting it manage frames.
   */
  public requestAnimation(options: AnimationOptions) {
    const anim = new Animation(options);
    this.animations.add(anim);
    // If you want the manager to handle frames internally, you can do:
    if (!this.isRunning) {
      this.isRunning = true;
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  /**
   * If the Editor calls this each frame,
   * we can do the update in the Editor's main loop instead.
   */
  public update(currentTime: number) {
    // update all animations
    const toRemove: Animation[] = [];
    this.animations.forEach((anim) => {
      const done = anim.update(currentTime);
      if (done) {
        toRemove.push(anim);
      }
    });
    // remove completed
    toRemove.forEach((a) => this.animations.delete(a));
  }

  private loop(time: number) {
    // internal approach
    this.update(time);

    if (this.animations.size > 0) {
      requestAnimationFrame(this.loop.bind(this));
    } else {
      this.isRunning = false;
    }
  }
}
