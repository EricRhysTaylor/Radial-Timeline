import { App, Modal, Notice, TextComponent, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';

export class SearchService {
    private plugin: RadialTimelinePlugin;
    private app: App;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    openSearchPrompt(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Search timeline');
        const contentEl = modal.contentEl;
        contentEl.empty();
        const searchContainer = contentEl.createDiv('search-container');
        searchContainer.classList.add('flex-container');
        searchContainer.classList.add('radial-timeline-search');
        const searchInput = new TextComponent(searchContainer);
        searchInput.setPlaceholder('Enter search term (min 3 letters)');
        searchInput.inputEl.classList.add('search-input');
        if (this.plugin.searchActive && this.plugin.searchTerm) searchInput.setValue(this.plugin.searchTerm);
        const buttonContainer = contentEl.createDiv('rt-button-container');
        new ButtonComponent(buttonContainer)
            .setButtonText('Search')
            .onClick(() => {
                const term = searchInput.getValue().trim();
                if (term.length >= 3) { this.performSearch(term); modal.close(); }
                else { new Notice('Please enter at least 3 letters to search'); }
            });
        new ButtonComponent(buttonContainer)
            .setButtonText('Reset')
            .onClick(() => { searchInput.setValue(''); this.clearSearch(); modal.close(); });
        this.plugin.registerDomEvent(searchInput.inputEl, 'keydown', (e) => {
            if (e.key === 'Enter') {
                const term = searchInput.getValue().trim();
                if (term.length >= 3) { this.performSearch(term); modal.close(); }
                else { new Notice('Please enter at least 3 letters to search'); }
            }
        });
        modal.open();
    }

    performSearch(term: string): void {
        if (!term || term.trim().length === 0) { this.clearSearch(); return; }
        this.plugin.searchTerm = term;
        this.plugin.searchActive = true;
        this.plugin.searchResults.clear();

        const containsWholePhrase = (haystack: string | undefined, phrase: string, isDate: boolean = false): boolean => {
            if (!haystack || !phrase || typeof haystack !== 'string') return false;
            const h = haystack.toLowerCase();
            const p = phrase.toLowerCase();
            if (isDate && h.includes('/')) {
                const datePattern = new RegExp(p.replace(/\//g, '\\/') + '(?:\\/|$)', 'i');
                return datePattern.test(h);
            }
            return h.includes(p);
        };

        this.plugin.getSceneData().then(scenes => {
            scenes.forEach(scene => {
                const textFields: (string | undefined)[] = [
                    scene.title,
                    scene.synopsis,
                    ...(scene.Character || []),
                    scene.subplot,
                    scene.location,
                    scene.pov
                ];
                const textMatched = textFields.some(f => containsWholePhrase(f, term, false));
                const dateField = scene.when?.toLocaleDateString();
                const dateMatched = containsWholePhrase(dateField, term, true);
                if (textMatched || dateMatched) { if (scene.path) this.plugin.searchResults.add(scene.path); }
            });
            const timelineViews = this.plugin.getTimelineViews();
            timelineViews.forEach(view => view.refreshTimeline());
        });
    }

    clearSearch(): void {
        this.plugin.searchActive = false;
        this.plugin.searchTerm = '';
        this.plugin.searchResults.clear();
        const timelineViews = this.plugin.getTimelineViews();
        timelineViews.forEach(view => view.refreshTimeline());
    }
}


