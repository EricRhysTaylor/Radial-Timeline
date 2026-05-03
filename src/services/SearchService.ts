import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getActivePlanetaryProfile, convertFromEarth } from '../utils/planetaryTime';
import { getBeatConfigForItem } from '../utils/beatsTemplates';

export class SearchService {
    private plugin: RadialTimelinePlugin;
    private app: App;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    openSearchPrompt(): void {
        void this.focusTimelineSearchInput();
    }

    private async focusTimelineSearchInput(): Promise<void> {
        let views = this.plugin.getTimelineViews();
        if (views.length === 0) {
            await this.plugin.getTimelineService().activateView();
            views = this.plugin.getTimelineViews();
        }

        const activeLeafView = this.app.workspace.activeLeaf?.view;
        const targetView = views.find(view => view === activeLeafView) || views[0];
        if (!targetView) {
            new Notice('Open the timeline view to search scenes.');
            return;
        }

        window.setTimeout(() => targetView.focusTimelineSearchInput(), 50);
    }

    private syncTimelineSearchControls(): void {
        this.plugin.getTimelineViews().forEach(view => view.syncTimelineSearchControl());
    }

    performSearch(term: string): void {
        if (!term || term.trim().length === 0) { this.clearSearch(); return; }
        this.plugin.searchTerm = term.trim();
        this.plugin.searchActive = true;
        this.plugin.searchResults.clear();
        this.syncTimelineSearchControls();

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
        const readFrontmatterFieldValue = (fm: Record<string, unknown> | undefined, key: string): unknown => {
            if (!fm) return undefined;
            if (Object.prototype.hasOwnProperty.call(fm, key)) return fm[key];
            const target = key.toLowerCase().replace(/[\s_-]/g, '');
            for (const [fmKey, value] of Object.entries(fm)) {
                if (fmKey.toLowerCase().replace(/[\s_-]/g, '') === target) return value;
            }
            return undefined;
        };
        
        this.plugin.getSceneData().then(scenes => {
            // Get enabled hover metadata fields for search indexing
            const enabledSceneHoverKeys = (this.plugin.settings.hoverMetadataFields || [])
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
                
                // Add enabled custom hover metadata fields to search index (per-item for beats)
                const isBeatItem = scene.itemType === 'Beat' || scene.itemType === 'Plot';
                const beatModelForHover = (() => {
                    const raw = scene.rawFrontmatter?.['Beat Model'];
                    if (typeof raw === 'string' && raw.trim().length > 0) return raw;
                    const normalized = scene['Beat Model'];
                    if (typeof normalized === 'string' && normalized.trim().length > 0) return normalized;
                    return undefined;
                })();
                const enabledHoverFields = isBeatItem
                    ? getBeatConfigForItem(this.plugin.settings, beatModelForHover)
                        .beatHoverMetadataFields.filter(f => f.enabled).map(f => f.key)
                    : enabledSceneHoverKeys;
                if (scene.rawFrontmatter && enabledHoverFields.length > 0) {
                    enabledHoverFields.forEach(key => {
                        const val = readFrontmatterFieldValue(scene.rawFrontmatter as Record<string, unknown>, key);
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
                
                const textMatched = textFields.some(f => containsWholePhrase(f, this.plugin.searchTerm, false));
                // Check both the numeric date format and the display format
                const dateFieldNumeric = scene.when?.toLocaleDateString();
                const dateFieldDisplay = formatDateForDisplay(scene.when);
                const dateMatched = containsWholePhrase(dateFieldNumeric, this.plugin.searchTerm, true) || 
                                   containsWholePhrase(dateFieldDisplay, this.plugin.searchTerm, false);
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
        this.syncTimelineSearchControls();
        const timelineViews = this.plugin.getTimelineViews();
        timelineViews.forEach(view => view.refreshTimeline());
    }
}
