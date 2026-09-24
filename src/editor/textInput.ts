import type { Rect } from "../core/index.ts";
import type { TextEditState } from "./renderer.ts";

/** Native input owns composition/selection; the canvas owns every visible pixel. */
export class TextInputBridge {
  private input: HTMLInputElement | HTMLTextAreaElement | null = null;
  private cleanups: (() => void)[] = [];
  private composing = false;
  private finishing = false;
  private typography = {
    font: "",
    fontSize: 13,
    lineHeight: 18,
    scale: 1,
    multiline: false,
    padding: 10,
    paddingY: 7,
  };
  constructor(
    private host: HTMLElement,
    private update: (state: TextEditState | null) => void,
  ) {}
  open(
    state: TextEditState,
    bounds: Rect,
    options: {
      multiline: boolean;
      numeric: boolean;
      label: string;
      font: string;
      fontSize: number;
      lineHeight: number;
      scale: number;
      padding?: number;
      paddingY?: number;
      commit: (value: string) => string | undefined;
      cancel: () => void;
      done: () => void;
    },
  ) {
    this.close();
    this.finishing = false;
    const input = document.createElement(
      options.multiline ? "textarea" : "input",
    );
    this.input = input;
    input.value = state.value;
    input.setAttribute("aria-label", options.label);
    input.setAttribute("autocomplete", "off");
    input.spellcheck = false;
    if (options.numeric) input.inputMode = "decimal";
    this.typography = {
      ...options,
      padding: options.padding ?? 10,
      paddingY: options.paddingY ?? 7,
    };
    if (input instanceof HTMLTextAreaElement) input.wrap = "off";
    Object.assign(input.style, {
      position: "absolute",
      boxSizing: "border-box",
      opacity: "0",
      color: "transparent",
      background: "transparent",
      caretColor: "transparent",
      border: "0",
      outline: "0",
      margin: "0",
      resize: "none",
      pointerEvents: "auto",
      zIndex: "2",
      fontFamily: options.font,
      minHeight: "0",
    });
    this.host.append(input);
    this.reposition(bounds);
    const read = () => {
      const changed = state.value !== input.value;
      state.value = input.value;
      state.start = input.selectionStart ?? input.value.length;
      state.end = input.selectionEnd ?? state.start;
      state.scrollLeft = input.scrollLeft / this.typography.scale;
      state.scrollTop = input.scrollTop / this.typography.scale;
      if (changed) {
        delete state.error;
        input.removeAttribute("aria-invalid");
      }
      this.update({ ...state });
    };
    const finish = (cancel = false) => {
      if (this.finishing || this.composing) return;
      if (!cancel) {
        const error = options.commit(input.value);
        if (error) {
          state.error = error;
          input.setAttribute("aria-invalid", "true");
          this.update({ ...state });
          input.focus({ preventScroll: true });
          return;
        }
      }
      this.finishing = true;
      if (cancel) options.cancel();
      this.close();
      options.done();
    };
    const listen = (
      target: EventTarget,
      name: string,
      callback: EventListener,
    ) => {
      target.addEventListener(name, callback);
      this.cleanups.push(() => target.removeEventListener(name, callback));
    };
    listen(input, "input", read);
    listen(input, "select", read);
    listen(input, "scroll", read);
    listen(document, "selectionchange", () => {
      if (document.activeElement === input) read();
    });
    listen(input, "compositionstart", () => {
      this.composing = true;
    });
    listen(input, "compositionend", () => {
      this.composing = false;
      read();
      if (document.activeElement !== input) finish();
    });
    listen(input, "keydown", (event) => {
      const key = event as KeyboardEvent;
      key.stopPropagation();
      if (key.isComposing) return;
      if (key.key === "Escape") {
        key.preventDefault();
        finish(true);
      } else if (
        key.key === "Enter" &&
        (!options.multiline || key.metaKey || key.ctrlKey)
      ) {
        key.preventDefault();
        finish();
      } else if (key.key === "Tab") finish();
    });
    listen(input, "blur", () => finish());
    input.focus({ preventScroll: true });
    input.setSelectionRange(state.start, state.end);
    read();
  }
  reposition(bounds: Rect, scale = this.typography.scale) {
    this.typography.scale = scale;
    if (this.input) {
      Object.assign(this.input.style, {
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${Math.max(1, bounds.width)}px`,
        height: `${Math.max(1, bounds.height)}px`,
        fontSize: `${this.typography.fontSize * scale}px`,
        lineHeight: `${this.typography.lineHeight * scale}px`,
        padding: `${
          this.typography.multiline ? this.typography.paddingY * scale : 0
        }px ${this.typography.padding * scale}px`,
      });
    }
  }
  get active(): boolean {
    return this.input !== null;
  }
  blur() {
    this.input?.blur();
  }
  close() {
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.input?.remove();
    this.input = null;
    this.composing = false;
    this.update(null);
  }
}
