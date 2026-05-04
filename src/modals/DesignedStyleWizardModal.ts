/*
 * Designed Style Wizard — single-page, two-column modal that lets a Pro user
 * author or edit a DesignedStyleSpec. The spec is the source of truth; the
 * generated `.tex` file is a derived artifact, regenerated on save.
 *
 * Architecture:
 *  - Left column: style identity (name + description) on top, large
 *    live preview filling the rest of the column.
 *  - Right column: a Category dropdown (Page, Body, Headers, Folio, Parts,
 *    Chapters, Scenes, Epigraph) drives a single active-panel container —
 *    only the selected category's controls render at any moment. Before an
 *    archetype has been picked the right column hosts the archetype picker
 *    instead of the dropdown.
 *  - Footer: "View LaTeX" on the left opens LatexPreviewModal with the full
 *    generated LaTeX; "Save / Cancel" on the right.
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
import { assertNever } from '../utils/assertNever';
import { LatexPreviewModal } from './LatexPreviewModal';

type WizardCategory =
    | 'page'
    | 'body'
    | 'headers'
    | 'folio'
    | 'parts'
    | 'chapters'
    | 'scenes'
    | 'epigraph';

const WIZARD_CATEGORIES: ReadonlyArray<{ value: WizardCategory; label: string }> = [
    { value: 'page',     label: 'Page' },
    { value: 'body',     label: 'Body' },
    { value: 'headers',  label: 'Headers' },
    { value: 'folio',    label: 'Folio' },
    { value: 'parts',    label: 'Parts' },
    { value: 'chapters', label: 'Chapters' },
    { value: 'scenes',   label: 'Scenes' },
    { value: 'epigraph', label: 'Epigraph' },
];

// ──────────────────────────────────────────────────────────────────────────
// Visual-preset state model (Wizard UX v1.2)
//
// Three preset axes derived from the current spec. Each render call
// re-derives — there is NO redundant state stored on the modal. When values
// don't match a preset exactly, the derived state is `'custom'` (not
// clickable; shown only as visual feedback).
// ──────────────────────────────────────────────────────────────────────────
export type PageFeel = 'compact' | 'balanced' | 'airy' | 'custom';
export type LineSpacingPreset = 'tight' | 'standard' | 'airy' | 'custom';
export type HeaderStyle = 'none' | 'minimal' | 'literary' | 'custom';

const PAGE_FEEL_MARGIN_INCHES: Record<Exclude<PageFeel, 'custom'>, number> = {
    compact:  0.75,
    balanced: 1.0,
    airy:     1.25,
};

const LINE_SPACING_VALUES: Record<Exclude<LineSpacingPreset, 'custom'>, number> = {
    tight:    1.0,
    standard: 1.5,
    airy:     2.0,
};

const HEADER_STYLE_MODES: Record<
    Exclude<HeaderStyle, 'custom'>,
    DesignedStyleSpec['runningHeader']['mode']
> = {
    none:     'none',
    minimal:  'centered-title',
    literary: 'split-author-page-title-page',
};

/**
 * Derive the Page Feel preset from a spec by exact-equality across the 4
 * margins. Any divergence (mirrored asymmetric cases like Signature) returns
 * `'custom'`.
 */
export function derivePageFeel(spec: DesignedStyleSpec): PageFeel {
    const m = spec.margins;
    if (m.topIn !== m.bottomIn || m.topIn !== m.leftIn || m.topIn !== m.rightIn) {
        return 'custom';
    }
    const v = m.topIn;
    if (v === PAGE_FEEL_MARGIN_INCHES.compact)  return 'compact';
    if (v === PAGE_FEEL_MARGIN_INCHES.balanced) return 'balanced';
    if (v === PAGE_FEEL_MARGIN_INCHES.airy)     return 'airy';
    return 'custom';
}

/** Derive the line-spacing preset by exact-equality on body.lineSpacing. */
export function deriveSpacingPreset(spec: DesignedStyleSpec): LineSpacingPreset {
    const v = spec.body.lineSpacing;
    if (v === LINE_SPACING_VALUES.tight)    return 'tight';
    if (v === LINE_SPACING_VALUES.standard) return 'standard';
    if (v === LINE_SPACING_VALUES.airy)     return 'airy';
    return 'custom';
}

/**
 * Derive the header-style preset from `runningHeader.mode`. Modes outside the
 * three preset values (e.g. `'left-title-right-context'`) collapse to
 * `'custom'`.
 */
export function deriveHeaderStyle(spec: DesignedStyleSpec): HeaderStyle {
    const mode = spec.runningHeader.mode;
    if (mode === HEADER_STYLE_MODES.none)     return 'none';
    if (mode === HEADER_STYLE_MODES.minimal)  return 'minimal';
    if (mode === HEADER_STYLE_MODES.literary) return 'literary';
    return 'custom';
}

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

    private previewColumn: HTMLElement | null = null;
    private rightColumn: HTMLElement | null = null;
    private categoryRow: HTMLElement | null = null;
    private activePanel: HTMLElement | null = null;
    private categorySelect: HTMLSelectElement | null = null;
    private saveButton: ButtonComponent | null = null;
    private validationBannerEl: HTMLElement | null = null;
    private activeCategory: WizardCategory = 'page';

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
        const badgeRow = header.createDiv({ cls: 'ert-modal-badge-row' });
        const proPill = badgeRow.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}`,
        });
        const proPillIcon = proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(proPillIcon, 'signature');
        proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
        badgeRow.createSpan({ cls: 'ert-modal-badge', text: this.isEditMode ? 'EDIT' : 'DESIGN' });
        header.createDiv({
            cls: 'ert-modal-title',
            text: this.isEditMode ? 'Edit designed style' : 'Design your own style',
        });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Configure page, body, headers, folio, parts, chapters, scenes, and epigraph. The preview updates live.',
        });

        // Two-column main grid.
        const main = contentEl.createDiv({ cls: 'ert-style-wizard__main' });

        // Left column: identity (name/description) + live preview.
        const colLeft = main.createDiv({ cls: 'ert-style-wizard__col-left' });
        const metaBlock = colLeft.createDiv({ cls: 'ert-style-wizard__meta' });
        this.renderMetaBlock(metaBlock);
        this.previewColumn = colLeft.createDiv({ cls: 'ert-style-wizard__preview' });

        // Right column: category selector + active-panel.
        this.rightColumn = main.createDiv({ cls: 'ert-style-wizard__col-right' });
        this.categoryRow = this.rightColumn.createDiv({ cls: 'ert-style-wizard__category-row' });
        this.activePanel = this.rightColumn.createDiv({ cls: 'ert-style-wizard__active-panel' });

        this.renderRightColumn();

        // Footer: View LaTeX (left) + Save/Cancel (right).
        const footer = contentEl.createDiv({ cls: 'ert-modal-actions ert-style-wizard__actions' });
        const footerLeft = footer.createDiv({ cls: 'ert-style-wizard__actions-left' });
        const footerRight = footer.createDiv({ cls: 'ert-style-wizard__actions-right' });

        new ButtonComponent(footerLeft)
            .setButtonText('View LaTeX')
            .onClick(() => { this.openLatexPreview(); });

        this.saveButton = new ButtonComponent(footerRight)
            .setButtonText(this.isEditMode ? 'Update style' : 'Save style')
            .setCta()
            .onClick(() => { void this.handleSave(); });
        new ButtonComponent(footerRight)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // Initial preview render — runs after saveButton is constructed so
        // the validation-driven disabled toggle is wired from the start.
        this.renderPreview();
        this.applyPreviewFocusClass();
    }

    onClose(): void {
        this.contentEl.empty();
        this.previewColumn = null;
        this.rightColumn = null;
        this.categoryRow = null;
        this.activePanel = null;
        this.categorySelect = null;
        this.saveButton = null;
        this.validationBannerEl = null;
    }

    private openLatexPreview(): void {
        let latex: string;
        try {
            latex = generateDesignedStyleTex(this.spec);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`Generator error: ${msg}`);
            return;
        }
        const trimmed = this.styleName.trim();
        const title = trimmed.length > 0 ? trimmed : 'Untitled style';
        new LatexPreviewModal(this.app, { latex, title }).open();
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

    }

    private renderArchetypeOverlay(parent: HTMLElement): void {
        const overlay = parent.createDiv({ cls: 'ert-style-wizard__archetype' });
        overlay.createDiv({
            cls: 'ert-style-wizard__archetype-title',
            text: 'Start from an archetype',
        });
        overlay.createDiv({
            cls: 'ert-style-wizard__archetype-subtitle',
            text: 'Pick a starting point — every value is editable afterward.',
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
    }

    private refreshFromArchetype(): void {
        // Re-render: meta block (name field reflects new default), right
        // column (now shows category dropdown + active panel), and preview.
        const meta = this.contentEl.querySelector('.ert-style-wizard__meta') as HTMLElement | null;
        if (meta) this.renderMetaBlock(meta);
        this.renderRightColumn();
        this.renderPreview();
    }

    private mutateSpec(mutator: (spec: DesignedStyleSpec) => void): void {
        mutator(this.spec);
        this.renderPreview();
    }

    /**
     * Render the right column. Before an archetype is picked the active panel
     * hosts the archetype picker and the dropdown is hidden. After a pick,
     * the dropdown drives a single category panel.
     */
    private renderRightColumn(): void {
        const categoryRow = this.categoryRow;
        const activePanel = this.activePanel;
        if (!categoryRow || !activePanel) return;
        categoryRow.empty();
        activePanel.empty();

        if (!this.archetypePicked) {
            categoryRow.addClass('ert-hidden');
            this.categorySelect = null;
            this.renderArchetypeOverlay(activePanel);
            return;
        }

        categoryRow.removeClass('ert-hidden');
        this.renderCategorySelector(categoryRow);
        this.renderActiveCategoryPanel();
    }

    private renderCategorySelector(parent: HTMLElement): void {
        parent.createEl('label', {
            cls: 'ert-style-wizard__field-label',
            text: 'Category',
        });
        const select = parent.createEl('select', {
            cls: 'ert-input ert-input--md ert-style-wizard__select ert-style-wizard__category-select',
        });
        WIZARD_CATEGORIES.forEach(({ value, label }) => {
            const opt = select.createEl('option', { value, text: label });
            if (value === this.activeCategory) opt.selected = true;
        });
        select.addEventListener('change', () => {
            // select.value is constrained to one of the rendered option
            // values, which exactly enumerate WizardCategory; the cast is
            // safe and exhaustive without any literal fallback.
            const next = select.value as WizardCategory;
            this.activateCategory(next);
        });
        this.categorySelect = select;
    }

    private activateCategory(category: WizardCategory): void {
        this.activeCategory = category;
        this.renderActiveCategoryPanel();
        this.applyPreviewFocusClass();
    }

    /**
     * Toggle a focus-* class on the preview column matching the active
     * category. CSS subtly highlights the relevant region of the preview
     * (page body, header strip, etc.) — opacity/border tweaks only, no
     * layout shift.
     */
    private applyPreviewFocusClass(): void {
        if (!this.previewColumn) return;
        const all: ReadonlyArray<WizardCategory> = ['page', 'body', 'headers', 'folio', 'parts', 'chapters', 'scenes', 'epigraph'];
        for (const cat of all) {
            this.previewColumn.removeClass(`ert-style-wizard__preview--focus-${cat}`);
        }
        this.previewColumn.addClass(`ert-style-wizard__preview--focus-${this.activeCategory}`);
    }

    /** Render the form controls for the currently-selected category. */
    private renderActiveCategoryPanel(): void {
        const panel = this.activePanel;
        if (!panel) return;
        panel.empty();
        const cat = this.activeCategory;
        switch (cat) {
            case 'page':     this.renderPageSection(panel);     return;
            case 'body':     this.renderBodySection(panel);     return;
            case 'headers':  this.renderHeaderSection(panel);   return;
            case 'folio':    this.renderFolioSection(panel);    return;
            case 'parts':    this.renderPartsSection(panel);    return;
            case 'chapters': this.renderChaptersSection(panel); return;
            case 'scenes':   this.renderScenesSection(panel);   return;
            case 'epigraph': this.renderEpigraphSection(panel); return;
        }
        assertNever(cat, 'renderActiveCategoryPanel');
    }

    private renderPageSection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);
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

        // Page Feel visual presets — quick-pick row above the cross. The
        // numeric cross stays below for fine-tune; presets snap all four
        // margins to a uniform value.
        this.renderPageFeelRow(body);

        // Cross widget for margins (T / L · center · R / B).
        this.renderMarginCross(body);

        const mirroredRow = this.fieldRow(body, 'Mirrored margins (book binding)');
        this.toggleInput(mirroredRow, !!this.spec.margins.mirrored, (v) => {
            this.mutateSpec((s) => { s.margins.mirrored = v; });
        });
    }

    /**
     * Page Feel quick-pick row. Three icon cards (Compact / Balanced / Airy)
     * snap all four margins to a uniform inch value. A fourth "Custom" card
     * is rendered only when the current margins don't match any preset; it's
     * non-interactive — purely visual feedback that the user has fine-tuned
     * via the cross.
     */
    private renderPageFeelRow(parent: HTMLElement): void {
        const current = derivePageFeel(this.spec);
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        const presets: Array<{ value: Exclude<PageFeel, 'custom'>; label: string; lines: 'dense' | 'normal' | 'sparse' }> = [
            { value: 'compact',  label: 'Compact',  lines: 'dense'  },
            { value: 'balanced', label: 'Balanced', lines: 'normal' },
            { value: 'airy',     label: 'Airy',     lines: 'sparse' },
        ];
        presets.forEach(({ value, label, lines }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `${label} margins`);
            if (current === value) card.addClass('is-active');
            // Mini page diagram: outer page rectangle + inset body block.
            const diagram = card.createDiv({ cls: `ert-style-wizard__preset-page ert-style-wizard__preset-page--${value}` });
            const block = diagram.createDiv({ cls: 'ert-style-wizard__preset-page-block' });
            for (let i = 0; i < 4; i += 1) {
                block.createDiv({ cls: `ert-style-wizard__preset-page-line ert-style-wizard__preset-page-line--${lines}` });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                const inches = PAGE_FEEL_MARGIN_INCHES[value];
                this.mutateSpec((s) => {
                    s.margins.topIn = inches;
                    s.margins.bottomIn = inches;
                    s.margins.leftIn = inches;
                    s.margins.rightIn = inches;
                });
                this.refreshConfigOnly();
            };
            card.addEventListener('click', apply);
            card.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    apply();
                }
            });
        });
        if (current === 'custom') {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card is-active is-readonly' });
            card.setAttribute('aria-disabled', 'true');
            const diagram = card.createDiv({ cls: 'ert-style-wizard__preset-page ert-style-wizard__preset-page--custom' });
            const block = diagram.createDiv({ cls: 'ert-style-wizard__preset-page-block' });
            for (let i = 0; i < 4; i += 1) {
                block.createDiv({ cls: 'ert-style-wizard__preset-page-line ert-style-wizard__preset-page-line--normal' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: 'Custom' });
        }
    }

    /**
     * Line-spacing visual preset row. Three chips (Tight 1.0 / Standard 1.5
     * / Airy 2.0). The existing radio + custom number input below cover
     * non-preset values like 1.18 (Modern Classic), which derive to
     * `'custom'` here and render a non-interactive feedback chip.
     */
    private renderLineSpacingPresetRow(parent: HTMLElement): void {
        const current = deriveSpacingPreset(this.spec);
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        const presets: Array<{ value: Exclude<LineSpacingPreset, 'custom'>; label: string; lineCount: number }> = [
            { value: 'tight',    label: 'Tight',    lineCount: 6 },
            { value: 'standard', label: 'Standard', lineCount: 5 },
            { value: 'airy',     label: 'Airy',     lineCount: 4 },
        ];
        presets.forEach(({ value, label, lineCount }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `${label} line spacing`);
            if (current === value) card.addClass('is-active');
            const stack = card.createDiv({ cls: `ert-style-wizard__preset-lines ert-style-wizard__preset-lines--${value}` });
            for (let i = 0; i < lineCount; i += 1) {
                stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                const lineSpacing = LINE_SPACING_VALUES[value];
                this.mutateSpec((s) => { s.body.lineSpacing = lineSpacing; });
                this.refreshConfigOnly();
            };
            card.addEventListener('click', apply);
            card.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    apply();
                }
            });
        });
        if (current === 'custom') {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card is-active is-readonly' });
            card.setAttribute('aria-disabled', 'true');
            const stack = card.createDiv({ cls: 'ert-style-wizard__preset-lines ert-style-wizard__preset-lines--standard' });
            for (let i = 0; i < 5; i += 1) {
                stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: 'Custom' });
        }
    }

    /**
     * Header-style visual preset row. Three header strips (None / Minimal /
     * Literary). Selecting one calls `applyHeaderPreset` with the
     * corresponding mode. Modes outside the three (e.g.
     * `'left-title-right-context'`) derive to `'custom'`.
     */
    private renderHeaderStyleRow(parent: HTMLElement): void {
        const current = deriveHeaderStyle(this.spec);
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        const presets: Array<{ value: Exclude<HeaderStyle, 'custom'>; label: string; render: (strip: HTMLElement) => void }> = [
            {
                value: 'none', label: 'None',
                render: (strip) => {
                    strip.addClass('ert-style-wizard__preset-header--none');
                },
            },
            {
                value: 'minimal', label: 'Minimal',
                render: (strip) => {
                    const center = strip.createDiv({ cls: 'ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--center' });
                    center.createDiv({ cls: 'ert-style-wizard__preset-header-text' });
                },
            },
            {
                value: 'literary', label: 'Literary',
                render: (strip) => {
                    const left = strip.createDiv({ cls: 'ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--left' });
                    left.createDiv({ cls: 'ert-style-wizard__preset-header-text ert-style-wizard__preset-header-text--short' });
                    const right = strip.createDiv({ cls: 'ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--right' });
                    right.createDiv({ cls: 'ert-style-wizard__preset-header-text ert-style-wizard__preset-header-text--short' });
                },
            },
        ];
        presets.forEach(({ value, label, render }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `${label} header`);
            if (current === value) card.addClass('is-active');
            const strip = card.createDiv({ cls: 'ert-style-wizard__preset-header-strip' });
            render(strip);
            // Filler page-body lines below the header strip so each card looks
            // like a tiny page top.
            const stack = card.createDiv({ cls: 'ert-style-wizard__preset-header-body' });
            for (let i = 0; i < 4; i += 1) {
                stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                const mode = HEADER_STYLE_MODES[value];
                this.mutateSpec((s) => applyHeaderPreset(s, mode));
                this.refreshConfigOnly();
            };
            card.addEventListener('click', apply);
            card.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    apply();
                }
            });
        });
        if (current === 'custom') {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card is-active is-readonly' });
            card.setAttribute('aria-disabled', 'true');
            const strip = card.createDiv({ cls: 'ert-style-wizard__preset-header-strip' });
            const left = strip.createDiv({ cls: 'ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--left' });
            left.createDiv({ cls: 'ert-style-wizard__preset-header-text ert-style-wizard__preset-header-text--short' });
            const right = strip.createDiv({ cls: 'ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--right' });
            right.createDiv({ cls: 'ert-style-wizard__preset-header-text ert-style-wizard__preset-header-text--short' });
            const stack = card.createDiv({ cls: 'ert-style-wizard__preset-header-body' });
            for (let i = 0; i < 4; i += 1) {
                stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: 'Custom' });
        }
    }

    /** Framer-style cross widget for the four page margins. */
    private renderMarginCross(parent: HTMLElement): void {
        const cross = parent.createDiv({ cls: 'ert-style-wizard__margin-cross' });

        const cellTop = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--top' });
        this.marginInput(cellTop, this.spec.margins.topIn, (n) => {
            this.mutateSpec((s) => { s.margins.topIn = n; });
        });
        cellTop.createSpan({ cls: 'ert-style-wizard__margin-axis', text: 'T' });

        const cellLeft = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--left' });
        this.marginInput(cellLeft, this.spec.margins.leftIn, (n) => {
            this.mutateSpec((s) => { s.margins.leftIn = n; });
        });
        cellLeft.createSpan({ cls: 'ert-style-wizard__margin-axis', text: 'L' });

        const cellCenter = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--center' });
        const iconWrap = cellCenter.createSpan({ cls: 'ert-style-wizard__margin-icon' });
        try { setIcon(iconWrap, 'rectangle-vertical'); } catch { /* test env */ }

        const cellRight = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--right' });
        cellRight.createSpan({ cls: 'ert-style-wizard__margin-axis', text: 'R' });
        this.marginInput(cellRight, this.spec.margins.rightIn, (n) => {
            this.mutateSpec((s) => { s.margins.rightIn = n; });
        });

        const cellBot = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--bottom' });
        this.marginInput(cellBot, this.spec.margins.bottomIn, (n) => {
            this.mutateSpec((s) => { s.margins.bottomIn = n; });
        });
        cellBot.createSpan({ cls: 'ert-style-wizard__margin-axis', text: 'B' });
    }

    private marginInput(
        parent: HTMLElement,
        value: number,
        onChange: (value: number) => void,
    ): void {
        const input = parent.createEl('input', {
            cls: 'ert-input ert-style-wizard__margin-input',
            attr: { type: 'number', min: '0.25', max: '2.5', step: '0.05' },
        });
        input.value = String(value);
        input.addEventListener('change', () => {
            const parsed = parseFloat(input.value);
            if (Number.isFinite(parsed)) onChange(parsed);
        });
    }

    private renderBodySection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);

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

        // Line-spacing visual presets (Tight / Standard / Airy). Quick-pick
        // chips above the existing radio. The radio + custom number input
        // remain below for non-preset values like 1.18 (Modern Classic).
        this.renderLineSpacingPresetRow(body);

        // Compact row: Size (pt) + Line spacing radio (+ Custom spacing input when active).
        const sizeLineRow = this.compactRow(body);
        const sizeCell = this.compactCell(sizeLineRow, 'Size (pt)');
        this.numberInput(sizeCell, this.spec.body.sizePt, 8, 14, 1, (n) => {
            this.mutateSpec((s) => { s.body.sizePt = n; });
        });

        const lineRow = this.compactCell(sizeLineRow, 'Line spacing');
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
            const customCell = this.compactCell(sizeLineRow, 'Custom spacing');
            this.numberInput(customCell, this.spec.body.lineSpacing, 0.8, 3, 0.05, (n) => {
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
        const body = this.createPanelBody(parent);

        // Header style visual presets (None / Minimal / Literary). Quick-pick
        // strips above the existing preset radio. The radio retains
        // `'left-title-right-context'` (Contemporary's split mode) which has
        // no visual preset and derives to `'custom'`.
        this.renderHeaderStyleRow(body);

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
        const body = this.createPanelBody(parent);
        // Compact row: Position + Format side-by-side.
        const folioRow = this.compactRow(body);
        const positionCell = this.compactCell(folioRow, 'Position');
        this.makeRadioGroup(positionCell, [
            { value: 'bottom-center', label: 'Bottom center' },
            { value: 'header',        label: 'In headers' },
            { value: 'none',          label: 'None' },
        ], this.spec.folio.position, (v) => {
            this.mutateSpec((s) => { s.folio.position = v as DesignedStyleSpec['folio']['position']; });
        });

        const formatCell = this.compactCell(folioRow, 'Format');
        this.makeRadioGroup(formatCell, [
            { value: 'arabic',            label: 'Arabic' },
            { value: 'roman-frontmatter', label: 'Roman (frontmatter only)' },
        ], this.spec.folio.format ?? 'arabic', (v) => {
            this.mutateSpec((s) => { s.folio.format = v as DesignedStyleSpec['folio']['format']; });
        });
    }

    private renderPartsSection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);
        // Compact row: Render toggle + (when on) Numeral style radio inline.
        const headerRow = this.compactRow(body);
        const renderCell = this.compactCell(headerRow, 'Render Part / Act pages');
        const partsOn = this.spec.parts.mode !== 'off';
        this.toggleInput(renderCell, partsOn, (v) => {
            this.mutateSpec((s) => {
                if (!v) s.parts.mode = 'off';
                else if (s.parts.mode === 'off') s.parts.mode = 'roman';
            });
            this.refreshConfigOnly();
        });

        if (partsOn) {
            const numeralCell = this.compactCell(headerRow, 'Numeral style');
            this.makeRadioGroup(numeralCell, [
                { value: 'roman',  label: 'Roman' },
                { value: 'arabic', label: 'Arabic' },
                { value: 'word',   label: 'Word' },
            ], this.spec.parts.mode, (v) => {
                this.mutateSpec((s) => { s.parts.mode = v as DesignedStyleSpec['parts']['mode']; });
            });
        }

        // Compact row: page-break, epigraph, openAny toggles + placement radio.
        const togglesRow = this.compactRow(body);
        const breakCell = this.compactCell(togglesRow, 'Page break before part');
        this.toggleInput(breakCell, this.spec.parts.pageBreak, (v) => {
            this.mutateSpec((s) => { s.parts.pageBreak = v; });
        });

        const epCell = this.compactCell(togglesRow, 'Epigraph after part');
        this.toggleInput(epCell, this.spec.parts.epigraph, (v) => {
            this.mutateSpec((s) => { s.parts.epigraph = v; });
        });

        const openAnyCell = this.compactCell(togglesRow, 'Allow openany');
        this.toggleInput(openAnyCell, !!this.spec.parts.openAny, (v) => {
            this.mutateSpec((s) => { s.parts.openAny = v; });
        });

        const placementCell = this.compactCell(togglesRow, 'Epigraph placement');
        this.makeRadioGroup(placementCell, [
            { value: 'inline',   label: 'Inline' },
            { value: 'own-page', label: 'Own page' },
        ], this.spec.parts.epigraphPlacement ?? 'inline', (v) => {
            this.mutateSpec((s) => {
                s.parts.epigraphPlacement = v as 'inline' | 'own-page';
            });
        });
    }

    private renderChaptersSection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);
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

        // Compact row: Top spacing + Bottom spacing sliders.
        const spacingRow = this.compactRow(body);
        const topCell = this.compactCell(spacingRow, 'Top spacing (% page)');
        this.sliderInput(topCell, this.spec.chapters.spacing?.topFraction ?? 0, 0, 0.6, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.chapters.spacing = { ...(s.chapters.spacing ?? {}), topFraction: n };
            });
        });

        const botCell = this.compactCell(spacingRow, 'Bottom spacing (% page)');
        this.sliderInput(botCell, this.spec.chapters.spacing?.bottomFraction ?? 0, 0, 0.3, 0.02, (n) => {
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
        const body = this.createPanelBody(parent);

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
        const body = this.createPanelBody(parent);

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

    /**
     * Returns a vertically-stacked container for one category's controls.
     * The category dropdown serves as the navigation, so no header/title is
     * rendered here — section names would just duplicate the dropdown's
     * current value.
     */
    private createPanelBody(parent: HTMLElement): HTMLElement {
        return parent.createDiv({ cls: 'ert-style-wizard__section-body' });
    }

    private fieldRow(parent: HTMLElement, label: string): HTMLElement {
        const row = parent.createDiv({ cls: 'ert-style-wizard__field-row' });
        row.createSpan({ cls: 'ert-style-wizard__field-label', text: label });
        const valueWrap = row.createDiv({ cls: 'ert-style-wizard__field-value' });
        return valueWrap;
    }

    /**
     * Compact horizontal row: a single row that holds multiple short controls
     * side-by-side. Each control is grouped with its own inline label. Returns
     * the row element so callers can append cells via `compactCell`.
     */
    private compactRow(parent: HTMLElement): HTMLElement {
        return parent.createDiv({ cls: 'ert-style-wizard__field-row ert-style-wizard__field-row--compact' });
    }

    /** Append a labeled cell inside a compact row, returning the value wrap. */
    private compactCell(row: HTMLElement, label: string): HTMLElement {
        const cell = row.createDiv({ cls: 'ert-style-wizard__field-value' });
        cell.createSpan({ cls: 'ert-style-wizard__field-label', text: label });
        return cell;
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

    /**
     * Redraw the active category panel — used when a control flips a flag
     * that should add/remove sibling controls in the same panel (e.g.
     * choosing "custom" paper size reveals width/height inputs).
     */
    private refreshConfigOnly(): void {
        this.renderActiveCategoryPanel();
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
        headerEl.createSpan({ cls: 'ert-style-wizard__preview-meta', text: 'Preview' });

        // Side-by-side: features on the left (specs), pictograms on the right.
        // Mirrors the settings PDF Style card pattern; preview never scrolls.
        const previewGrid = this.previewColumn.createDiv({ cls: 'ert-style-wizard__preview-grid' });
        const featureCell = previewGrid.createDiv({ cls: 'ert-style-wizard__preview-features' });
        const visualCell = previewGrid.createDiv({ cls: 'ert-style-wizard__preview-visual' });

        try {
            const features = getLayoutFeaturesFromSpec(this.spec);
            renderLayoutFeatureList(featureCell, features);
        } catch {
            // ignore — pictogram error (if any) shown below.
        }

        const visual = visualCell.createDiv({ cls: 'ert-layout-visual ert-layout-visual--cards-only' });
        try {
            const rows = getPictogramRowsFromSpec(this.spec);
            renderLayoutPictograms(visual, rows, this.spec.scene.headingMode);
        } catch (err) {
            visual.createDiv({ cls: 'ert-style-wizard__preview-error' }).setText(
                `Could not render preview: ${(err as Error).message ?? String(err)}`,
            );
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

        // Sanity-check LaTeX generation — surface any generator error in the
        // preview column. The actual full-LaTeX viewer is opened from the
        // footer "View LaTeX" button (LatexPreviewModal).
        try {
            generateDesignedStyleTex(this.spec);
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

