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

### Event Listeners & Lifecycle Management (CRITICAL)

> **Obsidian Component Lifecycle First, AbortController Second**
> 
> Use Obsidian's native lifecycle APIs (`registerDomEvent`, `registerEvent`, `registerInterval`) for automatic cleanup. Only use `AbortController` for fetch requests, observers, and workers that Obsidian doesn't manage.

#### ✅ DOM Event Listeners (PRIMARY METHOD)

**ALWAYS use `this.registerDomEvent()`:**
```typescript
// ✅ CORRECT - In Plugin, View, Modal, or SettingsTab
this.registerDomEvent(element, 'click', (evt) => { ... });
this.registerDomEvent(svg, 'pointerover', (e) => { ... });
```

**NEVER use raw `addEventListener`:**
```typescript
// ❌ WRONG - Memory leak (not cleaned up)
element.addEventListener('click', (evt) => { ... });
```

**Why:** `registerDomEvent` is automatically cleaned up when the component (Plugin/View/Modal) unloads. Raw `addEventListener` requires manual cleanup and causes memory leaks.

#### ✅ Workspace Event Listeners

```typescript
// ✅ CORRECT - Workspace events
this.registerEvent(this.app.workspace.on('file-open', (file) => { ... }));
this.registerEvent(this.app.vault.on('delete', (file) => { ... }));
```

#### ✅ Timers & Intervals

```typescript
// ✅ CORRECT - Automatically cleaned up
this.registerInterval(window.setInterval(() => { ... }, 1000));

// ❌ WRONG - Memory leak
setInterval(() => { ... }, 1000);
```

#### ✅ Animation Frames

```typescript
// ✅ CORRECT - With cleanup registration
const rafId = requestAnimationFrame(() => { ... });
this.register(() => cancelAnimationFrame(rafId));

// ⚠️ ACCEPTABLE - If one-time and cancelled elsewhere, add comment:
// SAFE: One-time RAF in view render, cancelled when view unloads
requestAnimationFrame(() => { ... });
```

#### ✅ Observers (ResizeObserver, MutationObserver, IntersectionObserver)

```typescript
// ✅ CORRECT - With cleanup registration
const observer = new ResizeObserver(() => { ... });
observer.observe(element);
this.register(() => observer.disconnect());

// ❌ WRONG - Memory leak
const observer = new ResizeObserver(() => { ... });
observer.observe(element);
// Never disconnected!
```

#### ✅ Fetch Requests (ABORTCONTROLLER APPROPRIATE)

```typescript
// ✅ CORRECT - AbortController for fetch
class MyView extends ItemView {
    private ctrl = new AbortController();

    onOpen() {
        fetch(url, { signal: this.ctrl.signal })
            .then(r => r.json())
            .then(data => this.render(data))
            .catch(err => {
                if (err.name !== 'AbortError') console.error(err);
            });
    }

    onClose() {
        this.ctrl.abort(); // Cancel in-flight requests
    }
}
```

#### ✅ SVG Cleanup (Prevent Detached Nodes)

```typescript
// ✅ CORRECT - Remove old nodes before re-render
if (this.svgRoot) {
    this.svgRoot.remove();
    this.svgRoot = null;
}
this.svgRoot = container.createSvg('svg');
```

#### ✅ Per-Element State (Use WeakMap)

```typescript
// ✅ CORRECT - Weak references, auto-collected
const stateMap = new WeakMap<Element, State>();
stateMap.set(element, { ... });

// ❌ WRONG - Strong references prevent GC
const stateMap = new Map<Element, State>();
```

**Automated Checks:** Run `npm run standards` to detect:
- Raw `addEventListener` calls
- `fetch` without `{signal}`  
- Observers without cleanup
- Animation frames without cleanup
- Intervals without `registerInterval`

### Managing Custom Views (Critical Antipattern)

❌ **NEVER store persistent references to views:**
```typescript
// ❌ WRONG - Storing view as a property
export default class MyPlugin extends Plugin {
  private myView: RadialTimelineView; // DON'T DO THIS
  private activeView: ItemView; // DON'T DO THIS
}
```

✅ **ALWAYS use `getLeavesOfType()` to access views:**
```typescript
// ✅ CORRECT - Helper methods that query dynamically
export default class MyPlugin extends Plugin {
  // Do not store persistent references to views (per Obsidian guidelines)
  
  private getTimelineViews(): RadialTimelineView[] {
    return this.app.workspace
      .getLeavesOfType(TIMELINE_VIEW_TYPE)
      .map(leaf => leaf.view as unknown)
      .filter((v): v is RadialTimelineView => v instanceof RadialTimelineView);
  }
  
  private getFirstTimelineView(): RadialTimelineView | null {
    const list = this.getTimelineViews();
    return list.length > 0 ? list[0] : null;
  }
}
```

**Why:** Obsidian may call the view factory function multiple times. Storing references can lead to stale instances and memory leaks. ([Source](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+managing+references+to+custom+views))

### Resource Cleanup

> **TL;DR:** Use `register*` methods for automatic cleanup. Only add to `onunload()` what Obsidian doesn't know about.

✅ **Automatic cleanup (preferred):**
- Use `this.registerDomEvent()` for DOM listeners
- Use `this.registerEvent()` for workspace events
- Use `this.registerInterval()` for timers
- Use `this.register(() => cleanup())` for observers/RAF

✅ **Manual cleanup in `onunload()` (if needed):**
```typescript
onunload() {
    // Only for things Obsidian doesn't manage:
    this.abortController?.abort(); // fetch requests
    this.svgLibrary?.dispose();    // third-party libraries
    // DON'T call detachLeavesOfType() - Obsidian does this
}
```

❌ **Critical Antipatterns (DON'T):**
1. **NEVER call `detachLeavesOfType()` in `onunload()`** - Obsidian handles this automatically
2. **NEVER store persistent references to views** - Use `getLeavesOfType()` instead  
3. **NEVER use raw `addEventListener`** - Use `registerDomEvent()` instead
4. **NEVER leave observers running** - Call `disconnect()` via `this.register()`
5. **NEVER leave animation frames running** - Cancel via `this.register()`

**Why:** Detaching leaves in `onunload()` causes issues during plugin reload. Obsidian automatically handles leaf cleanup. ([Source](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60))

**Memory Leak Prevention Checklist:**
- [ ] All `addEventListener` → `registerDomEvent`
- [ ] All workspace events → `registerEvent`
- [ ] All timers → `registerInterval`
- [ ] All observers have `this.register(() => observer.disconnect())`
- [ ] All RAF have cleanup or `// SAFE:` comment
- [ ] Old DOM nodes removed before re-render
- [ ] Per-element state uses `WeakMap`
- [ ] Third-party libraries have `.dispose()` called

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

### Comprehensive Standards Check
Manual run:
```bash
npm run standards
```

Runs **both** compliance and code quality checks, including:
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
| `npm run standards` | **Run all compliance + quality checks** (recommended) |
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

