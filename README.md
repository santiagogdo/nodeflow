[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](code_of_conduct.md)

![nodeflow](https://github.com/user-attachments/assets/14e40f60-1bba-45bc-b774-9b37bc001a80)

# Nodeflow

Nodeflow is a powerful and flexible yet simple library for creating and managing graphical node-based editors. It is designed to make building node-based UIs easy and intuitive, providing a wide range of features and customization options.

The library is designed to be flexible and can be used for things like:

- Visual programming
- Interactive automation workflows
- Interactive data visualization

## Features

- **Node and Connection Management**: Easily create, manage, and connect nodes with customizable ports.

- **Animation Support**: Integrate animations with a robust animation system and various easing functions.

- **Style Management**: Customize component styles with a robust styling system.

- **High-DPI Support**: Automatically handles high-DPI displays for clear and crisp rendering.

- **Zoom and Panning**: Zoom and panning provided out-of-the-box.

- **Responsive support**: The editor is responsive out-of-the-box and will adjust accordingly whenever the size of the canvas container changes.

- **Context Menu**: Built-in customizable context menu.

- **Serialize/Deserialize editor state**: Serialize the current editor state to JSON, or define the initial state using JSON.

- **FPS Counter**: Built-in FPS counter. You can turn it on during development to monitor the performance of the editor.

## Installation

1. **Install Nodeflow:**

   ```bash
   npm install nodeflow
   ```

2. **Define a container for the editor:**

   ```html
   <div id="canvas-container"></div>
   ```

3. **Import and instantiate the editor:**

   Import the `Editor` class, instantiate it, and pass the container element to the constructor.

   ```typescript
   import { Editor } from 'nodeflow';

   window.addEventListener('DOMContentLoaded', () => {
     const container = document.getElementById('canvas-container');
     const editor = new Editor(container);
   });
   ```

## Running examples:

You can find examples for how to use the library in the `examples` folder.

To run the examples locally:

1. Clone the repository
2. Install dependencies: `npm install`
3. Run an example:

```bash
npm run example {example-folder-name}
```

For example:

```bash
npm run example animating-connections
```

## Documentation

Comprehensive documentation is available to help you get started and make the most out of Nodeflow. [Read the docs](./docs).

<!-- TODO: Create detailed documentation -->

## Contributing

Contributions are welcome! Please see our [contribution guidelines](CONTRIBUTING.md) for more information.

## How to get help

If you encounter an issue that is not already [reported](https://github.com/santiagogdo/nodeflow/issues), please open a new issue.

If you have any questions, feel free to ask in the [discussions](https://github.com/santiagogdo/nodeflow/discussions) page.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
