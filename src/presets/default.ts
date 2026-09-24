import type { EditorPreset } from "../editor/types.ts";
import { DefaultPainter } from "./painter.ts";
import {
  darkTheme,
  defaultConnectionMotion,
  defaultConnectionStyle,
  defaultNodeMotion,
  defaultPortMotion,
  defaultPortStyle,
  glassNodeStyle,
  touchNodeStyle,
} from "./styles.ts";

/** Glass nodes and clean ports/connections. Opt in explicitly at editor construction. */
export const defaultPreset: Readonly<EditorPreset> = Object.freeze({
  theme: darkTheme,
  nodes: Object.freeze({
    style: glassNodeStyle,
    touchStyle: touchNodeStyle,
    motion: defaultNodeMotion,
  }),
  ports: Object.freeze({
    style: defaultPortStyle,
    touchStyle: Object.freeze({ labelSize: 15 }),
    motion: defaultPortMotion,
  }),
  connections: Object.freeze({
    style: defaultConnectionStyle,
    motion: defaultConnectionMotion,
  }),
  menu: Object.freeze({ rowHeight: 34, touchRowHeight: 44 }),
  createPainter: (context: CanvasRenderingContext2D) =>
    new DefaultPainter(context),
});
