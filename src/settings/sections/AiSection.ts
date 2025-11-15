import { Setting as Settings, Notice } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels } from '../../api/geminiApi';

type Provider = 'anthropic' | 'gemini' | 'openai';

export function renderAiSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    addAiRelatedElement: (el: HTMLElement) => void;
    toggleAiSettingsVisibility: (show: boolean) => void;
    refreshProviderDimming: () => void;
    scheduleKeyValidation: (provider: Provider) => void;
    setProviderSections: (sections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement }) => void;
    setKeyInputRef: (provider: Provider, input: HTMLInputElement | undefined) => void;
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

    // Single model picker
    const modelPickerSetting = new Settings(containerEl)
        .setName('Model')
        .setDesc('Pick preferred model for advanced writing analysis.')
        .addDropdown(dropdown => {
            type ModelChoice = { id: string; label: string; provider: Provider; model: string };
            const choices: ModelChoice[] = [
                { id: 'anthropic:claude-sonnet-4-5', label: 'Anthropic — Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
                { id: 'anthropic:claude-sonnet-4', label: 'Anthropic — Sonnet 4', provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
                { id: 'anthropic:claude-opus-4-1', label: 'Anthropic — Opus 4.1', provider: 'anthropic', model: 'claude-opus-4-1-20250805' },
                { id: 'gemini:gemini-2.5-pro', label: 'Gemini — Gemini 2.5 Pro', provider: 'gemini', model: 'gemini-2.5-pro' },
                { id: 'openai:gpt-4.1', label: 'OpenAI — GPT‑4.1', provider: 'openai', model: 'gpt-4.1' },
            ];
            choices.forEach(opt => dropdown.addOption(opt.id, opt.label));

            const currentProvider = (plugin.settings.defaultAiProvider || 'openai') as Provider;
            let currentId: string | undefined;
            if (currentProvider === 'anthropic') {
                const id = plugin.settings.anthropicModelId;
                currentId = choices.find(c => c.provider === 'anthropic' && c.model === id)?.id || 'anthropic:claude-sonnet-4';
            } else if (currentProvider === 'gemini') {
                const id = plugin.settings.geminiModelId;
                currentId = choices.find(c => c.provider === 'gemini' && c.model === id)?.id || 'gemini:gemini-2.5-pro';
            } else {
                const id = plugin.settings.openaiModelId;
                currentId = choices.find(c => c.provider === 'openai' && c.model === id)?.id || 'openai:gpt-4.1';
            }
            dropdown.setValue(currentId);

            dropdown.onChange(async value => {
                const choice = choices.find(c => c.id === value);
                if (!choice) return;
                plugin.settings.defaultAiProvider = choice.provider;
                if (choice.provider === 'anthropic') plugin.settings.anthropicModelId = choice.model;
                if (choice.provider === 'gemini') plugin.settings.geminiModelId = choice.model;
                if (choice.provider === 'openai') plugin.settings.openaiModelId = choice.model;
                await plugin.saveSettings();
                params.refreshProviderDimming();
            });
            (dropdown as any).selectEl?.classList.add('rt-setting-dropdown', 'rt-provider-dropdown');
        });
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
            span.textContent = 'Your OpenAI API key for using ChatGPT AI features.';
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

