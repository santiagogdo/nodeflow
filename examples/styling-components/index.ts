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
  },
});
