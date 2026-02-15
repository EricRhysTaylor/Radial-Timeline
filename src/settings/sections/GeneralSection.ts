import type { App, TextComponent } from 'obsidian';
import { Setting as ObsidianSetting, normalizePath, Notice, Modal, ButtonComponent, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { t } from '../../i18n';
import { DEFAULT_SETTINGS } from '../defaults';
import { resolveAiLogFolder, countAiLogFiles } from '../../ai/log';
import { ModalFolderSuggest } from '../FolderSuggest';
import { DEFAULT_BOOK_TITLE, createBookId, normalizeBookProfile } from '../../utils/books';
import {
    copyFolderRecursive,
    getDraftDisplayTitle,
    isFolderPathMissingOrRoot,
    isValidBookSourceFolder,
    resolveDraftTarget,
    suggestNextDraftLabel
} from '../../utils/draftBook';
import { ERT_CLASSES } from '../../ui/classes';
import { addHeadingIcon, applyErtHeaderLayout } from '../wikiLink';

// ── Rename modal (mirrors CampaignNameModal pattern) ────────────────────
class BookRenameModal extends Modal {
    private initialValue: string;
    private onSubmit: (value: string) => Promise<boolean>;

    constructor(app: App, initialValue: string, onSubmit: (value: string) => Promise<boolean>) {
        super(app);
        this.initialValue = initialValue;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '420px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Edit' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Rename book' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'This name appears in the timeline header, tab, and exports.' });

        const inputContainer = contentEl.createDiv({ cls: 'ert-search-input-container' });
        const inputEl = inputContainer.createEl('input', {
            type: 'text',
            value: this.initialValue,
            cls: 'ert-input ert-input--full'
        });
        inputEl.setAttr('placeholder', DEFAULT_BOOK_TITLE);

        window.setTimeout(() => inputEl.focus(), 50);

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const val = inputEl.value.trim();
            if (!val) {
                new Notice('Please enter a book title.');
                return;
            }
            const shouldClose = await this.onSubmit(val);
            if (shouldClose) this.close();
        };

        new ButtonComponent(buttonRow).setButtonText('Rename').setCta().onClick(() => { void save(); });
        new ButtonComponent(buttonRow).setButtonText('Cancel').onClick(() => this.close());

        inputEl.addEventListener('keydown', (evt: KeyboardEvent) => { // SAFE: direct addEventListener; Modal lifecycle manages cleanup
            if (evt.key === 'Enter') { evt.preventDefault(); void save(); }
        });
    }

    onClose() { this.contentEl.empty(); }
}

class CreateDraftModal extends Modal {
    private defaultName: string;
    private resolvePreviewPath: (draftName: string) => string;
    private switchToNewDraft = false;
    private onSubmit: (result: { draftName: string; switchToNewDraft: boolean }) => Promise<boolean>;

    constructor(
        app: App,
        defaultName: string,
        resolvePreviewPath: (draftName: string) => string,
        onSubmit: (result: { draftName: string; switchToNewDraft: boolean }) => Promise<boolean>
    ) {
        super(app);
        this.defaultName = defaultName;
        this.resolvePreviewPath = resolvePreviewPath;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '420px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Draft' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Create draft' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Optional draft name.' });

        const form = contentEl.createDiv({ cls: 'ert-stack' });
        let draftName = this.defaultName;
        const preview = form.createDiv({ cls: 'setting-item-description' });

        const updatePreview = () => {
            try {
                const resolved = this.resolvePreviewPath(draftName.trim());
                preview.setText(`Destination: ${resolved}`);
            } catch {
                preview.setText('Destination: unavailable');
            }
        };

        const nameSetting = new ObsidianSetting(form)
            .setName('Draft name')
            .setDesc('Leave as-is or enter a custom suffix.')
            .addText(text => {
                text.setValue(this.defaultName);
                text.inputEl.addClass('ert-input--full');
                text.inputEl.focus();
                text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
                    if (evt.key === 'Enter') {
                        evt.preventDefault();
                        void save();
                    }
                });
                text.onChange(value => {
                    draftName = value;
                    updatePreview();
                });
            });
        nameSetting.settingEl.addClass('ert-setting-full-width-input');
        updatePreview();

        new ObsidianSetting(form)
            .setName('Switch to new draft')
            .setDesc('Make the copied draft active after creation.')
            .addToggle(toggle => {
                toggle.setValue(false);
                toggle.onChange(value => {
                    this.switchToNewDraft = value;
                });
            });

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const shouldClose = await this.onSubmit({
                draftName: draftName.trim(),
                switchToNewDraft: this.switchToNewDraft
            });
            if (shouldClose) this.close();
        };

        new ButtonComponent(actions)
            .setButtonText('Create draft')
            .setCta()
            .onClick(() => {
                void save();
            });
        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}

export function renderGeneralSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    attachFolderSuggest: (text: TextComponent) => void;
    containerEl: HTMLElement;
    addAiRelatedElement?: (el: HTMLElement) => void;
}): void {
    const { app, plugin, containerEl } = params;

    // --- Books Manager ---
    const booksHeading = new ObsidianSetting(containerEl)
        .setName('Books')
        .setDesc('The active book drives the timeline view, title and exports.')
        .setHeading();
    addHeadingIcon(booksHeading, 'library-big');
    applyErtHeaderLayout(booksHeading);

    // "+" add-book button in the setting row's control column (far right)
    const addBookBtn = booksHeading.controlEl.createEl('button', {
        cls: 'ert-iconBtn ert-mod-cta rt-books-add-btn',
        attr: { 'aria-label': 'Add book', type: 'button' }
    });
    setIcon(addBookBtn, 'plus');

    const booksPanel = containerEl.createDiv({ cls: `${ERT_CLASSES.STACK} rt-books-panel` });

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

    /** Pulse the "+" button green when books need attention (no books, or missing source folder) */
    const updateAddBtnPulse = () => {
        const books = plugin.settings.books || [];
        const needsAttention = books.length === 0
            || books.some(b => !b.sourceFolder?.trim());
        addBookBtn.toggleClass('rt-books-add-btn--pulse', needsAttention);
    };

    const addNewBook = async () => {
        const next = normalizeBookProfile({
            id: createBookId(),
            title: DEFAULT_BOOK_TITLE,
            sourceFolder: ''
        });
        plugin.settings.books = [...(plugin.settings.books || []), next];
        plugin.settings.activeBookId = next.id;
        await plugin.persistBookSettings();
        renderBooksManager();
    };

    addBookBtn.addEventListener('click', () => { void addNewBook(); }); // SAFE: direct addEventListener; Settings lifecycle manages cleanup

    const renderBooksManager = () => {
        booksPanel.empty();

        const books = plugin.settings.books || [];
        const activeId = plugin.settings.activeBookId;

        books.forEach(book => {
            const isActive = book.id === activeId;
            const label = book.title?.trim() || DEFAULT_BOOK_TITLE;

            // ── Scene count (only Class: Scene files) ────────────────
            let sceneStatText = 'No folder';
            let sceneStatWarn = true;
            const folder = book.sourceFolder?.trim();
            if (folder) {
                const abstractFolder = app.vault.getAbstractFileByPath(normalizePath(folder));
                if (abstractFolder && 'children' in abstractFolder) {
                    const children = (abstractFolder as { children: { path: string }[] }).children;
                    let sceneCount = 0;
                    for (const child of children) {
                        if (!child.path.endsWith('.md')) continue;
                        const tfile = app.vault.getAbstractFileByPath(child.path);
                        if (!tfile) continue;
                        const fm = app.metadataCache.getFileCache(tfile as import('obsidian').TFile)?.frontmatter;
                        if (fm && (fm.Class === 'Scene' || fm.class === 'Scene')) sceneCount++;
                    }
                    sceneStatText = sceneCount === 1 ? '1 scene' : `${sceneCount} scenes`;
                    sceneStatWarn = false;
                }
            }

            // ── Single-row book card (Setting row) ───────────────────
            const row = new ObsidianSetting(booksPanel);
            row.settingEl.addClass('rt-book-card', isActive ? 'is-active' : 'is-inactive');

            // Name: status icon + clickable title
            const nameEl = row.nameEl;
            nameEl.empty();
            nameEl.addClass('rt-book-card__name');

            const statusIcon = nameEl.createDiv({
                cls: `rt-book-card__status ${isActive ? 'rt-book-card__status--active' : ''}`
            });
            setIcon(statusIcon, 'check-circle');

            const titleSpan = nameEl.createSpan({
                text: label,
                cls: 'ert-book-name ert-book-name--clickable'
            });
            titleSpan.setAttr('role', 'button');
            titleSpan.setAttr('tabindex', '0');
            titleSpan.setAttr('aria-label', `Rename "${label}"`);
            const openRename = () => {
                new BookRenameModal(app, label, async (newTitle) => {
                    const trimmed = newTitle.trim();
                    if (!trimmed) return false;
                    book.title = trimmed;
                    await plugin.persistBookSettings();
                    renderBooksManager();
                    return true;
                }).open();
            };
            titleSpan.addEventListener('click', (e) => { e.stopPropagation(); openRename(); }); // SAFE: direct addEventListener; Settings lifecycle manages cleanup
            titleSpan.addEventListener('keydown', (e: KeyboardEvent) => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRename(); }
            });

            // Desc: scene count stat
            row.setDesc(sceneStatText);
            if (sceneStatWarn) {
                row.descEl.addClass('rt-book-card__stat--warn');
            }

            // Activate: click the row (title stopPropagation prevents conflict)
            if (!isActive) {
                row.settingEl.addClass('rt-book-card--clickable');
                row.settingEl.addEventListener('click', async () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                    await plugin.setActiveBookId(book.id);
                    renderBooksManager();
                });
                // Prevent input/trash clicks from activating
                row.controlEl.addEventListener('click', (e) => e.stopPropagation()); // SAFE: direct addEventListener; Settings lifecycle manages cleanup
            }

            // Controls: source folder input + trash
            let creatingDraft = false;
            let draftButtonRef: ButtonComponent | null = null;
            const setDraftButtonState = (isBusy: boolean) => {
                creatingDraft = isBusy;
                if (!draftButtonRef) return;
                draftButtonRef.setDisabled(isBusy);
                setIcon(draftButtonRef.buttonEl, isBusy ? 'loader-2' : 'book-dashed');
            };

            row.addButton(button => {
                draftButtonRef = button;
                button.buttonEl.empty();
                button.buttonEl.addClass('ert-iconBtn');
                button.buttonEl.setAttr('aria-label', 'Create draft');
                setIcon(button.buttonEl, 'book-dashed');
                button.setTooltip('Create a sibling draft copy of this book folder. Keeps all files unchanged. Adds new Book profile with a unique name.');
                button.onClick(() => {
                    if (creatingDraft) return;

                    const sourceFolder = (book.sourceFolder || '').trim();
                    if (isFolderPathMissingOrRoot(sourceFolder)) {
                        new Notice('Draft requires a book folder (vault root is not supported).');
                        return;
                    }

                    const normalizedSource = normalizePath(sourceFolder);
                    const sourceAbstract = app.vault.getAbstractFileByPath(normalizedSource);
                    if (!isValidBookSourceFolder(sourceAbstract)) {
                        new Notice(`Source folder not found: ${normalizedSource}`);
                        return;
                    }

                    const suggestedDraftName = suggestNextDraftLabel(app.vault, normalizedSource);
                    new CreateDraftModal(
                        app,
                        suggestedDraftName,
                        (candidateDraftName) => resolveDraftTarget(app.vault, normalizedSource, candidateDraftName).destinationPath,
                        async ({ draftName, switchToNewDraft }) => {
                        if (creatingDraft) return false;
                        setDraftButtonState(true);

                        try {
                            const { destinationPath, draftLabel } = resolveDraftTarget(app.vault, normalizedSource, draftName);
                            await copyFolderRecursive(app.vault, normalizedSource, destinationPath);

                            const cloneBase = {
                                ...book,
                                lastUsedPandocLayoutByPreset: undefined
                            };
                            const newBook = normalizeBookProfile({
                                ...cloneBase,
                                id: createBookId(),
                                title: getDraftDisplayTitle(label, draftLabel),
                                sourceFolder: destinationPath
                            });

                            plugin.settings.books = [...(plugin.settings.books || []), newBook];
                            if (switchToNewDraft) {
                                plugin.settings.activeBookId = newBook.id;
                            }
                            await plugin.persistBookSettings();
                            renderBooksManager();
                            new Notice(`Draft created: ${destinationPath}`);
                            return true;
                        } catch (error) {
                            const msg = error instanceof Error ? error.message : String(error);
                            new Notice(`Draft creation failed: ${msg}`);
                            return false;
                        } finally {
                            setDraftButtonState(false);
                        }
                    }).open();
                });
            });

            row.addText(text => {
                text.setPlaceholder('Source folder').setValue(book.sourceFolder || '');
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
                            book.sourceFolder = normalizedValue;
                            await plugin.persistBookSettings();
                            updateAddBtnPulse();
                            inputEl.addClass('ert-setting-input-success');
                            window.setTimeout(() => { inputEl.removeClass('ert-setting-input-success'); renderBooksManager(); }, 1000);
                        } else {
                            inputEl.addClass('ert-setting-input-error');
                            window.setTimeout(() => inputEl.removeClass('ert-setting-input-error'), 2000);
                        }
                    } else {
                        book.sourceFolder = '';
                        await plugin.persistBookSettings();
                        updateAddBtnPulse();
                        inputEl.addClass('ert-setting-input-success');
                        window.setTimeout(() => { inputEl.removeClass('ert-setting-input-success'); renderBooksManager(); }, 1000);
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

            row.addExtraButton(button => {
                button.setIcon('trash-2');
                button.setTooltip('Remove profile (files are not deleted)');
                button.extraSettingsEl.addClass('rt-book-card__trash');
                if (books.length <= 1) {
                    button.setDisabled(true);
                    button.extraSettingsEl.addClass('is-disabled');
                } else {
                    button.onClick(async () => {
                        plugin.settings.books = books.filter(b => b.id !== book.id);
                        if (book.id === plugin.settings.activeBookId) {
                            plugin.settings.activeBookId = plugin.settings.books[0]?.id;
                        }
                        await plugin.persistBookSettings();
                        renderBooksManager();
                    });
                }
            });
        });

        // Update pulse state after render
        updateAddBtnPulse();
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
