import { Editor } from '../editor';
import { Node } from '../components/node';
import { Port } from '../components/port';
import { getContextMenu, toggleContextMenu } from '../contextMenu/contextMenu';

export class EditorDomEvents {
  private editor: Editor;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;

  // For mouse state
  private isDraggingNode: boolean = false;
  private dragNode: Node | null = null;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;

  private isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private panOffsetStartX: number = 0;
  private panOffsetStartY: number = 0;

  constructor(editor: Editor, container: HTMLElement, canvas: HTMLCanvasElement) {
    this.editor = editor;
    this.container = container;
    this.canvas = canvas;

    this.handleResize();
    this.initDOMEvents();
  }

  /**
   * Set up the DOM event listeners.
   */
  private initDOMEvents(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // High-DPI handling
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize() {
    if (!this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const devicePixelRatio = this.editor.getDevicePixelRatio();
    const displayW = Math.floor(rect.width * devicePixelRatio);
    const displayH = Math.floor(rect.height * devicePixelRatio);
    if (this.canvas.width !== displayW || this.canvas.height !== displayH) {
      this.canvas.width = displayW;
      this.canvas.height = displayH;
    }
  }

  private onMouseDown(e: MouseEvent) {
    const { offsetX, offsetY, target } = e;
    this.canvas.style.cursor = 'grabbing';

    const containerRect = this.container.getBoundingClientRect();
    const posX = e.clientX - containerRect.left + window.scrollX;
    const posY = e.clientY - containerRect.top + window.scrollY;

    // Get the hovered component (either a Node or a Port)
    const hoveredComponent = this.editor.findComponentAt(offsetX, offsetY);

    // Context menu setup
    const menu = getContextMenu();
    const isMenuOpen = menu.classList.contains('scale-in-center');
    const isLeftClick = e.button === 0;
    const isMiddleClick = e.button === 1;
    const isRightClick = e.button === 2;
    const clickedOutsideMenu = Boolean(target) && menu && !menu.contains(target as HTMLElement);

    // If menu is open and we click outside it (and it’s not a right-click), close the menu.
    if (isMenuOpen && clickedOutsideMenu && !isRightClick) {
      toggleContextMenu({ position: { x: posX, y: posY } });
      return;
    }

    // Right-click: open the context menu.
    if (isRightClick) {
      if (hoveredComponent && hoveredComponent.isComponentType(Node)) {
        toggleContextMenu({ position: { x: posX, y: posY }, node: hoveredComponent });
      } else if (isMenuOpen && clickedOutsideMenu) {
        toggleContextMenu({ position: { x: posX, y: posY }, reopen: true });
      } else {
        toggleContextMenu({ position: { x: posX, y: posY } });
      }
      return;
    }

    // Left-click handling.
    if (isLeftClick) {
      // If a port was clicked, handle pending connection logic.
      if (hoveredComponent && hoveredComponent.isComponentType(Port)) {
        const pendingConnectionPort = this.editor.getPendingConnectionPort();
        if (pendingConnectionPort) {
          if (pendingConnectionPort !== hoveredComponent) {
            // Complete the connection.
            this.editor.connectPorts(pendingConnectionPort, hoveredComponent);
            this.editor.setPendingConnectionPort(null);
            this.editor.setMousePosition(null);
            this.editor.render();
            return;
          } else {
            // Same port clicked again; update pending connection.
            this.editor.setPendingConnectionPort(hoveredComponent);
            this.editor.setMousePosition(this.editor.toWorld(offsetX, offsetY));
          }
        } else {
          // Start a new pending connection.
          this.editor.setPendingConnectionPort(hoveredComponent);
          this.editor.setMousePosition(this.editor.toWorld(offsetX, offsetY));
        }
        return;
      }

      // If a node was clicked, start dragging it.
      if (hoveredComponent && hoveredComponent.isComponentType(Node)) {
        this.isDraggingNode = true;
        this.dragNode = hoveredComponent;
        const worldPos = this.editor.toWorld(offsetX, offsetY);
        this.dragOffsetX = worldPos.x - hoveredComponent.position.x;
        this.dragOffsetY = worldPos.y - hoveredComponent.position.y;
        return;
      }
    }

    // If no component was clicked (or if the middle mouse is used), start panning.
    if ((isLeftClick && !hoveredComponent) || isMiddleClick) {
      this.isPanning = true;
      this.panStartX = offsetX;
      this.panStartY = offsetY;
      this.panOffsetStartX = this.editor.getOffsetX();
      this.panOffsetStartY = this.editor.getOffsetY();
      return;
    }

    this.editor.render();
  }

  private onMouseMove(e: MouseEvent) {
    const { offsetX, offsetY } = e;

    // Get the currently hovered component using our unified function.
    const currentHovered = this.editor.findComponentAt(offsetX, offsetY);
    const hoveredComponent = this.editor.getHoveredComponent();
    if (currentHovered !== hoveredComponent) {
      if (hoveredComponent) {
        hoveredComponent.handleHover(false);
      }
      if (currentHovered) {
        currentHovered.handleHover(true);
      }
      this.editor.setHoveredComponent(currentHovered);
    }

    // Update pending connection line if a connection is in progress.
    const pendingConnectionPort = this.editor.getPendingConnectionPort();
    if (pendingConnectionPort) {
      this.editor.setMousePosition(this.editor.toWorld(offsetX, offsetY));
      this.editor.render();
      return;
    }

    // Panning logic.
    if (this.isPanning) {
      const dx = offsetX - this.panStartX;
      const dy = offsetY - this.panStartY;
      this.editor.setOffsetX(this.panOffsetStartX + dx);
      this.editor.setOffsetY(this.panOffsetStartY + dy);
      this.editor.render();
      return;
    }

    // Node dragging logic.
    if (this.isDraggingNode && this.dragNode) {
      const worldPos = this.editor.toWorld(offsetX, offsetY);
      this.dragNode.position.x = worldPos.x - this.dragOffsetX;
      this.dragNode.position.y = worldPos.y - this.dragOffsetY;
      this.editor.render();
    }
  }

  private onMouseUp(_e: MouseEvent) {
    this.canvas.style.cursor = 'grab';
    this.isDraggingNode = false;
    this.dragNode = null;
    this.isPanning = false;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 1.1;
    const { offsetX, offsetY, deltaY } = e;
    const beforeZoom = this.editor.toWorld(offsetX, offsetY);
    if (deltaY < 0) {
      // zoom in
      this.editor.setScale(this.editor.getScale() * zoomFactor);
    } else {
      // zoom out
      this.editor.setScale(this.editor.getScale() / zoomFactor);
    }
    // keep mouse in the same world position
    const afterZoom = this.editor.toWorld(offsetX, offsetY);
    const scale = this.editor.getScale();
    const currentOffsetX = this.editor.getOffsetX();
    const currentOffsetY = this.editor.getOffsetY();
    this.editor.setOffsetX(currentOffsetX + (afterZoom.x - beforeZoom.x) * scale);
    this.editor.setOffsetY(currentOffsetY + (afterZoom.y - beforeZoom.y) * scale);
  }
}
