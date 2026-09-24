import { Position, Size } from '../../utils/interfaces';
import { Component, Entity } from '../components/component';
import { Port } from '../components/port';
import { RenderTransform } from '../rendering/renderer';
export enum EventType {
  SCENE_CHANGED = 'SCENE_CHANGED',
  VIEW_CHANGED = 'VIEW_CHANGED',
  ENTITY_REMOVED = 'ENTITY_REMOVED',

  // Component events
  COMPONENT_HOVER = 'COMPONENT_HOVER',
  COMPONENT_DRAG_STARTED = 'COMPONENT_DRAG_STARTED',
  COMPONENT_DRAGGED = 'COMPONENT_DRAGGED',
  COMPONENT_DRAG_ENDED = 'COMPONENT_DRAG_ENDED',
  COMPONENT_SELECTED = 'COMPONENT_SELECTED',

  // Connection events
  CONNECTION_STARTED = 'CONNECTION_STARTED',
  CONNECTION_UPDATED = 'CONNECTION_UPDATED',
  CONNECTION_COMPLETED = 'CONNECTION_COMPLETED',
  CONNECTION_CANCELLED = 'CONNECTION_CANCELLED',

  // Port events
  PORT_CONNECTED = 'PORT_CONNECTED',
  PORT_DISCONNECTED = 'PORT_DISCONNECTED',

  // View events
  VIEW_PAN_STARTED = 'VIEW_PAN_STARTED',
  VIEW_PANNED = 'VIEW_PANNED',
  VIEW_PAN_ENDED = 'VIEW_PAN_ENDED',
  VIEW_ZOOMED = 'VIEW_ZOOMED',

  // Canvas events
  CANVAS_RESIZED = 'CANVAS_RESIZED',

  // Context menu events
  CONTEXT_MENU_OPEN = 'CONTEXT_MENU_OPEN',
  CONTEXT_MENU_CLOSE = 'CONTEXT_MENU_CLOSE',
  CONTEXT_MENU_REOPEN = 'CONTEXT_MENU_REOPEN',

  RENDER_MAIN_CANVAS = 'RENDER_MAIN_CANVAS',
  RENDER_BACKGROUND_CANVAS = 'RENDER_BACKGROUND_CANVAS',
}

export interface EventPayloads {
  [EventType.SCENE_CHANGED]: void;
  [EventType.VIEW_CHANGED]: RenderTransform;
  [EventType.ENTITY_REMOVED]: { entity: Entity };
  [EventType.COMPONENT_HOVER]: {
    component: Component<any> | null;
    isHovered: boolean;
  };
  [EventType.COMPONENT_SELECTED]: {
    component: Component<any>;
    isSelected: boolean;
  };
  [EventType.COMPONENT_DRAG_STARTED]: {
    component: Component<any>;
    offset: Position;
  };
  [EventType.COMPONENT_DRAGGED]: {
    component: Component<any>;
    position: Position;
  };
  [EventType.COMPONENT_DRAG_ENDED]: {
    component: Component<any>;
  };
  [EventType.CONNECTION_STARTED]: {
    port: Port;
    position: Position;
  };
  [EventType.CONNECTION_UPDATED]: {
    port: Port;
    position: Position;
  };
  [EventType.CONNECTION_COMPLETED]: {
    sourcePort: Port;
    targetPort: Port;
  };
  [EventType.CONNECTION_CANCELLED]: void;
  [EventType.PORT_CONNECTED]: {
    port: Port;
    connectedPort: Port;
  };
  [EventType.PORT_DISCONNECTED]: {
    port: Port;
    disconnectedPort: Port;
  };
  [EventType.VIEW_PAN_STARTED]: {
    position: Position;
  };
  [EventType.VIEW_PANNED]: {
    position: Position;
  };
  [EventType.VIEW_PAN_ENDED]: {
    position: Position;
  };
  [EventType.VIEW_ZOOMED]: {
    scale: number;
    offset: Position;
  };
  [EventType.CANVAS_RESIZED]: {
    size: Size;
    devicePixelRatio: number;
  };
  [EventType.CONTEXT_MENU_OPEN]: {
    position: Position;
    component?: Component<any>;
  };
  [EventType.CONTEXT_MENU_REOPEN]: {
    position: Position;
    component?: Component<any>;
  };
  [EventType.CONTEXT_MENU_CLOSE]: void;
  [EventType.RENDER_MAIN_CANVAS]: {
    renderTransform: RenderTransform;
  };
  [EventType.RENDER_BACKGROUND_CANVAS]: {
    renderTransform: RenderTransform;
  };
}
