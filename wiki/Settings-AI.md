The AI tab configures provider access, model selection, and scene-analysis behavior across Radial Timeline.

## AI LLM For Scene Analysis

*   **Enable AI LLM features**: Toggles AI commands and visual indicators.
*   **AI prompt role & context template**: Customize the system prompt and context sent to the AI.
*   **Manage context templates**: Use the gear icon to edit templates and choose the active prompt role for analysis and Gossamer scores.
*   **Show previous and next scene analysis**: When enabled, scene hover metadata includes the AI pulse for neighboring scenes.
*   **Model**: Select your preferred LLM (Anthropic Claude, Google Gemini, OpenAI GPT, or Local/OpenAI-compatible).
*   **Latest model tags**: Models labeled `Latest` auto-update to the newest version within that provider.
*   **API keys**: Enter your API key for the selected provider.

## Local LLM Settings

These controls appear when **Local/OpenAI-compatible** is selected:

*   **Local LLM Base URL**: The API endpoint. For Ollama, use `http://localhost:11434/v1`. For LM Studio, use `http://localhost:1234/v1`.
*   **Model ID**: The exact model name your server expects (for example, `llama3`, `mistral-7b`).
*   **Custom Instructions**: Additional instructions added to the start of the prompt for fine-tuning local model behavior.
*   **Bypass scene hover metadata YAML writes**: When enabled, local LLM analysis skips writing to the scene note and saves results in the raw AI log instead.
*   **API Key (Optional)**: Required by some servers; usually ignored for local tools such as Ollama.

## Logging

*   **Log AI interactions to file**: When enabled, saves detailed JSON logs for each AI request in the AI output folder.

> [!NOTE]
> Local/OpenAI-compatible setup is documented separately in [Local LLM](Local-LLM).

> [!NOTE]
> Pulse currently uses the hosted-provider path documented in [AI Pulse Triplet Analysis](AI-Pulse-Analysis).
