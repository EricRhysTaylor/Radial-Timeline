import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getActivePlanetaryProfile, convertFromEarth } from '../utils/planetaryTime';
import type { TimelineItem } from '../types';

export interface TimelineSearchMatchOptions {
    includeCurrentSceneAnalysis?: boolean;
    planetaryLine?: string;
}

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

// Format date for matching the visible hover title date.
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

function appendSearchValue(fields: string[], value: unknown): void {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
        value.forEach(item => appendSearchValue(fields, item));
        return;
    }
    const text = String(value).trim();
    if (text) fields.push(text);
}

export function buildTimelineSearchTextFields(scene: TimelineItem, options: TimelineSearchMatchOptions = {}): string[] {
    const fields: string[] = [];

    appendSearchValue(fields, scene.title);
    appendSearchValue(fields, scene.synopsis);
    appendSearchValue(fields, scene.Character);
    appendSearchValue(fields, scene.subplot);
    appendSearchValue(fields, scene.Duration);

    if (options.includeCurrentSceneAnalysis) {
        appendSearchValue(fields, scene["currentSceneAnalysis"]);
    }

    appendSearchValue(fields, options.planetaryLine);

    return fields;
}

export function timelineSceneMatchesSearch(scene: TimelineItem, phrase: string, options: TimelineSearchMatchOptions = {}): boolean {
    const textMatched = buildTimelineSearchTextFields(scene, options)
        .some(field => containsWholePhrase(field, phrase, false));
    if (textMatched) return true;

    const dateFieldNumeric = scene.when?.toLocaleDateString();
    const dateFieldDisplay = formatDateForDisplay(scene.when);
    return containsWholePhrase(dateFieldNumeric, phrase, true) ||
        containsWholePhrase(dateFieldDisplay, phrase, false);
}

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

        // Get active planetary profile for planetary line search
        const planetaryProfile = getActivePlanetaryProfile(this.plugin.settings as any);
        
        this.plugin.getSceneData().then(scenes => {
            scenes.forEach(scene => {
                let planetaryLine: string | undefined;
                // Add planetary line text if planetary time is enabled and scene has a When date
                if (planetaryProfile && scene.when) {
                    const conversion = convertFromEarth(scene.when, planetaryProfile);
                    if (conversion) {
                        const label = (planetaryProfile.label || 'LOCAL').toUpperCase();
                        planetaryLine = `${label}: ${conversion.formatted}`;
                    }
                }
                
                const matched = timelineSceneMatchesSearch(scene, this.plugin.searchTerm, {
                    includeCurrentSceneAnalysis: !!this.plugin.settings.enableAiSceneAnalysis,
                    planetaryLine
                });
                if (matched && scene.path) this.plugin.searchResults.add(scene.path);
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
