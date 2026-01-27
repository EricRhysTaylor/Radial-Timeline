import { Setting as Settings, Notice, DropdownComponent } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels } from '../../api/geminiApi';
import { fetchLocalModels } from '../../api/localAiApi';
import { CURATED_MODELS, CuratedModel, AiProvider } from '../../data/aiModels';
import { AiContextModal } from '../AiContextModal';
import { resolveAiLogFolder, countAiLogFiles } from '../../ai/log';
import { addHeadingIcon, addWikiLink } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';

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
    const aiHeading = new Settings(containerEl)
        .setName('AI LLM for scene analysis')
        .setHeading();
    addHeadingIcon(aiHeading, 'cpu');
    addWikiLink(aiHeading, 'Settings#ai');

    const getActiveTemplateName = (): string => {
        const templates = plugin.settings.aiContextTemplates || [];
        const activeId = plugin.settings.activeAiContextTemplateId;
        const active = templates.find(t => t.id === activeId);
        return active?.name || 'Generic Editor';
    };

    const contextTemplateSetting = new Settings(containerEl)
        .setName('AI prompt role & context template')
        .setDesc(`Active: ${getActiveTemplateName()}`)
        .addExtraButton(button => button
            .setIcon('gear')
            .setTooltip('Manage context templates for AI prompt generation and Gossamer score generation')
            .onClick(() => {
                const modal = new AiContextModal(app, plugin, () => {
                    contextTemplateSetting.setDesc(`Active: ${getActiveTemplateName()}`);
                });
                modal.open();
            }));

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
        .setDesc('When enabled, scene hover metadata include the AI pulse for the previous and next scenes. Turn off to display only the current scene for a more compact view.')
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
        .setDesc('Pick preferred model for advanced writing analysis. Models marked "Latest" auto-update to the newest version.');
    modelPickerSetting.settingEl.addClass(ERT_CLASSES.ELEMENT_BLOCK);
    modelPickerSetting.settingEl.classList.remove(ERT_CLASSES.ROW_WIDE_CONTROL);

    const infoEl = modelPickerSetting.settingEl.querySelector('.setting-item-info');
    const guidanceEl = infoEl?.createDiv({ cls: 'ert-model-guidance' }) ??
        modelPickerSetting.settingEl.createDiv({ cls: 'ert-model-guidance' });
    const dropdownContainer = modelPickerSetting.controlEl.createDiv({ cls: 'ert-model-picker-select' });
    const dropdownComponent = new DropdownComponent(dropdownContainer);
    dropdownComponent.selectEl.classList.add('ert-setting-dropdown', 'ert-setting-dropdown--wide');

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
    const anthropicSection = containerEl.createDiv({ cls: 'ert-provider-section ert-provider-anthropic' });
    const geminiSection = containerEl.createDiv({ cls: 'ert-provider-section ert-provider-gemini' });
    const openaiSection = containerEl.createDiv({ cls: 'ert-provider-section ert-provider-openai' });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection });
    params.addAiRelatedElement(anthropicSection);
    params.addAiRelatedElement(geminiSection);
    params.addAiRelatedElement(openaiSection);

    // Helper to support SecretComponent if available (Obsidian 1.11.4+)
    const addApiKeyInput = (
        setting: Settings,
        placeholder: string,
        value: string,
        save: (val: string) => Promise<void>,
        validate: () => void,
        setRef: (el: HTMLInputElement) => void,
        extraCheck?: (val: string, el: HTMLElement) => boolean
    ) => {
        const configure = (component: TextComponent) => {
            component.inputEl.addClass('ert-input--full');
            component.setPlaceholder(placeholder).setValue(value);
            
            component.onChange(() => {
                component.inputEl.removeClass('ert-setting-input-success');
                component.inputEl.removeClass('ert-setting-input-error');
            });
            
            plugin.registerDomEvent(component.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    component.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const trimmed = component.getValue().trim();
                await save(trimmed);
                setRef(component.inputEl);
                
                let valid = true;
                if (extraCheck) {
                    valid = extraCheck(trimmed, component.inputEl);
                }
                
                if (valid && trimmed) {
                    validate();
                }
            };
            
            plugin.registerDomEvent(component.inputEl, 'blur', () => { void handleBlur(); });
        };

        if ((app as any).SecretComponent) {
            const SecretComponent = (app as any).SecretComponent;
            const sc = new SecretComponent(setting.controlEl);
            configure(sc);
        } else {
            setting.addText(text => configure(text));
        }
        setting.settingEl.addClass('ert-setting-full-width-input');
    };

    // Anthropic API Key
    const anthropicKeySetting = new Settings(anthropicSection)
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
        })());
    
    addApiKeyInput(
        anthropicKeySetting,
        'Enter your Anthropic API key',
        plugin.settings.anthropicApiKey || '',
        async (val) => { plugin.settings.anthropicApiKey = val; await plugin.saveSettings(); },
        () => params.scheduleKeyValidation('anthropic'),
        (el) => params.setKeyInputRef('anthropic', el)
    );

    // Gemini API Key
    const geminiKeySetting = new Settings(geminiSection)
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
        })());

    addApiKeyInput(
        geminiKeySetting,
        'Enter your Gemini API key',
        plugin.settings.geminiApiKey || '',
        async (val) => { plugin.settings.geminiApiKey = val; await plugin.saveSettings(); },
        () => params.scheduleKeyValidation('gemini'),
        (el) => params.setKeyInputRef('gemini', el)
    );

    // OpenAI API Key
    const openAiKeySetting = new Settings(openaiSection)
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
        })());

    addApiKeyInput(
        openAiKeySetting,
        'Enter your API key',
        plugin.settings.openaiApiKey || '',
        async (val) => { plugin.settings.openaiApiKey = val; await plugin.saveSettings(); },
        () => params.scheduleKeyValidation('openai'),
        (el) => params.setKeyInputRef('openai', el),
        (val, el) => {
            el.removeClass('ert-setting-input-success');
            el.removeClass('ert-setting-input-error');
            // Only validate sk- prefix if NOT using SecretStorage (or strict legacy mode)
            if (!(app as any).SecretComponent && val && !val.startsWith('sk-')) {
                el.addClass('ert-setting-input-error');
                new Notice('This does not look like an OpenAI secret key. Keys start with "sk-".');
                return false;
            }
            return true;
        }
    );

    const localSection = containerEl.createDiv({ cls: 'ert-provider-section ert-provider-local' });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection, local: localSection } as any);
    params.addAiRelatedElement(localSection);

    let localModelText: TextComponent | null = null;

    const localBaseUrlSetting = new Settings(localSection)
        .setName('Local LLM Base URL')
        .setDesc('The API endpoint. For Ollama, use "http://localhost:11434/v1". For LM Studio, use "http://localhost:1234/v1".')
        .addText(text => {
            text.inputEl.addClass('ert-input--full');
            text
                .setPlaceholder('http://localhost:11434/v1')
                .setValue(plugin.settings.localBaseUrl || 'http://localhost:11434/v1');
            text.onChange(() => {
                text.inputEl.removeClass('ert-setting-input-success');
                text.inputEl.removeClass('ert-setting-input-error');
            });
            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
            const handleBlur = async () => {
                plugin.settings.localBaseUrl = text.getValue().trim();
                await plugin.saveSettings();
                params.scheduleKeyValidation('local');
            };
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
            params.setLocalConnectionInputs({ baseInput: text.inputEl });
        });
    localBaseUrlSetting.settingEl.addClass('ert-setting-full-width-input');

    // Advisory note as separate section
    const localWarningSection = localSection.createDiv({ cls: 'ert-local-llm-advisory' });
    localWarningSection.createEl('strong', { text: 'Advisory Note', cls: 'ert-local-llm-advisory-title' });
    const aiLogFolder = resolveAiLogFolder();
    localWarningSection.createSpan({
        text: `By default, no LLM pulses are written to the scene when local transformer is used. Rather it is stored in an AI log file in the local logs output folder (${aiLogFolder}), as the response does not follow directions and breaks the scene hover formatting. You may still write scene hover metadata with local LLM by toggling off the setting "Bypass scene hover metadata yaml writes" below.`
    });

    const localModelSetting = new Settings(localSection)
        .setName('Model ID')
        .setDesc('The exact model name your server expects (e.g., "llama3", "mistral-7b", "local-model").')
        .addText(text => {
            text.inputEl.addClass('ert-input--lg');
            localModelText = text;
            text
                .setPlaceholder('llama3')
                .setValue(plugin.settings.localModelId || 'llama3');
            text.onChange(() => {
                text.inputEl.removeClass('ert-setting-input-success');
                text.inputEl.removeClass('ert-setting-input-error');
            });
            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
            const handleBlur = async () => {
                plugin.settings.localModelId = text.getValue().trim();
                await plugin.saveSettings();
                params.scheduleKeyValidation('local');
            };
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
            params.setLocalConnectionInputs({ modelInput: text.inputEl });
        });

    localModelSetting.addExtraButton(button => {
        button
            .setIcon('refresh-ccw')
            .setTooltip('Detect installed models and auto-fill this field')
            .onClick(async () => {
                const selectedProvider = (plugin.settings.defaultAiProvider || 'openai') as Provider;
                if (selectedProvider !== 'local') {
                    new Notice('Select "Local / OpenAI Compatible" above to detect models.');
                    return;
                }
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

    const customInstructionsSetting = new Settings(localSection)
        .setName('Custom Instructions')
        .setDesc('Additional instructions added to the start of the prompt. Useful for fine-tuning local model behavior.')
        .addTextArea(text => {
            text
                .setPlaceholder('e.g. Maintain strict JSON formatting...')
                .setValue(plugin.settings.localLlmInstructions || '')
                .onChange(async (value) => {
                    plugin.settings.localLlmInstructions = value;
                    await plugin.saveSettings();
                });
            text.inputEl.rows = 4;
        });
    customInstructionsSetting.settingEl.addClass('ert-setting-full-width-input');

    new Settings(localSection)
        .setName('Bypass scene hover metadata yaml writes')
        .setDesc('Default is enabled. Local LLM triplet pulse analysis skips writing to the scene note and saves the results in the AI log report instead. Recommended for local models.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.localSendPulseToAiReport ?? true)
            .onChange(async (value) => {
                plugin.settings.localSendPulseToAiReport = value;
                await plugin.saveSettings();
            }));

    const apiKeySetting = new Settings(localSection)
        .setName('API Key (Optional)')
        .setDesc('Required by some servers. For local tools like Ollama, this is usually ignored.')
    
    addApiKeyInput(
        apiKeySetting,
        'not-needed',
        plugin.settings.localApiKey || '',
        async (val) => { plugin.settings.localApiKey = val; await plugin.saveSettings(); },
        () => params.scheduleKeyValidation('local'),
        (el) => params.setKeyInputRef('local', el)
    );

    // Apply provider dimming on first render
    params.refreshProviderDimming();

    // API Logging toggle with dynamic file count
    const outputFolder = resolveAiLogFolder();
    const formatLogCount = (fileCount: number | null): string => {
        if (fileCount === null) return 'Counting log files...';
        return fileCount === 0
            ? 'No log files yet'
            : fileCount === 1
                ? '1 log file'
                : `${fileCount} log files`;
    };
    const getLoggingDesc = (fileCount: number | null): string => {
        const countText = formatLogCount(fileCount);
        return `When enabled, writes logs for Inquiry, Pulse, and Gossamer runs. Logs are stored in "${outputFolder}" (${countText}).`;
    };

    const apiLoggingSetting = new Settings(containerEl)
        .setName('Enable AI logs')
        .setDesc(getLoggingDesc(null))
        .addToggle(toggle => toggle
            .setValue(plugin.settings.logApiInteractions)
            .onChange(async (value) => {
                plugin.settings.logApiInteractions = value;
                await plugin.saveSettings();
            }));
    params.addAiRelatedElement(apiLoggingSetting.settingEl);

    const scheduleLogCount = () => {
        const runCount = () => {
            const fileCount = countAiLogFiles(plugin);
            apiLoggingSetting.setDesc(getLoggingDesc(fileCount));
        };
        const requestIdleCallback = (window as Window & {
            requestIdleCallback?: (cb: () => void) => void;
        }).requestIdleCallback;
        if (requestIdleCallback) {
            requestIdleCallback(runCount);
        } else {
            window.setTimeout(runCount, 0);
        }
    };
    scheduleLogCount();

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
