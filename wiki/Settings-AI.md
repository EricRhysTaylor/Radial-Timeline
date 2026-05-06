<div style="text-align: center; margin: 20px 0;">
  <img src="images/settings-ai.png" alt="Settings → AI tab" style="width: 600px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Settings → AI</div>
</div>

The AI tab configures provider access, model selection, and scene-analysis behavior across Radial Timeline.

## AI LLM For Scene Analysis

*   **Enable AI LLM features**: Toggles AI commands and visual indicators.
*   **AI prompt role & context template**: Customize the system prompt and context sent to the AI.
*   **Manage context templates**: Use the gear icon to edit templates and choose the active prompt role for analysis and Gossamer scores.
*   **Show previous and next scene analysis**: When enabled, scene hover metadata includes the AI pulse for neighboring scenes.
*   **Model**: Select your preferred LLM (Anthropic Claude, Google Gemini, OpenAI GPT, or Local/OpenAI-compatible).
*   **Latest model tags**: Models labeled `Latest` auto-update to the newest version within that provider.
*   **API keys**: Enter your API key for the selected provider.

## Logging

*   **Log AI interactions to file**: When enabled, saves detailed JSON logs for each AI request in the AI output folder.

---

## Local / OpenAI-Compatible

This section covers Radial Timeline's local or OpenAI-compatible AI configuration, including Ollama, LM Studio, and similar endpoints.

Local AI is a separate topic from [AI Pulse Triplet Analysis](AI-Pulse-Analysis). Pulse currently works best with the hosted providers and should be configured with Anthropic, OpenAI, or Gemini for now.

### Settings

These options appear when **Local/OpenAI-compatible** is selected as the **Model**:

*   **Local LLM Base URL**: The API endpoint. For Ollama, use `http://localhost:11434/v1`. For LM Studio, use `http://localhost:1234/v1`.
*   **Model ID**: The exact model name your server expects (for example, `llama3`, `mistral-7b`).
*   **Custom Instructions**: Additional instructions added to the start of the prompt for fine-tuning local model behavior.
*   **Bypass scene hover metadata YAML writes**: When enabled, local LLM analysis skips writing to the scene note and saves results in the raw AI log instead.
*   **API Key (Optional)**: Required by some servers; usually ignored for local tools such as Ollama.

### Why Pulse Is Strict

Pulse reads your **previous**, **current**, and **next** scenes together so it can judge transitions, narrative pressure, and local story flow rather than isolated scene quality.

That means the provider must do two things reliably:

*   handle a larger prompt that includes three scene bodies plus instructions
*   return clean structured output that Radial Timeline can parse into hover metadata

This is the main reason local setups tend to work poorly or inconsistently for Pulse right now. Hosted providers are the supported path because they are currently the most reliable at both.

### Expected Output Shape

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

### Example

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
