import {
  Component,
  ComponentType,
  BoundingBox,
  BaseComponentParams,
  StylableComponentParams,
} from './component';
import { Port } from './port';
import {
  NodeStyle,
  ComputedStyle,
  StyleStateParams,
  GradientDefinition,
  RadialGradient,
} from '../styles/styles';
import { AnimationManager } from '../animation/animationManager';

export interface NodeParams extends BaseComponentParams {
  data?: Record<string, unknown>;
  ports?: Array<Port>;
  label?: string;
  labelPosition?: { x: number; y: number };
}
export interface StylableNodeParams extends StylableComponentParams<NodeStyle> {
  data?: Record<string, unknown>;
  ports?: Array<Port>;
  label?: string;
  labelPosition?: { x: number; y: number };
}

/**
 * A Node with a position, size, optional label & ports.
 */
export class Node extends Component<NodeStyle> {
  public componentType = ComponentType.Node;
  public data: Record<string, unknown>;
  public ports: Array<Port>;
  private _label = '';
  public get label(): string {
    return this._label;
  }
  public set label(value: string) {
    this._label = value;
    this.markDirty();
  }
  private labelPosition: { x: number; y: number };

  constructor(params: StylableNodeParams) {
    super(params);
    this.data = params.data || {};
    this.label = params.label || '';
    this.ports = params.ports || [];
    this.ports.forEach((port) => {
      port.node = this;
    });
    this.labelPosition = params.labelPosition || { x: 8, y: 20 };
    this.styleManager.setNodeStyle(this, params.style);
  }

  /**
   * Creates a linear gradient for the node fill
   */
  private createLinearGradient(
    ctx: CanvasRenderingContext2D,
    gradDef: GradientDefinition,
    width: number,
    height: number,
  ): CanvasGradient {
    const grad = ctx.createLinearGradient(
      this.position.x + gradDef.x0! * width,
      this.position.y + gradDef.y0! * height,
      this.position.x + gradDef.x1! * width,
      this.position.y + gradDef.y1! * height,
    );

    gradDef.colorStops.forEach((stop) => {
      grad.addColorStop(stop.offset, stop.color);
    });

    return grad;
  }

  /**
   * Creates a radial gradient for the node fill
   */
  private createRadialGradient(
    ctx: CanvasRenderingContext2D,
    gradDef: GradientDefinition,
    width: number,
    height: number,
  ): CanvasGradient {
    const grad = ctx.createRadialGradient(
      this.position.x + gradDef.x0! * width,
      this.position.y + gradDef.y0! * height,
      (gradDef as RadialGradient).r0! * width,
      this.position.x + gradDef.x1! * width,
      this.position.y + gradDef.y1! * height,
      (gradDef as RadialGradient).r1! * width,
    );

    gradDef.colorStops.forEach((stop) => {
      grad.addColorStop(stop.offset, stop.color);
    });

    return grad;
  }

  public draw(ctx: CanvasRenderingContext2D, animationManager?: AnimationManager) {
    const styleState = this.styleManager.getNodeStyle(this);
    if (!styleState) return;

    // Get base styles
    const base = this.styleManager.getTransitionableProps(styleState.currentState);

    // Get animations (highest priority for their specific properties)
    const animations = animationManager?.activeAnimations.get(this) || {};

    // Get transitions (medium priority)
    const transitions = animationManager?.activeTransitions.get(this) || {};

    // Merge in correct priority order
    const style = {
      ...base, // Base styles (lowest priority)
      ...transitions, // Transitions override base
      ...animations, // Explicit animations have highest priority
    };

    let {
      fill,
      borderColor,
      borderWidth,
      borderRadius,
      labelColor,
      labelFont,
      width,
      height,
    } = style;

    // draw the node rectangle
    ctx.beginPath();
    ctx.roundRect(
      this.position.x,
      this.position.y,
      width,
      height,
      borderRadius < 0 ? 0 : borderRadius,
    );

    const isGradient = this.styleManager.isGradientDefinition(fill);

    if (isGradient) {
      const gradDef = fill;

      if (gradDef.type === 'linear') {
        ctx.fillStyle = this.createLinearGradient(ctx, gradDef, width, height);
      }

      if (gradDef.type === 'radial') {
        ctx.fillStyle = this.createRadialGradient(ctx, gradDef, width, height);
      }
    } else {
      ctx.fillStyle = fill;
    }

    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();

    // draw label
    if (this.label) {
      ctx.font = labelFont;
      ctx.fillStyle = labelColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(
        this.label,
        this.position.x + this.labelPosition.x,
        this.position.y + this.labelPosition.y,
      );
    }
  }

  /**
   * Draws the node during a transition animation
   */
  public drawTransition(
    ctx: CanvasRenderingContext2D,
    transitionStyle: ComputedStyle<Partial<NodeStyle>>,
  ) {
    const nodeState = this.styleManager.getNodeStyle(this);
    if (!nodeState) return;

    const base = this.styleManager.getTransitionableProps(nodeState.currentState);
    const merged = { ...base, ...transitionStyle };

    // Draw node rectangle
    ctx.beginPath();
    ctx.roundRect(
      this.position.x,
      this.position.y,
      merged.width,
      merged.height,
      merged.borderRadius < 0 ? 0 : merged.borderRadius,
    );

    // Handle gradient or solid fill
    if (this.styleManager.isGradientDefinition(merged.fill)) {
      const gradDef = merged.fill;
      ctx.fillStyle =
        gradDef.type === 'linear'
          ? this.createLinearGradient(ctx, gradDef, merged.width, merged.height)
          : this.createRadialGradient(ctx, gradDef, merged.width, merged.height);
    } else {
      ctx.fillStyle = merged.fill;
    }

    ctx.fill();
    ctx.strokeStyle = merged.borderColor;
    ctx.lineWidth = merged.borderWidth;
    ctx.stroke();

    // Draw label
    if (this.label) {
      ctx.font = merged.labelFont;
      ctx.fillStyle = merged.labelColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(
        this.label,
        this.position.x + this.labelPosition.x,
        this.position.y + this.labelPosition.y,
      );
    }
  }

  /**
   * Returns the bounding box of the node
   */
  public getBoundingBox(): BoundingBox {
    const nodeState = this.styleManager.getNodeStyle(this);
    const defaultStyles = this.styleManager.getDefaultStyles().node;
    const style = nodeState ? nodeState.currentState : defaultStyles;

    const { width, height } = this.styleManager.getTransitionableProps(style);

    return {
      x: this.position.x,
      y: this.position.y,
      width,
      height,
    };
  }

  /**
   * Updates the node's style
   */
  public setStyle(style: StyleStateParams<NodeStyle>): void {
    this.styleManager.setNodeStyle(this, style);
  }

  /**
   * Handles hover state changes and applies hover styles
   */
  public handleHover(isHovered: boolean): void {
    this.styleManager.setHovered(this, isHovered);
  }

  public updatePortPositions(): void {
    const style = this.styleManager.getNodeStyle(this);
    if (!style) return;
    const { width, height } = this.styleManager.getTransitionableProps(style.currentState);
    for (const port of this.ports) {
      port.position.x = port.type === 'input' ? 0 : width;
      port.position.y = Math.min(height, Math.max(0, port.position.y));
    }
  }

  /**
   * Calculates the optimal label position based on node dimensions
   */
  public calculateOptimalLabelPosition(): { x: number; y: number } {
    const { width, height } = this.getBoundingBox();
    return {
      x: width / 2,
      y: height / 2,
    };
  }
}
