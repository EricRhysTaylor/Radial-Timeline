# RT Engineering Doctrine

> **Engineering Rule**
> These rules are mandatory for both human and AI-generated code.
> All refactors and architectural changes must comply with this doctrine.
> If new code violates these rules, the correct action is to refactor the code rather than add new fallback layers.

This document defines the coding philosophy for the Radial Timeline codebase.

The goal is **predictable, testable, lean software**.

The system prioritizes **correctness, determinism, and maintainability** over convenience or defensive overengineering.

---

## Core Principles

### 1. Prefer One Canonical Path

If multiple implementations perform the same function:

- merge them
- or delete one

There must be **one source of truth** for every core behavior.

Examples:

- token counting
- model selection
- corpus composition
- execution routing

---

### 2. Fail Clearly Instead of Falling Back

If the system cannot produce a correct result:

**throw an error or show a clear blocked state.**

Do not silently fall back to heuristics or alternate code paths.

**Hard fail is preferred to silent recovery.** A loud failure surfaces real bugs and architectural flaws while they're still cheap to fix. A silent fallback masks them, accumulates them, and ships them to authors as inexplicable wrong answers months later.

Fallback logic introduces:

- incorrect results that look correct
- hidden bugs that survive the next refactor
- testing complexity (you have to test the fallback path AND the unreachable error path)
- false confidence in code that hasn't been exercised
- a permanent excuse not to fix the underlying problem

Bad:

```
try providerEstimate
fallback heuristicEstimate
fallback previousEstimate
```

Correct:

```
try providerEstimate
if fail -> surface error
```

**The discipline:** when a function looks like it might need a fallback, ask why the upstream contract is unreliable. Fix the contract. A codebase whose callers trust their inputs is dramatically simpler than one whose every function defends against its callers.

This rule is enforced at boundaries by `scripts/fallback-gate.mjs` and is one of the four explicit author-trust principles (see `fallback-policy.md`).

---

### 3. Do Not Lie to the Author

Author-facing UI must never show numbers that are:

- fabricated
- clamped
- silently substituted
- partially derived

If the system cannot compute the value truthfully, display:

```
Estimate unavailable
```

or

```
Estimating...
```

---

### 4. Prefer Deletion Over Accommodation

When code grows complex due to historical compatibility:

delete obsolete behavior instead of layering new logic on top.

The correct refactor question is:

> "What code can be removed?"

not

> "What new code can fix this?"

---

### 5. No Defensive Branch Explosion

Avoid speculative code such as:

```
if maybeMissing
if maybeFallback
if maybeAlternate
if maybeLegacy
```

Branches must exist only for **known real cases**.

---

### 6. Pure Functions First

Prefer functions with explicit inputs and outputs:

```
result = compute(input)
```

Avoid hidden dependencies such as:

```
this.settings
this.plugin
this.state
```

Pure functions are easier to:

- test
- reason about
- reuse

---

### 7. UI Must Reflect System Truth

UI surfaces must display:

- the same estimate
- the same corpus
- the same model
- the same limits

Multiple UI numbers must **never diverge**.

---

## Refactor Standard

Every structural refactor must answer:

1. What duplicate logic was removed?
2. What fallback behavior was deleted?
3. What is now the single source of truth?
4. What UI surfaces became more accurate?
5. What became easier to test?

---

## What We Optimize For

The RT codebase optimizes for:

- deterministic behavior
- small surface area
- clarity of data flow
- fast debugging
- minimal cognitive overhead

---

## What We Avoid

We intentionally avoid:

- speculative flexibility
- defensive fallbacks
- duplicated computation paths
- UI numbers that disagree
- hidden coupling between modules

---

## Philosophy

Correct software is simpler than defensive software.

### Canonical YAML Keys Go Through Helpers, Never String Literals

Note types that have undergone field renames (Beat: `Description → Purpose`; Backdrop: `Synopsis → Context`) must be read through the canonical helpers in [`src/utils/frontmatter.ts`](../../../src/utils/frontmatter.ts) — `readBeatPurpose`, `readBackdropContext`. The legacy-key fallback ladder lives once in those helpers; never inline it.

```
// Allowed
const fm = asBeatFrontmatter(cache?.frontmatter);
const purpose = readBeatPurpose(fm);

// Not allowed — three drift surfaces in one read
const purpose = fm?.Purpose ?? fm?.Description ?? fm?.description;

// Forbidden — Beats never had a Synopsis field; this is the 2026-04-21 regression
const purpose = fm?.Synopsis;
```

Why this is a separate rule and not just "use helpers": Obsidian's `metadataCache.getFileCache().frontmatter` is typed `any`, so the typo-class bug (`fm.Synopsis` on a beat note) typechecks identically to the correct read. The 2026-04-21 multi-signal Gossamer refactor lost a month of beat-Purpose data this way — every Gossamer run shipped bare beat labels to the AI because nothing in the type system or test suite knew which YAML keys are valid on which note type.

Enforcement layers:

1. **Helpers** in `frontmatter.ts` are the single source of truth for the canonical/legacy key lists (`BEAT_PURPOSE_KEYS`, `BACKDROP_CONTEXT_KEYS`).
2. **Typed views** (`BeatFrontmatter`, `BackdropFrontmatter`) plus narrowing functions (`asBeatFrontmatter`, `asBackdropFrontmatter`) make `fm.Synopsis` a compile-time error on beat-typed fm.
3. **Source-grep tests** (`GossamerCommands.test.ts → Gossamer canonical YAML key discipline`) fail at CI if a call site re-inlines the fallback ladder or references a wrong-note-type key.
4. **Contract tests** (`unifiedBeatAnalysis.test.ts → renders the beat description after an em-dash when provided`) prove the prompt actually carries the field, so silent data-loss can't ship.

When you migrate another field, add it to the registry in `frontmatter.ts`, write a helper, add the source-grep test for the consuming module, and add the doctrine entry here.

### Logging Is Allowed, Behavioral Fallbacks Are Not

Diagnostic logging is encouraged.

However logging must never introduce alternate execution paths.

Allowed:

```
log.error("provider estimate failed")
```

Not allowed:

```
try providerEstimate
catch -> fallback heuristicEstimate
```
