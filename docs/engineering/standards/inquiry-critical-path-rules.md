# Inquiry Critical Path Rules

This document governs the runtime architecture for:

- Inquiry
- Gossamer
- AI Strategy forecasting
- AI execution routing

These systems are part of the **AI critical path** and must remain deterministic.

---

## 1. Two Counting Systems Only

The system intentionally maintains **two token counts**.

### RT Corpus Count (UI)

Represents the manuscript material being analyzed.

Properties:

- deterministic
- provider independent
- identical across Inquiry / Gossamer / Settings

Formula:

```
tokens = ceil(evidenceChars / 4)
```

Must NOT include:

- prompt envelope
- system instructions
- transport structure
- provider tokenization differences

This number is the **only number shown to authors**.

---

### Provider Execution Count (internal)

Represents the actual tokens sent to the AI provider.

Includes:

- envelope
- instructions
- schema
- provider tokenization

Used only for:

- preflight checks
- single vs multi-pass packaging
- overflow blocking

Must NOT replace the UI corpus number.

---

## 2. Multi-pass Must Never Be Blocked

If packaging mode allows multi-pass:

```
automatic
segmented
```

then:

```
overflow -> multi-pass
```

Never reject due to single-pass limits.

Only `singlePassOnly` may block.

---

## 3. Provider Failures Are Packaging Failures

If chunking fails:

- invalid JSON
- malformed response
- chunk execution failure
- synthesis failure

The system must report:

```
packaging_failed
```

Never suggest switching providers unless the provider truly cannot perform the task.

---

## 4. No Fabricated Model Capabilities

If the system cannot determine a model capability:

- contextWindow
- maxOutput
- reasoning support

The system must display:

```
unknown
```

Never fabricate placeholder values.

---

## 5. Snapshot Is the Single Estimate Source

`InquiryEstimateSnapshot` is the authoritative estimate.

All UI surfaces must read from it:

- Inquiry popover
- token pills
- minimap pressure
- readiness panel
- AI Strategy forecast

No other estimate path may exist.

---

## 6. Hover Must Not Recompute Estimates

Token estimates must be stable.

UI behavior must be:

```
state change -> compute snapshot once
hover -> reuse snapshot
```

Hover must never trigger:

- heuristic recomputation
- provider token counting
- estimate drift

---

## 7. Chunking Must Be Budget-Aware

Chunk planning must derive from:

```
safeInputBudget
expectedPassCount
prefixOverhead
```

Fixed constants like:

```
6000 token chunks
```

are forbidden.

---

## 8. Error States Are Valid UX

If the system cannot compute something, show:

```
Estimating...
Unavailable
Blocked
```

Never substitute incorrect numbers.

---

## 9. Local Models

Local models are treated as **unknown capability providers**.

Inquiry may only run if:

```
user supplies explicit model limits
```

Otherwise:

```
Inquiry = blocked
```

---

## 10. Logs May Show Both Counts

Logs are allowed to display:

```
Corpus estimate: 147k
Provider estimate: 316k
```

UI must show only the corpus estimate.

---

## 11. No Speculative Capability Handling

Provider capabilities must only exist when they are implemented.

Do not add:

- placeholder capability flags
- unimplemented capability branches
- future provider scaffolding

Capabilities are added only when the feature exists and is wired end-to-end.

---

## Philosophy

Inquiry is designed for **large manuscripts and sagas**.

Accuracy and transparency are more important than defensive fallbacks.
