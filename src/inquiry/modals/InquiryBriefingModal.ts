import { App, Modal, normalizePath, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { InquiryBriefModel } from '../types/inquiryViewTypes';
import { openOrRevealFile, openOrRevealFileByPath } from '../../utils/fileUtils';

type InquiryBriefingModalOptions = {
    brief: InquiryBriefModel;
    plugin: RadialTimelinePlugin;
    briefFile?: TFile | null;
    logFile?: TFile | null;
    generatedAt?: number | string | null;
};

const ARTICLE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
});

export class InquiryBriefingModal extends Modal {
    private readonly brief: InquiryBriefModel;
    private readonly plugin: RadialTimelinePlugin;
    private readonly briefFile: TFile | null;
    private readonly logFile: TFile | null;
    private readonly generatedAt: number | string | null | undefined;

    constructor(app: App, options: InquiryBriefingModalOptions) {
        super(app);
        this.brief = options.brief;
        this.plugin = options.plugin;
        this.briefFile = options.briefFile ?? null;
        this.logFile = options.logFile ?? null;
        this.generatedAt = options.generatedAt;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        contentEl.empty();
        titleEl.setText('');
        modalEl.addClass('rt-briefing-modal');
        contentEl.addClass('rt-briefing-surface');

        const shell = contentEl.createDiv({ cls: 'rt-briefing-shell' });
        this.renderHeader(shell);
        this.renderHero(shell);
        this.renderSummary(shell);
        this.renderFindings(shell);
        this.renderSources(shell);
        this.renderSceneNotes(shell);
        this.renderPendingActions(shell);
        this.renderRawResponse(shell);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createEl('header', { cls: 'rt-briefing-header' });
        const brand = header.createDiv({ cls: 'rt-briefing-brand' });
        const logoHref = this.resolveLogoHref();
        if (logoHref) {
            brand.createEl('img', {
                cls: 'rt-briefing-brand-logo',
                attr: {
                    src: logoHref,
                    alt: 'Radial Timeline'
                }
            });
        } else {
            brand.createDiv({ cls: 'rt-briefing-brand-mark', text: 'RT' });
        }

        const brandText = brand.createDiv({ cls: 'rt-briefing-brand-text' });
        brandText.createDiv({ cls: 'rt-briefing-brand-name', text: 'Radial Timeline' });
        brandText.createDiv({ cls: 'rt-briefing-brand-subline', text: 'Inquiry Briefing' });

        const actions = header.createDiv({ cls: 'rt-briefing-actions' });
        if (this.logFile) {
            const logAction = actions.createEl('button', {
                cls: 'rt-briefing-action',
                text: 'Open Log'
            });
            logAction.addEventListener('click', () => {
                void openOrRevealFile(this.app, this.logFile as TFile);
            });
        }
        if (this.briefFile) {
            const noteAction = actions.createEl('button', {
                cls: 'rt-briefing-action',
                text: 'Open Markdown'
            });
            noteAction.addEventListener('click', () => {
                void openOrRevealFile(this.app, this.briefFile as TFile);
            });
        }
    }

    private renderHero(container: HTMLElement): void {
        const hero = container.createEl('section', { cls: 'rt-briefing-hero' });
        const label = this.brief.questionTitle?.trim() || 'Briefing';
        hero.createDiv({ cls: 'rt-briefing-kicker', text: label });
        hero.createEl('h1', {
            cls: 'rt-briefing-title',
            text: this.brief.questionText?.trim() || 'Inquiry question unavailable.'
        });

        const meta = hero.createDiv({ cls: 'rt-briefing-meta' });
        const metaRows = [
            this.brief.scopeIndicator ? `Scope ${this.brief.scopeIndicator}` : '',
            this.brief.pills.join(' · '),
            this.formatGeneratedAt()
        ].filter(Boolean);
        metaRows.forEach(row => {
            meta.createDiv({ cls: 'rt-briefing-meta-line', text: row });
        });
    }

    private renderSummary(container: HTMLElement): void {
        const section = this.createSection(container, 'Report');
        const summaryBlock = section.createDiv({ cls: 'rt-briefing-block rt-briefing-block--lead' });
        summaryBlock.createEl('p', {
            cls: 'rt-briefing-paragraph rt-briefing-paragraph--lead',
            text: this.brief.flowSummary || 'No report summary available.'
        });
        if (this.brief.depthSummary && this.brief.depthSummary !== this.brief.flowSummary) {
            summaryBlock.createEl('p', {
                cls: 'rt-briefing-paragraph',
                text: this.brief.depthSummary
            });
        }
    }

    private renderFindings(container: HTMLElement): void {
        const section = this.createSection(container, 'Findings');
        const targetFindings = this.brief.findings.filter(finding => finding.role === 'target');
        const contextFindings = this.brief.findings.filter(finding => finding.role !== 'target');

        this.renderFindingGroup(section, 'Primary Findings', targetFindings);
        this.renderFindingGroup(section, 'Context Findings', contextFindings);
    }

    private renderSources(container: HTMLElement): void {
        if (!this.brief.sources.length) return;
        const section = this.createSection(container, 'Sources');
        const list = section.createDiv({ cls: 'rt-briefing-stack' });
        this.brief.sources.forEach(source => {
            const item = list.createEl('article', { cls: 'rt-briefing-block rt-briefing-source' });
            const titleRow = item.createDiv({ cls: 'rt-briefing-source-header' });
            const title = source.title?.trim() || 'Untitled source';

            if (source.path) {
                const link = titleRow.createEl('a', {
                    cls: 'rt-briefing-source-title rt-briefing-link',
                    text: title,
                    href: '#'
                });
                link.addEventListener('click', event => {
                    event.preventDefault();
                    void openOrRevealFileByPath(this.app, source.path as string);
                });
            } else if (source.url) {
                titleRow.createEl('a', {
                    cls: 'rt-briefing-source-title rt-briefing-link',
                    text: title,
                    href: source.url,
                    attr: {
                        target: '_blank',
                        rel: 'noopener'
                    }
                });
            } else {
                titleRow.createDiv({ cls: 'rt-briefing-source-title', text: title });
            }

            const metaParts = [
                source.classLabel?.trim() || '',
                Number.isFinite(source.citationCount) && (source.citationCount ?? 0) > 0
                    ? `${source.citationCount} citation${source.citationCount === 1 ? '' : 's'}`
                    : ''
            ].filter(Boolean);
            if (metaParts.length) {
                item.createDiv({ cls: 'rt-briefing-source-meta', text: metaParts.join(' · ') });
            }
            if (source.excerpt?.trim()) {
                item.createEl('p', {
                    cls: 'rt-briefing-paragraph rt-briefing-source-excerpt',
                    text: source.excerpt.trim()
                });
            }
        });
    }

    private renderSceneNotes(container: HTMLElement): void {
        if (!this.brief.sceneNotes.length) return;
        const section = this.createSection(container, 'Scene Notes');
        const notes = section.createDiv({ cls: 'rt-briefing-stack' });

        this.brief.sceneNotes.forEach(note => {
            const article = notes.createEl('article', { cls: 'rt-briefing-block rt-briefing-note' });
            article.createDiv({ cls: 'rt-briefing-note-label', text: note.header });

            note.entries.forEach(entry => {
                const entryBlock = article.createDiv({ cls: 'rt-briefing-note-entry' });
                entryBlock.createEl('h3', { cls: 'rt-briefing-finding-title', text: entry.headline });
                entryBlock.createDiv({
                    cls: 'rt-briefing-finding-meta',
                    text: [entry.lens, `Impact ${entry.impact}`, `Confidence ${entry.confidence}`].filter(Boolean).join(' · ')
                });
                entry.bullets.forEach(bullet => {
                    entryBlock.createEl('p', {
                        cls: 'rt-briefing-paragraph',
                        text: bullet
                    });
                });
            });
        });
    }

    private renderPendingActions(container: HTMLElement): void {
        if (!this.brief.pendingActions.length) return;
        const section = this.createSection(container, 'Action Items');
        const list = section.createEl('ol', { cls: 'rt-briefing-action-list' });
        this.brief.pendingActions.forEach(action => {
            list.createEl('li', { text: action });
        });
    }

    private renderRawResponse(container: HTMLElement): void {
        if (!this.brief.rawResponse?.trim()) return;
        const section = this.createSection(container, 'Provider Response');
        section.createEl('pre', {
            cls: 'rt-briefing-raw',
            text: this.brief.rawResponse.trim()
        });
    }

    private renderFindingGroup(container: HTMLElement, label: string, findings: InquiryBriefModel['findings']): void {
        if (!findings.length) return;
        const group = container.createDiv({ cls: 'rt-briefing-group' });
        group.createDiv({ cls: 'rt-briefing-group-label', text: label });
        findings.forEach(finding => {
            const card = group.createEl('article', { cls: 'rt-briefing-block rt-briefing-finding' });
            card.createEl('h3', { cls: 'rt-briefing-finding-title', text: finding.headline });
            card.createDiv({
                cls: 'rt-briefing-finding-meta',
                text: [
                    finding.lens,
                    `Clarity ${finding.clarity}`,
                    `Impact ${finding.impact}`,
                    `Confidence ${finding.confidence}`
                ].filter(Boolean).join(' · ')
            });
            if (finding.bullets.length) {
                finding.bullets.forEach(bullet => {
                    card.createEl('p', { cls: 'rt-briefing-paragraph', text: bullet });
                });
            }
        });
    }

    private createSection(container: HTMLElement, label: string): HTMLElement {
        const section = container.createEl('section', { cls: 'rt-briefing-section' });
        section.createDiv({ cls: 'rt-briefing-section-label', text: label });
        return section;
    }

    private formatGeneratedAt(): string {
        const normalized = this.resolveGeneratedAt();
        if (!normalized) return '';
        return `Generated ${ARTICLE_DATE_FORMAT.format(normalized)}`;
    }

    private resolveGeneratedAt(): Date | null {
        if (typeof this.generatedAt === 'number' && Number.isFinite(this.generatedAt)) {
            return new Date(this.generatedAt);
        }
        if (typeof this.generatedAt === 'string' && this.generatedAt.trim()) {
            const parsed = new Date(this.generatedAt);
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        return null;
    }

    private resolveLogoHref(): string | null {
        const configDir = (this.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
        const pluginId = this.plugin.manifest.id;
        const assetPath = normalizePath(`${configDir}/plugins/${pluginId}/assets/rt-logo.png`);
        const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };
        return adapter.getResourcePath ? adapter.getResourcePath(assetPath) : null;
    }
}
