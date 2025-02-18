# Contributing to Nodeflow

Thank you for considering contributing to Nodeflow! Your help is greatly appreciated. Whether it's reporting a bug, suggesting a feature, or submitting a pull request, your contributions will make Nodeflow better for everyone.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [How can I contribute?](#how-can-i-contribute)
  - [Reporting bugs](#reporting-bugs)
  - [Suggesting enhancements](#suggesting-enhancements)
  - [Pull requests](#pull-requests)
- [Local development](#local-development)
- [Testing](#testing)
- [Additional notes](#additional-notes)

## Code of conduct

Please note that this project is released with a [Code of conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## How can I contribute?

### Reporting bugs

If you find a bug in Nodeflow, please follow these steps:

1. **Search existing issues:**

   - Check the [issues](https://github.com/yourusername/nodeflow/issues) to see if the bug has already been reported.

2. **Open a new issue:**
   - If the bug is new, open an issue and include:
     - A clear and descriptive title.
     - A description of the problem.
     - Steps to reproduce the issue.
     - Any relevant logs or error messages.
     - Your environment information (e.g., operating system, Node.js version).

### Suggesting enhancements

If you have an idea for a new feature or enhancement:

1. **Search existing issues:**

   - Ensure your suggestion hasn't already been proposed.

2. **Open a new issue:**
   - Provide a clear and descriptive title.
   - Explain the suggested enhancement in detail.
   - Outline the benefits of the enhancement.

### Pull Requests

Pull requests are welcome! Here's how you can contribute:

For new features or major changes, please start a new discussion on the [discussions](https://github.com/santiagogdo/nodeflow/discussions) page.

For bug fixes, quality of life improvements, and documentation updates:

1. **Fork the repository:**

   - Click the "Fork" button at the top right of the repository page.

2. **Clone your fork:**

   ```bash
   git clone https://github.com/yourusername/nodeflow.git
   ```

3. **Create a branch:**

   ```bash
   git checkout -b feature/YourFeatureName
   ```

4. **Make your changes:**

   - Write clear and concise commit messages.

5. **Test your changes:**

   - Make sure to add/update tests for your changes.
   - Ensure all tests pass.

6. **Commit and push:**

   - Commit your changes.
   - Push your changes to your fork.

7. **Open a pull request:**

   - Navigate to the original repository and click "New Pull Request."
   - Link related issues if any.
   - Use a descriptive title and provide a clear description of your changes. For example:

     - Use a prefix to indicate the type of change: `[FIX/FEATURE/IMPROVEMENT/DOC]`

     ```
     [FIX] Canvas element not being responsive

     Fixed a bug where the canvas element was not being resized correctly.
     ```

## Local development

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/nodeflow.git
   ```

2. **Navigate to the project directory:**

   ```bash
   cd nodeflow
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Run the development server:**

   Copy the content of one of the examples to the root of the project. You should have an `index.html`, `index.ts`, and `index.css` file. These files are git ignored on purpose, because they are for local development only.

   Run the development server:

   ```bash
   npm run dev
   ```

5. **Run tests:**

   ```bash
   npm test
   ```

   You can check coverage with:

   ```bash
   npm run coverage
   ```

   It will generate a `coverage` folder with the test results.

## Additional notes

- **Documentation:**

  - Comprehensive documentation is available [here](./docs). Contributions to docs are welcome!

- **NPM package:**

  - Ensure that changes are compatible with the npm package. Follow [npm guidelines](https://docs.npmjs.com/) for publishing updates.

- **Feedback:**
  - Feel free to reach out via [issues](https://github.com/yourusername/nodeflow/issues) for any questions or feedback.

Thank you for contributing to Nodeflow! 🙏
