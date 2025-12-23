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
        
        // Add Pulse styles
        modalEl.classList.add('rt-pulse-modal-shell', 'rt-subplot-modal-shell');
        contentEl.addClass('rt-subplot-modal');
        contentEl.addClass('rt-manuscript-surface');

        // Hero Section
        const hero = contentEl.createDiv({ cls: 'rt-pulse-progress-hero' });
        hero.createSpan({ text: 'Configuration', cls: 'rt-pulse-hero-badge' });
        hero.createEl('h2', { text: 'Manage Subplots', cls: 'rt-pulse-progress-heading' });
        hero.createDiv({ text: 'Rename or remove subplots across the manuscript.', cls: 'rt-pulse-progress-subtitle' });

        // Stats Placeholder
        this.statsContainer = hero.createDiv({ cls: 'rt-pulse-progress-meta' });
        this.statsContainer.createSpan({ text: 'Loading stats...', cls: 'rt-pulse-hero-meta-item' });

        // Single card container (avoid extra nesting)
        const card = contentEl.createDiv({ cls: 'rt-subplot-management-card rt-pulse-glass-card' });
        this.listContainer = card.createDiv({ cls: 'rt-subplot-management-list' });
        
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
        this.statsContainer.createSpan({ text: `Total Subplots: ${this.subplots.length}`, cls: 'rt-pulse-hero-meta-item' });

        // Clear list
        this.listContainer.empty();
        
        // Header
        const header = this.listContainer.createDiv({ cls: 'rt-pulse-ruler-title rt-subplot-management-header' });
        header.setText('Active Subplots');

        // List Scroll Area
        const scrollArea = this.listContainer.createDiv({ cls: 'rt-subplot-management-scroll' });

        sorted.forEach(subplot => {
            const row = scrollArea.createDiv({ cls: 'rt-subplot-management-row' });
            
            // Left: Name and Count
            const info = row.createDiv({ cls: 'rt-subplot-management-info' });
            
            const nameEl = info.createDiv({ cls: 'rt-pulse-ruler-label rt-subplot-management-name' });
            nameEl.setText(subplot.name);

            const countEl = info.createDiv({ cls: 'rt-pulse-ruler-value rt-subplot-management-count' });
            countEl.setText(`${subplot.count} scenes`);

            // Right: Actions
            const actions = row.createDiv({ cls: 'rt-subplot-management-actions' });

            // Rename Button
            const renameBtn = new ButtonComponent(actions)
                .setTooltip('Rename')
                .setDisabled(subplot.name === "Main Plot")
                .onClick(() => this.handleRename(subplot.name));
            
            // Create separate element for SVG to avoid innerHTML on button
            const pencilIcon = document.createElement('span');
            pencilIcon.innerHTML = PENCIL_ICON; // SAFE: innerHTML used for SVG icon
            renameBtn.buttonEl.appendChild(pencilIcon);
            
            renameBtn.buttonEl.classList.add('rt-pulse-icon-button', 'rt-subplot-management-btn');

            // Delete Button (Disable for Main Plot)
            const isMainPlot = subplot.name === "Main Plot";
            const deleteBtn = new ButtonComponent(actions)
                .setTooltip(isMainPlot ? 'Main Plot cannot be deleted' : 'Delete')
                .setDisabled(isMainPlot)
                .onClick(() => this.handleDelete(subplot.name));
            
            const eraserIcon = document.createElement('span');
            eraserIcon.innerHTML = ERASER_ICON; // SAFE: innerHTML used for SVG icon
            deleteBtn.buttonEl.appendChild(eraserIcon);

            deleteBtn.buttonEl.classList.add('rt-pulse-icon-button', 'rt-subplot-management-btn', 'rt-subplot-management-delete-btn');
            
            if (isMainPlot) {
                deleteBtn.buttonEl.classList.add('rt-subplot-management-disabled');
                renameBtn.buttonEl.classList.add('rt-subplot-management-disabled');
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
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        modalEl.classList.add('rt-pulse-modal-shell');
        contentEl.addClass('rt-pulse-modal');

        if (modalEl) {
            modalEl.style.width = '600px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '90vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        const hero = contentEl.createDiv({ cls: 'rt-pulse-progress-hero' });
        hero.createSpan({ text: 'Warning', cls: 'rt-pulse-hero-badge' });
        hero.createEl('h2', { text: 'Remove Subplot?', cls: 'rt-pulse-progress-heading' });
        hero.createDiv({ text: 'This action cannot be undone.', cls: 'rt-pulse-progress-subtitle' });
        const meta = hero.createDiv({ cls: 'rt-pulse-progress-meta' });
        meta.createSpan({ text: 'Scenes in only this subplot will be moved to Main Plot', cls: 'rt-pulse-hero-meta-item' });

        const card = contentEl.createDiv({ cls: 'rt-pulse-glass-card rt-pulse-section-gap' });
        const warningEl = card.createDiv({ cls: 'rt-pulse-warning' });
        warningEl.setText(`Are you sure you want to remove "${this.subplotName}" from the manuscript?`);

        const buttonRow = contentEl.createDiv({ cls: 'rt-pulse-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        new ButtonComponent(buttonRow)
            .setButtonText('Remove Subplot')
            .setWarning() // Sets red style usually
            .onClick(async () => {
                await this.onConfirm();
                this.close();
            });
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
        
        modalEl.classList.add('rt-pulse-modal-shell');
        contentEl.addClass('rt-pulse-modal');

        const hero = contentEl.createDiv({ cls: 'rt-pulse-progress-hero' });
        hero.createSpan({ text: 'Edit', cls: 'rt-pulse-hero-badge' });
        hero.createEl('h2', { text: 'Rename Subplot', cls: 'rt-pulse-progress-heading' });

        const card = contentEl.createDiv({ cls: 'rt-pulse-glass-card rt-pulse-section-gap' });
        
        const inputContainer = card.createDiv({ cls: 'rt-pulse-info' });
        inputContainer.createDiv({ text: `Rename "${this.oldName}" to:`, cls: 'rt-subplot-management-input-label' });
        
        const inputEl = inputContainer.createEl('input', { type: 'text', value: this.oldName, cls: 'rt-subplot-management-input' });

        // Focus input
        window.setTimeout(() => inputEl.focus(), 50);

        const buttonRow = contentEl.createDiv({ cls: 'rt-pulse-actions' });
        
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
            .setButtonText('Cancel')
            .onClick(() => this.close());

        const saveBtn = new ButtonComponent(buttonRow)
            .setButtonText('Rename')
            .setCta()
            .onClick(save);
        
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
