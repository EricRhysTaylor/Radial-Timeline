/*
 * SceneAnalysisService
 * Handles registration and UI flow for AI scene analysis commands.
 */

import { App, Modal, Notice, ButtonComponent, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { normalizeBooleanValue } from '../utils/sceneHelpers';
import { DEFAULT_GEMINI_MODEL_ID } from '../constants/aiDefaults';

export class SceneAnalysisService {
    constructor(private plugin: RadialTimelinePlugin) { }

    registerCommands(): void {
        this.registerManuscriptCommand();
        this.registerSubplotCommand();
        this.registerSynopsisCommand();
    }

    private registerSynopsisCommand(): void {
        this.plugin.addCommand({
            id: 'refresh-scene-synopses-ai',
            name: 'Refresh Scene Synopses (AI)',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    if (!this.ensureApiKey()) return;
                    await this.processSynopsisAnalysis();
                })();
                return true;
            }
        });
    }

    private registerManuscriptCommand(): void {
        this.plugin.addCommand({
            id: 'update-beats-manuscript-order',
            name: 'Scene pulse analysis (manuscript order)',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    if (!this.ensureApiKey()) return;
                    await this.processByManuscriptOrder();
                })();
                return true;
            }
        });
    }

    private registerSubplotCommand(): void {
        this.plugin.addCommand({
            id: 'update-beats-choose-subplot',
            name: 'Scene pulse analysis (subplot order)',
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
        else if (provider === 'local') {
            // For local, we need at least a Base URL and Model ID
            const hasUrl = !!this.plugin.settings.localBaseUrl?.trim();
            const hasModel = !!this.plugin.settings.localModelId?.trim();
            if (!hasUrl || !hasModel) {
                new Notice('Local AI provider requires Base URL and Model ID.');
                return false;
            }
            return true;
        }
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
                const pulseFlag = scene['Pulse Update'] ?? scene['Beats Update'];
                return (statusValue === 'Working' || statusValue === 'Complete') && normalizeBooleanValue(pulseFlag);
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
        const flaggedCount = processableScenes.filter(scene => {
            const pulseFlag = scene['Pulse Update'] ?? scene['Beats Update'];
            return normalizeBooleanValue(pulseFlag);
        }).length;
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
            // Just show the raw model ID, or maybe minimal formatting
            return modelId;
        }
        if (provider === 'gemini') {
            const modelId = this.plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
            return modelId;
        }
        if (provider === 'local') {
            return this.plugin.settings.localModelId || 'local-model';
        }
        const modelId = this.plugin.settings.openaiModelId || 'gpt-4o';
        return modelId;
    }

    isLocalReportOnlyMode(): boolean {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        return provider === 'local' && (this.plugin.settings.localSendPulseToAiReport ?? true);
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

    async processSynopsisAnalysis(): Promise<void> {
        const { processSynopsisByManuscriptOrder } = await import('../sceneAnalysis/SynopsisCommands');
        await processSynopsisByManuscriptOrder(this.plugin, this.plugin.app.vault);
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
    private infoTextEl: HTMLParagraphElement | null = null;
    private heroStats?: {
        flagged: HTMLElement;
        processable: HTMLElement;
        total: HTMLElement;
    };
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
        const { contentEl, modalEl, titleEl } = this;
        titleEl.setText('');
        contentEl.empty();
        // Use generic modal base + subplot picker specific styling
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container');
        contentEl.addClass('rt-subplot-picker-modal');

        const modelName = this.service.getActiveModelName();
        const hero = contentEl.createDiv({ cls: 'ert-modal-header' });
        const badgeText = modelName ? `AI pulse run · ${modelName}` : 'AI pulse run';
        hero.createSpan({ text: badgeText, cls: 'rt-subplot-picker-badge' });
        hero.createDiv({ text: 'Process subplot scenes', cls: 'ert-modal-title' });
        hero.createDiv({ cls: 'ert-modal-subtitle', text: 'Choose a subplot and run pulse updates just for that arc.' });

        const heroStats = hero.createDiv({ cls: 'rt-subplot-picker-hero-stats' });
        this.heroStats = {
            flagged: this.createHeroStat(heroStats, 'Flagged scenes'),
            processable: this.createHeroStat(heroStats, 'Processable scenes'),
            total: this.createHeroStat(heroStats, 'Total scenes')
        };

        const formCard = contentEl.createDiv({ cls: 'rt-subplot-picker-card' });
        const selectContainer = formCard.createDiv({ cls: 'rt-subplot-picker-select' });
        selectContainer.createEl('label', { text: 'Pick a subplot to process', cls: 'rt-subplot-picker-label' });
        this.dropdown = new DropdownComponent(selectContainer.createDiv({ cls: 'rt-subplot-picker-dropdown' }));
        this.options.forEach((option, index) => {
            // Show flagged count in parentheses if any scenes are flagged
            const flaggedSuffix = option.stats.flagged > 0 ? ` (${option.stats.flagged})` : '';
            this.dropdown?.addOption(option.name, `${index + 1}. ${option.name}${flaggedSuffix}`);
        });
        this.dropdown.setValue(this.selectedSubplot);
        this.dropdown.onChange(value => {
            this.selectedSubplot = value;
            this.updateStats(value);
        });

        this.statsEl = formCard.createDiv({ cls: 'rt-subplot-picker-stats' });
        this.updateStats(this.selectedSubplot);

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(buttonRow)
            .setButtonText('Process flagged scenes')
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

    private createHeroStat(container: HTMLElement, label: string): HTMLElement {
        const stat = container.createDiv({ cls: 'rt-subplot-picker-hero-stat' });
        stat.createSpan({ cls: 'rt-subplot-picker-hero-label', text: label });
        return stat.createSpan({ cls: 'rt-subplot-picker-hero-value', text: '—' });
    }

    private updateStats(subplotName: string): void {
        if (!this.statsEl) return;
        const stats = this.statsBySubplot.get(subplotName);
        if (!stats) {
            throw new Error(`Unknown subplot selection: ${subplotName}`);
        }
        this.statsEl.empty();
        const summaryLine = `${stats.flagged} flagged • ${stats.processable} processable • ${stats.total} total`;
        this.statsEl.createDiv({ cls: 'rt-subplot-picker-stats-line', text: summaryLine });

        // Check if local LLM is bypassing YAML pulse write
        const isLocalReportOnly = this.service.isLocalReportOnlyMode();
        const infoText = isLocalReportOnly
            ? 'Local LLM mode: Results logged to AI report only (YAML pulse fields not updated).'
            : 'Flagged scenes with processable metadata are sent to the AI along with the manuscript content.';
        this.statsEl.createDiv({
            cls: 'rt-subplot-picker-summary',
            text: infoText
        });

        if (this.heroStats) {
            this.heroStats.flagged.setText(String(stats.flagged));
            this.heroStats.processable.setText(String(stats.processable));
            this.heroStats.total.setText(String(stats.total));
        }
    }

    private updateInfoText(modelName: string): void {
        if (!this.infoTextEl) return;
        this.infoTextEl.setText(`Process pulse using ${modelName} for the subplot "${this.selectedSubplot}".`);
    }
}
