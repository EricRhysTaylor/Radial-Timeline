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

        // Helper to format date for display matching what's shown in the synopsis
        const formatDateForDisplay = (when: Date | undefined): string => {
            if (!when || !(when instanceof Date)) return '';
            try {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const month = months[when.getMonth()];
                const day = when.getDate();
                const year = when.getFullYear();
                const hours = when.getHours();
                const minutes = when.getMinutes();
                let dateStr = `${month} ${day}, ${year}`;
                if (hours === 0 && minutes === 0) {
                    dateStr += ` @ Midnight`;
                } else if (hours === 12 && minutes === 0) {
                    dateStr += ` @ Noon`;
                } else {
                    const period = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
                    if (minutes === 0) {
                        dateStr += ` @ ${displayHours}${period}`;
                    } else {
                        dateStr += ` @ ${displayHours}:${String(minutes).padStart(2, '0')}${period}`;
                    }
                }
                return dateStr;
            } catch (e) {
                return '';
            }
        };

        this.plugin.getSceneData().then(scenes => {
            scenes.forEach(scene => {
                const povText = Array.isArray(scene.pov)
                    ? scene.pov.join(', ')
                    : scene.pov;
                const textFields: (string | undefined)[] = [
                    scene.title,
                    scene.synopsis,
                    ...(scene.Character || []),
                    scene.subplot,
                    scene.location,
                    povText,
                    scene.Duration
                ];
                const textMatched = textFields.some(f => containsWholePhrase(f, term, false));
                // Check both the numeric date format and the display format
                const dateFieldNumeric = scene.when?.toLocaleDateString();
                const dateFieldDisplay = formatDateForDisplay(scene.when);
                const dateMatched = containsWholePhrase(dateFieldNumeric, term, true) || 
                                   containsWholePhrase(dateFieldDisplay, term, false);
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

