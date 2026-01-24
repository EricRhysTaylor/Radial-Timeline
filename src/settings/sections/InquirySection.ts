import { App, Setting as Settings, TextComponent, TextAreaComponent, ButtonComponent, normalizePath, Notice, setIcon, setTooltip } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import type {
    InquiryClassConfig,
    InquiryCorpusThresholds,
    InquiryPromptConfig,
    InquiryPromptSlot,
    InquirySourcesSettings
} from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { addHeadingIcon, addWikiLink } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { badgePill } from '../../ui/ui';
import { isProfessionalActive } from './ProfessionalSection';
import { buildDefaultInquiryPromptConfig, normalizeInquiryPromptConfig } from '../../inquiry/prompts';
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
        bookScope: isScene || isOutline || isReference,
        sagaScope: isOutline || isReference
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
        classes.push({ className: 'scene', enabled: true, bookScope: true, sagaScope: false });
    }
    if ((legacy.bookOutlineFiles?.length || 0) > 0 || legacy.sagaOutlineFile) {
        classes.push({
            className: 'outline',
            enabled: true,
            bookScope: (legacy.bookOutlineFiles?.length || 0) > 0,
            sagaScope: !!legacy.sagaOutlineFile
        });
    }
    if (legacy.characterFolders?.length) {
        classes.push({ className: 'character', enabled: true, bookScope: true, sagaScope: true });
    }
    if (legacy.placeFolders?.length) {
        classes.push({ className: 'place', enabled: true, bookScope: true, sagaScope: true });
    }
    if (legacy.powerFolders?.length) {
        classes.push({ className: 'power', enabled: true, bookScope: true, sagaScope: true });
    }

    return {
        scanRoots: roots.size ? normalizeScanRootPatterns(Array.from(roots)) : [],
        classScope: ['/'],
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
            bookScope: !!config.bookScope,
            sagaScope: !!config.sagaScope
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

    const heading = new Settings(containerEl)
        .setName('Inquiry')
        .setHeading();
    addHeadingIcon(heading, 'waves');
    addWikiLink(heading, 'Settings#inquiry');

    const artifactSetting = new Settings(containerEl)
        .setName('Artifact folder')
        .setDesc('Inquiry briefs are saved here when auto-save is enabled.');

    artifactSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.inquiryArtifactFolder || 'Radial Timeline/Inquiry/Artifacts';
        const fallbackFolder = plugin.settings.inquiryArtifactFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(defaultPath)
            .setValue(fallbackFolder);
        text.inputEl.addClass('ert-input--full');

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

    new Settings(containerEl)
        .setName('Embed JSON payload in Artifacts')
        .setDesc('Includes the validated Inquiry JSON payload in the Artifact file.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryEmbedJson ?? true);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryEmbedJson = value;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Auto-save Inquiry briefs')
        .setDesc('Save a brief automatically after each successful Inquiry run.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryAutoSave ?? true);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryAutoSave = value;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Write Inquiry action notes to scenes')
        .setDesc('Append Inquiry action notes to the Revision field for hit scenes.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryActionNotesEnabled ?? false);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryActionNotesEnabled = value;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Action notes target YAML field')
        .setDesc('Frontmatter field to receive Inquiry action notes.')
        .addText(text => {
            const defaultField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Revision';
            const current = plugin.settings.inquiryActionNotesTargetField?.trim() || defaultField;
            text.setPlaceholder(defaultField);
            text.setValue(current);
            text.inputEl.addClass('ert-input--sm');
            text.onChange(async (value) => {
                const next = value.trim() || defaultField;
                plugin.settings.inquiryActionNotesTargetField = next;
                await plugin.saveSettings();
            });
        });

    const cacheDesc = () => `Cache up to ${plugin.settings.inquiryCacheMaxSessions ?? 30} Inquiry sessions.`;

    const cacheToggleSetting = new Settings(containerEl)
        .setName('Enable session cache')
        .setDesc(cacheDesc())
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.inquiryCacheEnabled ?? true);
            toggle.onChange(async (value) => {
                plugin.settings.inquiryCacheEnabled = value;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Max cached sessions')
        .setDesc('Sets the cap for the Inquiry session cache.')
        .addText(text => {
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
                cacheToggleSetting.setDesc(cacheDesc());
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

    let inquirySources = normalizeInquirySources(plugin.settings.inquirySources);
    plugin.settings.inquirySources = inquirySources;

    const sourcesHeader = containerEl.createDiv({
        cls: `${ERT_CLASSES.HEADER} ${ERT_CLASSES.HEADER_BLOCK}`
    });
    sourcesHeader.createDiv({ cls: ERT_CLASSES.HEADER_LEFT });
    const sourcesHeaderMain = sourcesHeader.createDiv({ cls: ERT_CLASSES.HEADER_MAIN });
    sourcesHeaderMain.createEl('h4', { text: 'Inquiry sources', cls: ERT_CLASSES.SECTION_TITLE });
    sourcesHeader.createDiv({ cls: ERT_CLASSES.HEADER_RIGHT });
    containerEl.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Inquiry reads notes based on YAML class values inside the scan folders.'
    });

    let scanRootsInput: TextAreaComponent | null = null;
    let classScopeInput: TextAreaComponent | null = null;

    const classScopeSetting = new Settings(containerEl)
        .setName('Inquiry class scope')
        .setDesc('One YAML class per line. Use / to allow all classes. Empty = no classes allowed.');

    classScopeSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.classScope));
        text.inputEl.rows = 4;
        text.inputEl.addClass('ert-input--lg');
        text.setPlaceholder('scene\noutline\n/');
        classScopeInput = text;

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            const nextScope = parseClassScopeInput(text.getValue());
            applyClassScope(nextScope);
        });
    });

    const scanRootsSetting = new Settings(containerEl)
        .setName('Inquiry scan folders')
        .setDesc('Inquiry only scans within these folders. One path per line. Wildcards like /Book */ or /Book 1-7 */ are allowed. Use / for the vault root. Empty = no scan.');

    scanRootsSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.scanRoots));
        text.inputEl.rows = 4;
        text.inputEl.addClass('ert-input--lg');
        text.setPlaceholder('/Book */\n/Character/\n/World/');
        scanRootsInput = text;

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            const nextRoots = parseScanRootInput(text.getValue());
            applyScanRoots(nextRoots);
        });
    });

    scanRootsSetting.addExtraButton(button => {
        button.setIcon('rotate-ccw');
        button.setTooltip('Refresh scan folders');
        button.onClick(() => {
            const nextRoots = parseScanRootInput(scanRootsInput?.getValue() ?? '');
            applyScanRoots(nextRoots);
        });
    });

    const scanRootActions = containerEl.createDiv({ cls: 'ert-inquiry-scan-root-actions' });
    const addActionButton = (label: string, onClick: () => void) => {
        const btn = scanRootActions.createEl('button', { text: label, cls: 'ert-inquiry-scan-root-btn' });
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

    const resolvedPreview = containerEl.createEl('details', { cls: 'ert-inquiry-resolved-roots' });
    const resolvedSummary = resolvedPreview.createEl('summary', { text: 'Resolved folders (0)' });
    const resolvedList = resolvedPreview.createDiv({ cls: 'ert-inquiry-resolved-roots-list' });

    let resolvedRootCache: { signature: string; resolvedRoots: string[]; total: number } | null = null;

    const classTableWrap = containerEl.createDiv({ cls: 'ert-inquiry-class-table' });

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

        const header = classTableWrap.createDiv({ cls: 'ert-inquiry-class-row ert-inquiry-class-header' });
        header.createDiv({ cls: 'ert-inquiry-class-cell', text: 'Enabled' });
        header.createDiv({ cls: 'ert-inquiry-class-cell', text: 'Class' });
        header.createDiv({ cls: 'ert-inquiry-class-cell', text: 'Book scope' });
        header.createDiv({ cls: 'ert-inquiry-class-cell', text: 'Saga scope' });
        header.createDiv({ cls: 'ert-inquiry-class-cell', text: 'Matches' });

        configs.forEach(config => {
            const row = classTableWrap.createDiv({ cls: 'ert-inquiry-class-row' });
            const rowDisabled = !config.enabled;
            row.toggleClass('is-disabled', rowDisabled);
            const enabledCell = row.createDiv({ cls: 'ert-inquiry-class-cell' });
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

            const nameCell = row.createDiv({ cls: 'ert-inquiry-class-cell ert-inquiry-class-name', text: config.className });

            const isOutline = config.className === 'outline';
            const isReference = REFERENCE_ONLY_CLASSES.has(config.className);

            const bookCell = row.createDiv({ cls: 'ert-inquiry-class-cell' });
            if (isReference) {
                bookCell.createSpan({ cls: 'ert-inquiry-class-role', text: 'Reference' });
            } else {
                const bookToggle = bookCell.createEl('input', { type: 'checkbox' });
                bookToggle.checked = config.bookScope;
                bookToggle.disabled = rowDisabled;
                plugin.registerDomEvent(bookToggle, 'change', () => {
                    inquirySources = {
                        ...inquirySources,
                        classes: (inquirySources.classes || []).map(entry =>
                            entry.className === config.className ? { ...entry, bookScope: bookToggle.checked } : entry
                        )
                    };
                    void refreshClassScan();
                });
                if (isOutline) {
                    bookCell.createSpan({ cls: 'ert-inquiry-class-sub-label', text: 'Book outline' });
                }
            }

            const sagaCell = row.createDiv({ cls: 'ert-inquiry-class-cell' });
            if (isReference) {
                sagaCell.createSpan({ cls: 'ert-inquiry-class-role', text: 'Reference' });
            } else {
                const sagaToggle = sagaCell.createEl('input', { type: 'checkbox' });
                sagaToggle.checked = config.sagaScope;
                sagaToggle.disabled = rowDisabled;
                plugin.registerDomEvent(sagaToggle, 'change', () => {
                    inquirySources = {
                        ...inquirySources,
                        classes: (inquirySources.classes || []).map(entry =>
                            entry.className === config.className ? { ...entry, sagaScope: sagaToggle.checked } : entry
                        )
                    };
                    void refreshClassScan();
                });
                if (isOutline) {
                    sagaCell.createSpan({ cls: 'ert-inquiry-class-sub-label', text: 'Saga outline' });
                }
            }

            const countCell = row.createDiv({ cls: 'ert-inquiry-class-cell ert-inquiry-class-count' });
            const count = counts[config.className] ?? 0;
            countCell.setText(`${count} matches`);

            if (!count) {
                countCell.addClass('ert-inquiry-class-count-empty');
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
        resolvedSummary.setText(`Resolved folders (${total})`);
        resolvedList.empty();

        if (!roots.length) {
            resolvedList.createDiv({
                cls: 'ert-inquiry-resolved-empty',
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
            resolvedList.createDiv({ cls: 'ert-inquiry-resolved-item', text: `${root} ${suffix}` });
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
            const participates = config.enabled && (config.bookScope || config.sagaScope || REFERENCE_ONLY_CLASSES.has(config.className));
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

    const renderPromptConfiguration = () => {
        const promptContainer = containerEl.createDiv({ cls: 'ert-inquiry-prompts' });
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

        const addCustomSlot = async (zone: 'setup' | 'pressure' | 'payoff', limit: number) => {
            const customSlots = getCustomSlots(zone);
            if (customSlots.length >= limit) return;
            const canonical = getCanonicalSlot(zone);
            const nextSlots = [...customSlots, createCustomSlot(zone)];
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
                const row = listEl.createDiv({ cls: 'ert-inquiry-custom-row' });

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

                const deleteBtn = row.createEl('button', { cls: 'ert-iconBtn' });
                setIcon(deleteBtn, 'trash');
                setTooltip(deleteBtn, 'Delete question');
                deleteBtn.onclick = () => {
                    void removeCustomSlot(zone, customIndex);
                };

                plugin.registerDomEvent(dragHandle, 'dragstart', (e) => {
                    dragState.index = customIndex;
                    row.classList.add('ert-inquiry-custom-dragging');
                    e.dataTransfer?.setData('text/plain', customIndex.toString());
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                });

                plugin.registerDomEvent(dragHandle, 'dragend', () => {
                    row.classList.remove('ert-inquiry-custom-dragging');
                    row.classList.remove('ert-inquiry-custom-dragover');
                    dragState.index = null;
                });

                plugin.registerDomEvent(row, 'dragover', (e) => {
                    e.preventDefault();
                    row.classList.add('ert-inquiry-custom-dragover');
                });

                plugin.registerDomEvent(row, 'dragleave', () => {
                    row.classList.remove('ert-inquiry-custom-dragover');
                });

                plugin.registerDomEvent(row, 'drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('ert-inquiry-custom-dragover');
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
            const card = promptContainer.createDiv({ cls: 'ert-inquiry-prompt-card' });
            card.createEl('div', { cls: 'ert-inquiry-prompt-title', text: zoneLabels[zone] });

            const canonicalSlot = getCanonicalSlot(zone);
            const canonicalRow = card.createDiv({ cls: 'ert-inquiry-prompt-row ert-inquiry-prompt-row--canonical' });
            canonicalRow.createDiv({ cls: 'ert-inquiry-prompt-label', text: 'Canonical' });
            const canonicalInputWrap = canonicalRow.createDiv({ cls: 'ert-inquiry-prompt-input' });
            const canonicalInput = new TextComponent(canonicalInputWrap);
            canonicalInput.setPlaceholder('Canonical question')
                .setValue(canonicalSlot?.question ?? '');
            canonicalInput.inputEl.addClass('ert-inquiry-prompt-input-el', 'is-readonly');
            canonicalInput.inputEl.readOnly = true;

            card.createDiv({ cls: 'ert-inquiry-custom-header', text: 'Custom questions' });
            const listEl = card.createDiv({ cls: 'ert-inquiry-custom-list' });
            const customSlots = getCustomSlots(zone);
            const primaryCount = Math.min(customSlots.length, freeCustomLimit);
            renderCustomRows(listEl, zone, customSlots, 0, primaryCount, dragState);

            if (customSlots.length < freeCustomLimit) {
                const addRow = card.createDiv({ cls: 'ert-inquiry-custom-actions' });
                new ButtonComponent(addRow)
                    .setButtonText('Add custom question')
                    .setCta()
                    .onClick(() => {
                        void addCustomSlot(zone, freeCustomLimit);
                    });
            }
        };

        const renderAdvancedSection = (dragStates: Record<'setup' | 'pressure' | 'payoff', { index: number | null }>) => {
            const advancedPanel = promptContainer.createDiv({
                cls: [ERT_CLASSES.PANEL, ERT_CLASSES.SKIN_PRO, 'ert-inquiry-prompts-advanced']
            });
            if (!isPro) {
                advancedPanel.addClass('ert-pro-locked');
            }

            const panelHeader = advancedPanel.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
            const headerMain = panelHeader.createDiv({ cls: ERT_CLASSES.CONTROL });
            headerMain.createEl('div', { cls: ERT_CLASSES.SECTION_TITLE, text: 'Advanced custom slots' });
            headerMain.createEl('div', {
                cls: ERT_CLASSES.SECTION_DESC,
                text: isPro
                    ? 'Add up to 5 more custom questions per zone.'
                    : 'Pro unlocks five additional custom questions per zone.'
            });

            const headerActions = panelHeader.createDiv({ cls: ERT_CLASSES.SECTION_ACTIONS });
            badgePill(headerActions, {
                icon: 'sparkles',
                label: 'Pro',
                variant: ERT_CLASSES.BADGE_PILL_PRO,
                size: ERT_CLASSES.BADGE_PILL_SM
            });

            const panelBody = advancedPanel.createDiv({ cls: ERT_CLASSES.PANEL_BODY });
            const advancedStack = panelBody.createDiv({ cls: ['ert-template-indent', ERT_CLASSES.STACK] });

            (['setup', 'pressure', 'payoff'] as const).forEach(zone => {
                const block = advancedStack.createDiv({ cls: ERT_CLASSES.STACK });
                block.createEl('div', { cls: ERT_CLASSES.LABEL, text: zoneLabels[zone] });

                const listEl = block.createDiv({ cls: 'ert-inquiry-custom-list ert-inquiry-custom-list--advanced' });
                const customSlots = getCustomSlots(zone);
                renderCustomRows(listEl, zone, customSlots, freeCustomLimit, customSlots.length, dragStates[zone]);

                if (!isPro && customSlots.length >= freeCustomLimit) {
                    const placeholder = listEl.createDiv({ cls: 'ert-inquiry-custom-row ert-inquiry-custom-row--placeholder' });
                    placeholder.createDiv({ cls: 'ert-inquiry-custom-placeholder', text: 'Add up to 5 more with Pro' });
                }

                if (isPro && customSlots.length >= freeCustomLimit && customSlots.length < proCustomLimit) {
                    const addRow = block.createDiv({ cls: 'ert-inquiry-custom-actions' });
                    const addButton = new ButtonComponent(addRow)
                        .setButtonText('Add pro question')
                        .onClick(() => {
                            void addCustomSlot(zone, proCustomLimit);
                        });
                    addButton.buttonEl.addClass('ert-btn', 'ert-btn--standard-pro');
                }
            });
        };

        const render = () => {
            promptContainer.empty();

            const promptHeading = promptContainer.createEl('h4', {
                cls: `${ERT_CLASSES.SECTION_TITLE} ${ERT_CLASSES.INLINE}`,
                text: 'Inquiry prompts'
            });
            const promptIcon = promptHeading.createSpan({ cls: 'ert-setting-heading-icon' });
            setIcon(promptIcon, 'list');
            promptHeading.prepend(promptIcon);

            promptContainer.createDiv({
                cls: 'ert-inquiry-prompts-helper setting-item-description',
                text: 'Inquiry ships with editorial defaults. Add custom questions per zone.'
            });

            const dragStates: Record<'setup' | 'pressure' | 'payoff', { index: number | null }> = {
                setup: { index: null as number | null },
                pressure: { index: null as number | null },
                payoff: { index: null as number | null }
            };

            (['setup', 'pressure', 'payoff'] as const).forEach(zone => {
                renderZoneCard(zone, dragStates[zone]);
            });

            renderAdvancedSection(dragStates);
        };

        render();
    };

    const renderCorpusCcSettings = () => {
        const ccHeading = containerEl.createEl('h4', {
            cls: `${ERT_CLASSES.SECTION_TITLE} ${ERT_CLASSES.INLINE}`,
            text: 'Corpus (CC)'
        });
        const ccIcon = ccHeading.createSpan({ cls: 'ert-setting-heading-icon' });
        setIcon(ccIcon, 'layout-grid');
        ccHeading.prepend(ccIcon);

        const thresholdDefaults = normalizeCorpusThresholds(plugin.settings.inquiryCorpusThresholds);
        plugin.settings.inquiryCorpusThresholds = thresholdDefaults;

        containerEl.createDiv({
            cls: 'ert-inquiry-cc-hint setting-item-description',
            text: 'Thresholds are based on content-only word counts (frontmatter excluded).'
        });

        const table = containerEl.createDiv({ cls: 'ert-inquiry-cc-table' });
        const header = table.createDiv({ cls: 'ert-inquiry-cc-row ert-inquiry-cc-header' });
        header.createDiv({ cls: 'ert-inquiry-cc-cell', text: 'Tier' });
        header.createDiv({ cls: 'ert-inquiry-cc-cell', text: 'Word minimum' });

        const inputs: Record<keyof InquiryCorpusThresholds, HTMLInputElement> = {
            emptyMax: document.createElement('input'),
            sketchyMin: document.createElement('input'),
            mediumMin: document.createElement('input'),
            substantiveMin: document.createElement('input')
        };

        const renderRow = (label: string, key: keyof InquiryCorpusThresholds, prefix = '>=') => {
            const row = table.createDiv({ cls: 'ert-inquiry-cc-row' });
            row.createDiv({ cls: 'ert-inquiry-cc-cell', text: label });
            const cell = row.createDiv({ cls: 'ert-inquiry-cc-cell ert-inquiry-cc-input-cell' });
            const input = inputs[key];
            input.type = 'number';
            input.min = '0';
            input.step = '1';
            input.value = String(thresholdDefaults[key]);
            input.classList.add('ert-input--sm');
            const prefixEl = cell.createSpan({ text: `${prefix} ` });
            cell.appendChild(prefixEl);
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

        new Settings(containerEl)
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

    renderPromptConfiguration();
    renderCorpusCcSettings();
    void refreshClassScan();
}
