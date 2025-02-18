import { Position } from '../../utils/interfaces';
import { ComponentType, BoundingBox, StylableComponentParams } from './component';
import { Node } from './node';
import { PortStyle, ComputedStyle } from '../styles/styles';
import { Component } from './component';
import { AnimationManager } from '../animation/animationManager';

type PortType = 'input' | 'output';

export interface PortParams {
  position: Position;
  node?: Node;
  type?: PortType;
}

export interface StylablePortParams extends StylableComponentParams<PortStyle> {
  position: Position;
  node?: Node;
  type?: PortType;
}

export class Port extends Component<PortStyle> {
  public componentType = ComponentType.Port;
  public node?: Node;
  public type: PortType = 'input';

  constructor(params: StylablePortParams) {
    super(params);
    this.node = params.node;
    if (params.type) this.type = params.type;
    this.styleManager.setPortStyle(this, {});
  }

  public draw(ctx: CanvasRenderingContext2D, animationManager?: AnimationManager) {
    const styleState = this.styleManager.getPortStyle(this);
    if (!styleState) return;

    const base = this.styleManager.getTransitionableProps(styleState.currentState);
    const override = animationManager?.activeAnimations.get(this) || {};
    const style = { ...base, ...override };
    const { fill, borderColor, borderWidth, radius } = style;

    if (!this.node) return;
    const px = this.node.position.x + this.position.x;
    const py = this.node.position.y + this.position.y;

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);

    const isGradient = this.styleManager.isGradientDefinition(fill);

    if (isGradient) {
      const gradDef = fill;
      const grad = ctx.createLinearGradient(
        gradDef.x0 || 0,
        gradDef.y0 || 0,
        gradDef.x1 || 100,
        gradDef.y1 || 100
      );

      gradDef.colorStops.forEach((stop) => {
        // console.log('Offset: ', stop.offset, stop.color);
        grad.addColorStop(stop.offset, stop.color);
      });

      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = fill;
    }

    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
  }

  public drawTransition(
    ctx: CanvasRenderingContext2D,
    transitionStyle: ComputedStyle<Partial<PortStyle>>
  ) {
    const baseState = this.styleManager.getPortStyle(this);
    if (!baseState) return;

    const base = this.styleManager.getTransitionableProps(baseState.currentState);
    const merged = { ...base, ...transitionStyle };
    const { fill, borderColor, borderWidth, radius } = merged;

    if (!this.node) return;
    const px = this.node.position.x + this.position.x;
    const py = this.node.position.y + this.position.y;

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);

    const isGradient = this.styleManager.isGradientDefinition(fill);

    if (isGradient) {
      const gradDef = fill;
      const grad = ctx.createLinearGradient(
        gradDef.x0 || 0,
        gradDef.y0 || 0,
        gradDef.x1 || 100,
        gradDef.y1 || 100
      );

      gradDef.colorStops.forEach((stop) => {
        // console.log('Offset: ', stop.offset, stop.color);
        grad.addColorStop(stop.offset, stop.color);
      });

      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = fill;
    }

    ctx.fill();
    ctx.strokeStyle = merged.borderColor;
    ctx.lineWidth = merged.borderWidth;
    ctx.stroke();
  }

  public handleHover(isHovered: boolean): void {
    this.setIsHovered(isHovered);
    const style = this.styleManager.getPortStyle(this);
    if (style) {
      const computedCurrentPortStyle = this.styleManager.getTransitionableProps(style.currentState);
      const computedPreviousPortStyle = this.styleManager.getTransitionableProps(
        style.previousState
      );
      if (isHovered) {
        if (computedCurrentPortStyle.hover) {
          this.setStyle({
            ...computedCurrentPortStyle.hover,
          });
        }
      } else {
        this.setStyle({
          ...computedPreviousPortStyle,
        });
      }
    }
  }

  public setStyle(style: Partial<PortStyle>) {
    this.styleManager.setPortStyle(this, style);
  }

  public getBoundingBox(): BoundingBox {
    const portState = this.styleManager.getPortStyle(this);
    if (!portState) {
      const { radius } = this.styleManager.getTransitionableProps(
        this.styleManager.getDefaultStyles().port
      );
      return {
        x: this.position.x,
        y: this.position.y,
        width: radius,
        height: radius,
      };
    }

    const { radius } = this.styleManager.getTransitionableProps(portState.currentState);

    return {
      x: this.position.x,
      y: this.position.y,
      width: radius,
      height: radius,
    };
  }
}
