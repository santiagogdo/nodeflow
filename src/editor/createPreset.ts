import type { EditorPreset, EditorPresetOverrides } from "./preset.ts";

/** Create a reusable preset from an explicit base, without importing any visual defaults.
 * Nested settings merge; arrays and callbacks replace. Undefined inherits, while null is retained.
 * Configuration is copied and frozen; callbacks are reused and the painter factory runs per editor.
 */
export function createPreset(
  base: Readonly<EditorPreset>,
  overrides: EditorPresetOverrides = {},
): Readonly<EditorPreset> {
  return merge(base, overrides) as Readonly<EditorPreset>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function merge(base: unknown, override: unknown): unknown {
  const value = override === undefined ? base : override;
  if (Array.isArray(value)) return Object.freeze([...value]);
  if (!isRecord(value)) return value;
  const inherited = isRecord(base) ? base : {};
  return Object.freeze(Object.fromEntries(
    [...new Set([...Object.keys(inherited), ...Object.keys(value)])].map(
      (key) => [
        key,
        merge(
          Object.hasOwn(inherited, key) ? inherited[key] : undefined,
          Object.hasOwn(value, key) ? value[key] : undefined,
        ),
      ],
    ),
  ));
}
