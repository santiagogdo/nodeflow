import type { DeepReadonly, GroupRecord, Rect } from "../core/index.ts";
import type { ControlLayout } from "../editor/geometry.ts";
import type {
  CanvasDrawContext,
  ConnectionBatch,
  ConnectionDrawContext,
  ConnectionRenderPart,
  ControlDrawState,
  EditorPainter,
  MenuView,
  NodeDrawContext,
  NodePresentation,
  NodeRenderPart,
  NodeStyle,
  PortDrawContext,
  PortRenderPart,
  Theme,
} from "../editor/types.ts";
import { drawGlassLens } from "./glass.ts";
import { drawIcon } from "./icons.ts";
import { drawConnection, drawPort } from "./linkDrawing.ts";

/** Stateful resources are private to a single editor. */
export class DefaultPainter implements EditorPainter {
  private widths = new Map<string, number>();
  constructor(private ctx: CanvasRenderingContext2D) {}
  destroy() {
    this.widths.clear();
  }
  private textWidth(text: string): number {
    // Bound retained text as well as the number of cache entries. Editing still
    // receives the exact measurement for long values.
    if (text.length > 1024) return this.ctx.measureText(text).width;
    const key = `${this.ctx.font}:${text}`;
    const cached = this.widths.get(key);
    if (cached !== undefined) return cached;
    const width = this.ctx.measureText(text).width;
    if (this.widths.size > 6000) this.widths.clear();
    this.widths.set(key, width);
    return width;
  }
  private text(text: string, x: number, y: number, maxWidth = Infinity) {
    if (this.textWidth(text) > maxWidth) {
      const prefix = (end: number) => {
        // Do not leave half of a surrogate pair before the ellipsis.
        if (
          end > 0 && end < text.length &&
          /[\uD800-\uDBFF]/.test(text[end - 1]) &&
          /[\uDC00-\uDFFF]/.test(text[end])
        ) end--;
        return `${text.slice(0, end)}…`;
      };
      let low = 0, high = Math.min(16, text.length);
      // Find a short search interval first, so narrow labels do not repeatedly
      // measure large prefixes. Both searches take logarithmically many probes.
      while (high < text.length && this.textWidth(prefix(high)) <= maxWidth) {
        low = high;
        high = Math.min(high * 2, text.length);
      }
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (this.textWidth(prefix(middle)) <= maxWidth) low = middle;
        else high = middle;
      }
      text = prefix(low);
    }
    this.ctx.fillText(text, x, y);
  }

  background(state: CanvasDrawContext) {
    const ctx = this.ctx, t = state.theme, v = state.viewport;
    ctx.fillStyle = t.canvas;
    ctx.fillRect(0, 0, state.width, state.height);
    let spacing = 24 * v.scale;
    while (spacing < 16) spacing *= 2;
    ctx.fillStyle = t.grid;
    for (
      let x = ((v.x % spacing) + spacing) % spacing;
      x < state.width;
      x += spacing
    ) {
      for (
        let y = ((v.y % spacing) + spacing) % spacing;
        y < state.height;
        y += spacing
      ) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  group(
    state: CanvasDrawContext,
    group: DeepReadonly<GroupRecord>,
    bounds: Rect,
    selected: boolean,
  ) {
    const ctx = this.ctx, t = state.theme, v = state.viewport;
    ctx.fillStyle = group.color ?? t.accent;
    ctx.strokeStyle = selected ? t.accent : t.border;
    ctx.lineWidth = 1 / v.scale;
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 10);
    this.alpha(0.03, () => ctx.fill());
    ctx.stroke();
    ctx.font = `500 13px ${t.font}`;
    ctx.fillStyle = t.muted;
    this.text(
      group.label,
      bounds.x + 16,
      bounds.y + 21,
      bounds.width - 32,
    );
  }
  connection(
    view: ConnectionDrawContext,
    parts: readonly ConnectionRenderPart[],
  ) {
    drawConnection(view, parts);
  }
  connectionBatch(state: CanvasDrawContext, batch: ConnectionBatch) {
    const ctx = this.ctx, v = state.viewport;
    if (!batch.width || !batch.opacity) return;
    ctx.save();
    ctx.strokeStyle = batch.color;
    ctx.lineWidth = batch.width;
    ctx.lineCap = "round";
    ctx.globalAlpha *= batch.opacity;
    ctx.setLineDash(batch.dash.map((n) => n / Math.max(0.65, v.scale)));
    ctx.beginPath();
    for (const edge of batch.curves) {
      ctx.moveTo(edge.source.x, edge.source.y);
      ctx.bezierCurveTo(
        edge.c1.x,
        edge.c1.y,
        edge.c2.x,
        edge.c2.y,
        edge.target.x,
        edge.target.y,
      );
    }
    ctx.stroke();
    ctx.restore();
  }
  overlay(
    state: CanvasDrawContext,
    overlay: { marquee: Rect | null; empty: boolean; menu: MenuView | null },
  ) {
    const ctx = this.ctx, t = state.theme, v = state.viewport;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(v.scale, v.scale);
    if (overlay.marquee) {
      const rect = overlay.marquee;
      ctx.fillStyle = t.accent;
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1 / v.scale;
      this.alpha(
        0.09,
        () => ctx.fillRect(rect.x, rect.y, rect.width, rect.height),
      );
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.restore();
    if (overlay.empty) {
      ctx.textAlign = "center";
      ctx.font = `600 20px ${t.font}`;
      ctx.fillStyle = t.text;
      ctx.fillText("Start with a node", state.width / 2, state.height / 2 - 12);
      ctx.font = `14px ${t.font}`;
      ctx.fillStyle = t.muted;
      ctx.fillText(
        "Open the node library or right-click the canvas.",
        state.width / 2,
        state.height / 2 + 20,
      );
      ctx.textAlign = "left";
    }
    if (overlay.menu) this.menu(overlay.menu, state);
  }
  node(view: NodeDrawContext, part: Exclude<NodeRenderPart, "ports">) {
    const { detail, geometry: g, presentation, node, theme } = view;
    const b = g.bounds;
    if (detail === "overview") {
      if (part === "surface") {
        this.ctx.fillStyle = view.selected ? theme.accent : theme.node;
        this.ctx.fillRect(b.x, b.y, b.width, b.height);
      }
    } else if (part === "surface") this.surface(view);
    else if (part === "header") this.header(view, presentation);
    else if (part === "body" && detail === "full") {
      for (const control of g.controls) this.control(view, control);
      presentation.draw?.(this.ctx, b, node, theme);
    } else if (part === "status" && detail === "full") this.status(view);
  }
  private shape(b: Rect, radius: number) {
    this.ctx.beginPath();
    this.ctx.roundRect(
      b.x,
      b.y,
      b.width,
      b.height,
      Math.min(radius, b.width / 2, b.height / 2),
    );
  }
  private alpha(opacity: number, draw: () => void) {
    this.ctx.save();
    this.ctx.globalAlpha *= opacity;
    draw();
    this.ctx.restore();
  }
  private surface(view: NodeDrawContext) {
    const ctx = this.ctx,
      b = view.geometry.bounds,
      s = view.style,
      t = view.theme;
    const { hover, selection, drag } = view.progress;
    if (
      view.detail === "full" &&
      (s.blur > 0 || s.refraction > 0)
    ) {
      drawGlassLens(
        ctx,
        view.getBackdrop(),
        b,
        s,
        view.pixelRatio * view.scale,
        {
          x: ctx.getTransform().e,
          y: ctx.getTransform().f,
        },
        hover + drag,
      );
    }
    this.shape(b, s.radius);
    ctx.save();
    if (view.detail === "full") {
      ctx.shadowColor = s.shadow;
      ctx.shadowBlur = (s.shadowBlur + drag * s.dragShadow) *
        view.scale * view.pixelRatio;
      ctx.shadowOffsetY = (s.shadowOffset + drag * s.shadowOffset) *
        view.scale * view.pixelRatio;
    }
    ctx.fillStyle = t.node;
    this.alpha(s.opacity, () => ctx.fill());
    ctx.restore();
    ctx.save();
    ctx.clip();
    if (view.detail === "full") {
      // Color opacity is applied separately so any Canvas CSS color works.
      const wash = ctx.createLinearGradient(
        b.x,
        b.y,
        b.x + b.width * 0.3,
        b.y + b.height,
      );
      wash.addColorStop(0, s.highlight);
      wash.addColorStop(1, "transparent");
      ctx.fillStyle = wash;
      this.alpha(
        s.highlightOpacity * 0.12,
        () => ctx.fillRect(b.x, b.y, b.width, b.height),
      );
      ctx.fillStyle = t.accent;
      this.alpha(
        s.tintOpacity,
        () => ctx.fillRect(b.x, b.y, b.width, b.height),
      );
      if (hover && view.pointer && s.lightOpacity) {
        const offset = view.offset;
        const x = Math.max(
          b.x,
          Math.min(b.x + b.width, view.pointer.x - offset.x),
        );
        const y = Math.max(
          b.y,
          Math.min(b.y + b.height, view.pointer.y - offset.y),
        );
        const light = ctx.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          Math.max(b.width, b.height) * 0.8,
        );
        light.addColorStop(0, s.highlight);
        light.addColorStop(1, "transparent");
        ctx.fillStyle = light;
        this.alpha(
          hover * s.lightOpacity,
          () => ctx.fillRect(b.x, b.y, b.width, b.height),
        );
      }
    }
    ctx.restore();
    this.shape(b, s.radius);
    ctx.lineWidth = s.borderWidth;
    ctx.strokeStyle = t.border;
    if (s.borderWidth > 0) ctx.stroke();
    if (s.highlightOpacity && s.borderWidth > 0 && view.detail === "full") {
      const pointer = view.pointer;
      const offset = view.offset;
      const tilt = pointer
        ? Math.max(
          -1,
          Math.min(1, ((pointer.x - offset.x - b.x) / b.width - 0.5) * 2),
        ) * hover
        : 0;
      const rim = ctx.createLinearGradient(
        b.x - b.width * tilt * 0.3,
        b.y,
        b.x + b.width * (0.75 + tilt * 0.3),
        b.y + b.height,
      );
      rim.addColorStop(0, s.highlight);
      rim.addColorStop(0.28, "transparent");
      rim.addColorStop(0.65, "transparent");
      rim.addColorStop(1, s.highlight);
      ctx.strokeStyle = rim;
      ctx.lineWidth = s.borderWidth;
      this.alpha(s.highlightOpacity, () => ctx.stroke());
      // A soft inner rim gives the edge thickness without painting an opaque bezel.
      if (s.refractionWidth > 0 && b.width > 4 && b.height > 4) {
        this.shape({
          x: b.x + 2,
          y: b.y + 2,
          width: b.width - 4,
          height: b.height - 4,
        }, Math.max(0, s.radius - 2));
        ctx.lineWidth = 2;
        this.alpha(s.highlightOpacity * 0.12, () => ctx.stroke());
      }
      if (hover && pointer && s.lightOpacity) {
        const light = ctx.createRadialGradient(
          pointer.x - offset.x,
          pointer.y - offset.y,
          0,
          pointer.x - offset.x,
          pointer.y - offset.y,
          Math.max(b.width, b.height) * 0.65,
        );
        light.addColorStop(0, s.highlight);
        light.addColorStop(1, "transparent");
        this.shape(b, s.radius);
        ctx.strokeStyle = light;
        ctx.lineWidth = s.borderWidth * 1.5;
        this.alpha(hover * Math.min(1, s.lightOpacity * 4), () => ctx.stroke());
      }
    }
    const failed = view.result?.status === "failed";
    if ((selection || failed) && s.selectionWidth > 0) {
      // Keep the white glass boundary; put the selection cue just inside it.
      const inset = s.refraction > 0 ? 3 : 0;
      this.shape({
        x: b.x + inset,
        y: b.y + inset,
        width: Math.max(0, b.width - inset * 2),
        height: Math.max(0, b.height - inset * 2),
      }, Math.max(0, s.radius - inset));
      ctx.strokeStyle = failed ? t.danger : t.accent;
      ctx.lineWidth = s.selectionWidth;
      this.alpha(failed ? 1 : selection, () => {
        ctx.shadowColor = failed ? t.danger : t.accent;
        ctx.shadowBlur = view.detail === "full"
          ? s.glow * view.scale * view.pixelRatio
          : 0;
        ctx.stroke();
      });
    }
  }
  private header(
    view: NodeDrawContext,
    presentation: NodePresentation,
  ) {
    const ctx = this.ctx,
      g = view.geometry,
      b = g.bounds,
      s = view.style,
      t = view.theme;
    if (view.detail === "compact") {
      ctx.fillStyle = t.text;
      ctx.font = `${s.titleWeight} ${s.titleSize + 5}px ${t.font}`;
      this.text(
        view.node.label,
        b.x + s.padding,
        b.y + g.header.height / 2,
        b.width - s.padding * 2,
      );
      return;
    }
    this.divider(b.x, g.header.y + g.header.height, b.width, s, t);
    const icon = {
      x: b.x + s.padding,
      y: g.header.y + (g.header.height - s.iconSize) / 2,
      width: s.iconSize,
      height: s.iconSize,
    };
    const color = presentation.color ?? t.accent;
    this.shape(icon, s.iconRadius);
    ctx.fillStyle = color;
    this.alpha(0.15, () => ctx.fill());
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    this.alpha(s.highlightOpacity, () => ctx.stroke());
    const inset = s.iconSize * 0.2;
    const glyph = {
      x: icon.x + inset,
      y: icon.y + inset,
      width: icon.width - inset * 2,
      height: icon.height - inset * 2,
    };
    ctx.save();
    if (presentation.drawIcon) presentation.drawIcon(ctx, glyph, t);
    else {drawIcon(
        ctx,
        presentation.icon ??
          (view.node.type === "@subgraph"
            ? "subgraph"
            : view.node.type.startsWith("@")
            ? "map"
            : "shape"),
        glyph.x,
        glyph.y,
        glyph.width,
        color,
      );}
    ctx.restore();
    ctx.fillStyle = t.text;
    ctx.font = `${s.titleWeight} ${s.titleSize}px ${t.font}`;
    const titleX = icon.x + icon.width + 10;
    this.text(
      view.node.label,
      titleX,
      g.header.y + g.header.height / 2,
      Math.max(0, b.x + b.width - 34 - titleX),
    );
    ctx.fillStyle = t.muted;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(
        b.x + b.width - 19 + i * 4,
        g.header.y + g.header.height / 2,
        1.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (presentation.summary) {
      ctx.fillStyle = t.muted;
      ctx.font = `${s.fontSize}px ${t.font}`;
      this.text(
        presentation.summary(view.node.data, view.result),
        b.x + s.padding,
        g.summaryY,
        b.width - s.padding * 2,
      );
    }
    if (view.node.type === "@subgraph") {
      ctx.fillStyle = t.muted;
      ctx.font = `${s.fontSize}px ${t.font}`;
      this.text(
        "Reusable graph",
        b.x + s.padding,
        g.header.y + g.header.height + 22,
        b.width - s.padding * 2,
      );
    }
  }
  private divider(
    x: number,
    y: number,
    width: number,
    s: Readonly<NodeStyle>,
    t: Theme,
  ) {
    const ctx = this.ctx;
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    this.alpha(s.dividerOpacity, () => ctx.stroke());
  }
  port(
    portView: PortDrawContext,
    parts: readonly PortRenderPart[],
    view: NodeDrawContext,
  ) {
    if (portView.detail === "overview") return;
    const ctx = this.ctx,
      b = view.geometry.bounds,
      t = portView.theme,
      s = portView.style,
      p = portView.point,
      port = portView.port,
      side = portView.side,
      hovered = portView.hovered,
      focused = portView.focused;
    const label = () => {
      ctx.font = `${s.labelSize}px ${t.font}`;
      ctx.fillStyle = s.labelColor ?? (hovered || focused ? t.text : t.muted);
      const text = port.definition.label ?? port.definition.id;
      if (side === "left") {
        this.text(
          text,
          p.x + s.radius + s.labelGap,
          p.y,
          Math.min(
            s.labelWidth,
            view.geometry.controls.length &&
              view.presentation.portLayout !== "row"
              ? Math.max(1, view.style.inputColumnWidth - 10)
              : b.width / 2 - view.style.padding * 2,
          ),
        );
      } else if (side === "right") {
        if (
          view.geometry.controls.length &&
          view.presentation.portLayout !== "row" &&
          view.node.type !== "@subgraph"
        ) {
          this.text(
            text,
            p.x + s.radius + s.labelGap,
            p.y + s.labelOffset,
            s.labelWidth,
          );
        } else {
          ctx.textAlign = "right";
          this.text(
            text,
            p.x - s.radius - s.labelGap,
            p.y,
            Math.min(s.labelWidth, b.width / 2 - view.style.padding * 2),
          );
        }
      } else {
        ctx.textAlign = "center";
        this.text(
          text,
          p.x,
          p.y +
            (side === "top" ? 1 : -1) *
              (s.radius + s.labelGap + s.labelSize / 2),
          s.labelWidth,
        );
      }
    };
    drawPort(portView, label, parts);
  }
  private status(
    view: NodeDrawContext,
  ) {
    if (!view.result || !view.style.footerHeight) return;
    const ctx = this.ctx,
      b = view.geometry.bounds,
      s = view.style,
      t = view.theme;
    const status = view.result.status, y = b.y + b.height - s.footerHeight / 2;
    const color = status === "failed"
      ? t.danger
      : status === "completed"
      ? t.success
      : status === "running"
      ? t.accent
      : t.muted;
    this.divider(b.x, b.y + b.height - s.footerHeight, b.width, s, t);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    const x = b.x + s.padding + 4;
    if (status === "running") {
      const motion = view.motion;
      const period = motion && motion.runningPeriod;
      const angle = period
        ? (view.now % period) / period * Math.PI * 2
        : -Math.PI / 2;
      if (period) view.requestFrame();
      this.alpha(0.25, () => {
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(x, y, 4.5, angle, angle + Math.PI * 1.3);
      ctx.stroke();
    } else if (status === "completed") {
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x - 0.5, y + 2.5);
      ctx.lineTo(x + 4, y - 3);
      ctx.stroke();
    } else if (status === "failed") {
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + 3.5, 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `${s.labelSize}px ${t.font}`;
    this.text(
      status[0].toUpperCase() + status.slice(1),
      x + 13,
      y,
      b.width - s.padding * 2 - 17,
    );
  }
  private control(
    view: NodeDrawContext,
    control: ControlLayout,
  ) {
    const ctx = this.ctx,
      t = view.theme,
      s = view.style,
      d = control.definition,
      b = control.bounds;
    const controlState = view.getControlState(d.id)!;
    const { value, editing, focused } = controlState;
    ctx.save();
    if (d.disabled) ctx.globalAlpha *= s.disabledOpacity;
    ctx.font = `${s.labelSize}px ${t.font}`;
    if (!["toggle", "button"].includes(d.kind)) {
      ctx.fillStyle = t.muted;
      this.text(
        d.label,
        control.row.x,
        control.row.y + s.labelHeight / 2 - 2,
        b.width,
      );
    }
    const customDraw = view.getControlPainter(d.id);
    if (customDraw) {
      customDraw(ctx, b, controlState.value, t, controlState);
    } else if (d.kind === "toggle") {
      ctx.fillStyle = t.text;
      this.text(d.label, b.x, b.y + b.height / 2, b.width - 56);
      const x = b.x + b.width - 44,
        y = b.y + b.height / 2 - 11;
      ctx.fillStyle = value ? t.accent : t.border;
      ctx.beginPath();
      ctx.roundRect(x, y, 44, 22, 11);
      ctx.fill();
      ctx.fillStyle = value ? t.text : t.muted;
      const on = view.transition(`toggle:${d.id}`, value ? 1 : 0);
      ctx.beginPath();
      ctx.arc(x + 11 + on * 22, y + 11, 8, 0, Math.PI * 2);
      ctx.fill();
      if (focused) {
        ctx.strokeStyle = t.accent;
        ctx.strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
      }
    } else if (d.kind === "slider") {
      const ratio = Math.max(
        0,
        Math.min(
          1,
          (Number(value) - (d.min ?? 0)) / ((d.max ?? 100) - (d.min ?? 0) || 1),
        ),
      );
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + 14);
      ctx.lineTo(b.x + b.width - 36, b.y + 14);
      ctx.stroke();
      ctx.strokeStyle = t.accent;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + 14);
      ctx.lineTo(b.x + (b.width - 36) * ratio, b.y + 14);
      ctx.stroke();
      ctx.fillStyle = t.accent;
      ctx.beginPath();
      ctx.arc(
        b.x + (b.width - 36) * ratio,
        b.y + 14,
        focused ? 7 : 6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = t.text;
      this.text(String(value ?? 0), b.x + b.width - 29, b.y + 14, 34);
    } else {
      ctx.fillStyle = d.kind === "button" ? t.surface : t.input;
      ctx.strokeStyle = editing?.error
        ? t.danger
        : focused
        ? t.accent
        : t.border;
      ctx.lineWidth = focused ? 1.8 : 1;
      ctx.beginPath();
      ctx.roundRect(
        b.x,
        b.y,
        b.width,
        b.height,
        Math.min(s.controlRadius, b.height / 2),
      );
      ctx.fill();
      ctx.stroke();
      if (!focused && s.highlightOpacity) {
        ctx.strokeStyle = s.highlight;
        this.alpha(s.highlightOpacity * 0.12, () => ctx.stroke());
      }
      ctx.fillStyle = t.text;
      ctx.font = `${s.fontSize}px ${t.font}`;
      if (d.kind === "button") {
        ctx.textAlign = "center";
        this.text(d.label, b.x + b.width / 2, b.y + b.height / 2, b.width - 16);
        ctx.textAlign = "left";
      } else if (editing) {
        this.editText(
          editing,
          b,
          controlState.caret,
          d.kind === "textarea",
          s,
          t,
        );
      } else {
        const text = d.kind === "select"
          ? (d.options?.find((option) => option.value === value)?.label ??
            String(value ?? ""))
          : String(value ?? "");
        ctx.fillStyle = text ? t.text : t.muted;
        if (d.kind === "textarea") {
          const height = s.lineHeight;
          text
            .split("\n")
            .slice(0, Math.floor((b.height - s.inputPaddingY * 2) / height))
            .forEach((line, i) =>
              this.text(
                line,
                b.x + s.inputPadding,
                b.y + s.inputPaddingY + height / 2 + i * height,
                b.width - s.inputPadding * 2,
              )
            );
        } else {
          this.text(
            text || d.placeholder || "",
            b.x + s.inputPadding,
            b.y + b.height / 2,
            b.width - s.inputPadding * 2 - (d.kind === "select" ? 14 : 0),
          );
        }
      }
      if (d.kind === "select") {
        ctx.strokeStyle = t.text;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(b.x + b.width - 22, b.y + b.height / 2 - 2);
        ctx.lineTo(b.x + b.width - 17, b.y + b.height / 2 + 3);
        ctx.lineTo(b.x + b.width - 12, b.y + b.height / 2 - 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  private editText(
    edit: NonNullable<ControlDrawState["editing"]>,
    bounds: Rect,
    caret: boolean,
    multiline: boolean,
    style: Readonly<NodeStyle>,
    theme: Theme,
  ) {
    const ctx = this.ctx,
      lines = edit.value.split("\n"),
      lineHeight = style.lineHeight;
    const caretLine = edit.value.slice(0, edit.end).split("\n").length - 1,
      firstLine = Math.max(
        0,
        caretLine - Math.floor((bounds.height - 8) / lineHeight) + 1,
      );
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x + 5, bounds.y + 3, bounds.width - 10, bounds.height - 6);
    ctx.clip();
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i],
        y = multiline
          ? bounds.y +
            style.inputPaddingY +
            i * lineHeight +
            lineHeight / 2 -
            (edit.scrollTop ?? firstLine * lineHeight)
          : bounds.y + bounds.height / 2;
      const caretColumn = Math.max(0, Math.min(line.length, edit.end - offset));
      const scroll = edit.scrollLeft ??
        (i === caretLine
          ? Math.max(
            0,
            this.textWidth(line.slice(0, caretColumn)) - bounds.width + 28,
          )
          : 0);
      const x = bounds.x + style.inputPadding - scroll,
        start = Math.max(0, Math.min(line.length, edit.start - offset)),
        end = Math.max(0, Math.min(line.length, edit.end - offset));
      if (end > start) {
        ctx.fillStyle = theme.accent;
        ctx.save();
        ctx.globalAlpha *= 0.33;
        ctx.fillRect(
          x + this.textWidth(line.slice(0, start)),
          y - lineHeight / 2,
          this.textWidth(line.slice(start, end)),
          lineHeight,
        );
        ctx.restore();
      }
      ctx.fillStyle = theme.text;
      ctx.fillText(line, x, y);
      if (i === caretLine && edit.start === edit.end && caret) {
        const caretX = x + this.textWidth(line.slice(0, caretColumn));
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(caretX, y - lineHeight / 2);
        ctx.lineTo(caretX, y + lineHeight / 2);
        ctx.stroke();
      }
      offset += line.length + 1;
    }
    ctx.restore();
  }
  private menu(menu: MenuView, state: CanvasDrawContext) {
    const ctx = this.ctx,
      height = menu.rowHeight,
      t = state.theme;
    ctx.fillStyle = t.surface;
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(
      menu.x,
      menu.y,
      menu.width,
      menu.visibleCount * height + 8,
      6,
    );
    ctx.fill();
    ctx.stroke();
    ctx.font = `${state.touch ? 16 : 13}px ${t.font}`;
    ctx.textBaseline = "middle";
    menu.items
      .slice(menu.offset, menu.offset + menu.visibleCount)
      .forEach((item, i) => {
        if (i + menu.offset === menu.active) {
          ctx.fillStyle = t.accent;
          this.alpha(0.13, () =>
            ctx.fillRect(
              menu.x + 4,
              menu.y + 4 + i * height,
              menu.width - 8,
              height,
            ));
        }
        ctx.fillStyle = item.disabled ? t.muted : t.text;
        this.text(
          item.label,
          menu.x + 13,
          menu.y + 4 + i * height + height / 2,
          menu.width - 26,
        );
      });
  }
}
