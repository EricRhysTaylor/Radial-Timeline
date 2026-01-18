import { App, Setting as Settings, TextComponent, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import type { InquiryClassConfig, InquirySourcesSettings } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';

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

const parseRootListValue = (raw: string): string[] => {
    const entries = raw
        .split(/[\n,]/)
        .map(entry => entry.trim())
        .map(entry => (entry === '/' || entry === '.' ? '' : entry))
        .map(entry => normalizePath(entry));
    const unique = Array.from(new Set(entries.filter(entry => entry !== undefined)));
    return unique.length ? unique : [''];
};

const normalizeScanRoots = (roots?: string[]): string[] => {
    const normalized = (roots && roots.length ? roots : ['']).map(entry => normalizePath(entry));
    const unique = Array.from(new Set(normalized));
    return unique.length ? unique : [''];
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
        scanRoots: roots.size ? Array.from(roots) : [''],
        classes,
        classCounts: {}
    };
};

const normalizeInquirySources = (raw?: InquirySourcesSettings | LegacyInquirySourcesSettings): InquirySourcesSettings => {
    if (!raw) {
        return { scanRoots: [''], classes: [], classCounts: {} };
    }
    if (isLegacySources(raw)) {
        return migrateLegacySources(raw);
    }
    return {
        scanRoots: normalizeScanRoots(raw.scanRoots),
        classes: (raw.classes || []).map(config => ({
            className: config.className.toLowerCase(),
            enabled: !!config.enabled,
            bookScope: !!config.bookScope,
            sagaScope: !!config.sagaScope
        })),
        classCounts: raw.classCounts || {},
        lastScanAt: raw.lastScanAt
    };
};

export function renderInquirySection(params: SectionParams): void {
    const { plugin, containerEl, attachFolderSuggest } = params;

    const heading = new Settings(containerEl)
        .setName('Inquiry')
        .setHeading();

    heading.setDesc('Configure Inquiry artifacts, cache behavior, and source boundaries.');

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

    new Settings(containerEl)
        .setName('Enable session cache')
        .setDesc('Cache up to 30 Inquiry sessions by default.')
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
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

    let inquirySources = normalizeInquirySources(plugin.settings.inquirySources);
    plugin.settings.inquirySources = inquirySources;

    const sourcesHeading = new Settings(containerEl)
        .setName('Inquiry sources')
        .setDesc('Inquiry reads notes based on YAML class values inside the scan roots.');
    sourcesHeading.settingEl.addClass('rt-inquiry-settings-heading');

    const scanRootsSetting = new Settings(containerEl)
        .setName('Inquiry scan roots')
        .setDesc('Inquiry only scans within these roots. One path per line. Leave blank for vault root.');

    scanRootsSetting.addTextArea(text => {
        text.setValue(listToText(inquirySources.scanRoots));
        text.inputEl.rows = 2;
        text.inputEl.addClass('rt-input-full');

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            const nextRoots = normalizeScanRoots(parseRootListValue(text.getValue()));
            inquirySources = { ...inquirySources, scanRoots: nextRoots };
            void refreshClassScan();
        });
    });

    const classTableWrap = containerEl.createDiv({ cls: 'ert-inquiry-class-table' });

    const scanInquiryClasses = async (roots: string[]): Promise<{ counts: Record<string, number>; classes: string[] }> => {
        const counts: Record<string, number> = {};
        const normalizedRoots = normalizeScanRoots(roots);
        const files = plugin.app.vault.getMarkdownFiles();

        const inRoots = (path: string) => {
            return normalizedRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
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

    const refreshClassScan = async () => {
        const scanRoots = normalizeScanRoots(inquirySources.scanRoots);
        const scan = await scanInquiryClasses(scanRoots);
        const merged = mergeClassConfigs(inquirySources.classes || [], scan.classes);
        inquirySources = {
            scanRoots,
            classes: merged,
            classCounts: scan.counts,
            lastScanAt: new Date().toISOString()
        };
        plugin.settings.inquirySources = inquirySources;
        await plugin.saveSettings();
        renderClassTable(merged, scan.counts);
    };

    void refreshClassScan();
}
