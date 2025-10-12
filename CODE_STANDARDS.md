# Code Standards & Best Practices

This document outlines the coding standards and best practices for the Radial Timeline plugin, based on Obsidian plugin development guidelines and TypeScript best practices.

## Table of Contents
- [Obsidian Plugin Guidelines](#obsidian-plugin-guidelines)
- [Manifest Requirements](#manifest-requirements)
- [TypeScript Best Practices](#typescript-best-practices)
- [Security](#security)
- [Automated Checks](#automated-checks)

---

## Obsidian Plugin Guidelines

### DOM Manipulation
❌ **NEVER use:**
- `element.innerHTML = ...` — XSS vulnerability
- `element.outerHTML = ...` — XSS vulnerability

✅ **ALWAYS use:**
- `element.textContent = ...` for text content
- `document.createElement()` and `appendChild()` for DOM manipulation
- `document.createElementNS()` for SVG elements with proper namespace
- Helper functions like `createSvgElement()`, `createSvgText()`, etc.

**Exception:** If you absolutely must use `innerHTML` (e.g., for trusted content), add:
```typescript
// SAFE: innerHTML used for [specific reason]
element.innerHTML = trustedContent;
```

### Styling
❌ **NEVER use:**
- Inline styles: `element.style.color = ...`
- Style attributes: `element.setAttribute('style', ...)`
- Runtime `<style>` tag injection

✅ **ALWAYS use:**
- CSS classes defined in `styles.css`
- `element.classList.add()`, `.remove()`, `.toggle()`
- CSS custom properties (CSS variables) for dynamic theming

**Why:** Obsidian manages CSS loading/unloading. Inline styles bypass this and can cause conflicts.

### CSS Naming Convention
✅ **ALL CSS classes MUST use proper prefixes:**

**Required prefixes:**
- `rt-` for Radial Timeline plugin classes
- `radial-timeline-` for main container classes

**Examples:**
```typescript
// ✅ CORRECT - Proper prefix
element.addClass('rt-beats-modal');
element.addClass('rt-gossamer-title');
element.addClass('rt-hidden');

// ❌ WRONG - No prefix
element.addClass('beats-modal');
element.addClass('gossamer-title');
element.addClass('hidden');
```

```css
/* ✅ CORRECT - Proper prefix */
.rt-beats-modal { ... }
.rt-gossamer-assembly-modal .rt-gossamer-title { ... }
.radial-timeline-container { ... }

/* ❌ WRONG - No prefix */
.beats-modal { ... }
.gossamer-title { ... }
```

**Why:** Prevents CSS conflicts with Obsidian core styles and other plugins. Ensures namespace isolation.

### Network Requests
❌ **NEVER use:**
- `fetch()`
- `XMLHttpRequest`

✅ **ALWAYS use:**
- `requestUrl()` from the Obsidian API
```typescript
import { requestUrl } from 'obsidian';

const response = await requestUrl({
  url: 'https://api.example.com/data',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### File System Access
❌ **NEVER use:**
- `vault.adapter.*` methods
- Node.js `fs` module imports in plugin code

✅ **ALWAYS use:**
- `app.vault.read()`, `.create()`, `.modify()`, `.delete()`
- `app.vault.getAbstractFileByPath()`
- `app.vault.getMarkdownFiles()`

**Exception:** Build scripts (`.mjs` files) may use Node.js APIs

### Markdown Rendering
✅ **CORRECT usage:**
```typescript
MarkdownRenderer.render(
  this.app,
  markdown,
  containerEl,
  '', // Empty source path when not rendering a file
  component
);
```

### Timer Functions
❌ **AVOID:**
```typescript
const timeout: NodeJS.Timeout = setTimeout(...); // Wrong type
setTimeout(...); // Bare call
```

✅ **PREFER:**
```typescript
const timeout: number = window.setTimeout(...);
window.clearTimeout(timeout);
```

### Code Execution
❌ **ABSOLUTELY FORBIDDEN:**
- `eval()`
- `new Function()`
- Any dynamic code execution

**Why:** Security risk. Obsidian will reject plugins that use these.

### Editor Extensions
✅ **When modifying editor extensions:**
```typescript
// Use updateOptions() to apply changes across all editors
this.registerEditorExtension(myExtension);
this.app.workspace.updateOptions();
```

**Why:** Ensures changes apply to all editors and prevents stale configurations.

### Event Listeners
✅ **Always register event listeners:**
```typescript
this.registerDomEvent(element, 'click', (evt) => { ... });
this.registerEvent(this.app.workspace.on('file-open', (file) => { ... }));
```

**Why:** Obsidian automatically cleans up registered listeners on plugin unload.

### Resource Cleanup
✅ **In `onunload()`:**
- Clear intervals/timeouts (if not using `window.setTimeout`)
- Remove any global state
- Clean up event listeners (if not using `registerEvent/registerDomEvent`)

❌ **DON'T (Critical Antipatterns):**
- **NEVER call `detachLeavesOfType()` in `onunload()`** - Obsidian handles this automatically
- Keep references to views or leaves after unload
- Leave timers running

**Why:** Detaching leaves in `onunload()` can cause issues. Obsidian automatically handles leaf cleanup when plugins are disabled or reloaded. ([Source](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60))

### Mobile Compatibility
✅ **Best practices:**
```typescript
// Check if running on mobile
if (Platform.isMobile) {
  // Mobile-specific behavior
}

// Use responsive CSS
@media (max-width: 768px) {
  .my-element { ... }
}
```

❌ **AVOID:**
- Desktop-only features without mobile fallbacks
- Fixed pixel widths that don't scale
- Hover-only interactions (use click/tap)

### Settings Management
✅ **Always persist settings:**
```typescript
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings() {
  await this.saveData(this.settings);
}
```

✅ **Add settings tab:**
```typescript
this.addSettingTab(new MySettingsTab(this.app, this));
```

---

## Manifest Requirements

### Required Fields
✅ **manifest.json must include:**
```json
{
  "id": "plugin-id",           // Lowercase kebab-case (a-z0-9-)
  "name": "Plugin Name",        // Human-readable name
  "version": "1.0.0",          // Semantic versioning
  "minAppVersion": "1.0.0",    // Minimum Obsidian version
  "description": "...",         // Brief description
  "author": "Your Name",        // Plugin author
  "authorUrl": "https://...",   // Optional: Your website
  "isDesktopOnly": false        // Optional: Set true if desktop-only
}
```

### Validation Rules
✅ **Automated checks verify:**
- `id` matches `package.json` name
- `id` is lowercase kebab-case
- `version` matches across manifest.json, package.json, versions.json
- `minAppVersion` is specified
- All required fields present

❌ **AVOID:**
- Changing plugin `id` after release
- Version mismatches between files
- Non-semantic version numbers

### Submission Guidelines
✅ **Before submitting to Obsidian:**
1. Run `npm run standards` to verify compliance
2. Test on both desktop and mobile (if supported)
3. Ensure `manifest.json`, `styles.css`, and `main.js` are in release folder
4. Create GitHub release with these three files
5. Update documentation and screenshots

---

## TypeScript Best Practices

### Variable Declarations
❌ **AVOID:**
```typescript
var count = 0; // Function-scoped, hoisting issues
```

✅ **PREFER:**
```typescript
const count = 0;      // Immutable, block-scoped
let index = 0;        // Mutable, block-scoped
```

**Why:** `const` and `let` prevent scope-related bugs and make intent clearer.

### Type Safety
❌ **AVOID:**
```typescript
function process(data: any) { ... } // Too permissive
```

✅ **PREFER:**
```typescript
function process(data: Scene | Plot) { ... } // Specific types
function process(data: unknown) { ... } // Then narrow with type guards
```

**Exception:** Logging functions may use `any` for flexibility:
```typescript
// SAFE: any type used for flexible logging
public log(message: string, data?: any): void { ... }
```

### Null/Undefined Handling
✅ **ALWAYS check:**
```typescript
if (file instanceof TFile) { ... }
if (metadata?.frontmatter) { ... }
const value = config?.setting ?? defaultValue;
```

### Interface Definitions
✅ **Define interfaces for:**
- Settings objects
- Data structures
- API responses
- Component props

```typescript
interface RadialTimelineSettings {
  sourcePath: string;
  publishStageColors: { ... };
  // ...
}
```

---

## Logging & Debugging

### Production Code
❌ **NEVER use in plugin code:**
- `console.log()`
- `console.debug()`

✅ **USE:**
- `console.error()` for errors only
- Plugin-level `log()` method with development flag check:

```typescript
// Centralized debug logger in main.ts
private shouldDebugLog(): boolean {
  const isDev = typeof process !== 'undefined'
    && typeof process.env !== 'undefined'
    && process.env.NODE_ENV === 'development';
  return isDev === true;
}

public log(...args: unknown[]): void {
  // No-op in production
  // Prevents log spam in user consoles
}
```

**Why:** Console logs clutter user debugging. Use controlled logging only.

### Build Scripts
✅ **Scripts (.mjs files) may use:**
- `console.log()` for user-facing messages
- `console.error()` for script errors
- `console.warn()` for warnings

---

## Security

### API Keys
❌ **NEVER commit:**
- API keys in code
- Secrets in comments
- Example keys (even fake ones that match patterns)

✅ **ALWAYS:**
- Store keys in plugin settings
- Load from `this.settings.apiKey`
- Use `.gitignore` for local config files
- Rotate any leaked keys immediately

**Patterns that trigger alerts:**
- `sk-...` (OpenAI)
- `sk-ant-...` (Anthropic)
- `AIza...` (Google)

### User Data
✅ **Best practices:**
- Sanitize user input before rendering
- Use `escapeXml()` for SVG text content
- Validate file paths with `normalizePath()`
- Check file types before operations

---

## Automated Checks

### Pre-commit Hooks (Husky + lint-staged)
Automatically runs on `git commit`:
```bash
node code-quality-check.mjs [staged files]
```

Checks for:
- innerHTML/outerHTML violations
- Inline CSS property assignments
- TypeScript `any` types
- CSS class names without `rt-` or `radial-timeline-` prefix

### Build-time Checks
Runs during `npm run build`:
```bash
node code-quality-check.mjs src/main.ts
```

### Comprehensive Compliance
Manual run:
```bash
npm run compliance
```

Checks **everything** including:
- All Obsidian API violations
- Security issues (API keys)
- Manifest consistency
- Version alignment
- Logging violations
- Timeout usage
- Release artifact presence

### Bypassing Checks (Use Sparingly)
If a check is a false positive:
```typescript
// SAFE: innerHTML used for trusted SVG content from DOMParser
element.innerHTML = sanitizedContent;
```

---

## Project-Specific Standards

### SVG Creation
✅ **Use helper functions:**
```typescript
const element = createSvgElement('circle', {
  cx: '0',
  cy: '0',
  r: '10'
}, ['my-class']);

const text = createSvgText(content, x, y, ['label-class']);
```

### Scene Data Processing
✅ **Filter Plot notes when appropriate:**
```typescript
const sceneNotesOnly = scenes.filter(scene => scene.itemType !== "Plot");
```

### Color Management
✅ **Use CSS variables:**
```css
/* In styles.css */
.my-element {
  background-color: var(--rt-subplot-colors-0);
}
```

✅ **Set via JavaScript:**
```typescript
document.documentElement.style.setProperty('--rt-custom-color', color);
```

### File Paths
✅ **Always normalize:**
```typescript
import { normalizePath } from 'obsidian';
const normalizedPath = normalizePath(userPath.trim());
```

---

## Quick Reference: npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run scripts` | **Display all available npm commands** |
| `npm run dev` | Development build with watch mode |
| `npm run build` | Production build + quality checks (shows all scripts first) |
| `npm run check-quality` | Run code quality checks only |
| `npm run compliance` | Comprehensive Obsidian compliance check |
| `npm run standards` | Run all compliance + quality checks |
| `npm run backup` | Build + commit + push |
| `npm run release` | Full release process |
| `npm run version` | Bump version and sync manifest files |

**💡 Tip:** Run `npm run scripts` anytime to see all available commands with descriptions!

---

## Enforcement

These standards are enforced through:

1. **Automated checks** (see `code-quality-check.mjs`)
2. **Pre-commit hooks** (via Husky)
3. **Build process** (blocks builds on violations)
4. **Code review** (manual verification)

When violations occur, the build will fail with specific guidance on how to fix them.

---

## Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API Reference](https://docs.obsidian.md/Reference/TypeScript+API)
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

---

**Last Updated:** 2025-10-08  
**Based on:** [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

