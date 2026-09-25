import type { JsonValue, Patch } from "./types.ts";

export function cloneJSON<T>(value: T): T {
  return cloneJSONChecked(value);
}
/** Internal cooperative budget hook; public JSON helpers keep their signatures. */
export function cloneJSONChecked<T>(value: T, checkpoint?: () => void): T {
  const ancestors = new Set<object>();
  function visit(item: unknown): unknown {
    checkpoint?.();
    if (
      item === null || typeof item === "string" || typeof item === "boolean"
    ) {
      return item;
    }
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (!item || typeof item !== "object") {
      throw new Error("Document values must be finite JSON values");
    }
    if (ancestors.has(item)) throw new Error("Circular data cannot be stored");
    const proto = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) {
      throw new Error("Document values must be plain JSON objects");
    }
    ancestors.add(item);
    const result: unknown = Array.isArray(item)
      ? item.map(visit)
      : Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, visit(child)]),
      );
    ancestors.delete(item);
    return result;
  }
  return visit(value) as T;
}
export function freeze<T>(value: T): T {
  return freezeChecked(value);
}
export function freezeChecked<T>(value: T, checkpoint?: () => void): T {
  checkpoint?.();
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => freezeChecked(child, checkpoint));
  }
  return value;
}
export function diff(
  before: unknown,
  after: unknown,
  path: string[] = [],
): Patch[] {
  if (Object.is(before, after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(
      (key) => {
        if (Object.hasOwn(a, key) && Object.hasOwn(b, key)) {
          return diff(a[key], b[key], [...path, key]);
        }
        return [
          {
            path: [...path, key],
            ...(Object.hasOwn(a, key) ? { before: a[key] as JsonValue } : {}),
            ...(Object.hasOwn(b, key) ? { after: b[key] as JsonValue } : {}),
            hadBefore: Object.hasOwn(a, key),
            hadAfter: Object.hasOwn(b, key),
          },
        ];
      },
    );
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [
    {
      path,
      before: before as JsonValue,
      after: after as JsonValue,
      hadBefore: true,
      hadAfter: true,
    },
  ];
}
export function applyPatches<T>(
  snapshot: T,
  patches: readonly Patch[],
  inverse = false,
): T {
  const result = cloneJSON(snapshot);
  for (const patch of inverse ? [...patches].reverse() : patches) {
    let target = result as Record<string, unknown>;
    for (const key of patch.path.slice(0, -1)) {
      target = target[key] as Record<string, unknown>;
    }
    const key = patch.path.at(-1)!;
    const present = inverse ? patch.hadBefore : patch.hadAfter;
    if (present) {
      Object.defineProperty(target, key, {
        value: cloneJSON(inverse ? patch.before : patch.after),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else delete target[key];
  }
  return result;
}
export function assertId(id: unknown): asserts id is string {
  if (
    typeof id !== "string" ||
    !id ||
    ["__proto__", "constructor", "prototype"].includes(id)
  ) {
    throw new Error("IDs must be nonempty, safe strings");
  }
}
export function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}
