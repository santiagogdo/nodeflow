import { ComponentType, Entity } from '../components/component';
import { StyleManager, ComputedStyleChange, Animatable } from '../styles/styles';
import { AnimationManager } from './animationManager';
import { InterpolatableValue } from './animation';
import { Easing, getEasingFunction } from './easingFunctions';
import parseColor from './colorParser';

/** Converts style changes into animations without involving graph or pointer state. */
export class StyleAnimator {
  private cancellations = new WeakMap<Entity, Map<string, () => void>>();

  constructor(
    private styles: StyleManager,
    private animations: AnimationManager,
  ) {
    for (const type of [ComponentType.Node, ComponentType.Port, ComponentType.Connection]) {
      styles.onAnimation(type, (entity, change) => this.animate(entity, change));
      styles.onTransitionableStyleChanged(type, (entity, change) =>
        this.transition(entity, change),
      );
    }
  }

  private replace(entity: Entity, key: string, cancel: () => void): void {
    let entries = this.cancellations.get(entity);
    if (!entries) {
      entries = new Map();
      this.cancellations.set(entity, entries);
    }
    entries.get(key)?.();
    entries.set(key, cancel);
  }

  private animate(entity: Entity, change: ComputedStyleChange<any>): void {
    const definitions = change.currentState.animation as
      | Record<string, Animatable<InterpolatableValue>>
      | undefined;
    const previous = change.previousState.animation as
      | Record<string, Animatable<InterpolatableValue>>
      | undefined;
    for (const property of new Set([
      ...Object.keys(previous ?? {}),
      ...Object.keys(definitions ?? {}),
    ])) {
      const settings = definitions?.[property];
      if (JSON.stringify(previous?.[property]) === JSON.stringify(settings)) continue;
      this.replace(entity, `animation:${property}`, () => {});
      const values = this.animations.activeAnimations.get(entity);
      if (values) delete values[property];
      if (!settings) continue;
      const cancel = this.animations.requestAnimation(
        {
          ...settings,
          easing: getEasingFunction(settings.easing) ?? Easing.linear,
          onUpdate: (value) => {
            const values = this.animations.activeAnimations.get(entity) ?? {};
            values[property] = value;
            this.animations.activeAnimations.set(entity, values);
          },
        },
        entity,
      );
      this.replace(entity, `animation:${property}`, cancel);
    }
  }

  private transition(entity: Entity, change: ComputedStyleChange<any>): void {
    for (const [property, next] of Object.entries(change.currentState)) {
      const previous = change.previousState[property];
      const transitions = this.animations.activeTransitions.get(entity);
      const from = transitions?.[property] ?? this.styles.getTransitionableProp(previous);
      const to = this.styles.getTransitionableProp(next);
      this.replace(entity, `transition:${property}`, () => {});
      if (transitions) delete transitions[property];
      const enabled =
        (this.styles.isTransitionable(previous) && previous.transition) ||
        (this.styles.isTransitionable(next) && next.transition);
      const compatible =
        (typeof from === 'number' && typeof to === 'number') ||
        (typeof from === 'string' &&
          typeof to === 'string' &&
          parseColor(from) &&
          parseColor(to)) ||
        (Array.isArray(from) && Array.isArray(to)) ||
        (this.styles.isGradientDefinition(from) && this.styles.isGradientDefinition(to));
      if (!enabled || !compatible) continue;
      const cancel = this.animations.requestAnimation(
        {
          from,
          to,
          duration: 150,
          easing: Easing.linear,
          onUpdate: (value) => {
            const values = this.animations.activeTransitions.get(entity) ?? {};
            values[property] = value;
            this.animations.activeTransitions.set(entity, values);
          },
          onComplete: () => {
            const values = this.animations.activeTransitions.get(entity);
            if (values) {
              delete values[property];
              if (!Object.keys(values).length)
                this.animations.activeTransitions.delete(entity);
            }
          },
        },
        entity,
      );
      this.replace(entity, `transition:${property}`, cancel);
    }
  }
}
