# Lifecycle Leak Issues Found

**Date:** 2025-10-13  
**Compliance Check:** Updated with Obsidian Lifecycle Guards

---

## Summary

New compliance checks found **10 memory leak issues** in modals and settings:

### ❌ Errors (Must Fix)

#### main.ts (2 issues)
1. **Line 1680** - Search input keydown listener
2. **Line 2193** - Status bar item click listener

#### AiContextModal.ts (3 issues)
3. **Line 50** - Input keydown listener
4. **Line 179** - Textarea input listener
5. **Line 194** - Textarea input listener (duplicate)

#### SettingsTab.ts (3 issues)
6. **Line 143** - Suggestion click listener
7. **Line 578** - Color swatch click listener
8. **Line 644** - Color swatch click listener

#### BeatsProcessingModal.ts (2 issues)
9. **Line 165** - Radio change listener
10. **Line 217** - Radio change listener

### ⚠️ Warnings (Consider Fixing)

#### RequestAnimationFrame without cleanup (7 instances)
- main.ts: Line 1959
- TimeLineView.ts: Lines 326, 893, 974, 1400, 1411, 1412

#### MutationObserver without cleanup (1 instance)
- TimeLineView.ts: Line 326

---

## Fix Pattern

### For Modals

Modals extend `Modal` which extends `Component`, so use `this.registerDomEvent()`:

**Before (Memory Leak):**
```typescript
export class AiContextModal extends Modal {
    onOpen() {
        const inputEl = this.contentEl.createEl('input');
        inputEl.addEventListener('keydown', (e) => {  // ❌ LEAK
            // handler
        });
    }
}
```

**After (Auto Cleanup):**
```typescript
export class AiContextModal extends Modal {
    onOpen() {
        const inputEl = this.contentEl.createEl('input');
        this.registerDomEvent(inputEl, 'keydown', (e) => {  // ✅ SAFE
            // handler
        });
    }
}
```

### For Settings Tab

`PluginSettingTab` also extends `Component`:

**Before:**
```typescript
suggestionEl.addEventListener('click', async () => {  // ❌ LEAK
    // handler
});
```

**After:**
```typescript
this.registerDomEvent(suggestionEl, 'click', async () => {  // ✅ SAFE
    // handler
});
```

### For RequestAnimationFrame

**Before:**
```typescript
requestAnimationFrame(() => {  // ⚠️ Warning - no cleanup
    processNodes();
});
```

**After (Option 1 - with cleanup):**
```typescript
const rafId = requestAnimationFrame(() => {
    processNodes();
});
this.register(() => cancelAnimationFrame(rafId));  // ✅ Cleanup registered
```

**After (Option 2 - safe pattern):**
```typescript
// SAFE: One-time RAF in view render, cancelled when view unloads
requestAnimationFrame(() => {
    processNodes();
});
```

### For Observers

**Before:**
```typescript
const observer = new MutationObserver(() => {  // ⚠️ Warning - no cleanup
    // handler
});
observer.observe(element, { childList: true });
```

**After:**
```typescript
const observer = new MutationObserver(() => {
    // handler
});
observer.observe(element, { childList: true });
this.register(() => observer.disconnect());  // ✅ Cleanup registered
```

---

## Priority

### High Priority (Errors - Must Fix)
All 10 `addEventListener` calls in:
- `src/main.ts` (2)
- `src/settings/AiContextModal.ts` (3)
- `src/settings/SettingsTab.ts` (3)
- `src/view/BeatsProcessingModal.ts` (2)

### Medium Priority (Warnings - Review)
- RequestAnimationFrame calls (7) - may be acceptable if one-time or cancelled elsewhere
- MutationObserver (1) - needs cleanup registration

---

## Testing After Fix

1. Open Obsidian Developer Tools
2. Memory → Take heap snapshot
3. Open/close modals 10 times
4. Force GC
5. Take another snapshot
6. Compare - listener count should be stable

---

## Benefits

✅ **No Memory Leaks** - All listeners cleaned up automatically  
✅ **Obsidian Native** - Uses Component lifecycle  
✅ **Maintainable** - Standard pattern across codebase  
✅ **Type Safe** - Full TypeScript support

---

## Next Steps

1. Fix the 10 `addEventListener` errors
2. Review the 7 RAF warnings (add `// SAFE:` comment if intentional)
3. Fix or document the MutationObserver warning
4. Run `npm run standards` to verify all fixed
5. Test modal/settings open/close cycles

---

**Status:** Issues identified, fixes needed  
**Priority:** High (before next release)

