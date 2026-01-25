/*
 * Manage Subplots Modal
 * 
 * A specialized modal for managing subplots (rename, delete) with a custom UI 
 * that matches the Gossamer/Pulse aesthetic.
 */

import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { SubplotManagementService, SubplotStats } from '../services/SubplotManagementService';

// SVGs
const ERASER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser-icon lucide-eraser"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/></svg>`;
const PENCIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil-line-icon lucide-pencil-line"><path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`;

export class ManageSubplotsModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: SubplotManagementService;
    private subplots: SubplotStats[] = [];
    
    // UI Elements
    private statsContainer: HTMLElement | null = null;
    private listContainer: HTMLElement | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        // Instantiate service on demand, or could be passed in
        // Ideally checking if plugin has it, but for now new instance is fine as it's stateless-ish (depends on app/sceneDataService)
        this.service = new SubplotManagementService(app, (plugin as any).sceneDataService);
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Apply generic modal shell + modal-specific class
        modalEl.classList.add('ert-ui', 'ert-modal-shell');
        contentEl.addClass('ert-modal-container', 'rt-manage-subplots-modal');

        // Hero Section (generic header)
        const hero = contentEl.createDiv({ cls: 'ert-modal-header' });
        hero.createSpan({ text: 'Configuration', cls: 'ert-modal-badge' });
        hero.createDiv({ text: 'Manage Subplots', cls: 'ert-modal-title' });
        hero.createDiv({ text: 'Rename or remove subplots across the timeline. Orphaned scenes will be moved to Main Plot.', cls: 'ert-modal-subtitle' });

        // Stats Placeholder
        this.statsContainer = hero.createDiv({ cls: 'ert-modal-meta' });
        this.statsContainer.createSpan({ text: 'Loading stats...', cls: 'ert-modal-meta-item' });

        // Single card container (avoid extra nesting)
        const card = contentEl.createDiv({ cls: 'rt-manage-subplots-card rt-glass-card' });
        this.listContainer = card.createDiv({ cls: 'rt-manage-subplots-list' });
        
        // Initial load
        this.loadSubplots();
    }

    async loadSubplots() {
        this.subplots = await this.service.getSubplotStats();
        this.renderList();
    }

    renderList() {
        if (!this.listContainer || !this.statsContainer) return;

        // Sort: Main Plot first, then by count (desc), then name
        const sorted = [...this.subplots].sort((a, b) => {
            if (a.name === "Main Plot") return -1;
            if (b.name === "Main Plot") return 1;
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });

        // Update Stats
        this.statsContainer.empty();
        this.statsContainer.createSpan({ text: `Total Subplots: ${this.subplots.length}`, cls: 'ert-modal-meta-item' });

        // Clear list
        this.listContainer.empty();
        
        // Header
        const header = this.listContainer.createDiv({ cls: 'rt-manage-subplots-header' });
        header.setText('Active Subplots');

        // List Scroll Area
        const scrollArea = this.listContainer.createDiv({ cls: 'rt-manage-subplots-scroll' });

        sorted.forEach(subplot => {
            const row = scrollArea.createDiv({ cls: 'rt-manage-subplots-row' });
            
            // Left: Name and Count
            const info = row.createDiv({ cls: 'rt-manage-subplots-info' });
            
            const nameEl = info.createDiv({ cls: 'rt-manage-subplots-name' });
            nameEl.setText(subplot.name);

            const countEl = info.createDiv({ cls: 'rt-manage-subplots-count' });
            countEl.setText(`${subplot.count} scenes`);

            // Right: Actions
            const actions = row.createDiv({ cls: 'rt-manage-subplots-actions' });

            // Rename Button
            const renameBtn = new ButtonComponent(actions)
                .setTooltip('Rename')
                .setDisabled(subplot.name === "Main Plot")
                .onClick(() => this.handleRename(subplot.name));
            
            // Create separate element for SVG to avoid innerHTML on button
            const pencilIcon = document.createElement('span');
            pencilIcon.innerHTML = PENCIL_ICON; // SAFE: innerHTML used for SVG icon
            renameBtn.buttonEl.appendChild(pencilIcon);
            
            renameBtn.buttonEl.classList.add('rt-pulse-icon-button', 'rt-manage-subplots-btn');

            // Delete Button (Disable for Main Plot)
            const isMainPlot = subplot.name === "Main Plot";
            const deleteBtn = new ButtonComponent(actions)
                .setTooltip(isMainPlot ? 'Main Plot cannot be deleted' : 'Delete')
                .setDisabled(isMainPlot)
                .onClick(() => this.handleDelete(subplot.name));
            
            const eraserIcon = document.createElement('span');
            eraserIcon.innerHTML = ERASER_ICON; // SAFE: innerHTML used for SVG icon
            deleteBtn.buttonEl.appendChild(eraserIcon);

            deleteBtn.buttonEl.classList.add('rt-pulse-icon-button', 'rt-manage-subplots-btn', 'rt-manage-subplots-delete-btn');
            
            if (isMainPlot) {
                deleteBtn.buttonEl.classList.add('rt-manage-subplots-disabled');
                renameBtn.buttonEl.classList.add('rt-manage-subplots-disabled');
            }
        });
    }

    async handleRename(oldName: string) {
        new RenameSubplotModal(this.app, oldName, async (newName) => {
             if (newName && newName !== oldName) {
                await this.service.renameSubplot(oldName, newName);
                await this.loadSubplots();
             }
        }).open();
    }

    async handleDelete(subplotName: string) {
        new SubplotDeletionConfirmModal(this.app, subplotName, async () => {
            await this.service.deleteSubplot(subplotName);
            await this.loadSubplots();
        }).open();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Confirmation Modal for Deletion
 */
class SubplotDeletionConfirmModal extends Modal {
    private subplotName: string;
    private onConfirm: () => Promise<void>;

    constructor(app: App, subplotName: string, onConfirm: () => Promise<void>) {
        super(app);
        this.subplotName = subplotName;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('');
        
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-modal-shell');
            modalEl.style.width = '600px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        // Header
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Warning' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Remove subplot?' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'This action cannot be undone.' });
        const meta = header.createDiv({ cls: 'ert-modal-meta' });
        meta.createSpan({ cls: 'ert-modal-meta-item', text: 'Scenes in only this subplot will be moved to Main Plot' });

        // Warning card
        const card = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass' });
        const warningEl = card.createDiv({ cls: 'rt-pulse-warning' });
        warningEl.setText(`Are you sure you want to remove "${this.subplotName}" from the timeline?`);

        // Actions
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('Remove subplot')
            .setWarning()
            .onClick(async () => {
                await this.onConfirm();
                this.close();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}

/**
 * Modal for Renaming
 */
class RenameSubplotModal extends Modal {
    private oldName: string;
    private onRename: (newName: string) => Promise<void>;

    constructor(app: App, oldName: string, onRename: (newName: string) => Promise<void>) {
        super(app);
        this.oldName = oldName;
        this.onRename = onRename;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Shell & Container (matching PlanetaryTimeModal)
        modalEl.classList.add('ert-ui', 'ert-modal-shell', 'rt-rename-subplot-modal');
        contentEl.addClass('ert-modal-container');

        // Header (matching PlanetaryTimeModal)
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Edit' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Rename Subplot' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: `Enter a new name for "${this.oldName}"` });

        // Input Field (Large template input field style)
        // Container with border
        const inputContainer = contentEl.createDiv({ 
            cls: 'ert-search-input-container',
        });
        
        const inputEl = inputContainer.createEl('input', { 
            type: 'text', 
            value: this.oldName, 
            cls: 'rt-input-full' 
        });

        // Focus input
        window.setTimeout(() => inputEl.focus(), 50);

        // Actions
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        
        const save = async () => {
            const val = inputEl.value.trim();
            if (val && val !== this.oldName) {
                await this.onRename(val);
                this.close();
            } else if (val === this.oldName) {
                this.close();
            }
        };

        new ButtonComponent(buttonRow)
            .setButtonText('Rename')
            .setCta()
            .onClick(save);

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
        
        // Handle Enter key
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
