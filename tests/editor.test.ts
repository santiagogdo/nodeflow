import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Editor } from '../src/index';

describe('Editor', () => {
  let editor: Editor;
  let container: HTMLElement;

  beforeEach(() => {
    // Create a container element for the editor
    container = document.createElement('div');
    container.id = 'canvas-container';
    document.body.appendChild(container);

    editor = new Editor(container);
  });

  it('should create an editor instance', () => {
    expect(editor).toBeInstanceOf(Editor);
  });

  it('should add a node', () => {
    const node = editor.addNode({
      position: { x: 100, y: 100 },
      label: 'Test Node',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    expect(editor.getNodes()).toHaveLength(1);
    expect(node.label).toBe('Test Node');
  });

  it('should connect two nodes', () => {
    const nodeA = editor.addNode({
      position: { x: 100, y: 100 },
      label: 'Node A',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      position: { x: 300, y: 100 },
      label: 'Node B',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);

    expect(editor.getConnections()).toHaveLength(1);
    expect(editor.getConnections()[0].sourcePort).toBe(nodeA.ports[0]);
    expect(editor.getConnections()[0].targetPort).toBe(nodeB.ports[0]);
  });

  it('should clear all nodes and connections', () => {
    // Add some nodes and connections
    const nodeA = editor.addNode({
      label: 'Node A',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      label: 'Node B',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);

    // Verify initial state
    expect(editor.getNodes()).toHaveLength(2);
    expect(editor.getConnections()).toHaveLength(1);

    // Clear the editor
    editor.clear();

    // Verify cleared state
    expect(editor.getNodes()).toHaveLength(0);
    expect(editor.getConnections()).toHaveLength(0);
  });

  it('should remove a node and its connections', () => {
    const nodeA = editor.addNode({
      label: 'Node A',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      label: 'Node B',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);

    // Verify initial state
    expect(editor.getNodes()).toHaveLength(2);
    expect(editor.getConnections()).toHaveLength(1);

    // Remove node A
    editor.removeNode(nodeA.id);

    // Verify node A and its connection are removed
    expect(editor.getNodes()).toHaveLength(1);
    expect(editor.getConnections()).toHaveLength(0);
  });

  it('should apply default styles to nodes', () => {
    editor.styleManager.setDefaultStyles({
      node: {
        borderColor: '#8956FF',
        borderWidth: 2,
        borderRadius: 8,
      },
    });

    const node = editor.addNode({
      label: 'Styled Node',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    // Get computed style for the node
    const nodeStyle = editor.styleManager.getNodeStyle(node);
    expect(nodeStyle).toBeDefined();
    const computedStyle = editor.styleManager.getTransitionableProps(nodeStyle!.currentState);

    expect(computedStyle.borderColor).toBe('#8956FF');
    expect(computedStyle.borderWidth).toBe(2);
    expect(computedStyle.borderRadius).toBe(8);
  });

  it('should handle node position updates', () => {
    const node = editor.addNode({
      position: { x: 100, y: 100 },
      label: 'Test Node',
    });

    const newPosition = { x: 200, y: 200 };
    node.position = newPosition;

    expect(node.position).toEqual(newPosition);
  });

  it('should handle viewport transformations', () => {
    editor.setOffsetX(100);
    editor.setOffsetY(50);
    editor.setScale(2);

    const screenCoords = { x: 300, y: 200 };
    const worldCoords = editor.toWorld(screenCoords.x, screenCoords.y);

    expect(worldCoords).toEqual({
      x: 100, // (300 - 100) / 2
      y: 75, // (200 - 50) / 2
    });
  });

  it('should handle port connections and disconnections', () => {
    const nodeA = editor.addNode({
      label: 'Node A',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      label: 'Node B',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    // Connect ports
    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);
    expect(editor.getConnections()).toHaveLength(1);

    // Get the connection
    const connection = editor.getConnections()[0];
    expect(connection.sourcePort).toBe(nodeA.ports[0]);
    expect(connection.targetPort).toBe(nodeB.ports[0]);

    // Disconnect
    editor.disconnect(connection);
    expect(editor.getConnections()).toHaveLength(0);
  });

  it('should apply hover styles to nodes', () => {
    editor.styleManager.setDefaultStyles({
      node: {
        borderColor: '#000000',
        hover: {
          borderColor: '#FF0000',
        },
      },
    });

    const node = editor.addNode({
      label: 'Hover Node',
    });

    // Simulate hover
    node.handleHover(true);
    const hoverStyle = editor.styleManager.getNodeStyle(node);
    expect(hoverStyle).toBeDefined();
    const computedHoverStyle = editor.styleManager.getTransitionableProps(hoverStyle!.currentState);
    expect(computedHoverStyle.borderColor).toBe('#FF0000');

    // Simulate hover end
    node.handleHover(false);
    const normalStyle = editor.styleManager.getNodeStyle(node);
    expect(normalStyle).toBeDefined();
    const computedNormalStyle = editor.styleManager.getTransitionableProps(
      normalStyle!.currentState
    );
    expect(computedNormalStyle.borderColor).toBe('#000000');
  });

  it('should handle pending connection ports', () => {
    const node = editor.addNode({
      label: 'Test Node',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const port = node.ports[0];

    // Set pending connection
    editor.setPendingConnectionPort(port);
    expect(editor.getPendingConnectionPort()).toBe(port);

    // Clear pending connection
    editor.setPendingConnectionPort(null);
    expect(editor.getPendingConnectionPort()).toBeNull();
  });

  it('should handle component hover state', () => {
    const node = editor.addNode({
      label: 'Hover Test Node',
    });

    // Set hovered component
    editor.setHoveredComponent(node);
    expect(editor.getHoveredComponent()).toBe(node);

    // Clear hovered component
    editor.setHoveredComponent(null);
    expect(editor.getHoveredComponent()).toBeNull();
  });

  it('should handle port style updates', () => {
    editor.styleManager.setDefaultStyles({
      port: {
        fill: '#FF0000',
        borderColor: '#0000FF',
        borderWidth: 3,
        radius: 10,
        hover: {
          fill: '#00FF00',
        },
      },
    });

    const node = editor.addNode({
      label: 'Port Style Node',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    const port = node.ports[0];
    const portStyle = editor.styleManager.getPortStyle(port);
    expect(portStyle).toBeDefined();
    const computedStyle = editor.styleManager.getTransitionableProps(portStyle!.currentState);

    expect(computedStyle.fill).toBe('#FF0000');
    expect(computedStyle.borderColor).toBe('#0000FF');
    expect(computedStyle.borderWidth).toBe(3);
    expect(computedStyle.radius).toBe(10);

    // Test hover state
    port.handleHover(true);
    const hoverStyle = editor.styleManager.getPortStyle(port);
    const computedHoverStyle = editor.styleManager.getTransitionableProps(hoverStyle!.currentState);
    expect(computedHoverStyle.fill).toBe('#00FF00');
  });

  it('should handle connection style updates', () => {
    editor.styleManager.setDefaultStyles({
      connection: {
        color: '#FF0000',
        width: 4,
        dashArray: [5, 5],
        lineDashOffset: 0,
      },
    });

    const nodeA = editor.addNode({
      label: 'Node A',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      label: 'Node B',
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);
    const connection = editor.getConnections()[0];
    const connectionStyle = editor.styleManager.getConnectionStyle(connection);
    expect(connectionStyle).toBeDefined();
    const computedStyle = editor.styleManager.getTransitionableProps(connectionStyle!.currentState);

    expect(computedStyle.color).toBe('#FF0000');
    expect(computedStyle.width).toBe(4);
    expect(computedStyle.dashArray).toEqual([5, 5]);
    expect(computedStyle.lineDashOffset).toBe(0);
  });

  it('should prevent connecting ports of the same type', () => {
    const nodeA = editor.addNode({
      label: 'Node A',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      label: 'Node B',
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    expect(() => editor.connectPorts(nodeA.ports[0], nodeB.ports[0])).toThrow();
    expect(editor.getConnections()).toHaveLength(0);
  });

  it('should handle node data', () => {
    const customData = { key: 'value', number: 42 };
    const node = editor.addNode({
      label: 'Data Node',
      data: customData,
    });

    expect(node.data).toEqual(customData);
  });

  it('should handle multiple ports on a node', () => {
    const node = editor.addNode({
      label: 'Multi-Port Node',
      ports: [
        { type: 'input', position: { x: 0, y: 25 } },
        { type: 'input', position: { x: 0, y: 50 } },
        { type: 'output', position: { x: 120, y: 25 } },
        { type: 'output', position: { x: 120, y: 50 } },
      ],
    });

    expect(node.ports).toHaveLength(4);
    expect(node.ports.filter((p) => p.type === 'input')).toHaveLength(2);
    expect(node.ports.filter((p) => p.type === 'output')).toHaveLength(2);
  });

  it('should handle gradient fills for nodes', () => {
    editor.styleManager.setDefaultStyles({
      node: {
        fill: {
          type: 'linear',
          colorStops: [
            { offset: 0, color: '#FF0000' },
            { offset: 1, color: '#0000FF' },
          ],
          x0: 0,
          y0: 0,
          x1: 100,
          y1: 100,
        },
      },
    });

    const node = editor.addNode({ label: 'Gradient Node' });
    const nodeStyle = editor.styleManager.getNodeStyle(node);
    expect(nodeStyle).toBeDefined();
    const computedStyle = editor.styleManager.getTransitionableProps(nodeStyle!.currentState);

    expect(computedStyle.fill).toEqual({
      type: 'linear',
      colorStops: [
        { offset: 0, color: '#FF0000' },
        { offset: 1, color: '#0000FF' },
      ],
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 100,
    });
  });

  it('should handle custom event emission and subscription', () => {
    const eventCallback = vi.fn();
    const eventData = { type: 'custom', value: 42 };

    editor.customEvents.on('testEvent', eventCallback);
    editor.customEvents.emit('testEvent', eventData);

    expect(eventCallback).toHaveBeenCalledWith(eventData);

    // Test unsubscribe
    editor.customEvents.off('testEvent', eventCallback);
    editor.customEvents.emit('testEvent', eventData);

    expect(eventCallback).toHaveBeenCalledTimes(1);
  });

  it('should prevent self-connections on nodes', () => {
    const node = editor.addNode({
      label: 'Self Connect Node',
      ports: [
        { type: 'input', position: { x: 0, y: 25 } },
        { type: 'output', position: { x: 120, y: 25 } },
      ],
    });

    editor.connectPorts(node.ports[1], node.ports[0]);
    expect(editor.getConnections()).toHaveLength(0);
  });

  it('should handle node size updates', () => {
    editor.styleManager.setDefaultStyles({
      node: {
        width: 150,
        height: 75,
      },
    });

    const node = editor.addNode({ label: 'Size Test Node' });
    const nodeStyle = editor.styleManager.getNodeStyle(node);
    const computedStyle = editor.styleManager.getTransitionableProps(nodeStyle!.currentState);

    expect(computedStyle.width).toBe(150);
    expect(computedStyle.height).toBe(75);
  });

  it('should handle port position adjustments based on node size', () => {
    editor.styleManager.setDefaultStyles({
      node: {
        width: 200,
        height: 100,
      },
    });

    const node = editor.addNode({
      label: 'Port Position Test',
      ports: [
        { type: 'input', position: { x: 0, y: 150 } }, // Should be clamped to node height
        { type: 'output', position: { x: 0, y: -10 } }, // Should be clamped to 0
      ],
    });

    const inputPort = node.ports[0];
    const outputPort = node.ports[1];

    expect(inputPort.position.y).toBe(100); // Clamped to node height
    expect(outputPort.position.y).toBe(0); // Clamped to minimum
  });

  it('should handle connection hover states', () => {
    editor.styleManager.setDefaultStyles({
      connection: {
        color: '#000000',
        hover: {
          color: '#FF0000',
        },
      },
    });

    const nodeA = editor.addNode({
      ports: [{ type: 'output', position: { x: 0, y: 25 } }],
    });

    const nodeB = editor.addNode({
      ports: [{ type: 'input', position: { x: 0, y: 25 } }],
    });

    editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);
    const connection = editor.getConnections()[0];

    connection.handleHover(true);
    const hoverStyle = editor.styleManager.getConnectionStyle(connection);
    const computedHoverStyle = editor.styleManager.getTransitionableProps(hoverStyle!.currentState);
    expect(computedHoverStyle.color).toBe('#FF0000');

    connection.handleHover(false);
    const normalStyle = editor.styleManager.getConnectionStyle(connection);
    const computedNormalStyle = editor.styleManager.getTransitionableProps(
      normalStyle!.currentState
    );
    expect(computedNormalStyle.color).toBe('#000000');
  });

  it('should handle animation transitions', async () => {
    editor.styleManager.setDefaultStyles({
      node: {
        borderColor: {
          transition: true,
          value: '#000000',
        },
      },
    });

    const node = editor.addNode({ label: 'Animation Test' });

    editor.styleManager.setNodeStyle(node, {
      borderColor: '#FF0000',
    });

    // Wait for animation frame
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const style = editor.styleManager.getNodeStyle(node);
    const computedStyle = editor.styleManager.getTransitionableProps(style!.currentState);
    expect(computedStyle.borderColor).not.toBe('#000000');
  });

  it('should handle multiple event listeners', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const eventData = { type: 'test' };

    editor.customEvents.on('multipleListeners', callback1);
    editor.customEvents.on('multipleListeners', callback2);
    editor.customEvents.emit('multipleListeners', eventData);

    expect(callback1).toHaveBeenCalledWith(eventData);
    expect(callback2).toHaveBeenCalledWith(eventData);
  });

  it('should handle component finding at coordinates', () => {
    const node = editor.addNode({
      position: { x: 100, y: 100 },
      label: 'Find Test',
    });

    const foundComponent = editor.findComponentAt(110, 110);
    expect(foundComponent).toBe(node);

    const noComponent = editor.findComponentAt(0, 0);
    expect(noComponent).toBeNull();
  });
});
