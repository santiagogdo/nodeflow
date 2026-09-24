import { createDemo } from '../shared/demo';

createDemo({
  node: {
    fill: '#1e1e2b',
    borderColor: {
      transition: true,
      value: 'red',
    },
    borderRadius: 8,
    borderWidth: 2,
    labelColor: '#FFFFFF',
    labelFont: '16px Inter, system-ui, sans-serif',
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
