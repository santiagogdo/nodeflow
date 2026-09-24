import ObservableMap from '../../utils/observableMap';
import { Connection } from '../components/connection';
import { Port } from '../components/port';
import { Node } from '../components/node';
import { Component, ComponentType, Entity } from '../components/component';
import { EventBus } from '../events/eventBus';
import { EventType } from '../events/eventType';

type UnwrapTransitionableValue<V> = V extends Transitionable<infer U> ? U : V;

export type UnTransitionableStyle<T> = {
  [K in keyof T]: UnwrapTransitionableValue<T[K]>;
};

export interface Transitionable<T = any> {
  transition?: boolean;
  value: T;
}

export type TransitionableValue<T> = T | Transitionable<T>;

interface Style {
  [key: string]: TransitionableValue<any>;
}

export type ComputedStyle<T extends Style> = {
  [K in keyof T]: T[K] extends TransitionableValue<infer U> ? U : T[K];
};

type ExtractPrimitiveValue<T> = T extends TransitionableValue<infer U> ? U : T;

export interface Animatable<T> {
  from: T;
  to: T;
  duration?: number;
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear';
  loop?: boolean;
  loopMode?: 'none' | 'ping-pong' | 'wrap-around';
}

export type AnimatableStyle<T> = {
  [K in keyof T]: Animatable<ExtractPrimitiveValue<T[K]>>;
};

export interface GradientStop {
  offset: number; // 0..1
  color: string; // e.g. '#FF0000'
}

export interface Gradient {
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  colorStops: GradientStop[];
}

export interface LinearGradient extends Gradient {
  type: 'linear';
}

export interface RadialGradient extends Gradient {
  type: 'radial';
  r0?: number;
  r1?: number;
}

export type GradientDefinition = LinearGradient | RadialGradient;

export type StyleStateParams<T> = ComponentStyleState<Partial<T>>;

export type ComponentStyleState<T> = T & {
  hover?: Partial<UnTransitionableStyle<T>>;
  active?: Partial<UnTransitionableStyle<T>>;
  animation?: AnimatableStyle<Partial<UnTransitionableStyle<T>>>;
};

export interface ComputedStyleChange<T> {
  previousState: Partial<T>;
  currentState: Partial<T>;
}

export class StyleState<T> {
  public readonly previousState: ComponentStyleState<T>;
  public readonly currentState: ComponentStyleState<T>;

  constructor(currentState: ComponentStyleState<T>, previousState?: ComponentStyleState<T>) {
    this.currentState = currentState;
    this.previousState = previousState ? previousState : currentState;
  }

  /**
   * Returns a new StyleState with an updated currentState.
   * For properties like `hover` or `active` (if provided in the update),
   * the method merges them with the current state's sub-properties.
   */
  withUpdate(update: StyleStateParams<T>): StyleState<T> {
    const newState: ComponentStyleState<T> = {
      ...this.currentState,
      ...update,
      // Merge the "hover" and "active" properties if provided.
      hover: update.hover
        ? { ...this.currentState.hover, ...update.hover }
        : this.currentState.hover,
      active: update.active
        ? { ...this.currentState.active, ...update.active }
        : this.currentState.active,
      animation: update.animation
        ? { ...this.currentState.animation, ...update.animation }
        : this.currentState.animation,
    };
    return new StyleState(newState, this.currentState);
  }
}

export interface NodeStyle {
  width: TransitionableValue<number>;
  height: TransitionableValue<number>;
  fill: TransitionableValue<string> | GradientDefinition;
  borderRadius: TransitionableValue<number>;
  borderColor: TransitionableValue<string>;
  borderWidth: TransitionableValue<number>;
  labelColor: TransitionableValue<string>;
  labelFont: TransitionableValue<string>;
}

export interface PortStyle {
  fill: TransitionableValue<string> | GradientDefinition;
  radius: TransitionableValue<number>;
  borderColor: TransitionableValue<string>;
  borderWidth: TransitionableValue<number>;
}

export type LineStyle = 'straight' | 'curved';

export interface ConnectionStyle {
  color: TransitionableValue<string> | GradientDefinition;
  width: TransitionableValue<number>;
  dashArray: TransitionableValue<Array<number>>;
  lineDashOffset: TransitionableValue<number>;
  lineStyle: TransitionableValue<LineStyle>;
}

export type NewDefaultEditorStyles = {
  node: StyleStateParams<Partial<NodeStyle>>;
  connection: StyleStateParams<Partial<ConnectionStyle>>;
  port: StyleStateParams<Partial<PortStyle>>;
};

export type EditorStyles = {
  node: ComponentStyleState<NodeStyle>;
  connection: ComponentStyleState<ConnectionStyle>;
  port: ComponentStyleState<PortStyle>;
};

export type RendererStyles = {
  node: StyleState<NodeStyle>;
  connection: StyleState<ConnectionStyle>;
  port: StyleState<PortStyle>;
};

const defaultNodeStyle: NodeStyle = {
  width: 120,
  height: 50,
  fill: {
    transition: false,
    value: '#2D2D3A',
  },
  borderColor: {
    transition: true,
    value: '#404052',
  },
  borderWidth: 2,
  borderRadius: 8,
  labelColor: '#FFFFFF',
  labelFont: '16px Inter, system-ui, sans-serif',
};

const defaultConnectionStyle: ConnectionStyle = {
  lineStyle: 'curved',
  color: '#787878',
  width: 3,
  dashArray: [],
  lineDashOffset: 0,
};

const defaultPortStyle: PortStyle = {
  fill: '#565676',
  borderColor: '#404052',
  borderWidth: 2,
  radius: 8,
};

export const defaultStyles: EditorStyles = {
  node: {
    ...defaultNodeStyle,
    // hover: {
    //   borderColor: '#53536E',
    // },
    active: {
      borderColor: '#6C6C8C',
    },
  },
  connection: {
    ...defaultConnectionStyle,
    // Optionally, add hover/active properties here.
  },
  port: {
    ...defaultPortStyle,
    hover: {
      fill: '#6C6C8C',
    },
  },
};

export class StyleManager {
  private defaultStyles!: EditorStyles;
  private changingHover = false;
  private hoverStyles = new WeakMap<Entity, ComponentStyleState<any>>();
  private nodeStyles = new ObservableMap<Node, StyleState<NodeStyle>>();
  private connectionStyles = new ObservableMap<Connection, StyleState<ConnectionStyle>>();
  private portStyles = new ObservableMap<Port, StyleState<PortStyle>>();

  private eventBus: EventBus;

  constructor(eventBus: EventBus, styles?: Partial<EditorStyles>) {
    this.eventBus = eventBus;
    const observe = <K, V>(map: ObservableMap<K, V>) => {
      map.on('add', () => this.invalidate());
      map.on('update', () => this.invalidate());
      map.on('delete', () => this.invalidate());
      map.on('clear', () => this.invalidate());
    };
    observe(this.nodeStyles);
    observe(this.portStyles);
    observe(this.connectionStyles);
    if (styles) {
      this.setDefaultStyles(styles);
    } else {
      this.setDefaultStyles(defaultStyles);
    }
  }

  public getBaseStyle(entity: Entity): ComponentStyleState<any> {
    return this.hoverStyles.get(entity) ?? this.getEntityStyle(entity)?.currentState ?? {};
  }

  private getEntityStyle(entity: Entity): StyleState<any> | undefined {
    if (entity instanceof Node) return this.nodeStyles.get(entity);
    if (entity instanceof Port) return this.portStyles.get(entity);
    return this.connectionStyles.get(entity as Connection);
  }

  public setHovered(entity: Node | Port | Connection, hovered: boolean): void {
    if (entity.isHovered === hovered) return;
    entity.isHovered = hovered;
    const state = this.getEntityStyle(entity);
    if (!state) return;
    let update: ComponentStyleState<any>;
    if (hovered) {
      this.hoverStyles.set(entity, state.currentState);
      update = state.currentState.hover ?? {};
    } else {
      update = this.hoverStyles.get(entity) ?? state.currentState;
      this.hoverStyles.delete(entity);
    }
    this.changingHover = true;
    try {
      if (entity instanceof Node) this.setNodeStyle(entity, update);
      else if (entity instanceof Port) this.setPortStyle(entity, update);
      else this.setConnectionStyle(entity, update);
    } finally {
      this.changingHover = false;
    }
  }

  public invalidate(): void {
    this.eventBus.emit(EventType.SCENE_CHANGED);
  }

  public onTransitionableStyleChanged<T>(
    componentType: ComponentType,
    callback: (component: Component<T> | Entity, updatedProps: ComputedStyleChange<T>) => void,
  ) {
    switch (componentType) {
      case ComponentType.Node: {
        this.nodeStyles.on('update', (key, oldValue, newValue) =>
          this.computeStyleUpdate(
            key as Component<T>,
            oldValue as StyleState<T>,
            newValue as StyleState<T>,
            callback,
          ),
        );
        break;
      }
      case ComponentType.Connection: {
        this.connectionStyles.on('update', (key, oldValue, newValue) =>
          this.computeStyleUpdate(
            key as Entity,
            oldValue as StyleState<T>,
            newValue as StyleState<T>,
            callback,
          ),
        );
        break;
      }
      case ComponentType.Port: {
        this.portStyles.on('update', (key, oldValue, newValue) =>
          this.computeStyleUpdate(
            key as Component<T>,
            oldValue as StyleState<T>,
            newValue as StyleState<T>,
            callback,
          ),
        );
        break;
      }
    }
  }

  public onAnimation<T>(
    componentType: ComponentType,
    callback: (component: Component<T> | Entity, updatedProps: ComputedStyleChange<T>) => void,
  ) {
    const subscribe = <K extends Entity, S>(map: ObservableMap<K, StyleState<S>>) => {
      map.on('add', (entity, state) =>
        this.computeAnimationAdd(entity, state as unknown as StyleState<T>, callback),
      );
      map.on('update', (entity, previous, current) => {
        if (
          JSON.stringify(previous.currentState.animation) ===
          JSON.stringify(current.currentState.animation)
        )
          return;
        callback(entity, {
          previousState: { animation: previous.currentState.animation },
          currentState: { animation: current.currentState.animation },
        } as unknown as ComputedStyleChange<T>);
      });
    };
    if (componentType === ComponentType.Node) subscribe(this.nodeStyles);
    else if (componentType === ComponentType.Port) subscribe(this.portStyles);
    else subscribe(this.connectionStyles);
  }

  private computeStyleUpdate<T>(
    component: Component<T> | Entity,
    oldValue: StyleState<T>,
    newValue: StyleState<T>,
    callback: (component: Component<T> | Entity, updatedProps: ComputedStyleChange<T>) => void,
  ): ComputedStyleChange<T> {
    const updatedProps = Object.entries(newValue.currentState as Record<string, any>).reduce(
      (acc, [key, value]) => {
        if (
          oldValue.currentState[key as keyof T] !== value &&
          key !== 'hover' &&
          key !== 'active' &&
          key !== 'animation'
        ) {
          (acc.currentState as Record<string, any>)[key] = value;
          (acc.previousState as Record<string, any>)[key] =
            oldValue.currentState[key as keyof T];
        }
        return acc;
      },
      { currentState: {}, previousState: {} } as ComputedStyleChange<T>,
    );

    if (Object.keys(updatedProps.currentState).length > 0) {
      callback(component, updatedProps);
    }

    return updatedProps;
  }

  private computeAnimationAdd<T>(
    component: Component<T> | Entity,
    state: StyleState<T>,
    callback: (component: Component<T> | Entity, props: ComputedStyleChange<T>) => void,
  ): ComputedStyleChange<T> {
    const props = Object.entries(state.currentState as Record<string, any>).reduce(
      (acc, [key, value]) => {
        if (key !== 'hover' && key !== 'active') {
          (acc.currentState as Record<string, any>)[key] = value;
        }
        return acc;
      },
      { currentState: {}, previousState: {} } as ComputedStyleChange<T>,
    );

    if (Object.keys(props).length > 0) {
      callback(component, props);
    }

    return props;
  }

  public getDefaultStyles() {
    return this.defaultStyles;
  }

  public replaceDefaultStyles(styles: Partial<NewDefaultEditorStyles>): void {
    this.defaultStyles = JSON.parse(JSON.stringify(defaultStyles)) as EditorStyles;
    this.setDefaultStyles(styles);
  }

  setDefaultStyles(styles: Partial<NewDefaultEditorStyles>) {
    this.defaultStyles = {
      node: {
        ...defaultStyles.node,
        ...this.defaultStyles?.node,
        ...styles.node,
      },
      connection: {
        ...defaultStyles.connection,
        ...this.defaultStyles?.connection,
        ...styles.connection,
      },
      port: {
        ...defaultStyles.port,
        ...this.defaultStyles?.port,
        ...styles.port,
      },
    };
  }

  public isTransitionable<T>(
    value: TransitionableValue<T> | GradientDefinition,
  ): value is Transitionable<T> {
    return value !== null && typeof value === 'object' && 'value' in value;
  }

  public isGradientDefinition<T>(
    value: TransitionableValue<T> | GradientDefinition,
  ): value is GradientDefinition {
    return (
      value &&
      typeof value === 'object' &&
      !this.isTransitionable(value) &&
      'colorStops' in value
    );
  }

  getTransitionableProp<T>(prop: TransitionableValue<T>): T {
    return this.isTransitionable(prop) ? prop.value : prop;
  }

  getTransitionableProps<T extends Style>(
    style: StyleStateParams<T>,
  ): ComputedStyle<ComponentStyleState<T>> {
    const computed = {} as ComputedStyle<ComponentStyleState<T>>;

    Object.entries(style).forEach(([key, value]) => {
      if (key === 'hover' || key === 'active' || key === 'animation') {
        if (!value) return computed;
        // For the 'hover' or 'active' states, assume the value is an object of style properties
        computed[key as keyof T] = Object.entries(value as object).reduce(
          (acc, [subKey, subValue]) => {
            (acc as any)[subKey] = this.getTransitionableProp(subValue);
            return acc;
          },
          {} as any,
        );
      } else {
        (computed as any)[key] = this.getTransitionableProp(value);
      }
    });

    return computed;
  }

  getNodeStyle(node: Node) {
    return this.nodeStyles.get(node);
  }

  getConnectionStyle(connection: Connection) {
    return this.connectionStyles.get(connection);
  }

  getPortStyle(port: Port) {
    return this.portStyles.get(port);
  }

  private setStyle<K extends Entity, T>(
    entity: K,
    map: ObservableMap<K, StyleState<T>>,
    defaults: ComponentStyleState<T>,
    update?: StyleStateParams<T>,
  ): void {
    const current = map.get(entity);
    const hoveredBase = this.hoverStyles.get(entity);
    if (hoveredBase && !this.changingHover) {
      const nextBase = new StyleState<T>(hoveredBase).withUpdate(update ?? {}).currentState;
      this.hoverStyles.set(entity, nextBase);
      map.set(
        entity,
        new StyleState<T>({ ...nextBase, ...nextBase.hover }, current?.currentState),
      );
    } else {
      map.set(
        entity,
        current
          ? current.withUpdate(update ?? {})
          : new StyleState<T>({ ...defaults, ...update }),
      );
    }
  }

  setNodeStyle(node: Node, style?: StyleStateParams<NodeStyle>) {
    this.setStyle(node, this.nodeStyles, this.defaultStyles.node, style);
    node.updatePortPositions();
  }
  setConnectionStyle(connection: Connection, style?: StyleStateParams<ConnectionStyle>) {
    this.setStyle(connection, this.connectionStyles, this.defaultStyles.connection, style);
  }
  setPortStyle(port: Port, style?: StyleStateParams<PortStyle>) {
    this.setStyle(port, this.portStyles, this.defaultStyles.port, style);
  }

  deleteNodeStyle(node: Node) {
    this.hoverStyles.delete(node);
    this.nodeStyles.delete(node);
  }

  deleteConnectionStyle(connection: Connection) {
    this.hoverStyles.delete(connection);
    this.connectionStyles.delete(connection);
  }

  deletePortStyle(port: Port) {
    this.hoverStyles.delete(port);
    this.portStyles.delete(port);
  }

  resetAll() {
    this.hoverStyles = new WeakMap();
    this.nodeStyles.clear();
    this.connectionStyles.clear();
    this.portStyles.clear();
  }
}
