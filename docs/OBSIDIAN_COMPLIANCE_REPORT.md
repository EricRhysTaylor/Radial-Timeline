# Obsidian Plugin Guidelines Compliance Report

**Date:** 2025-10-13  
**Plugin:** Radial Timeline  
**Version:** 2.6.4

---

## Executive Summary

✅ **All Obsidian plugin guidelines are being followed correctly.**  
✅ **All antipatterns are properly guarded against in automated checks.**  
✅ **All modals correctly extend Obsidian's Modal class.**

---

## Critical Antipatterns Checked

### 1. ✅ No `detachLeavesOfType()` in `onunload()`

**Status:** COMPLIANT

**Location:** `src/main.ts`, lines 2264-2269

```typescript
onunload() {
    // Clean up any other resources
    this.hideBeatsStatusBar();
    // Note: Do NOT detach leaves here - Obsidian handles this automatically
}
```

**Automated Guard:** Yes - `scripts/compliance-check.mjs` lines 139-144

**Why this matters:** Detaching leaves in `onunload()` causes issues when users update the plugin. Obsidian automatically handles leaf cleanup.

**Reference:** [Obsidian Guidelines - Don't detach leaves in onunload](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60)

---

### 2. ✅ No Persistent View References

**Status:** COMPLIANT

**Location:** `src/main.ts`, lines 325-370

```typescript
export default class RadialTimelinePlugin extends Plugin {
    settings: RadialTimelineSettings;
    
    // Do not store persistent references to views (per Obsidian guidelines)

    // Helper: get all currently open timeline views
    private getTimelineViews(): RadialTimelineView[] {
        return this.app.workspace
            .getLeavesOfType(TIMELINE_VIEW_TYPE)
            .map(leaf => leaf.view as unknown)
            .filter((v): v is RadialTimelineView => v instanceof RadialTimelineView);
    }
    
    // Helper: get the first open timeline view (if any)
    private getFirstTimelineView(): RadialTimelineView | null {
        const list = this.getTimelineViews();
        return list.length > 0 ? list[0] : null;
    }
```

**Implementation:**
- ✅ No persistent view properties stored
- ✅ Uses `getLeavesOfType()` dynamically whenever views are needed
- ✅ Helper methods encapsulate view access logic
- ✅ Views are queried fresh each time to avoid stale references

**Automated Guard:** Yes - `scripts/compliance-check.mjs` lines 145-152 (newly added)

**Why this matters:** Obsidian may call the view factory function multiple times. Storing references leads to stale instances and memory leaks.

**Reference:** [Obsidian Guidelines - Avoid managing references to custom views](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+managing+references+to+custom+views)

---

## Modal Implementation Review

### All Modals Correctly Use Obsidian's Modal Class

| Modal | Location | Status | Notes |
|-------|----------|--------|-------|
| **TextInputModal** | `src/settings/AiContextModal.ts` | ✅ Correct | Replaces `window.prompt()` with Obsidian-styled modal |
| **AiContextModal** | `src/settings/AiContextModal.ts` | ✅ Correct | Complex template management UI - requires custom modal |
| **BeatsProcessingModal** | `src/view/BeatsProcessingModal.ts` | ✅ Correct | Progress tracking with abort functionality - requires custom modal |
| **GossamerScoreModal** | `src/view/GossamerScoreModal.ts` | ✅ Correct | Multiple score inputs - requires custom modal |
| **ZeroDraftModal** | `src/view/ZeroDraftModal.ts` | ✅ Correct | Textarea with multiple action buttons - requires custom modal |
| **Search Modal** | `src/main.ts` line 1613 | ✅ Correct | Simple inline modal usage |

**Conclusion:** All modals properly extend `Obsidian.Modal` and cannot be replaced with simpler built-in dialogs due to their complexity.

### Can We Use Built-in Obsidian Dialogs Instead?

**Answer:** No, for valid reasons.

Obsidian provides:
- `Modal` class - ✅ We use this everywhere
- `Notice` class - ✅ We use this for notifications
- `window.confirm()` - ✅ We use this for simple confirmations

Our modals all have **complex requirements** that can't be satisfied by simple dialogs:
- Multiple input fields (GossamerScoreModal)
- Progress bars and status updates (BeatsProcessingModal)
- Template management with CRUD operations (AiContextModal)
- Large text areas with validation (ZeroDraftModal)

**Verdict:** Current implementation is correct and follows Obsidian best practices.

---

## Settings Tab Implementation

**Location:** `src/settings/SettingsTab.ts`

**Status:** ✅ COMPLIANT

The settings tab correctly extends `PluginSettingTab` and uses:
- ✅ Obsidian's `Setting` component
- ✅ `TextComponent`, `ColorComponent`, `DropdownComponent`
- ✅ `FolderSuggest` custom component (properly encapsulated)
- ✅ Opens `AiContextModal` for complex template management (appropriate use case)

---

## Automated Compliance Checks

### Current Checks in `scripts/compliance-check.mjs`

| Check ID | Description | Severity | Status |
|----------|-------------|----------|--------|
| `innerHTML` | Avoid XSS vulnerability | Error | ✅ Checked |
| `outerHTML` | Avoid XSS vulnerability | Error | ✅ Checked |
| `adapter` | Use Vault API instead | Error | ✅ Checked |
| `fetch` | Use requestUrl instead | Error | ✅ Checked |
| `xhr` | Use requestUrl instead | Error | ✅ Checked |
| `eval` | Never execute arbitrary code | Error | ✅ Checked |
| `new-function` | Never execute arbitrary code | Error | ✅ Checked |
| `node-core-import` | Don't import Node core modules | Error | ✅ Checked |
| `node-core-require` | Don't require Node core modules | Error | ✅ Checked |
| `console-log` | Avoid console logs in production | Error | ✅ Checked |
| `secret-openai` | Detect hardcoded API keys | Error | ✅ Checked |
| `secret-anthropic` | Detect hardcoded API keys | Error | ✅ Checked |
| `secret-google` | Detect hardcoded API keys | Error | ✅ Checked |
| `detach-leaves-in-onunload` | Don't detach leaves in onunload | Error | ✅ Checked |
| `persistent-view-reference` | Don't store view references | Error | ✅ **NEW** |
| `normalize-path-missing` | Normalize user paths | Warning | ✅ Checked |
| `var-declaration` | Use const/let instead of var | Warning | ✅ Checked |
| `nodejs-timeout-type` | Use number for timeout handles | Warning | ✅ Checked |
| `bare-timeout-call` | Use window.setTimeout | Warning | ✅ Checked |
| `platform-import-check` | Import Platform from obsidian | Warning | ✅ Checked |

### Manifest Validation

| Check | Status |
|-------|--------|
| Required fields present | ✅ Pass |
| ID in kebab-case | ✅ Pass |
| ID matches package.json | ✅ Pass |
| minAppVersion specified | ✅ Pass |
| Version consistency | ✅ Pass |
| Release artifacts present | ✅ Pass |

---

## Compliance Test Results

```bash
$ npm run standards

> radial-timeline@2.6.4 standards
> node scripts/compliance-check.mjs && node code-quality-check.mjs src/main.ts

✅ Obsidian compliance checks passed.
📖 See CODE_STANDARDS.md for full guidelines.
✅ Code quality checks passed.
```

**Result:** ✅ ALL CHECKS PASSED

---

## Documentation Updates

### Updated Files

1. **`CODE_STANDARDS.md`**
   - ✅ Added section on "Managing Custom Views (Critical Antipattern)"
   - ✅ Documented the correct pattern using `getLeavesOfType()`
   - ✅ Explained why persistent view references are problematic
   - ✅ Linked to official Obsidian guidelines

2. **`scripts/compliance-check.mjs`**
   - ✅ Added `persistent-view-reference` check (lines 145-152)
   - ✅ Added suggestion text for the new check (lines 216-217)
   - ✅ Configured to fail builds if view references are detected

---

## Recommendations

### ✅ Current Implementation

**No changes needed.** The plugin is fully compliant with Obsidian guidelines.

### Future Maintenance

1. **Continue running standards checks before each release:**
   ```bash
   npm run standards
   ```
   This runs both compliance and code quality checks in one command.

2. **Keep the compliance script updated** as new Obsidian guidelines are published

3. **Review the Obsidian plugin guidelines periodically:**
   - https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

4. **When adding new features:**
   - Run `npm run standards` during development
   - Check that pre-commit hooks are working
   - Verify no new antipatterns are introduced

---

## Summary of Findings

### Antipatterns

| Antipattern | Status | Guard |
|-------------|--------|-------|
| `detachLeavesOfType` in `onunload()` | ✅ Not present | ✅ Automated check |
| Persistent view references | ✅ Not present | ✅ Automated check |
| `innerHTML`/`outerHTML` without safety | ✅ Not present | ✅ Automated check |
| `fetch` instead of `requestUrl` | ✅ Not present | ✅ Automated check |
| `console.log` in production | ✅ Not present | ✅ Automated check |
| Hardcoded API keys | ✅ Not present | ✅ Automated check |
| Direct `vault.adapter` access | ✅ Not present | ✅ Automated check |

### Modals

| Pattern | Status |
|---------|--------|
| All modals extend `Obsidian.Modal` | ✅ Correct |
| Appropriate use of custom modals | ✅ Correct |
| Settings tab uses `PluginSettingTab` | ✅ Correct |

### Best Practices

| Practice | Status |
|----------|--------|
| Use `registerEvent` for cleanup | ✅ Implemented |
| Use `getLeavesOfType()` for views | ✅ Implemented |
| Use `normalizePath()` for user paths | ✅ Implemented |
| Use `requestUrl()` for network | ✅ Implemented |
| Use `app.vault` API for files | ✅ Implemented |
| Use `window.setTimeout` with number | ✅ Implemented |

---

## Conclusion

**The Radial Timeline plugin is fully compliant with all Obsidian plugin guidelines.** 

- ✅ All critical antipatterns are avoided
- ✅ All antipatterns are guarded against in automated checks
- ✅ All modals correctly use Obsidian's Modal class
- ✅ View references are managed correctly using `getLeavesOfType()`
- ✅ Resource cleanup is handled properly
- ✅ Documentation is up to date

**No code changes are required.**

---

**Report Generated By:** AI Assistant (Claude Sonnet 4.5)  
**Reviewed:** Radial Timeline Plugin Codebase  
**Tools Used:** 
- `grep` for pattern matching
- `codebase_search` for semantic analysis
- `compliance-check.mjs` for automated validation
- Manual code review

---

## References

- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Don't detach leaves in onunload](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60)
- [Avoid managing references to custom views](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+managing+references+to+custom+views)
- [Obsidian TypeScript API](https://docs.obsidian.md/Reference/TypeScript+API)

