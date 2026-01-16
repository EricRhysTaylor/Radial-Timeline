import { App, Setting as Settings, TextComponent, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    attachFolderSuggest?: (text: TextComponent) => void;
}

const parseListValue = (raw: string): string[] => {
    return raw
        .split(/[\n,]/)
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => normalizePath(entry));
};

const listToText = (values?: string[]): string =>
    (values || []).join('\n');

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

    const sources = plugin.settings.inquirySources || {
        sceneFolders: [],
        bookOutlineFiles: [],
        sagaOutlineFile: '',
        characterFolders: [],
        placeFolders: [],
        powerFolders: []
    };
    plugin.settings.inquirySources = sources;

    const sourcesHeading = new Settings(containerEl)
        .setName('Inquiry sources')
        .setDesc('List paths for the curated Inquiry corpus. One path per line.');
    sourcesHeading.settingEl.addClass('rt-inquiry-settings-heading');

    new Settings(containerEl)
        .setName('Scene folders')
        .setDesc('Folders that contain scene notes (book scope evidence).')
        .addTextArea(text => {
            text.setValue(listToText(sources.sceneFolders));
            text.inputEl.rows = 3;
            text.onChange(async (value) => {
                sources.sceneFolders = parseListValue(value);
                plugin.settings.inquirySources = sources;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Book outline files')
        .setDesc('Outline files used at book scope. One path per line.')
        .addTextArea(text => {
            text.setValue(listToText(sources.bookOutlineFiles));
            text.inputEl.rows = 3;
            text.onChange(async (value) => {
                sources.bookOutlineFiles = parseListValue(value);
                plugin.settings.inquirySources = sources;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Saga outline file')
        .setDesc('Single saga-level outline file path.')
        .addText(text => {
            text.setPlaceholder('Path to saga outline file');
            text.setValue(sources.sagaOutlineFile || '');
            text.inputEl.addClass('rt-input-full');
            text.onChange(async (value) => {
                sources.sagaOutlineFile = value.trim() ? normalizePath(value.trim()) : '';
                plugin.settings.inquirySources = sources;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Character folders')
        .setDesc('Reference folders for characters.')
        .addTextArea(text => {
            text.setValue(listToText(sources.characterFolders));
            text.inputEl.rows = 2;
            text.onChange(async (value) => {
                sources.characterFolders = parseListValue(value);
                plugin.settings.inquirySources = sources;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Place folders')
        .setDesc('Reference folders for places.')
        .addTextArea(text => {
            text.setValue(listToText(sources.placeFolders));
            text.inputEl.rows = 2;
            text.onChange(async (value) => {
                sources.placeFolders = parseListValue(value);
                plugin.settings.inquirySources = sources;
                await plugin.saveSettings();
            });
        });

    new Settings(containerEl)
        .setName('Power folders')
        .setDesc('Reference folders for powers or systems.')
        .addTextArea(text => {
            text.setValue(listToText(sources.powerFolders));
            text.inputEl.rows = 2;
            text.onChange(async (value) => {
                sources.powerFolders = parseListValue(value);
                plugin.settings.inquirySources = sources;
                await plugin.saveSettings();
            });
        });
}
