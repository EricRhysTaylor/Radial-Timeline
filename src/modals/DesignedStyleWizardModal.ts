/*
 * Designed Style Wizard — single-page, two-column modal that lets a Pro user
 * author or edit a DesignedStyleSpec. The spec is the source of truth; the
 * generated `.tex` file is a derived artifact, regenerated on save.
 *
 * Architecture:
 *  - Configuration column (left): collapsible disclosure sections
 *    (Page, Body, Headers, Folio, Parts, Chapters, Scenes, Epigraph) plus
 *    a non-collapsible "Save metadata" header.
 *  - Live preview column (right): pictograms + feature rows + validation
 *    banner + collapsed generated-LaTeX peek. Re-rendered on every spec
 *    mutation via renderPreview().
 *  - Pure helpers (validateDesignedStyleSpec, generateUniqueDesignedSlug,
 *    cloneArchetypeSpec, applyHeaderPreset) are exported for unit tests.
 */
import {
    App,
    ButtonComponent,
    Modal,
    Notice,
    TextComponent,
    setIcon,
    normalizePath,
    TFile,
} from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { ERT_CLASSES } from '../ui/classes';
import {
    DESIGNED_STYLE_SPEC_VERSION,
    generateDesignedStyleTex,
    type DesignArchetype,
    type DesignedHeaderField,
    type DesignedStyleSpec,
} from '../publishing/designedStyle';
import { BUNDLED_FICTION_SPECS, type BundledFictionId } from '../publishing/bundledStyleSpecs';
import {
    getLayoutFeaturesFromSpec,
    getPictogramRowsFromSpec,
    renderLayoutFeatureList,
    renderLayoutPictograms,
} from '../publishing/layoutVisuals';
import type { ManuscriptSceneHeadingMode, PandocLayoutTemplate } from '../types';
import { compactTemplatePathForStorage } from '../utils/templateImport';
import { getFontDiagnosticForFontKey, getPandocFolder, slugifyToFileStem } from '../utils/exportFormats';

export interface DesignedStyleWizardResult {
    name: string;
    description: string;
    spec: DesignedStyleSpec;
    layoutId?: string;
}

export interface DesignedStyleWizardOptions {
    initialSpec?: DesignedStyleSpec;
    initialName?: string;
    initialDescription?: string;
    initialLayoutId?: string;
    onSave: (result: DesignedStyleWizardResult) => Promise<void> | void;
}

const ARCHETYPE_TO_BUNDLED: Record<DesignArchetype, BundledFictionId> = {
    'submission':    'bundled-fiction-classic-manuscript',
    'reading-draft': 'bundled-fiction-contemporary-literary',
    'literary':      'bundled-fiction-signature-literary',
    'structured':    'bundled-fiction-modern-classic',
};

const ARCHETYPE_INFO: Record<DesignArchetype, { name: string; tagline: string }> = {
    'submission':    { name: 'Standard Submission', tagline: 'Industry-standard double-spaced manuscript for agents.' },
    'reading-draft': { name: 'Contemporary Literary', tagline: 'Clean, modern reading draft with chapter breaks.' },
    'literary':      { name: 'Signature Literary',   tagline: 'Refined typesetting with letter-spaced running heads.' },
    'structured':    { name: 'Modern Classic',       tagline: 'Roman parts, numbered chapters, section breaks.' },
};

const FONT_OPTIONS: Array<{ value: DesignedStyleSpec['body']['font']; label: string; familyHint: string }> = [
    { value: 'sorts-mill-goudy', label: 'Sorts Mill Goudy', familyHint: 'Sorts Mill Goudy' },
    { value: 'latin-modern',     label: 'Latin Modern',     familyHint: 'Latin Modern Roman' },
    { value: 'source-serif',     label: 'Source Serif',     familyHint: 'Source Serif 4' },
    { value: 'eb-garamond',      label: 'EB Garamond',      familyHint: 'EB Garamond' },
    { value: 'crimson',          label: 'Crimson Text',     familyHint: 'Crimson Text' },
    { value: 'system-serif',     label: 'System serif',     familyHint: 'Times' },
    { value: 'system-sans',      label: 'System sans',      familyHint: 'Helvetica' },
];

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit testing)
// ──────────────────────────────────────────────────────────────────────────

/** Deep-clone (via JSON) the bundled spec for a given archetype. */
export function cloneArchetypeSpec(archetype: DesignArchetype): DesignedStyleSpec {
    const bundledId = ARCHETYPE_TO_BUNDLED[archetype];
    const source = BUNDLED_FICTION_SPECS[bundledId];
    const clone = JSON.parse(JSON.stringify(source)) as DesignedStyleSpec;
    clone.specVersion = DESIGNED_STYLE_SPEC_VERSION;
    return clone;
}

/** Generate a slug, suffixing -2/-3/etc. against existing layout IDs to ensure uniqueness. */
export function generateUniqueDesignedSlug(name: string, existingIds: ReadonlySet<string>): string {
    const baseSlug = slugifyToFileStem(name).toLowerCase();
    const attempt = (slug: string) => `designed-${slug}`;
    if (!existingIds.has(attempt(baseSlug))) return baseSlug;
    let counter = 2;
    while (existingIds.has(attempt(`${baseSlug}-${counter}`))) {
        counter += 1;
    }
    return `${baseSlug}-${counter}`;
}

/** Apply a header preset to spec.runningHeader (mutates in place). */
export function applyHeaderPreset(spec: DesignedStyleSpec, mode: DesignedStyleSpec['runningHeader']['mode']): void {
    const rh = spec.runningHeader;
    rh.mode = mode;
    // Clear all corner overrides; presets re-populate as needed.
    delete rh.evenLeft; delete rh.evenCenter; delete rh.evenRight;
    delete rh.oddLeft;  delete rh.oddCenter;  delete rh.oddRight;
    if (mode === 'centered-title') {
        rh.evenCenter = 'title';
        rh.oddCenter = 'title';
    } else if (mode === 'split-author-page-title-page') {
        rh.evenLeft = 'page';
        rh.evenRight = 'author';
        rh.oddLeft = 'title';
        rh.oddRight = 'page';
    } else if (mode === 'left-title-right-context') {
        rh.evenLeft = 'title';
        rh.oddRight = 'scene-context';
    }
}

export interface DesignedStyleSpecValidation {
    errors: string[];
    warnings: string[];
}

/** Validate a spec + name. Errors block save; warnings allow save but display. */
export function validateDesignedStyleSpec(
    spec: DesignedStyleSpec,
    name: string,
    options: { existingDesignedNames?: ReadonlySet<string> } = {},
): DesignedStyleSpecValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name.trim()) {
        errors.push('Style name is required.');
    }

    // Resolve paper dimensions for cross-checks.
    let paperWidthIn: number;
    let paperHeightIn: number;
    if (typeof spec.paperSize === 'string') {
        if (spec.paperSize === 'us-trade-6x9') { paperWidthIn = 6;    paperHeightIn = 9;    }
        else if (spec.paperSize === 'us-letter') { paperWidthIn = 8.5; paperHeightIn = 11;   }
        else                                    { paperWidthIn = 8.27;paperHeightIn = 11.69;}
    } else {
        paperWidthIn = spec.paperSize.widthIn;
        paperHeightIn = spec.paperSize.heightIn;
        if (paperWidthIn <= 0) errors.push('Custom paper width must be greater than 0.');
        if (paperHeightIn <= 0) errors.push('Custom paper height must be greater than 0.');
        if (paperWidthIn < 4 || paperWidthIn > 12) {
            warnings.push('Custom paper width is outside common print sizes (4–12 inches).');
        }
    }

    const m = spec.margins;
    if (paperHeightIn > 0 && (m.topIn + m.bottomIn) >= paperHeightIn) {
        errors.push('Top + bottom margins leave no room for body text.');
    }
    if (paperWidthIn > 0 && (m.leftIn + m.rightIn) >= paperWidthIn) {
        errors.push('Left + right margins leave no room for body text.');
    }

    if (spec.body.sizePt < 6 || spec.body.sizePt > 24) {
        errors.push(`Body size ${spec.body.sizePt}pt is outside the supported range (6–24pt).`);
    }

    if (spec.folio.position === 'header' && spec.runningHeader.mode === 'none') {
        warnings.push('Folio is in headers but headers are off — page numbers will not render.');
    }

    if (spec.parts.mode === 'off' && spec.parts.epigraph) {
        warnings.push('Part epigraphs are enabled but parts are off — no epigraphs will render.');
    }

    if (
        spec.scene.openerHeadingModes
        && spec.scene.openerHeadingModes.length > 0
        && spec.scene.opener !== 'dedicated-page'
    ) {
        warnings.push('Multiple scene heading modes only apply to dedicated-page openers.');
    }

    if (options.existingDesignedNames && options.existingDesignedNames.has(name.trim().toLowerCase())) {
        warnings.push('A style with this name already exists; the saved name will be suffixed (e.g. "-2").');
    }

    // Strict font policy (Phase 1): when the body font isn't installed (or the
    // bundled assets are missing on disk), surface a warning in the validation
    // banner so the user sees the issue alongside other spec problems. The
    // wizard's font-row inline status renders the precise install affordance.
    try {
        const fontDiag = getFontDiagnosticForFontKey(spec.body.font);
        if (fontDiag.state !== 'ok') {
            warnings.push(`${fontDiag.primaryFontName} is not installed. Click Install next to the Font row, or pick a different font — the export will fail until this is resolved.`);
        }
    } catch {
        // Probing the font catalog can fail in headless / sandboxed
        // environments. The banner stays clean rather than fabricating an
        // alarm; the export pipeline still hard-blocks when needed.
    }

    return { errors, warnings };
}

// ──────────────────────────────────────────────────────────────────────────
// Modal
// ──────────────────────────────────────────────────────────────────────────

export class DesignedStyleWizardModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly options: DesignedStyleWizardOptions;
    private spec: DesignedStyleSpec;
    private styleName: string;
    private description: string;
    private readonly layoutId?: string;
    private readonly isEditMode: boolean;
    private archetypePicked: boolean;

    private configColumn: HTMLElement | null = null;
    private previewColumn: HTMLElement | null = null;
    private saveButton: ButtonComponent | null = null;
    private validationBannerEl: HTMLElement | null = null;
    private columnsEl: HTMLElement | null = null;
    private archetypeOverlayEl: HTMLElement | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin, options: DesignedStyleWizardOptions) {
        super(app);
        this.plugin = plugin;
        this.options = options;
        this.layoutId = options.initialLayoutId;
        this.isEditMode = !!options.initialSpec;
        this.spec = options.initialSpec
            ? (JSON.parse(JSON.stringify(options.initialSpec)) as DesignedStyleSpec)
            : cloneArchetypeSpec('submission');
        this.spec.specVersion = DESIGNED_STYLE_SPEC_VERSION;
        this.styleName = options.initialName ?? '';
        this.description = options.initialDescription ?? '';
        this.archetypePicked = this.isEditMode;
    }

    onOpen(): void {
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add(
                'ert-ui',
                'ert-scope--modal',
                'ert-modal-shell',
                'ert-style-wizard-modal',
            );
        }
        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-style-wizard');

        const header = contentEl.createDiv({ cls: 'ert-modal-header ert-style-wizard__header' });
        header.createSpan({ cls: 'ert-modal-badge', text: this.isEditMode ? 'EDIT' : 'DESIGN' });
        header.createDiv({
            cls: 'ert-modal-title',
            text: this.isEditMode ? 'Edit designed style' : 'Design your own style',
        });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Configure page, body, headers, folio, parts, chapters, scenes, and epigraph. The preview updates live.',
        });

        // Save metadata block (always visible, never collapsed).
        const metaBlock = contentEl.createDiv({ cls: 'ert-style-wizard__meta' });
        this.renderMetaBlock(metaBlock);

        this.columnsEl = contentEl.createDiv({ cls: 'ert-style-wizard__columns' });
        this.configColumn = this.columnsEl.createDiv({ cls: 'ert-style-wizard__config' });
        this.previewColumn = this.columnsEl.createDiv({ cls: 'ert-style-wizard__preview' });

        // If we have no initial spec, show the archetype overlay first.
        if (!this.archetypePicked) {
            this.renderArchetypeOverlay();
        }

        this.renderConfigSections();
        this.renderPreview();

        // Action buttons.
        const actions = contentEl.createDiv({ cls: 'ert-modal-actions ert-style-wizard__actions' });
        this.saveButton = new ButtonComponent(actions)
            .setButtonText(this.isEditMode ? 'Update style' : 'Save style')
            .setCta()
            .onClick(() => { void this.handleSave(); });
        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
        this.configColumn = null;
        this.previewColumn = null;
        this.saveButton = null;
        this.validationBannerEl = null;
        this.columnsEl = null;
        this.archetypeOverlayEl = null;
    }

    private renderMetaBlock(parent: HTMLElement): void {
        parent.empty();

        const nameRow = parent.createDiv({ cls: 'ert-style-wizard__meta-row' });
        nameRow.createEl('label', { cls: 'ert-style-wizard__meta-label', text: 'Style name' });
        const nameInput = new TextComponent(nameRow);
        nameInput.inputEl.addClass('ert-input', 'ert-input--full', 'ert-style-wizard__meta-input');
        nameInput.setPlaceholder('My Custom Style');
        nameInput.setValue(this.styleName);
        nameInput.onChange((value) => {
            this.styleName = value;
            this.renderPreview();
        });

        const descRow = parent.createDiv({ cls: 'ert-style-wizard__meta-row' });
        descRow.createEl('label', { cls: 'ert-style-wizard__meta-label', text: 'Description (optional)' });
        const descInput = descRow.createEl('textarea', {
            cls: 'ert-input ert-style-wizard__meta-textarea',
            attr: { rows: '2', placeholder: 'Short description shown on the layout card.' },
        });
        descInput.value = this.description;
        descInput.addEventListener('input', () => {
            this.description = descInput.value;
        });

        const tierRow = parent.createDiv({ cls: 'ert-style-wizard__meta-row ert-style-wizard__tier-row' });
        tierRow.createEl('label', { cls: 'ert-style-wizard__meta-label', text: 'Tier' });
        const tierBadge = tierRow.createSpan({
            cls: `ert-badgePill ert-badgePill--sm ${ERT_CLASSES.BADGE_PILL_PRO}`,
        });
        tierBadge.createSpan({ cls: 'ert-badgePill__text', text: 'Pro' });
    }

    private renderArchetypeOverlay(): void {
        if (!this.configColumn) return;
        const overlay = this.configColumn.createDiv({ cls: 'ert-style-wizard__archetype' });
        overlay.createDiv({
            cls: 'ert-style-wizard__archetype-title',
            text: 'Start from an archetype',
        });
        overlay.createDiv({
            cls: 'ert-style-wizard__archetype-subtitle',
            text: 'Pick a starting point — every value is editable below.',
        });
        const grid = overlay.createDiv({ cls: 'ert-style-wizard__archetype-grid' });
        (Object.keys(ARCHETYPE_INFO) as DesignArchetype[]).forEach((archetype) => {
            const info = ARCHETYPE_INFO[archetype];
            const card = grid.createDiv({ cls: 'ert-style-wizard__archetype-card' });
            card.createDiv({ cls: 'ert-style-wizard__archetype-card-name', text: info.name });
            card.createDiv({ cls: 'ert-style-wizard__archetype-card-tagline', text: info.tagline });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            const onSelect = () => {
                this.spec = cloneArchetypeSpec(archetype);
                this.spec.specVersion = DESIGNED_STYLE_SPEC_VERSION;
                if (!this.styleName) {
                    this.styleName = `${ARCHETYPE_INFO[archetype].name} Custom`;
                }
                this.archetypePicked = true;
                this.refreshFromArchetype();
            };
            card.addEventListener('click', onSelect);
            card.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect();
                }
            });
        });
        this.archetypeOverlayEl = overlay;
    }

    private refreshFromArchetype(): void {
        // Re-render everything: meta block (name field), config sections, preview.
        const meta = this.contentEl.querySelector('.ert-style-wizard__meta') as HTMLElement | null;
        if (meta) this.renderMetaBlock(meta);
        if (this.archetypeOverlayEl) {
            this.archetypeOverlayEl.remove();
            this.archetypeOverlayEl = null;
        }
        if (this.configColumn) this.configColumn.empty();
        this.renderConfigSections();
        this.renderPreview();
    }

    private mutateSpec(mutator: (spec: DesignedStyleSpec) => void): void {
        mutator(this.spec);
        this.renderPreview();
    }

    private renderConfigSections(): void {
        if (!this.configColumn) return;
        this.configColumn.empty();

        if (!this.archetypePicked) {
            this.renderArchetypeOverlay();
            return;
        }

        this.renderPageSection(this.configColumn);
        this.renderBodySection(this.configColumn);
        this.renderHeaderSection(this.configColumn);
        this.renderFolioSection(this.configColumn);
        this.renderPartsSection(this.configColumn);
        this.renderChaptersSection(this.configColumn);
        this.renderScenesSection(this.configColumn);
        this.renderEpigraphSection(this.configColumn);
    }

    private createSection(parent: HTMLElement, label: string, opts: { open?: boolean } = {}): HTMLElement {
        const details = parent.createEl('details', { cls: 'ert-style-wizard__section' });
        if (opts.open) details.setAttribute('open', '');
        const summary = details.createEl('summary', { cls: 'ert-style-wizard__section-summary' });
        summary.createSpan({ cls: 'ert-style-wizard__section-title', text: label });
        return details.createDiv({ cls: 'ert-style-wizard__section-body' });
    }

    private renderPageSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Page');
        const paperRow = this.fieldRow(body, 'Paper size');
        const paperOptions: Array<{ value: string; label: string }> = [
            { value: 'us-trade-6x9', label: '6x9 trade' },
            { value: 'us-letter', label: 'US Letter' },
            { value: 'a4', label: 'A4' },
            { value: 'custom', label: 'Custom' },
        ];
        const currentPaperKey = typeof this.spec.paperSize === 'string' ? this.spec.paperSize : 'custom';
        this.makeRadioGroup(paperRow, paperOptions, currentPaperKey, (value) => {
            this.mutateSpec((s) => {
                if (value === 'custom') {
                    s.paperSize = { widthIn: 6, heightIn: 9 };
                } else {
                    s.paperSize = value as 'us-trade-6x9' | 'us-letter' | 'a4';
                }
            });
            this.refreshConfigOnly();
        });

        if (typeof this.spec.paperSize !== 'string') {
            const widthRow = this.fieldRow(body, 'Custom width (in)');
            this.numberInput(widthRow, this.spec.paperSize.widthIn, 0, 30, 0.1, (n) => {
                this.mutateSpec((s) => {
                    if (typeof s.paperSize !== 'string') s.paperSize.widthIn = n;
                });
            });
            const heightRow = this.fieldRow(body, 'Custom height (in)');
            this.numberInput(heightRow, this.spec.paperSize.heightIn, 0, 30, 0.1, (n) => {
                this.mutateSpec((s) => {
                    if (typeof s.paperSize !== 'string') s.paperSize.heightIn = n;
                });
            });
        }

        const topRow = this.fieldRow(body, 'Top margin (in)');
        this.numberInput(topRow, this.spec.margins.topIn, 0.25, 2.5, 0.05, (n) => {
            this.mutateSpec((s) => { s.margins.topIn = n; });
        });
        const bottomRow = this.fieldRow(body, 'Bottom margin (in)');
        this.numberInput(bottomRow, this.spec.margins.bottomIn, 0.25, 2.5, 0.05, (n) => {
            this.mutateSpec((s) => { s.margins.bottomIn = n; });
        });
        const leftRow = this.fieldRow(body, 'Left/Inner margin (in)');
        this.numberInput(leftRow, this.spec.margins.leftIn, 0.25, 2.5, 0.05, (n) => {
            this.mutateSpec((s) => { s.margins.leftIn = n; });
        });
        const rightRow = this.fieldRow(body, 'Right/Outer margin (in)');
        this.numberInput(rightRow, this.spec.margins.rightIn, 0.25, 2.5, 0.05, (n) => {
            this.mutateSpec((s) => { s.margins.rightIn = n; });
        });
        const mirroredRow = this.fieldRow(body, 'Mirrored margins (book binding)');
        this.toggleInput(mirroredRow, !!this.spec.margins.mirrored, (v) => {
            this.mutateSpec((s) => { s.margins.mirrored = v; });
        });
    }

    private renderBodySection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Body');

        const fontRow = this.fieldRow(body, 'Font');
        const fontSelect = fontRow.createEl('select', { cls: 'ert-input ert-style-wizard__select' });
        FONT_OPTIONS.forEach((option) => {
            const opt = fontSelect.createEl('option', { value: option.value, text: option.label });
            if (option.value === this.spec.body.font) opt.selected = true;
        });
        const fontStatus = fontRow.createSpan({ cls: 'ert-style-wizard__font-status' });
        const refreshFontStatus = () => {
            fontStatus.empty();
            const selected = FONT_OPTIONS.find(o => o.value === this.spec.body.font);
            if (!selected) return;
            // Strict font policy (Phase 1): per-font precise status. There is
            // NO fallback — a missing font is a hard export blocker.
            try {
                const diag = getFontDiagnosticForFontKey(this.spec.body.font);
                if (diag.state === 'ok') {
                    fontStatus.setText('Installed');
                    fontStatus.removeClass('is-missing');
                    fontStatus.addClass('is-installed');
                    return;
                }
                fontStatus.removeClass('is-installed');
                fontStatus.addClass('is-missing');
                fontStatus.setText(`Missing: ${diag.primaryFontName}`);
                // Inline "Install" affordance — Phase 1 opens a Notice with
                // platform-specific instructions and a clickable URL when one
                // is available. Phase 2 will perform an actual download.
                const installBtn = fontRow.createEl('button', {
                    cls: 'ert-style-wizard__font-install ert-link-accent',
                    text: 'Install',
                });
                installBtn.type = 'button';
                installBtn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const hint = diag.installHint;
                    // Build the Notice body as a DocumentFragment with a wrapper
                    // div — DocumentFragment itself doesn't expose Obsidian's
                    // createDiv/createEl helpers, but its child HTMLElement does.
                    const fragment = document.createDocumentFragment();
                    const wrapper = fragment.createDiv();
                    wrapper.createDiv({
                        text: `${diag.primaryFontName}: ${hint?.message ?? 'Install instructions unavailable.'}`,
                    });
                    if (hint?.url) {
                        const link = wrapper.createEl('a', { href: hint.url, text: hint.url });
                        link.setAttribute('target', '_blank');
                        link.setAttribute('rel', 'noopener');
                    }
                    if (hint?.steps?.length) {
                        const ul = wrapper.createEl('ul');
                        for (const step of hint.steps) ul.createEl('li', { text: step });
                    }
                    wrapper.createDiv({
                        text: 'After installing, re-open the wizard to refresh status.',
                    });
                    new Notice(fragment, 12000);
                });
            } catch {
                fontStatus.setText('');
            }
        };
        refreshFontStatus();
        fontSelect.addEventListener('change', () => {
            this.mutateSpec((s) => { s.body.font = fontSelect.value as DesignedStyleSpec['body']['font']; });
            // Remove any prior Install button before re-rendering — refreshFontStatus
            // re-creates the affordance when the new selection is missing.
            fontRow.querySelectorAll('.ert-style-wizard__font-install').forEach(el => el.remove());
            refreshFontStatus();
        });

        const sizeRow = this.fieldRow(body, 'Size (pt)');
        this.numberInput(sizeRow, this.spec.body.sizePt, 8, 14, 1, (n) => {
            this.mutateSpec((s) => { s.body.sizePt = n; });
        });

        const lineRow = this.fieldRow(body, 'Line spacing');
        const lineOptions: Array<{ value: string; label: string }> = [
            { value: '1.0',    label: 'Single' },
            { value: '1.18',   label: '1.18' },
            { value: '1.5',    label: '1.5' },
            { value: '2.0',    label: 'Double' },
            { value: 'custom', label: 'Custom' },
        ];
        const presetValues = new Set(['1.0', '1.18', '1.5', '2.0']);
        const currentLineKey = presetValues.has(this.spec.body.lineSpacing.toFixed(2))
            ? this.spec.body.lineSpacing.toFixed(2).replace(/\.0+$/, '.0').replace('1.50', '1.5').replace('2.00', '2.0').replace('1.00', '1.0')
            : presetValues.has(String(this.spec.body.lineSpacing))
                ? String(this.spec.body.lineSpacing)
                : 'custom';
        this.makeRadioGroup(lineRow, lineOptions, currentLineKey, (v) => {
            this.mutateSpec((s) => {
                if (v !== 'custom') {
                    s.body.lineSpacing = parseFloat(v);
                } else if (s.body.lineSpacing < 0.8 || s.body.lineSpacing > 3) {
                    s.body.lineSpacing = 1.5;
                }
            });
            this.refreshConfigOnly();
        });
        if (currentLineKey === 'custom') {
            const customRow = this.fieldRow(body, 'Custom spacing');
            this.numberInput(customRow, this.spec.body.lineSpacing, 0.8, 3, 0.05, (n) => {
                this.mutateSpec((s) => { s.body.lineSpacing = n; });
            });
        }

        const indentRow = this.fieldRow(body, 'Paragraph indent (em)');
        this.numberInput(indentRow, this.spec.body.paragraphIndentEm ?? 0, 0, 3, 0.5, (n) => {
            this.mutateSpec((s) => {
                if (n === 0) delete s.body.paragraphIndentEm;
                else s.body.paragraphIndentEm = n;
            });
        });

        const suppressRow = this.fieldRow(body, 'Suppress indent after break');
        this.toggleInput(suppressRow, !!this.spec.body.firstLineIndentSuppressedAfterBreak, (v) => {
            this.mutateSpec((s) => { s.body.firstLineIndentSuppressedAfterBreak = v; });
        });

        const microRow = this.fieldRow(body, 'Microtype');
        this.toggleInput(microRow, !!this.spec.body.microtype, (v) => {
            this.mutateSpec((s) => { s.body.microtype = v; });
        });
    }

    private renderHeaderSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Headers');

        const presetRow = this.fieldRow(body, 'Preset');
        const presetOptions: Array<{ value: DesignedStyleSpec['runningHeader']['mode']; label: string }> = [
            { value: 'none',                          label: 'None' },
            { value: 'centered-title',                label: 'Centered title' },
            { value: 'split-author-page-title-page',  label: 'Page+Author / Title+Page' },
            { value: 'left-title-right-context',      label: 'Left title / Right scene' },
        ];
        this.makeRadioGroup(
            presetRow,
            presetOptions.map(o => ({ value: o.value, label: o.label })),
            this.spec.runningHeader.mode,
            (v) => {
                this.mutateSpec((s) => applyHeaderPreset(s, v as DesignedStyleSpec['runningHeader']['mode']));
                this.refreshConfigOnly();
            },
        );

        // Per-corner editor (collapsed disclosure).
        const cornerDetails = body.createEl('details', { cls: 'ert-style-wizard__subsection' });
        cornerDetails.createEl('summary', {
            cls: 'ert-style-wizard__subsection-summary',
            text: 'Customize per corner',
        });
        const cornerBody = cornerDetails.createDiv({ cls: 'ert-style-wizard__corner-grid' });

        const cornerLabels: Array<{ key: keyof DesignedStyleSpec['runningHeader']; label: string }> = [
            { key: 'evenLeft', label: 'Even L' },
            { key: 'evenCenter', label: 'Even C' },
            { key: 'evenRight', label: 'Even R' },
            { key: 'oddLeft', label: 'Odd L' },
            { key: 'oddCenter', label: 'Odd C' },
            { key: 'oddRight', label: 'Odd R' },
        ];
        cornerLabels.forEach(({ key, label }) => {
            const row = cornerBody.createDiv({ cls: 'ert-style-wizard__corner-row' });
            row.createSpan({ cls: 'ert-style-wizard__corner-label', text: label });
            this.headerFieldDropdown(
                row,
                this.spec.runningHeader[key] as DesignedHeaderField | undefined,
                (next) => {
                    this.mutateSpec((s) => {
                        if (next === 'empty' || next === undefined) {
                            delete (s.runningHeader as Record<string, unknown>)[key as string];
                        } else {
                            (s.runningHeader as Record<string, unknown>)[key as string] = next;
                        }
                    });
                },
            );
        });

        const fontRow = this.fieldRow(body, 'Header font');
        this.makeRadioGroup(fontRow, [
            { value: 'inherit', label: 'Inherit body' },
            { value: 'sans',    label: 'Sans' },
        ], this.spec.runningHeader.font ?? 'inherit', (v) => {
            this.mutateSpec((s) => {
                if (v === 'inherit') delete s.runningHeader.font;
                else s.runningHeader.font = 'sans';
            });
        });

        const lsRow = this.fieldRow(body, 'Letter spacing');
        this.numberInput(lsRow, this.spec.runningHeader.letterSpacing ?? 0, 0, 25, 0.5, (n) => {
            this.mutateSpec((s) => {
                if (n === 0) delete s.runningHeader.letterSpacing;
                else s.runningHeader.letterSpacing = n;
            });
        });
    }

    private headerFieldDropdown(
        parent: HTMLElement,
        current: DesignedHeaderField | undefined,
        onChange: (next: DesignedHeaderField | undefined) => void,
    ): void {
        const select = parent.createEl('select', { cls: 'ert-input ert-style-wizard__select' });
        const options: Array<{ value: string; label: string }> = [
            { value: 'empty',         label: '(empty)' },
            { value: 'page',          label: 'Page #' },
            { value: 'author',        label: 'Author' },
            { value: 'title',         label: 'Title' },
            { value: 'scene-context', label: 'Scene context' },
            { value: 'chapter',       label: 'Chapter' },
            { value: '__literal__',   label: 'Custom literal…' },
        ];
        options.forEach((o) => select.createEl('option', { value: o.value, text: o.label }));

        let currentValue = 'empty';
        let literalValue = '';
        if (typeof current === 'string') {
            currentValue = current;
        } else if (current && typeof current === 'object' && typeof current.literal === 'string') {
            currentValue = '__literal__';
            literalValue = current.literal;
        }
        select.value = currentValue;

        const literalInput = parent.createEl('input', {
            cls: 'ert-input ert-style-wizard__corner-literal',
            attr: { type: 'text', placeholder: 'literal text' },
        });
        literalInput.value = literalValue;
        literalInput.toggleClass('ert-hidden', currentValue !== '__literal__');

        select.addEventListener('change', () => {
            const v = select.value;
            if (v === '__literal__') {
                literalInput.removeClass('ert-hidden');
                onChange({ literal: literalInput.value || '' });
            } else if (v === 'empty') {
                literalInput.addClass('ert-hidden');
                onChange(undefined);
            } else {
                literalInput.addClass('ert-hidden');
                onChange(v as Exclude<DesignedHeaderField, { literal: string }>);
            }
        });
        literalInput.addEventListener('input', () => {
            if (select.value === '__literal__') {
                onChange({ literal: literalInput.value });
            }
        });
    }

    private renderFolioSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Folio');
        const positionRow = this.fieldRow(body, 'Position');
        this.makeRadioGroup(positionRow, [
            { value: 'bottom-center', label: 'Bottom center' },
            { value: 'header',        label: 'In headers' },
            { value: 'none',          label: 'None' },
        ], this.spec.folio.position, (v) => {
            this.mutateSpec((s) => { s.folio.position = v as DesignedStyleSpec['folio']['position']; });
        });

        const formatRow = this.fieldRow(body, 'Format');
        this.makeRadioGroup(formatRow, [
            { value: 'arabic',            label: 'Arabic' },
            { value: 'roman-frontmatter', label: 'Roman (frontmatter only)' },
        ], this.spec.folio.format ?? 'arabic', (v) => {
            this.mutateSpec((s) => { s.folio.format = v as DesignedStyleSpec['folio']['format']; });
        });
    }

    private renderPartsSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Parts (Acts)');
        const renderRow = this.fieldRow(body, 'Render Part / Act pages');
        const partsOn = this.spec.parts.mode !== 'off';
        this.toggleInput(renderRow, partsOn, (v) => {
            this.mutateSpec((s) => {
                if (!v) s.parts.mode = 'off';
                else if (s.parts.mode === 'off') s.parts.mode = 'roman';
            });
            this.refreshConfigOnly();
        });

        if (partsOn) {
            const numeralRow = this.fieldRow(body, 'Numeral style');
            this.makeRadioGroup(numeralRow, [
                { value: 'roman',  label: 'Roman' },
                { value: 'arabic', label: 'Arabic' },
                { value: 'word',   label: 'Word' },
            ], this.spec.parts.mode, (v) => {
                this.mutateSpec((s) => { s.parts.mode = v as DesignedStyleSpec['parts']['mode']; });
            });
        }

        const breakRow = this.fieldRow(body, 'Page break before each part');
        this.toggleInput(breakRow, this.spec.parts.pageBreak, (v) => {
            this.mutateSpec((s) => { s.parts.pageBreak = v; });
        });

        const epRow = this.fieldRow(body, 'Show epigraph after part');
        this.toggleInput(epRow, this.spec.parts.epigraph, (v) => {
            this.mutateSpec((s) => { s.parts.epigraph = v; });
        });

        const placementRow = this.fieldRow(body, 'Epigraph placement');
        this.makeRadioGroup(placementRow, [
            { value: 'inline',   label: 'Inline' },
            { value: 'own-page', label: 'Own page' },
        ], this.spec.parts.epigraphPlacement ?? 'inline', (v) => {
            this.mutateSpec((s) => {
                s.parts.epigraphPlacement = v as 'inline' | 'own-page';
            });
        });

        const openAnyRow = this.fieldRow(body, 'Allow openany (advanced)');
        this.toggleInput(openAnyRow, !!this.spec.parts.openAny, (v) => {
            this.mutateSpec((s) => { s.parts.openAny = v; });
        });
    }

    private renderChaptersSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Chapters');
        const modeRow = this.fieldRow(body, 'Chapter style');
        this.makeRadioGroup(modeRow, [
            { value: 'off',              label: 'Off' },
            { value: 'numbered',         label: 'Numbered' },
            { value: 'titled',           label: 'Titled' },
            { value: 'numbered-titled',  label: 'Numbered + titled' },
        ], this.spec.chapters.mode, (v) => {
            this.mutateSpec((s) => { s.chapters.mode = v as DesignedStyleSpec['chapters']['mode']; });
        });

        const breakRow = this.fieldRow(body, 'Page break before chapter');
        this.toggleInput(breakRow, this.spec.chapters.pageBreak, (v) => {
            this.mutateSpec((s) => { s.chapters.pageBreak = v; });
        });

        const resetRow = this.fieldRow(body, 'Reset scene counter at chapter');
        this.toggleInput(resetRow, this.spec.chapters.resetSceneCounter, (v) => {
            this.mutateSpec((s) => { s.chapters.resetSceneCounter = v; });
        });

        const topRow = this.fieldRow(body, 'Top spacing (% page)');
        this.sliderInput(topRow, this.spec.chapters.spacing?.topFraction ?? 0, 0, 0.6, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.chapters.spacing = { ...(s.chapters.spacing ?? {}), topFraction: n };
            });
        });

        const botRow = this.fieldRow(body, 'Bottom spacing (% page)');
        this.sliderInput(botRow, this.spec.chapters.spacing?.bottomFraction ?? 0, 0, 0.3, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.chapters.spacing = { ...(s.chapters.spacing ?? {}), bottomFraction: n };
            });
        });

        const numRow = this.fieldRow(body, 'Section number depth (advanced)');
        this.makeRadioGroup(numRow, [
            { value: '0', label: '0 (no auto numbers)' },
            { value: '1', label: '1 (numbered scenes)' },
        ], String(this.spec.chapters.secnumdepth ?? 0), (v) => {
            this.mutateSpec((s) => { s.chapters.secnumdepth = (v === '1' ? 1 : 0); });
        });
    }

    private renderScenesSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Scenes');

        const openerRow = this.fieldRow(body, 'Opener style');
        this.makeRadioGroup(openerRow, [
            { value: 'inline-separator', label: 'Inline separator' },
            { value: 'dedicated-page',   label: 'Dedicated page' },
            { value: 'roman-with-rule',  label: 'Roman with rule' },
        ], this.spec.scene.opener, (v) => {
            this.mutateSpec((s) => { s.scene.opener = v as DesignedStyleSpec['scene']['opener']; });
            this.refreshConfigOnly();
        });

        if (this.spec.scene.opener === 'inline-separator') {
            const sepRow = this.fieldRow(body, 'Separator glyph');
            const input = sepRow.createEl('input', {
                cls: 'ert-input ert-style-wizard__text-input',
                attr: { type: 'text' },
            });
            input.value = this.spec.scene.separatorGlyph ?? '* * *';
            input.addEventListener('input', () => {
                this.mutateSpec((s) => { s.scene.separatorGlyph = input.value; });
            });
        }

        const headingRow = this.fieldRow(body, 'Heading mode');
        this.makeRadioGroup(headingRow, [
            { value: 'scene-number',       label: 'Number only' },
            { value: 'scene-number-title', label: 'Number + title' },
            { value: 'title-only',         label: 'Title only' },
        ], this.spec.scene.headingMode, (v) => {
            this.mutateSpec((s) => { s.scene.headingMode = v as ManuscriptSceneHeadingMode; });
        });

        const suppressRow = this.fieldRow(body, 'Suppress headers/footers on opener');
        this.toggleInput(suppressRow, this.spec.scene.suppressHeaderFooterOnOpener, (v) => {
            this.mutateSpec((s) => { s.scene.suppressHeaderFooterOnOpener = v; });
        });

        const firstWordRow = this.fieldRow(body, 'First-word emphasis on opener');
        this.toggleInput(firstWordRow, !!this.spec.scene.firstWordEmphasisOnOpener, (v) => {
            this.mutateSpec((s) => { s.scene.firstWordEmphasisOnOpener = v; });
        });

        const modesRow = this.fieldRow(body, 'Multi-mode opener pages (Signature)');
        const modesGroup = modesRow.createDiv({ cls: 'ert-style-wizard__checkbox-group' });
        const modeOptions: ManuscriptSceneHeadingMode[] = ['scene-number', 'scene-number-title', 'title-only'];
        const activeModes = new Set(this.spec.scene.openerHeadingModes ?? []);
        modeOptions.forEach((mode) => {
            const label = modesGroup.createEl('label', { cls: 'ert-style-wizard__checkbox-label' });
            const cb = label.createEl('input', { attr: { type: 'checkbox' } });
            cb.checked = activeModes.has(mode);
            label.createSpan({ text: mode });
            cb.addEventListener('change', () => {
                this.mutateSpec((s) => {
                    const next = new Set(s.scene.openerHeadingModes ?? []);
                    if (cb.checked) next.add(mode);
                    else next.delete(mode);
                    if (next.size === 0) delete s.scene.openerHeadingModes;
                    else s.scene.openerHeadingModes = Array.from(next);
                });
            });
        });

        const topRow = this.fieldRow(body, 'Opener top spacing');
        this.sliderInput(topRow, this.spec.scene.openerSpacing?.topFraction ?? 0, 0, 0.5, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.scene.openerSpacing = { ...(s.scene.openerSpacing ?? {}), topFraction: n };
            });
        });
        const botRow = this.fieldRow(body, 'Opener bottom spacing');
        this.sliderInput(botRow, this.spec.scene.openerSpacing?.bottomFraction ?? 0, 0, 0.5, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.scene.openerSpacing = { ...(s.scene.openerSpacing ?? {}), bottomFraction: n };
            });
        });
    }

    private renderEpigraphSection(parent: HTMLElement): void {
        const body = this.createSection(parent, 'Epigraph');

        const enabledRow = this.fieldRow(body, 'Enabled');
        this.toggleInput(enabledRow, this.spec.epigraph.enabled, (v) => {
            this.mutateSpec((s) => { s.epigraph.enabled = v; });
        });

        const italicRow = this.fieldRow(body, 'Italic');
        this.toggleInput(italicRow, this.spec.epigraph.italic, (v) => {
            this.mutateSpec((s) => { s.epigraph.italic = v; });
        });

        const attrRow = this.fieldRow(body, 'Attribution style');
        this.makeRadioGroup(attrRow, [
            { value: 'em-dash-caps', label: 'Em-dash + caps' },
            { value: 'plain',        label: 'Plain' },
        ], this.spec.epigraph.attributionStyle, (v) => {
            this.mutateSpec((s) => { s.epigraph.attributionStyle = v as DesignedStyleSpec['epigraph']['attributionStyle']; });
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Field primitives
    // ──────────────────────────────────────────────────────────────────────

    private fieldRow(parent: HTMLElement, label: string): HTMLElement {
        const row = parent.createDiv({ cls: 'ert-style-wizard__field-row' });
        row.createSpan({ cls: 'ert-style-wizard__field-label', text: label });
        const valueWrap = row.createDiv({ cls: 'ert-style-wizard__field-value' });
        return valueWrap;
    }

    private makeRadioGroup(
        parent: HTMLElement,
        options: Array<{ value: string; label: string }>,
        current: string,
        onChange: (value: string) => void,
    ): void {
        const group = parent.createDiv({ cls: 'ert-style-wizard__radio-group' });
        options.forEach((option) => {
            const btn = group.createEl('button', {
                cls: 'ert-style-wizard__radio-btn',
                text: option.label,
            });
            btn.type = 'button';
            if (option.value === current) btn.addClass('is-active');
            btn.addEventListener('click', () => {
                if (option.value === current) return;
                onChange(option.value);
            });
        });
    }

    private numberInput(
        parent: HTMLElement,
        value: number,
        min: number,
        max: number,
        step: number,
        onChange: (value: number) => void,
    ): void {
        const input = parent.createEl('input', {
            cls: 'ert-input ert-style-wizard__number-input',
            attr: {
                type: 'number',
                min: String(min),
                max: String(max),
                step: String(step),
            },
        });
        input.value = String(value);
        input.addEventListener('change', () => {
            const parsed = parseFloat(input.value);
            if (Number.isFinite(parsed)) onChange(parsed);
        });
    }

    private toggleInput(parent: HTMLElement, value: boolean, onChange: (value: boolean) => void): void {
        const wrapper = parent.createDiv({ cls: 'ert-style-wizard__toggle' });
        const cb = wrapper.createEl('input', { attr: { type: 'checkbox' } });
        cb.checked = value;
        cb.addEventListener('change', () => onChange(cb.checked));
    }

    private sliderInput(
        parent: HTMLElement,
        value: number,
        min: number,
        max: number,
        step: number,
        onChange: (value: number) => void,
    ): void {
        const wrapper = parent.createDiv({ cls: 'ert-style-wizard__slider' });
        const input = wrapper.createEl('input', {
            attr: {
                type: 'range',
                min: String(min),
                max: String(max),
                step: String(step),
            },
        });
        input.value = String(value);
        const display = wrapper.createSpan({ cls: 'ert-style-wizard__slider-value', text: value.toFixed(2) });
        input.addEventListener('input', () => {
            const parsed = parseFloat(input.value);
            if (!Number.isFinite(parsed)) return;
            display.setText(parsed.toFixed(2));
            onChange(parsed);
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Re-render helpers
    // ──────────────────────────────────────────────────────────────────────

    private refreshConfigOnly(): void {
        this.renderConfigSections();
        this.renderPreview();
    }

    private renderPreview(): void {
        if (!this.previewColumn) return;
        this.previewColumn.empty();

        if (!this.archetypePicked) {
            const empty = this.previewColumn.createDiv({ cls: 'ert-style-wizard__preview-empty' });
            empty.setText('Pick an archetype to begin previewing.');
            return;
        }

        const headerEl = this.previewColumn.createDiv({ cls: 'ert-style-wizard__preview-header' });
        headerEl.createSpan({
            cls: 'ert-style-wizard__preview-title',
            text: this.styleName.trim() || 'Untitled style',
        });
        const tier = headerEl.createSpan({
            cls: `ert-badgePill ert-badgePill--sm ${ERT_CLASSES.BADGE_PILL_PRO}`,
        });
        tier.createSpan({ cls: 'ert-badgePill__text', text: 'Pro' });
        headerEl.createSpan({ cls: 'ert-style-wizard__preview-meta', text: 'Preview' });

        // Pictogram block.
        const visual = this.previewColumn.createDiv({ cls: 'ert-layout-visual ert-layout-visual--cards-only' });
        try {
            const rows = getPictogramRowsFromSpec(this.spec);
            renderLayoutPictograms(visual, rows, this.spec.scene.headingMode);
        } catch (err) {
            visual.createDiv({ cls: 'ert-style-wizard__preview-error' }).setText(
                `Could not render preview: ${(err as Error).message ?? String(err)}`,
            );
        }

        // Feature list.
        try {
            const features = getLayoutFeaturesFromSpec(this.spec);
            renderLayoutFeatureList(this.previewColumn, features);
        } catch {
            // ignore — pictogram error already shown.
        }

        // Validation banner.
        const validation = validateDesignedStyleSpec(this.spec, this.styleName);
        if (validation.warnings.length > 0 || validation.errors.length > 0) {
            const banner = this.previewColumn.createDiv({
                cls: 'ert-style-wizard__validation ert-warning-warning',
            });
            const icon = banner.createSpan({ cls: 'ert-warning-icon' });
            try { setIcon(icon, 'alert-triangle'); } catch { /* test env */ }
            const list = banner.createDiv({ cls: 'ert-style-wizard__validation-list' });
            validation.errors.forEach(err => {
                list.createDiv({ cls: 'ert-style-wizard__validation-error', text: err });
            });
            validation.warnings.forEach(warn => {
                list.createDiv({ cls: 'ert-style-wizard__validation-warning', text: warn });
            });
            this.validationBannerEl = banner;
        } else {
            this.validationBannerEl = null;
        }

        // Generated LaTeX preview (collapsed).
        try {
            const latex = generateDesignedStyleTex(this.spec);
            const lines = latex.split('\n').slice(0, 30).join('\n');
            const details = this.previewColumn.createEl('details', { cls: 'ert-style-wizard__latex' });
            details.createEl('summary', { text: 'View generated LaTeX (first 30 lines)' });
            const pre = details.createEl('pre', { cls: 'ert-style-wizard__latex-pre' });
            pre.setText(lines);
        } catch (err) {
            const errBox = this.previewColumn.createDiv({ cls: 'ert-style-wizard__validation ert-warning-warning' });
            errBox.setText(`Generator error: ${(err as Error).message ?? String(err)}`);
        }

        // Disable save when there are errors.
        if (this.saveButton) {
            this.saveButton.setDisabled(validation.errors.length > 0);
        }
    }

    private async handleSave(): Promise<void> {
        const validation = validateDesignedStyleSpec(this.spec, this.styleName);
        if (validation.errors.length > 0) {
            new Notice(`Cannot save: ${validation.errors[0]}`);
            return;
        }

        try {
            const result = await this.persistLayout();
            await this.options.onSave(result);
            new Notice(this.isEditMode ? 'Style updated.' : 'Style saved.');
            this.close();
        } catch (err) {
            const msg = (err as Error)?.message ?? String(err);
            new Notice(`Failed to save style: ${msg}`);
        }
    }

    private async persistLayout(): Promise<DesignedStyleWizardResult> {
        const plugin = this.plugin;
        const layouts = plugin.settings.pandocLayouts || [];
        const trimmedName = this.styleName.trim();

        if (this.isEditMode && this.layoutId) {
            // Update existing.
            const existing = layouts.find(l => l.id === this.layoutId);
            if (!existing) {
                // Fall through to create flow if missing.
                return this.createNewLayout(trimmedName);
            }
            existing.name = trimmedName;
            existing.description = this.description.trim() || undefined;
            existing.designedSpec = JSON.parse(JSON.stringify(this.spec)) as DesignedStyleSpec;
            const tex = generateDesignedStyleTex(this.spec, { bundledLayoutId: existing.id });
            await this.writeTexFile(existing.path, tex);
            await plugin.saveSettings();
            return {
                name: trimmedName,
                description: this.description.trim(),
                spec: existing.designedSpec,
                layoutId: existing.id,
            };
        }

        return this.createNewLayout(trimmedName);
    }

    private async createNewLayout(trimmedName: string): Promise<DesignedStyleWizardResult> {
        const plugin = this.plugin;
        const layouts = plugin.settings.pandocLayouts || [];
        const existingIds = new Set(layouts.map(l => l.id));
        const slug = generateUniqueDesignedSlug(trimmedName, existingIds);
        const id = `designed-${slug}`;
        const pandocFolder = getPandocFolder(plugin);
        const designedFolder = `${pandocFolder}/designed`;
        const vaultPath = `${designedFolder}/${slug}.tex`;
        const storedPath = compactTemplatePathForStorage(plugin, vaultPath);

        const newLayout: PandocLayoutTemplate = {
            id,
            name: trimmedName,
            description: this.description.trim() || undefined,
            preset: 'novel',
            path: storedPath,
            tier: 'pro',
            templateKind: 'custom',
            origin: 'designed',
            bundled: false,
            designedSpec: JSON.parse(JSON.stringify(this.spec)) as DesignedStyleSpec,
        };

        const tex = generateDesignedStyleTex(this.spec, { bundledLayoutId: id });
        await this.writeTexFile(vaultPath, tex);

        plugin.settings.pandocLayouts = [...layouts, newLayout];
        await plugin.saveSettings();

        return {
            name: trimmedName,
            description: this.description.trim(),
            spec: newLayout.designedSpec!,
            layoutId: id,
        };
    }

    private async writeTexFile(targetPath: string, content: string): Promise<void> {
        const vault = this.plugin.app.vault;
        const normalized = normalizePath(targetPath);
        const folder = normalized.split('/').slice(0, -1).join('/');
        if (folder) {
            await this.ensureFolder(folder);
        }
        const existing = vault.getAbstractFileByPath(normalized);
        if (existing instanceof TFile) {
            await vault.modify(existing, content);
        } else {
            await vault.create(normalized, content);
        }
    }

    private async ensureFolder(folderPath: string): Promise<void> {
        const vault = this.plugin.app.vault;
        const parts = normalizePath(folderPath).split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!vault.getAbstractFileByPath(current)) {
                try {
                    await vault.createFolder(current);
                } catch {
                    // race: already created by parallel call
                }
            }
        }
    }
}

