import {
  App,
  PluginSettingTab,
  Setting as Settings,
  Component,
  MarkdownRenderer,
  Notice,
  TextComponent,
} from 'obsidian';
import ManuscriptTimelinePlugin, { DEFAULT_SETTINGS } from '../main';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchAnthropicModels } from '../api/anthropicApi';

declare const EMBEDDED_README_CONTENT: string;

// Pricing maps (USD per 1M tokens input/output as at 2025-06)
const OPENAI_MODEL_PRICE: Record<string, string> = {
    'gpt-4o': '$5 in / $15 out',
    'gpt-4o-mini': '$1 in / $5 out',
    'gpt-4o-mini-high': '$2 in / $10 out',
    'o3': '$0.50 in / $1.50 out', // placeholder – adjust if OpenAI publishes exact number
    'o4-mini': '$1 in / $5 out',
    'o4-mini-high': '$2 in / $10 out',
    'gpt-4-turbo': '$10 in / $30 out',
    'gpt-4': '$30 in / $60 out',
};

const ANTHROPIC_MODEL_PRICE: Record<string, string> = {
    'claude-4-sonnet': '$3 in / $15 out',
    'claude-4-opus': '$15 in / $75 out',
    'claude-3-7-sonnet-20250219': '$3 in / $15 out',
    'claude-3-5-sonnet-20240620': '$3 in / $15 out',
    'claude-3-opus-20240229': '$15 in / $75 out',
};

export class ManuscriptTimelineSettingsTab extends PluginSettingTab {
    plugin: ManuscriptTimelinePlugin;
    private readmeComponent: Component | null = null; // <<< ADD THIS LINE

    constructor(app: App, plugin: ManuscriptTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Add color swatch creation function
    private createColorSwatch(container: HTMLElement, color: string): HTMLElement {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
        swatch.style.setProperty('--swatch-color', color);
            
            container.appendChild(swatch);
            return swatch;
    }

    // Add color picker function with centered dialog
    private async showColorPicker(currentColor: string): Promise<string | null> {
        return new Promise((resolve) => {
            // Create a modal container
            const modal = document.createElement('div');
            modal.className = 'color-picker-modal';

            // Create the color picker container
            const pickerContainer = document.createElement('div');
            pickerContainer.className = 'color-picker-container';

            // Create the color picker input
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = currentColor;
            colorPicker.className = 'color-picker-input';

            // Create hex input
            const hexInput = document.createElement('input');
            hexInput.type = 'text';
            hexInput.value = currentColor;
            hexInput.className = 'color-picker-text-input';

            // Create RGB input
            const rgbInput = document.createElement('input');
            rgbInput.type = 'text';
            rgbInput.value = this.hexToRgb(currentColor);
            rgbInput.className = 'color-picker-text-input';

            // Create buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'color-picker-buttons';

            // Create OK button
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'color-picker-button ok';

            // Create Cancel button
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'color-picker-button cancel';

            // Add drag functionality
            let isDragging = false;
            let currentX: number;
            let currentY: number;
            let initialX: number;
            let initialY: number;
            let xOffset = 0;
            let yOffset = 0;

            pickerContainer.addEventListener('mousedown', (e) => {
                isDragging = true;
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    xOffset = currentX;
                    yOffset = currentY;
                    pickerContainer.style.transform = `translate(${currentX}px, ${currentY}px)`;
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });

            // Update hex and RGB values when color changes
            colorPicker.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                hexInput.value = newColor;
                rgbInput.value = this.hexToRgb(newColor);
            });

            // Update color picker when hex input changes
            hexInput.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                if (this.isValidHex(newColor)) {
                    colorPicker.value = newColor;
                    rgbInput.value = this.hexToRgb(newColor);
                }
            });

            // Update color picker when RGB input changes
            rgbInput.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                const hex = this.rgbToHex(newColor);
                if (hex) {
                    colorPicker.value = hex;
                    hexInput.value = hex;
                }
            });

            // Add buttons to container
            buttonsContainer.appendChild(cancelButton);
            buttonsContainer.appendChild(okButton);

            // Add all elements to the picker container
            pickerContainer.appendChild(colorPicker);
            pickerContainer.appendChild(hexInput);
            pickerContainer.appendChild(rgbInput);
            pickerContainer.appendChild(buttonsContainer);

            // Add the picker container to the modal
            modal.appendChild(pickerContainer);

            // Add the modal to the document body
            document.body.appendChild(modal);

            // OK button event
            okButton.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(colorPicker.value);
            });

            // Cancel button event
            cancelButton.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(null);
            });

            // Close if clicking outside the picker
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(null);
                }
            });
        });
    }

    // Helper function to convert hex to RGB
    private hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})`;
        }
        return '';
    }

    // Helper function to convert RGB to hex
    private rgbToHex(rgb: string): string | null {
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        return null;
    }

    // Helper function to validate hex color
    private isValidHex(hex: string): boolean {
        return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();



        // --- Source Path --- 
        new Settings(containerEl)
            .setName('Source path')
            .setDesc('Specify the root folder containing your manuscript scene files.')
            .addText(text => text
                .setPlaceholder('Example: Manuscript/Scenes')
                .setValue(this.plugin.settings.sourcePath)
                .onChange(async (value) => {
                    this.plugin.settings.sourcePath = value;
                    await this.plugin.saveSettings();
                }));

        // --- Target Completion Date --- 
        new Settings(containerEl)
            .setName('Target completion date')
            .setDesc('Optional: Set a target date for project completion (YYYY-MM-DD). This will be shown on the timeline.')
            .addText(text => {
                text.inputEl.type = 'date'; // Use HTML5 date input
                text.setValue(this.plugin.settings.targetCompletionDate || '')
                    .onChange(async (value) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (!value) {
                            this.plugin.settings.targetCompletionDate = undefined;
                            text.inputEl.removeClass('setting-input-error');
                            await this.plugin.saveSettings();
                            return;
                        }

                        const selectedDate = new Date(value + 'T00:00:00');
                        if (selectedDate > today) {
                            this.plugin.settings.targetCompletionDate = value;
                            text.inputEl.removeClass('setting-input-error');
            } else {
                            new Notice('Target date must be in the future.');
                            text.setValue(this.plugin.settings.targetCompletionDate || '');
                            return;
                        }
                        await this.plugin.saveSettings();
                    });
            });

        // --- AI Settings for Beats Analysis ---
        containerEl.createEl('h2', { text: 'AI settings for beats analysis'});
        

        // --- Default AI Provider Setting ---
        new Settings(containerEl)
        .setName('Default AI provider')
        .setDesc('Select the default AI provider to use for AI features like Beat Analysis.')
        .addDropdown(dropdown => dropdown
            .addOption('openai', 'OpenAI (ChatGPT)')
            .addOption('anthropic', 'Anthropic (Claude)')
            .setValue(this.plugin.settings.defaultAiProvider || 'openai')
            .onChange(async (value) => {
                this.plugin.settings.defaultAiProvider = value as 'openai' | 'anthropic';
                await this.plugin.saveSettings();
            }));

        // --- OpenAI ChatGPT SECTION ---
        containerEl.createEl('h2', { text: 'OpenAI ChatGPT settings'});


        // --- OpenAI API Key Setting ---
        const openaiSetting = new Settings(containerEl)
            .setName('OpenAI API key')
            .setDesc('Your OpenAI API key for using ChatGPT AI features.')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));
                

        // --- OpenAI Model Selection ---
        const modelSetting = new Settings(containerEl)
            .setName('OpenAI model')
            .setDesc('Top GPT-4 family models (live list; prices are for 1M tokens)')
            .addDropdown((dropdown) => {
                // Placeholder while fetching
                dropdown.addOption('', 'Loading…');
                dropdown.setDisabled(true);

                const populate = async () => {
                    try {
                        const apiKey = this.plugin.settings.openaiApiKey;
                        if (!apiKey) throw new Error('API key not set');
                        const models = await fetchOpenAiModels(apiKey);
                        // Priority order reflecting ChatGPT UI offerings
                        const preferredOrder = [
                            'gpt-4o',
                            'gpt-4o-mini',
                            'gpt-4o-mini-high',
                            'o3',
                            'o4-mini',
                            'o4-mini-high',
                            'gpt-4-turbo',
                            'gpt-4'
                        ];
                        const top: typeof models = [];
                        preferredOrder.forEach(id=>{
                            const found = models.find(m=>m.id===id);
                            if (found && top.length<4) top.push(found);
                        });
                        if (top.length === 0) {
                            // fallback: generic gpt-4* models
                            top.push(...models.filter(m=>m.id.startsWith('gpt-4')).slice(0,4));
                        }

                        while (dropdown.selectEl.firstChild) {
                            dropdown.selectEl.removeChild(dropdown.selectEl.firstChild);
                        }

                        top.forEach(m => {
                            const label = `${m.id.replace(/:/g,' ')} (${OPENAI_MODEL_PRICE[m.id] || 'price N/A'})`;
                            dropdown.addOption(m.id, label);
                        });
                        dropdown.setDisabled(false);
                        dropdown.setValue(this.plugin.settings.openaiModelId || top[0]?.id || '');
                    } catch (err) {
                        while (dropdown.selectEl.firstChild) {
                            dropdown.selectEl.removeChild(dropdown.selectEl.firstChild);
                        }
                        ['gpt-4o','gpt-4o-mini','gpt-4o-mini-high','o3','o4-mini','o4-mini-high'].slice(0,4).forEach(id=>{
                            const label = `${id} (${OPENAI_MODEL_PRICE[id]})`;
                            dropdown.addOption(id, label);
                        });
                        dropdown.setDisabled(false);
                        dropdown.setValue(this.plugin.settings.openaiModelId || 'gpt-4o');
                    }
                };
                populate();

                dropdown.onChange(async (value) => {
                    this.plugin.settings.openaiModelId = value;
                    await this.plugin.saveSettings();
                });
            });

        // --- Anthropic Claude SECTION ---
        containerEl.createEl('h2', { text: 'Anthropic Claude settings'});

        
        // --- Anthropic API Key Setting ---
        const anthropicSetting = new Settings(containerEl)
            .setName('Anthropic API key')
            .setDesc('Your Anthropic API key for using Claude AI features.')
            .addText(text => text
                .setPlaceholder('Enter your Anthropic API key')
                .setValue(this.plugin.settings.anthropicApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.anthropicApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));

        // --- Anthropic Model Selection ---
        new Settings(containerEl)
            .setName('Anthropic model')
            .setDesc('Top Claude 4 models (live list; prices per 1M tokens)')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Loading…');
                dropdown.setDisabled(true);

                const populate = async () => {
                    try {
                        const apiKey = this.plugin.settings.anthropicApiKey;
                        if (!apiKey) throw new Error('API key not set');
                        const models = await fetchAnthropicModels(apiKey);
                        // Prefer Claude-4 family; fallback to Claude-3
                        let picks = models.filter(m => m.name.startsWith('claude-4'));
                        if (picks.length === 0) picks = models.filter(m => m.name.startsWith('claude-3'));
                        picks = picks.slice(0,3);

                        while (dropdown.selectEl.firstChild) {
                            dropdown.selectEl.removeChild(dropdown.selectEl.firstChild);
                        }

                        picks.forEach(m=>{
                            const label = `${m.name} (${ANTHROPIC_MODEL_PRICE[m.name] || 'price N/A'})`;
                            dropdown.addOption(m.name, label);
                        });
                        dropdown.setDisabled(false);
                        dropdown.setValue(this.plugin.settings.anthropicModelId || picks[0]?.name || '');
                    } catch(err) {
                        const fallback = ['claude-4-sonnet','claude-4-opus','claude-3-7-sonnet-20250219'];
                        while (dropdown.selectEl.firstChild) {
                            dropdown.selectEl.removeChild(dropdown.selectEl.firstChild);
                        }
                        fallback.forEach(id=>{
                            const label = `${id} (${ANTHROPIC_MODEL_PRICE[id] || 'price N/A'})`;
                            dropdown.addOption(id,label);
                        });
                    }
                };
                populate();

                dropdown.onChange(async (value) => {
                    this.plugin.settings.anthropicModelId = value;
                    await this.plugin.saveSettings();
                });
            });

        // <<< ADD THIS Setting block for API Logging Toggle >>>
        new Settings(containerEl)
            .setName('Log AI interactions to file')
            .setDesc('If enabled, create a new note in the "AI" folder for each OpenAI API request/response.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.logApiInteractions)
                .onChange(async (value) => {
                    this.plugin.settings.logApiInteractions = value;
                    await this.plugin.saveSettings();
                }));
        // <<< END of added Setting block >>>

        // --- Debug Mode Setting ---
        new Settings(containerEl)
            .setName('Debug mode')
            .setDesc('Enable debug logging to the console for troubleshooting.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debug)
                .onChange(async (value) => {
                    this.plugin.settings.debug = value;
                    await this.plugin.saveSettings();
                }));

        // --- Publishing Stage Colors --- 
        containerEl.createEl('h2', { text: 'Publishing stage colors'}); // <<< CHANGED to H3, REMOVED CLASS

        Object.entries(this.plugin.settings.publishStageColors).forEach(([stage, color]) => {
            let textInputRef: TextComponent | undefined;
            const setting = new Settings(containerEl)
                .setName(stage)
                .addText(textInput => {
                    textInputRef = textInput;
                    textInput.setValue(color)
                        .onChange(async (value) => {
                            if (this.isValidHex(value)) {
                                (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                                await this.plugin.saveSettings();
                                const swatch = setting.controlEl.querySelector('.color-swatch') as HTMLElement;
                                if (swatch) {
                                    swatch.style.setProperty('--swatch-color', value);
                                }
                            } // Consider adding feedback for invalid hex
                        });
                })
                .addExtraButton(button => {
                    button.setIcon('reset')
                        .setTooltip('Reset to default')
                        .onClick(async () => {
                            const defaultColor = DEFAULT_SETTINGS.publishStageColors[stage as keyof typeof DEFAULT_SETTINGS.publishStageColors];
                            (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = defaultColor;
                            await this.plugin.saveSettings();
                            textInputRef?.setValue(defaultColor);
                            const swatch = setting.controlEl.querySelector('.color-swatch') as HTMLElement;
                            if (swatch) {
                                swatch.style.setProperty('--swatch-color', defaultColor);
                            }
                        });
                });

            // Add color swatch inside the control element for better alignment
            this.createColorSwatch(setting.controlEl, color);
        });
                    
        // --- Embedded README Section ---
        containerEl.createEl('hr', { cls: 'settings-separator' });
        const readmeContainer = containerEl.createDiv({ cls: 'manuscript-readme-container' });
        const readmeMarkdown = typeof EMBEDDED_README_CONTENT !== 'undefined'
            ? EMBEDDED_README_CONTENT
            : 'README content could not be loaded. Please ensure the plugin was built correctly or view the README.md file directly.';
           
        // Create a new component instance specifically for this rendering
        this.readmeComponent = new Component(); 


        // Use the managed component for the renderer
        // Note: Switching back to MarkdownRenderer.render as renderMarkdown was part of the error path
        MarkdownRenderer.render( // <<< Using render, not renderMarkdown
            this.app,           // <<< Pass app instance
            readmeMarkdown,
            readmeContainer, // Render directly into the container created above
            this.plugin.manifest.dir ?? '', 
            this.readmeComponent // Pass the managed component instance
        );
    }

    hide() {
        // Clean up the component when the tab is hidden/closed
        if (this.readmeComponent) {
            this.readmeComponent.unload(); // <<< CALL unload() on the component itself
            this.readmeComponent = null;
        }
        // If PluginSettingTab has a base hide method you need to call, uncomment below
        // super.hide(); 
    }

}