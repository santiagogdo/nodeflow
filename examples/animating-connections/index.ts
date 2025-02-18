import { Editor } from '../../src/index';

window.addEventListener('DOMContentLoaded', () => {
  const canvasContainer = document.getElementById('canvas-container') as HTMLElement;
  if (!canvasContainer) {
    throw new Error('Canvas container not found');
  }
  const editor = new Editor(canvasContainer);

  const clearButton = document.getElementById('clear-button') as HTMLButtonElement;
  const addInputNodeButton = document.getElementById('add-input-node-button') as HTMLButtonElement;
  const addTenInputNodeButton = document.getElementById(
    'add-ten-input-node-button'
  ) as HTMLButtonElement;
  const addOutputNodeButton = document.getElementById(
    'add-output-node-button'
  ) as HTMLButtonElement;
  const addTenOutputNodeButton = document.getElementById(
    'add-ten-output-node-button'
  ) as HTMLButtonElement;
  const addInputOutputNodeButton = document.getElementById(
    'add-input-output-node-button'
  ) as HTMLButtonElement;
  const addTenInputOutputNodeButton = document.getElementById(
    'add-ten-input-output-node-button'
  ) as HTMLButtonElement;

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      editor.clear();
    });
  }

  editor.styleManager.setDefaultStyles({
    node: {
      fill: '#1e1e2b',
      borderColor: {
        transition: true,
        value: 'red',
      },
      borderRadius: 8,
      borderWidth: 2,
      labelColor: '#FFFFFF',
      labelFont: '16px Inter, serif',
      hover: {
        borderColor: '#FFFFFF',
      },
      animation: {
        borderRadius: {
          from: 0,
          to: 20,
          duration: 2000,
          easing: 'linear',
          loop: true,
          loopMode: 'ping-pong',
        },
        borderColor: {
          from: 'red',
          to: 'green',
          duration: 1000,
          easing: 'linear',
          loop: true,
          loopMode: 'ping-pong',
        },
      },
    },
    port: {
      fill: 'red',
      borderColor: '#0000ff',
      borderWidth: 2,
      radius: 8,
    },
    connection: {
      color: 'green',
      width: 5,
      dashArray: [40, 3],
      animation: {
        color: {
          from: 'aqua',
          to: 'blue',
          duration: 1000,
          easing: 'linear',
          loop: true,
          loopMode: 'ping-pong',
        },
        width: {
          from: 5,
          to: 15,
          duration: 500,
          easing: 'linear',
          loop: true,
          loopMode: 'ping-pong',
        },
        lineDashOffset: {
          from: 0,
          to: -43,
          duration: 1000,
          easing: 'linear',
          loop: true,
        },
      },
    },
  });

  if (addInputNodeButton) {
    addInputNodeButton.addEventListener('click', () => {
      editor.addNode({
        style: {
          width: 120,
          height: 50,
        },
        label: 'Node A',
        ports: [{ type: 'input', position: { x: 0, y: 25 } }],
      });
    });
  }
  if (addTenInputNodeButton) {
    addTenInputNodeButton.addEventListener('click', () => {
      for (let i = 0; i < 10; i++) {
        editor.addNode({
          style: {
            width: 120,
            height: 50,
          },
          label: 'Node A',
          ports: [{ type: 'input', position: { x: 0, y: 25 } }],
        });
      }
    });
  }
  if (addOutputNodeButton) {
    addOutputNodeButton.addEventListener('click', () => {
      editor.addNode({
        style: {
          width: 120,
          height: 50,
        },
        label: 'Node A',
        ports: [{ type: 'output', position: { x: 0, y: 25 } }],
      });
    });
  }
  if (addTenOutputNodeButton) {
    addTenOutputNodeButton.addEventListener('click', () => {
      for (let i = 0; i < 10; i++) {
        editor.addNode({
          style: {
            width: 120,
            height: 50,
          },
          label: 'Node A',
          ports: [{ type: 'output', position: { x: 0, y: 25 } }],
        });
      }
    });
  }

  if (addInputOutputNodeButton) {
    addInputOutputNodeButton.addEventListener('click', () => {
      editor.addNode({
        style: {
          width: 120,
          height: 50,
        },
        label: 'Node A',
        ports: [
          { type: 'output', position: { x: 0, y: 25 } },
          { type: 'input', position: { x: 0, y: 25 } },
        ],
      });
    });
  }

  if (addTenInputOutputNodeButton) {
    addTenInputOutputNodeButton.addEventListener('click', () => {
      for (let i = 0; i < 10; i += 2) {
        const nodeA = editor.addNode({
          style: {
            width: 120,
            height: 50,
          },
          label: 'Node A',
          ports: [
            { type: 'input', position: { x: 0, y: 25 } },
            { type: 'output', position: { x: 0, y: 25 } },
          ],
        });

        const nodeB = editor.addNode({
          style: {
            width: 120,
            height: 50,
          },
          label: 'Node A',
          ports: [
            { type: 'input', position: { x: 0, y: 25 } },
            { type: 'output', position: { x: 0, y: 25 } },
          ],
        });

        editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);
      }
    });
  }

  const nodeA = editor.addNode({
    position: {
      x: 100,
      y: 100,
    },
    style: {
      width: 120,
      height: 50,
    },
    label: 'Node A',
    ports: [{ type: 'output', position: { x: 0, y: 25 } }],
  });

  const nodeB = editor.addNode({
    position: {
      x: 300,
      y: 150,
    },
    style: {
      width: 120,
      height: 50,
    },
    label: 'Node B',
    ports: [{ type: 'input', position: { x: 0, y: 25 } }],
  });

  editor.connectPorts(nodeA.ports[0], nodeB.ports[0]);
});
