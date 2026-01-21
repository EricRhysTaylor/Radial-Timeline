import { App, Setting as Settings, TextComponent, TextAreaComponent, ToggleComponent, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import type { InquiryClassConfig, InquiryPromptConfig, InquiryPromptSlot, InquirySourcesSettings } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { addHeadingIcon, addWikiLink } from '../wikiLink';
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

export function renderInquirySection(params: SectionParams): void {
    const { plugin, containerEl, attachFolderSuggest } = params;

    const heading = new Settings(containerEl)
        .setName('Inquiry')
        .setHeading();
    addHeadingIcon(heading, 'waves');
    addWikiLink(heading, 'Settings#inquiry');

    const artifactSetting = new Settings(containerEl)
        .setName('Artifact folder')
        .setDesc('Artifacts are saved only when you explicitly click the Artifact icon.');

    artifactSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.inquiryArtifactFolder || 'Radial Timeline/Inquiry/Artifacts';
        const fallbackFolder = plugin.settings.inquiryArtifactFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(defaultPath)
            .setValue(fallbackFolder);
        text.inputEl.addClass('rt-input-full');

        if (attachFolderSuggest) {
            attachFolderSuggest(text);
        }

        const inputEl = text.inputEl;
        const flashClass = (cls: string) => {
            inputEl.addClass(cls);
            window.setTimeout(() => inputEl.removeClass(cls), cls === 'rt-setting-input-success' ? 1000 : 2000);
        };

        const validatePath = async () => {
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');

            const rawValue = text.getValue();
            const trimmed = rawValue.trim() || fallbackFolder;

            if (illegalChars.test(trimmed)) {
                flashClass('rt-setting-input-error');
                new Notice('Folder path cannot contain the characters < > : " | ? *');
                return;
            }

            const normalized = normalizePath(trimmed);
            try { await plugin.app.vault.createFolder(normalized); } catch { /* folder may already exist */ }

            plugin.settings.inquiryArtifactFolder = normalized;
            await plugin.saveSettings();
            flashClass('rt-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        artifactSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                plugin.settings.inquiryArtifactFolder = normalizePath(defaultPath);
                await plugin.saveSettings();
                flashClass('rt-setting-input-success');
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
            text.inputEl.addClass('rt-input-sm');

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

    const sourcesHeading = new Settings(containerEl)
        .setName('Inquiry sources')
        .setDesc('Inquiry reads notes based on YAML class values inside the scan folders.');
    sourcesHeading.settingEl.addClass('rt-inquiry-settings-heading');

    let scanRootsInput: TextAreaComponent | null = null;
    let classScopeInput: TextAreaComponent | null = null;

    const classScopeSetting = new Settings(containerEl)
        .setName('Inquiry class scope')
        .setDesc('One YAML class per line. Use / to allow all classes. Empty = no classes allowed.');

    classScopeSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.classScope));
        text.inputEl.rows = 3;
        text.inputEl.addClass('rt-input-full');
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
        text.inputEl.addClass('rt-input-full');
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
        const promptHeading = new Settings(containerEl)
            .setName('Inquiry prompts')
            .setHeading();
        addHeadingIcon(promptHeading, 'list');

        containerEl.createDiv({
            cls: 'ert-inquiry-prompts-helper setting-item-description',
            text: 'Inquiry ships with editorial defaults. Enable Customize to override any question.'
        });

        const isPro = isProfessionalActive(plugin);
        let promptConfig: InquiryPromptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
        if (!plugin.settings.inquiryPromptConfig) {
            plugin.settings.inquiryPromptConfig = buildDefaultInquiryPromptConfig();
            promptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
            void plugin.saveSettings();
        }

        const modeLabels: Record<string, string> = { flow: 'Flow', depth: 'Depth' };
        const zoneLabels: Record<string, string> = { setup: 'Setup', pressure: 'Pressure', payoff: 'Payoff' };

        const updateSlot = async (
            mode: 'flow' | 'depth',
            zone: 'setup' | 'pressure' | 'payoff',
            index: number,
            patch: Partial<InquiryPromptSlot>
        ) => {
            promptConfig = normalizeInquiryPromptConfig(plugin.settings.inquiryPromptConfig);
            const slots = promptConfig[mode][zone].slice();
            slots[index] = { ...slots[index], ...patch };
            promptConfig[mode][zone] = slots;
            plugin.settings.inquiryPromptConfig = promptConfig;
            await plugin.saveSettings();
        };

        const getSlotInfo = (mode: 'flow' | 'depth', zone: 'setup' | 'pressure' | 'payoff') => {
            const slots = promptConfig[mode][zone] ?? [];
            const builtInIndex = slots.findIndex(slot => slot.builtIn);
            const builtInSlot = slots[builtInIndex >= 0 ? builtInIndex : 0];
            const customIndex = slots.findIndex(slot => !slot.builtIn);
            const customSlot = customIndex >= 0 ? slots[customIndex] : undefined;
            return { slots, builtInIndex, builtInSlot, customIndex, customSlot };
        };

        const renderSimpleRow = (zone: 'setup' | 'pressure' | 'payoff') => {
            const card = containerEl.createDiv({ cls: 'ert-inquiry-prompt-card' });
            card.createEl('div', { cls: 'ert-inquiry-prompt-title', text: zoneLabels[zone] });

            (['flow', 'depth'] as const).forEach(mode => {
                const { builtInSlot, customIndex, customSlot } = getSlotInfo(mode, zone);
                const builtInQuestion = builtInSlot?.question ?? '';
                let customQuestion = customSlot?.question ?? '';
                let isCustomEnabled = !!customSlot?.enabled;

                const row = card.createDiv({ cls: 'ert-inquiry-prompt-row' });
                row.createDiv({ cls: 'ert-inquiry-prompt-label', text: modeLabels[mode] });

                const inputWrap = row.createDiv({ cls: 'ert-inquiry-prompt-input' });
                const text = new TextComponent(inputWrap);
                const activeQuestion = isCustomEnabled && customQuestion.trim().length ? customQuestion : builtInQuestion;
                text.setPlaceholder('Question')
                    .setValue(activeQuestion);
                text.inputEl.addClass('ert-inquiry-prompt-input-el');
                text.inputEl.readOnly = !isCustomEnabled;
                text.inputEl.toggleClass('is-readonly', !isCustomEnabled);

                text.onChange(async (value) => {
                    if (!isCustomEnabled || customIndex < 0) return;
                    customQuestion = value;
                    await updateSlot(mode, zone, customIndex, { question: value, enabled: true });
                });

                const toggleWrap = inputWrap.createDiv({ cls: 'ert-inquiry-prompt-toggle' });
                toggleWrap.createSpan({ text: 'Customize' });
                const toggle = new ToggleComponent(toggleWrap);
                toggle.setValue(isCustomEnabled);
                toggle.setDisabled(customIndex < 0);

                toggle.onChange(async (value) => {
                    if (customIndex < 0) return;
                    isCustomEnabled = value;
                    if (value) {
                        if (!customQuestion.trim().length) customQuestion = builtInQuestion;
                        text.setValue(customQuestion);
                    } else {
                        text.setValue(builtInQuestion);
                    }
                    text.inputEl.readOnly = !value;
                    text.inputEl.toggleClass('is-readonly', !value);
                    await updateSlot(mode, zone, customIndex, { enabled: value, question: customQuestion });
                });
            });
        };

        (['setup', 'pressure', 'payoff'] as const).forEach(zone => {
            renderSimpleRow(zone);
        });

        const advancedDetails = containerEl.createEl('details', { cls: 'rt-setting-block ert-inquiry-prompts-advanced' });
        advancedDetails.createEl('summary', { text: 'Advanced prompt slots' });
        advancedDetails.createEl('div', {
            cls: 'ert-inquiry-prompts-advanced-hint',
            text: 'Pro / advanced use only.'
        });
        if (!isPro) {
            advancedDetails.createEl('div', {
                cls: 'setting-item-description',
                text: 'Pro unlocks additional prompt slots and advanced editing.'
            });
            return;
        }

        const maxCustomSlots = 4;
        (['flow', 'depth'] as const).forEach(mode => {
            (['setup', 'pressure', 'payoff'] as const).forEach(zone => {
                const block = advancedDetails.createDiv({ cls: 'rt-setting-block' });
                block.createEl('div', { cls: 'setting-item-name', text: `${modeLabels[mode]} - ${zoneLabels[zone]}` });
                const slots = promptConfig[mode][zone];

                slots.forEach((slot, idx) => {
                    const isBuiltIn = !!slot.builtIn;
                    const customIndex = idx - 1;
                    const isLocked = !isBuiltIn && customIndex >= maxCustomSlots;
                    const slotLabel = isBuiltIn ? `Prompt ${idx + 1} (built-in)` : `Prompt ${idx + 1}`;
                    const desc = isLocked
                        ? 'Pro unlocks additional custom prompt slots.'
                        : isBuiltIn
                            ? 'Built-in prompt (text locked).'
                            : 'Custom prompt slot.';

                    const slotSetting = new Settings(block)
                        .setName(slotLabel)
                        .setDesc(desc);

                    slotSetting.addToggle(toggle => {
                        toggle.setValue(!!slot.enabled);
                        toggle.setDisabled(isLocked);
                        toggle.onChange(async (value) => {
                            await updateSlot(mode, zone, idx, { enabled: value });
                        });
                    });

                    slotSetting.addText(text => {
                        text.setPlaceholder('Label (optional)')
                            .setValue(slot.label || '')
                            .setDisabled(isLocked || isBuiltIn);
                        text.onChange(async (value) => {
                            await updateSlot(mode, zone, idx, { label: value });
                        });
                    });

                    slotSetting.addText(text => {
                        text.setPlaceholder('Question text')
                            .setValue(slot.question || '')
                            .setDisabled(isLocked || isBuiltIn);
                        text.onChange(async (value) => {
                            await updateSlot(mode, zone, idx, { question: value });
                        });
                    });
                });
            });
        });
    };

    renderPromptConfiguration();
    void refreshClassScan();
}
