import type { Position } from '../../utils/interfaces';
import type { AddPortParams } from './types';
import type {
  ConnectionStyle,
  EditorStyles,
  NodeStyle,
  PortStyle,
  StyleStateParams,
} from '../styles/styles';
import type { RenderTransform } from '../rendering/renderer';
import parseColor from '../animation/colorParser';

export interface SerializedPort extends AddPortParams {
  id: string;
  style: StyleStateParams<PortStyle>;
}

export interface SerializedNode {
  id: string;
  position: Position;
  label: string;
  data: Record<string, unknown>;
  style: StyleStateParams<NodeStyle>;
  ports: SerializedPort[];
}

export interface SerializedConnection {
  id: string;
  sourcePortId: string;
  targetPortId: string;
  style: StyleStateParams<ConnectionStyle>;
}

/** Versioned, JSON-only persisted graph. Interaction and running animation state are excluded. */
export interface EditorState {
  version: 1;
  viewport: RenderTransform;
  styles: EditorStyles;
  nodes: SerializedNode[];
  connections: SerializedConnection[];
}

function fail(message: string): never {
  throw new Error(`Invalid editor state: ${message}`);
}
function record(value: unknown, name: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${name} must be an object`);
  return value as Record<string, any>;
}
function finite(value: unknown, name: string, min = -Infinity): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min)
    fail(`${name} must be a finite number >= ${min}`);
}
function position(value: unknown): void {
  const point = record(value, 'position');
  finite(point.x, 'position.x');
  finite(point.y, 'position.y');
}

/** Clone only JSON-compatible values, rejecting data that JSON.stringify would silently corrupt. */
export function cloneJSON<T>(value: T): T {
  const ancestors = new Set<object>();
  function visit(item: unknown, inArray = false): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      finite(item, 'JSON number');
      return;
    }
    if (item === undefined && !inArray) return;
    if (typeof item !== 'object' || !item) fail('values must be JSON-compatible');
    if (ancestors.has(item)) fail('circular data cannot be serialized');
    if (!Array.isArray(item) && Object.prototype.toString.call(item) !== '[object Object]')
      fail('values must be plain JSON objects');
    ancestors.add(item);
    for (const child of Object.values(item)) visit(child, Array.isArray(item));
    ancestors.delete(item);
  }
  visit(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

const properties = {
  node: [
    'width',
    'height',
    'fill',
    'borderRadius',
    'borderColor',
    'borderWidth',
    'labelColor',
    'labelFont',
  ],
  port: ['fill', 'radius', 'borderColor', 'borderWidth'],
  connection: ['color', 'width', 'dashArray', 'lineDashOffset', 'lineStyle'],
};
type StyleKind = keyof typeof properties;

function color(value: unknown): void {
  if (typeof value === 'string' && parseColor(value)) return;
  fail('style colors must be supported CSS colors');
}
function gradient(value: unknown): void {
  const definition = record(value, 'gradient');
  if (definition.type !== 'linear' && definition.type !== 'radial')
    fail('unknown gradient type');
  if (!Array.isArray(definition.colorStops) || !definition.colorStops.length)
    fail('gradient requires color stops');
  for (const stop of definition.colorStops) {
    const entry = record(stop, 'gradient stop');
    finite(entry.offset, 'gradient offset', 0);
    if (entry.offset > 1) fail('gradient offset must be <= 1');
    color(entry.color);
  }
  for (const key of ['x0', 'y0', 'x1', 'y1'])
    if (definition[key] !== undefined) finite(definition[key], key);
  for (const key of ['r0', 'r1'])
    if (definition[key] !== undefined) finite(definition[key], key, 0);
}
function styleValue(key: string, value: unknown, kind: StyleKind): void {
  if (value && typeof value === 'object' && 'value' in value) {
    const wrapped = value as { value: unknown; transition?: unknown };
    if (wrapped.transition !== undefined && typeof wrapped.transition !== 'boolean')
      fail('transition must be boolean');
    styleValue(key, wrapped.value, kind);
    return;
  }
  if (['fill', 'color', 'borderColor', 'labelColor'].includes(key)) {
    if (typeof value === 'string') color(value);
    else if (key === 'fill' || key === 'color') gradient(value);
    else fail(`${key} must be a color`);
  } else if (key === 'labelFont') {
    if (typeof value !== 'string') fail('labelFont must be a string');
  } else if (key === 'lineStyle') {
    if (value !== 'straight' && value !== 'curved') fail('unknown line style');
  } else if (key === 'dashArray') {
    if (!Array.isArray(value)) fail('dashArray must be an array');
    value.forEach((number) => finite(number, 'dash length', 0));
  } else {
    finite(value, key, key === 'lineDashOffset' ? -Infinity : 0);
    if ((key === 'height' || (key === 'width' && kind === 'node')) && value === 0)
      fail('node dimensions must be positive');
  }
}
function style(value: unknown, kind: StyleKind, nested = false): void {
  const definition = record(value, `${kind} style`);
  for (const [key, entry] of Object.entries(definition)) {
    if (!nested && (key === 'hover' || key === 'active')) {
      style(entry, kind, true);
      continue;
    }
    if (!nested && key === 'animation') {
      for (const [property, settings] of Object.entries(record(entry, 'animation'))) {
        if (
          !properties[kind].includes(property) ||
          ['labelFont', 'lineStyle'].includes(property)
        )
          fail('unsupported animation property');
        const animation = record(settings, 'animation settings');
        for (const endpoint of [animation.from, animation.to]) {
          if (endpoint && typeof endpoint === 'object' && 'value' in endpoint)
            fail('animation endpoints must be unwrapped values');
        }
        styleValue(property, animation.from, kind);
        styleValue(property, animation.to, kind);
        if (
          typeof animation.from !== typeof animation.to ||
          Array.isArray(animation.from) !== Array.isArray(animation.to)
        )
          fail('animation endpoints must have matching types');
        if (animation.duration !== undefined) {
          finite(animation.duration, 'animation duration', 0);
          if (animation.duration === 0) fail('animation duration must be positive');
        }
        if (!['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(animation.easing))
          fail('unknown animation easing');
        if (animation.loop !== undefined && typeof animation.loop !== 'boolean')
          fail('animation loop must be boolean');
        if (
          animation.loopMode !== undefined &&
          !['none', 'ping-pong', 'wrap-around'].includes(animation.loopMode)
        )
          fail('unknown loop mode');
      }
      continue;
    }
    if (!properties[kind].includes(key)) fail(`unknown ${kind} style property: ${key}`);
    styleValue(key, entry, kind);
  }
}

/** Validate and detach a snapshot completely before the live editor is modified. */
export function parseEditorState(input: string | EditorState): EditorState {
  const state = record(
    cloneJSON(typeof input === 'string' ? JSON.parse(input) : input),
    'state',
  );
  if (state.version !== 1) fail('unsupported version');
  const viewport = record(state.viewport, 'viewport');
  finite(viewport.scale, 'scale', 0.1);
  if (viewport.scale > 5) fail('scale must be <= 5');
  finite(viewport.offsetX, 'offsetX');
  finite(viewport.offsetY, 'offsetY');
  const defaults = record(state.styles, 'default styles');
  for (const kind of ['node', 'port', 'connection'] as const) style(defaults[kind], kind);
  if (!Array.isArray(state.nodes) || !Array.isArray(state.connections))
    fail('nodes and connections must be arrays');
  const ids = new Set<string>();
  const claim = (id: unknown) => {
    if (typeof id !== 'string' || !id || ids.has(id)) fail('IDs must be non-empty and unique');
    ids.add(id);
  };
  const ports = new Map<string, { nodeId: string; type: string }>();
  for (const item of state.nodes) {
    const node = record(item, 'node');
    claim(node.id);
    position(node.position);
    if (typeof node.label !== 'string') fail('node label must be a string');
    record(node.data, 'node data');
    style(node.style, 'node');
    if (!Array.isArray(node.ports)) fail('ports must be an array');
    for (const item of node.ports) {
      const port = record(item, 'port');
      claim(port.id);
      position(port.position);
      style(port.style, 'port');
      if (port.type !== 'input' && port.type !== 'output') fail('invalid port type');
      ports.set(port.id, { nodeId: node.id, type: port.type });
    }
  }
  const pairs = new Set<string>();
  for (const item of state.connections) {
    const connection = record(item, 'connection');
    claim(connection.id);
    style(connection.style, 'connection');
    const source = ports.get(connection.sourcePortId),
      target = ports.get(connection.targetPortId);
    if (!source || !target) fail('connection refers to a missing port');
    if (source.type !== 'output' || target.type !== 'input' || source.nodeId === target.nodeId)
      fail('invalid connection ports');
    const pair = JSON.stringify([connection.sourcePortId, connection.targetPortId]);
    if (pairs.has(pair)) fail('duplicate connection');
    pairs.add(pair);
  }
  return state as unknown as EditorState;
}
