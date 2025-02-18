import ObservableMap from '../../utils/observableMap';
import { Connection } from '../components/connection';
import { Port } from '../components/port';
import { Node } from '../components/node';
import { Component, ComponentType, Entity } from '../components/component';

type UnwrapTransitionableValue<V> = V extends Transitionable<infer U> ? U : V;

export type UnTransitionableStyle<T> = {
  [K in keyof T]: UnwrapTransitionableValue<T[K]>;
};

interface Transitionable<T = any> {
  transition?: boolean;
  value: T;
}

type TransitionableValue<T> = T | Transitionable<T>;

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
  labelFont: '16px Inter, serif',
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
  private nodeStyles = new ObservableMap<Node, StyleState<NodeStyle>>();
  private connectionStyles = new ObservableMap<Connection, StyleState<ConnectionStyle>>();
  private portStyles = new ObservableMap<Port, StyleState<PortStyle>>();

  constructor(styles?: Partial<EditorStyles>) {
    if (styles) {
      this.setDefaultStyles(styles);
    } else {
      this.setDefaultStyles(defaultStyles);
    }
  }

  public onTransitionableStyleChanged<T>(
    componentType: ComponentType,
    callback: (component: Component<T> | Entity, updatedProps: ComputedStyleChange<T>) => void
  ) {
    switch (componentType) {
      case ComponentType.Node: {
        this.nodeStyles.on('update', (key, oldValue, newValue) =>
          this.computeStyleUpdate(
            key as Component<T>,
            oldValue as StyleState<T>,
            newValue as StyleState<T>,
            callback
          )
        );
        break;
      }
      case ComponentType.Connection: {
        this.connectionStyles.on('update', (key, oldValue, newValue) =>
          this.computeStyleUpdate(
            key as Entity,
            oldValue as StyleState<T>,
            newValue as StyleState<T>,
            callback
          )
        );
        break;
      }
      case ComponentType.Port: {
        this.portStyles.on('update', (key, oldValue, newValue) =>
          this.computeStyleUpdate(
            key as Component<T>,
            oldValue as StyleState<T>,
            newValue as StyleState<T>,
            callback
          )
        );
        break;
      }
    }
  }

  public onAnimation<T>(
    componentType: ComponentType,
    callback: (component: Component<T> | Entity, updatedProps: ComputedStyleChange<T>) => void
  ) {
    switch (componentType) {
      case ComponentType.Node: {
        this.nodeStyles.on('add', (key, value) =>
          this.computeAnimationAdd(key as Component<T>, value as StyleState<T>, callback)
        );
        break;
      }
      case ComponentType.Connection: {
        this.connectionStyles.on('add', (key, value) =>
          this.computeAnimationAdd(
            key as Entity,
            value as StyleState<T>,

            callback
          )
        );
        break;
      }
      case ComponentType.Port: {
        this.portStyles.on('add', (key, value) =>
          this.computeAnimationAdd(
            key as Component<T>,
            value as StyleState<T>,

            callback
          )
        );
        break;
      }
    }
  }

  private computeStyleUpdate<T>(
    component: Component<T> | Entity,
    oldValue: StyleState<T>,
    newValue: StyleState<T>,
    callback: (component: Component<T> | Entity, updatedProps: ComputedStyleChange<T>) => void
  ): ComputedStyleChange<T> {
    const updatedProps = Object.entries(newValue.currentState as Record<string, any>).reduce(
      (acc, [key, value]) => {
        if (
          oldValue.currentState[key as keyof T] !== value &&
          key !== 'hover' &&
          key !== 'active' &&
          key !== 'animation'
        ) {
          console.log(key, value);
          (acc.currentState as Record<string, any>)[key] = value;
          (acc.previousState as Record<string, any>)[key] = oldValue.currentState[key as keyof T];
        }
        return acc;
      },
      { currentState: {}, previousState: {} } as ComputedStyleChange<T>
    );

    if (Object.keys(updatedProps).length > 0) {
      callback(component, updatedProps);
    }

    return updatedProps;
  }

  private computeAnimationAdd<T>(
    component: Component<T> | Entity,
    state: StyleState<T>,
    callback: (component: Component<T> | Entity, props: ComputedStyleChange<T>) => void
  ): ComputedStyleChange<T> {
    const props = Object.entries(state.currentState as Record<string, any>).reduce(
      (acc, [key, value]) => {
        if (key !== 'hover' && key !== 'active') {
          (acc.currentState as Record<string, any>)[key] = value;
        }
        return acc;
      },
      { currentState: {}, previousState: {} } as ComputedStyleChange<T>
    );

    if (Object.keys(props).length > 0) {
      callback(component, props);
    }

    return props;
  }

  getDefaultStyles() {
    return this.defaultStyles;
  }

  setDefaultStyles(styles: Partial<NewDefaultEditorStyles>) {
    this.defaultStyles = {
      node: {
        ...defaultStyles.node,
        ...styles.node,
      },
      connection: {
        ...defaultStyles.connection,
        ...styles.connection,
      },
      port: {
        ...defaultStyles.port,
        ...styles.port,
      },
    };
  }

  private isTransitionable<T>(
    value: TransitionableValue<T> | GradientDefinition
  ): value is Transitionable<T> {
    return (value as Transitionable<T>).transition !== undefined;
  }

  public isGradientDefinition<T>(
    value: TransitionableValue<T> | GradientDefinition
  ): value is GradientDefinition {
    return (
      value && typeof value === 'object' && !this.isTransitionable(value) && 'colorStops' in value
    );
  }

  getTransitionableProp<T>(prop: TransitionableValue<T>): T {
    return this.isTransitionable(prop) ? prop.value : prop;
  }

  // getTransitionableProps<T extends Style>(
  //   style: StyleStateParams<T>
  // ): ComputedStyle<ComponentStyleState<T>> {
  //   // A helper that recursively unwraps transitionable properties.
  //   const recursiveUnwrap = (input: any): any => {
  //     // Return early for null/undefined values.
  //     if (input === null || input === undefined) {
  //       return input;
  //     }
  //     // If the value is a transitionable, unwrap it and then try unwrapping its value recursively.
  //     if (this.isTransitionable(input)) {
  //       return recursiveUnwrap(input.value);
  //     }
  //     // If the value is a gradient definition, assume it is already in its final form.
  //     if (this.isGradientDefinition(input)) {
  //       return input;
  //     }
  //     // If the value is an array, recursively process each element.
  //     if (Array.isArray(input)) {
  //       return input.map(recursiveUnwrap);
  //     }
  //     // If the value is a plain object, process each key.
  //     if (typeof input === 'object') {
  //       const result: any = {};
  //       for (const key in input) {
  //         if (input.hasOwnProperty(key)) {
  //           result[key] = recursiveUnwrap(input[key]);
  //         }
  //       }
  //       return result;
  //     }
  //     // For any other type (number, string, boolean, etc.), just return it.
  //     return input;
  //   };

  //   return recursiveUnwrap(style);
  // }

  getTransitionableProps<T extends Style>(
    style: StyleStateParams<T>
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
          {} as any
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

  /**
   * Instead of mutating an existing style state,
   * we create a new state instance with the update.
   */
  setNodeStyle(node: Node, style?: Partial<NodeStyle>) {
    const currentStyle = this.nodeStyles.get(node);

    if (!currentStyle) {
      const initialState: ComponentStyleState<NodeStyle> = { ...this.defaultStyles.node, ...style };
      this.nodeStyles.set(node, new StyleState<NodeStyle>(initialState));
    } else {
      // Create a new immutable state with the update.
      const newState = currentStyle.withUpdate(style || {});
      this.nodeStyles.set(node, newState);
    }
  }

  setConnectionStyle(connection: Connection, style?: Partial<ConnectionStyle>) {
    const currentStyle = this.connectionStyles.get(connection);

    if (!currentStyle) {
      const initialState: ComponentStyleState<ConnectionStyle> = {
        ...this.defaultStyles.connection,
        ...style,
      };
      this.connectionStyles.set(connection, new StyleState<ConnectionStyle>(initialState));
    } else {
      const newState = currentStyle.withUpdate(style || {});
      this.connectionStyles.set(connection, newState);
    }
  }

  setPortStyle(port: Port, style?: Partial<PortStyle>) {
    const currentStyle = this.portStyles.get(port);

    if (!currentStyle) {
      const initialState: ComponentStyleState<PortStyle> = { ...this.defaultStyles.port, ...style };
      this.portStyles.set(port, new StyleState<PortStyle>(initialState));
    } else {
      const newState = currentStyle.withUpdate(style || {});
      this.portStyles.set(port, newState);
    }
  }

  deleteNodeStyle(node: Node) {
    this.nodeStyles.delete(node);
  }

  resetAll() {
    this.nodeStyles.clear();
    this.connectionStyles.clear();
    this.portStyles.clear();
  }
}
