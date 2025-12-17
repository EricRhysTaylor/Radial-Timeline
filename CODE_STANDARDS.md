# Code Standards & Best Practices

This document outlines the coding standards and best practices for the Radial Timeline plugin, based on Obsidian plugin development guidelines and TypeScript best practices.

## Table of Contents
- [Obsidian Plugin Guidelines](#obsidian-plugin-guidelines)
- [Manifest Requirements](#manifest-requirements)
- [TypeScript Best Practices](#typescript-best-practices)
- [Security](#security)
- [Automated Checks](#automated-checks)

## Related Documentation

### Official Obsidian Resources
- **[Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)** - Official plugin development standards
- **[Obsidian API Reference](https://docs.obsidian.md/Reference/TypeScript+API)** - Complete TypeScript API documentation
- **[Component API](https://docs.obsidian.md/Reference/TypeScript+API/Component)** - Details on `registerDomEvent`, `registerEvent`, etc.
- **[Modal API](https://docs.obsidian.md/Reference/TypeScript+API/Modal)** - Modal class documentation

### Special Comment Markers
When code intentionally violates a standard for valid reasons, use comment markers:
- `// SAFE: innerHTML used for [reason]` - Bypass innerHTML check
- `// SAFE: inline style used for [reason]` - Bypass inline style check  
- `// SAFE: any type used for [reason]` - Bypass TypeScript any check
- `// SAFE: Modal sizing via inline styles` - Modal width/height (Obsidian pattern)

These comments tell automated checkers to skip the line and document why the code is correct.

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

**Exception - Modal Sizing ONLY:**
Modal width/height may be set via inline styles on `modalEl` as this is Obsidian's recommended approach:
```typescript
// SAFE: Modal sizing via inline styles (Obsidian pattern)
if (modalEl) {
  modalEl.style.width = '900px';
  modalEl.style.maxWidth = '90vw';
}
```

**Why:** Obsidian manages CSS loading/unloading. Inline styles bypass this and can cause conflicts. Modal sizing is an exception because Obsidian's modal system requires direct styling of the `modalEl` element.

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

### Opening Files
❌ **AVOID:**
```typescript
// ❌ WRONG - Creates duplicate tabs
workspace.getLeaf(false).openFile(file);
workspace.getLeaf('tab').openFile(file);
```

✅ **ALWAYS use:**
```typescript
// ✅ CORRECT - Prevents duplicate tabs (Obsidian's recommended API)
await workspace.openLinkText(file.path, '', false); // Reuse active leaf (prevents duplicates)
await workspace.openLinkText(file.path, '', true); // Open in new leaf
```

**Why:** `workspace.openLinkText()` automatically checks if the file is already open and reveals the existing tab instead of creating duplicates. This is Obsidian's recommended approach.

**Helper utility available:**
```typescript
import { openOrRevealFile } from './utils/fileUtils';

// Opens file or reveals if already open
await openOrRevealFile(this.app, file);
```

**Exception:** If you need custom leaf behavior, add a comment:
```typescript
// SAFE: openFile used for split pane with custom view state
await workspace.getLeaf('split').openFile(file, { state: customState });
```

### Modal Implementation

✅ **Correct Modal Creation:**
```typescript
import { App, Modal } from "obsidian";

export class MyModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    
    // Set modal width using Obsidian's recommended approach
    // SAFE: Modal sizing via inline styles (Obsidian pattern)
    if (modalEl) {
      modalEl.style.width = '800px';
      modalEl.style.maxWidth = '90vw';
    }
    
    // Apply CSS class for content styling
    contentEl.addClass('rt-my-modal');
    
    // Build your modal content
    contentEl.createEl('h2', { text: 'Modal Title' });
    // ...
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

**Modal Element Hierarchy:**
```
containerEl (backdrop/overlay - DO NOT style)
└── modalEl (modal box - SET WIDTH HERE)
    └── contentEl (content area - ADD CSS CLASSES HERE)
```

**Key Points:**
- **`modalEl`**: Apply width/height via inline styles (`modalEl.style.width`)
- **`contentEl`**: Apply CSS classes for content styling (`contentEl.addClass()`)
- **`containerEl`**: Never apply styles - Obsidian manages backdrop/positioning
- **Width setting**: Use `modalEl.style.width` and `modalEl.style.maxWidth` for responsiveness
- **Content sizing**: Use `width: auto` for modals that should size to content

**Common Patterns:**
```typescript
// Fixed width modal
modalEl.style.width = '900px';
modalEl.style.maxWidth = '90vw';

// Auto-sizing modal (fits content)
modalEl.style.width = 'auto';

// Tall modal
modalEl.style.maxHeight = '80vh';
```

**Why:** Obsidian's modal system requires direct styling of `modalEl` for width/height. Using CSS classes on `modalEl` or `containerEl` can break centering and backdrop behavior.

#### Modal Layout Standards

Every modal (AI Pulse Analysis, Manage Subplots, Gossamer score, release notes, etc.) must follow the same skeleton so we stop reworking gradients, padding, and redundant copy.

1. **Shell + Base Class**
   - Always add `rt-pulse-modal-shell` to `modalEl` unless the modal intentionally mirrors core Obsidian styling. Layer in specialized shells (e.g., `rt-subplot-modal-shell`) when a layout requires unique height constraints.
   - Choose exactly one base class for `contentEl`:  
     `rt-pulse-modal` (glass gradient surface), `rt-gossamer-score-modal` (neutral flex stack), or `rt-subplot-modal` (tall manager view). Only use custom wrappers when a modal truly needs its own CSS file.
   - Place major sections directly inside `.rt-pulse-progress-hero` or `.rt-pulse-glass-card`. Do **not** nest multiple gradient wrappers or one-off `<div>` spacers to fake padding.

2. **Sizing & Responsiveness**
   - Inline size the shell with the standard comment:  
     `// SAFE: Modal sizing via inline styles (Obsidian pattern)`  
     `modalEl.style.width = '720px'; modalEl.style.maxWidth = '92vw'; modalEl.style.maxHeight = '90vh';`
   - Tall modals rely on the `.modal-content` flex stack plus `flex:1 1 auto`/`min-height:0` on the scrolling cards so headers remain visible and scrolling happens inside content (see `.rt-subplot-management-card` + `.rt-subplot-management-scroll`).

3. **Structure & Padding**
   - Heroes follow the proven stack from `SceneAnalysisProcessingModal.ts`: badge → `<h2>` → one `rt-pulse-progress-subtitle` sentence → `rt-pulse-progress-meta` chips.
   - Keep descriptive text in a single `rt-pulse-info` block right after the hero; additional cards should only introduce *new* details.
   - Let CSS `gap` values define spacing. If you feel the need for `<br>` elements or manual padding tweaks, update the shared class instead.

4. **Content Discipline**
   - Before you finish, read the hero subtitle, info block, and card headings to ensure the same phrase isn’t repeated in multiple places. Each section must communicate something new (e.g., don’t restate “This action cannot be undone” both in the subtitle and card body).
   - Prefer reusable classes for repeated patterns (`.rt-pulse-mode-option`, `.rt-pulse-ruler-*`, `.rt-pulse-actions`) so typography and padding stay identical across modals.

5. **Scroll Behavior**
   - Never apply fixed pixel heights to scroll areas. Use flex containers with `overflow-y:auto` on the immediate child that needs scrolling (error lists, subplot rows, AI queue).
   - Horizontal trackers belong inside `.rt-pulse-ruler-scroll` so shared JS helpers (e.g., `updateQueueHighlight()`) can auto-scroll accurately.

6. **Verification**
   - After editing any modal, run `npm run standards`; if TypeScript changed, also run `npm run build`. These scripts enforce the `SAFE:` sizing comment, class prefixes, and duplicate-selector checks, so layout violations are caught automatically.
   - During code review, confirm the modal uses the shared classes above and that copy is concise with no redundant sentences.

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
> Use Obsidian's native lifecycle APIs (`registerDomEvent`, `registerEvent`, `registerInterval`) for automatic cleanup in Plugin and View classes. **Note: Modal classes don't have these methods** - use manual cleanup in `onClose()` instead. Only use `AbortController` for fetch requests, observers, and workers that Obsidian doesn't manage.

#### ✅ DOM Event Listeners

**In Plugin and View classes, use `this.registerDomEvent()`:**
```typescript
// ✅ CORRECT - In Plugin or View (ItemView, FileView, etc.) classes
this.registerDomEvent(element, 'click', (evt) => { ... });
this.registerDomEvent(svg, 'pointerover', (e) => { ... });
```

**In Modal classes, use `addEventListener`:**
```typescript
// ✅ CORRECT - Modal classes don't have registerDomEvent
element.addEventListener('click', (evt) => { ... });
// Cleanup happens automatically via contentEl.empty() in onClose()
```

**In Settings tabs, use `this.plugin.registerDomEvent()`:**
```typescript
// ✅ CORRECT - Access via plugin instance
this.plugin.registerDomEvent(element, 'click', (evt) => { ... });
```

**Why:** 
- `registerDomEvent` is only available in Plugin and View classes, not Modal classes
- Plugin/View: Automatic cleanup when component unloads
- Modal: Event listeners are removed when `contentEl.empty()` is called in `onClose()`
- See [Component API docs](https://docs.obsidian.md/Reference/TypeScript+API/Component) and [Modal API docs](https://docs.obsidian.md/Reference/TypeScript+API/Modal) for details

#### ✅ Workspace Event Listeners

```typescript
// ✅ CORRECT - Workspace events
this.registerEvent(this.app.workspace.on('file-open', (file) => { ... }));
this.registerEvent(this.app.vault.on('delete', (file) => { ... }));
```

#### ✅ Timers & Intervals

**In Plugin and View classes (Component-based):**
```typescript
// ✅ CORRECT - Automatically cleaned up (Plugin/View classes)
this.registerInterval(window.setInterval(() => { ... }, 1000));

// ❌ WRONG - Memory leak
setInterval(() => { ... }, 1000);
```

**In Modal classes (Modal doesn't have registerInterval):**
```typescript
// ✅ CORRECT - Manual cleanup in onClose()
class MyModal extends Modal {
  private intervalId?: number;
  
  startTimer() {
    // SAFE: Modal doesn't have registerInterval; manually cleaned up in onClose()
    this.intervalId = window.setInterval(() => { ... }, 1000);
  }
  
  onClose() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

// ❌ WRONG - Memory leak (no cleanup)
class MyModal extends Modal {
  onOpen() {
    setInterval(() => { ... }, 1000); // Never cleared!
  }
}
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

> **TL;DR:** Use `register*` methods for automatic cleanup in Plugin/View classes. Modals need manual cleanup in `onClose()`. Only add to `onunload()` what Obsidian doesn't know about.

✅ **Automatic cleanup (preferred for Plugin/View classes):**
- Use `this.registerDomEvent()` for DOM listeners
- Use `this.registerEvent()` for workspace events
- Use `this.registerInterval()` for timers
- Use `this.register(() => cleanup())` for observers/RAF

✅ **Manual cleanup (for Modal classes):**
```typescript
class MyModal extends Modal {
  private intervalId?: number;
  
  onClose() {
    // Clear intervals
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
```

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
- [ ] All `addEventListener` → `registerDomEvent` (Plugin/View classes)
- [ ] All workspace events → `registerEvent` (Plugin/View classes)
- [ ] All timers → `registerInterval` (Plugin/View) or manual cleanup in `onClose()` (Modal)
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

✅ **Organize with SettingGroup (Obsidian 1.11.0+):**
If targeting Obsidian v1.11.0+, use `SettingGroup` for better visual organization over manual headers.
```typescript
// Prefer this over containerEl.createEl('h2', ...) if minAppVersion >= 1.11.0
new SettingGroup(containerEl)
  .setName("Group Name")
  .addSetting((setting) => { ... });
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
- Store keys in plugin settings (or Keychain API if available)
- Load from `this.settings.apiKey`
- Use `.gitignore` for local config files
- Rotate any leaked keys immediately

**New in Obsidian 1.11.0+:**
Prefer using the **Keychain API** for storing sensitive data like API keys instead of `data.json`.
```typescript
// Conceptual example (check official docs for exact API)
await this.app.keychain.saveToken("api-key", token);
```

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
- Direct `getLeaf().openFile()` calls (should use `workspace.openLinkText()`)

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

| Command | Purpose | What it Runs |
|---------|---------|--------------|
| `npm run scripts` | **Display all available npm commands** | show-scripts.mjs |
| `npm run dev` | Development build with watch mode | esbuild (watch mode) |
| `npm run build` | Production build + quality checks | code-quality-check + check-css-duplicates + esbuild |
| `npm run check-quality` | Run code quality checks only | code-quality-check.mjs |
| `npm run standards` | **Run all compliance + quality checks** (recommended before releases) | compliance-check + code-quality-check + check-css-duplicates |
| `npm run backup` | Build + commit + push | check-css-duplicates + build + backup.mjs |
| `npm run release` | Full release process | release-script.mjs |
| `npm run version` | Bump version and sync manifest files | version-bump.mjs |

### Checker Scripts Breakdown

| Script | When to Run | Performance | Checks |
|--------|-------------|-------------|--------|
| **code-quality-check.mjs** | Pre-commit (automatic) | Fast | innerHTML, inline CSS, `any` types, CSS naming, openFile calls |
| **compliance-check.mjs** | Before releases | Slower | All Obsidian API violations, security, lifecycle leaks, manifest validation |
| **check-css-duplicates.mjs** | Build time | Fast | Duplicate CSS selectors, empty rulesets |

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

**Last Updated:** 2025-12-16
**Based on:** [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) & Obsidian v1.11.1
