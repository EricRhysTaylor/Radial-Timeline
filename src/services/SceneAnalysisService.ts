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
            name: 'Scene Pulse Analysis (manuscript order)',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    if (!this.ensureApiKey()) return;
                    try {
                        await this.processByManuscriptOrder();
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
            name: 'Scene Pulse Analysis (subplot order)',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    if (!this.ensureApiKey()) return;
                    const options = await this.getSubplotOptions();
                    new SubplotPickerModal(this.plugin.app, this, options).open();
                })();
                return true;
            }
        });
    }

    async getSubplotOptions(): Promise<Array<{ name: string; stats: { flagged: number; processable: number; total: number } }>> {
        const { getDistinctSubplotNames } = await import('../SceneAnalysisCommands');
        const names = await getDistinctSubplotNames(this.plugin, this.plugin.app.vault);
        if (!Array.isArray(names) || names.length === 0) {
            throw new Error('No subplots found.');
        }
        const stats = await Promise.all(names.map(name => this.countProcessableScenes(name)));
        return names.map((name, index) => ({ name, stats: stats[index] }));
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
            const modelId = this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
            if (modelId.includes('sonnet-4-5') || modelId.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
            if (modelId.includes('opus-4-1') || modelId.includes('opus-4.1')) return 'Claude Opus 4.1';
            if (modelId.includes('opus-4')) return 'Claude Opus 4';
            if (modelId.includes('sonnet-4')) return 'Claude Sonnet 4';
            return modelId;
        }
        if (provider === 'gemini') {
            const modelId = this.plugin.settings.geminiModelId || 'gemini-3-pro-preview';
            if (modelId.includes('3-pro')) return 'Gemini 3 Pro Preview';
            if (modelId.includes('2.5-pro') || modelId.includes('2-5-pro')) return 'Gemini 2.5 Pro';
            if (modelId.includes('2.0-pro') || modelId.includes('2-0-pro')) return 'Gemini 2.0 Pro';
            return modelId;
        }
        const modelId = this.plugin.settings.openaiModelId || 'gpt-4o';
        if (modelId.includes('5.1')) return 'GPT-5.1';
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

    async purgeBeatsForSubplot(subplotName: string): Promise<void> {
        const { purgeBeatsBySubplotName } = await import('../SceneAnalysisCommands');
        await purgeBeatsBySubplotName(this.plugin, this.plugin.app.vault, subplotName);
    }
}

class SubplotPickerModal extends Modal {
    private selectedSubplot: string;
    private statsEl: HTMLElement | null = null;
    private dropdown: DropdownComponent | null = null;
    private readonly statsBySubplot: Map<string, { flagged: number; processable: number; total: number }>;

    constructor(
        app: App,
        private service: SceneAnalysisService,
        private readonly options: Array<{ name: string; stats: { flagged: number; processable: number; total: number } }>
    ) {
        super(app);
        if (!options.length) {
            throw new Error('No subplot options available.');
        }
        this.selectedSubplot = options[0].name;
        this.statsBySubplot = new Map(options.map(opt => [opt.name, opt.stats]));
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Select subplot for pulse processing');
        const modelName = this.service.getActiveModelName();
        const infoEl = contentEl.createDiv({ cls: 'rt-subplot-picker-info' });
        infoEl.createEl('p', { text: `Process pulse using ${modelName}. This will analyze scenes in the subplot "${this.selectedSubplot}" and update their pulse metadata.` });
        infoEl.createEl('p', { text: 'Requires scenes with "Review Update: Yes" and Status: Working or Complete.', cls: 'rt-subplot-picker-hint' });

        const selectContainer = contentEl.createDiv({ cls: 'rt-subplot-picker-select' });
        selectContainer.createEl('label', { text: 'Select subplot:', cls: 'rt-subplot-picker-label' });
        this.dropdown = new DropdownComponent(selectContainer);
        this.options.forEach((option, index) => {
            this.dropdown?.addOption(option.name, `${index + 1}. ${option.name}`);
        });
        this.dropdown.setValue(this.selectedSubplot);
        this.dropdown.onChange(value => {
            this.selectedSubplot = value;
            this.updateStats(value);
        });

        this.statsEl = contentEl.createDiv({ cls: 'rt-subplot-picker-stats' });
        this.updateStats(this.selectedSubplot);

        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        new ButtonComponent(buttonRow)
            .setButtonText('Process pulse')
            .setCta()
            .onClick(async () => {
                this.close();
                await this.service.processBySubplotName(this.selectedSubplot);
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Process entire subplot')
            .setCta()
            .onClick(async () => {
                this.close();
                await this.service.processEntireSubplot(this.selectedSubplot);
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Purge all pulse')
            .setWarning()
            .onClick(async () => {
                try {
                    this.close();
                    await this.service.purgeBeatsForSubplot(this.selectedSubplot);
                } catch (error) {
                    new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    private updateStats(subplotName: string): void {
        if (!this.statsEl) return;
        const stats = this.statsBySubplot.get(subplotName);
        if (!stats) {
            throw new Error(`Unknown subplot selection: ${subplotName}`);
        }
        this.statsEl.setText(`${stats.flagged} scene${stats.flagged !== 1 ? 's' : ''} will be processed (${stats.processable} processable, ${stats.total} total)`);
    }
}
