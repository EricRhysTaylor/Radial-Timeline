# Tips for using Local AI for Triplet Pulses

The "Pulse Analysis" feature in Radial Timeline is a powerful tool that reads your current scene along with the previous and next scenes to analyze narrative flow. Because this task is complex, using a Local LLM (via Ollama, LM Studio, etc.) requires a bit of specific configuration to get good results.

## 1. Context Window is Critical
The plugin sends **three full scenes** to the AI at once (Previous + Current + Next) to ensure the analysis is contextually aware.
*   **The Math**: If your scenes average 2,000 words, that is ~6,000 words of input, plus the system instructions.
*   **Requirement**: You must use a model with a context window of **at least 8k tokens**.
*   **Recommendation**: Models with **16k** or **32k** context windows are safer to avoid the text being cut off mid-stream.
    *   *Good choices*: **Llama 3.1** (128k context), **Mistral** (32k), or **Qwen 2.5**.

## 2. Strict Instruction Following (JSON)
The plugin requires the AI to output **pure, valid JSON**. If the AI adds conversational filler (e.g., *"Here is the analysis you requested..."*) or messes up the brackets, the plugin will fail to parse the results.
*   **Avoid Base Models**: Do not use raw "base" models.
*   **Use Instruct/Chat Models**: Always select the "Instruct" or "Chat" versions of models (e.g., `llama3.1:8b-instruct`), as they are trained to follow formatting rules strictly.

## 3. Recommended Models
For the best balance of speed and accuracy on consumer hardware (like a MacBook Pro or a PC with a good GPU):

*   **Llama 3.1 8B**: A fantastic all-rounder. Fast, smart enough for narrative analysis, and has a massive context window.
*   **Mistral 7B / Nemo**: Excellent reasoning capabilities and very compliant with instructions.

> [!NOTE]
> Larger models (like 70B parameters) will provide analysis comparable to GPT-4 or Claude 3.5 Sonnet but require significant hardware (e.g., Mac Studio with 64GB+ RAM or dual RTX 3090s).

## 4. Troubleshooting
*   **"JSON Parse Error"**: This usually means the model tried to "talk" to you instead of just giving the data. Try a different model or ensure you are using an "Instruct" version.
*   **Incomplete Analysis**: If the analysis stops halfway through, your context window might be too small. Check your local server settings (e.g., in Ollama or LM Studio) to ensure the context limit isn't set to a low default like 2048 or 4096.
