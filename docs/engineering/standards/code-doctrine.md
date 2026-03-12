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

Fallback logic introduces:

- incorrect results
- hidden bugs
- testing complexity

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
