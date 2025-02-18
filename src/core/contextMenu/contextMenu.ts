import './contextMenu.css';
import contextMenu from './contextMenu.html?raw';
import { type Node } from '../components/node';

interface ToggleContextMenuParams {
  position: {
    x: number;
    y: number;
  };
  reopen?: boolean;
  node?: Node;
}

export function createContextMenu() {
  const menu = new DOMParser().parseFromString(contextMenu, 'text/html').body.firstElementChild;

  if (!menu) {
    throw new Error('Failed to create context menu');
  }

  return menu;
}

export function getContextMenu() {
  const menu = document.getElementById('canvas-context-menu');
  if (!menu) {
    throw new Error('Failed to get context menu');
  }
  return menu;
}

export function toggleContextMenu(params: ToggleContextMenuParams) {
  const menu = document.getElementById('canvas-context-menu');
  if (menu) {
    if (menu.classList.contains('scale-in-center')) {
      menu.classList.remove('scale-in-center');
      menu.classList.add('scale-out-center');
    } else {
      menu.style.left = `${params.position.x}px`;
      menu.style.top = `${params.position.y}px`;
      menu.classList.remove('scale-out-center');
      menu.classList.add('scale-in-center');
    }

    if (params.reopen) {
      requestAnimationFrame(() => {
        menu.style.left = `${params.position.x}px`;
        menu.style.top = `${params.position.y}px`;
        menu.classList.remove('scale-out-center');
        menu.classList.add('scale-in-center');
      });
    }
  }
}
