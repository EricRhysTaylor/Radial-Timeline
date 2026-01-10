import type { App } from 'obsidian';
import { Setting as ObsidianSetting, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { t } from '../../i18n';
import { addWikiLink } from '../wikiLink';
import { getAllScenes } from '../../utils/manuscript';
import type { CompletionEstimate } from '../../services/TimelineMetricsService';

export function renderPublicationSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    const pubHeading = new ObsidianSetting(containerEl)
        .setName('Publication and progress')
        .setHeading();
    addWikiLink(pubHeading, 'Settings#publication');

    // --- Target Completion Date ---
    new ObsidianSetting(containerEl)
        .setName('Target completion date')
        .setDesc('Set a target date for project completion (YYYY-MM-DD). This will be shown on the timeline.')
        .addText(text => {
            text.inputEl.type = 'date';
            text.inputEl.addClass('rt-input-md'); /* YYYY-MM-DD needs more space */
            text.setValue(plugin.settings.targetCompletionDate || '');

            text.onChange(() => {
                text.inputEl.removeClass('rt-setting-input-error');
            });

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const value = text.getValue();
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (!value) {
                    plugin.settings.targetCompletionDate = undefined;
                    text.inputEl.removeClass('rt-setting-input-error');
                    await plugin.saveSettings();
                    plugin.refreshTimelineIfNeeded(null);
                    return;
                }

                const selectedDate = new Date(value + 'T00:00:00');
                if (selectedDate > today) {
                    plugin.settings.targetCompletionDate = value;
                    text.inputEl.removeClass('rt-setting-input-error');
                } else {
                    new Notice('Target date must be in the future.');
                    text.setValue(plugin.settings.targetCompletionDate || '');
                    return;
                }
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

    // --- Zero draft mode toggle ---
    new ObsidianSetting(containerEl)
        .setName('Zero draft mode')
        .setDesc('Intercept clicks on scenes with Publish Stage = Zero and Status = Complete to capture Pending Edits without opening the scene.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableZeroDraftMode ?? false)
            .onChange(async (value) => {
                plugin.settings.enableZeroDraftMode = value;
                await plugin.saveSettings();
            }));

    // --- Show completion estimate ---
    new ObsidianSetting(containerEl)
        .setName(t('settings.advanced.showEstimate.name'))
        .setDesc(t('settings.advanced.showEstimate.desc'))
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showCompletionEstimate ?? true)
            .onChange(async (value) => {
                plugin.settings.showCompletionEstimate = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));

    // --- Completion estimate window (days) ---
    new ObsidianSetting(containerEl)
        .setName('Completion estimate window (days)')
        .setDesc('Active Publish Stage only. Pace = completed scenes in the last N days ÷ N. Estimate date = remaining scenes ÷ pace. Inactivity colors the date (7/14/21 days) and shows “?” after 21 days of no progress.')
        .addText(text => {
            const current = String(plugin.settings.completionEstimateWindowDays ?? 30);
            text.inputEl.type = 'number';
            text.inputEl.min = '14';
            text.inputEl.max = '90';
            text.inputEl.addClass('rt-input-xs');
            text.setValue(current);

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const raw = Number(text.getValue().trim());
                if (!Number.isFinite(raw)) {
                    text.setValue(String(plugin.settings.completionEstimateWindowDays ?? 30));
                    return;
                }
                const clamped = Math.min(90, Math.max(14, Math.round(raw)));
                plugin.settings.completionEstimateWindowDays = clamped;
                text.setValue(String(clamped));
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { 
                void handleBlur(); 
                void renderCompletionPreview();
            });
        });

    // --- Completion Estimate Preview ---
    const previewContainer = containerEl.createDiv({ cls: 'rt-planetary-preview rt-completion-preview' });
    
    // Quotes for different states
    const startingQuotes = [
        { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
        { text: "Start writing, no matter what. The water does not flow until the faucet is turned on.", author: "Louis L'Amour" },
        { text: "You don't start out writing good stuff. You start out writing crap and thinking it's good stuff, and then gradually you get better at it.", author: "Octavia E. Butler" },
        { text: "The first draft is just you telling yourself the story.", author: "Terry Pratchett" },
        { text: "Begin at the beginning and go on till you come to the end; then stop.", author: "Lewis Carroll" },
    ];
    
    const perseveranceQuotes = [
        { text: "You can always edit a bad page. You can't edit a blank page.", author: "Jodi Picoult" },
        { text: "I write only when inspiration strikes. Fortunately it strikes every morning at nine o'clock sharp.", author: "W. Somerset Maugham" },
        { text: "The hard part about writing a novel is finishing it.", author: "Ernest Hemingway" },
        { text: "A writer is someone for whom writing is more difficult than it is for other people.", author: "Thomas Mann" },
        { text: "Almost all good writing begins with terrible first efforts.", author: "Anne Lamott" },
        { text: "Don't get it right, get it written.", author: "James Thurber" },
        { text: "Writing a book is a horrible, exhausting struggle. One would never undertake such a thing if one were not driven.", author: "George Orwell" },
    ];
    
    function getRandomQuote(quotes: { text: string; author: string }[]): { text: string; author: string } {
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    async function renderCompletionPreview(): Promise<void> {
        previewContainer.empty();
        
        try {
            const scenes = await getAllScenes(app, plugin);
            if (scenes.length === 0) {
                previewContainer.addClass('rt-completion-preview-empty');
                const heading = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading' });
                heading.setText('Completion Estimate');
                const body = previewContainer.createDiv({ cls: 'rt-planetary-preview-body rt-completion-preview-body' });
                
                // Inspiring quote for empty state
                const quote = getRandomQuote(startingQuotes);
                
                const quoteEl = body.createDiv({ cls: 'rt-completion-empty-quote' });
                quoteEl.createDiv({ cls: 'rt-completion-quote-text', text: `"${quote.text}"` });
                quoteEl.createDiv({ cls: 'rt-completion-quote-author', text: `— ${quote.author}` });
                body.createDiv({ cls: 'rt-completion-empty-hint', text: 'Create scenes to see progress calculations.' });
                return;
            }

            // Calculate completion estimate using the plugin's service
            const estimate: CompletionEstimate | null = plugin.calculateCompletionEstimate(scenes);
            
            if (!estimate) {
                previewContainer.removeClass('rt-completion-preview-warn', 'rt-completion-preview-late', 'rt-completion-preview-stalled');
                const heading = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading' });
                heading.setText('Completion Estimate');
                const body = previewContainer.createDiv({ cls: 'rt-planetary-preview-body rt-completion-preview-body' });
                body.createDiv({ cls: 'rt-completion-complete', text: '🎉 All scenes in the active stage are complete!' });
                return;
            }

            // Apply stage color and staleness styling
            previewContainer.removeClass(
                'rt-completion-preview-warn', 'rt-completion-preview-late', 'rt-completion-preview-stalled', 'rt-completion-preview-fresh',
                'rt-completion-stage-Zero', 'rt-completion-stage-Author', 'rt-completion-stage-House', 'rt-completion-stage-Press'
            );
            previewContainer.addClass(`rt-completion-stage-${estimate.stage}`);
            if (estimate.staleness !== 'fresh') {
                previewContainer.addClass(`rt-completion-preview-${estimate.staleness}`);
            }

            const heading = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading' });
            heading.setText(`Completion Estimate • ${estimate.stage} Stage`);

            const body = previewContainer.createDiv({ cls: 'rt-planetary-preview-body rt-completion-preview-body' });

            // Encouragement quote when progress is slowing
            if (estimate.staleness !== 'fresh') {
                const quote = getRandomQuote(perseveranceQuotes);
                const encouragementEl = body.createDiv({ cls: 'rt-completion-encouragement' });
                encouragementEl.createSpan({ cls: 'rt-completion-encouragement-text', text: `"${quote.text}"` });
                encouragementEl.createSpan({ cls: 'rt-completion-encouragement-author', text: ` — ${quote.author}` });
            }

            // Key metrics row
            const metricsRow = body.createDiv({ cls: 'rt-completion-metrics-row' });
            
            // Completed / Total
            const completedMetric = metricsRow.createDiv({ cls: 'rt-completion-metric' });
            completedMetric.createDiv({ cls: 'rt-completion-metric-value', text: `${estimate.total - estimate.remaining}/${estimate.total}` });
            completedMetric.createDiv({ cls: 'rt-completion-metric-label', text: 'Scenes Complete' });

            // Remaining
            const remainingMetric = metricsRow.createDiv({ cls: 'rt-completion-metric' });
            remainingMetric.createDiv({ cls: 'rt-completion-metric-value', text: String(estimate.remaining) });
            remainingMetric.createDiv({ cls: 'rt-completion-metric-label', text: 'Remaining' });

            // Rate
            const rateMetric = metricsRow.createDiv({ cls: 'rt-completion-metric' });
            const rateValue = estimate.rate > 0 ? estimate.rate.toFixed(1) : '—';
            rateMetric.createDiv({ cls: 'rt-completion-metric-value', text: rateValue });
            rateMetric.createDiv({ cls: 'rt-completion-metric-label', text: 'Per Week' });

            // Staleness indicator
            if (estimate.staleness !== 'fresh') {
                const stalenessRow = body.createDiv({ cls: 'rt-completion-staleness-row' });
                const stalenessText = getStalenessMessage(estimate);
                stalenessRow.createSpan({ cls: 'rt-completion-staleness-icon', text: getStalenessIcon(estimate.staleness) });
                stalenessRow.createSpan({ cls: 'rt-completion-staleness-text', text: stalenessText });
            }

            // Estimated completion date
            const dateRow = body.createDiv({ cls: 'rt-completion-date-row' });
            if (estimate.date && estimate.labelText !== '?') {
                const dateFormatter = new Intl.DateTimeFormat('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                dateRow.createDiv({ cls: 'rt-completion-date-label', text: 'Estimated Completion:' });
                dateRow.createDiv({ cls: 'rt-completion-date-value', text: dateFormatter.format(estimate.date) });
                
                // Days until completion
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const daysUntil = Math.ceil((estimate.date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                if (daysUntil > 0) {
                    dateRow.createDiv({ cls: 'rt-completion-days-until', text: `(${daysUntil} days from now)` });
                }
            } else {
                dateRow.createDiv({ cls: 'rt-completion-date-label', text: 'Estimated Completion:' });
                dateRow.createDiv({ cls: 'rt-completion-date-value rt-completion-date-unknown', text: '?' });
                dateRow.createDiv({ cls: 'rt-completion-days-until', text: 'Insufficient data to calculate' });
            }

            // Monthly projection breakdown
            if (estimate.date && estimate.rate > 0) {
                const projectionSection = body.createDiv({ cls: 'rt-completion-projection' });
                const projectionHeading = estimate.labelText === '?' 
                    ? 'Monthly Progress Projection (based on last known pace)'
                    : 'Monthly Progress Projection';
                projectionSection.createDiv({ cls: 'rt-completion-projection-heading', text: projectionHeading });
                
                const projectionGrid = projectionSection.createDiv({ cls: 'rt-completion-projection-grid' });
                renderMonthlyProjection(projectionGrid, estimate);
            }

            // Last progress info
            if (estimate.lastProgressDate) {
                const lastProgressRow = body.createDiv({ cls: 'rt-completion-last-progress' });
                const daysSince = Math.floor((Date.now() - estimate.lastProgressDate.getTime()) / (24 * 60 * 60 * 1000));
                const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
                lastProgressRow.setText(`Last progress: ${dateFormatter.format(estimate.lastProgressDate)} (${daysSince} day${daysSince !== 1 ? 's' : ''} ago) • ${estimate.windowDays}-day rolling window`);
            }

        } catch (e) {
            previewContainer.empty();
            const heading = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading' });
            heading.setText('Completion Estimate');
            const body = previewContainer.createDiv({ cls: 'rt-planetary-preview-body rt-completion-preview-body' });
            body.createDiv({ cls: 'rt-completion-error', text: 'Error calculating estimate.' });
            console.error('Completion estimate preview error:', e);
        }
    }

    function getStalenessIcon(staleness: CompletionEstimate['staleness']): string {
        switch (staleness) {
            case 'warn': return '⚠️';
            case 'late': return '🔴';
            case 'stalled': return '❌';
            default: return '✓';
        }
    }

    function getStalenessMessage(estimate: CompletionEstimate): string {
        if (!estimate.lastProgressDate) return 'No recent progress recorded';
        const daysSince = Math.floor((Date.now() - estimate.lastProgressDate.getTime()) / (24 * 60 * 60 * 1000));
        switch (estimate.staleness) {
            case 'warn': return `Progress slowing (${daysSince} days since last completion)`;
            case 'late': return `Falling behind (${daysSince} days since last completion)`;
            case 'stalled': return `Stalled — no progress in ${daysSince} days`;
            default: return '';
        }
    }

    function renderMonthlyProjection(container: HTMLElement, estimate: CompletionEstimate): void {
        if (!estimate.date || estimate.rate <= 0) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = estimate.date;
        const scenesPerDay = estimate.rate / 7;
        
        let remaining = estimate.remaining;
        let cumulative = estimate.total - estimate.remaining;
        const months: { month: string; added: number; cumulative: number; isLast: boolean }[] = [];
        
        // Start from current month
        let current = new Date(today.getFullYear(), today.getMonth(), 1);
        const maxMonths = 24; // Limit to 2 years
        
        for (let i = 0; i < maxMonths && remaining > 0; i++) {
            const monthStart = new Date(current);
            const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
            
            // Calculate days in this month that fall within our projection
            const projectionStart = i === 0 ? today : monthStart;
            const projectionEnd = monthEnd > targetDate ? targetDate : monthEnd;
            
            if (projectionStart > projectionEnd) {
                current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                continue;
            }
            
            const daysInPeriod = Math.max(0, Math.ceil((projectionEnd.getTime() - projectionStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
            const scenesThisMonth = Math.min(remaining, Math.round(daysInPeriod * scenesPerDay));
            
            if (scenesThisMonth > 0 || i === 0) {
                remaining -= scenesThisMonth;
                cumulative += scenesThisMonth;
                
                const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });
                months.push({
                    month: monthFormatter.format(monthStart),
                    added: scenesThisMonth,
                    cumulative: Math.min(cumulative, estimate.total),
                    isLast: remaining <= 0 || monthEnd >= targetDate
                });
            }
            
            if (monthEnd >= targetDate) break;
            current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }

        // Render the projection table
        if (months.length === 0) return;

        const headerRow = container.createDiv({ cls: 'rt-completion-projection-header' });
        headerRow.createSpan({ text: 'Month' });
        headerRow.createSpan({ text: '+Scenes' });
        headerRow.createSpan({ text: 'Total' });
        headerRow.createSpan({ text: 'Progress' });

        for (let idx = 0; idx < months.length; idx++) {
            const m = months[idx];
            const isFuture = idx > 0; // First month is current, rest are future projections
            const rowClasses = [
                'rt-completion-projection-row',
                m.isLast ? 'rt-completion-projection-final' : '',
                isFuture && estimate.staleness !== 'fresh' ? `rt-completion-projection-${estimate.staleness}` : ''
            ].filter(Boolean).join(' ');
            
            const row = container.createDiv({ cls: rowClasses });
            row.createSpan({ cls: 'rt-completion-projection-month', text: m.month });
            row.createSpan({ cls: 'rt-completion-projection-added', text: `+${m.added}` });
            row.createSpan({ cls: 'rt-completion-projection-cumulative', text: String(m.cumulative) });
            
            const percent = Math.round((m.cumulative / estimate.total) * 100);
            const progressContainer = row.createSpan({ cls: 'rt-completion-projection-progress' });
            const barClasses = [
                'rt-completion-projection-bar',
                isFuture && estimate.staleness !== 'fresh' ? `rt-completion-bar-${estimate.staleness}` : ''
            ].filter(Boolean).join(' ');
            const progressBar = progressContainer.createDiv({ cls: barClasses });
            progressBar.setCssStyles({ width: `${percent}%` });
            progressContainer.createSpan({ cls: 'rt-completion-projection-percent', text: `${percent}%` });
        }
    }

    // Initial render
    void renderCompletionPreview();
}
