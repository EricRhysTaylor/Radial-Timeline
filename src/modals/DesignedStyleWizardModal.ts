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
    applyHeaderPreset,
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

// Icons chosen for legibility at 16px and so each one reads distinctly from
// its neighbours. `panel-top` was visually ambiguous (rendered as a thin top
// bar) — `heading-1` makes Headers immediately recognisable, etc.
const WIZARD_CATEGORIES: ReadonlyArray<{ value: WizardCategory; label: string; icon: string }> = [
    { value: 'page',     label: 'Page',     icon: 'file-text' },
    { value: 'body',     label: 'Body',     icon: 'align-left' },
    { value: 'headers',  label: 'Headers',  icon: 'heading-1' },
    { value: 'folio',    label: 'Folio',    icon: 'hash' },
    { value: 'parts',    label: 'Parts',    icon: 'bookmark' },
    { value: 'chapters', label: 'Chapters', icon: 'book-open' },
    { value: 'scenes',   label: 'Scenes',   icon: 'clapperboard' },
    { value: 'epigraph', label: 'Epigraph', icon: 'quote' },
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
export type HeaderStyle = 'none' | 'minimal' | 'literary' | 'contemporary' | 'custom';

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
    none:         'none',
    minimal:      'centered-title',
    literary:     'split-author-page-title-page',
    contemporary: 'left-title-right-context',
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
 * Derive the header-style preset from `runningHeader.mode`. Returns 'custom'
 * only when the mode is none of the four named presets.
 */
export function deriveHeaderStyle(spec: DesignedStyleSpec): HeaderStyle {
    const mode = spec.runningHeader.mode;
    if (mode === HEADER_STYLE_MODES.none)         return 'none';
    if (mode === HEADER_STYLE_MODES.minimal)      return 'minimal';
    if (mode === HEADER_STYLE_MODES.literary)     return 'literary';
    if (mode === HEADER_STYLE_MODES.contemporary) return 'contemporary';
    return 'custom';
}

/**
 * Per-preset baseline for axes the wizard surfaces (font, letter spacing).
 * `applyHeaderPreset` only resets the per-corner slots and the mode; it
 * does NOT touch font or letterSpacing. So those persist across preset
 * switches and the modified-state check has to compare against this static
 * map of "what the preset implies" rather than what the function would
 * produce at runtime.
 */
const HEADER_PRESET_DEFAULTS: Record<Exclude<HeaderStyle, 'custom'>, {
    font: DesignedStyleSpec['runningHeader']['font'];
    letterSpacing: number | undefined;
}> = {
    none:         { font: undefined, letterSpacing: undefined },
    minimal:      { font: undefined, letterSpacing: undefined },
    literary:     { font: undefined, letterSpacing: 15.0 },
    contemporary: { font: 'sans',    letterSpacing: undefined },
};

/**
 * Has the user customized any per-corner field, font, or letterSpacing
 * after picking a preset?
 *
 * Two checks:
 *   1. Per-corner slots — clone the spec, re-run `applyHeaderPreset`, compare.
 *   2. Font + letterSpacing — compare against the static preset defaults map
 *      since `applyHeaderPreset` doesn't manage those axes.
 *
 * Returns false for 'custom' mode (no baseline to diverge from).
 */
export function isHeaderPresetModified(spec: DesignedStyleSpec): boolean {
    const style = deriveHeaderStyle(spec);
    if (style === 'custom') return false;

    // Per-corner comparison via re-applied clone.
    const clone = JSON.parse(JSON.stringify(spec)) as DesignedStyleSpec;
    applyHeaderPreset(clone, spec.runningHeader.mode);
    const slots: Array<keyof DesignedStyleSpec['runningHeader']> = [
        'evenLeft', 'evenCenter', 'evenRight',
        'oddLeft',  'oddCenter',  'oddRight',
    ];
    for (const slot of slots) {
        const live  = JSON.stringify(spec.runningHeader[slot]  ?? null);
        const fresh = JSON.stringify(clone.runningHeader[slot] ?? null);
        if (live !== fresh) return true;
    }

    // Font + letterSpacing comparison via the static preset defaults map.
    const expected = HEADER_PRESET_DEFAULTS[style];
    if ((spec.runningHeader.font ?? undefined) !== expected.font) return true;
    if ((spec.runningHeader.letterSpacing ?? undefined) !== expected.letterSpacing) return true;

    return false;
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

// applyHeaderPreset moved to src/publishing/designedStyle.ts so the .tex
// generator can use it to compute the preset baseline. Re-export here so
// existing imports of `applyHeaderPreset` from this module keep working.
export { applyHeaderPreset } from '../publishing/designedStyle';

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
        if (paperWidthIn > 0 && (paperWidthIn < 4 || paperWidthIn > 12)) {
            warnings.push(`Custom paper width (${paperWidthIn} in) is outside the common print range (4–12 in).`);
        }
        if (paperHeightIn > 0 && (paperHeightIn < 6 || paperHeightIn > 14)) {
            warnings.push(`Custom paper height (${paperHeightIn} in) is outside the common print range (6–14 in).`);
        }
        // Aspect ratio sanity — most novels and trade books are taller than
        // they are wide, with H/W between ~1.3 and ~1.7. Flag extreme cases.
        if (paperWidthIn > 0 && paperHeightIn > 0) {
            const ratio = paperHeightIn / paperWidthIn;
            if (ratio < 1.0) {
                warnings.push('Custom paper is wider than tall (landscape) — unusual for prose books.');
            } else if (ratio > 2.0) {
                warnings.push('Custom paper is more than twice as tall as wide — unusual proportion.');
            }
        }
    }

    const m = spec.margins;
    if (paperHeightIn > 0 && (m.topIn + m.bottomIn) >= paperHeightIn) {
        errors.push('Top + bottom margins leave no room for body text.');
    }
    if (paperWidthIn > 0 && (m.leftIn + m.rightIn) >= paperWidthIn) {
        errors.push('Left + right margins leave no room for body text.');
    }
    // Mirrored books: convention is that the inner (binding) margin is wider
    // than the outer to compensate for the spine. When mirrored is on, leftIn
    // is the inner edge — flagging when it's narrower than rightIn.
    if (m.mirrored && m.leftIn < m.rightIn) {
        warnings.push(
            `Inner margin (${m.leftIn} in) is narrower than outer (${m.rightIn} in). ` +
            `Print convention is the opposite — the binding edge usually has more space.`,
        );
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

    // Header / Folio conflict detection. The page number can be emitted
    // both by the header (when a per-corner override uses the 'page' field
    // OR a named preset like Literary already bakes \thepage into CE/CO)
    // AND by renderFolio (only when folio.position === 'bottom-center' —
    // 'header' position is purely a declarative hint and emits nothing).
    //
    // Real-world conflict shapes:
    //   • bottom-center folio + per-corner override using 'page'
    //     → page # appears once in the footer AND once in the corner
    //   • Literary preset (which bakes \thepage into CE/CO) + per-corner
    //     override that ALSO uses 'page' in another corner
    //     → page # appears in two header positions
    //
    // We catch both shapes via a single check: a corner uses 'page' AND
    // another emission (footer OR named-mode bake-in) is also active.
    const cornerKeys: Array<keyof DesignedStyleSpec['runningHeader']> = [
        'evenLeft', 'evenCenter', 'evenRight',
        'oddLeft',  'oddCenter',  'oddRight',
    ];
    const cornerWithPage = cornerKeys.find(k => spec.runningHeader[k] === 'page');
    const namedModeAlreadyEmitsPage = spec.runningHeader.mode === 'split-author-page-title-page';
    if (cornerWithPage && (spec.folio.position === 'bottom-center' || namedModeAlreadyEmitsPage)) {
        const otherSource = namedModeAlreadyEmitsPage
            ? 'the active header preset already emits the page number'
            : 'the folio is shown at the bottom of the page';
        warnings.push(
            `Header corner ${cornerWithPage} uses "Page #" but ${otherSource} — the page number will appear twice. Pick a non-page field for that corner, or change the conflicting setting.`,
        );
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
    private categoryIconEl: HTMLElement | null = null;
    private saveButton: ButtonComponent | null = null;
    private validationBannerEl: HTMLElement | null = null;
    private activeCategory: WizardCategory = 'page';
    private activeCornerKey: 'evenLeft' | 'evenCenter' | 'evenRight' | 'oddLeft' | 'oddCenter' | 'oddRight' = 'evenLeft';

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
        // Single combined pill: PRO chip nested inside the modal-mode badge
        // (DESIGN / EDIT). PRO downsized via the --inline modifier so it fits
        // visually as a "stamp" on the larger badge.
        const modeBadge = badgeRow.createSpan({ cls: 'ert-modal-badge ert-modal-badge--with-pro' });
        const proPill = modeBadge.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO} ert-modal-badge__pro-inline`,
        });
        const proPillIcon = proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(proPillIcon, 'signature');
        proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
        modeBadge.createSpan({ cls: 'ert-modal-badge__label', text: this.isEditMode ? 'EDIT' : 'DESIGN' });
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
        // Label hugs the left edge; the icon + dropdown pair hugs the right.
        // The space-between layout is enforced by .category-row CSS.
        parent.createEl('label', {
            cls: 'ert-style-wizard__field-label',
            text: 'Category',
        });
        const right = parent.createDiv({ cls: 'ert-style-wizard__category-control' });

        // Icon reflects the active category — sits OUTSIDE the dropdown so it
        // doesn't affect the dropdown's internal width.
        const iconWrap = right.createSpan({ cls: 'ert-style-wizard__category-icon' });
        this.categoryIconEl = iconWrap;
        const activeMeta = WIZARD_CATEGORIES.find(c => c.value === this.activeCategory);
        try { setIcon(iconWrap, activeMeta?.icon ?? 'square'); } catch { /* test env */ }

        const select = right.createEl('select', {
            cls: 'ert-input ert-input--sm',
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
        // Update the category icon next to the dropdown — the icon is stored
        // by ref so we don't have to rebuild the whole categoryRow.
        const iconEl = this.categoryIconEl;
        if (iconEl) {
            iconEl.empty();
            const meta = WIZARD_CATEGORIES.find(c => c.value === category);
            if (!meta) throw new Error(`Unknown wizard category: ${category}`);
            setIcon(iconEl, meta.icon);
        }
        this.renderActiveCategoryPanel();
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
            // Cross widget relabels L/R → Inner/Outer; re-render the panel so
            // the labels swap immediately.
            this.refreshConfigOnly();
        });

        this.renderPanelGlossary(body, [
            { term: 'Paper size',         definition: 'The trim size of the printed page. 6×9 trade is standard for novels; A4 / US Letter are typical for manuscripts; Custom unlocks free width/height.' },
            { term: 'Margins',            definition: 'White space around the text block. Compact / Balanced / Airy snap all four to a uniform value; the cross widget below sets each side individually.' },
            { term: 'Mirrored margins',   definition: 'When on, the L value becomes the inner (binding/gutter) margin and R becomes the outer; the cross relabels to Inner/Outer. Values stay the same — geometry just flips on facing pages so the gutter is always toward the spine.' },
        ]);
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
        const presets: Array<{ value: Exclude<PageFeel, 'custom'>; label: string }> = [
            { value: 'compact',  label: 'Compact'  },
            { value: 'balanced', label: 'Balanced' },
            { value: 'airy',     label: 'Airy'     },
        ];
        presets.forEach(({ value, label }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `${label} margins`);
            if (current === value) card.addClass('is-active');
            // Mini page diagram: outer page rectangle (paper) + inner bordered
            // block (text frame). Four measurement ticks span each margin so the
            // card reads as a margin-width comparison, not line density.
            const diagram = card.createDiv({ cls: `ert-style-wizard__preset-page ert-style-wizard__preset-page--${value}` });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--top' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--right' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--bottom' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--left' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-block' });
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
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--top' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--right' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--bottom' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-tick ert-style-wizard__preset-page-tick--left' });
            diagram.createDiv({ cls: 'ert-style-wizard__preset-page-block' });
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: 'Custom' });
        }
    }

    /**
     * Line-spacing visual preset row. Four cards (Tight 1.0 / Standard 1.5
     * / Airy 2.0 / Custom). Custom is interactive — clicking it puts the spec
     * in custom mode and reveals a numeric input below the row.
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

        // Custom card — interactive. Clicking it puts the spec in custom mode
        // (default 1.18 if currently a preset value) and the parent renderer
        // reveals the numeric input below this row.
        const customCard = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
        customCard.tabIndex = 0;
        customCard.setAttribute('role', 'button');
        customCard.setAttribute('aria-label', 'Custom line spacing');
        if (current === 'custom') customCard.addClass('is-active');
        const customStack = customCard.createDiv({ cls: 'ert-style-wizard__preset-lines ert-style-wizard__preset-lines--standard' });
        for (let i = 0; i < 5; i += 1) {
            customStack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
        }
        customCard.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: 'Custom' });
        const applyCustom = () => {
            // If we're already custom, no-op — the input below is the editor.
            if (deriveSpacingPreset(this.spec) === 'custom') return;
            this.mutateSpec((s) => { s.body.lineSpacing = 1.18; });
            this.refreshConfigOnly();
        };
        customCard.addEventListener('click', applyCustom);
        customCard.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                applyCustom();
            }
        });
    }

    /**
     * Header-style visual preset row. Three header strips (None / Minimal /
     * Literary). Selecting one calls `applyHeaderPreset` with the
     * corresponding mode. Modes outside the three (e.g.
     * `'left-title-right-context'`) derive to `'custom'`.
     */
    private renderHeaderStyleRow(parent: HTMLElement): void {
        const current = deriveHeaderStyle(this.spec);
        const modified = current !== 'custom' && isHeaderPresetModified(this.spec);
        // Heading above the row so it's clear what these cards control.
        const headingRow = parent.createDiv({ cls: 'ert-style-wizard__preset-heading-row' });
        headingRow.createDiv({ cls: 'ert-style-wizard__preset-row-label', text: 'Header style' });
        if (modified) {
            headingRow.createSpan({
                cls: 'ert-style-wizard__preset-modified-badge',
                text: '✱ modified — corners customized below',
            });
        }
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
            {
                // Contemporary — book title flush left on even pages, scene
                // context flush right on odd pages. The strip mocks just one
                // page (no two-page split) since each side is asymmetric.
                value: 'contemporary', label: 'Contemporary',
                render: (strip) => {
                    const left = strip.createDiv({ cls: 'ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--left' });
                    left.createDiv({ cls: 'ert-style-wizard__preset-header-text' });
                },
            },
        ];
        presets.forEach(({ value, label, render }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `${label} header`);
            if (current === value) {
                card.addClass('is-active');
                if (modified) card.addClass('is-modified');
            }
            const strip = card.createDiv({ cls: 'ert-style-wizard__preset-header-strip' });
            render(strip);
            // Filler page-body lines below the header strip so each card looks
            // like a tiny page top. Literary uses a two-page split because the
            // strip itself shows facing-page running heads (left + right marks).
            const bodyCls = value === 'literary'
                ? 'ert-style-wizard__preset-header-body ert-style-wizard__preset-header-body--two-page'
                : 'ert-style-wizard__preset-header-body';
            const stack = card.createDiv({ cls: bodyCls });
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
            const stack = card.createDiv({ cls: 'ert-style-wizard__preset-header-body ert-style-wizard__preset-header-body--two-page' });
            for (let i = 0; i < 4; i += 1) {
                stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: 'Custom' });
        }
    }

    /** Framer-style cross widget for the four page margins. When mirrored is
     *  on, the L/R cells relabel to Inner/Outer to match the LaTeX
     *  `geometry` semantics (leftIn → inner=, rightIn → outer=). */
    private renderMarginCross(parent: HTMLElement): void {
        const mirrored = !!this.spec.margins.mirrored;
        const leftLabel  = mirrored ? 'Inner' : 'L';
        const rightLabel = mirrored ? 'Outer' : 'R';
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
        cellLeft.createSpan({ cls: 'ert-style-wizard__margin-axis', text: leftLabel });

        const cellCenter = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--center' });
        const iconWrap = cellCenter.createSpan({ cls: 'ert-style-wizard__margin-icon' });
        // Mirrored on → book-open-check signals "this is the recto (right) page —
        // its left edge is the inner (binding) margin." Off → plain page rect.
        try { setIcon(iconWrap, mirrored ? 'book-open-check' : 'rectangle-vertical'); } catch { /* test env */ }

        const cellRight = cross.createDiv({ cls: 'ert-style-wizard__margin-cell ert-style-wizard__margin-cell--right' });
        cellRight.createSpan({ cls: 'ert-style-wizard__margin-axis', text: rightLabel });
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
        const fontSelect = fontRow.createEl('select', { cls: 'ert-input ert-input--md' });
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

        // Line-spacing visual presets (Tight / Standard / Airy / Custom). The
        // Custom card is interactive — clicking it puts the spec in custom mode
        // and reveals the numeric input below the row. No separate radio.
        this.renderLineSpacingPresetRow(body);

        // Custom spacing input — appears below the cards only when current is custom.
        if (deriveSpacingPreset(this.spec) === 'custom') {
            const customRow = this.fieldRow(body, 'Custom line spacing');
            this.numberInput(customRow, this.spec.body.lineSpacing, 0.8, 3, 0.05, (n) => {
                this.mutateSpec((s) => { s.body.lineSpacing = n; });
            });
        }

        const sizeRow = this.fieldRow(body, 'Size (pt)');
        this.numberInput(sizeRow, this.spec.body.sizePt, 8, 14, 1, (n) => {
            this.mutateSpec((s) => { s.body.sizePt = n; });
        });

        const indentRow = this.fieldRow(body, 'Paragraph indent (em — typical 1.0–1.5)');
        this.numberInput(indentRow, this.spec.body.paragraphIndentEm ?? 0, 0, 3, 0.1, (n) => {
            this.mutateSpec((s) => {
                if (n === 0) delete s.body.paragraphIndentEm;
                else s.body.paragraphIndentEm = n;
            });
        });

        const suppressRow = this.fieldRow(body, 'Suppress indent after break');
        this.toggleInput(suppressRow, !!this.spec.body.firstLineIndentSuppressedAfterBreak, (v) => {
            this.mutateSpec((s) => { s.body.firstLineIndentSuppressedAfterBreak = v; });
        });

        // Microtype is universally good — always emit, no toggle.

        this.renderPanelGlossary(body, [
            { term: 'Body font',          definition: 'The typeface used for paragraph text. Each option is a real font you must have installed; the wizard reports missing fonts in red.' },
            { term: 'Line spacing',       definition: 'Vertical space between baselines. Tight (1.0) is single-spaced; Standard (1.5) reads cleanly in print; Airy (2.0) is the editor-friendly double-space; Custom lets you dial in any value 0.8–3.' },
            { term: 'Paragraph indent',   definition: 'First-line indent on every paragraph, measured in `em` (the width of a capital M). Typical book setting: 1.0–1.5 em; 0 disables indent.' },
            { term: 'Suppress indent after break', definition: 'When on, the very first paragraph after a scene break or chapter heading does NOT get an indent — a print convention.' },
        ]);
    }

    private renderHeaderSection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);

        // Header style visual presets (None / Minimal / Literary / Contemporary).
        // These cards drive `runningHeader.mode` via applyHeaderPreset, which
        // also populates the 6 per-corner fields.
        this.renderHeaderStyleRow(body);

        // Per-corner editor — always visible (no disclosure). 6 mini-cards
        // (no per-card dropdown) drive a single shared dropdown below:
        // clicking a card selects it as the editing target; the dropdown
        // reads/writes only that corner. The preset cards above populate all
        // 6 corners; this section is for fine-tuning after preset selection.
        const cornerSection = body.createDiv({ cls: 'ert-style-wizard__subsection' });
        cornerSection.createDiv({
            cls: 'ert-style-wizard__subsection-heading',
            text: 'Customize per corner',
        });
        const cornerBody = cornerSection.createDiv({ cls: 'ert-style-wizard__corner-grid' });

        type CornerKey = 'evenLeft' | 'evenCenter' | 'evenRight' | 'oddLeft' | 'oddCenter' | 'oddRight';
        type CornerSlot = 'left' | 'center' | 'right';
        // Print convention: even page numbers fall on the LEFT (verso) side
        // of an open spread; odd numbers fall on the RIGHT (recto). Page 1
        // is always recto. Reflected in label text and tooltips so users
        // don't have to remember verso/recto vocabulary.
        const slotName: Record<CornerSlot, string> = { left: 'Left', center: 'Center', right: 'Right' };
        const pageDesc: Record<'even' | 'odd', string> = {
            even: 'left page (verso, even page numbers)',
            odd:  'right page (recto, odd page numbers)',
        };
        const cornerCards: Array<{ key: CornerKey; label: string; page: 'even' | 'odd'; slot: CornerSlot }> = [
            { key: 'evenLeft',   label: 'Even L', page: 'even', slot: 'left'   },
            { key: 'evenCenter', label: 'Even C', page: 'even', slot: 'center' },
            { key: 'evenRight',  label: 'Even R', page: 'even', slot: 'right'  },
            { key: 'oddLeft',    label: 'Odd L',  page: 'odd',  slot: 'left'   },
            { key: 'oddCenter',  label: 'Odd C',  page: 'odd',  slot: 'center' },
            { key: 'oddRight',   label: 'Odd R',  page: 'odd',  slot: 'right'  },
        ];
        cornerCards.forEach(({ key, label, page, slot }) => {
            // Corner cards reuse the same chrome as the None/Minimal/Literary
            // header preset cards above: header strip + body lines + label.
            // The active slot (L/C/R) gets a header-text mark; other slots
            // are empty so each card visually communicates which corner it
            // edits.
            const card = cornerBody.createDiv({ cls: 'ert-style-wizard__preset-card ert-style-wizard__corner-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            const tooltip = `${slotName[slot]} corner of the ${pageDesc[page]}`;
            card.setAttribute('aria-label', tooltip);
            card.setAttribute('title', tooltip);
            if (this.activeCornerKey === key) card.addClass('is-active');
            const strip = card.createDiv({ cls: 'ert-style-wizard__preset-header-strip' });
            const cell = strip.createDiv({ cls: `ert-style-wizard__preset-header-cell ert-style-wizard__preset-header-cell--${slot}` });
            cell.createDiv({ cls: 'ert-style-wizard__preset-header-text ert-style-wizard__preset-header-text--short' });
            // Body lines below the strip — single-page layout (no two-page
            // split) since each corner card represents one page (even or odd).
            const stack = card.createDiv({ cls: 'ert-style-wizard__preset-header-body' });
            for (let i = 0; i < 4; i += 1) {
                stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
            }
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            // Mark even/odd via a data attr in case future styling distinguishes
            // them visually (e.g. binding edge accent).
            card.setAttribute('data-page', page);
            const select = () => {
                this.activeCornerKey = key;
                this.refreshConfigOnly();
            };
            card.addEventListener('click', select);
            card.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                }
            });
        });

        // Single shared editor — drives whichever corner is currently selected.
        const editorRow = cornerSection.createDiv({ cls: 'ert-style-wizard__corner-editor' });
        const editorLabel = editorRow.createSpan({ cls: 'ert-style-wizard__corner-editor-label' });
        const activeMeta = cornerCards.find(c => c.key === this.activeCornerKey);
        const activeText = activeMeta
            ? `Editing: ${activeMeta.label} — ${slotName[activeMeta.slot]} corner of the ${pageDesc[activeMeta.page]}`
            : 'Editing:';
        editorLabel.setText(activeText);
        this.headerFieldDropdown(
            editorRow,
            this.spec.runningHeader[this.activeCornerKey] as DesignedHeaderField | undefined,
            (next) => {
                const key = this.activeCornerKey;
                this.mutateSpec((s) => {
                    if (next === 'empty' || next === undefined) {
                        delete (s.runningHeader as Record<string, unknown>)[key];
                    } else {
                        (s.runningHeader as Record<string, unknown>)[key] = next;
                    }
                });
            },
        );

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

        this.renderPanelGlossary(body, [
            { term: 'Running header',     definition: 'The repeating text at the top of every interior page (book title, author, scene context, page number, etc.). Even and odd pages can carry different content on facing-page books.' },
            { term: 'Even vs Odd page',   definition: 'Print convention: EVEN page numbers (2, 4, 6 …) sit on the LEFT (verso) side of an open spread; ODD numbers (1, 3, 5 …) sit on the RIGHT (recto). Page 1 is always recto. Hover any corner card for its specific page side.' },
            { term: 'Preset',             definition: 'Common header layouts wired up in one click. Use Customize per corner below to override individual slots — overrides layer on top of the preset.' },
            { term: 'Header font',        definition: '"Inherit body" reuses the body typeface. "Sans" switches headers to a sans-serif (a Contemporary Literary convention).' },
            { term: 'Letter spacing',     definition: 'Extra tracking between letters in running heads, in fontspec units (e.g. 15.0 produces the wide-set caps in Signature Literary). 0 means default tracking.' },
        ]);
    }

    private headerFieldDropdown(
        parent: HTMLElement,
        current: DesignedHeaderField | undefined,
        onChange: (next: DesignedHeaderField | undefined) => void,
    ): void {
        const select = parent.createEl('select', { cls: 'ert-input ert-input--md' });
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

        // Visual position presets — each card mocks where the page number sits.
        this.renderFolioPositionPresets(body);

        // Format radio (Arabic / Roman frontmatter) — labels include sample
        // numerals so the user sees the actual glyph style on the button.
        const formatRow = this.compactRow(body);
        const formatCell = this.compactCell(formatRow, 'Format');
        this.makeRadioGroup(formatCell, [
            { value: 'arabic',            label: 'Arabic  1  2  3' },
            { value: 'roman-frontmatter', label: 'Roman  i  ii  iii  (frontmatter only)' },
        ], this.spec.folio.format ?? 'arabic', (v) => {
            this.mutateSpec((s) => { s.folio.format = v as DesignedStyleSpec['folio']['format']; });
        });

        this.renderPanelGlossary(body, [
            { term: 'Folio',       definition: 'The printed page number that runs on each interior page.' },
            { term: 'Frontmatter', definition: 'Pages before the main text (title page, copyright, dedication). Often numbered with Roman numerals (i, ii, iii) before switching to Arabic at chapter 1.' },
        ]);
    }

    private renderFolioPositionPresets(parent: HTMLElement): void {
        const current = this.spec.folio.position;
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        const presets: Array<{
            value: DesignedStyleSpec['folio']['position'];
            label: string;
            render: (card: HTMLElement) => void;
        }> = [
            {
                value: 'bottom-center', label: 'Bottom center',
                render: (card) => {
                    card.createDiv({ cls: 'ert-style-wizard__preset-folio-strip' });
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-folio-body' });
                    for (let i = 0; i < 4; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                    const footer = card.createDiv({ cls: 'ert-style-wizard__preset-folio-footer ert-style-wizard__preset-folio-footer--center' });
                    footer.createSpan({ cls: 'ert-style-wizard__preset-folio-num', text: '12' });
                },
            },
            {
                value: 'header', label: 'In headers',
                render: (card) => {
                    const strip = card.createDiv({ cls: 'ert-style-wizard__preset-folio-strip ert-style-wizard__preset-folio-strip--with-num' });
                    strip.createSpan({ cls: 'ert-style-wizard__preset-folio-num', text: '12' });
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-folio-body' });
                    for (let i = 0; i < 4; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                    card.createDiv({ cls: 'ert-style-wizard__preset-folio-footer' });
                },
            },
            {
                value: 'none', label: 'None',
                render: (card) => {
                    card.createDiv({ cls: 'ert-style-wizard__preset-folio-strip' });
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-folio-body' });
                    for (let i = 0; i < 4; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                    card.createDiv({ cls: 'ert-style-wizard__preset-folio-footer' });
                },
            },
        ];
        presets.forEach(({ value, label, render }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Folio position: ${label}`);
            if (current === value) card.addClass('is-active');
            render(card);
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                this.mutateSpec((s) => { s.folio.position = value; });
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
    }

    /**
     * Glossary footer — small term/definition rows at the bottom of a panel.
     * Used to explain technical terms (folio, frontmatter, etc.) without
     * cluttering the controls themselves.
     */
    private renderPanelGlossary(parent: HTMLElement, entries: Array<{ term: string; definition: string }>): void {
        const block = parent.createDiv({ cls: 'ert-style-wizard__glossary' });
        for (const entry of entries) {
            const row = block.createDiv({ cls: 'ert-style-wizard__glossary-row' });
            row.createSpan({ cls: 'ert-style-wizard__glossary-term', text: entry.term });
            row.createSpan({ cls: 'ert-style-wizard__glossary-def', text: ` — ${entry.definition}` });
        }
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
                { value: 'roman',  label: 'Roman   I  II  III' },
                { value: 'arabic', label: 'Arabic  1  2  3' },
                { value: 'word',   label: 'Word  One Two' },
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

        this.renderPanelGlossary(body, [
            { term: 'Part / Act',         definition: 'A top-level division grouping multiple chapters or scenes (e.g. Part I, Part II). Often introduced with a dedicated opener page.' },
            { term: 'Numeral style',      definition: 'How the part number is rendered: I II III (Roman), 1 2 3 (Arabic), or One Two (Word).' },
            { term: 'Page break',         definition: 'When on, every Part heading starts on a fresh page (`\\cleardoublepage`). Off keeps Parts inline in the running text.' },
            { term: 'Epigraph',           definition: 'A short quote (with optional attribution) printed under the Part heading. Inline keeps it on the Part page; Own page floats it onto a dedicated leaf.' },
            { term: 'openany',            definition: 'LaTeX `book[openany]` — chapters can start on either left or right pages instead of always recto. Saves blank pages in shorter books.' },
        ]);
    }

    private renderChaptersSection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);

        // Visual chapter-style preset cards (replaces the radio).
        this.renderChapterStylePresets(body);

        const breakRow = this.fieldRow(body, 'Page break before chapter');
        this.toggleInput(breakRow, this.spec.chapters.pageBreak, (v) => {
            this.mutateSpec((s) => { s.chapters.pageBreak = v; });
        });

        const resetRow = this.fieldRow(body, 'Reset scene counter at chapter');
        this.toggleInput(resetRow, this.spec.chapters.resetSceneCounter, (v) => {
            this.mutateSpec((s) => { s.chapters.resetSceneCounter = v; });
        });

        const topRow = this.fieldRow(body, 'Heading top spacing (% page)');
        this.sliderInput(topRow, this.spec.chapters.spacing?.topFraction ?? 0, 0, 0.6, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.chapters.spacing = { ...(s.chapters.spacing ?? {}), topFraction: n };
            });
        }, (v) => `${Math.round(v * 100)}%`);

        this.renderPanelGlossary(body, [
            { term: 'Chapter style',         definition: 'Whether each chapter heading shows a number, a title, both, or nothing.' },
            { term: 'Heading top spacing',   definition: 'How far down the page the chapter heading sits, as a percentage of page height. 0% = top of page; 46% pushes the heading deep into the page (Contemporary Literary convention).' },
            { term: 'Page break before chapter', definition: 'When on, every chapter heading starts on a fresh page. Off keeps chapters running inline.' },
            { term: 'Reset scene counter',   definition: 'When on, the scene number resets to 1 at every chapter boundary; otherwise scenes number continuously through the book.' },
        ]);
    }

    private renderChapterStylePresets(parent: HTMLElement): void {
        const current = this.spec.chapters.mode;
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        const presets: Array<{
            value: DesignedStyleSpec['chapters']['mode'];
            label: string;
            render: (card: HTMLElement) => void;
        }> = [
            {
                value: 'off', label: 'Off',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-chapter-body' });
                    for (let i = 0; i < 5; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                },
            },
            {
                value: 'numbered', label: 'Numbered',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-chapter-body ert-style-wizard__preset-chapter-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-chapter-num', text: 'Chapter 1' });
                },
            },
            {
                value: 'titled', label: 'Titled',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-chapter-body ert-style-wizard__preset-chapter-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-chapter-title', text: 'Boy with a Skull' });
                },
            },
            {
                value: 'numbered-titled', label: 'Numbered + titled',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-chapter-body ert-style-wizard__preset-chapter-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-chapter-num', text: 'Chapter 1' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-chapter-title', text: 'Boy with a Skull' });
                },
            },
        ];
        presets.forEach(({ value, label, render }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Chapter style: ${label}`);
            if (current === value) card.addClass('is-active');
            render(card);
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                this.mutateSpec((s) => { s.chapters.mode = value; });
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
    }

    private renderScenesSection(parent: HTMLElement): void {
        const body = this.createPanelBody(parent);

        // Visual opener-style preset cards.
        this.renderOpenerStylePresets(body);

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

        // Visual heading-mode preset cards.
        this.renderHeadingModePresets(body);

        const suppressRow = this.fieldRow(body, 'Suppress headers/footers on opener');
        this.toggleInput(suppressRow, this.spec.scene.suppressHeaderFooterOnOpener, (v) => {
            this.mutateSpec((s) => { s.scene.suppressHeaderFooterOnOpener = v; });
        });

        const firstWordRow = this.fieldRow(body, 'First-word emphasis on opener');
        this.toggleInput(firstWordRow, !!this.spec.scene.firstWordEmphasisOnOpener, (v) => {
            this.mutateSpec((s) => { s.scene.firstWordEmphasisOnOpener = v; });
        });

        const modesRow = this.fieldRow(body, 'Special feature: multi-mode opener pages');
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
        }, (v) => `${Math.round(v * 100)}%`);
        const botRow = this.fieldRow(body, 'Opener bottom spacing');
        this.sliderInput(botRow, this.spec.scene.openerSpacing?.bottomFraction ?? 0, 0, 0.5, 0.02, (n) => {
            this.mutateSpec((s) => {
                s.scene.openerSpacing = { ...(s.scene.openerSpacing ?? {}), bottomFraction: n };
            });
        }, (v) => `${Math.round(v * 100)}%`);

        this.renderPanelGlossary(body, [
            { term: 'Opener',           definition: 'How a new scene begins on the page — either inline (a separator inside the page) or on its own dedicated page.' },
            { term: 'Heading mode',     definition: 'What the scene heading shows: a number, a title, or both. Only applies when openers use a dedicated page.' },
            { term: 'Special feature: multi-mode opener pages', definition: 'When at least one mode is ticked, the template ships with all selected mode macros pre-defined. The settings PDF Style card surfaces a per-book picker so you choose ONE active mode at export time. Today this is a book-level switch (every scene uses the chosen mode); per-scene override is not yet supported.' },
        ]);
    }

    private renderOpenerStylePresets(parent: HTMLElement): void {
        const current = this.spec.scene.opener;
        parent.createDiv({ cls: 'ert-style-wizard__preset-row-label', text: 'Opener style' });
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        type Opener = DesignedStyleSpec['scene']['opener'];
        const presets: Array<{ value: Opener; label: string; render: (card: HTMLElement) => void }> = [
            {
                value: 'inline-separator', label: 'Inline separator',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-scene-body' });
                    for (let i = 0; i < 2; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                    const sep = stack.createDiv({ cls: 'ert-style-wizard__preset-scene-sep' });
                    sep.createSpan({ cls: 'ert-style-wizard__preset-scene-sep-glyph', text: '* * *' });
                    for (let i = 0; i < 2; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                },
            },
            {
                value: 'dedicated-page', label: 'Dedicated page',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-scene-body ert-style-wizard__preset-scene-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-scene-num', text: '3' });
                    const linesWrap = stack.createDiv({ cls: 'ert-style-wizard__preset-scene-lines' });
                    for (let i = 0; i < 2; i += 1) linesWrap.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                },
            },
            {
                value: 'roman-with-rule', label: 'Roman with rule',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-scene-body' });
                    for (let i = 0; i < 2; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                    const sep = stack.createDiv({ cls: 'ert-style-wizard__preset-scene-sep' });
                    sep.createSpan({ cls: 'ert-style-wizard__preset-scene-sep-roman', text: 'ii.' });
                    sep.createDiv({ cls: 'ert-style-wizard__preset-scene-sep-rule' });
                    for (let i = 0; i < 2; i += 1) stack.createDiv({ cls: 'ert-style-wizard__preset-line-bar' });
                },
            },
        ];
        presets.forEach(({ value, label, render }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Opener style: ${label}`);
            if (current === value) card.addClass('is-active');
            render(card);
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                this.mutateSpec((s) => { s.scene.opener = value; });
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
    }

    private renderHeadingModePresets(parent: HTMLElement): void {
        const current = this.spec.scene.headingMode;
        parent.createDiv({ cls: 'ert-style-wizard__preset-row-label', text: 'Heading mode' });
        const row = parent.createDiv({ cls: 'ert-style-wizard__preset-row' });
        const presets: Array<{ value: ManuscriptSceneHeadingMode; label: string; render: (card: HTMLElement) => void }> = [
            {
                value: 'scene-number', label: 'Number only',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-scene-body ert-style-wizard__preset-scene-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-scene-num', text: '3' });
                },
            },
            {
                value: 'scene-number-title', label: 'Number + title',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-scene-body ert-style-wizard__preset-scene-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-scene-num', text: '3' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-scene-title', text: '(The Escape)' });
                },
            },
            {
                value: 'title-only', label: 'Title only',
                render: (card) => {
                    const stack = card.createDiv({ cls: 'ert-style-wizard__preset-scene-body ert-style-wizard__preset-scene-body--heading' });
                    stack.createSpan({ cls: 'ert-style-wizard__preset-scene-title', text: 'The Escape' });
                },
            },
        ];
        presets.forEach(({ value, label, render }) => {
            const card = row.createDiv({ cls: 'ert-style-wizard__preset-card' });
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Heading mode: ${label}`);
            if (current === value) card.addClass('is-active');
            render(card);
            card.createDiv({ cls: 'ert-style-wizard__preset-card-label', text: label });
            const apply = () => {
                this.mutateSpec((s) => { s.scene.headingMode = value; });
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

        this.renderPanelGlossary(body, [
            { term: 'Epigraph',        definition: 'A short quotation placed under a Part or Chapter heading, typically italicized, with an attribution below.' },
            { term: 'Italic',          definition: 'When on, the quote body is set in italics — the standard print convention for epigraphs.' },
            { term: 'Em-dash + caps',  definition: 'Attribution rendered as `—NAME` in small/all caps. Plain renders the name as-is, no dash, no case change.' },
        ]);
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
        let activeValue = current;
        const buttons: Array<{ value: string; el: HTMLElement }> = [];
        options.forEach((option) => {
            const btn = group.createEl('button', {
                cls: 'ert-style-wizard__radio-btn',
                text: option.label,
            });
            btn.type = 'button';
            if (option.value === activeValue) btn.addClass('is-active');
            buttons.push({ value: option.value, el: btn });
            btn.addEventListener('click', () => {
                if (option.value === activeValue) return;
                buttons.forEach(b => b.el.removeClass('is-active'));
                btn.addClass('is-active');
                activeValue = option.value;
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
        format?: (value: number) => string,
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
        const fmt = format ?? ((v: number) => v.toFixed(2));
        const display = wrapper.createSpan({ cls: 'ert-style-wizard__slider-value', text: fmt(value) });
        input.addEventListener('input', () => {
            const parsed = parseFloat(input.value);
            if (!Number.isFinite(parsed)) return;
            display.setText(fmt(parsed));
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

