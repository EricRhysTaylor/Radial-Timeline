import { Setting as Settings, Notice, DropdownComponent } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels } from '../../api/geminiApi';
import { fetchLocalModels } from '../../api/localAiApi';
import { CURATED_MODELS, CuratedModel, AiProvider } from '../../data/aiModels';

type Provider = 'anthropic' | 'gemini' | 'openai' | 'local';

export function renderAiSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    addAiRelatedElement: (el: HTMLElement) => void;
    toggleAiSettingsVisibility: (show: boolean) => void;
    refreshProviderDimming: () => void;
    scheduleKeyValidation: (provider: Provider) => void;
    setProviderSections: (sections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement; local?: HTMLElement }) => void;
    setKeyInputRef: (provider: Provider, input: HTMLInputElement | undefined) => void;
    setLocalConnectionInputs: (refs: { baseInput?: HTMLInputElement; modelInput?: HTMLInputElement }) => void;
}): void {
    const { app, plugin, containerEl } = params;

    // --- AI for Scene Analysis ---
    new Settings(containerEl)
        .setName('AI LLM for scene analysis')
        .setHeading();

    // Enable/disable scene beats features
    // NOTE: This toggle should always be visible (not added to _aiRelatedElements)
    new Settings(containerEl)
        .setName('Enable AI LLM features')
        .setDesc('Show command palette options and UI scene analysis colors and hover synopsis. When off, these visuals are hidden, but metadata remains unchanged.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableAiSceneAnalysis ?? true)
            .onChange(async (value) => {
                plugin.settings.enableAiSceneAnalysis = value;
                await plugin.saveSettings();
                params.toggleAiSettingsVisibility(value);
                plugin.refreshTimelineIfNeeded(null);
            }));

    const tripletDisplaySetting = new Settings(containerEl)
        .setName('Show previous and next scene analysis')
        .setDesc('When enabled, hover cards include the AI pulse for the previous and next scenes. Turn off to display only the current scene for a more compact view.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showFullTripletAnalysis ?? true)
            .onChange(async (value) => {
                plugin.settings.showFullTripletAnalysis = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));
    params.addAiRelatedElement(tripletDisplaySetting.settingEl);

    // Single model picker
    const modelPickerSetting = new Settings(containerEl)
        .setName('Model')
        .setDesc('Pick preferred model for advanced writing analysis.');

    const controlRow = modelPickerSetting.controlEl.createDiv({ cls: 'rt-model-picker-row' });
    const guidanceEl = controlRow.createDiv({ cls: 'rt-model-guidance' });
    const dropdownContainer = controlRow.createDiv({ cls: 'rt-model-picker-select' });
    const dropdownComponent = new DropdownComponent(dropdownContainer);
    dropdownComponent.selectEl.classList.add('rt-setting-dropdown', 'rt-provider-dropdown');

    {
        type ModelChoice = {
            optionId: string;
            provider: Provider;
            modelId: string;
            label: string;
            guidance: string;
        };
        const providerLabel: Record<Provider, string> = {
            anthropic: 'Anthropic',
            gemini: 'Gemini',
            openai: 'OpenAI',
            local: 'Local / OpenAI Compatible'
        };

        const orderedProviders: AiProvider[] = ['anthropic', 'gemini', 'openai'];
        const choices: ModelChoice[] = orderedProviders.flatMap(provider => {
            const models = CURATED_MODELS[provider] || [];
            return models.map(model => ({
                optionId: `${provider}:${model.id}`,
                provider,
                modelId: model.id,
                label: `${providerLabel[provider]} — ${model.label}`,
                guidance: model.guidance,
            }));
        });

        // Add Local Option
        choices.push({
            optionId: 'local:custom',
            provider: 'local',
            modelId: 'custom',
            label: 'Local / OpenAI Compatible',
            guidance: 'Use a local LLM (like Ollama) or any OpenAI-compatible API. Configure URL and Model ID below.'
        });

        choices.forEach(opt => {
            dropdownComponent.addOption(opt.optionId, opt.label);
        });

        const findDefaultChoice = (): ModelChoice | undefined => {
            const provider = (plugin.settings.defaultAiProvider || 'openai') as Provider;

            if (provider === 'local') {
                return choices.find(c => c.provider === 'local');
            }

            const modelId =
                provider === 'anthropic'
                    ? plugin.settings.anthropicModelId
                    : provider === 'gemini'
                        ? plugin.settings.geminiModelId
                        : plugin.settings.openaiModelId;

            return (
                choices.find(choice => choice.provider === provider && choice.modelId === modelId) ||
                choices.find(choice => choice.provider === provider) ||
                choices[0]
            );
        };

        const updateGuidance = (choice?: ModelChoice) => {
            guidanceEl.empty();
            if (!choice) {
                guidanceEl.setText('Select a model to see guidance on when to use it.');
                return;
            }
            // Link or plain text
            const match = choice.guidance.match(/\[FYI\]\((https?:\/\/[^\s)]+)\)/i);
            const summary = match ? choice.guidance.replace(match[0], '').trim() : choice.guidance;
            const text = document.createElement('span');
            text.textContent = summary;
            guidanceEl.appendChild(text);
            if (match) {
                guidanceEl.appendChild(document.createTextNode(' '));
                const anchor = guidanceEl.createEl('a', { text: 'FYI', href: match[1] });
                anchor.target = '_blank';
                anchor.rel = 'noopener';
            }
        };

        const defaultChoice = findDefaultChoice();
        if (defaultChoice) {
            dropdownComponent.setValue(defaultChoice.optionId);
            updateGuidance(defaultChoice);
        } else {
            updateGuidance();
        }

        dropdownComponent.onChange(async value => {
            const choice = choices.find(c => c.optionId === value);
            if (!choice) return;
            plugin.settings.defaultAiProvider = choice.provider;
            if (choice.provider === 'anthropic') plugin.settings.anthropicModelId = choice.modelId;
            if (choice.provider === 'gemini') plugin.settings.geminiModelId = choice.modelId;
            if (choice.provider === 'openai') plugin.settings.openaiModelId = choice.modelId;
            // Local provider doesn't need to save a specific model ID here as it's custom

            await plugin.saveSettings();
            params.refreshProviderDimming();
            updateGuidance(choice);
        });
    }
    params.addAiRelatedElement(modelPickerSetting.settingEl);

    // Provider sections
    const anthropicSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-anthropic' });
    const geminiSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-gemini' });
    const openaiSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-openai' });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection });
    params.addAiRelatedElement(anthropicSection);
    params.addAiRelatedElement(geminiSection);
    params.addAiRelatedElement(openaiSection);

    // Anthropic API Key
    new Settings(anthropicSection)
        .setName('Anthropic API key')
        .setDesc((() => {
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            span.textContent = 'Your Anthropic API key for using Claude AI features. ';
            const link = document.createElement('a');
            link.href = 'https://platform.claude.com';
            link.textContent = 'Get key';
            link.target = '_blank';
            link.rel = 'noopener';
            frag.appendChild(span);
            frag.appendChild(link);
            return frag;
        })())
        .addText(text => text
            .setPlaceholder('Enter your Anthropic API key')
            .setValue(plugin.settings.anthropicApiKey || '')
            .onChange(async (value) => {
                plugin.settings.anthropicApiKey = value.trim();
                await plugin.saveSettings();
                params.setKeyInputRef('anthropic', text.inputEl);
                params.scheduleKeyValidation('anthropic');
            }));

    // Gemini API Key
    new Settings(geminiSection)
        .setName('Gemini API key')
        .setDesc((() => {
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            span.textContent = 'Your Gemini API key for using Google Gemini models. ';
            const link = document.createElement('a');
            link.href = 'https://aistudio.google.com';
            link.textContent = 'Get key';
            link.target = '_blank';
            link.rel = 'noopener';
            frag.appendChild(span);
            frag.appendChild(link);
            return frag;
        })())
        .addText(text => text
            .setPlaceholder('Enter your Gemini API key')
            .setValue(plugin.settings.geminiApiKey || '')
            .onChange(async (value) => {
                plugin.settings.geminiApiKey = value.trim();
                await plugin.saveSettings();
                params.setKeyInputRef('gemini', text.inputEl);
                params.scheduleKeyValidation('gemini');
            }));

    // OpenAI API Key
    new Settings(openaiSection)
        .setName('OpenAI API key')
        .setDesc((() => {
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            span.textContent = 'Your OpenAI API key for using ChatGPT AI features. ';
            const link = document.createElement('a');
            link.href = 'https://platform.openai.com';
            link.textContent = 'Get key';
            link.target = '_blank';
            link.rel = 'noopener';
            frag.appendChild(span);
            frag.appendChild(link);
            return frag;
        })())
        .addText(text => text
            .setPlaceholder('Enter your API key')
            .setValue(plugin.settings.openaiApiKey || '')
            .onChange(async (value) => {
                plugin.settings.openaiApiKey = value.trim();
                await plugin.saveSettings();
                params.setKeyInputRef('openai', text.inputEl);
                const v = value.trim();
                text.inputEl.removeClass('rt-setting-input-success');
                text.inputEl.removeClass('rt-setting-input-error');
                if (v && !v.startsWith('sk-')) {
                    text.inputEl.addClass('rt-setting-input-error');
                    new Notice('This does not look like an OpenAI secret key. Keys start with "sk-".');
                } else {
                    params.scheduleKeyValidation('openai');
                }
            }));

    const localSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-local' });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection, local: localSection } as any);
    params.addAiRelatedElement(localSection);

    let localModelText: TextComponent | null = null;

    const localBaseUrlSetting = new Settings(localSection)
        .setName('Local LLM Base URL')
        .setDesc('The API endpoint. For Ollama, use "http://localhost:11434/v1". For LM Studio, use "http://localhost:1234/v1".')
        .addText(text => {
            text
                .setPlaceholder('http://localhost:11434/v1')
                .setValue(plugin.settings.localBaseUrl || 'http://localhost:11434/v1')
                .onChange(async (value) => {
                    plugin.settings.localBaseUrl = value.trim();
                    await plugin.saveSettings();
                    params.scheduleKeyValidation('local');
                });
            params.setLocalConnectionInputs({ baseInput: text.inputEl });
        });

    const localWarning = localBaseUrlSetting.descEl.createDiv({ cls: 'rt-setting-note rt-setting-warning' });
    localWarning.style.marginTop = '8px';
    localWarning.createEl('strong', { text: 'Advisory Note:' });
    localWarning.appendText(' Strongly recommend one of the big three online LLM, as they are by far the most intelligent and fully compliant with Radial Timeline’s JSON response formatting requirements. Lightweight consumer GPUs with 16GB RAM generally cannot run the larger local LLMs that have the potential to work. However, I wanted to accomodate several requests for a local LLM.');

    const localModelSetting = new Settings(localSection)
        .setName('Model ID')
        .setDesc('The exact model name your server expects (e.g., "llama3", "mistral-7b", "local-model").')
        .addText(text => {
            localModelText = text;
            text
                .setPlaceholder('llama3')
                .setValue(plugin.settings.localModelId || 'llama3')
                .onChange(async (value) => {
                    plugin.settings.localModelId = value.trim();
                    await plugin.saveSettings();
                    params.scheduleKeyValidation('local');
                });
            params.setLocalConnectionInputs({ modelInput: text.inputEl });
        });

    localModelSetting.addExtraButton(button => {
        button
            .setIcon('refresh-ccw')
            .setTooltip('Detect installed models and auto-fill this field')
            .onClick(async () => {
                const baseUrl = plugin.settings.localBaseUrl?.trim();
                if (!baseUrl) {
                    new Notice('Set the Local LLM Base URL first.');
                    return;
                }
                button.setDisabled(true);
                button.setIcon('loader-2');
                try {
                    const models = await fetchLocalModels(baseUrl, plugin.settings.localApiKey?.trim());
                    if (!Array.isArray(models) || models.length === 0) {
                        new Notice('No models reported by the local server.');
                        return;
                    }
                    const existing = plugin.settings.localModelId?.trim();
                    const chosen = existing && models.some(m => m.id === existing)
                        ? models.find(m => m.id === existing)!
                        : models[0];
                    plugin.settings.localModelId = chosen.id;
                    await plugin.saveSettings();
                    if (localModelText) {
                        localModelText.setValue(chosen.id);
                    }
                    params.scheduleKeyValidation('local');
                    const otherModels = models.map(m => m.id).filter(id => id !== chosen.id);
                    const suffix = otherModels.length ? ` Also found: ${otherModels.join(', ')}.` : '';
                    new Notice(`Using detected model "${chosen.id}".${suffix}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Unable to detect local models: ${message}`);
                } finally {
                    button.setDisabled(false);
                    button.setIcon('refresh-ccw');
                }
            });
    });

    const apiKeySetting = new Settings(localSection)
        .setName('API Key (Optional)')
        .setDesc('Required by some servers. For local tools like Ollama, this is usually ignored.')
        .addText(text => {
            text
                .setPlaceholder('not-needed')
                .setValue(plugin.settings.localApiKey || '')
                .onChange(async (value) => {
                    plugin.settings.localApiKey = value.trim();
                    await plugin.saveSettings();
                    params.scheduleKeyValidation('local');
                });
            params.setKeyInputRef('local', text.inputEl);
        });

    // Apply provider dimming on first render
    params.refreshProviderDimming();

    // Passive validation for present keys
    if (plugin.settings.anthropicApiKey?.trim()) {
        const input = anthropicSection.querySelector('input[type="text"], input[type="password"], input') as HTMLInputElement | undefined;
        params.setKeyInputRef('anthropic', input);
        params.scheduleKeyValidation('anthropic');
    }
    if (plugin.settings.geminiApiKey?.trim()) {
        const input = geminiSection.querySelector('input[type="text"], input[type="password"], input') as HTMLInputElement | undefined;
        params.setKeyInputRef('gemini', input);
        params.scheduleKeyValidation('gemini');
    }
    if (plugin.settings.openaiApiKey?.trim()) {
        const input = openaiSection.querySelector('input[type="text"], input[type="password"], input') as HTMLInputElement | undefined;
        params.setKeyInputRef('openai', input);
        params.scheduleKeyValidation('openai');
    }
    if ((plugin.settings.localBaseUrl?.trim()) && (plugin.settings.localModelId?.trim())) {
        params.scheduleKeyValidation('local');
    }

    // API Logging toggle
    const apiLoggingSetting = new Settings(containerEl)
        .setName('Log AI interactions to file')
        .setDesc('If enabled, create a new note in the "AI" folder for each AI API request/response.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.logApiInteractions)
            .onChange(async (value) => {
                plugin.settings.logApiInteractions = value;
                await plugin.saveSettings();
            }));
    params.addAiRelatedElement(apiLoggingSetting.settingEl);

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
