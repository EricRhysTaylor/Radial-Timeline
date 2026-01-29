import { App, Modal, Notice, TextComponent, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getActivePlanetaryProfile, convertFromEarth } from '../utils/planetaryTime';

export class SearchService {
    private plugin: RadialTimelinePlugin;
    private app: App;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    openSearchPrompt(): void {
        const modal = new Modal(this.app);
        const { modalEl, contentEl } = modal;
        
        // Apply generic modal shell + modal-specific class
        modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
        contentEl.empty();
        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-search-modal');
        
        // Header
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ text: 'Find', cls: 'ert-modal-badge' });
        header.createDiv({ text: 'Search timeline', cls: 'ert-modal-title' });
        header.createDiv({ text: 'Search scenes by title, synopsis, characters, dates, and more.', cls: 'ert-modal-subtitle' });
        
        // Search input container
        const searchContainer = contentEl.createDiv({ cls: 'ert-search-input-container' });
        const searchInput = new TextComponent(searchContainer);
        searchInput.setPlaceholder('Enter search term (min 3 letters)');
        searchInput.inputEl.classList.add('ert-search-input');
        if (this.plugin.searchActive && this.plugin.searchTerm) searchInput.setValue(this.plugin.searchTerm);
        
        // Validation helper - shows red border if input is invalid
        const validateInput = (): boolean => {
            const term = searchInput.getValue().trim();
            if (term.length > 0 && term.length < 3) {
                searchInput.inputEl.classList.add('rt-input-error');
                return false;
            } else {
                searchInput.inputEl.classList.remove('rt-input-error');
                return true;
            }
        };
        
        // SAFE: Modal classes don't have registerDomEvent; cleanup via DOM removal on modal close
        searchInput.inputEl.addEventListener('blur', () => {
            validateInput();
        });
        
        // Actions
        const buttonContainer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(buttonContainer)
            .setButtonText('Search')
            .setCta()
            .onClick(() => {
                const term = searchInput.getValue().trim();
                if (term.length >= 3) { 
                    searchInput.inputEl.classList.remove('rt-input-error');
                    this.performSearch(term); 
                    modal.close(); 
                } else { 
                    searchInput.inputEl.classList.add('rt-input-error');
                    new Notice('Please enter at least 3 letters to search'); 
                }
            });
        new ButtonComponent(buttonContainer)
            .setButtonText('Reset')
            .onClick(() => { searchInput.setValue(''); searchInput.inputEl.classList.remove('rt-input-error'); this.clearSearch(); modal.close(); });
        // SAFE: Modal classes don't have registerDomEvent; cleanup via DOM removal on modal close
        searchInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const term = searchInput.getValue().trim();
                if (term.length >= 3) { 
                    searchInput.inputEl.classList.remove('rt-input-error');
                    this.performSearch(term); 
                    modal.close(); 
                } else { 
                    searchInput.inputEl.classList.add('rt-input-error');
                    new Notice('Please enter at least 3 letters to search'); 
                }
            }
        });
        
        modal.open();
        // Focus input after modal opens
        window.setTimeout(() => searchInput.inputEl.focus(), 50);
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

        // Get active planetary profile for planetary line search
        const planetaryProfile = getActivePlanetaryProfile(this.plugin.settings as any);
        
        this.plugin.getSceneData().then(scenes => {
            // Get enabled hover metadata fields for search indexing
            const enabledHoverFields = (this.plugin.settings.hoverMetadataFields || [])
                .filter(f => f.enabled)
                .map(f => f.key);
            
            scenes.forEach(scene => {
                const povText = scene.pov ? String(scene.pov) : '';
                // Include hover-visible text so squares highlight when hover text matches
                const textFields: (string | undefined)[] = [
                    scene.title,
                    scene.synopsis,
                    ...(scene.Character || []),
                    scene.subplot,
                    scene.place,
                    povText,
                    scene.Duration,
                    scene["currentSceneAnalysis"],
                    scene["previousSceneAnalysis"],
                    scene["nextSceneAnalysis"]
                ];
                
                // Add enabled custom hover metadata fields to search index
                if (scene.rawFrontmatter && enabledHoverFields.length > 0) {
                    enabledHoverFields.forEach(key => {
                        const val = scene.rawFrontmatter?.[key];
                        if (val !== undefined && val !== null) {
                            if (Array.isArray(val)) {
                                val.forEach(item => textFields.push(String(item)));
                            } else {
                                textFields.push(String(val));
                            }
                        }
                    });
                }
                
                // Add planetary line text if planetary time is enabled and scene has a When date
                if (planetaryProfile && scene.when) {
                    const conversion = convertFromEarth(scene.when, planetaryProfile);
                    if (conversion) {
                        const label = (planetaryProfile.label || 'LOCAL').toUpperCase();
                        textFields.push(`${label}: ${conversion.formatted}`);
                    }
                }
                
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
