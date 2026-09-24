import { Entity } from '../components/component';
import { EventBus } from '../events/eventBus';
import { EventType } from '../events/eventType';
import { Animation, AnimationOptions, InterpolatableValue } from './animation';

/** Advances animations on the editor's clock; never schedules its own frames. */
export class AnimationManager {
  private animations = new Map<Animation, Entity | undefined>();
  public activeAnimations = new Map<Entity, Record<string, InterpolatableValue>>();
  public activeTransitions = new Map<Entity, Record<string, InterpolatableValue>>();
  private isPaused = false;

  constructor(private eventBus: EventBus) {
    eventBus.on(EventType.ENTITY_REMOVED, (payload) => {
      if (payload) this.cancelFor(payload.entity);
    });
  }

  public requestAnimation(options: AnimationOptions, owner?: Entity): () => void {
    const animation = new Animation(options);
    if (this.isPaused) animation.pause();
    this.animations.set(animation, owner);
    this.eventBus.emit(EventType.SCENE_CHANGED);
    return () => {
      this.animations.delete(animation);
    };
  }

  public hasActiveAnimations(): boolean {
    return !this.isPaused && this.animations.size > 0;
  }

  public pauseAll(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.animations.forEach((_, animation) => animation.pause());
    this.eventBus.emit(EventType.SCENE_CHANGED);
  }

  public resumeAll(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.animations.forEach((_, animation) => animation.resume());
    this.eventBus.emit(EventType.SCENE_CHANGED);
  }

  public update(time: number): void {
    if (this.isPaused) return;
    for (const animation of [...this.animations.keys()]) {
      if (this.animations.has(animation) && animation.update(time))
        this.animations.delete(animation);
    }
  }

  public cancelFor(owner: Entity): void {
    this.animations.forEach((entity, animation) => {
      if (entity === owner) this.animations.delete(animation);
    });
    this.activeAnimations.delete(owner);
    this.activeTransitions.delete(owner);
  }

  public clear(): void {
    this.isPaused = false;
    this.animations.clear();
    this.activeAnimations.clear();
    this.activeTransitions.clear();
  }
}
