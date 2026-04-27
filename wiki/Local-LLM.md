# Local LLM

This page covers Radial Timeline's local or OpenAI-compatible AI configuration, including Ollama, LM Studio, and similar endpoints.

Local AI is a separate topic from [AI Pulse Triplet Analysis](AI-Pulse-Analysis). Pulse currently works best with the hosted providers and should be configured there with Anthropic, OpenAI, or Gemini for now.

## What This Page Covers

Use this page when you are configuring:

*   local or self-hosted AI endpoints
*   OpenAI-compatible servers
*   Ollama
*   LM Studio
*   local testing and custom model routing

## AI Settings

These options appear in **Settings → AI** when **Local/OpenAI-compatible** is selected:

*   **Local LLM Base URL**: The API endpoint. For Ollama, use `http://localhost:11434/v1`. For LM Studio, use `http://localhost:1234/v1`.
*   **Model ID**: The exact model name your server expects.
*   **Custom Instructions**: Additional instructions added to the start of the prompt for fine-tuning local model behavior.
*   **Bypass scene hover metadata yaml writes**: When enabled, local analysis skips writing to the scene note and saves results in the RAW AI log instead.
*   **API Key (Optional)**: Required by some servers; usually ignored for local tools like Ollama.

## Scope

Local/OpenAI-compatible configuration belongs to the AI settings layer. Treat it as infrastructure setup rather than the default guidance for Pulse or other end-user workflow pages.

## Why Pulse Is Strict

Pulse reads your **previous**, **current**, and **next** scenes together so it can judge transitions, narrative pressure, and local story flow rather than isolated scene quality.

That means the provider must do two things reliably:

*   handle a larger prompt that includes three scene bodies plus instructions
*   return clean structured output that Radial Timeline can parse into hover metadata

This is the main reason local setups tend to work poorly or inconsistently for Pulse right now. Hosted providers are the supported path because they are currently the most reliable at both.

## Expected Output Shape

Radial Timeline expects structured Pulse output in this shape:

```json
{
  "previousSceneAnalysis": [
    {
      "scene": "38",
      "title": "Pulse point title",
      "grade": "+",
      "comment": "Editorial comment (max 10 words)"
    }
  ],
  "currentSceneAnalysis": [
    {
      "scene": "39",
      "title": "Overall Scene Grade",
      "grade": "B",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "39",
      "title": "Pulse point title",
      "grade": "+",
      "comment": "Editorial comment (max 10 words)"
    }
  ],
  "nextSceneAnalysis": [
    {
      "scene": "40",
      "title": "Pulse point title",
      "grade": "+",
      "comment": "Editorial comment (max 10 words)"
    }
  ]
}
```

**Field Requirements:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `previousSceneAnalysis` | array | No | Analysis of how the previous scene sets up the current scene |
| `currentSceneAnalysis` | array | **Yes** | Analysis of the current scene (at least one item required) |
| `nextSceneAnalysis` | array | No | Analysis of how the next scene builds on the current scene |

**Pulse Item Structure:**

Each array item must have:

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `scene` | string | Scene number | e.g., "24" |
| `title` | string | Short title or Grade | Brief description or Grade (A/B/C for first item) |
| `grade` | string | `A`, `B`, `C` **or** `+`, `-`, `?` | See grading rules below |
| `comment` | string | Max 10-15 words | Editorial feedback |

**Grading Rules:**

*   **First item in `currentSceneAnalysis`**: Must use **A**, **B**, or **C** (overall scene quality grade)
    *   `A` = Nearly perfect scene
    *   `B` = Good with minor improvements needed
    *   `C` = Needs significant work
*   **All other items** (including all `previousSceneAnalysis` and `nextSceneAnalysis`): Must use **+**, **-**, or **?**
    *   `+` = Strong connection/effective element
    *   `-` = Weak connection/needs improvement
    *   `?` = Neutral/uncertain

> [!IMPORTANT]
> Pulse depends on structured output. If the provider returns malformed or incomplete data, the scene hover analysis will not populate correctly.

## Example

```YAML
previousSceneAnalysis:
  - 5 Matchmaking Focus + / Establishes the desperation driving Mrs. Bennet's rain scheme.
  - Darcy's Pride + / Sets up the tension for Elizabeth's arrival at Netherfield.
  - Lucas Foil ? / Charlotte's pragmatism contrasts with Elizabeth's muddy trek.
currentSceneAnalysis:
  - 7 A / Excellent pacing; the muddy walk perfectly characterizes Elizabeth.
  - The Entail + / High stakes explain Mrs. Bennet's dangerous scheming.
  - The Rain Scheme + / Pivotal plot device forcing the protagonists into proximity.
  - Elizabeth's Walk + / Physicality defines her independence against social norms.
  - Netherfield Reception + / Sharp contrast between Bingley's warmth and sisters' snobbery.
nextSceneAnalysis:
  - 9 Mrs. Bennet's Visit + / Direct consequence of the illness established in this scene.
  - Social Embarrassment + / Elizabeth's anxiety here is fully realized by mother's behavior.
  - Darcy's Attraction + / His interest in her 'fine eyes' escalates significantly.
```
