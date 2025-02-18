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
  public id: string;
  public isDirty = false;
  public styleManager: StyleManager;
  constructor(styleManager: StyleManager) {
    this.id = generateBase64UrlSafeId();
    this.styleManager = styleManager;
  }

  /**
   * Mark this component as dirty.
   * The Editor or RenderPipeline will detect this and re-draw its bounding box.
   */
  public markDirty() {
    this.isDirty = true;
  }

  /**
   * Returns a bounding box in *canvas coordinates*.
   * For a Node, this might be x,y,width,height of the node.
   * For a Connection, it might be the rectangle covering the Bezier curve.
   */
  public abstract getBoundingBox(): BoundingBox;
}

export interface ComponentParams {
  position?: Position;
}

export interface BaseComponentParams {
  position: Position;
}
export interface StylableComponentParams<T> extends BaseComponentParams {
  style?: Partial<T>;
  styleManager: StyleManager;
}

export abstract class Component<T> extends Entity {
  public position: Position;
  public isHovered = false;
  public isActive = false;
  public abstract componentType: ComponentType;

  constructor(params: StylableComponentParams<T>) {
    super(params.styleManager);
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
    componentType: new (...args: any[]) => T
  ): this is T {
    return this instanceof componentType;
  }

  public abstract setStyle(style: StyleStateParams<T>): void;

  public abstract draw(ctx: CanvasRenderingContext2D, animationManager?: AnimationManager): void;

  public abstract drawTransition(
    ctx: CanvasRenderingContext2D,
    transitionStyle: ComputedStyle<Partial<T>>
  ): void;
}
