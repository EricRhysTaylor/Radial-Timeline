import { App, Setting as Settings, TextComponent, TextAreaComponent, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import type { InquiryClassConfig, InquirySourcesSettings } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { addHeadingIcon, addWikiLink } from '../wikiLink';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    parseScanRootInput,
    resolveScanRoots,
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
        .setDesc('Inquiry reads notes based on YAML class values inside the scan roots.');
    sourcesHeading.settingEl.addClass('rt-inquiry-settings-heading');

    let scanRootsInput: TextAreaComponent | null = null;

    const scanRootsSetting = new Settings(containerEl)
        .setName('Inquiry scan roots')
        .setDesc('Inquiry only scans within these roots. One path per line. Wildcards like /Book */ are allowed. Empty = no scan.');

    scanRootsSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.scanRoots));
        text.inputEl.rows = 4;
        text.inputEl.addClass('rt-input-full');
        text.setPlaceholder('/Book */\n/Characters/\n/World/');
        scanRootsInput = text;

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            const nextRoots = parseScanRootInput(text.getValue());
            applyScanRoots(nextRoots);
        });
    });

    scanRootsSetting.addExtraButton(button => {
        button.setIcon('rotate-ccw');
        button.setTooltip('Refresh scan roots');
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
    addActionButton('Clear', () => {
        applyScanRoots([]);
    });

    const resolvedPreview = containerEl.createEl('details', { cls: 'ert-inquiry-resolved-roots' });
    const resolvedSummary = resolvedPreview.createEl('summary', { text: 'Resolved roots (0)' });
    const resolvedList = resolvedPreview.createDiv({ cls: 'ert-inquiry-resolved-roots-list' });

    let resolvedRootCache: { signature: string; resolvedRoots: string[]; total: number } | null = null;

    const classTableWrap = containerEl.createDiv({ cls: 'ert-inquiry-class-table' });

    const scanInquiryClasses = async (roots: string[]): Promise<{
        counts: Record<string, number>;
        classes: string[];
    }> => {
        if (!roots.length) {
            return { counts: {}, classes: [] };
        }
        const counts: Record<string, number> = {};
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
            values.forEach(value => {
                const name = typeof value === 'string' ? value.trim() : String(value).trim();
                if (!name) return;
                const key = name.toLowerCase();
                counts[key] = (counts[key] || 0) + 1;
            });
        });

        return {
            counts,
            classes: Object.keys(counts).sort()
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

    const renderResolvedRoots = (roots: string[], total: number) => {
        resolvedSummary.setText(`Resolved roots (${total})`);
        resolvedList.empty();

        if (!roots.length) {
            resolvedList.createDiv({
                cls: 'ert-inquiry-resolved-empty',
                text: 'No scan roots set. Add /Book */ or / to begin.'
            });
            return;
        }

        roots.forEach(root => {
            resolvedList.createDiv({ cls: 'ert-inquiry-resolved-item', text: root });
        });
    };

    const applyScanRoots = (nextRoots: string[]) => {
        const normalized = nextRoots.length ? normalizeScanRootPatterns(nextRoots) : [];
        inquirySources = { ...inquirySources, scanRoots: normalized };
        scanRootsInput?.setValue(listToText(normalized));
        resolvedRootCache = null;
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
        const merged = mergeClassConfigs(inquirySources.classes || [], scan.classes);
        inquirySources = {
            scanRoots: rawRoots,
            classes: merged,
            classCounts: scan.counts,
            resolvedScanRoots: resolvedRootCache.resolvedRoots,
            lastScanAt: new Date().toISOString()
        };
        plugin.settings.inquirySources = inquirySources;
        await plugin.saveSettings();
        renderClassTable(merged, scan.counts);
        renderResolvedRoots(resolvedRootCache.resolvedRoots, resolvedRootCache.total);
    };

    void refreshClassScan();
}
