# Code Quality Guidelines

This project adheres to strict code quality guidelines to ensure security and maintainability. We have automated checks in place to enforce these guidelines.

## Pre-commit Hooks

We use [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/okonet/lint-staged) to run automated checks before each commit.

### Security Checks

Our primary checks focus on preventing unsafe coding practices:

#### DOM Manipulation Safety

- `innerHTML` assignment
- `outerHTML` assignment

These methods can lead to Cross-Site Scripting (XSS) vulnerabilities and are generally considered unsafe.

#### CSS Organization

- Inline style assignments (element.style.property = value)
- Inline style attributes (style="...")
- Style objects in JavaScript

All styling should be kept in the `styles.css` file for consistency, maintainability, and performance.

## Safe Alternatives

### For DOM Manipulation

Instead of using `innerHTML` or `outerHTML`, please use these safer alternatives:

1. For text content:
   ```javascript
   element.textContent = "Hello, world!";
   ```

2. For creating elements:
   ```javascript
   const div = document.createElement('div');
   const text = document.createTextNode('Hello, world!');
   div.appendChild(text);
   ```

3. For SVG elements:
   ```javascript
   const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
   const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
   svg.appendChild(circle);
   ```

4. Use the provided helper methods:
   ```javascript
   // For creating SVG elements
   const element = createSvgElement("text", { x: "10", y: "20" });
   
   // For safely parsing HTML (when absolutely necessary)
   const safeContent = parseHtmlSafely(htmlString);
   ```

### For CSS Styling

Instead of inline styles, follow these practices:

1. Define styles in `styles.css`:
   ```css
   .my-custom-element {
     background-color: var(--background-primary);
     color: var(--text-normal);
     padding: 10px;
   }
   ```

2. Apply styles using classList:
   ```javascript
   element.classList.add('my-custom-element');
   ```

3. For dynamic styling, use CSS variables:
   ```css
   .dynamic-element {
     --element-color: blue;
     color: var(--element-color);
   }
   ```
   
   ```javascript
   // Change the CSS variable value
   element.style.setProperty('--element-color', 'red');
   ```

4. Use Obsidian's CSS variables for consistent theming:
   ```css
   .my-element {
     background-color: var(--background-primary);
     color: var(--text-normal);
   }
   ```

## Exempting Code from Checks

If you have a legitimate reason to use a normally prohibited pattern, you can exempt the line by adding a special comment:

```javascript
// SAFE: innerHTML used for rendering SVG from server-validated content
element.innerHTML = safeContent;

// SAFE: inline style used for dynamic positioning that can't be achieved with CSS
element.style.top = `${position}px`;
```

## Development Setup

To set up the development environment with these checks:

1. Install dependencies:
   ```bash
   npm install
   ```

2. The pre-commit hooks should be automatically set up. If not, run:
   ```bash
   npm run prepare
   ```

## Checking Code Manually

You can run the code quality checks manually on specific files:

```bash
node code-quality-check.mjs path/to/file.js
```

## Understanding the Checks

The code quality checks are defined in `code-quality-check.mjs`. This script scans JavaScript and TypeScript files for patterns that indicate unsafe DOM manipulation or inline styling and blocks commits that violate these guidelines. 