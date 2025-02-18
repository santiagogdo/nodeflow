import { ComponentType, BoundingBox } from './component';
import { ConnectionStyle, StyleManager, StyleStateParams } from '../styles/styles';
import { Port } from './port';
import { Entity } from '../components/component';
import { AnimationManager } from '../animation/animationManager';

export class Connection extends Entity {
  public componentType = ComponentType.Connection;
  public isHovered = false;
  public isActive = false;
  constructor(public sourcePort: Port, public targetPort: Port, styleManager: StyleManager) {
    super(styleManager);
    this.styleManager.setConnectionStyle(this, {});
  }

  public disconnect() {
    this.sourcePort = null as any;
    this.targetPort = null as any;
  }

  public setIsHovered(isHovered: boolean) {
    this.isHovered = isHovered;
  }

  public setIsActive(isActive: boolean) {
    this.isActive = isActive;
  }

  public setStyle(style: StyleStateParams<ConnectionStyle>): void {
    this.styleManager.setConnectionStyle(this, style);
  }

  /**
   * Handles hover state changes and applies hover styles
   */
  public handleHover(isHovered: boolean): void {
    this.setIsHovered(isHovered);
    const style = this.styleManager.getConnectionStyle(this);
    if (!style) return;

    const computedCurrentStyle = this.styleManager.getTransitionableProps(style.currentState);
    const computedPreviousStyle = this.styleManager.getTransitionableProps(style.previousState);

    if (isHovered && computedCurrentStyle.hover) {
      this.setStyle(computedCurrentStyle.hover);
    } else {
      this.setStyle(computedPreviousStyle);
    }
  }

  public draw(ctx: CanvasRenderingContext2D, animationManager?: AnimationManager) {
    const styleState = this.styleManager.getConnectionStyle(this);
    if (!styleState) return;

    const base = this.styleManager.getTransitionableProps(styleState.currentState);
    const override = animationManager?.activeAnimations.get(this) || {};
    const style = { ...base, ...override };
    const { color, width, dashArray, lineDashOffset, lineStyle = 'curved' } = style;

    const points = this.getConnectionPoints();

    ctx.lineWidth = width;
    ctx.setLineDash(dashArray);
    ctx.lineDashOffset = lineDashOffset;

    if (this.styleManager.isGradientDefinition(color)) {
      ctx.strokeStyle = this.createGradient(ctx, color, points);
    } else {
      ctx.strokeStyle = color;
    }

    ctx.beginPath();
    this.drawPath(ctx, points, lineStyle);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  private getConnectionPoints() {
    return {
      source: {
        x: this.sourcePort.node!.position.x + this.sourcePort.position.x,
        y: this.sourcePort.node!.position.y + this.sourcePort.position.y,
      },
      target: {
        x: this.targetPort.node!.position.x + this.targetPort.position.x,
        y: this.targetPort.node!.position.y + this.targetPort.position.y,
      },
    };
  }

  private createGradient(
    ctx: CanvasRenderingContext2D,
    gradDef: any,
    points: { source: { x: number; y: number }; target: { x: number; y: number } }
  ) {
    const { source, target } = points;

    if (gradDef.type === 'linear') {
      const grad = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
      gradDef.colorStops.forEach((stop: any) => grad.addColorStop(stop.offset, stop.color));
      return grad;
    }

    if (gradDef.type === 'radial') {
      const grad = ctx.createRadialGradient(
        source.x,
        source.y,
        gradDef.r0 ?? 0,
        target.x,
        target.y,
        gradDef.r1 ?? 1
      );
      gradDef.colorStops.forEach((stop: any) => grad.addColorStop(stop.offset, stop.color));
      return grad;
    }

    return gradDef;
  }

  private drawPath(
    ctx: CanvasRenderingContext2D,
    points: { source: { x: number; y: number }; target: { x: number; y: number } },
    lineStyle: 'straight' | 'curved'
  ) {
    const { source, target } = points;
    ctx.moveTo(source.x, source.y);

    if (lineStyle === 'straight') {
      ctx.lineTo(target.x, target.y);
    } else {
      const cpOffset = Math.min(50, Math.abs(target.y - source.y) / 2);
      ctx.bezierCurveTo(
        source.x,
        source.y + cpOffset,
        target.x,
        target.y - cpOffset,
        target.x,
        target.y
      );
    }
  }

  public getBoundingBox(): BoundingBox {
    const sx = this.sourcePort.node!.position.x + this.sourcePort.position.x;
    const sy = this.sourcePort.node!.position.y + this.sourcePort.position.y;
    const tx = this.targetPort.node!.position.x + this.targetPort.position.x;
    const ty = this.targetPort.node!.position.y + this.targetPort.position.y;
    const minX = Math.min(sx, tx);
    const maxX = Math.max(sx, tx);
    const minY = Math.min(sy, ty);
    const maxY = Math.max(sy, ty);
    const padding = 10;
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
  }
}
