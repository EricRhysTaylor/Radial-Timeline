# Obsidian Plugin Compliance Report

**Date:** 2025-10-13  
**Plugin:** Radial Timeline  
**Version:** 2.6.4  
**Inspector:** AI Assistant (Claude Sonnet 4.5)

---

## Executive Summary

**Overall Status:** ⚠️ **MOSTLY COMPLIANT with 1 ISSUE**

- ✅ **17/18** automated compliance checks passed
- ⚠️ **1 Memory Leak Issue** found in view event listeners
- ✅ All critical antipatterns (detachLeavesOfType, persistent view references) avoided
- ✅ No security issues (API keys, eval, innerHTML, etc.)
- ✅ Proper use of Obsidian APIs

---

## ⚠️ Issue Found: Memory Leak in Event Listeners

### Problem

**Severity:** HIGH  
**File:** `src/view/TimeLineView.ts`  
**Lines:** Multiple locations (105, 771, 1004, 1011, 1093, 1125, 1400, 1443, 1520, 1533, 1820-1827, 1835-1837)

**Issue:** The view directly calls `addEventListener` on DOM elements without proper cleanup. These listeners are **not** removed when the view is destroyed, causing memory leaks.

**Count:**
- 30 `addEventListener` calls in source files
- Only 9 properly registered with `registerDomEvent` (in main.ts and view)
- **~21 unregistered event listeners** that will leak memory

### Examples of Problematic Code

```typescript
// ❌ WRONG - Memory leak
clearSearchBtn.addEventListener('click', () => {
    this.plugin.clearSearch();
});

// ❌ WRONG - Memory leak
svg.addEventListener('pointerover', (e: PointerEvent) => {
    // ... handler code
});

// ❌ WRONG - Memory leak  
group.addEventListener("mouseenter", () => {
    // ... handler code
});
```

### Why This Matters

1. **Memory Leaks:** Each time the timeline view is recreated, new listeners are added without removing old ones
2. **Performance Degradation:** Leaked listeners continue to fire even after the view is "destroyed"
3. **Stale State:** Old listeners may reference outdated plugin state, causing bugs
4. **Resource Waste:** Memory and CPU cycles are wasted on ghost listeners

### Locations Requiring Fixes

#### In `TimeLineView.ts`:

1. **Line 105** - Search clear button click
2. **Line 771** - Demo button click
3. **Lines 1004, 1011** - SVG pointer over/out (normal mode)
4. **Lines 1093, 1125** - SVG pointer over/out (alternate implementation)
5. **Line 1400** - SVG pointer move (RAF-based)
6. **Line 1443** - Scene path click
7. **Lines 1520, 1533** - Scene group mouse enter/leave
8. **Lines 1820-1827** - Gossamer mode SVG listeners (7 listeners)
9. **Lines 1835-1837** - Gossamer plot group listeners (3 per group × N groups)

#### In Settings/Modals (SAFE - auto-cleaned):

The following are **safe** because modals/settings are temporary and cleaned up automatically:
- `SettingsTab.ts` - Color swatch clicks (3 listeners)
- `AiContextModal.ts` - Input keydown and textarea input (3 listeners)
- `BeatsProcessingModal.ts` - Radio button changes (2 listeners)

---

## Recommended Fixes

### Solution 1: Use `registerDomEvent` (Preferred)

For the **main plugin class**, use `registerDomEvent`:

```typescript
// ✅ CORRECT - Automatically cleaned up
this.registerDomEvent(element, 'click', () => {
    // handler
});
```

### Solution 2: Store Listeners and Clean Up in `onunload`

For **view classes** where you need more control:

```typescript
export class RadialTimelineView extends ItemView {
    private eventListeners: Array<{
        element: Element;
        type: string;
        handler: EventListener;
    }> = [];

    private addListener(element: Element, type: string, handler: EventListener): void {
        element.addEventListener(type, handler);
        this.eventListeners.push({ element, type, handler });
    }

    onunload(): void {
        // Clean up all listeners
        this.eventListeners.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this.eventListeners = [];
    }
}
```

### Solution 3: Use AbortController (Modern Approach)

```typescript
export class RadialTimelineView extends ItemView {
    private abortController: AbortController | null = null;

    setupListeners(): void {
        this.abortController = new AbortController();
        const { signal } = this.abortController;

        // All listeners automatically removed when signal aborted
        element.addEventListener('click', handler, { signal });
        svg.addEventListener('pointerover', handler, { signal });
    }

    onunload(): void {
        this.abortController?.abort();
        this.abortController = null;
    }
}
```

---

## ✅ Automated Compliance Checks (All Passed)

| Check | Status | Description |
|-------|--------|-------------|
| `innerHTML` | ✅ Pass | No unsafe innerHTML assignments |
| `outerHTML` | ✅ Pass | No unsafe outerHTML assignments |
| `adapter` | ✅ Pass | Uses Vault API, not adapter |
| `fetch` | ✅ Pass | Uses requestUrl instead of fetch |
| `xhr` | ✅ Pass | No XMLHttpRequest usage |
| `eval` | ✅ Pass | No eval usage |
| `new-function` | ✅ Pass | No dynamic Function creation |
| `node-core-import` | ✅ Pass | No Node core module imports |
| `console-log` | ✅ Pass | No console.log in production |
| `secret-*` | ✅ Pass | No hardcoded API keys |
| `detach-leaves-in-onunload` | ✅ Pass | Doesn't detach leaves |
| `persistent-view-reference` | ✅ Pass | Uses getLeavesOfType() pattern |
| `normalize-path-missing` | ✅ Pass | Paths are normalized |
| `var-declaration` | ✅ Pass | Uses const/let only |
| `nodejs-timeout-type` | ✅ Pass | Uses number for timeouts |
| `bare-timeout-call` | ✅ Pass | Uses window.setTimeout |
| `platform-import-check` | ✅ Pass | Imports Platform correctly |

---

## ✅ Best Practices Confirmed

### Plugin Lifecycle
- ✅ Proper `onload()` implementation
- ✅ Proper `onunload()` implementation (no detachLeavesOfType)
- ✅ Settings persistence with loadSettings/saveSettings
- ✅ Command registration

### View Management
- ✅ Uses `getLeavesOfType()` instead of storing view references
- ✅ Helper methods for accessing views dynamically
- ✅ No persistent view properties stored

### Event Management
- ✅ Uses `registerEvent()` for Obsidian events
- ✅ Uses `registerDomEvent()` for DOM events (in plugin)
- ⚠️ **Missing cleanup** for view addEventListener calls

### API Usage
- ✅ Uses `app.vault` API for file operations
- ✅ Uses `requestUrl` for network requests
- ✅ Uses `normalizePath()` for user paths
- ✅ Uses `MarkdownRenderer` correctly

### Security
- ✅ No innerHTML/outerHTML assignments
- ✅ No eval or Function constructor
- ✅ API keys loaded from settings, not hardcoded
- ✅ No Node.js core module usage

---

## Manifest Validation

| Field | Value | Status |
|-------|-------|--------|
| id | radial-timeline | ✅ Valid (kebab-case) |
| name | Radial Timeline | ✅ Present |
| version | 2.6.4 | ✅ Matches package.json |
| minAppVersion | 1.4.0 | ✅ Present |
| description | Present | ✅ Valid |
| author | Present | ✅ Valid |

---

## Recommendations

### Priority 1: Fix Memory Leak (CRITICAL)

**Action Required:** Implement proper event listener cleanup in `TimeLineView.ts`

**Estimated Effort:** 2-3 hours

**Approach:** Use AbortController pattern for cleanest implementation:

```typescript
// In TimeLineView.ts
export class RadialTimelineView extends ItemView {
    private svgAbortController: AbortController | null = null;
    
    // In your render method:
    private renderTimeline(): void {
        // Clean up old listeners
        this.svgAbortController?.abort();
        this.svgAbortController = new AbortController();
        const { signal } = this.svgAbortController;
        
        // All listeners use signal option
        svg.addEventListener('pointerover', handler, { signal });
        svg.addEventListener('pointerout', handler, { signal });
        clearBtn.addEventListener('click', handler, { signal });
        // etc.
    }
    
    onunload(): void {
        this.svgAbortController?.abort();
        this.svgAbortController = null;
    }
}
```

### Priority 2: Add Event Listener Compliance Check (RECOMMENDED)

Add a new check to `scripts/compliance-check.mjs`:

```javascript
{
    id: 'view-add-event-listener',
    description: 'Views must clean up addEventListener calls - use AbortController or track for removal',
    regex: /class\s+\w+View\s+extends\s+ItemView[\s\S]{1,5000}addEventListener/,
    allowSafeComment: true,
    severity: 'warn',
}
```

### Priority 3: Testing (RECOMMENDED)

Test memory leak fix:
1. Open Developer Tools → Memory
2. Take heap snapshot
3. Open/close timeline view 10 times
4. Take another snapshot
5. Compare - listener count should remain stable

---

## Conclusion

The Radial Timeline plugin follows **excellent** Obsidian development practices overall:

- ✅ Avoids all critical antipatterns
- ✅ Uses proper API methods
- ✅ Maintains good security hygiene
- ✅ Has comprehensive automated checks

However, there is **one significant issue**:

- ⚠️ **Memory leak from unregistered event listeners in view class**

This should be fixed before the next release to prevent memory/performance issues for users who frequently open/close the timeline view.

---

## Test Command

```bash
# Run compliance checks
npm run standards

# Output:
# ✅ Obsidian compliance checks passed.
# 📖 See CODE_STANDARDS.md for full guidelines.
```

---

## References

- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Don't detach leaves in onunload](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60)
- [Avoid managing references to custom views](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+managing+references+to+custom+views)
- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)

---

**Report Generated:** 2025-10-13  
**Next Review:** After memory leak fix implementation

