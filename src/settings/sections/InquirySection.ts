import { App, ButtonComponent, DropdownComponent, Modal, Setting as Settings, TFile, TextComponent, TextAreaComponent, normalizePath, Notice, setIcon, setTooltip } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import type {
    InquiryClassConfig,
    InquiryCorpusThresholds,
    InquiryPromptConfig,
    InquiryPromptSlot,
    SceneInclusion,
    InquirySourcesPreset,
    InquirySourcesSettings
} from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { openOrRevealFile } from '../../utils/fileUtils';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { badgePill } from '../../ui/ui';
import { isProfessionalActive } from './ProfessionalSection';
import { InquirySessionStore } from '../../inquiry/InquirySessionStore';
import { DEFAULT_INQUIRY_HISTORY_LIMIT, INQUIRY_HISTORY_LIMIT_OPTIONS } from '../../inquiry/constants';
import {
    buildDefaultInquiryPromptConfig,
    createCanonicalPromptSlotById,
    getCanonicalQuestionForSlot,
    getInquiryPromptSlotState,
    getInquiryZoneDescription,
    isCanonicalPromptSlot,
    normalizeInquiryPromptConfig,
    replaceCanonicalPromptSlots,
    syncCanonicalPromptSlot
} from '../../inquiry/prompts';
import {
    ALL_CANONICAL_QUESTIONS,
    CORE_CANONICAL_QUESTIONS,
    groupCanonicalQuestionsByZone,
    type InquiryCanonicalQuestionDefinition
} from '../../inquiry/questions/canonicalQuestions';
import type { InquirySession } from '../../inquiry/sessionTypes';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    parseScanRootInput,
    resolveScanRoots,
    toDisplayRoot,
    toVaultRoot
} from '../../inquiry/utils/scanRoots';
import {
    findInquiryBookForPath,
    isPathIncludedByInquiryBooks,
    normalizeInquiryBookInclusion,
    resolveInquiryBookResolution,
    type InquiryBookResolution,
    type InquiryResolvedBook
} from '../../inquiry/services/bookResolution';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    attachFolderSuggest?: (text: TextComponent) => void;
}

const listToText = (values?: string[]): string =>
    (values || []).join('\n');

const parseClassScopeInput = (raw: string): string[] => {
    const lines = raw
        .split(/[\n,]/)
        .map(entry => entry.trim().toLowerCase())
        .filter(Boolean);
    if (!lines.length) return [];
    return Array.from(new Set(lines));
};

const getClassScopeConfig = (raw?: string[]): { allowAll: boolean; allowed: string[] } => {
    const list = (raw || []).map(entry => entry.trim().toLowerCase()).filter(Boolean);
    const allowAll = list.includes('/');
    const allowed = list.filter(entry => entry !== '/');
    return { allowAll, allowed };
};

const normalizeClassLabel = (className: string): string =>
    className
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase();

const pluralizeWord = (word: string): string => {
    if (!word) return 'items';
    const secondToLast = word[word.length - 2];
    if (word.endsWith('y') && secondToLast && !'aeiou'.includes(secondToLast)) {
        return `${word.slice(0, -1)}ies`;
    }
    if (/(s|x|z|ch|sh)$/i.test(word)) {
        return `${word}es`;
    }
    return `${word}s`;
};

const pluralizePhrase = (phrase: string): string => {
    const tokens = phrase.split(/\s+/).filter(Boolean);
    if (!tokens.length) return 'items';
    const last = tokens.pop()!;
    tokens.push(pluralizeWord(last));
    return tokens.join(' ');
};

const formatClassCountLabel = (className: string, count: number): string => {
    const normalized = normalizeClassLabel(className);
    if (!normalized) return count === 1 ? 'item' : 'items';
    return count === 1 ? normalized : pluralizePhrase(normalized);
};

const CLASS_SUMMARY_ORDER = ['scene', 'outline', 'character', 'place', 'power'];
const PRESET_SEED_CLASSES = ['scene', 'outline', 'character', 'place', 'power'];
const PRESET_MATCH_ORDER: InquirySourcesPreset[] = ['default', 'light', 'deep'];

const compareClassSummary = (a: string, b: string): number => {
    const aIdx = CLASS_SUMMARY_ORDER.indexOf(a);
    const bIdx = CLASS_SUMMARY_ORDER.indexOf(b);
    if (aIdx !== -1 || bIdx !== -1) {
        return (aIdx === -1 ? Number.POSITIVE_INFINITY : aIdx) - (bIdx === -1 ? Number.POSITIVE_INFINITY : bIdx);
    }
    return a.localeCompare(b);
};

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const formatRelativeTime = (timestamp: number): string => {
    if (!Number.isFinite(timestamp)) return 'just now';
    const deltaMs = timestamp - Date.now();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (Math.abs(deltaMs) >= day) {
        return relativeTimeFormatter.format(Math.round(deltaMs / day), 'day');
    }
    if (Math.abs(deltaMs) >= hour) {
        return relativeTimeFormatter.format(Math.round(deltaMs / hour), 'hour');
    }
    if (Math.abs(deltaMs) >= minute) {
        return relativeTimeFormatter.format(Math.round(deltaMs / minute), 'minute');
    }
    return 'just now';
};

const formatSessionScopeLabel = (session: InquirySession): string => {
    const scopeLabel = session.result.scope === 'saga' ? 'Saga' : 'Book';
    const scopeValue = session.result.scopeLabel?.trim();
    return scopeValue ? `${scopeLabel} ${scopeValue}` : scopeLabel;
};

const formatSessionProviderModel = (session: InquirySession): string => {
    const providerRaw = session.result.aiProvider?.trim().toLowerCase();
    const model = (session.result.aiModelResolved || session.result.aiModelRequested || '').trim();
    const provider = providerRaw === 'openai'
        ? 'OpenAI'
        : providerRaw === 'anthropic'
            ? 'Anthropic'
            : providerRaw === 'gemini'
                ? 'Gemini'
                : providerRaw === 'local'
                    ? 'Local'
                    : (providerRaw ? providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1) : 'Engine');
    return model ? `${provider}/${model}` : provider;
};

const REFERENCE_ONLY_CLASSES = new Set(['character', 'place', 'power']);
const SYNOPSIS_CAPABLE_CLASSES = new Set(['scene', 'outline']);
const CONTRIBUTION_MODES: SceneInclusion[] = ['excluded', 'summary', 'full'];
const DEFAULT_FULL_CLASSES = new Set(['outline', ...REFERENCE_ONLY_CLASSES]);
const CONTRIBUTION_LABELS: Record<SceneInclusion, string> = {
    excluded: 'Exclude',
    summary: 'Summary',
    full: 'Full Scene'
};

const defaultModeForClass = (className: string): SceneInclusion => {
    if (DEFAULT_FULL_CLASSES.has(className)) return 'full';
    if (className === 'scene') return 'summary';
    return 'full';
};

const isSynopsisCapableClass = (className: string): boolean =>
    SYNOPSIS_CAPABLE_CLASSES.has(className.toLowerCase());

const normalizeContributionMode = (mode: SceneInclusion, className: string): SceneInclusion => {
    if (mode === 'summary' && !isSynopsisCapableClass(className)) {
        return 'full';
    }
    return mode;
};

const getContributionModesForClass = (className: string): SceneInclusion[] =>
    isSynopsisCapableClass(className) ? ['excluded', 'summary', 'full'] : ['excluded', 'full'];

const normalizeMaterialMode = (value: unknown, className: string): SceneInclusion => {
    let normalized: SceneInclusion = 'excluded';
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (raw === 'digest') normalized = 'summary';
        if (CONTRIBUTION_MODES.includes(raw as SceneInclusion)) normalized = raw as SceneInclusion;
    }
    if (typeof value === 'boolean') {
        normalized = value ? defaultModeForClass(className) : 'excluded';
    }
    return normalizeContributionMode(normalized, className);
};

const normalizeClassContribution = (config: InquiryClassConfig): InquiryClassConfig => {
    const isReference = !isSynopsisCapableClass(config.className);
    const bookScope = isReference ? 'excluded' : normalizeContributionMode(config.bookScope, config.className);
    const sagaScope = isReference ? 'excluded' : normalizeContributionMode(config.sagaScope, config.className);
    const referenceScope = isReference ? normalizeContributionMode(config.referenceScope, config.className) : 'excluded';
    return {
        ...config,
        bookScope: bookScope === 'excluded' ? 'excluded' : bookScope,
        sagaScope: sagaScope === 'excluded' ? 'excluded' : sagaScope,
        referenceScope: referenceScope === 'excluded' ? 'excluded' : referenceScope
    };
};

const defaultParticipationForClass = (className: string): { book: boolean; saga: boolean; reference: boolean } => {
    const normalized = className.toLowerCase();
    if (!isSynopsisCapableClass(normalized)) {
        return { book: false, saga: false, reference: true };
    }
    if (normalized === 'outline') {
        return { book: true, saga: true, reference: false };
    }
    if (normalized === 'scene') {
        return { book: true, saga: true, reference: false };
    }
    return { book: true, saga: false, reference: false };
};

const defaultClassConfig = (className: string): InquiryClassConfig => {
    const normalized = className.toLowerCase();
    const isScene = normalized === 'scene';
    const isOutline = normalized === 'outline';
    const isReference = !isSynopsisCapableClass(normalized);
    return {
        className: normalized,
        enabled: false,
        bookScope: isReference ? 'excluded' : (isScene ? 'summary' : (isOutline ? 'full' : defaultModeForClass(normalized))),
        sagaScope: isReference ? 'excluded' : (isOutline ? 'full' : 'excluded'),
        referenceScope: isReference ? 'full' : 'excluded'
    };
};

const mergeClassConfigs = (existing: InquiryClassConfig[], discovered: string[]): InquiryClassConfig[] => {
    const byName = new Map(existing.map(config => [config.className, config]));
    const names = new Set<string>(existing.map(config => config.className));
    discovered.forEach(name => names.add(name));
    const sorted = Array.from(names).sort((a, b) => {
        const order = ['scene', 'outline', 'character', 'place', 'power'];
        const aIdx = order.indexOf(a);
        const bIdx = order.indexOf(b);
        if (aIdx !== -1 || bIdx !== -1) {
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        }
        return a.localeCompare(b);
    });
    return sorted.map(name => byName.get(name) ?? defaultClassConfig(name));
};

const normalizeInquirySources = (raw?: InquirySourcesSettings): InquirySourcesSettings => {
    if (!raw) {
        return { scanRoots: [], bookInclusion: {}, classes: [], classCounts: {}, resolvedScanRoots: [] };
    }
    return {
        preset: raw.preset,
        scanRoots: raw.scanRoots && raw.scanRoots.length ? normalizeScanRootPatterns(raw.scanRoots) : [],
        bookInclusion: normalizeInquiryBookInclusion(raw.bookInclusion),
        classScope: raw.classScope ? parseClassScopeInput(listToText(raw.classScope)) : [],
        classes: (raw.classes || []).map(config => normalizeClassContribution({
            className: config.className.toLowerCase(),
            enabled: !!config.enabled,
            bookScope: normalizeMaterialMode(config.bookScope, config.className.toLowerCase()),
            sagaScope: normalizeMaterialMode(config.sagaScope, config.className.toLowerCase()),
            referenceScope: normalizeMaterialMode(
                (config as InquiryClassConfig).referenceScope
                ?? (!isSynopsisCapableClass(config.className.toLowerCase()) ? true : false),
                config.className.toLowerCase()
            )
        })),
        classCounts: raw.classCounts || {},
        resolvedScanRoots: raw.resolvedScanRoots ? normalizeScanRootPatterns(raw.resolvedScanRoots) : [],
        lastScanAt: raw.lastScanAt
    };
};

const normalizeCorpusThresholds = (raw?: InquiryCorpusThresholds): InquiryCorpusThresholds => {
    const fallback = DEFAULT_SETTINGS.inquiryCorpusThresholds || {
        emptyMax: 10,
        sketchyMin: 100,
        mediumMin: 300,
        substantiveMin: 1000
    };
    return {
        emptyMax: Number.isFinite(raw?.emptyMax ?? fallback.emptyMax) ? Number(raw?.emptyMax ?? fallback.emptyMax) : fallback.emptyMax,
        sketchyMin: Number.isFinite(raw?.sketchyMin ?? fallback.sketchyMin) ? Number(raw?.sketchyMin ?? fallback.sketchyMin) : fallback.sketchyMin,
        mediumMin: Number.isFinite(raw?.mediumMin ?? fallback.mediumMin) ? Number(raw?.mediumMin ?? fallback.mediumMin) : fallback.mediumMin,
        substantiveMin: Number.isFinite(raw?.substantiveMin ?? fallback.substantiveMin)
            ? Number(raw?.substantiveMin ?? fallback.substantiveMin)
            : fallback.substantiveMin
    };
};

const validateCorpusThresholds = (next: InquiryCorpusThresholds): string | null => {
    if (!Number.isFinite(next.emptyMax) || next.emptyMax < 0) return 'Empty max must be a non-negative number.';
    if (!Number.isFinite(next.sketchyMin) || next.sketchyMin <= next.emptyMax) return 'Sketchy min must be greater than Empty max.';
    if (!Number.isFinite(next.mediumMin) || next.mediumMin <= next.sketchyMin) return 'Medium min must be greater than Sketchy min.';
    if (!Number.isFinite(next.substantiveMin) || next.substantiveMin <= next.mediumMin) {
        return 'Substantive min must be greater than Medium min.';
    }
    return null;
};

export function renderInquirySection(params: SectionParams): void {
    const { plugin, containerEl, attachFolderSuggest } = params;
    containerEl.addClass('ert-inquiry-settings-root');

    const createSection = (
        parent: HTMLElement,
        options: { title: string; desc?: string; icon: string; wiki?: string; headingClass?: string }
    ) => {
        const header = new Settings(parent).setName(options.title);
        if (options.desc) {
            header.setDesc(options.desc);
        }
        header.setHeading();
        if (options.headingClass) {
            header.settingEl.addClass(options.headingClass);
        }
        addHeadingIcon(header, options.icon);
        if (options.wiki) {
            addWikiLink(header, options.wiki);
        }
        applyErtHeaderLayout(header);

        return parent.createDiv({ cls: [ERT_CLASSES.SECTION_BODY, ERT_CLASSES.STACK] });
    };

    let inquirySources = normalizeInquirySources(plugin.settings.inquirySources);
    plugin.settings.inquirySources = inquirySources;

    const promptsBody = createSection(containerEl, {
        title: 'Inquiry prompts',
        icon: 'list',
        wiki: 'Settings#inquiry-prompts'
    });
    renderPromptConfiguration(promptsBody);

    const sourcesBody = createSection(containerEl, {
        title: 'Inquiry sources',
        icon: 'search',
        wiki: 'Settings#inquiry-sources'
    });

    let scanRootsInput: TextAreaComponent | null = null;
    let classScopeInput: TextAreaComponent | null = null;
    const scanRootActionSyncers: Array<() => void> = [];
    const autoResizeTextAreaRows = (inputEl: HTMLTextAreaElement, minRows: number) => {
        const style = window.getComputedStyle(inputEl);
        const lineHeight = Number.parseFloat(style.lineHeight) || 20;
        const padTop = Number.parseFloat(style.paddingTop) || 0;
        const padBottom = Number.parseFloat(style.paddingBottom) || 0;
        const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
        const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
        const minHeight = (lineHeight * minRows) + padTop + padBottom + borderTop + borderBottom;
        inputEl.rows = minRows;
        if (inputEl.scrollHeight <= minHeight) return;
        const extraHeight = inputEl.scrollHeight - minHeight;
        const extraRows = Math.ceil(extraHeight / lineHeight);
        inputEl.rows = minRows + extraRows;
    };
    const registerDeferredAutoResize = (inputEl: HTMLTextAreaElement, minRows: number): (() => void) => {
        const runResize = () => autoResizeTextAreaRows(inputEl, minRows);

        const rafId = window.requestAnimationFrame(() => {
            runResize();
        });
        plugin.register(() => {
            window.cancelAnimationFrame(rafId);
        });

        const timeoutId = window.setTimeout(() => {
            runResize();
        }, 0);
        plugin.register(() => {
            window.clearTimeout(timeoutId);
        });

        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => {
                runResize();
            });
            resizeObserver.observe(inputEl);
            plugin.register(() => {
                resizeObserver.disconnect();
            });
        }

        return runResize;
    };

    const scanRootsSetting = new Settings(sourcesBody)
        .setName('Scan folders')
        .setDesc('Inquiry scans only within these folders. Separate paths with new lines, commas, or semicolons. Wildcards like /Book */ or /Book 1-7 */ are allowed. Use / for the vault root. Empty = no scan.');
    scanRootsSetting.settingEl.setAttribute('data-ert-role', 'inquiry-setting:scan-roots');
    scanRootsSetting.settingEl.classList.add(ERT_CLASSES.ROW, 'ert-row--stack');

    const scanRootsText = new TextAreaComponent(scanRootsSetting.controlEl);
    scanRootsText.setValue(listToText(inquirySources.scanRoots));
    scanRootsText.setPlaceholder('/Book */\n/Character/\n/World/');
    scanRootsText.inputEl.rows = 3;
    scanRootsText.inputEl.addClass('ert-textarea--wide');
    scanRootsText.inputEl.addClass('mod-styled-scrollbar');
    scanRootsInput = scanRootsText;
    const autoResizeScanRootsInput = registerDeferredAutoResize(scanRootsText.inputEl, 3);
    autoResizeScanRootsInput();

    plugin.registerDomEvent(scanRootsText.inputEl, 'input', () => {
        autoResizeScanRootsInput();
    });

    plugin.registerDomEvent(scanRootsText.inputEl, 'blur', () => {
        const nextRoots = parseScanRootInput(scanRootsText.getValue());
        applyScanRoots(nextRoots);
    });

    const scanRootActions = scanRootsSetting.controlEl.createDiv({
        cls: [ERT_CLASSES.INLINE, 'ert-actions', 'ert-preset-controls']
    });
    const getBookManagerRoots = (): string[] =>
        Array.from(new Set(
            (plugin.settings.books || [])
                .map(book => normalizePath((book.sourceFolder || '').trim()))
                .filter(Boolean)
                .map(root => toDisplayRoot(root))
        ));
    const MAX_SCAN_PRESET_CHECK_ROOTS = 5000;
    const isScanPresetCovered = (presetRoots: string[], selectedRoots: string[]): boolean => {
        const normalizedPreset = normalizeScanRootPatterns(presetRoots);
        const normalizedSelected = normalizeScanRootPatterns(selectedRoots);
        if (!normalizedPreset.length || !normalizedSelected.length) return false;
        const selectedSet = new Set(normalizedSelected);
        if (normalizedPreset.every(root => selectedSet.has(root))) return true;

        const presetResolved = resolveScanRoots(normalizedPreset, plugin.app.vault, MAX_SCAN_PRESET_CHECK_ROOTS).resolvedRoots;
        if (!presetResolved.length) return false;
        const selectedResolved = resolveScanRoots(normalizedSelected, plugin.app.vault, MAX_SCAN_PRESET_CHECK_ROOTS).resolvedRoots;
        if (!selectedResolved.length) return false;
        const selectedResolvedSet = new Set(selectedResolved);
        return presetResolved.every(root => selectedResolvedSet.has(root));
    };

    const addScanRootToggle = (
        label: string,
        resolveRoots: () => string[],
        emptyNotice?: string
    ) => {
        const btn = scanRootActions.createEl('button', { cls: `${ERT_CLASSES.PILL_BTN} ert-preset-pill` });
        btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: label });
        const syncButtonState = () => {
            const roots = normalizeScanRootPatterns(resolveRoots());
            const hasRoots = roots.length > 0;
            const selectedRoots = normalizeScanRootPatterns(inquirySources.scanRoots || []);
            const rootSet = new Set(selectedRoots);
            const explicitlyActive = hasRoots && roots.every(root => rootSet.has(root));
            const isActive = explicitlyActive || (hasRoots && isScanPresetCovered(roots, selectedRoots));
            btn.classList.toggle(ERT_CLASSES.IS_ACTIVE, isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            btn.classList.toggle(ERT_CLASSES.PILL_BTN_USED, !hasRoots);
            btn.disabled = !hasRoots;
        };
        plugin.registerDomEvent(btn, 'click', (evt) => {
            evt.preventDefault();
            const roots = normalizeScanRootPatterns(resolveRoots());
            if (!roots.length) {
                if (emptyNotice) new Notice(emptyNotice);
                return;
            }
            const rootSet = new Set(normalizeScanRootPatterns(inquirySources.scanRoots || []));
            const explicitlyActive = roots.every(root => rootSet.has(root));
            if (explicitlyActive) {
                roots.forEach(root => rootSet.delete(root));
            } else {
                roots.forEach(root => rootSet.add(root));
            }
            applyScanRoots(Array.from(rootSet));
        });
        scanRootActionSyncers.push(syncButtonState);
        syncButtonState();
    };

    addScanRootToggle('Book folders', () => ['/Book */']);
    addScanRootToggle('Book Manager folders', getBookManagerRoots, 'No Book Manager folders are configured.');
    addScanRootToggle('Character folder', () => ['/Character/']);

    const resolvedBooksPreview = sourcesBody.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'inquiry-detected-containers' }
    });
    const resolvedBooksHeading = resolvedBooksPreview.createDiv({
        cls: ['ert-planetary-preview-heading', 'ert-previewFrame__title'],
        text: 'Detected containers (0 included / 0 detected)'
    });
    const resolvedBooksList = resolvedBooksPreview.createDiv({
        cls: ['ert-controlGroup', 'ert-controlGroup--inquiry-containers']
    });
    const resolvedBooksWarnings = resolvedBooksPreview.createDiv({ cls: ERT_CLASSES.STACK });

    const materialRulesHeader = new Settings(sourcesBody)
        .setName('Material rules')
        .setDesc('Define how each material type participates in Book, Saga, and Reference analysis.');
    materialRulesHeader.setHeading();
    applyErtHeaderLayout(materialRulesHeader);

    const classScopeSetting = new Settings(sourcesBody)
        .setName('Material types (advanced)')
        .setDesc('Frontmatter Class values to include. One class per line. Use / to allow all classes. Empty = no classes allowed.');
    classScopeSetting.settingEl.setAttribute('data-ert-role', 'inquiry-setting:class-scope');
    classScopeSetting.settingEl.addClass(ERT_CLASSES.ROW, ERT_CLASSES.ROW_WIDE_CONTROL);

    classScopeSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.classScope));
        text.inputEl.rows = 4;
        text.inputEl.addClass('ert-textarea--md');
        text.inputEl.addClass('mod-styled-scrollbar');
        text.setPlaceholder('scene\noutline\ncharacter\nplace');
        classScopeInput = text;
        const autoResizeClassScopeInput = registerDeferredAutoResize(text.inputEl, 4);
        autoResizeClassScopeInput();

        plugin.registerDomEvent(text.inputEl, 'input', () => {
            autoResizeClassScopeInput();
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            const nextScope = parseClassScopeInput(text.getValue());
            applyClassScope(nextScope);
        });
    });

    let resolvedRootCache: { signature: string; resolvedRoots: string[] } | null = null;
    let resolvedBookCache: InquiryBookResolution | null = null;

    const presetSetting = new Settings(sourcesBody)
        .setName('Presets')
        .setDesc('Quick starters for material rules. Apply one, then tweak as needed.');
    presetSetting.settingEl.setAttribute('data-ert-role', 'inquiry-setting:class-presets');
    presetSetting.settingEl.addClass(ERT_CLASSES.ROW, ERT_CLASSES.ROW_TIGHT);
    const presetControls = presetSetting.controlEl.createDiv({ cls: [ERT_CLASSES.INLINE, 'ert-preset-controls'] });
    const presetButtons = new Map<InquirySourcesPreset, HTMLButtonElement>();

    const inferPresetFromClasses = (classes: InquiryClassConfig[] | undefined): InquirySourcesPreset | null => {
        if (!classes || !classes.length) return null;
        const classNames = new Set<string>(PRESET_SEED_CLASSES);
        const byName = new Map<string, InquiryClassConfig>();
        classes.forEach(config => {
            const className = config.className.toLowerCase();
            classNames.add(className);
            byName.set(className, normalizeClassContribution({
                className,
                enabled: !!config.enabled,
                bookScope: normalizeMaterialMode(config.bookScope, className),
                sagaScope: normalizeMaterialMode(config.sagaScope, className),
                referenceScope: normalizeMaterialMode(config.referenceScope, className)
            }));
        });

        const matchesPreset = (preset: InquirySourcesPreset): boolean => {
            return Array.from(classNames).every(className => {
                const current = byName.get(className) ?? defaultClassConfig(className);
                const expected = buildPresetClassConfig(current, preset);
                return current.enabled === expected.enabled
                    && current.bookScope === expected.bookScope
                    && current.sagaScope === expected.sagaScope
                    && current.referenceScope === expected.referenceScope;
            });
        };

        for (const preset of PRESET_MATCH_ORDER) {
            if (matchesPreset(preset)) return preset;
        }
        return null;
    };

    const getEffectivePresetSelection = (): InquirySourcesPreset | null => {
        if (inquirySources.preset) return inquirySources.preset;
        return inferPresetFromClasses(inquirySources.classes);
    };

    const syncPresetButtons = () => {
        const activePreset = getEffectivePresetSelection();
        presetButtons.forEach((button, key) => {
            const isActive = activePreset === key;
            button.classList.toggle(ERT_CLASSES.IS_ACTIVE, isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    const addPresetButton = (preset: InquirySourcesPreset, label: string) => {
        const btn = presetControls.createEl('button', { cls: `${ERT_CLASSES.PILL_BTN} ert-preset-pill` });
        btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: label });
        plugin.registerDomEvent(btn, 'click', (evt) => {
            evt.preventDefault();
            applyPreset(preset);
        });
        presetButtons.set(preset, btn);
    };

    addPresetButton('default', 'Default');
    addPresetButton('light', 'Light');
    addPresetButton('deep', 'Deep');

    const tableCard = sourcesBody.createDiv({ cls: ERT_CLASSES.PANEL });
    const classTableWrap = tableCard.createDiv({
        cls: ['ert-controlGroup', 'ert-controlGroup--class-scope', 'ert-controlGroup--inquiry-material-rules']
    });

    const scanInquiryClasses = async (
        roots: string[],
        includePath?: (path: string) => boolean,
        containerCandidates: InquiryResolvedBook[] = []
    ): Promise<{
        discoveredCounts: Record<string, number>;
        discoveredClasses: string[];
        containerClassCounts: Record<string, Record<string, number>>;
    }> => {
        if (!roots.length) {
            return { discoveredCounts: {}, discoveredClasses: [], containerClassCounts: {} };
        }
        const discoveredCounts: Record<string, number> = {};
        const containerClassCounts: Record<string, Record<string, number>> = {};
        containerCandidates.forEach(candidate => {
            containerClassCounts[candidate.rootPath] = {};
        });
        const files = plugin.app.vault.getMarkdownFiles();
        const resolvedVaultRoots = roots;

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        files.forEach(file => {
            if (!inRoots(file.path)) return;
            const cache = plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return;
            const normalized = normalizeFrontmatterKeys(frontmatter, plugin.settings.frontmatterMappings);
            const rawClass = normalized['Class'];
            if (!rawClass) return;
            const values = Array.isArray(rawClass) ? rawClass : [rawClass];
            const ownerContainer = containerCandidates.length
                ? findInquiryBookForPath(file.path, containerCandidates)
                : undefined;
            const includeInDiscoveredCounts = !includePath || includePath(file.path);
            values.forEach(value => {
                const name = typeof value === 'string' ? value.trim() : String(value).trim();
                if (!name) return;
                const key = name.toLowerCase();
                if (includeInDiscoveredCounts) {
                    discoveredCounts[key] = (discoveredCounts[key] || 0) + 1;
                }
                if (ownerContainer?.rootPath) {
                    const bucket = containerClassCounts[ownerContainer.rootPath] || {};
                    bucket[key] = (bucket[key] || 0) + 1;
                    containerClassCounts[ownerContainer.rootPath] = bucket;
                }
            });
        });

        return {
            discoveredCounts,
            discoveredClasses: Object.keys(discoveredCounts).sort(),
            containerClassCounts
        };
    };

    const renderClassTable = (configs: InquiryClassConfig[], counts: Record<string, number>) => {
        // Build into a temporary container then replace in one go to avoid empty-then-rebuild flicker.
        const container = document.createElement('div');
        container.className = classTableWrap.className;
        const buildRow = (extraClasses: string[] = []) =>
            container.createDiv({ cls: ['ert-controlGroup__row', ...extraClasses] });

        const header = buildRow(['ert-controlGroup__row--header']);
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Enabled' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Class' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Book' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Saga' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Reference' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Matches' });

        configs.forEach(config => {
            const row = buildRow(['ert-controlGroup__row--card']);
            const rowDisabled = !config.enabled;
            row.toggleClass('is-disabled', rowDisabled);
            const enabledCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            const enabledToggle = enabledCell.createEl('input', { type: 'checkbox' });
            enabledToggle.checked = config.enabled;
            plugin.registerDomEvent(enabledToggle, 'change', () => {
                inquirySources = {
                    ...inquirySources,
                    classes: (inquirySources.classes || []).map(entry =>
                        entry.className === config.className ? { ...entry, enabled: enabledToggle.checked } : entry
                    )
                };
                void refreshClassScan();
            });

            const nameCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            nameCell.createEl('strong', { text: config.className });

            const isSynopsisCapable = isSynopsisCapableClass(config.className);
            const isReference = !isSynopsisCapable;

            const buildScopeSelect = (
                cell: HTMLElement,
                value: SceneInclusion,
                disabled: boolean,
                modes: SceneInclusion[],
                onChange: (next: SceneInclusion) => void
            ) => {
                const select = cell.createEl('select', { cls: 'ert-input ert-input--md' });
                modes.forEach(mode => {
                    select.createEl('option', { value: mode, text: CONTRIBUTION_LABELS[mode] });
                });
                select.value = value;
                select.disabled = disabled;
                plugin.registerDomEvent(select, 'change', () => {
                    onChange(select.value as SceneInclusion);
                });
            };

            const updateClassConfig = (patch: Partial<InquiryClassConfig>) => {
                inquirySources = {
                    ...inquirySources,
                    classes: (inquirySources.classes || []).map(entry =>
                        entry.className === config.className ? normalizeClassContribution({ ...entry, ...patch }) : entry
                    )
                };
                void refreshClassScan();
            };

            const bookCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            if (!isSynopsisCapable) {
                bookCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: '—' });
            } else {
                buildScopeSelect(
                    bookCell,
                    normalizeContributionMode(config.bookScope, config.className),
                    rowDisabled,
                    getContributionModesForClass(config.className),
                    (next) => {
                        updateClassConfig({ bookScope: normalizeContributionMode(next, config.className) });
                    }
                );
            }

            const sagaCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            if (!isSynopsisCapable) {
                sagaCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: '—' });
            } else {
                buildScopeSelect(
                    sagaCell,
                    normalizeContributionMode(config.sagaScope, config.className),
                    rowDisabled,
                    getContributionModesForClass(config.className),
                    (next) => {
                        updateClassConfig({ sagaScope: normalizeContributionMode(next, config.className) });
                    }
                );
            }

            const referenceCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            if (isReference) {
                buildScopeSelect(
                    referenceCell,
                    normalizeContributionMode(config.referenceScope, config.className),
                    rowDisabled,
                    getContributionModesForClass(config.className),
                    (next) => {
                        updateClassConfig({ referenceScope: normalizeContributionMode(next, config.className) });
                    }
                );
            } else {
                referenceCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: '—' });
            }

            const countCell = row.createDiv({
                cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--meta', 'ert-controlGroup__cell--mono']
            });
            const count = counts[config.className] ?? 0;
            countCell.setText(`${count} matches`);
            if (!count) {
                countCell.addClass('ert-controlGroup__cell--faint');
            }

            nameCell.setAttribute('title', config.className);
        });

        classTableWrap.replaceChildren(...Array.from(container.children));
    };

    const resolvePresetContribution = (preset: InquirySourcesPreset, className: string): SceneInclusion => {
        const normalized = className.toLowerCase();
        const isReference = !isSynopsisCapableClass(normalized);
        if (preset === 'default') {
            let mode: SceneInclusion = 'excluded';
            if (normalized === 'scene') mode = 'summary';
            if (normalized === 'outline') mode = 'full';
            if (isReference) mode = 'excluded';
            return normalizeContributionMode(mode, normalized);
        }
        if (preset === 'light') {
            let mode: SceneInclusion = 'excluded';
            if (normalized === 'scene') mode = 'summary';
            if (normalized === 'outline') mode = 'summary';
            if (isReference) mode = 'excluded';
            return normalizeContributionMode(mode, normalized);
        }
        if (preset === 'deep') {
            let mode: SceneInclusion = 'excluded';
            if (normalized === 'scene') mode = 'full';
            if (normalized === 'outline') mode = 'full';
            if (isReference) mode = 'full';
            return normalizeContributionMode(mode, normalized);
        }
        return 'excluded';
    };

    const buildPresetClassConfig = (config: InquiryClassConfig, preset: InquirySourcesPreset): InquiryClassConfig => {
        const contribution = resolvePresetContribution(preset, config.className);
        const normalized = config.className.toLowerCase();
        const participation = contribution === 'excluded'
            ? { book: false, saga: false, reference: false }
            : defaultParticipationForClass(config.className);
        const bookContribution: SceneInclusion =
            preset === 'default' && normalized === 'scene' ? 'full' : contribution;
        const sagaContribution: SceneInclusion =
            preset === 'default' && normalized === 'scene' ? 'summary' : contribution;
        return normalizeClassContribution({
            ...config,
            enabled: contribution !== 'excluded',
            bookScope: participation.book ? bookContribution : 'excluded',
            sagaScope: participation.saga ? sagaContribution : 'excluded',
            referenceScope: participation.reference ? contribution : 'excluded'
        });
    };

    const applyPreset = (preset: InquirySourcesPreset) => {
        const merged = mergeClassConfigs(inquirySources.classes || [], PRESET_SEED_CLASSES);
        const nextClasses = merged.map(config => buildPresetClassConfig(config, preset));
        inquirySources = {
            ...inquirySources,
            preset,
            classes: nextClasses
        };
        syncPresetButtons();
        void refreshClassScan();
    };
    syncPresetButtons();

    const buildContainerMaterialSummary = (
        classCounts: Record<string, number>,
        participatingClasses: Set<string>
    ): string => {
        if (!participatingClasses.size) {
            return 'No active material rules.';
        }
        const parts = Object.entries(classCounts)
            .filter(([className, count]) => count > 0 && participatingClasses.has(className))
            .sort(([a], [b]) => compareClassSummary(a, b))
            .map(([className, count]) => `${count} ${formatClassCountLabel(className, count)}`);
        return parts.length ? parts.join(' \u00b7 ') : 'No matching materials.';
    };

    const renderDetectedContainers = (
        resolution: InquiryBookResolution,
        containerClassCounts: Record<string, Record<string, number>>,
        participatingClasses: Set<string>
    ) => {
        resolvedBooksHeading.setText(`Detected containers (${resolution.includedBooks.length} included / ${resolution.candidates.length} detected)`);
        const container = document.createElement('div');
        container.className = resolvedBooksList.className;
        const header = container.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--header'] });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Include' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Container' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Detected material' });

        if (!resolution.candidates.length) {
            const emptyRow = container.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--card'] });
            const emptyCell = emptyRow.createDiv({
                cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--faint'],
                text: 'No containers detected from current scan folders.'
            });
            emptyCell.style.gridColumn = '1 / -1';
        } else {
            resolution.candidates.forEach(book => {
                const row = container.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--card'] });
                if (!book.included) row.addClass('is-disabled');

                const includeCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
                const includeToggle = includeCell.createEl('input', { type: 'checkbox' });
                includeToggle.checked = book.included;
                plugin.registerDomEvent(includeToggle, 'change', () => {
                    setBookInclusionOverride(book, includeToggle.checked);
                });

                const pathCell = row.createDiv({ cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--stack'] });
                const displayRoot = toDisplayRoot(book.rootPath);
                const managerMatch = (plugin.settings.books || []).find(entry =>
                    normalizePath((entry.sourceFolder || '').trim()) === normalizePath(book.rootPath)
                );
                const managerTitle = managerMatch?.title?.trim() || '';
                const containerLabel = managerTitle || (displayRoot.split('/').filter(Boolean).pop() || displayRoot);
                const labelEl = pathCell.createEl('strong', { text: containerLabel });
                labelEl.addClass('ert-controlGroup__containerTitle');
                if (managerTitle) {
                    labelEl.addClass('ert-controlGroup__containerTitle--manager');
                }
                if (managerTitle) {
                    pathCell.createDiv({
                        cls: ['ert-controlGroup__cell--meta', 'ert-controlGroup__cell--mono'],
                        text: displayRoot
                    });
                }

                const summaryCell = row.createDiv({ cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--meta'] });
                const summary = buildContainerMaterialSummary(containerClassCounts[book.rootPath] || {}, participatingClasses);
                summaryCell.setText(summary);
                if (summary.startsWith('No ')) {
                    summaryCell.addClass('ert-controlGroup__cell--faint');
                }
            });
        }

        resolvedBooksList.replaceChildren(...Array.from(container.children));

        resolvedBooksWarnings.empty();
        if (resolution.hasNestedExclusions) {
            resolvedBooksWarnings.createDiv({
                cls: 'setting-item-description',
                text: 'Nested drafts detected. Inquiry excludes nested draft containers by default.'
            });
        }
        if (resolution.hasVariantExclusions) {
            resolvedBooksWarnings.createDiv({
                cls: 'setting-item-description',
                text: 'Draft-style variants were excluded by default. Toggle Include to override a specific container.'
            });
        }
    };

    const setBookInclusionOverride = (book: InquiryResolvedBook, include: boolean) => {
        const next = {
            ...normalizeInquiryBookInclusion(inquirySources.bookInclusion)
        };
        const normalizedPath = normalizePath(book.rootPath);
        if (!normalizedPath || normalizedPath === '/' || normalizedPath === '.') return;
        if (include === book.defaultIncluded) {
            delete next[normalizedPath];
        } else {
            next[normalizedPath] = include;
        }
        inquirySources = { ...inquirySources, bookInclusion: next };
        void refreshClassScan();
    };

    const applyScanRoots = (nextRoots: string[]) => {
        const normalized = nextRoots.length ? normalizeScanRootPatterns(nextRoots) : [];
        inquirySources = { ...inquirySources, scanRoots: normalized };
        scanRootsInput?.setValue(listToText(normalized));
        autoResizeScanRootsInput();
        scanRootActionSyncers.forEach(sync => sync());
        resolvedRootCache = null;
        resolvedBookCache = null;
        void refreshClassScan();
    };

    const applyClassScope = (nextScope: string[]) => {
        const normalized = parseClassScopeInput(nextScope.join('\n'));
        inquirySources = { ...inquirySources, classScope: normalized };
        const nextValue = listToText(normalized);
        classScopeInput?.setValue(nextValue);
        if (classScopeInput) {
            autoResizeTextAreaRows(classScopeInput.inputEl, 4);
        }
        void refreshClassScan();
    };

    const refreshClassScan = async () => {
        const rawRoots = inquirySources.scanRoots || [];
        const scanRoots = normalizeScanRootPatterns(rawRoots);
        const bookInclusion = normalizeInquiryBookInclusion(inquirySources.bookInclusion);
        const inclusionSignature = Object.entries(bookInclusion)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([path, include]) => `${path}:${include ? '1' : '0'}`)
            .join('|');
        const signature = `${scanRoots.join('|')}::${inclusionSignature}`;
        if (!resolvedRootCache || resolvedRootCache.signature !== signature) {
            if (!scanRoots.length) {
                resolvedRootCache = { signature, resolvedRoots: [] };
            } else {
                const resolved = resolveScanRoots(scanRoots, plugin.app.vault, MAX_RESOLVED_SCAN_ROOTS);
                resolvedRootCache = {
                    signature,
                    resolvedRoots: resolved.resolvedRoots
                };
                if (resolved.totalMatches > MAX_RESOLVED_SCAN_ROOTS) {
                    new Notice(`Pattern expands to ${resolved.totalMatches} folders; refine your root.`);
                }
            }
        }
        const resolvedVaultRoots = resolvedRootCache.resolvedRoots.map(toVaultRoot);
        resolvedBookCache = resolveInquiryBookResolution({
            vault: plugin.app.vault,
            metadataCache: plugin.app.metadataCache,
            resolvedVaultRoots,
            frontmatterMappings: plugin.settings.frontmatterMappings,
            bookInclusion,
            bookProfiles: plugin.settings.books
        });
        const scan = await scanInquiryClasses(
            resolvedVaultRoots,
            (path) => isPathIncludedByInquiryBooks(path, resolvedBookCache?.candidates || []),
            resolvedBookCache?.candidates || []
        );
        const scopeConfig = getClassScopeConfig(inquirySources.classScope);
        const allowedClasses = scopeConfig.allowAll ? scan.discoveredClasses : scopeConfig.allowed;
        const allowedSet = new Set(allowedClasses);
        const allConfigNames = Array.from(new Set([...scan.discoveredClasses, ...scopeConfig.allowed]));
        const merged = mergeClassConfigs(inquirySources.classes || [], allConfigNames);
        const visibleConfigs = merged.filter(config => allowedSet.has(config.className));
        const effectivePreset = inquirySources.preset ?? inferPresetFromClasses(merged) ?? undefined;
        inquirySources = {
            preset: effectivePreset,
            scanRoots: rawRoots,
            bookInclusion,
            classScope: inquirySources.classScope || [],
            classes: merged,
            classCounts: scan.discoveredCounts,
            resolvedScanRoots: resolvedRootCache.resolvedRoots,
            lastScanAt: new Date().toISOString()
        };
        plugin.settings.inquirySources = inquirySources;
        await plugin.saveSettings();
        renderClassTable(visibleConfigs, scan.discoveredCounts);
        syncPresetButtons();

        const participatingClasses = new Set<string>();
        visibleConfigs.forEach(config => {
            const participates = config.enabled
                && (config.bookScope !== 'excluded'
                    || config.sagaScope !== 'excluded'
                    || config.referenceScope !== 'excluded');
            if (!participates) return;
            participatingClasses.add(config.className);
        });

        renderDetectedContainers(resolvedBookCache, scan.containerClassCounts, participatingClasses);

    };

    function renderPromptConfiguration(targetEl: HTMLElement): void {
        const promptContainer = targetEl.createDiv({ cls: ERT_CLASSES.STACK });
        const freeCustomLimit = 3;
        const proCustomLimit = 8;
        const isPro = isProfessionalActive(plugin);
        const allCanonicalByZone = groupCanonicalQuestionsByZone(ALL_CANONICAL_QUESTIONS);
        const coreCanonicalByZone = groupCanonicalQuestionsByZone(CORE_CANONICAL_QUESTIONS);
        const zones = ['setup', 'pressure', 'payoff'] as const;
        type InquiryPromptZoneKey = typeof zones[number];
        const canonicalRowRefs: Record<InquiryPromptZoneKey, Map<string, HTMLElement>> = {
            setup: new Map(),
            pressure: new Map(),
            payoff: new Map()
        };

        let promptConfig: InquiryPromptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
        if (!plugin.settings.inquiryPromptConfig) {
            plugin.settings.inquiryPromptConfig = buildDefaultInquiryPromptConfig();
            promptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
            void plugin.saveSettings();
        }

        const zoneLabels: Record<InquiryPromptZoneKey, string> = {
            setup: 'Setup',
            pressure: 'Pressure',
            payoff: 'Payoff'
        };
        const zoneIcons: Record<InquiryPromptZoneKey, string> = {
            setup: 'sprout',
            pressure: 'gauge',
            payoff: 'target'
        };

        const createCustomSlot = (zone: InquiryPromptZoneKey): InquiryPromptSlot => ({
            id: `custom-${zone}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: '',
            question: '',
            enabled: true,
            builtIn: false,
            canonical: undefined
        });

        const getSlotList = (zone: InquiryPromptZoneKey): InquiryPromptSlot[] =>
            promptConfig[zone] ?? [];

        const savePromptConfig = async (next: InquiryPromptConfig) => {
            const normalized = normalizeInquiryPromptConfig(next);
            plugin.settings.inquiryPromptConfig = normalized;
            await plugin.saveSettings();
            promptConfig = normalized;
            plugin.getInquiryService().notifyPromptSettingsChanged();
        };

        const updateSlot = async (
            zone: InquiryPromptZoneKey,
            slotIndex: number,
            patch: Partial<InquiryPromptSlot>
        ) => {
            const slots = getSlotList(zone);
            const current = slots[slotIndex];
            if (!current) return;
            const nextSlot = { ...current, ...patch };
            nextSlot.label = nextSlot.label ?? '';
            nextSlot.question = nextSlot.question ?? '';
            if (isCanonicalPromptSlot(current)) {
                const syncedSlot = syncCanonicalPromptSlot(nextSlot);
                const nextSlots = [...slots];
                nextSlots[slotIndex] = syncedSlot;
                await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
                return;
            }

            if (current.builtIn) {
                nextSlot.enabled = true;
                nextSlot.builtIn = true;
            } else {
                nextSlot.enabled = !!nextSlot.enabled || nextSlot.question.trim().length > 0;
                nextSlot.builtIn = false;
                nextSlot.canonical = undefined;
            }
            const nextSlots = [...slots];
            nextSlots[slotIndex] = nextSlot;
            await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
        };

        const addCustomSlot = async (
            zone: InquiryPromptZoneKey,
            limit: number,
            initial?: Partial<InquiryPromptSlot>
        ) => {
            const slots = getSlotList(zone);
            const customCount = slots.filter(slot => !isCanonicalPromptSlot(slot)).length;
            if (customCount >= limit) return;
            const seed = createCustomSlot(zone);
            const nextSlot = { ...seed, ...initial, builtIn: false };
            nextSlot.label = nextSlot.label ?? '';
            nextSlot.question = nextSlot.question ?? '';
            if (nextSlot.question.trim().length > 0) {
                nextSlot.enabled = true;
            }
            const nextSlots = [...slots, nextSlot];
            await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
            render();
        };

        const removeSlot = async (zone: InquiryPromptZoneKey, slotIndex: number) => {
            if (slotIndex === 0) return;
            const slots = getSlotList(zone);
            const target = slots[slotIndex];
            if (!target) return;
            const nextSlots = slots.filter((_, idx) => idx !== slotIndex);
            await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
            render();
        };

        const getSelectableCanonicalQuestions = (
            zone: InquiryPromptZoneKey,
            currentSlot?: InquiryPromptSlot
        ): InquiryCanonicalQuestionDefinition[] => {
            const allowed = isPro ? allCanonicalByZone[zone] : coreCanonicalByZone[zone];
            const questions = [...allowed];
            const currentCanonical = getCanonicalQuestionForSlot(currentSlot);
            if (!isPro && currentCanonical?.tier === 'signature' && !questions.some(question => question.id === currentCanonical.id)) {
                questions.push(currentCanonical);
            }
            return questions.sort((left, right) => left.defaultOrder - right.defaultOrder);
        };

        const getZoneSlotCapacity = (zone: InquiryPromptZoneKey): number =>
            (isPro ? allCanonicalByZone[zone] : coreCanonicalByZone[zone]).length;

        const getActiveCanonicalSelectionId = (
            slot: InquiryPromptSlot | undefined
        ): string => {
            if (getInquiryPromptSlotState(slot) !== 'canonical-loaded') {
                return '';
            }
            return getCanonicalQuestionForSlot(slot)?.id ?? '';
        };

        const getCanonicalTemplateOrder = (
            question: InquiryCanonicalQuestionDefinition,
            zone: InquiryPromptZoneKey
        ): number => {
            const ordered = getSelectableCanonicalQuestions(zone);
            const index = ordered.findIndex(candidate => candidate.id === question.id);
            return index === -1 ? question.defaultOrder : index + 1;
        };

        const findCanonicalSlotIndex = (
            zone: InquiryPromptZoneKey,
            canonicalId: string,
            excludeIndex?: number
        ): number => getSlotList(zone).findIndex((slot, idx) =>
            idx !== excludeIndex && getCanonicalQuestionForSlot(slot)?.id === canonicalId);

        const getCanonicalOptionLabel = (
            question: InquiryCanonicalQuestionDefinition,
            zone: InquiryPromptZoneKey,
            excludeIndex?: number
        ): string => {
            const parts = [question.label];
            const existingIndex = findCanonicalSlotIndex(zone, question.id, excludeIndex);
            if (question.tier === 'signature') {
                parts.push('Pro');
            }
            if (existingIndex !== -1) {
                parts.push(`#${existingIndex + 1}`);
                parts.push('Already added');
            }
            return parts.join(' · ');
        };

        const getCanonicalInsertOptionLabel = (
            question: InquiryCanonicalQuestionDefinition,
            zone: InquiryPromptZoneKey
        ): string => {
            const parts = [`${getCanonicalTemplateOrder(question, zone)}. ${question.label}`];
            if (question.tier === 'signature') {
                parts.push('Pro');
            }
            return parts.join(' · ');
        };

        const focusCanonicalQuestionRow = (
            zone: InquiryPromptZoneKey,
            canonicalId: string,
            message = 'Already added — moved to existing question'
        ): boolean => {
            const row = canonicalRowRefs[zone].get(canonicalId);
            if (!row) return false;
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.remove('ert-inquiry-prompt-row--focusflash');
            window.setTimeout(() => row.classList.add('ert-inquiry-prompt-row--focusflash'), 0);
            window.setTimeout(() => row.classList.remove('ert-inquiry-prompt-row--focusflash'), 1800);
            new Notice(message);
            return true;
        };

        const openReplacementConfirm = (options: {
            title: string;
            subtitle: string;
            warning?: string;
            confirmText: string;
        }): Promise<boolean> => {
            const { title, subtitle, warning, confirmText } = options;

            return new Promise(resolve => {
                const confirmModal = new Modal(plugin.app);
                const { modalEl, contentEl } = confirmModal;
                let settled = false;
                const finish = (result: boolean) => {
                    if (settled) return;
                    settled = true;
                    resolve(result);
                };
                confirmModal.titleEl.setText('');
                contentEl.empty();
                modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                contentEl.addClass('ert-modal-container', 'ert-stack');

                const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'INQUIRY' });
                header.createDiv({ cls: 'ert-modal-title', text: title });
                header.createDiv({
                    cls: 'ert-modal-subtitle',
                    text: subtitle
                });
                if (warning) {
                    contentEl.createDiv({
                        cls: 'ert-inquiry-prompt-warning',
                        text: warning
                    });
                }

                const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer)
                    .setButtonText(confirmText)
                    .setCta()
                    .onClick(() => {
                        finish(true);
                        confirmModal.close();
                    });
                new ButtonComponent(footer)
                    .setButtonText('Cancel')
                    .onClick(() => {
                        finish(false);
                        confirmModal.close();
                    });

                confirmModal.onClose = () => finish(false);
                confirmModal.open();
            });
        };

        const confirmCanonicalReplacement = (nextLabel: string): Promise<boolean> => {
            const overwrittenSlots = zones
                .flatMap(zone => getSlotList(zone))
                .filter(slot => getInquiryPromptSlotState(slot) !== 'empty');
            if (!overwrittenSlots.length) return Promise.resolve(true);

            const customizedCount = overwrittenSlots
                .filter(slot => getInquiryPromptSlotState(slot) === 'customized')
                .length;
            const subtitle = customizedCount > 0
                ? `Load the ${nextLabel}. Existing questions in every zone will be replaced.`
                : `Load the ${nextLabel}. Current questions in every zone will be replaced.`;
            const warning = customizedCount === 1
                ? 'This custom question will be replaced and cannot be recovered.'
                : customizedCount > 1
                    ? 'Custom questions will be replaced and cannot be recovered.'
                    : undefined;
            return openReplacementConfirm({
                title: customizedCount > 0 ? 'Replace customized questions?' : 'Replace current questions?',
                subtitle,
                warning,
                confirmText: 'Replace questions'
            });
        };

        const confirmSlotCanonicalReplacement = async (
            slot: InquiryPromptSlot | undefined,
            nextQuestion: InquiryCanonicalQuestionDefinition
        ): Promise<boolean> => {
            const slotState = getInquiryPromptSlotState(slot);
            if (slotState === 'empty') return true;
            if (slotState === 'customized') {
                return openReplacementConfirm({
                    title: 'Replace custom question?',
                    subtitle: `Replace this slot with "${nextQuestion.label}".`,
                    warning: 'This custom question will be replaced and cannot be recovered.',
                    confirmText: 'Replace question'
                });
            }
            return openReplacementConfirm({
                title: 'Replace canonical question?',
                subtitle: `Replace this slot with "${nextQuestion.label}".`,
                confirmText: 'Replace question'
            });
        };

        const replaceSlotWithCanonical = async (
            zone: InquiryPromptZoneKey,
            slotIndex: number,
            canonicalId: string
        ) => {
            const slots = getSlotList(zone);
            const current = slots[slotIndex];
            const nextSlot = createCanonicalPromptSlotById(canonicalId);
            if (!current || !nextSlot) return;
            if (getCanonicalQuestionForSlot(current)?.id === canonicalId && getInquiryPromptSlotState(current) === 'canonical-loaded') {
                return;
            }
            const duplicateIndex = findCanonicalSlotIndex(zone, canonicalId, slotIndex);
            if (duplicateIndex !== -1) {
                focusCanonicalQuestionRow(zone, canonicalId);
                return;
            }
            const confirmed = await confirmSlotCanonicalReplacement(current, getCanonicalQuestionForSlot(nextSlot)!);
            if (!confirmed) return;
            const nextSlots = [...slots];
            nextSlots[slotIndex] = nextSlot;
            await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
            render();
        };

        const insertCanonicalSlot = async (
            zone: InquiryPromptZoneKey,
            canonicalId: string
        ) => {
            if (findCanonicalSlotIndex(zone, canonicalId) !== -1) {
                focusCanonicalQuestionRow(zone, canonicalId);
                return;
            }
            const nextSlot = createCanonicalPromptSlotById(canonicalId);
            if (!nextSlot) return;
            const nextSlots = [...getSlotList(zone), nextSlot];
            await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
            render();
        };

        const loadCanonicalSet = async (loadout: 'core' | 'full-signature') => {
            const nextLabel = loadout === 'core' ? 'Core Questions' : 'Full Pro Signature Set';
            const confirmed = await confirmCanonicalReplacement(nextLabel);
            if (!confirmed) return;
            await savePromptConfig(replaceCanonicalPromptSlots(promptConfig, loadout));
            new Notice(`${nextLabel} loaded.`);
            render();
        };

        const reorderSlots = async (
            zone: InquiryPromptZoneKey,
            fromIndex: number,
            toIndex: number
        ) => {
            if (fromIndex === toIndex) return;
            const slots = getSlotList(zone);
            if (fromIndex < 0 || fromIndex >= slots.length || toIndex < 0 || toIndex >= slots.length) return;
            const nextSlots = [...slots];
            const [moved] = nextSlots.splice(fromIndex, 1);
            nextSlots.splice(toIndex, 0, moved);
            await savePromptConfig({ ...promptConfig, [zone]: nextSlots });
            render();
        };

        const createPromptRowDragPreview = (event: DragEvent, row: HTMLElement): (() => void) => {
            if (!event.dataTransfer) return () => undefined;
            const rect = row.getBoundingClientRect();
            const preview = row.cloneNode(true) as HTMLElement;
            preview.addClass('ert-settings-prompt-row--dragPreview');
            preview.removeClass('is-dragging');
            preview.style.setProperty('--ert-inquiry-drag-preview-width', `${Math.ceil(rect.width)}px`);
            preview.style.setProperty('--ert-inquiry-drag-preview-height', `${Math.ceil(rect.height)}px`);
            document.body.appendChild(preview);

            const offsetX = event.clientX > 0 ? Math.max(24, event.clientX - rect.left) : 28;
            const offsetY = event.clientY > 0 ? Math.max(20, event.clientY - rect.top) : 28;
            event.dataTransfer.setDragImage(preview, offsetX, offsetY);

            return () => {
                window.setTimeout(() => preview.remove(), 0);
            };
        };

        const renderSlotRows = (
            listEl: HTMLElement,
            zone: InquiryPromptZoneKey,
            slots: InquiryPromptSlot[],
            customIndexMap: Map<string, number>,
            dragState: { index: number | null }
        ) => {
            slots.forEach((slot, slotIndex) => {
                const row = listEl.createDiv({ cls: 'ert-reorder-row ert-reorder-row--two-col' });
                row.addClass('ert-inquiry-prompt-row');
                const slotState = getInquiryPromptSlotState(slot);
                const customIndex = customIndexMap.has(slot.id) ? customIndexMap.get(slot.id)! : -1;
                const isProRow = slotState === 'customized' && customIndex >= freeCustomLimit;
                const canonicalQuestion = getCanonicalQuestionForSlot(slot);
                const canRemoveSlot = slotIndex > 0;
                if (canonicalQuestion) {
                    canonicalRowRefs[zone].set(canonicalQuestion.id, row);
                }
                if (isProRow) {
                    row.addClass('ert-reorder-row--pro');
                    if (!isPro) {
                        row.addClass('ert-reorder-row--locked');
                    }
                }
                row.toggleClass('ert-inquiry-prompt-row--template', slotState === 'canonical-loaded');
                row.toggleClass('ert-inquiry-prompt-row--customized', slotState === 'customized');
                row.toggleClass(
                    'ert-inquiry-prompt-row--signature',
                    slotState === 'canonical-loaded' && canonicalQuestion?.tier === 'signature'
                );

                const labelCol = row.createDiv({ cls: 'ert-reorder-col ert-inquiry-prompt-col ert-inquiry-prompt-col--handle' });
                const questionCol = row.createDiv({
                    cls: 'ert-reorder-col ert-reorder-col--question ert-inquiry-prompt-col ert-inquiry-prompt-col--question'
                });

                const rowIndex = labelCol.createDiv({ cls: 'ert-inquiry-prompt-index', text: String(slotIndex + 1) });
                rowIndex.setAttribute('aria-hidden', 'true');

                const dragHandle = labelCol.createDiv({ cls: 'ert-drag-handle' });
                dragHandle.draggable = true;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, 'Drag to reorder');

                const topRow = questionCol.createDiv({ cls: 'ert-inquiry-prompt-topRow' });
                const labelField = topRow.createDiv({ cls: 'ert-inquiry-prompt-labelField' });
                const labelInput = new TextComponent(labelField);
                labelInput.setPlaceholder('Label (optional)')
                    .setValue(slot.label ?? '');
                labelInput.inputEl.addClass('ert-input', 'ert-input--md', 'ert-inquiry-prompt-labelInput');
                if (slotState === 'canonical-loaded') {
                    labelInput.inputEl.readOnly = true;
                    labelInput.inputEl.addClass('is-readonly');
                    const templateMeta = topRow.createDiv({ cls: 'ert-inquiry-prompt-templateMeta' });
                    const templateIcon = templateMeta.createDiv({ cls: 'ert-inquiry-prompt-templateMeta__icon' });
                    setIcon(templateIcon, 'lock');
                    templateMeta.createSpan({ text: 'Fixed template' });
                } else {
                    labelInput.onChange(async (value) => {
                        await updateSlot(zone, slotIndex, { label: value });
                    });

                    const pickerWrap = topRow.createDiv({ cls: 'ert-inquiry-prompt-canonical-picker' });
                    const canonicalPicker = new DropdownComponent(pickerWrap);
                    canonicalPicker.selectEl.addClass('ert-input', 'ert-input--md');
                    canonicalPicker.addOption('', 'Replace with template');
                    getSelectableCanonicalQuestions(zone, slot).forEach(question => {
                        canonicalPicker.addOption(question.id, getCanonicalOptionLabel(question, zone, slotIndex));
                    });
                    const activeCanonicalSelectionId = getActiveCanonicalSelectionId(slot);
                    canonicalPicker.setValue(activeCanonicalSelectionId);
                    canonicalPicker.onChange((selectedId) => {
                        if (!selectedId) return;
                        const duplicateIndex = findCanonicalSlotIndex(zone, selectedId, slotIndex);
                        if (duplicateIndex === -1) return;
                        if (activeCanonicalSelectionId === selectedId) return;
                        focusCanonicalQuestionRow(zone, selectedId);
                        canonicalPicker.setValue(activeCanonicalSelectionId);
                    });

                    const applyCanonicalButton = pickerWrap.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
                    setIcon(applyCanonicalButton, 'sparkles');
                    setTooltip(applyCanonicalButton, 'Apply selected canonical question');
                    applyCanonicalButton.onclick = () => {
                        const selectedId = canonicalPicker.getValue();
                        if (!selectedId) return;
                        void replaceSlotWithCanonical(zone, slotIndex, selectedId);
                    };
                }

                const rowActions = topRow.createDiv({ cls: ERT_CLASSES.ICON_BTN_GROUP });
                if (canonicalQuestion && slotState === 'customized') {
                    const resetButton = rowActions.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
                    setIcon(resetButton, 'rotate-ccw');
                    setTooltip(resetButton, 'Reset to canonical question');
                    resetButton.onclick = () => {
                        labelInput.setValue(canonicalQuestion.label ?? '');
                        questionInput.setValue(canonicalQuestion.text ?? '');
                        void updateSlot(zone, slotIndex, {
                            label: canonicalQuestion.label ?? '',
                            question: canonicalQuestion.text ?? '',
                            enabled: true
                        });
                    };
                } else if (canRemoveSlot) {
                    const deleteBtn = rowActions.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
                    setIcon(deleteBtn, 'trash');
                    setTooltip(deleteBtn, 'Delete question');
                    deleteBtn.onclick = () => {
                        void removeSlot(zone, slotIndex);
                    };
                }

                const questionMain = questionCol.createDiv({ cls: 'ert-inquiry-prompt-questionRow' });
                const questionInput = new TextComponent(questionMain);
                questionInput.setPlaceholder('Question text')
                    .setValue(slot.question ?? '');
                questionInput.inputEl.addClass('ert-input', 'ert-input--full', 'ert-inquiry-prompt-questionInput');
                if (slotState === 'canonical-loaded') {
                    questionInput.inputEl.readOnly = true;
                    questionInput.inputEl.addClass('is-readonly');
                } else {
                    questionInput.onChange(async (value) => {
                        await updateSlot(zone, slotIndex, { question: value });
                    });
                }
                if (slotState === 'customized') {
                    const customizedIcon = questionMain.createDiv({ cls: 'ert-inquiry-prompt-customizedIcon' });
                    customizedIcon.toggleClass('is-signature', canonicalQuestion?.tier === 'signature' || isProRow);
                    setIcon(customizedIcon, 'pencil');
                    setTooltip(customizedIcon, 'Customized question');
                }

                plugin.registerDomEvent(dragHandle, 'dragstart', (e) => {
                    dragState.index = slotIndex;
                    row.classList.add('is-dragging');
                    e.dataTransfer?.setData('text/plain', slotIndex.toString());
                    let clearDragPreview: () => void = () => undefined;
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        clearDragPreview = createPromptRowDragPreview(e, row);
                    }
                    (dragHandle as HTMLElement & { __ertClearDragPreview?: () => void }).__ertClearDragPreview = clearDragPreview;
                });

                plugin.registerDomEvent(dragHandle, 'dragend', () => {
                    row.classList.remove('is-dragging');
                    row.classList.remove('is-dragover');
                    (dragHandle as HTMLElement & { __ertClearDragPreview?: () => void }).__ertClearDragPreview?.();
                    delete (dragHandle as HTMLElement & { __ertClearDragPreview?: () => void }).__ertClearDragPreview;
                    dragState.index = null;
                });

                plugin.registerDomEvent(row, 'dragover', (e) => {
                    e.preventDefault();
                    row.classList.add('is-dragover');
                });

                plugin.registerDomEvent(row, 'dragleave', () => {
                    row.classList.remove('is-dragover');
                });

                plugin.registerDomEvent(row, 'drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('is-dragover');
                    const from = dragState.index ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
                    if (Number.isNaN(from) || from < 0 || from === slotIndex) {
                        dragState.index = null;
                        return;
                    }
                    dragState.index = null;
                    void reorderSlots(zone, from, slotIndex);
                });
            });
        };

        const zoneExpanded: Record<InquiryPromptZoneKey, boolean> = {
            setup: true,
            pressure: true,
            payoff: true
        };

        const renderZoneCard = (
            zone: InquiryPromptZoneKey,
            dragState: { index: number | null }
        ) => {
            const zoneStack = promptContainer.createDiv({ cls: ERT_CLASSES.STACK });

            const headingCard = zoneStack.createDiv({ cls: ['setting-item', 'ert-inquiry-prompt-header'] });
            const headingInfo = headingCard.createDiv({ cls: 'setting-item-info' });
            const zoneColor = `var(--ert-inquiry-zone-${zone})`;
            const zoneStroke = `var(--ert-inquiry-zone-${zone}-stroke)`;
            headingInfo.style.setProperty('--ert-inquiry-zone-color', zoneColor);
            headingInfo.style.setProperty('--ert-inquiry-zone-stroke', zoneStroke);

            const headingIcon = headingInfo.createDiv({ cls: 'ert-inquiry-prompt-header__icon' });
            setIcon(headingIcon, zoneIcons[zone]);

            const headingContent = headingInfo.createDiv({ cls: 'ert-inquiry-prompt-header__content' });
            const headingName = headingContent.createDiv({ cls: 'setting-item-name' });
            const headingPill = headingName.createSpan({ cls: ['ert-badgePill', 'ert-badgePill--sm'] });
            headingPill.createSpan({
                cls: 'ert-badgePill__text',
                text: zoneLabels[zone].toUpperCase()
            });
            headingPill.style.setProperty(
                '--ert-badgePill-bg',
                `color-mix(in srgb, ${zoneColor} 18%, var(--background-secondary))`
            );
            headingPill.style.setProperty('--ert-badgePill-border', zoneStroke);
            headingPill.style.setProperty('--ert-badgePill-color', zoneStroke);
            headingPill.style.setProperty(
                '--ert-badgePill-shadow',
                `0 0 0 1px color-mix(in srgb, ${zoneStroke} 35%, transparent)`
            );
            headingContent.createDiv({
                cls: 'setting-item-description',
                text: getInquiryZoneDescription(zone)
            });

            const listCard = zoneStack.createDiv({ cls: ERT_CLASSES.PANEL });
            listCard.toggleClass('ert-settings-hidden', !zoneExpanded[zone]);
            const listEl = listCard.createDiv({ cls: ['ert-template-entries', 'ert-template-indent'] });
            listEl.style.setProperty('--ert-template-indent-accent', zoneStroke);

            const headingControl = headingCard.createDiv({ cls: 'setting-item-control' });
            const toggleButton = headingControl.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
            const refreshToggle = () => {
                const expanded = zoneExpanded[zone];
                setIcon(toggleButton, expanded ? 'chevron-down' : 'chevron-right');
                setTooltip(toggleButton, expanded ? 'Collapse' : 'Expand');
                listCard.toggleClass('ert-settings-hidden', !expanded);
            };
            refreshToggle();
            toggleButton.onclick = () => {
                zoneExpanded[zone] = !zoneExpanded[zone];
                refreshToggle();
            };

            const slots = getSlotList(zone);
            const customSlots = slots.filter(slot => getInquiryPromptSlotState(slot) === 'customized');
            const customIndexMap = new Map<string, number>();
            customSlots.forEach((slot, idx) => customIndexMap.set(slot.id, idx));
            renderSlotRows(listEl, zone, slots, customIndexMap, dragState);

            const showProGhost = !isPro
                && customSlots.length >= freeCustomLimit
                && customSlots.length < proCustomLimit;
            if (showProGhost) {
                const ghostRow = listEl.createDiv({
                    cls: 'ert-reorder-row ert-reorder-row--two-col ert-reorder-row--pro ert-reorder-row--ghost'
                });
                const ghostText = ghostRow.createDiv({
                    cls: 'ert-reorder-placeholder ert-reorder-placeholder--pro'
                });
                ghostText.createSpan({ text: 'Unlock more custom questions with Pro' });
                const ghostBadge = ghostText.createDiv({ cls: ERT_CLASSES.ICON_BTN_GROUP });
                badgePill(ghostBadge, {
                    icon: 'sparkles',
                    label: 'Pro',
                    variant: ERT_CLASSES.BADGE_PILL_PRO,
                    size: ERT_CLASSES.BADGE_PILL_SM
                });
            }

            const addLimit = isPro ? proCustomLimit : freeCustomLimit;
            const zoneCapacity = getZoneSlotCapacity(zone);
            const insertableCanonicalQuestions = getSelectableCanonicalQuestions(zone)
                .filter(question => findCanonicalSlotIndex(zone, question.id) === -1);
            const canAddCustom = customSlots.length < addLimit;
            const canAddCanonical = insertableCanonicalQuestions.length > 0;
            const hasZoneCapacity = slots.length < zoneCapacity;

            if (hasZoneCapacity && (canAddCustom || canAddCanonical)) {
                const addRow = listEl.createDiv({ cls: 'ert-reorder-row ert-reorder-row--two-col ert-inquiry-prompt-addRow' });
                if (isPro && customSlots.length >= freeCustomLimit) {
                    addRow.addClass('ert-reorder-row--pro');
                }

                const labelCol = addRow.createDiv({ cls: 'ert-reorder-col ert-inquiry-prompt-col ert-inquiry-prompt-col--handle' });
                const questionCol = addRow.createDiv({
                    cls: 'ert-reorder-col ert-reorder-col--question ert-inquiry-prompt-col ert-inquiry-prompt-col--question'
                });

                const addIcon = labelCol.createDiv({ cls: 'ert-drag-handle ert-drag-placeholder ert-inquiry-prompt-insertIcon' });
                setIcon(addIcon, 'plus');

                const topRow = questionCol.createDiv({ cls: 'ert-inquiry-prompt-topRow' });
                const labelField = topRow.createDiv({ cls: 'ert-inquiry-prompt-labelField' });
                const labelInput = new TextComponent(labelField);
                labelInput.setPlaceholder('Label (optional)').setValue('');
                labelInput.inputEl.addClass('ert-input', 'ert-input--md', 'ert-inquiry-prompt-labelInput');
                labelInput.setDisabled(!canAddCustom);

                const canonicalPickerWrap = topRow.createDiv({ cls: 'ert-inquiry-prompt-canonical-picker' });
                const canonicalPicker = new DropdownComponent(canonicalPickerWrap);
                canonicalPicker.selectEl.addClass('ert-input', 'ert-input--md');
                canonicalPicker.addOption('', canAddCanonical ? 'Or choose a canonical question' : 'No remaining canonical questions');
                insertableCanonicalQuestions.forEach(question => {
                    canonicalPicker.addOption(question.id, getCanonicalInsertOptionLabel(question, zone));
                });
                canonicalPicker.setDisabled(!canAddCanonical);

                const addActions = topRow.createDiv({ cls: ERT_CLASSES.ICON_BTN_GROUP });
                const addBtn = addActions.createEl('button', { cls: [ERT_CLASSES.ICON_BTN, 'ert-mod-cta'] });
                setIcon(addBtn, 'plus');
                setTooltip(addBtn, 'Add question');

                const questionMain = questionCol.createDiv({ cls: 'ert-inquiry-prompt-questionRow' });
                const questionInput = new TextComponent(questionMain);
                questionInput.setPlaceholder('Question text').setValue('');
                questionInput.inputEl.addClass('ert-input', 'ert-input--full', 'ert-inquiry-prompt-questionInput');
                questionInput.setDisabled(!canAddCustom);

                const clearCanonicalSelection = () => {
                    if (!canonicalPicker.getValue()) return;
                    canonicalPicker.setValue('');
                };
                labelInput.onChange(() => clearCanonicalSelection());
                questionInput.onChange(() => clearCanonicalSelection());
                canonicalPicker.onChange((selectedId) => {
                    if (!selectedId) return;
                    labelInput.setValue('');
                    questionInput.setValue('');
                });

                const commitAdd = () => {
                    const selectedCanonicalId = canonicalPicker.getValue();
                    if (selectedCanonicalId) {
                        void insertCanonicalSlot(zone, selectedCanonicalId);
                        return;
                    }
                    if (!canAddCustom) return;
                    void addCustomSlot(zone, addLimit, {
                        label: labelInput.getValue(),
                        question: questionInput.getValue()
                    });
                };

                addBtn.onclick = commitAdd;
                plugin.registerDomEvent(questionInput.inputEl, 'keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commitAdd();
                    }
                });
            } else if (!hasZoneCapacity) {
                const fullNote = listEl.createDiv({ cls: 'ert-inquiry-prompt-zoneFullNote' });
                fullNote.setText('Delete a question to add a custom or remaining template question.');
            }
        };

        const render = () => {
            promptContainer.empty();
            zones.forEach(zone => canonicalRowRefs[zone].clear());

            const librarySetting = new Settings(promptContainer)
                .setName('Canonical question library')
                .setDesc(
                    isPro
                        ? 'Load the full Pro Signature set. Loading replaces all current questions in every zone.'
                        : 'Load the curated Core set. Loading replaces all current questions in every zone.'
                );
            librarySetting.settingEl.addClass(ERT_CLASSES.ROW, ERT_CLASSES.ROW_TIGHT);
            const libraryActions = librarySetting.controlEl.createDiv({ cls: [ERT_CLASSES.INLINE, 'ert-actions', 'ert-preset-controls'] });

            if (isPro) {
                const signatureButton = libraryActions.createEl('button', {
                    cls: `${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_PRO} ert-preset-pill`
                });
                const signatureIcon = signatureButton.createSpan({ cls: ERT_CLASSES.PILL_BTN_ICON });
                setIcon(signatureIcon, 'signature');
                signatureButton.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: 'Load Full Pro Signature Set' });
                setTooltip(signatureButton, 'Load all canonical Inquiry questions');
                plugin.registerDomEvent(signatureButton, 'click', evt => {
                    evt.preventDefault();
                    void loadCanonicalSet('full-signature');
                });
            } else {
                const coreButton = libraryActions.createEl('button', { cls: `${ERT_CLASSES.PILL_BTN} ert-preset-pill` });
                coreButton.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: 'Load Core Questions' });
                plugin.registerDomEvent(coreButton, 'click', evt => {
                    evt.preventDefault();
                    void loadCanonicalSet('core');
                });
            }

            const dragStates: Record<InquiryPromptZoneKey, { index: number | null }> = {
                setup: { index: null as number | null },
                pressure: { index: null as number | null },
                payoff: { index: null as number | null }
            };

            zones.forEach(zone => {
                renderZoneCard(zone, dragStates[zone]);
            });
        };

        render();
    }

    const renderCorpusCcSettings = (targetEl: HTMLElement) => {
        const thresholdDefaults = normalizeCorpusThresholds(plugin.settings.inquiryCorpusThresholds);
        plugin.settings.inquiryCorpusThresholds = thresholdDefaults;

        const corpusPanel = targetEl.createDiv({ cls: [ERT_CLASSES.PANEL, ERT_CLASSES.STACK] });

        const table = corpusPanel.createDiv({ cls: ['ert-controlGroup', 'ert-controlGroup--corpus'] });

        const header = table.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--header'] });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Tier' });
        header.createDiv({ cls: 'ert-controlGroup__cell' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Threshold' });

        const inputs: Record<keyof InquiryCorpusThresholds, HTMLInputElement> = {
            emptyMax: document.createElement('input'),
            sketchyMin: document.createElement('input'),
            mediumMin: document.createElement('input'),
            substantiveMin: document.createElement('input')
        };

        const renderRow = (label: string, key: keyof InquiryCorpusThresholds, operator = '>=') => {
            const row = table.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--card'] });
            row.createDiv({ cls: 'ert-controlGroup__cell', text: label });
            row.createDiv({
                cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--meta', 'ert-controlGroup__cell--mono'],
                text: operator
            });
            const cell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            const input = inputs[key];
            input.type = 'number';
            input.min = '0';
            input.step = '1';
            input.value = String(thresholdDefaults[key]);
            input.classList.add('ert-input--sm');
            cell.appendChild(input);
        };

        renderRow('Empty', 'emptyMax', '<');
        renderRow('Sketchy', 'sketchyMin');
        renderRow('Medium', 'mediumMin');
        renderRow('Substantive', 'substantiveMin');

        const syncInputs = (values: InquiryCorpusThresholds) => {
            (Object.keys(inputs) as Array<keyof InquiryCorpusThresholds>).forEach(key => {
                inputs[key].value = String(values[key]);
            });
        };

        const commitThresholds = async (next: InquiryCorpusThresholds) => {
            const error = validateCorpusThresholds(next);
            if (error) {
                new Notice(error);
                syncInputs(thresholdDefaults);
                return;
            }
            Object.assign(thresholdDefaults, next);
            plugin.settings.inquiryCorpusThresholds = { ...next };
            await plugin.saveSettings();
            syncInputs(next);
        };

        (Object.keys(inputs) as Array<keyof InquiryCorpusThresholds>).forEach(key => {
            const input = inputs[key];
            plugin.registerDomEvent(input, 'blur', () => {
                const next = {
                    ...thresholdDefaults,
                    [key]: Number(input.value)
                };
                void commitThresholds(next);
            });
        });

        new Settings(corpusPanel)
            .setName('Highlight completed docs with low substance')
            .setDesc('Flags completed notes that fall in Empty or Sketchy tiers.')
            .addToggle(toggle => {
                toggle.setValue(plugin.settings.inquiryCorpusHighlightLowSubstanceComplete ?? true);
                toggle.onChange(async (value) => {
                    plugin.settings.inquiryCorpusHighlightLowSubstanceComplete = value;
                    await plugin.saveSettings();
                });
            })
            .addExtraButton(button => {
                button.setIcon('rotate-ccw');
                button.setTooltip('Reset CC thresholds');
                button.onClick(async () => {
                    const reset = normalizeCorpusThresholds(DEFAULT_SETTINGS.inquiryCorpusThresholds);
                    await commitThresholds(reset);
                });
            });
    };

    const corpusBody = createSection(containerEl, {
        title: 'Corpus (CC)',
        desc: 'Highlight content quality and completeness according to your quality standards. Thresholds are based on content-only word counts (frontmatter excluded).',
        icon: 'layout-grid',
        wiki: 'Settings#inquiry-corpus'
    });
    renderCorpusCcSettings(corpusBody);

    const configBody = createSection(containerEl, {
        title: 'Configuration',
        desc: 'Briefings, action notes, and recent session defaults for Inquiry briefs.',
        icon: 'settings',
        wiki: 'Settings#inquiry'
    });

    const artifactSetting = new Settings(configBody)
        .setName('Briefing folder')
        .setDesc('Inquiry briefs are saved here when auto-save is enabled.');

    artifactSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.inquiryArtifactFolder || 'Radial Timeline/Inquiry/Briefing';
        const fallbackFolder = plugin.settings.inquiryArtifactFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(defaultPath)
            .setValue(fallbackFolder);
        text.inputEl.addClass('ert-input--xl');

        if (attachFolderSuggest) {
            attachFolderSuggest(text);
        }

        const inputEl = text.inputEl;
        const flashClass = (cls: string) => {
            inputEl.addClass(cls);
            window.setTimeout(() => inputEl.removeClass(cls), cls === 'ert-setting-input-success' ? 1000 : 2000);
        };

        const validatePath = async () => {
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');

            const rawValue = text.getValue();
            const trimmed = rawValue.trim() || fallbackFolder;

            if (illegalChars.test(trimmed)) {
                flashClass('ert-setting-input-error');
                new Notice('Folder path cannot contain the characters < > : " | ? *');
                return;
            }

            const normalized = normalizePath(trimmed);
            try { await plugin.app.vault.createFolder(normalized); } catch { /* folder may already exist */ }

            plugin.settings.inquiryArtifactFolder = normalized;
            await plugin.saveSettings();
            flashClass('ert-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        artifactSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                plugin.settings.inquiryArtifactFolder = normalizePath(defaultPath);
                await plugin.saveSettings();
                flashClass('ert-setting-input-success');
            });
        });
    });

    new Settings(configBody)
        .setName('Auto-save Inquiry briefs')
        .setDesc('Save a brief automatically after each successful Inquiry run.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryAutoSave ?? true);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryAutoSave = value;
                await plugin.saveSettings();
            });
        });

    const resolveActionNotesFieldLabel = () => {
        const fallback = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        return (plugin.settings.inquiryActionNotesTargetField ?? fallback).trim() || fallback;
    };

    const actionNotesFieldSetting = new Settings(configBody)
        .setName('Action notes target YAML field')
        .setDesc('Frontmatter field to receive Inquiry action notes. Default is "Pending Edits". Notes are appended after any existing content with a link to the Inquiry brief.');
    const defaultActionNotesField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
    let actionNotesFieldInput: TextComponent | null = null;

    const autoPopulateSetting = new Settings(configBody)
        .setName(`Auto-populate ${resolveActionNotesFieldLabel()}`)
        .setDesc('Automatically write action notes to the target yaml field after each Inquiry run. When off, use Recent Inquiry Sessions to write manually.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryActionNotesAutoPopulate ?? false);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryActionNotesAutoPopulate = value;
                await plugin.saveSettings();
            });
        });

    const refreshActionNotesLabels = () => {
        const fieldLabel = resolveActionNotesFieldLabel();
        autoPopulateSetting.setName(`Auto-populate ${fieldLabel}`);
    };

    actionNotesFieldSetting.addText(text => {
        const current = plugin.settings.inquiryActionNotesTargetField?.trim() || defaultActionNotesField;
        actionNotesFieldInput = text;
        text.setPlaceholder(defaultActionNotesField);
        text.setValue(current);
        text.inputEl.addClass('ert-input--lg');
        text.onChange(async (value) => {
            const next = value.trim() || defaultActionNotesField;
            plugin.settings.inquiryActionNotesTargetField = next;
            await plugin.saveSettings();
            refreshActionNotesLabels();
        });
    });

    actionNotesFieldSetting.addExtraButton(button => {
        button
            .setIcon('reset')
            .setTooltip('Reset to default')
            .onClick(async () => {
                plugin.settings.inquiryActionNotesTargetField = defaultActionNotesField;
                actionNotesFieldInput?.setValue(defaultActionNotesField);
                await plugin.saveSettings();
                refreshActionNotesLabels();
            });
    });

    const historyStore = new InquirySessionStore(plugin);
    const resolveHistoryLimit = (): number => {
        const normalized = historyStore.getConfiguredLimit();
        if (plugin.settings.inquiryRecentSessionsLimit !== normalized) {
            plugin.settings.inquiryRecentSessionsLimit = normalized;
        }
        return normalized;
    };

    const historyLimitSetting = new Settings(configBody)
        .setName('Inquire session history')
        .setDesc('This does not affect Inquiry Briefs. It relates only to Inquiry View rehydration, which loads previous sessions from the Session Manager Popover. Limited to a max of 100 sessions.');
    historyLimitSetting.addDropdown(dropdown => {
        INQUIRY_HISTORY_LIMIT_OPTIONS.forEach(option => dropdown.addOption(String(option), `${option}`));
        const currentLimit = resolveHistoryLimit();
        dropdown.setValue(String(currentLimit));
        dropdown.selectEl.addClass('ert-input--sm');
        dropdown.onChange(async value => {
            const parsed = Number(value);
            const nextLimit = INQUIRY_HISTORY_LIMIT_OPTIONS.includes(parsed as typeof INQUIRY_HISTORY_LIMIT_OPTIONS[number])
                ? parsed
                : DEFAULT_INQUIRY_HISTORY_LIMIT;
            plugin.settings.inquiryRecentSessionsLimit = nextLimit;
            historyStore.applyConfiguredLimit();
            await plugin.saveSettings();
            renderRecentSessionsPreview();
        });
    });

    const sessionTitleByQuestionId = (): Map<string, string> => {
        const config = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
        const pairs = (Object.values(config) as InquiryPromptSlot[][])
            .flat()
            .map(slot => [slot.id, slot.label?.trim() || slot.question?.trim() || slot.id] as const);
        return new Map(pairs);
    };

    const historyPreview = configBody.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--flush', 'ert-session-history-preview']
    });
    historyPreview.createDiv({ cls: ['ert-planetary-preview-heading', 'ert-previewFrame__title'], text: 'Recent sessions' });
    const historyList = historyPreview.createDiv({ cls: 'ert-session-history-preview__list' });

    const openSessionPathIfAvailable = async (path: string | undefined): Promise<boolean> => {
        const normalized = path?.trim();
        if (!normalized) return false;
        const file = plugin.app.vault.getAbstractFileByPath(normalized);
        if (!(file instanceof TFile)) return false;
        await openOrRevealFile(plugin.app, file);
        return true;
    };

    const openRecentSession = async (session: InquirySession): Promise<void> => {
        if (await openSessionPathIfAvailable(session.logPath)) return;
        await plugin.getInquiryService().activateView();
        const view = plugin.getInquiryService().getInquiryViews()[0];
        if (view?.reopenSessionByKey(session.key)) return;
        if (await openSessionPathIfAvailable(session.briefPath)) return;
        new Notice('Unable to reopen this session right now.');
    };

    const renderRecentSessionsPreview = (): void => {
        historyList.empty();
        const sessions = historyStore.getRecentSessions(5);
        if (!sessions.length) {
            historyList.createDiv({
                cls: 'ert-session-history-preview__empty',
                text: 'No recent sessions yet. Run Inquiry to populate this list.'
            });
            return;
        }
        const titleMap = sessionTitleByQuestionId();
        sessions.forEach(session => {
            const row = historyList.createDiv({ cls: [ERT_CLASSES.OBJECT_ROW, 'ert-session-history-preview__item'] });
            const left = row.createDiv({ cls: ERT_CLASSES.OBJECT_ROW_LEFT });
            const questionTitle = titleMap.get(session.result.questionId) || session.result.questionId || 'Inquiry prompt';
            left.createDiv({ cls: 'ert-session-history-preview__title', text: questionTitle });
            const timestamp = session.createdAt || session.lastAccessed;
            const passCountRaw = (session.result as unknown as Record<string, unknown>).executionPassCount;
            const passCount = typeof passCountRaw === 'number' && passCountRaw > 1 ? passCountRaw : null;
            const meta = [
                formatSessionScopeLabel(session),
                formatSessionProviderModel(session),
                formatRelativeTime(timestamp),
                passCount ? `Passes ${passCount}` : ''
            ].filter(Boolean).join(' · ');
            left.createDiv({ cls: ERT_CLASSES.OBJECT_ROW_META, text: meta });
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-label', `Open recent session ${questionTitle}`);
            plugin.registerDomEvent(row, 'click', () => { void openRecentSession(session); });
            plugin.registerDomEvent(row, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    void openRecentSession(session);
                }
            });
        });
    };

    renderRecentSessionsPreview();

    void refreshClassScan();
}
