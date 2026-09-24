import type { InteractionMotion } from "./linkTypes.ts";

interface Transition {
  from: number;
  to: number;
  start: number;
  value: number;
}

/** The renderer asks for values and schedules a frame only while they change. */
export class NodeTransitions {
  private values = new Map<string, Transition>();
  private seen = new Set<string>();
  active = false;
  begin() {
    this.active = false;
    this.seen.clear();
  }
  value(
    key: string,
    target: number,
    now: number,
    motion: InteractionMotion | false,
  ): number {
    this.seen.add(key);
    let value = this.values.get(key);
    if (!value || !motion || motion.duration === 0) {
      value = { from: target, to: target, start: now, value: target };
      this.values.set(key, value);
      return target;
    }
    const sample = () => {
      const elapsed = Math.min(
        1,
        Math.max(0, (now - value!.start) / motion.duration),
      );
      const eased = motion.easing(elapsed);
      return elapsed === 1
        ? value!.to
        : value!.from + (value!.to - value!.from) *
            (Number.isFinite(eased)
              ? Math.max(0, Math.min(1, eased))
              : elapsed);
    };
    value.value = sample();
    if (target !== value.to) {
      value.from = value.value;
      value.to = target;
      value.start = now;
    }
    if (value.value !== value.to) this.active = true;
    return value.value;
  }
  end() {
    // Forget offscreen/deleted nodes, including their controls. No unbounded cache.
    for (const key of this.values.keys()) {
      if (!this.seen.has(key)) this.values.delete(key);
    }
  }
  clear() {
    this.values.clear();
  }
}
