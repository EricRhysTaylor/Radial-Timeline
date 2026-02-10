import type { App, TextComponent } from 'obsidian';
import { Setting as ObsidianSetting, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { t } from '../../i18n';
import { DEFAULT_SETTINGS } from '../defaults';
import { resolveAiLogFolder, countAiLogFiles } from '../../ai/log';
import { ModalFolderSuggest } from '../FolderSuggest';
import { DEFAULT_BOOK_TITLE, createBookId, normalizeBookProfile } from '../../utils/books';

export function renderGeneralSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    attachFolderSuggest: (text: TextComponent) => void;
    containerEl: HTMLElement;
    addAiRelatedElement?: (el: HTMLElement) => void;
}): void {
    const { app, plugin, containerEl } = params;

    // --- Books Manager ---
    const booksHeading = containerEl.createEl('h3', { text: 'Books' });
    booksHeading.addClass('ert-header2');
    containerEl.createEl('p', {
        cls: 'ert-field-note',
        text: 'Manage multiple manuscripts. The active book drives the timeline title and exports.'
    });

    const booksList = containerEl.createDiv({ cls: 'rt-books-list' });
    const activeBookPanel = containerEl.createDiv({ cls: 'rt-books-active' });

    const ensureBooks = async () => {
        if (!Array.isArray(plugin.settings.books) || plugin.settings.books.length === 0) {
            const legacySource = plugin.settings.sourcePath || '';
            const book = normalizeBookProfile({
                id: createBookId(),
                title: DEFAULT_BOOK_TITLE,
                sourceFolder: legacySource
            });
            plugin.settings.books = [book];
            plugin.settings.activeBookId = book.id;
            await plugin.persistBookSettings();
        }
    };

    const renderBooksManager = () => {
        booksList.empty();
        activeBookPanel.empty();

        const books = plugin.settings.books || [];
        const activeId = plugin.settings.activeBookId;

        if (books.length === 0) {
            booksList.createDiv({ cls: 'ert-field-note', text: 'No books configured yet.' });
        } else {
            books.forEach(book => {
                const isActive = book.id === activeId;
                const label = book.title?.trim() || DEFAULT_BOOK_TITLE;
                const desc = book.sourceFolder?.trim()
                    ? `Folder: ${book.sourceFolder}`
                    : 'No source folder set.';

                const row = new ObsidianSetting(booksList)
                    .setName(label)
                    .setDesc(desc);

                row.addExtraButton(button => {
                    button.setIcon(isActive ? 'check-circle' : 'circle');
                    button.setTooltip(isActive ? 'Active book' : 'Set as active book');
                    if (isActive) {
                        button.setDisabled(true);
                    } else {
                        button.onClick(async () => {
                            await plugin.setActiveBookId(book.id);
                            renderBooksManager();
                        });
                    }
                });

                row.addExtraButton(button => {
                    button.setIcon('trash-2');
                    button.setTooltip('Remove book');
                    if (books.length <= 1) {
                        button.setDisabled(true);
                        return;
                    }
                    button.onClick(async () => {
                        plugin.settings.books = books.filter(b => b.id !== book.id);
                        if (book.id === plugin.settings.activeBookId) {
                            plugin.settings.activeBookId = plugin.settings.books[0]?.id;
                        }
                        await plugin.persistBookSettings();
                        renderBooksManager();
                    });
                });
            });
        }

        const addBookRow = new ObsidianSetting(booksList)
            .setName('Add book')
            .setDesc('Create another manuscript profile.');
        addBookRow.addButton(button => {
            button.setButtonText('Add');
            button.onClick(async () => {
                const next = normalizeBookProfile({
                    id: createBookId(),
                    title: DEFAULT_BOOK_TITLE,
                    sourceFolder: ''
                });
                plugin.settings.books = [...(plugin.settings.books || []), next];
                plugin.settings.activeBookId = next.id;
                await plugin.persistBookSettings();
                renderBooksManager();
            });
        });

        const activeBook = plugin.getActiveBook();
        if (!activeBook) return;

        const activeTitleSetting = new ObsidianSetting(activeBookPanel)
            .setName('Active book title')
            .setDesc('Displayed in the timeline header and mode selector.');
        activeTitleSetting.addText(text => {
            text.setPlaceholder(DEFAULT_BOOK_TITLE).setValue(activeBook.title || '');
            text.inputEl.addClass('ert-input--full');
            const commitTitle = async () => {
                const value = text.getValue().trim();
                activeBook.title = value || DEFAULT_BOOK_TITLE;
                await plugin.persistBookSettings();
                renderBooksManager();
            };
            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void commitTitle(); });
        });

        const sourceSetting = new ObsidianSetting(activeBookPanel)
            .setName('Active book folder')
            .setDesc('Root folder containing scene files for this book.');

        sourceSetting.addText(text => {
            text.setPlaceholder('Example: Book 1').setValue(activeBook.sourceFolder || '');
            text.inputEl.addClass('ert-input--xl');

            const inputEl = text.inputEl;
            const resetState = () => {
                inputEl.removeClass('ert-setting-input-success');
                inputEl.removeClass('ert-setting-input-error');
            };

            const handleBlur = async (overrideValue?: string) => {
                resetState();
                const raw = (overrideValue ?? text.getValue()).trim();
                const normalizedValue = raw ? normalizePath(raw) : '';

                if (raw) {
                    const isValid = await plugin.validateAndRememberPath(normalizedValue);
                    if (isValid) {
                        activeBook.sourceFolder = normalizedValue;
                        await plugin.persistBookSettings();
                        inputEl.addClass('ert-setting-input-success');
                        window.setTimeout(() => inputEl.removeClass('ert-setting-input-success'), 1000);
                    } else {
                        inputEl.addClass('ert-setting-input-error');
                        window.setTimeout(() => inputEl.removeClass('ert-setting-input-error'), 2000);
                    }
                } else {
                    activeBook.sourceFolder = '';
                    await plugin.persistBookSettings();
                    inputEl.addClass('ert-setting-input-success');
                    window.setTimeout(() => inputEl.removeClass('ert-setting-input-success'), 1000);
                }
            };

            new ModalFolderSuggest(app, inputEl, (path) => {
                text.setValue(path);
                void handleBlur(path);
            });

            plugin.registerDomEvent(inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    inputEl.blur();
                }
            });

            plugin.registerDomEvent(inputEl, 'blur', () => { void handleBlur(); });
        });

        const fileStemSetting = new ObsidianSetting(activeBookPanel)
            .setName('File stem (advanced)')
            .setDesc('Optional filename base for exports. Leave blank to use the book title.');
        fileStemSetting.addText(text => {
            text.setPlaceholder('Optional').setValue(activeBook.fileStem || '');
            text.inputEl.addClass('ert-input--full');
            const commitStem = async () => {
                const trimmed = text.getValue().trim();
                activeBook.fileStem = trimmed.length > 0 ? trimmed : undefined;
                await plugin.persistBookSettings();
            };
            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void commitStem(); });
        });
    };

    void ensureBooks().then(renderBooksManager);

    // --- Export Folder ---
    const manuscriptSetting = new ObsidianSetting(containerEl)
        .setName(t('settings.configuration.manuscriptOutputFolder.name'))
        .setDesc(t('settings.configuration.manuscriptOutputFolder.desc'));
    manuscriptSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Export';
        const fallbackFolder = plugin.settings.manuscriptOutputFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(t('settings.configuration.manuscriptOutputFolder.placeholder'))
            .setValue(fallbackFolder);
        text.inputEl.addClass('ert-input--full');

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

            const isValid = await plugin.validateAndRememberPath(normalized);
            if (!isValid) {
                flashClass('ert-setting-input-error');
                return;
            }

            plugin.settings.manuscriptOutputFolder = normalized;
            plugin.settings.outlineOutputFolder = normalized;
            await plugin.saveSettings();
            flashClass('ert-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        manuscriptSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                const normalizedDefault = normalizePath(defaultPath);
                plugin.settings.manuscriptOutputFolder = normalizedDefault;
                plugin.settings.outlineOutputFolder = normalizedDefault;
                await plugin.saveSettings();
                flashClass('ert-setting-input-success');
            });
        });
    });

    // --- AI Output Folder ---
    const aiSetting = new ObsidianSetting(containerEl)
        .setName(t('settings.configuration.aiOutputFolder.name'))
        .setDesc(t('settings.configuration.aiOutputFolder.desc'));
    aiSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.aiOutputFolder || 'Radial Timeline/Logs';
        const fallbackFolder = plugin.settings.aiOutputFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(t('settings.configuration.aiOutputFolder.placeholder'))
            .setValue(fallbackFolder);
        text.inputEl.addClass('ert-input--full');

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

            const isValid = await plugin.validateAndRememberPath(normalized);
            if (!isValid) {
                flashClass('ert-setting-input-error');
                return;
            }

            plugin.settings.aiOutputFolder = normalized;
            await plugin.saveSettings();
            flashClass('ert-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        aiSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                plugin.settings.aiOutputFolder = normalizePath(defaultPath);
                await plugin.saveSettings();
                flashClass('ert-setting-input-success');
            });
        });
    });

    // --- AI Logs Toggle ---
    const outputFolder = resolveAiLogFolder();
    const formatLogCount = (fileCount: number | null): string => {
        if (fileCount === null) return 'Counting log files...';
        return fileCount === 0
            ? 'No log files yet'
            : fileCount === 1
                ? '1 log file'
                : `${fileCount} log files`;
    };
    const getLoggingDesc = (fileCount: number | null): string => {
        const countText = formatLogCount(fileCount);
        return `Summary logs (run metadata, token usage, results) are always written for Inquiry, Pulse, and Gossamer. When enabled, also writes Content logs containing full prompts, materials, and API responses—useful for debugging and understanding AI behavior. Recommended while learning the system. Logs are stored in "${outputFolder}" (${countText}).`;
    };

    const apiLoggingSetting = new ObsidianSetting(containerEl)
        .setName('Enable AI content logs')
        .setDesc(getLoggingDesc(null))
        .addToggle(toggle => toggle
            .setValue(plugin.settings.logApiInteractions)
            .onChange(async (value) => {
                plugin.settings.logApiInteractions = value;
                await plugin.saveSettings();
            }));

    params.addAiRelatedElement?.(apiLoggingSetting.settingEl);

    const scheduleLogCount = () => {
        const runCount = () => {
            const fileCount = countAiLogFiles(plugin);
            apiLoggingSetting.setDesc(getLoggingDesc(fileCount));
        };
        const requestIdleCallback = (window as Window & {
            requestIdleCallback?: (cb: () => void) => void;
        }).requestIdleCallback;
        if (requestIdleCallback) {
            requestIdleCallback(runCount);
        } else {
            window.setTimeout(runCount, 0);
        }
    };
    scheduleLogCount();

}
