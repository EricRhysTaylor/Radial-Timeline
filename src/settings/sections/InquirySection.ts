import { App, Setting as Settings, TextComponent, TextAreaComponent, normalizePath, Notice, setIcon, setTooltip } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import type {
    InquiryClassConfig,
    InquiryCorpusThresholds,
    InquiryMaterialMode,
    InquiryPromptConfig,
    InquiryPromptSlot,
    InquirySourcesSettings
} from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { addHeadingIcon, addWikiLink } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { badgePill } from '../../ui/ui';
import { isProfessionalActive } from './ProfessionalSection';
import { buildDefaultInquiryPromptConfig, getCanonicalPromptText, normalizeInquiryPromptConfig } from '../../inquiry/prompts';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    parseScanRootInput,
    resolveScanRoots,
    toDisplayRoot,
    toVaultRoot
} from '../../inquiry/utils/scanRoots';

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

const CLASS_ABBREVIATIONS: Record<string, string> = {
    scene: 's',
    outline: 'o',
    character: 'c',
    place: 'p',
    power: 'pw'
};

const getClassAbbreviation = (className: string): string => {
    if (CLASS_ABBREVIATIONS[className]) return CLASS_ABBREVIATIONS[className];
    return className.charAt(0) || '?';
};

type LegacyInquirySourcesSettings = {
    sceneFolders?: string[];
    bookOutlineFiles?: string[];
    sagaOutlineFile?: string;
    characterFolders?: string[];
    placeFolders?: string[];
    powerFolders?: string[];
};

const REFERENCE_ONLY_CLASSES = new Set(['character', 'place', 'power']);
const MATERIAL_MODES: InquiryMaterialMode[] = ['none', 'summary', 'full', 'digest'];
const DEFAULT_FULL_CLASSES = new Set(['outline', ...REFERENCE_ONLY_CLASSES]);
const MATERIAL_LABELS: Record<InquiryMaterialMode, string> = {
    none: 'None',
    summary: 'Summary',
    full: 'Full',
    digest: 'Digest (soon)'
};

const defaultModeForClass = (className: string): InquiryMaterialMode => {
    if (DEFAULT_FULL_CLASSES.has(className)) return 'full';
    if (className === 'scene') return 'summary';
    return 'full';
};

const normalizeMaterialMode = (value: unknown, className: string): InquiryMaterialMode => {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (MATERIAL_MODES.includes(normalized as InquiryMaterialMode)) {
            return normalized as InquiryMaterialMode;
        }
    }
    if (typeof value === 'boolean') {
        return value ? defaultModeForClass(className) : 'none';
    }
    return 'none';
};

const isLegacySources = (sources?: InquirySourcesSettings | LegacyInquirySourcesSettings): sources is LegacyInquirySourcesSettings => {
    if (!sources) return false;
    return 'sceneFolders' in sources || 'bookOutlineFiles' in sources || 'sagaOutlineFile' in sources;
};

const defaultClassConfig = (className: string): InquiryClassConfig => {
    const normalized = className.toLowerCase();
    const isScene = normalized === 'scene';
    const isOutline = normalized === 'outline';
    const isReference = REFERENCE_ONLY_CLASSES.has(normalized);
    return {
        className: normalized,
        enabled: false,
        bookScope: isScene ? 'summary' : (isOutline || isReference ? 'full' : defaultModeForClass(normalized)),
        sagaScope: isOutline || isReference ? 'full' : 'none',
        referenceScope: isReference ? 'full' : 'none'
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

const migrateLegacySources = (legacy: LegacyInquirySourcesSettings): InquirySourcesSettings => {
    const roots = new Set<string>();
    const addRoot = (path: string | undefined) => {
        if (!path) return;
        const normalized = normalizePath(path);
        if (normalized) roots.add(normalized);
    };
    const addParent = (path: string | undefined) => {
        if (!path) return;
        const normalized = normalizePath(path);
        if (!normalized) return;
        const idx = normalized.lastIndexOf('/');
        if (idx > 0) {
            roots.add(normalized.slice(0, idx));
        } else {
            roots.add('');
        }
    };
    legacy.sceneFolders?.forEach(addRoot);
    legacy.characterFolders?.forEach(addRoot);
    legacy.placeFolders?.forEach(addRoot);
    legacy.powerFolders?.forEach(addRoot);
    legacy.bookOutlineFiles?.forEach(addParent);
    addParent(legacy.sagaOutlineFile);

    const classes: InquiryClassConfig[] = [];
    if (legacy.sceneFolders?.length) {
        classes.push({
            className: 'scene',
            enabled: true,
            bookScope: 'summary',
            sagaScope: 'none',
            referenceScope: 'none'
        });
    }
    if ((legacy.bookOutlineFiles?.length || 0) > 0 || legacy.sagaOutlineFile) {
        classes.push({
            className: 'outline',
            enabled: true,
            bookScope: (legacy.bookOutlineFiles?.length || 0) > 0 ? 'full' : 'none',
            sagaScope: legacy.sagaOutlineFile ? 'full' : 'none',
            referenceScope: 'none'
        });
    }
    if (legacy.characterFolders?.length) {
        classes.push({
            className: 'character',
            enabled: true,
            bookScope: 'full',
            sagaScope: 'full',
            referenceScope: 'full'
        });
    }
    if (legacy.placeFolders?.length) {
        classes.push({
            className: 'place',
            enabled: true,
            bookScope: 'full',
            sagaScope: 'full',
            referenceScope: 'full'
        });
    }
    if (legacy.powerFolders?.length) {
        classes.push({
            className: 'power',
            enabled: true,
            bookScope: 'full',
            sagaScope: 'full',
            referenceScope: 'full'
        });
    }

    return {
        scanRoots: roots.size ? normalizeScanRootPatterns(Array.from(roots)) : [],
        classScope: [],
        classes,
        classCounts: {},
        resolvedScanRoots: [],
        lastScanAt: undefined
    };
};

const normalizeInquirySources = (raw?: InquirySourcesSettings | LegacyInquirySourcesSettings): InquirySourcesSettings => {
    if (!raw) {
        return { scanRoots: [], classes: [], classCounts: {}, resolvedScanRoots: [] };
    }
    if (isLegacySources(raw)) {
        return migrateLegacySources(raw);
    }
    return {
        scanRoots: raw.scanRoots && raw.scanRoots.length ? normalizeScanRootPatterns(raw.scanRoots) : [],
        classScope: raw.classScope ? parseClassScopeInput(listToText(raw.classScope)) : [],
        classes: (raw.classes || []).map(config => ({
            className: config.className.toLowerCase(),
            enabled: !!config.enabled,
            bookScope: normalizeMaterialMode(config.bookScope, config.className.toLowerCase()),
            sagaScope: normalizeMaterialMode(config.sagaScope, config.className.toLowerCase()),
            referenceScope: normalizeMaterialMode(
                (config as InquiryClassConfig).referenceScope
                    ?? (REFERENCE_ONLY_CLASSES.has(config.className.toLowerCase()) ? true : false),
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

        return parent.createDiv({ cls: [ERT_CLASSES.SECTION_BODY, ERT_CLASSES.STACK] });
    };

    let inquirySources = normalizeInquirySources(plugin.settings.inquirySources);
    plugin.settings.inquirySources = inquirySources;

    const sourcesBody = createSection(containerEl, {
        title: 'Inquiry sources',
        icon: 'search',
        wiki: 'Settings#inquiry-sources',
        headingClass: 'ert-setting-heading--top'
    });

    let scanRootsInput: TextAreaComponent | null = null;
    let classScopeInput: TextAreaComponent | null = null;

    const scanRootsSetting = new Settings(sourcesBody)
        .setName('Inquiry scan folders')
        .setDesc('Inquiry only scans within these folders. One path per line. Wildcards like /Book */ or /Book 1-7 */ are allowed. Use / for the vault root. Empty = no scan.');
    scanRootsSetting.settingEl.setAttribute('data-ert-role', 'inquiry-setting:scan-roots');
    scanRootsSetting.settingEl.classList.add('ert-setting-two-row');

    const scanRootsText = new TextAreaComponent(scanRootsSetting.controlEl);
    scanRootsText.setValue(listToText(inquirySources.scanRoots));
    scanRootsText.setPlaceholder('/Book */\n/Character/\n/World/');
    scanRootsText.inputEl.rows = 3;
    scanRootsText.inputEl.addClass('ert-textarea--wide');
    scanRootsInput = scanRootsText;

    plugin.registerDomEvent(scanRootsText.inputEl, 'blur', () => {
        const nextRoots = parseScanRootInput(scanRootsText.getValue());
        applyScanRoots(nextRoots);
    });

    const scanRootActions = scanRootsSetting.settingEl.createDiv({
        cls: ['ert-setting-two-row__actions', ERT_CLASSES.INLINE]
    });
    const addActionButton = (label: string, onClick: () => void) => {
        const btn = scanRootActions.createEl('button', { cls: ERT_CLASSES.PILL_BTN });
        btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: label });
        plugin.registerDomEvent(btn, 'click', (evt) => {
            evt.preventDefault();
            onClick();
        });
    };

    addActionButton('Add all Book folders', () => {
        const nextRoots = Array.from(new Set([...(inquirySources.scanRoots || []), '/Book */']));
        applyScanRoots(nextRoots);
    });
    addActionButton('Add Character folder', () => {
        const nextRoots = Array.from(new Set([...(inquirySources.scanRoots || []), '/Character/']));
        applyScanRoots(nextRoots);
    });

    const resolvedPreview = sourcesBody.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--left', 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'inquiry-resolved' }
    });
    const resolvedHeading = resolvedPreview.createDiv({
        cls: ['ert-planetary-preview-heading', 'ert-previewFrame__title'],
        text: 'Resolved Folders (0)'
    });
    const resolvedList = resolvedPreview.createDiv({ cls: 'ert-controlGroup ert-controlGroup--scroll' });
    resolvedList.style.setProperty('--ert-controlGroup-columns', '1fr');
    resolvedList.style.setProperty('--ert-controlGroup-max-height', '220px');

    const classScopePanel = sourcesBody.createDiv({ cls: ERT_CLASSES.PANEL });
    const classScopeBody = classScopePanel.createDiv({ cls: ERT_CLASSES.PANEL_BODY });

    const classScopeSetting = new Settings(classScopeBody)
        .setName('Inquiry class scope')
        .setDesc('One YAML class per line. Use / to allow all classes. Empty = no classes allowed.');
    classScopeSetting.settingEl.setAttribute('data-ert-role', 'inquiry-setting:class-scope');

    classScopeSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.classScope));
        text.inputEl.rows = 4;
        text.inputEl.addClass('ert-input--lg');
        text.setPlaceholder('scene\noutline');
        classScopeInput = text;

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            const nextScope = parseClassScopeInput(text.getValue());
            applyClassScope(nextScope);
        });
    });

    let resolvedRootCache: { signature: string; resolvedRoots: string[]; total: number } | null = null;

    const classTableWrap = classScopeBody.createDiv({ cls: 'ert-controlGroup' });
    classTableWrap.style.setProperty('--ert-controlGroup-columns', '90px minmax(0, 1.1fr) 140px 140px 140px 110px');

    const scanInquiryClasses = async (roots: string[]): Promise<{
        discoveredCounts: Record<string, number>;
        discoveredClasses: string[];
        rootClassCounts: Record<string, Record<string, number>>;
    }> => {
        if (!roots.length) {
            return { discoveredCounts: {}, discoveredClasses: [], rootClassCounts: {} };
        }
        const discoveredCounts: Record<string, number> = {};
        const rootClassCounts: Record<string, Record<string, number>> = {};
        const files = plugin.app.vault.getMarkdownFiles();
        const resolvedVaultRoots = roots;

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        resolvedVaultRoots.forEach(root => {
            rootClassCounts[toDisplayRoot(root)] = {};
        });

        files.forEach(file => {
            if (!inRoots(file.path)) return;
            const cache = plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return;
            const normalized = normalizeFrontmatterKeys(frontmatter, plugin.settings.frontmatterMappings);
            const rawClass = normalized['Class'];
            if (!rawClass) return;
            const values = Array.isArray(rawClass) ? rawClass : [rawClass];
            values.forEach(value => {
                const name = typeof value === 'string' ? value.trim() : String(value).trim();
                if (!name) return;
                const key = name.toLowerCase();
                discoveredCounts[key] = (discoveredCounts[key] || 0) + 1;
                resolvedVaultRoots.forEach(root => {
                    if (!root || file.path === root || file.path.startsWith(`${root}/`)) {
                        const display = toDisplayRoot(root);
                        const bucket = rootClassCounts[display] || {};
                        bucket[key] = (bucket[key] || 0) + 1;
                        rootClassCounts[display] = bucket;
                    }
                });
            });
        });

        return {
            discoveredCounts,
            discoveredClasses: Object.keys(discoveredCounts).sort(),
            rootClassCounts
        };
    };

    const renderClassTable = (configs: InquiryClassConfig[], counts: Record<string, number>) => {
        classTableWrap.empty();

        const buildRow = (extraClasses: string[] = []) => {
            return classTableWrap.createDiv({ cls: ['ert-controlGroup__row', ...extraClasses] });
        };

        const header = buildRow(['ert-controlGroup__row--header']);
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Enabled' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Class' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Book scope' });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Saga scope' });
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

            const isOutline = config.className === 'outline';
            const isReference = REFERENCE_ONLY_CLASSES.has(config.className);

            const buildModeSelect = (
                cell: HTMLElement,
                value: InquiryMaterialMode,
                disabled: boolean,
                onChange: (next: InquiryMaterialMode) => void
            ) => {
                const select = cell.createEl('select', { cls: 'ert-input ert-input--sm' });
                MATERIAL_MODES.forEach(mode => {
                    const option = select.createEl('option', { value: mode, text: MATERIAL_LABELS[mode] });
                    if (mode === 'digest') {
                        option.disabled = true;
                    }
                });
                select.value = value;
                select.disabled = disabled;
                plugin.registerDomEvent(select, 'change', () => {
                    onChange(select.value as InquiryMaterialMode);
                });
            };

            const bookCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            if (isReference) {
                bookCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: 'Reference' });
            } else {
                buildModeSelect(bookCell, config.bookScope, rowDisabled, (next) => {
                    inquirySources = {
                        ...inquirySources,
                        classes: (inquirySources.classes || []).map(entry =>
                            entry.className === config.className ? { ...entry, bookScope: next } : entry
                        )
                    };
                    void refreshClassScan();
                });
                if (isOutline) {
                    bookCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: 'Book outline' });
                }
            }

            const sagaCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            if (isReference) {
                sagaCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: 'Reference' });
            } else {
                buildModeSelect(sagaCell, config.sagaScope, rowDisabled, (next) => {
                    inquirySources = {
                        ...inquirySources,
                        classes: (inquirySources.classes || []).map(entry =>
                            entry.className === config.className ? { ...entry, sagaScope: next } : entry
                        )
                    };
                    void refreshClassScan();
                });
                if (isOutline) {
                    sagaCell.createSpan({ cls: 'ert-controlGroup__cell--meta', text: 'Saga outline' });
                }
            }

            const referenceCell = row.createDiv({ cls: 'ert-controlGroup__cell' });
            if (isReference) {
                buildModeSelect(referenceCell, config.referenceScope, rowDisabled, (next) => {
                    inquirySources = {
                        ...inquirySources,
                        classes: (inquirySources.classes || []).map(entry =>
                            entry.className === config.className ? { ...entry, referenceScope: next } : entry
                        )
                    };
                    void refreshClassScan();
                });
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
    };

    const renderResolvedRoots = (
        roots: string[],
        total: number,
        rootClassCounts: Record<string, Record<string, number>>,
        participatingClasses: Set<string>
    ) => {
        resolvedHeading.setText(`Resolved Folders (${total})`);
        resolvedList.empty();

        if (!roots.length) {
            const emptyRow = resolvedList.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--card'] });
            emptyRow.createDiv({
                cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--faint'],
                text: 'No scan folders set. Add /Book */ or / to begin.'
            });
            return;
        }

        roots.forEach(root => {
            const classCounts = rootClassCounts[root] || {};
            const parts: string[] = [];
            participatingClasses.forEach(className => {
                const count = classCounts[className] || 0;
                if (!count) return;
                parts.push(`${count}${getClassAbbreviation(className)}`);
            });
            const suffix = parts.length ? `[${parts.join(', ')}]` : '[0]';
            const row = resolvedList.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--card'] });
            row.createDiv({
                cls: ['ert-controlGroup__cell', 'ert-controlGroup__cell--mono', 'ert-controlGroup__cell--meta'],
                text: `${root} ${suffix}`
            });
        });
    };

    const applyScanRoots = (nextRoots: string[]) => {
        const normalized = nextRoots.length ? normalizeScanRootPatterns(nextRoots) : [];
        inquirySources = { ...inquirySources, scanRoots: normalized };
        scanRootsInput?.setValue(listToText(normalized));
        resolvedRootCache = null;
        void refreshClassScan();
    };

    const applyClassScope = (nextScope: string[]) => {
        const normalized = parseClassScopeInput(nextScope.join('\n'));
        inquirySources = { ...inquirySources, classScope: normalized };
        classScopeInput?.setValue(listToText(normalized));
        void refreshClassScan();
    };

    const refreshClassScan = async () => {
        const rawRoots = inquirySources.scanRoots || [];
        const scanRoots = normalizeScanRootPatterns(rawRoots);
        const signature = scanRoots.join('|');
        if (!resolvedRootCache || resolvedRootCache.signature !== signature) {
            if (!scanRoots.length) {
                resolvedRootCache = { signature, resolvedRoots: [], total: 0 };
            } else {
                const resolved = resolveScanRoots(scanRoots, plugin.app.vault, MAX_RESOLVED_SCAN_ROOTS);
                resolvedRootCache = {
                    signature,
                    resolvedRoots: resolved.resolvedRoots,
                    total: resolved.totalMatches
                };
                if (resolved.totalMatches > MAX_RESOLVED_SCAN_ROOTS) {
                    new Notice(`Pattern expands to ${resolved.totalMatches} folders; refine your root.`);
                }
            }
        }
        const resolvedVaultRoots = resolvedRootCache.resolvedRoots.map(toVaultRoot);
        const scan = await scanInquiryClasses(resolvedVaultRoots);
        const scopeConfig = getClassScopeConfig(inquirySources.classScope);
        const allowedClasses = scopeConfig.allowAll ? scan.discoveredClasses : scopeConfig.allowed;
        const allowedSet = new Set(allowedClasses);
        const allConfigNames = Array.from(new Set([...scan.discoveredClasses, ...scopeConfig.allowed]));
        const merged = mergeClassConfigs(inquirySources.classes || [], allConfigNames);
        const visibleConfigs = merged.filter(config => allowedSet.has(config.className));
        inquirySources = {
            scanRoots: rawRoots,
            classScope: inquirySources.classScope || [],
            classes: merged,
            classCounts: scan.discoveredCounts,
            resolvedScanRoots: resolvedRootCache.resolvedRoots,
            lastScanAt: new Date().toISOString()
        };
        plugin.settings.inquirySources = inquirySources;
        await plugin.saveSettings();
        renderClassTable(visibleConfigs, scan.discoveredCounts);

        const participatingClasses = new Set<string>();
        visibleConfigs.forEach(config => {
            const participates = config.enabled
                && (config.bookScope !== 'none'
                    || config.sagaScope !== 'none'
                    || config.referenceScope !== 'none');
            if (!participates) return;
            participatingClasses.add(config.className);
        });

        renderResolvedRoots(
            resolvedRootCache.resolvedRoots,
            resolvedRootCache.total,
            scan.rootClassCounts,
            participatingClasses
        );

    };

    const renderPromptConfiguration = (targetEl: HTMLElement) => {
        const promptContainer = targetEl.createDiv({ cls: ERT_CLASSES.STACK });
        const freeCustomLimit = 2;
        const proCustomLimit = 7;
        const isPro = isProfessionalActive(plugin);

        let promptConfig: InquiryPromptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
        if (!plugin.settings.inquiryPromptConfig) {
            plugin.settings.inquiryPromptConfig = buildDefaultInquiryPromptConfig();
            promptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
            void plugin.saveSettings();
        }

        const zoneLabels: Record<string, string> = { setup: 'Setup', pressure: 'Pressure', payoff: 'Payoff' };

        const createCustomSlot = (zone: 'setup' | 'pressure' | 'payoff'): InquiryPromptSlot => ({
            id: `custom-${zone}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: '',
            question: '',
            enabled: true,
            builtIn: false
        });

        const getZoneSlots = (zone: 'setup' | 'pressure' | 'payoff'): InquiryPromptSlot[] =>
            promptConfig[zone] ?? [];

        const getCanonicalSlot = (zone: 'setup' | 'pressure' | 'payoff'): InquiryPromptSlot => {
            const slots = getZoneSlots(zone);
            return slots[0] ?? buildDefaultInquiryPromptConfig()[zone][0];
        };

        const getCustomSlots = (zone: 'setup' | 'pressure' | 'payoff'): InquiryPromptSlot[] =>
            getZoneSlots(zone).slice(1);

        const savePromptConfig = async (next: InquiryPromptConfig) => {
            plugin.settings.inquiryPromptConfig = next;
            await plugin.saveSettings();
            promptConfig = normalizeInquiryPromptConfig(next);
        };

        const updateCustomSlot = async (
            zone: 'setup' | 'pressure' | 'payoff',
            customIndex: number,
            patch: Partial<InquiryPromptSlot>
        ) => {
            const customSlots = getCustomSlots(zone);
            const current = customSlots[customIndex];
            if (!current) return;
            const nextSlot = { ...current, ...patch, builtIn: false };
            const nextQuestion = nextSlot.question ?? '';
            nextSlot.label = nextSlot.label ?? '';
            nextSlot.question = nextQuestion;
            nextSlot.enabled = !!nextSlot.enabled || nextQuestion.trim().length > 0;
            customSlots[customIndex] = nextSlot;
            const canonical = getCanonicalSlot(zone);
            await savePromptConfig({ ...promptConfig, [zone]: [canonical, ...customSlots] });
        };

        const addCustomSlot = async (
            zone: 'setup' | 'pressure' | 'payoff',
            limit: number,
            initial?: Partial<InquiryPromptSlot>
        ) => {
            const customSlots = getCustomSlots(zone);
            if (customSlots.length >= limit) return;
            const canonical = getCanonicalSlot(zone);
            const seed = createCustomSlot(zone);
            const nextSlot = { ...seed, ...initial, builtIn: false };
            nextSlot.label = nextSlot.label ?? '';
            nextSlot.question = nextSlot.question ?? '';
            if (nextSlot.question.trim().length > 0) {
                nextSlot.enabled = true;
            }
            const nextSlots = [...customSlots, nextSlot];
            await savePromptConfig({ ...promptConfig, [zone]: [canonical, ...nextSlots] });
            render();
        };

        const removeCustomSlot = async (zone: 'setup' | 'pressure' | 'payoff', customIndex: number) => {
            const customSlots = getCustomSlots(zone);
            if (!customSlots[customIndex]) return;
            const canonical = getCanonicalSlot(zone);
            const nextSlots = customSlots.filter((_, idx) => idx !== customIndex);
            await savePromptConfig({ ...promptConfig, [zone]: [canonical, ...nextSlots] });
            render();
        };

        const reorderCustomSlots = async (
            zone: 'setup' | 'pressure' | 'payoff',
            fromIndex: number,
            toIndex: number
        ) => {
            if (fromIndex === toIndex) return;
            const customSlots = getCustomSlots(zone);
            if (fromIndex < 0 || fromIndex >= customSlots.length || toIndex < 0 || toIndex >= customSlots.length) return;
            const nextSlots = [...customSlots];
            const [moved] = nextSlots.splice(fromIndex, 1);
            nextSlots.splice(toIndex, 0, moved);
            const canonical = getCanonicalSlot(zone);
            await savePromptConfig({ ...promptConfig, [zone]: [canonical, ...nextSlots] });
            render();
        };

        const renderCustomRows = (
            listEl: HTMLElement,
            zone: 'setup' | 'pressure' | 'payoff',
            customSlots: InquiryPromptSlot[],
            startIndex: number,
            endIndex: number,
            dragState: { index: number | null }
        ) => {
            if (startIndex >= endIndex) return;
            customSlots.slice(startIndex, endIndex).forEach((slot, offset) => {
                const customIndex = startIndex + offset;
                const row = listEl.createDiv({ cls: 'ert-reorder-row' });
                const isProRow = customIndex >= freeCustomLimit;
                if (isProRow) {
                    row.addClass('ert-reorder-row--pro');
                    if (!isPro) {
                        row.addClass('ert-reorder-row--locked');
                    }
                }

                const dragHandle = row.createDiv({ cls: 'ert-drag-handle' });
                dragHandle.draggable = true;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, 'Drag to reorder');

                const labelInput = new TextComponent(row);
                labelInput.setPlaceholder('Label (optional)')
                    .setValue(slot.label ?? '');
                labelInput.inputEl.addClass('ert-input', 'ert-input--sm');
                labelInput.onChange(async (value) => {
                    await updateCustomSlot(zone, customIndex, { label: value });
                });

                const questionInput = new TextComponent(row);
                questionInput.setPlaceholder('Question text')
                    .setValue(slot.question ?? '');
                questionInput.inputEl.addClass('ert-input', 'ert-input--full');
                questionInput.onChange(async (value) => {
                    await updateCustomSlot(zone, customIndex, { question: value });
                });

                const deleteBtn = row.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
                setIcon(deleteBtn, 'trash');
                setTooltip(deleteBtn, 'Delete question');
                deleteBtn.onclick = () => {
                    void removeCustomSlot(zone, customIndex);
                };

                plugin.registerDomEvent(dragHandle, 'dragstart', (e) => {
                    dragState.index = customIndex;
                    row.classList.add('is-dragging');
                    e.dataTransfer?.setData('text/plain', customIndex.toString());
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                });

                plugin.registerDomEvent(dragHandle, 'dragend', () => {
                    row.classList.remove('is-dragging');
                    row.classList.remove('is-dragover');
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
                    if (Number.isNaN(from) || from < 0 || from === customIndex) {
                        dragState.index = null;
                        return;
                    }
                    dragState.index = null;
                    void reorderCustomSlots(zone, from, customIndex);
                });
            });
        };

        const renderZoneCard = (
            zone: 'setup' | 'pressure' | 'payoff',
            dragState: { index: number | null }
        ) => {
            const zoneStack = promptContainer.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });
            const headerCard = zoneStack.createDiv({ cls: ERT_CLASSES.PANEL });
            const header = headerCard.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
            const headerMain = header.createDiv({ cls: ERT_CLASSES.CONTROL });
            headerMain.createEl('h4', { cls: ERT_CLASSES.SECTION_TITLE, text: zoneLabels[zone] });
            const body = headerCard.createDiv({ cls: ERT_CLASSES.PANEL_BODY });

            const canonicalRow = body.createDiv({ cls: ERT_CLASSES.ROW });
            canonicalRow.createDiv({ cls: ERT_CLASSES.LABEL, text: 'Canonical' });
            const canonicalInputWrap = canonicalRow.createDiv({ cls: ERT_CLASSES.CONTROL });
            canonicalInputWrap.createDiv({ cls: 'ert-prompt-question', text: getCanonicalPromptText(zone) });

            const customSlots = getCustomSlots(zone);

            const listCard = zoneStack.createDiv({ cls: ERT_CLASSES.PANEL });
            const listBody = listCard.createDiv({ cls: ERT_CLASSES.PANEL_BODY });
            const listEl = listBody.createDiv({ cls: ['ert-template-entries', 'ert-template-indent'] });
            renderCustomRows(listEl, zone, customSlots, 0, customSlots.length, dragState);

            const showProGhost = !isPro
                && customSlots.length >= freeCustomLimit
                && customSlots.length < proCustomLimit;
            if (showProGhost) {
                const ghostRow = listEl.createDiv({
                    cls: 'ert-reorder-row ert-reorder-row--pro ert-reorder-row--ghost'
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
            if (customSlots.length < addLimit) {
                const addRow = listEl.createDiv({ cls: 'ert-reorder-row' });
                if (isPro && customSlots.length >= freeCustomLimit) {
                    addRow.addClass('ert-reorder-row--pro');
                }
                addRow.createDiv({ cls: 'ert-drag-handle ert-drag-placeholder' });

                const labelInput = new TextComponent(addRow);
                labelInput.setPlaceholder('Label (optional)').setValue('');
                labelInput.inputEl.addClass('ert-input', 'ert-input--sm');

                const questionInput = new TextComponent(addRow);
                questionInput.setPlaceholder('Question text').setValue('');
                questionInput.inputEl.addClass('ert-input', 'ert-input--full');

                const addBtn = addRow.createEl('button', { cls: [ERT_CLASSES.ICON_BTN, 'ert-mod-cta'] });
                setIcon(addBtn, 'plus');
                setTooltip(addBtn, 'Add question');

                const commitAdd = () => {
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
            }
        };

        const render = () => {
            promptContainer.empty();

            const dragStates: Record<'setup' | 'pressure' | 'payoff', { index: number | null }> = {
                setup: { index: null as number | null },
                pressure: { index: null as number | null },
                payoff: { index: null as number | null }
            };

            (['setup', 'pressure', 'payoff'] as const).forEach(zone => {
                renderZoneCard(zone, dragStates[zone]);
            });
        };

        render();
    };

    const renderCorpusCcSettings = (targetEl: HTMLElement) => {
        const thresholdDefaults = normalizeCorpusThresholds(plugin.settings.inquiryCorpusThresholds);
        plugin.settings.inquiryCorpusThresholds = thresholdDefaults;

        const corpusPanel = targetEl.createDiv({ cls: [ERT_CLASSES.PANEL, ERT_CLASSES.STACK] });

        const table = corpusPanel.createDiv({ cls: 'ert-controlGroup' });
        table.style.setProperty(
            '--ert-controlGroup-columns',
            'minmax(140px, max-content) 56px minmax(var(--ert-input-width-sm), max-content)'
        );

        const header = table.createDiv({ cls: ['ert-controlGroup__row', 'ert-controlGroup__row--header'] });
        header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Tier' });
        const thresholdHeader = header.createDiv({ cls: 'ert-controlGroup__cell', text: 'Threshold' });
        thresholdHeader.style.gridColumn = '2 / 4';

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

    const promptsBody = createSection(containerEl, {
        title: 'Inquiry prompts',
        icon: 'list',
        wiki: 'Settings#inquiry-prompts'
    });
    renderPromptConfiguration(promptsBody);

    const corpusBody = createSection(containerEl, {
        title: 'Corpus (CC)',
        desc: 'Thresholds are based on content-only word counts (frontmatter excluded).',
        icon: 'layout-grid',
        wiki: 'Settings#inquiry-corpus'
    });
    renderCorpusCcSettings(corpusBody);

    const configBody = createSection(containerEl, {
        title: 'Configuration',
        desc: 'Artifacts, action notes, and session cache defaults for Inquiry briefs.',
        icon: 'settings',
        wiki: 'Settings#inquiry'
    });

    const artifactSetting = new Settings(configBody)
        .setName('Artifact folder')
        .setDesc('Inquiry briefs are saved here when auto-save is enabled.');

    artifactSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.inquiryArtifactFolder || 'Radial Timeline/Inquiry/Artifacts';
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
        .setName('Embed JSON payload in Artifacts')
        .setDesc('Includes the validated Inquiry JSON payload in the Artifact file.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryEmbedJson ?? true);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryEmbedJson = value;
                await plugin.saveSettings();
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

    new Settings(configBody)
        .setName('Write Inquiry notes to Pending Edits')
        .setDesc('Append Inquiry action notes to the Pending Edits field for hit scenes.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryActionNotesEnabled ?? false);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryActionNotesEnabled = value;
                await plugin.saveSettings();
            });
        });

    new Settings(configBody)
        .setName('Action notes target YAML field')
        .setDesc('Frontmatter field to receive Inquiry Pending Edits notes.')
        .addText(text => {
            const defaultField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
            const current = plugin.settings.inquiryActionNotesTargetField?.trim() || defaultField;
            text.setPlaceholder(defaultField);
            text.setValue(current);
            text.inputEl.addClass('ert-input--lg');
            text.onChange(async (value) => {
                const next = value.trim() || defaultField;
                plugin.settings.inquiryActionNotesTargetField = next;
                await plugin.saveSettings();
            });
        });

    const cacheDesc = () => `Cache up to ${plugin.settings.inquiryCacheMaxSessions ?? 30} Inquiry sessions. Set the cap here.`;

    const cacheSetting = new Settings(configBody)
        .setName('Enable session cache')
        .setDesc(cacheDesc());

    cacheSetting.addText(text => {
        const current = String(plugin.settings.inquiryCacheMaxSessions ?? 30);
        text.setPlaceholder('30');
        text.setValue(current);
        text.inputEl.addClass('ert-input--sm');

        plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                text.inputEl.blur();
            }
        });

        const handleBlur = async () => {
            const n = Number(text.getValue().trim());
            if (!Number.isFinite(n) || n < 1 || n > 100) {
                new Notice('Enter a number between 1 and 100.');
                text.setValue(String(plugin.settings.inquiryCacheMaxSessions ?? 30));
                return;
            }
            plugin.settings.inquiryCacheMaxSessions = n;
            await plugin.saveSettings();
            cacheSetting.setDesc(cacheDesc());
        };

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
    });

    cacheSetting.addToggle(toggle => {
        toggle.setValue(plugin.settings.inquiryCacheEnabled ?? true);
        toggle.onChange(async (value) => {
            plugin.settings.inquiryCacheEnabled = value;
            await plugin.saveSettings();
        });
    });

    void refreshClassScan();
}
