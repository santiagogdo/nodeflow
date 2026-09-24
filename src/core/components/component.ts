import { generateBase64UrlSafeId } from '../../utils/generateUniqueId';
import { Position, Size } from '../../utils/interfaces';
import { AnimationManager } from '../animation/animationManager';
import { ComputedStyle, StyleManager, StyleStateParams } from '../styles/styles';

export const enum ComponentType {
  Node = 'node',
  Connection = 'connection',
  Port = 'port',
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export abstract class Entity {
  public readonly id: string;
  public isDirty = false;
  public styleManager: StyleManager;
  constructor(styleManager: StyleManager, id?: string) {
    this.id = id ?? generateBase64UrlSafeId();
    this.styleManager = styleManager;
  }

  /**
   * Invalidate the editor so this change is drawn on its next scheduled frame.
   */
  public markDirty() {
    this.isDirty = true;
    this.styleManager.invalidate();
  }

  /**
   * Returns a bounding box in *canvas coordinates*.
   * For a Node, this might be x,y,width,height of the node.
   * For a Connection, it might be the rectangle covering the Bezier curve.
   */
  public abstract getBoundingBox(): BoundingBox;
}

export interface ComponentParams {
  id?: string;
  position?: Position;
}

export interface BaseComponentParams {
  id?: string;
  position: Position;
}
export interface StylableComponentParams<T> extends BaseComponentParams {
  style?: StyleStateParams<T>;
  styleManager: StyleManager;
}

export abstract class Component<T> extends Entity {
  private _position!: Position;

  public get position(): Position {
    return this._position;
  }
  public set position(value: Position) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      throw new Error('Position coordinates must be finite numbers');
    }
    this._position = new Proxy(
      { ...value },
      {
        set: (target, key, next: number) => {
          if (!Number.isFinite(next))
            throw new Error('Position coordinates must be finite numbers');
          const coordinate = key as keyof Position;
          if (target[coordinate] !== next) {
            target[coordinate] = next;
            this.markDirty();
          }
          return true;
        },
      },
    );
    this.markDirty();
  }
  public isHovered = false;
  public isActive = false;
  public abstract componentType: ComponentType;

  constructor(params: StylableComponentParams<T>) {
    super(params.styleManager, params.id);
    this.position = params.position;
  }

  public abstract handleHover(isHovered: boolean): void;

  public setIsHovered(isHovered: boolean) {
    this.isHovered = isHovered;
  }

  public setIsActive(isActive: boolean) {
    this.isActive = isActive;
  }

  public isComponentType<T extends Component<any>>(
    componentType: new (...args: any[]) => T,
  ): this is T {
    return this instanceof componentType;
  }

  public abstract setStyle(style: StyleStateParams<T>): void;

  public abstract draw(
    ctx: CanvasRenderingContext2D,
    animationManager?: AnimationManager,
  ): void;

  public abstract drawTransition(
    ctx: CanvasRenderingContext2D,
    transitionStyle: ComputedStyle<Partial<T>>,
  ): void;
}
