/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { AuthorProgressSettings } from '../types/settings';
import { getPresetPalettes, generatePaletteFromColor, type AprPalette } from '../utils/aprPaletteGenerator';

export class AprPaletteModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private settings: AuthorProgressSettings;
    private onApply: (palette: AprPalette) => void;

    constructor(app: App, plugin: RadialTimelinePlugin, settings: AuthorProgressSettings, onApply: (palette: AprPalette) => void) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.onApply = onApply;
    }

    onOpen(): void {
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('Color Palette');
        
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-modal-shell');
            modalEl.style.width = '600px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container');

        const applyPalette = async (palette: AprPalette) => {
            if (!this.plugin.settings.authorProgress) return;
            this.plugin.settings.authorProgress.aprBookAuthorColor = palette.bookTitle;
            this.plugin.settings.authorProgress.aprAuthorColor = palette.authorName;
            this.plugin.settings.authorProgress.aprPercentNumberColor = palette.percentNumber;
            this.plugin.settings.authorProgress.aprPercentSymbolColor = palette.percentSymbol;
            await this.plugin.saveSettings();
            this.onApply(palette);
            this.close();
        };

        // Generate from Color Section (moved to top)
        const generateCard = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-palette-generate-card' });
        generateCard.createEl('h4', { text: 'Generate from Book Title Color', cls: 'rt-section-title' });

        const currentBookColor = this.settings?.aprBookAuthorColor || '#6FB971';
        const schemes: Array<{ value: 'analogous' | 'complementary' | 'triadic' | 'monochromatic'; label: string }> = [
            { value: 'analogous', label: 'Analogous (adjacent colors)' },
            { value: 'complementary', label: 'Complementary (opposite colors)' },
            { value: 'triadic', label: 'Triadic (three-way split)' },
            { value: 'monochromatic', label: 'Monochromatic (tints & shades)' }
        ];

        schemes.forEach(({ value, label }) => {
            const schemeSetting = new Setting(generateCard)
                .setName(label)
                .setDesc('');
            
            const generated = generatePaletteFromColor(currentBookColor, value);
            const swatches = schemeSetting.controlEl.createDiv({ cls: 'rt-apr-palette-swatches rt-apr-palette-swatches-generate' });
            [generated.bookTitle, generated.authorName, generated.percentNumber, generated.percentSymbol].forEach(color => {
                const swatch = swatches.createDiv({ cls: 'rt-apr-palette-swatch rt-apr-palette-swatch-generate' });
                swatch.style.backgroundColor = color; // SAFE: inline style used for dynamic color preview swatch
            });
            
            schemeSetting.addButton(button => {
                button.setButtonText('Apply');
                button.setCta();
                button.onClick(() => applyPalette(generated));
            });
        });

        // Preset Palettes Section
        const presetsCard = contentEl.createDiv({ cls: 'rt-glass-card' });
        presetsCard.createEl('h4', { text: 'Preset Palettes', cls: 'rt-section-title' });
        presetsCard.createDiv({ text: 'Choose from curated color combinations.', cls: 'ert-modal-desc' });

        const presets = getPresetPalettes();
        const presetsGrid = presetsCard.createDiv({ cls: 'rt-apr-palette-grid' });
        
        presets.forEach(palette => {
            const paletteCard = presetsGrid.createDiv({ cls: 'rt-apr-palette-card' });
            paletteCard.createEl('div', { text: palette.name, cls: 'rt-apr-palette-name' });
            
            const swatches = paletteCard.createDiv({ cls: 'rt-apr-palette-swatches' });
            [palette.bookTitle, palette.authorName, palette.percentNumber, palette.percentSymbol].forEach(color => {
                const swatch = swatches.createDiv({ cls: 'rt-apr-palette-swatch' });
                swatch.style.backgroundColor = color; // SAFE: inline style used for dynamic color preview swatch
            });
            
            const applyBtn = new ButtonComponent(paletteCard)
                .setButtonText('Apply')
                .setCta()
                .onClick(() => applyPalette(palette));
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
