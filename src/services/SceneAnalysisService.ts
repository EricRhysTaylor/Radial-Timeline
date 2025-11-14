/*
 * SceneAnalysisService
 * Handles registration and UI flow for AI scene analysis commands.
 */

import { App, Modal, Notice, ButtonComponent, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { normalizeBooleanValue } from '../utils/sceneHelpers';

export class SceneAnalysisService {
    constructor(private plugin: RadialTimelinePlugin) {}

    registerCommands(): void {
        this.registerManuscriptCommand();
        this.registerSubplotCommand();
    }

    private registerManuscriptCommand(): void {
        this.plugin.addCommand({
            id: 'update-beats-manuscript-order',
            name: 'Scene Analysis (manuscript order)',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    if (!this.ensureApiKey()) return;
                    try {
                        await this.plugin.processSceneAnalysisByManuscriptOrder();
                    } catch (error) {
                        console.error('Error running manuscript order beat update:', error);
                        new Notice('Error during manuscript order update.');
                    }
                })();
                return true;
            }
        });
    }

    private registerSubplotCommand(): void {
        this.plugin.addCommand({
            id: 'update-beats-choose-subplot',
            name: 'Scene Analysis (subplot order)',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    if (!this.ensureApiKey()) return;
                    new SubplotPickerModal(this.plugin.app, this.plugin, this).open();
                })();
                return true;
            }
        });
    }

    private ensureApiKey(): boolean {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        let hasKey = true;
        if (provider === 'anthropic') hasKey = !!this.plugin.settings.anthropicApiKey?.trim();
        else if (provider === 'gemini') hasKey = !!this.plugin.settings.geminiApiKey?.trim();
        else hasKey = !!this.plugin.settings.openaiApiKey?.trim();
        if (!hasKey) {
            const name = provider[0].toUpperCase() + provider.slice(1);
            new Notice(`${name} API key is not set in settings.`);
            return false;
        }
        return true;
    }

    async countProcessableScenes(subplotName?: string): Promise<{ flagged: number; processable: number; total: number }> {
        const allScenes = await this.plugin.getSceneData();
        if (subplotName) {
            const filtered = allScenes.filter(scene => {
                const subplots = scene.subplot
                    ? (Array.isArray(scene.subplot) ? scene.subplot : [scene.subplot])
                    : [];
                return subplots.includes(subplotName);
            });
            const validScenes = filtered.filter(scene => {
                const statusValue = Array.isArray(scene.status) ? scene.status[0] : scene.status;
                return (statusValue === 'Working' || statusValue === 'Complete') && normalizeBooleanValue(scene['Beats Update']);
            });
            const processableScenes = filtered.filter(scene => {
                const statusValue = Array.isArray(scene.status) ? scene.status[0] : scene.status;
                return statusValue === 'Working' || statusValue === 'Complete';
            });
            return {
                flagged: validScenes.length,
                processable: processableScenes.length,
                total: filtered.length
            };
        }

        const processableScenes = allScenes.filter(scene => {
            const statusValue = Array.isArray(scene.status) ? scene.status[0] : scene.status;
            return statusValue === 'Working' || statusValue === 'Complete';
        });
        const flaggedCount = processableScenes.filter(scene => normalizeBooleanValue(scene['Beats Update'])).length;
        return {
            flagged: flaggedCount,
            processable: processableScenes.length,
            total: allScenes.length
        };
    }

    getActiveModelName(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        if (provider === 'anthropic') {
            const modelId = this.plugin.settings.anthropicModelId || 'claude-sonnet-4-20250514';
            if (modelId.includes('sonnet-4-5') || modelId.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
            if (modelId.includes('opus-4-1') || modelId.includes('opus-4.1')) return 'Claude Opus 4.1';
            if (modelId.includes('opus-4')) return 'Claude Opus 4';
            if (modelId.includes('sonnet-4')) return 'Claude Sonnet 4';
            return modelId;
        }
        if (provider === 'gemini') {
            const modelId = this.plugin.settings.geminiModelId || 'gemini-2.5-pro';
            if (modelId.includes('2.5-pro') || modelId.includes('2-5-pro')) return 'Gemini 2.5 Pro';
            if (modelId.includes('2.0-pro') || modelId.includes('2-0-pro')) return 'Gemini 2.0 Pro';
            return modelId;
        }
        const modelId = this.plugin.settings.openaiModelId || 'gpt-4o';
        if (modelId.includes('4.1') || modelId.includes('4-1')) return 'GPT-4.1';
        if (modelId.includes('4o')) return 'GPT-4o';
        if (modelId.includes('o1')) return 'GPT-o1';
        return modelId;
    }

    async processByManuscriptOrder(): Promise<void> {
        const { processByManuscriptOrder } = await import('../SceneAnalysisCommands');
        await processByManuscriptOrder(this.plugin, this.plugin.app.vault);
    }

    async processBySubplotName(subplotName: string): Promise<void> {
        const { processBySubplotNameWithModal } = await import('../SceneAnalysisCommands');
        await processBySubplotNameWithModal(this.plugin, this.plugin.app.vault, subplotName);
    }

    async processEntireSubplot(subplotName: string): Promise<void> {
        const { processEntireSubplotWithModal } = await import('../SceneAnalysisCommands');
        await processEntireSubplotWithModal(this.plugin, this.plugin.app.vault, subplotName);
    }
}

class SubplotPickerModal extends Modal {
    private choices: string[] = [];
    private selectedSubplot = '';
    private statsEl: HTMLElement | null = null;
    private dropdown: DropdownComponent | null = null;
    private buttonRow: HTMLElement | null = null;

    constructor(
        app: App,
        private plugin: RadialTimelinePlugin,
        private service: SceneAnalysisService
    ) {
        super(app);
    }

    async onOpen(): Promise<void> {
        const { contentEl, titleEl } = this;
        titleEl.setText('Select subplot for beats processing');
        const modelName = this.service.getActiveModelName();
        const infoEl = contentEl.createDiv({ cls: 'rt-subplot-picker-info' });
        infoEl.createEl('p', { text: `Process beats using ${modelName}` });

        const selectContainer = contentEl.createDiv({ cls: 'rt-subplot-picker-select' });
        selectContainer.createEl('label', { text: 'Select subplot:', cls: 'rt-subplot-picker-label' });
        this.dropdown = new DropdownComponent(selectContainer);
        this.dropdown.addOption('', 'Loading subplots...');
        this.dropdown.setDisabled(true);

        this.statsEl = contentEl.createDiv({ cls: 'rt-subplot-picker-stats' });
        this.statsEl.setText('Loading...');

        this.buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        const processButton = new ButtonComponent(this.buttonRow)
            .setButtonText('Process beats')
            .setCta()
            .setDisabled(true)
            .onClick(async () => {
                this.close();
                await this.plugin.processSceneAnalysisBySubplotName(this.selectedSubplot);
            });

        const processEntireButton = new ButtonComponent(this.buttonRow)
            .setButtonText('Process entire subplot')
            .setCta()
            .setDisabled(true)
            .onClick(async () => {
                this.close();
                await this.plugin.processEntireSubplot(this.selectedSubplot);
            });

        const purgeButton = new ButtonComponent(this.buttonRow)
            .setButtonText('Purge all beats')
            .setWarning()
            .setDisabled(true)
            .onClick(async () => {
                try {
                    const { purgeBeatsBySubplotName } = await import('../SceneAnalysisCommands');
                    this.close();
                    await purgeBeatsBySubplotName(this.plugin, this.plugin.app.vault, this.selectedSubplot);
                } catch (error) {
                    new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            });

        new ButtonComponent(this.buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        try {
            const { getDistinctSubplotNames } = await import('../SceneAnalysisCommands');
            const names = await getDistinctSubplotNames(this.plugin, this.plugin.app.vault);
            if (names.length === 0) {
                new Notice('No subplots found.');
                this.close();
                return;
            }
            this.choices = names;
            this.selectedSubplot = names[0];

            if (this.dropdown) {
                this.dropdown.selectEl.empty();
                names.forEach((name, index) => {
                    this.dropdown?.addOption(name, `${index + 1}. ${name}`);
                });
                this.dropdown.setValue(this.selectedSubplot);
                this.dropdown.setDisabled(false);
                this.dropdown.onChange(async (value) => {
                    this.selectedSubplot = value;
                    await this.updateStats(value);
                });
            }

            processButton.setDisabled(false);
            processEntireButton.setDisabled(false);
            purgeButton.setDisabled(false);

            await this.updateStats(this.selectedSubplot);
        } catch (error) {
            new Notice(`Error loading subplots: ${error instanceof Error ? error.message : String(error)}`);
            this.close();
        }
    }

    private async updateStats(subplotName: string): Promise<void> {
        if (!this.statsEl) return;
        try {
            const stats = await this.service.countProcessableScenes(subplotName);
            this.statsEl.setText(`${stats.flagged} scene${stats.flagged !== 1 ? 's' : ''} will be processed (${stats.processable} processable, ${stats.total} total)`);
        } catch (error) {
            this.statsEl.setText('Unable to calculate scene count');
        }
    }

}
