import './contextMenu.css';
import type { Node } from '../components/node';
import type { Position } from '../../utils/interfaces';

export interface ContextMenuContext {
  node?: Node;
  /** Position in graph coordinates. */
  position: Position;
}
export interface ContextMenuItem {
  label: string;
  onSelect: (context: ContextMenuContext) => void;
  disabled?: boolean;
}

/** Every editor owns its own menu, DOM, and actions. */
export class ContextMenu {
  public readonly element = document.createElement('div');

  constructor() {
    this.element.className = 'nodeflow-context-menu';
    this.element.setAttribute('role', 'menu');
    this.element.hidden = true;
  }

  public open(
    position: Position,
    context: ContextMenuContext,
    items: ContextMenuItem[],
  ): void {
    this.element.replaceChildren();
    if (!items.length) {
      this.close();
      return;
    }
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = item.label;
      button.disabled = item.disabled ?? false;
      button.addEventListener('click', () => {
        this.close();
        item.onSelect(context);
      });
      this.element.append(button);
    }
    this.element.style.left = `${position.x}px`;
    this.element.style.top = `${position.y}px`;
    this.element.hidden = false;
    const parent = this.element.parentElement;
    if (parent) {
      this.element.style.left = `${Math.max(0, Math.min(position.x, parent.clientWidth - this.element.offsetWidth))}px`;
      this.element.style.top = `${Math.max(0, Math.min(position.y, parent.clientHeight - this.element.offsetHeight))}px`;
    }
  }

  public close(): void {
    this.element.hidden = true;
    this.element.replaceChildren();
  }
  public destroy(): void {
    this.close();
    this.element.remove();
  }
}
