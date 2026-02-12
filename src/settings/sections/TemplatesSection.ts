import { App, Notice, Setting as Settings, parseYaml, setIcon, setTooltip, Modal, ButtonComponent, getIconIds, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { TimelineItem } from '../../types';
import { CreateBeatsTemplatesModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem, getCustomSystemFromSettings } from '../../utils/beatsSystems';
import { createBeatTemplateNotes, getMergedBeatYamlTemplate, getBeatConfigForSystem, spreadBeatsAcrossScenes } from '../../utils/beatsTemplates';
import type { BeatSystemConfig } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../defaults';
import { renderMetadataSection } from './MetadataSection';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import type { HoverMetadataField, SavedBeatSystem } from '../../types/settings';
import { isProfessionalActive } from './ProfessionalSection';
import { IconSuggest } from '../IconSuggest';
import { clampActNumber, parseActLabels, resolveActLabel } from '../../utils/acts';
import { ERT_CLASSES, ERT_DATA } from '../../ui/classes';
import { getActiveMigrations, REFACTOR_ALERTS, areAlertMigrationsComplete, dismissAlert, type FieldMigration } from '../refactorAlerts';
import { getScenePrefixNumber } from '../../utils/text';
import { filterBeatsBySystem } from '../../utils/gossamer';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { isStoryBeat } from '../../utils/sceneHelpers';
import { openOrRevealFile } from '../../utils/fileUtils';
import {
    type NoteType,
    extractKeysInOrder as sharedExtractKeysInOrder,
    safeParseYaml as sharedSafeParseYaml,
    getCustomKeys,
    getCustomDefaults,
} from '../../utils/yamlTemplateNormalize';
import { runYamlAudit, collectFilesForAudit, formatAuditReport, type YamlAuditResult, type NoteAuditEntry } from '../../utils/yamlAudit';
import { runYamlBackfill, type BackfillResult } from '../../utils/yamlBackfill';

type TemplateEntryValue = string | string[];
type TemplateEntry = { key: string; value: TemplateEntryValue; required: boolean };
type BeatRow = { name: string; act: number };
type BeatSystemMode = 'template' | 'custom';
type TemplateSystemId = 'save_the_cat' | 'heros_journey' | 'story_grid';

const DEFAULT_HOVER_ICON = 'align-vertical-space-around';
const TEMPLATE_SYSTEMS: Array<{ id: TemplateSystemId; label: string; systemName: string }> = [
    { id: 'save_the_cat', label: 'Save the Cat', systemName: 'Save The Cat' },
    { id: 'heros_journey', label: 'Hero\'s Journey', systemName: 'Hero\'s Journey' },
    { id: 'story_grid', label: 'Story Grid', systemName: 'Story Grid' },
];
const CUSTOM_SYSTEM_OPTION = { id: 'custom' as const, label: 'Custom', systemName: 'Custom' };
const BEAT_SYSTEM_COPY: Record<string, { title: string; description: string; examples?: string }> = {
    'Save The Cat': {
        title: 'Save the Cat',
        description: 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement.',
        examples: 'Examples: The Hunger Games, The Martian, The Fault in Our Stars.'
    },
    'Hero\'s Journey': {
        title: 'Hero\'s Journey',
        description: 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery.',
        examples: 'Examples: The Odyssey, The Hobbit, Harry Potter and the Sorcerer\'s Stone.'
    },
    'Story Grid': {
        title: 'Story Grid',
        description: 'Scene-driven structure built around the 5 Commandments: Inciting Incident, Progressive Complications, Crisis, Climax, Resolution.',
        examples: 'Examples: The Silence of the Lambs, Pride and Prejudice.'
    },
    'Custom': {
        title: 'Custom system',
        description: 'Design your own structural framework for this manuscript. Define the beats that matter to your story — whether they follow a classic arc or track genre-specific progression.\n\nCustom systems can represent tropes, thematic turns, investigative milestones, historical phases, or any structural rhythm you want to measure. Gossamer measures momentum across the structure you create.',
        examples: 'Examples: Romance trope ladder, Mystery clue escalation, Expedition log phases, Political campaign timeline.'
    }
};

/** Lightweight rename modal (mirrors BookRenameModal from GeneralSection). */
class SystemRenameModal extends Modal {
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
        header.createDiv({ cls: 'ert-modal-title', text: 'Rename beat system' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'This name is written into beat notes as Beat Model.' });

        const inputContainer = contentEl.createDiv({ cls: 'ert-search-input-container' });
        const inputEl = inputContainer.createEl('input', {
            type: 'text',
            value: this.initialValue,
            cls: 'ert-input ert-input--full'
        });
        inputEl.setAttr('placeholder', 'Custom beats');

        window.setTimeout(() => inputEl.focus(), 50);

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const val = inputEl.value.trim();
            if (!val) {
                new Notice('Please enter a system name.');
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

const resolveTemplateSystemId = (system?: string): TemplateSystemId | null => {
    switch ((system ?? '').trim()) {
        case 'Save The Cat':
            return 'save_the_cat';
        case 'Hero\'s Journey':
            return 'heros_journey';
        case 'Story Grid':
            return 'story_grid';
        default:
            return null;
    }
};

const deriveBeatSystemMode = (system?: string): { mode: BeatSystemMode; templateSystemId: TemplateSystemId | null } => {
    const templateSystemId = resolveTemplateSystemId(system);
    return templateSystemId
        ? { mode: 'template', templateSystemId }
        : { mode: 'custom', templateSystemId: null };
};

export function renderStoryBeatsSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;
    containerEl.classList.add(ERT_CLASSES.STACK);
    const actsSection = containerEl.createDiv({ cls: ERT_CLASSES.STACK, attr: { [ERT_DATA.SECTION]: 'beats-acts' } });
    const actsStack = actsSection.createDiv({ cls: ERT_CLASSES.STACK });
    const beatsSection = containerEl.createDiv({ cls: ERT_CLASSES.STACK, attr: { [ERT_DATA.SECTION]: 'beats-story' } });
    const beatsStack = beatsSection.createDiv({ cls: ERT_CLASSES.STACK });
    const yamlSection = containerEl.createDiv({ cls: ERT_CLASSES.STACK, attr: { [ERT_DATA.SECTION]: 'beats-yaml' } });
    const yamlStack = yamlSection.createDiv({ cls: ERT_CLASSES.STACK });

    // Acts Section (above beats)
    const actsHeading = new Settings(actsStack)
        .setName('Acts')
        .setHeading();
    addHeadingIcon(actsHeading, 'chart-pie');
    addWikiLink(actsHeading, 'Settings#acts');
    applyErtHeaderLayout(actsHeading);

    const getActCount = () => Math.max(3, plugin.settings.actCount ?? 3);

    const getActPreviewLabels = () => {
        const count = getActCount();
        const labels = parseActLabels(plugin.settings, count);
        return Array.from({ length: count }, (_, idx) => resolveActLabel(idx, labels));
    };

    const updateActPreview = () => {
        const previewLabels = getActPreviewLabels();
        actsPreviewHeading.setText(`Preview (${previewLabels.length} acts)`);
        actsPreviewBody.setText(previewLabels.join(' · '));
    };

    const clampBeatAct = (val: number, maxActs: number) => {
        const n = Number.isFinite(val) ? val : 1;
        return Math.min(Math.max(1, n), maxActs);
    };

    const normalizeBeatTitle = (value: string): string => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        const withoutAct = trimmed.replace(/^Act\s*\d+\s*:\s*/i, '');
        const withoutPrefix = withoutAct.replace(/^\d+(?:\.\d+)?\s*[.\-:)]?\s*/i, '');
        // Strip punctuation that sanitizeBeatName would replace, so matching
        // works regardless of whether we compare raw input or sanitised filename.
        const noPunctuation = withoutPrefix.replace(/[\\/:*?"<>|!.]+/g, ' ');
        return noPunctuation.replace(/\s+/g, ' ').trim().toLowerCase();
    };

    const stripActPrefix = (name: string): string => {
        const m = name.match(/^Act\s*\d+\s*:\s*(.+)$/i);
        return m ? m[1].trim() : name.trim();
    };

    const sanitizeBeatName = (s: string) =>
        s.replace(/[\\/:*?"<>|!.]+/g, '-').replace(/-+/g, '-').replace(/\s+/g, ' ').replace(/^-|-$/g, '').trim();

    const buildBeatFilename = (beatNumber: number, name: string): string => {
        const displayName = stripActPrefix(name);
        const safeBeatName = sanitizeBeatName(displayName);
        return `${beatNumber} ${safeBeatName}`.trim();
    };

    const parseBeatRow = (item: unknown): BeatRow => {
        if (typeof item === 'object' && item !== null && (item as { name?: unknown }).name) {
            const obj = item as { name?: unknown; act?: unknown };
            const objName = typeof obj.name === 'string' ? obj.name : String(obj.name ?? '');
            const objAct = typeof obj.act === 'number' ? obj.act : 1;
            return { name: objName, act: objAct };
        }
        const raw = String(item ?? '').trim();
        if (!raw) return { name: '', act: 1 };
        const m = raw.match(/^(.*?)\[(\d+)\]$/);
        if (m) {
            const actNum = parseInt(m[2], 10);
            return { name: m[1].trim(), act: !Number.isNaN(actNum) ? actNum : 1 };
        }
        return { name: raw, act: 1 };
    };

    type ActRange = { min: number; max: number; sceneNumbers: number[] };

    const formatRangeValue = (value: number): string => {
        if (Number.isInteger(value)) return String(value);
        return String(value);
    };

    const formatRangeLabel = (range: ActRange): string => {
        const min = formatRangeValue(range.min);
        const max = formatRangeValue(range.max);
        return min === max ? min : `${min}-${max}`;
    };

    const collectActRanges = async (allowFetch: boolean): Promise<Map<number, ActRange> | null> => {
        let scenes: TimelineItem[] | undefined;
        if (Array.isArray(plugin.lastSceneData)) {
            scenes = plugin.lastSceneData;
        } else if (allowFetch) {
            try {
                scenes = await plugin.getSceneData();
            } catch {
                return new Map();
            }
        } else {
            return null;
        }

        const actCount = getActCount();
        const ranges = new Map<number, ActRange>();

        (scenes ?? []).forEach(scene => {
            if (scene.itemType !== 'Scene') return;
            const numStr = getScenePrefixNumber(scene.title, scene.number);
            if (!numStr) return;
            const num = Number(numStr);
            if (!Number.isFinite(num)) return;
            const rawAct = Number(scene.actNumber ?? scene.act ?? 1);
            const act = clampActNumber(rawAct, actCount);
            const existing = ranges.get(act);
            if (!existing) {
                ranges.set(act, { min: num, max: num, sceneNumbers: [num] });
            } else {
                if (num < existing.min) existing.min = num;
                if (num > existing.max) existing.max = num;
                existing.sceneNumbers.push(num);
            }
        });

        // Sort and deduplicate scene numbers per act
        ranges.forEach(range => {
            range.sceneNumbers = [...new Set(range.sceneNumbers)].sort((a, b) => a - b);
        });

        return ranges;
    };

    const buildBeatNumbers = (beats: BeatRow[], maxActs: number, ranges: Map<number, ActRange>): number[] => {
        if (!ranges || ranges.size === 0) {
            return beats.map((_, idx) => idx + 1);
        }
        // Group beats by act
        const beatsByAct = new Map<number, number[]>(); // act -> original indices
        beats.forEach((beatLine, index) => {
            const actNum = clampBeatAct(beatLine.act, maxActs);
            const list = beatsByAct.get(actNum) ?? [];
            list.push(index);
            beatsByAct.set(actNum, list);
        });

        const result = new Array<number>(beats.length);

        beatsByAct.forEach((indices, actNum) => {
            const range = ranges.get(actNum);
            const sceneNums = range?.sceneNumbers ?? [];
            const spread = spreadBeatsAcrossScenes(indices.length, sceneNums);
            indices.forEach((originalIdx, i) => {
                result[originalIdx] = spread[i];
            });
        });

        // Fill any undefined (shouldn't happen, but safety fallback)
        result.forEach((val, idx) => {
            if (val === undefined) result[idx] = idx + 1;
        });

        return result;
    };

    const normalizeBeatModel = (value: unknown): string =>
        String(value ?? '').trim().toLowerCase();

    const collectExistingBeatNotes = async (allowFetch: boolean, selectedSystem: string): Promise<TimelineItem[] | null> => {
        if (!allowFetch) return null;
        try {
            const scenes = await plugin.getSceneData({ filterBeatsBySystem: false });
            const beats = (scenes ?? []).filter(scene => scene.itemType === 'Beat' || scene.itemType === 'Plot');
            const expectedModel = selectedSystem === 'Custom'
                ? (plugin.settings.customBeatSystemName || 'Custom')
                : selectedSystem;
            const expectedKey = normalizeBeatModel(expectedModel);
            if (!expectedKey) return [];
            return beats.filter(beat => normalizeBeatModel((beat as any)['Beat Model']) === expectedKey);
        } catch {
            return [];
        }
    };

    const getBeatBasename = (beat: TimelineItem): string => {
        if (typeof beat.path === 'string') {
            const filename = beat.path.split('/').pop() ?? '';
            return filename.replace(/\.[^/.]+$/, '');
        }
        return typeof beat.title === 'string' ? beat.title : '';
    };

    const buildExistingBeatLookup = (beats: TimelineItem[]): Map<string, TimelineItem[]> => {
        const lookup = new Map<string, TimelineItem[]>();
        beats.forEach(beat => {
            const key = normalizeBeatTitle(getBeatBasename(beat));
            if (!key) return;
            const list = lookup.get(key) ?? [];
            list.push(beat);
            lookup.set(key, list);
        });
        return lookup;
    };

    const buildExpectedBeatNames = (selectedSystem: string): string[] => {
        if (selectedSystem === 'Custom') {
            return (plugin.settings.customBeatSystemBeats || [])
                .map(parseBeatRow)
                .map(b => b.name)
                .filter(name => name.trim().length > 0);
        }
        const system = getPlotSystem(selectedSystem);
        return system?.beats ?? [];
    };

    const collectBeatNotesByTemplateNames = (expectedKeys: Set<string>, selectedSystem: string): TimelineItem[] => {
        if (expectedKeys.size === 0) return [];
        const files = app.vault.getMarkdownFiles();
        const matches: TimelineItem[] = [];
        const customName = (plugin.settings.customBeatSystemName || 'Custom').trim();
        const expectedModel = selectedSystem === 'Custom' ? customName : selectedSystem;
        const expectedModelKey = normalizeBeatModel(expectedModel);

        files.forEach(file => {
            const key = normalizeBeatTitle(file.basename);
            if (!expectedKeys.has(key)) return;

            const cache = app.metadataCache.getFileCache(file);
            const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
            const normalized = normalizeFrontmatterKeys(fm, plugin.settings.frontmatterMappings);
            const classValue = normalized['Class'];
            if (classValue && !isStoryBeat(classValue)) return;
            const beatModelValue = typeof normalized['Beat Model'] === 'string'
                ? (normalized['Beat Model'] as string).trim()
                : '';
            if (!expectedModelKey || normalizeBeatModel(beatModelValue) !== expectedModelKey) return;

            const actValue = normalized['Act'];
            const actNumberRaw = actValue !== undefined && actValue !== null && actValue !== '' ? Number(actValue) : undefined;
            const actNumber = Number.isFinite(actNumberRaw) ? actNumberRaw : undefined;

            matches.push({
                title: (normalized['Title'] as string | undefined) ?? file.basename,
                path: file.path,
                date: '',
                actNumber,
                act: actNumber ? String(actNumber) : undefined,
                itemType: 'Beat',
                rawFrontmatter: normalized
            });
        });

        return matches;
    };

    let existingBeatLookup = new Map<string, TimelineItem[]>();
    let existingBeatCount = 0;
    let existingBeatMatchedCount = 0;
    let existingBeatExpectedCount = 0;
    let existingBeatDuplicateCount = 0;
    let existingBeatMisalignedCount = 0;
    let existingBeatSyncedCount = 0;
    let existingBeatNewCount = 0;
    let existingBeatKey = '';
    let existingBeatReady = false;
    let refreshCustomBeatList: (() => void) | null = null;
    let refreshCustomBeats: ((allowFetch: boolean) => void) | null = null;
    let refreshHealthIcon: (() => void) | null = null;
    let customBeatsObserver: IntersectionObserver | null = null;

    const refreshExistingBeatLookup = async (allowFetch: boolean, selectedSystem: string): Promise<Map<string, TimelineItem[]> | null> => {
        const nextKey = `${selectedSystem}|${plugin.settings.customBeatSystemName ?? ''}`;
        if (!allowFetch && existingBeatKey === nextKey && existingBeatReady) {
            return existingBeatLookup;
        }
        const [beats, ranges] = await Promise.all([
            collectExistingBeatNotes(allowFetch, selectedSystem),
            collectActRanges(allowFetch)
        ]);
        if (beats === null) return null;
        const resolvedRanges = ranges ?? new Map<number, ActRange>();
        const expectedNames = buildExpectedBeatNames(selectedSystem);
        const expectedKeys = new Set(expectedNames.map(name => normalizeBeatTitle(name)).filter(k => k.length > 0));
        const buildCounts = (lookup: Map<string, TimelineItem[]>, total: number) => {
            existingBeatLookup = lookup;
            existingBeatCount = total;
            existingBeatExpectedCount = expectedNames.length;
            existingBeatMatchedCount = Array.from(expectedKeys).filter(key => lookup.has(key)).length;
            existingBeatDuplicateCount = Array.from(expectedKeys).filter(key => (lookup.get(key)?.length ?? 0) > 1).length;

            // Compute misaligned count: beats matched by name but wrong number or act
            const maxActs = getActCount();
            const expectedBeats: BeatRow[] = selectedSystem === 'Custom'
                ? (plugin.settings.customBeatSystemBeats || []).map(parseBeatRow).map(b => ({ ...b, act: clampBeatAct(b.act, maxActs) }))
                : (expectedNames.map(name => ({ name, act: 1 })));
            let misaligned = 0;
            const beatNumbers = buildBeatNumbers(expectedBeats, maxActs, resolvedRanges);
            expectedBeats.forEach((beat, idx) => {
                const key = normalizeBeatTitle(beat.name);
                if (!key || !lookup.has(key)) return;
                const matches = lookup.get(key) ?? [];
                const expectedNumber = beatNumbers[idx] ?? (idx + 1);
                const actNumber = clampBeatAct(beat.act, maxActs);
                let hasAligned = false;
                matches.forEach(existing => {
                    const existingName = getBeatBasename(existing);
                    const existingNumberStr = getScenePrefixNumber(existingName, existing.number);
                    const existingNumber = existingNumberStr ? Number(existingNumberStr) : NaN;
                    const existingActRaw = typeof existing.actNumber === 'number' ? existing.actNumber : Number(existing.act ?? actNumber);
                    const existingAct = Number.isFinite(existingActRaw) ? existingActRaw : actNumber;
                    const numberAligned = Number.isFinite(existingNumber) && existingNumber === expectedNumber;
                    const actAligned = Number.isFinite(existingAct) ? existingAct === actNumber : true;
                    if (numberAligned && actAligned) hasAligned = true;
                });
                if (!hasAligned) misaligned++;
            });
            existingBeatMisalignedCount = misaligned;
            existingBeatSyncedCount = Math.max(0, existingBeatMatchedCount - existingBeatMisalignedCount - existingBeatDuplicateCount);
            existingBeatNewCount = Math.max(0, existingBeatExpectedCount - existingBeatMatchedCount);
        };

        const initialLookup = buildExistingBeatLookup(beats);
        buildCounts(initialLookup, beats.length);

        if (existingBeatMatchedCount === 0 && expectedKeys.size > 0) {
            const fallbackBeats = await collectExistingBeatNotes(allowFetch, '');
            if (fallbackBeats && fallbackBeats.length > 0) {
                const fallbackLookup = buildExistingBeatLookup(fallbackBeats);
                const fallbackMatched = Array.from(expectedKeys).filter(key => fallbackLookup.has(key)).length;
                if (fallbackMatched > 0) {
                    buildCounts(fallbackLookup, fallbackBeats.length);
                    existingBeatKey = nextKey;
                    existingBeatReady = true;
                    return existingBeatLookup;
                }
            }

            const nameMatchedBeats = collectBeatNotesByTemplateNames(expectedKeys, selectedSystem);
            if (nameMatchedBeats.length > 0) {
                const nameMatchedLookup = buildExistingBeatLookup(nameMatchedBeats);
                buildCounts(nameMatchedLookup, nameMatchedBeats.length);
            }
        }
        existingBeatKey = nextKey;
        existingBeatReady = true;
        return existingBeatLookup;
    };

    new Settings(actsStack)
        .setName('Act count')
        .setDesc('Applies to Narrative, Publication, and Gossamer modes. Scene and Beats YAML. (Minimum 3)')
        .addText(text => {
            text.setPlaceholder('3');
            text.setValue(String(getActCount()));
            text.inputEl.type = 'number';
            text.inputEl.min = '3';
            text.inputEl.addClass('ert-input--xs');
            text.onChange(async (value) => {
                const parsed = parseInt(value, 10);
                const next = Number.isFinite(parsed) ? Math.max(3, parsed) : 3;
                plugin.settings.actCount = next;
                await plugin.saveSettings();
                updateActPreview();
                // Immediately refresh Custom beat editor so act columns update
                refreshCustomBeatList?.();
            });
        });

    const actLabelsSetting = new Settings(actsStack)
        .setName('Act labels (optional)')
        .setDesc('Comma-separated labels. Leave blank for Act 1, Act 2, Act 3. Examples: "1, 2, 3, 4" or "Spring, Summer, Fall, Winter".')
        .addText(text => {
            text.setPlaceholder('Act 1, Act 2, Act 3');
            text.setValue(plugin.settings.actLabelsRaw ?? '');
            text.inputEl.addClass('ert-input--xl');
            text.onChange(async (value) => {
                plugin.settings.actLabelsRaw = value;
                await plugin.saveSettings();
                updateActPreview();
            });
        });

    // Preview (planet-style)
    const actsPreview = actsStack.createDiv({
        cls: ['ert-previewFrame', 'ert-previewFrame--center', 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'acts' }
    });
    const actsPreviewHeading = actsPreview.createDiv({ cls: 'ert-planetary-preview-heading', text: 'Preview' });
    const actsPreviewBody = actsPreview.createDiv({ cls: 'ert-planetary-preview-body' });

    updateActPreview();

    const beatsHeading = new Settings(beatsStack)
        .setName('Story beats system')
        .setHeading();
    addHeadingIcon(beatsHeading, 'activity');
    addWikiLink(beatsHeading, 'Settings#story-beats');
    applyErtHeaderLayout(beatsHeading);

    // Wrapper keeps tabs + panel as a single stack item (no stack gap between them)
    const beatSystemWrapper = beatsStack.createDiv({ cls: 'ert-beat-system-wrapper' });

    const beatSystemTabs = beatSystemWrapper.createDiv({
        cls: 'ert-mini-tabs',
        attr: { role: 'tablist' }
    });
    const beatSystemOptions = [...TEMPLATE_SYSTEMS, CUSTOM_SYSTEM_OPTION];

    const beatSystemCard = beatSystemWrapper.createDiv({
        cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-beat-system-card`,
        attr: { id: 'ert-beat-system-panel', role: 'tabpanel' }
    });
    const templatePreviewContainer = beatSystemCard.createDiv({ cls: ['ert-beat-template-preview', ERT_CLASSES.STACK] });
    const templatePreviewTitle = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-title' });
    const templatePreviewDesc = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-desc' });
    const templatePreviewExamples = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-examples' });
    const templatePreviewMeta = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-meta' });
    const templateActGrid = templatePreviewContainer.createDiv({ cls: 'ert-beat-act-grid' });

    // ── Stage switcher for Custom workflow (3-stage) ──────────────────
    // Local state only — not persisted. Controls which section is visible
    // inside the Custom tab panel.
    // 1) design — beat list editor + system name + beat-note health/actions
    // 2) fields — YAML editor, hover metadata, schema audit
    // 3) pro    — saved beat systems manager (Pro Sets, Pro-locked for Core)
    type CustomStage = 'design' | 'fields' | 'pro';
    let currentCustomStage: CustomStage = 'design';

    const stageSwitcher = beatSystemCard.createDiv({
        cls: 'ert-stage-switcher ert-settings-hidden',
        attr: { role: 'tablist' }
    });

    // --- Custom System Configuration (Dynamic Visibility) ---
    const customConfigContainer = beatSystemCard.createDiv({ cls: ['ert-custom-beat-config', ERT_CLASSES.STACK] });

    const renderCustomConfig = () => {
        customConfigContainer.empty();

        // ── Custom system header (mirrors built-in template preview header) ──
        const customSystemName = plugin.settings.customBeatSystemName || 'Custom beats';
        const copy = BEAT_SYSTEM_COPY['Custom'];
        const headerRow = customConfigContainer.createDiv({ cls: ['ert-beat-template-preview', ERT_CLASSES.STACK] });
        const titleEl = headerRow.createDiv({ cls: 'ert-beat-template-title' });

        // Health status icon — mirrors Book card check pattern.
        // Starts neutral; updates after async beat-note lookup.
        const healthIcon = titleEl.createDiv({ cls: 'ert-beat-health-icon' });
        setIcon(healthIcon, 'circle-dashed');

        const nameLink = titleEl.createSpan({
            text: customSystemName,
            cls: 'ert-book-name ert-book-name--clickable'
        });
        nameLink.setAttr('role', 'button');
        nameLink.setAttr('tabindex', '0');
        nameLink.setAttr('aria-label', `Rename "${customSystemName}"`);
        // Multi-paragraph description — split on \n\n to create separate <p> elements
        copy.description.split('\n\n').forEach(para => {
            headerRow.createDiv({ cls: 'ert-beat-template-desc', text: para });
        });
        if (copy.examples) {
            headerRow.createDiv({ cls: 'ert-beat-template-examples', text: copy.examples });
        }
        const openSystemRename = () => {
            new SystemRenameModal(app, customSystemName, async (newName) => {
                const trimmed = newName.trim();
                if (!trimmed) return false;
                plugin.settings.customBeatSystemName = trimmed;
                await plugin.saveSettings();
                existingBeatReady = false;
                updateTemplateButton(templateSetting, 'Custom');
                renderCustomConfig();
                return true;
            }).open();
        };
        nameLink.addEventListener('click', (e) => { e.stopPropagation(); openSystemRename(); }); // SAFE: direct addEventListener; Settings lifecycle manages cleanup
        nameLink.addEventListener('keydown', (e: KeyboardEvent) => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSystemRename(); }
        });

        // Update health icon from current beat-note audit counters.
        // Called immediately (from cached state) and again after async lookup.
        const updateHealthIcon = () => {
            if (!existingBeatReady) {
                // No audit run yet — neutral
                healthIcon.className = 'ert-beat-health-icon';
                setIcon(healthIcon, 'circle-dashed');
                return;
            }
            const hasDups = existingBeatDuplicateCount > 0;
            const hasMisaligned = existingBeatMisalignedCount > 0;
            const hasMissing = existingBeatNewCount > 0;
            const allGood = existingBeatSyncedCount === existingBeatExpectedCount
                && !hasMisaligned && !hasDups;

            if (hasDups) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--critical';
                setIcon(healthIcon, 'alert-circle');
            } else if (hasMisaligned) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--warning';
                setIcon(healthIcon, 'alert-triangle');
            } else if (hasMissing) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--warning';
                setIcon(healthIcon, 'alert-triangle');
            } else if (allGood) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--success';
                setIcon(healthIcon, 'check-circle');
            } else {
                healthIcon.className = 'ert-beat-health-icon';
                setIcon(healthIcon, 'circle-dashed');
            }
        };
        updateHealthIcon();

        // Expose so updateTemplateButton can refresh the icon after async lookup
        refreshHealthIcon = updateHealthIcon;

        // Beat List Editor (draggable rows with Name + Act)
        const beatWrapper = customConfigContainer.createDiv({ cls: 'ert-custom-beat-wrapper' });

        const listContainer = beatWrapper.createDiv({ cls: 'ert-custom-beat-list' });

        const saveBeats = async (beats: BeatRow[]) => {
            plugin.settings.customBeatSystemBeats = beats;
            await plugin.saveSettings();
            updateTemplateButton(templateSetting, 'Custom');
            // Re-render stage switcher after beat list changes
            renderStageSwitcher();
        };

        const buildActLabels = (count: number, ranges?: Map<number, ActRange>): string[] => {
            const labels = parseActLabels(plugin.settings, count);
            return Array.from({ length: count }, (_, idx) => {
                const baseLabel = resolveActLabel(idx, labels);
                const range = ranges?.get(idx + 1);
                if (!range) return baseLabel;
                return `${baseLabel} (${formatRangeLabel(range)})`;
            });
        };

        let actRanges = new Map<number, ActRange>();
        let refreshBusy = false;
        let refreshQueued = false;

        const refreshCustomBeatsData = async (allowFetch: boolean) => {
            if (refreshBusy) {
                refreshQueued = true;
                return;
            }
            refreshBusy = true;
            const system = plugin.settings.beatSystem || 'Custom';
            const [ranges, existing] = await Promise.all([
                collectActRanges(allowFetch),
                refreshExistingBeatLookup(allowFetch, system)
            ]);
            if (ranges) {
                actRanges = ranges;
            }
            if (existing) {
                existingBeatLookup = existing;
            }
            renderList();
            updateTemplateButton(templateSetting, system);
            refreshBusy = false;
            if (refreshQueued) {
                refreshQueued = false;
                void refreshCustomBeatsData(allowFetch);
            }
        };

        const renderList = () => {
            listContainer.empty();
            const maxActs = getActCount();
            const actLabels = buildActLabels(maxActs, actRanges);
            const beats: BeatRow[] = (plugin.settings.customBeatSystemBeats || [])
                .map(parseBeatRow)
                .map(b => ({ ...b, act: clampBeatAct(b.act, maxActs) }));
            const beatsByAct: BeatRow[][] = Array.from({ length: maxActs }, () => []);
            beats.forEach(beat => {
                const actIdx = clampBeatAct(beat.act, maxActs) - 1;
                beatsByAct[actIdx].push(beat);
            });
            const actStartIndex: number[] = [];
            let runningIndex = 0;
            beatsByAct.forEach((list, idx) => {
                actStartIndex[idx] = runningIndex;
                runningIndex += list.length;
            });
            const orderedBeats = beatsByAct.flat();
            const beatNumbers = buildBeatNumbers(orderedBeats, maxActs, actRanges);
            const titleMap = new Map<string, number[]>();
            orderedBeats.forEach((beatLine, idx) => {
                const key = normalizeBeatTitle(beatLine.name);
                if (!key) return;
                const list = titleMap.get(key) ?? [];
                list.push(idx);
                titleMap.set(key, list);
            });
            const duplicateKeys = new Set(
                Array.from(titleMap.entries())
                    .filter(([, indices]) => indices.length > 1)
                    .map(([key]) => key)
            );

            let globalIndex = 0;
            for (let actIdx = 0; actIdx < maxActs; actIdx++) {
                const actNumber = actIdx + 1;
                const divider = listContainer.createDiv({ cls: 'ert-custom-beat-divider' });
                divider.createDiv({ cls: 'ert-custom-beat-divider-label', text: actLabels[actIdx] });

                const actBeats = beatsByAct[actIdx];
                if (actBeats.length === 0) {
                    const placeholder = listContainer.createDiv({ cls: ['ert-custom-beat-row', 'ert-custom-beat-placeholder'] });
                    placeholder.createDiv({ cls: ['ert-drag-handle', 'ert-drag-placeholder'] });
                    placeholder.createDiv({ cls: 'ert-grid-spacer' });
                    placeholder.createDiv({ cls: 'ert-beat-index ert-beat-add-index', text: '' });
                    const placeholderText = placeholder.createDiv({ cls: 'ert-custom-beat-placeholder-text', text: `Drop beat into ${actLabels[actIdx]}` });
                    placeholderText.style.gridColumn = '4 / -1';

                    plugin.registerDomEvent(placeholder, 'dragover', (e) => {
                        e.preventDefault();
                        placeholder.addClass('is-dragover');
                    });
                    plugin.registerDomEvent(placeholder, 'dragleave', () => {
                        placeholder.removeClass('is-dragover');
                    });
                    plugin.registerDomEvent(placeholder, 'drop', (e) => {
                        e.preventDefault();
                        placeholder.removeClass('is-dragover');
                        const from = parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
                        if (Number.isNaN(from) || from < 0 || from >= orderedBeats.length) return;
                        const updated = [...orderedBeats];
                        const [moved] = updated.splice(from, 1);
                        moved.act = actNumber;
                        const insertIndex = actStartIndex[actIdx] ?? updated.length;
                        updated.splice(insertIndex, 0, moved);
                        saveBeats(updated);
                        renderList();
                    });
                    continue;
                }

                actBeats.forEach((beatLine) => {
                    const index = globalIndex;
                    globalIndex += 1;
                    const row = listContainer.createDiv({ cls: 'ert-custom-beat-row' });
                    row.draggable = true;

                    // Drag handle
                    const handle = row.createDiv({ cls: 'ert-drag-handle' });
                    setIcon(handle, 'grip-vertical');
                    setTooltip(handle, 'Drag to reorder beat');

                    // Spacer (pushes rest to the right, matches YAML row structure)
                    row.createDiv({ cls: 'ert-grid-spacer' });

                    // Index
                    const beatNumber = beatNumbers[index] ?? (index + 1);
                    row.createDiv({ text: `${beatNumber}.`, cls: 'ert-beat-index' });

                    // Parse "Name [Act]"
                    let name = beatLine.name;
                    let act = actNumber.toString();

                    // Name input
                    const nameInput = row.createEl('input', { type: 'text', cls: 'ert-beat-name-input ert-input' });
                    nameInput.value = name;
                    nameInput.placeholder = 'Beat name';
                    // Determine row state (mutually exclusive: new | synced | misaligned | duplicate)
                    const dupKey = normalizeBeatTitle(name);
                    let rowState: 'new' | 'synced' | 'misaligned' | 'duplicate' = 'new';
                    const rowNotices: string[] = [];

                    // Duplicate title in settings list takes highest priority
                    if (dupKey && duplicateKeys.has(dupKey)) {
                        rowState = 'duplicate';
                        rowNotices.push('Duplicate beat title. Rename one to resolve.');
                    }

                    // Check for existing files
                    if (dupKey && existingBeatLookup.has(dupKey)) {
                        const matches = existingBeatLookup.get(dupKey) ?? [];
                        if (matches.length > 1) {
                            rowState = 'duplicate';
                            rowNotices.push('Multiple files match this title.');
                        } else if (rowState !== 'duplicate') {
                            const match = matches[0];
                            const existingName = getBeatBasename(match);
                            const existingNumberStr = getScenePrefixNumber(existingName, match.number);
                            const existingNumber = existingNumberStr ? Number(existingNumberStr) : NaN;
                            const existingActRaw = typeof match.actNumber === 'number'
                                ? match.actNumber
                                : Number(match.act ?? actNumber);
                            const existingAct = Number.isFinite(existingActRaw) ? existingActRaw : actNumber;
                            const missingNumber = !existingNumberStr || !Number.isFinite(existingNumber);
                            const numberAligned = !missingNumber && existingNumber === beatNumber;
                            const actAligned = Number.isFinite(existingAct) ? existingAct === actNumber : true;

                            if (numberAligned && actAligned) {
                                rowState = 'synced';
                                rowNotices.push('Beat note aligned.');
                            } else {
                                rowState = 'misaligned';
                                if (missingNumber) {
                                    rowNotices.push(`Missing prefix number. Repair to assign #${beatNumber}.`);
                                } else {
                                    rowNotices.push(`Misaligned: file is #${existingNumberStr} Act ${existingAct}, expected #${beatNumber} Act ${actNumber}.`);
                                }
                            }
                        }
                    }

                    if (rowState !== 'new') {
                        row.addClass(`ert-custom-beat-row--${rowState}`);
                    }
                    if (rowNotices.length > 0) {
                        setTooltip(nameInput, rowNotices.join(' '));
                    }
                    plugin.registerDomEvent(nameInput, 'change', () => {
                        const newName = nameInput.value.trim();
                        if (!newName) return;
                        const updated = [...orderedBeats];
                        updated[index] = { name: newName, act: parseInt(act, 10) || 1 };
                        saveBeats(updated);
                        renderList();
                    });

                    // Act select
                    const actSelect = row.createEl('select', { cls: 'ert-beat-act-select ert-input' });
                    Array.from({ length: maxActs }, (_, i) => i + 1).forEach(n => {
                        const opt = actSelect.createEl('option', { value: n.toString(), text: actLabels[n - 1] });
                        if (act === n.toString()) opt.selected = true;
                    });
                    plugin.registerDomEvent(actSelect, 'change', () => {
                        act = actSelect.value;
                        const updated = [...orderedBeats];
                        const currentName = nameInput.value.trim() || name;
                        const actNum = clampBeatAct(parseInt(act, 10) || 1, maxActs);
                        updated[index] = { name: currentName, act: actNum };
                        saveBeats(updated);
                        renderList();
                    });

                    // Delete button
                    const delBtn = row.createEl('button', { cls: 'ert-iconBtn' });
                    setIcon(delBtn, 'trash');
                    delBtn.onclick = () => {
                        const updated = [...orderedBeats];
                        updated.splice(index, 1);
                        saveBeats(updated);
                        renderList();
                    };

                    // Drag and drop reorder
                    plugin.registerDomEvent(row, 'dragstart', (e) => {
                        e.dataTransfer?.setData('text/plain', index.toString());
                        row.classList.add('is-dragging');
                    });
                    plugin.registerDomEvent(row, 'dragend', () => {
                        row.classList.remove('is-dragging');
                    });
                    plugin.registerDomEvent(row, 'dragover', (e) => {
                        e.preventDefault();
                    });
                    plugin.registerDomEvent(row, 'drop', (e) => {
                        e.preventDefault();
                        const from = parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
                        if (Number.isNaN(from) || from === index || from < 0) return;
                        const updated = [...orderedBeats];
                        const [moved] = updated.splice(from, 1);
                        moved.act = actNumber;
                        updated.splice(index, 0, moved);
                        saveBeats(updated);
                        renderList();
                    });
                });
            }

            // Add row at bottom (single line, matches advanced YAML add row)
            const defaultAct = orderedBeats.length > 0 ? clampBeatAct(orderedBeats[orderedBeats.length - 1].act, maxActs) : 1;
            const addRow = listContainer.createDiv({ cls: 'ert-custom-beat-row ert-custom-beat-add-row' });

            addRow.createDiv({ cls: ['ert-drag-handle', 'ert-drag-placeholder'] });
            addRow.createDiv({ cls: 'ert-grid-spacer' });
            addRow.createDiv({ cls: 'ert-beat-index ert-beat-add-index', text: '' });

            const addNameInput = addRow.createEl('input', { type: 'text', cls: 'ert-beat-name-input ert-input', placeholder: 'New beat' });
            const addActSelect = addRow.createEl('select', { cls: 'ert-beat-act-select ert-input' });
            Array.from({ length: maxActs }, (_, i) => i + 1).forEach(n => {
                const opt = addActSelect.createEl('option', { value: n.toString(), text: actLabels[n - 1] });
                if (defaultAct === n) opt.selected = true;
            });

            const addBtn = addRow.createEl('button', { cls: ['ert-iconBtn', 'ert-beat-add-btn'], attr: { 'aria-label': 'Add beat' } });
            setIcon(addBtn, 'plus');

            const commitAdd = () => {
                const name = (addNameInput.value || 'New Beat').trim();
                const act = clampBeatAct(parseInt(addActSelect.value, 10) || defaultAct || 1, maxActs);
                const updated = [...orderedBeats, { name, act }];
                saveBeats(updated);
                renderList();
            };

            addBtn.onclick = commitAdd;
            plugin.registerDomEvent(addNameInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    commitAdd();
                }
            });
        };

        refreshCustomBeatList = renderList;
        renderList();
        refreshCustomBeats = refreshCustomBeatsData;
        void refreshCustomBeatsData(true);
    };
    renderCustomConfig();

    // IntersectionObserver for lazy-refresh of custom beats when visible
    if (customBeatsObserver as IntersectionObserver | null) {
        customBeatsObserver!.disconnect();
        customBeatsObserver = null;
    }
    if (typeof IntersectionObserver !== 'undefined') {
        customBeatsObserver = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                refreshCustomBeats?.(true);
            }
        }, { threshold: 0.05 });
        customBeatsObserver.observe(customConfigContainer);
    }
    // --------------------------------------------------------

    type ActGridColumn = { label: string; beats: string[]; rank: number; isNumericAct: boolean };

    const getBeatSystemCopy = (system: string) => {
        return BEAT_SYSTEM_COPY[system] ?? {
            title: system,
            description: 'Select a beat system to configure template notes and story beat behavior.'
        };
    };

    const inferActForIndex = (index: number, total: number): number => {
        if (total <= 0) return 1;
        const position = index / total;
        if (position < 0.33) return 1;
        if (position < 0.67) return 2;
        return 3;
    };

    const buildTemplateActColumns = (system: string): { columns: ActGridColumn[]; totalBeats: number } => {
        const template = getPlotSystem(system);
        if (!template) return { columns: [], totalBeats: 0 };

        const beats = template.beats ?? [];
        const details = template.beatDetails ?? [];
        const grouped = new Map<string, ActGridColumn>();
        const other: string[] = [];
        const total = beats.length;

        beats.forEach((beatName, index) => {
            const detail = details[index] as { act?: unknown } | undefined;
            const rawAct = detail?.act;
            const cleanedBeat = stripActPrefix(beatName);

            if (typeof rawAct === 'number' && Number.isFinite(rawAct)) {
                const actNum = Math.max(1, Math.round(rawAct));
                const key = `act:${actNum}`;
                if (!grouped.has(key)) {
                    grouped.set(key, { label: `Act ${actNum}`, beats: [], rank: actNum, isNumericAct: true });
                }
                grouped.get(key)!.beats.push(cleanedBeat);
                return;
            }

            if (typeof rawAct === 'string' && rawAct.trim()) {
                const trimmed = rawAct.trim();
                const parsedAct = Number(trimmed);
                if (Number.isFinite(parsedAct) && parsedAct > 0) {
                    const actNum = Math.round(parsedAct);
                    const key = `act:${actNum}`;
                    if (!grouped.has(key)) {
                        grouped.set(key, { label: `Act ${actNum}`, beats: [], rank: actNum, isNumericAct: true });
                    }
                    grouped.get(key)!.beats.push(cleanedBeat);
                } else {
                    const key = `label:${trimmed.toLowerCase()}`;
                    if (!grouped.has(key)) {
                        grouped.set(key, { label: trimmed, beats: [], rank: Number.MAX_SAFE_INTEGER - 1, isNumericAct: false });
                    }
                    grouped.get(key)!.beats.push(cleanedBeat);
                }
                return;
            }

            if (rawAct === undefined || rawAct === null || rawAct === '') {
                const inferred = inferActForIndex(index, total);
                const key = `act:${inferred}`;
                if (!grouped.has(key)) {
                    grouped.set(key, { label: `Act ${inferred}`, beats: [], rank: inferred, isNumericAct: true });
                }
                grouped.get(key)!.beats.push(cleanedBeat);
                return;
            }

            other.push(cleanedBeat);
        });

        const columns = Array.from(grouped.values()).sort((a, b) => {
            if (a.rank !== b.rank) return a.rank - b.rank;
            return a.label.localeCompare(b.label);
        });

        if (other.length > 0) {
            columns.push({ label: 'Other', beats: other, rank: Number.MAX_SAFE_INTEGER, isNumericAct: false });
        }

        return { columns, totalBeats: total };
    };

    const renderTemplatePreview = (system: string) => {
        const { mode } = deriveBeatSystemMode(system);
        templatePreviewContainer.toggleClass('ert-settings-hidden', mode !== 'template');
        if (mode !== 'template') return;

        const copy = getBeatSystemCopy(system);
        const { columns, totalBeats } = buildTemplateActColumns(system);

        templatePreviewTitle.setText(copy.title);
        templatePreviewDesc.setText(copy.description);
        templatePreviewExamples.setText(copy.examples ?? '');
        templatePreviewExamples.toggleClass('ert-settings-hidden', !copy.examples);
        templatePreviewMeta.setText(`${totalBeats} beats · ${columns.length} acts`);

        templateActGrid.empty();
        if (columns.length === 0) {
            templateActGrid.createDiv({ cls: 'ert-beat-act-empty', text: 'No template beats found for this system.' });
            return;
        }

        columns.forEach((column) => {
            const colEl = templateActGrid.createDiv({ cls: 'ert-beat-act-column' });
            const count = column.beats.length;
            const headerText = column.isNumericAct
                ? `${column.label} (${count})`
                : `${column.label}${count > 0 ? ` (${count})` : ''}`;
            colEl.createDiv({ cls: 'ert-beat-act-header', text: headerText });
            const listEl = colEl.createDiv({ cls: 'ert-beat-act-list' });
            column.beats.forEach((beat, beatIdx) => {
                listEl.createDiv({ cls: 'ert-beat-act-item', text: `${beatIdx + 1}. ${beat}` });
            });
        });
    };

    // Create template beat note button — wrapped in a container for reliable stage gating.
    // The wrapper is toggled by updateStageVisibility so async Setting updates can't leak.
    const designActionsContainer = beatSystemCard.createDiv();
    let createTemplatesButton: ButtonComponent | undefined;
    let mergeTemplatesButton: ButtonComponent | undefined;

    const templateSetting = new Settings(designActionsContainer)
        .setName('Beat notes')
        .setDesc('Create beat note files in your vault based on the selected story structure system.')
        .addButton(button => {
            createTemplatesButton = button;
            button
                .setButtonText('Create beat notes')
                .setTooltip('Create beat note files in your source path')
                .onClick(async () => {
                    await createBeatTemplates();
                });
        })
        .addButton(button => {
            mergeTemplatesButton = button;
            button
                .setButtonText('Repair beat notes')
                .setTooltip('Fix misaligned beat notes to match this list')
                .onClick(async () => {
                    await mergeExistingBeatNotes();
                });
        });

    updateTemplateButton(templateSetting, plugin.settings.beatSystem || 'Custom');

    // Stage 3: Fields (YAML editor, hover metadata, schema audit)
    const fieldsContainer = beatSystemCard.createDiv({ cls: ERT_CLASSES.STACK });
    // Stage 3: PRO Sets (saved beat systems manager)
    const proTemplatesContainer = beatSystemCard.createDiv({ cls: ERT_CLASSES.STACK });

    // ── Stage switcher rendering + visibility ───────────────────────────
    const renderStageSwitcher = () => {
        stageSwitcher.empty();

        // Helper: create a numbered stage button
        const makeStageBtn = (
            id: CustomStage,
            stepNum: number,
            label: string,
            disabled = false
        ): HTMLButtonElement => {
            const btn = stageSwitcher.createEl('button', {
                cls: `ert-stage-btn${currentCustomStage === id ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`,
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': currentCustomStage === id ? 'true' : 'false',
                    ...(disabled ? { disabled: 'true' } : {})
                }
            });
            btn.createSpan({ cls: 'ert-stage-btn-step', text: `${stepNum}.` });
            btn.appendText(` ${label}`);
            if (!disabled) {
                btn.addEventListener('click', () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                    if (currentCustomStage === id) return;
                    currentCustomStage = id;
                    renderStageSwitcher();
                    updateStageVisibility();
                });
            }
            return btn;
        };

        // Stage 1: Design (beat list + health + create/merge actions)
        makeStageBtn('design', 1, 'Design');

        // Stage 2: Fields (YAML editor, hover metadata, schema audit)
        makeStageBtn('fields', 2, 'Fields');

        // Stage 3: PRO Sets (always visible; content Pro-locked for Core)
        const proBtn = stageSwitcher.createEl('button', {
            cls: `ert-stage-btn ert-stage-btn--pro ${ERT_CLASSES.SKIN_PRO}${currentCustomStage === 'pro' ? ' is-active' : ''}`,
            attr: { type: 'button', role: 'tab', 'aria-selected': currentCustomStage === 'pro' ? 'true' : 'false' }
        });
        // PRO pill inherits gradient from the ert-skin--pro ancestor (the button itself)
        const proPill = proBtn.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO} ${ERT_CLASSES.BADGE_PILL_SM}` });
        setIcon(proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), 'signature');
        proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
        proBtn.appendText(' Sets');
        proBtn.addEventListener('click', () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
            if (currentCustomStage === 'pro') return;
            currentCustomStage = 'pro';
            renderStageSwitcher();
            updateStageVisibility();
        });
    };

    /**
     * Shows/hides stage panels based on currentCustomStage.
     * In template mode all stages are hidden and the switcher disappears.
     */
    const updateStageVisibility = () => {
        const system = plugin.settings.beatSystem || 'Custom';
        const { mode } = deriveBeatSystemMode(system);
        const isCustom = mode === 'custom';

        // Stage switcher only in custom mode
        stageSwitcher.toggleClass('ert-settings-hidden', !isCustom);

        if (!isCustom) {
            // Template mode: show preview + template button, hide custom stuff
            customConfigContainer.toggleClass('ert-settings-hidden', true);
            designActionsContainer.toggleClass('ert-settings-hidden', false);
            fieldsContainer.toggleClass('ert-settings-hidden', true);
            proTemplatesContainer.toggleClass('ert-settings-hidden', true);
            return;
        }

        // Custom mode: Design shows beat list + health/actions
        customConfigContainer.toggleClass('ert-settings-hidden', currentCustomStage !== 'design');
        designActionsContainer.toggleClass('ert-settings-hidden', currentCustomStage !== 'design');
        fieldsContainer.toggleClass('ert-settings-hidden', currentCustomStage !== 'fields');
        proTemplatesContainer.toggleClass('ert-settings-hidden', currentCustomStage !== 'pro');

        // Re-trigger custom data refresh when switching to Design
        if (currentCustomStage === 'design') {
            refreshCustomBeats?.(true);
        }
    };

    const updateBeatSystemCard = (system: string) => {
        const { mode } = deriveBeatSystemMode(system);
        beatSystemCard.toggleClass('ert-beat-system-card--custom', mode === 'custom');
        renderTemplatePreview(system);
        // Reset to Design stage when switching to Custom mode
        if (mode === 'custom' && currentCustomStage !== 'design') {
            currentCustomStage = 'design';
        }
        renderStageSwitcher();
        updateStageVisibility();
    };

    const renderBeatSystemTabs = () => {
        beatSystemTabs.empty();
        const activeSystem = plugin.settings.beatSystem || 'Custom';
        beatSystemOptions.forEach((option) => {
            const isActive = option.systemName === activeSystem;
            const isCustomTab = option.systemName === 'Custom';
            const btn = beatSystemTabs.createEl('button', {
                cls: `ert-mini-tab${isCustomTab ? ' ert-mini-tab--custom' : ''}${isActive ? ` ${ERT_CLASSES.IS_ACTIVE}` : ''}`,
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': isActive ? 'true' : 'false',
                    'aria-controls': 'ert-beat-system-panel'
                }
            });
            // Custom tab gets a lucide icon (14px, inherits currentColor)
            if (isCustomTab) {
                const iconEl = btn.createSpan({ cls: 'ert-mini-tab-icon' });
                setIcon(iconEl, 'pencil-ruler');
            }
            btn.appendText(option.label);

            btn.addEventListener('click', async () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                if (isActive) return;
                plugin.settings.beatSystem = option.systemName;
                await plugin.saveSettings();
                existingBeatReady = false;
                updateTemplateButton(templateSetting, option.systemName);
                updateBeatSystemCard(option.systemName);
                renderBeatSystemTabs();
            });
        });
    };

    // ─── BEAT YAML EDITOR (Core) — always visible in Fields stage ──────
    const beatYamlSection = fieldsContainer.createDiv({ cls: ERT_CLASSES.STACK });
    const beatYamlSetting = new Settings(beatYamlSection)
        .setName('Beat fields')
        .setDesc('Customize additional YAML keys for custom beat notes. Enable fields to show in beat hover info. Use the audit below to check conformity of fields across existing beat notes.');
    // Force editor enabled so Fields content is always visible
    plugin.settings.enableBeatYamlEditor = true;

    const beatYamlContainer = beatYamlSection.createDiv({ cls: ['ert-panel', 'ert-advanced-template-card'] });

    // ─── Per-system config helpers ─────────────────────────────────────
    // Ensures the config slot for the active beat system exists and returns it (mutable reference).
    const ensureBeatConfig = (): BeatSystemConfig => {
        const system = plugin.settings.beatSystem ?? 'Save The Cat';
        const key = system === 'Custom'
            ? `custom:${plugin.settings.activeCustomBeatSystemId ?? 'default'}`
            : system;
        if (!plugin.settings.beatSystemConfigs) plugin.settings.beatSystemConfigs = {};
        if (!plugin.settings.beatSystemConfigs[key]) {
            plugin.settings.beatSystemConfigs[key] = { beatYamlAdvanced: '', beatHoverMetadataFields: [] };
        }
        return plugin.settings.beatSystemConfigs[key];
    };

    // Beat hover metadata helpers (operate on active system's config slot)
    const getBeatHoverMetadata = (key: string): HoverMetadataField | undefined => {
        return getBeatConfigForSystem(plugin.settings).beatHoverMetadataFields.find(f => f.key === key);
    };

    const setBeatHoverMetadata = (key: string, icon: string, enabled: boolean) => {
        const config = ensureBeatConfig();
        const existing = config.beatHoverMetadataFields.find(f => f.key === key);
        if (existing) {
            existing.icon = icon;
            existing.enabled = enabled;
        } else {
            config.beatHoverMetadataFields.push({ key, label: key, icon, enabled });
        }
        void plugin.saveSettings();
    };

    const removeBeatHoverMetadata = (key: string) => {
        const config = ensureBeatConfig();
        config.beatHoverMetadataFields = config.beatHoverMetadataFields.filter(f => f.key !== key);
        void plugin.saveSettings();
    };

    const renameBeatHoverMetadataKey = (oldKey: string, newKey: string) => {
        const config = ensureBeatConfig();
        const existing = config.beatHoverMetadataFields.find(f => f.key === oldKey);
        if (existing) {
            existing.key = newKey;
            void plugin.saveSettings();
        }
    };

    let updateBeatHoverPreview: (() => void) | undefined;

    const beatBaseTemplate = DEFAULT_SETTINGS.beatYamlTemplates!.base;
    const beatBaseKeys = extractKeysInOrder(beatBaseTemplate);
    // Keys that are blocked from new beat writes (legacy or inapplicable).
    const beatDisallowedNewWriteKeys = new Set(['Description']);

    const renderBeatYamlEditor = () => {
        beatYamlContainer.empty();

        const currentBeatAdvanced = getBeatConfigForSystem(plugin.settings).beatYamlAdvanced;
        const beatAdvancedObj = safeParseYaml(currentBeatAdvanced);

        const beatOptionalOrder = extractKeysInOrder(currentBeatAdvanced).filter(
            k => !beatBaseKeys.includes(k)
        );
        const beatEntries: TemplateEntry[] = beatOptionalOrder.map(key => ({
            key,
            value: beatAdvancedObj[key] ?? '',
            required: false
        }));

        let beatWorkingEntries = beatEntries;
        let beatDragIndex: number | null = null;

        const saveBeatEntries = (nextEntries: TemplateEntry[]) => {
            beatWorkingEntries = nextEntries;
            const yaml = buildYamlFromEntries(nextEntries);
            const config = ensureBeatConfig();
            config.beatYamlAdvanced = yaml;
            void plugin.saveSettings();
        };

        const rerenderBeatYaml = (next?: TemplateEntry[]) => {
            const data = next ?? beatWorkingEntries;
            beatWorkingEntries = data;
            beatYamlContainer.empty();

            // Read-only base fields (collapsed summary)
            const baseCard = beatYamlContainer.createDiv({ cls: 'ert-template-base-summary' });
            baseCard.createDiv({ cls: 'ert-template-base-heading', text: 'Base fields (read-only)' });
            const basePills = baseCard.createDiv({ cls: 'ert-template-base-pills' });
            beatBaseKeys.forEach(k => {
                basePills.createSpan({ cls: 'ert-template-base-pill', text: k });
            });

            // Editable advanced entries
            const listEl = beatYamlContainer.createDiv({ cls: ['ert-template-entries', 'ert-template-indent'] });

            if (data.length > 0) {
                listEl.createDiv({ cls: 'ert-template-section-label', text: 'Custom fields' });
            }

            const renderBeatEntryRow = (entry: TemplateEntry, idx: number, list: TemplateEntry[]) => {
                const row = listEl.createDiv({ cls: ['ert-yaml-row', 'ert-yaml-row--hover-meta'] });

                const hoverMeta = getBeatHoverMetadata(entry.key);
                const currentIcon = hoverMeta?.icon ?? DEFAULT_HOVER_ICON;
                const currentEnabled = hoverMeta?.enabled ?? false;

                // Drag handle
                const dragHandle = row.createDiv({ cls: 'ert-drag-handle' });
                dragHandle.draggable = true;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, 'Drag to reorder');

                row.createDiv({ cls: 'ert-grid-spacer' });

                // Icon input
                const iconWrapper = row.createDiv({ cls: 'ert-hover-icon-wrapper' });
                const iconPreview = iconWrapper.createDiv({ cls: 'ert-hover-icon-preview' });
                setIcon(iconPreview, currentIcon);
                const iconInput = iconWrapper.createEl('input', {
                    type: 'text',
                    cls: 'ert-input ert-input--lg ert-icon-input',
                    attr: { placeholder: 'Icon name...' }
                });
                iconInput.value = currentIcon;
                setTooltip(iconInput, 'Lucide icon name for hover synopsis');

                // Hover checkbox
                const checkboxWrapper = row.createDiv({ cls: 'ert-hover-checkbox-wrapper' });
                const checkbox = checkboxWrapper.createEl('input', {
                    type: 'checkbox',
                    cls: 'ert-hover-checkbox'
                });
                checkbox.checked = currentEnabled;
                setTooltip(checkbox, 'Show in beat hover synopsis');

                new IconSuggest(app, iconInput, (selectedIcon) => {
                    iconInput.value = selectedIcon;
                    iconPreview.empty();
                    setIcon(iconPreview, selectedIcon);
                    setBeatHoverMetadata(entry.key, selectedIcon, checkbox.checked);
                    updateBeatHoverPreview?.();
                });

                iconInput.oninput = () => {
                    const iconName = iconInput.value.trim();
                    if (iconName && getIconIds().includes(iconName)) {
                        iconPreview.empty();
                        setIcon(iconPreview, iconName);
                        setBeatHoverMetadata(entry.key, iconName, checkbox.checked);
                        updateBeatHoverPreview?.();
                    }
                };

                checkbox.onchange = () => {
                    const iconName = iconInput.value.trim() || DEFAULT_HOVER_ICON;
                    setBeatHoverMetadata(entry.key, iconName, checkbox.checked);
                    updateBeatHoverPreview?.();
                };

                // Key input
                const keyInput = row.createEl('input', { type: 'text', cls: 'ert-input ert-input--md' });
                keyInput.value = entry.key;
                keyInput.placeholder = 'Key';
                keyInput.onchange = () => {
                    const newKey = keyInput.value.trim();
                    if (!newKey) { keyInput.value = entry.key; return; }
                    if (beatBaseKeys.includes(newKey)) {
                        new Notice(`"${newKey}" is a base beat field. Choose another name.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    if (beatDisallowedNewWriteKeys.has(newKey)) {
                        new Notice(`"${newKey}" is a legacy beat key. Use "Purpose" instead.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    if (list.some((e, i) => i !== idx && e.key === newKey)) {
                        new Notice(`Key "${newKey}" already exists.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    renameBeatHoverMetadataKey(entry.key, newKey);
                    const nextList = [...list];
                    nextList[idx] = { ...entry, key: newKey };
                    saveBeatEntries(nextList);
                    rerenderBeatYaml(nextList);
                    updateBeatHoverPreview?.();
                };

                // Value input
                const value = entry.value;
                const valInput = row.createEl('input', { type: 'text', cls: 'ert-input ert-input--md' });
                if (Array.isArray(value)) {
                    valInput.value = value.join(', ');
                    valInput.placeholder = 'Comma-separated values';
                    valInput.onchange = () => {
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: valInput.value.split(',').map(s => s.trim()).filter(Boolean) };
                        saveBeatEntries(nextList);
                        updateBeatHoverPreview?.();
                    };
                } else {
                    valInput.value = typeof value === 'string' ? value : '';
                    valInput.placeholder = 'Default value (optional)';
                    valInput.onchange = () => {
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: valInput.value };
                        saveBeatEntries(nextList);
                        updateBeatHoverPreview?.();
                    };
                }

                // Delete button (matches scene: ert-iconBtn + trash icon)
                const delBtn = row.createEl('button', { cls: 'ert-iconBtn', attr: { type: 'button', 'aria-label': 'Remove field' } });
                setIcon(delBtn, 'trash');
                setTooltip(delBtn, 'Remove field');
                delBtn.onclick = () => {
                    removeBeatHoverMetadata(entry.key);
                    const nextList = list.filter((_, i) => i !== idx);
                    saveBeatEntries(nextList);
                    rerenderBeatYaml(nextList);
                    updateBeatHoverPreview?.();
                };

                // Drag events (matches scene: is-dragging / ert-template-dragover + plugin.registerDomEvent)
                plugin.registerDomEvent(dragHandle, 'dragstart', (e) => {
                    beatDragIndex = idx;
                    row.addClass('is-dragging');
                    e.dataTransfer?.setData('text/plain', String(idx));
                });
                plugin.registerDomEvent(dragHandle, 'dragend', () => {
                    beatDragIndex = null;
                    row.removeClass('is-dragging');
                });
                plugin.registerDomEvent(row, 'dragover', (e) => { e.preventDefault(); row.addClass('ert-template-dragover'); });
                plugin.registerDomEvent(row, 'dragleave', () => { row.removeClass('ert-template-dragover'); });
                plugin.registerDomEvent(row, 'drop', (e) => {
                    e.preventDefault();
                    row.removeClass('ert-template-dragover');
                    if (beatDragIndex === null || beatDragIndex === idx) return;
                    const nextList = [...list];
                    const [moved] = nextList.splice(beatDragIndex, 1);
                    nextList.splice(idx, 0, moved);
                    saveBeatEntries(nextList);
                    rerenderBeatYaml(nextList);
                    updateBeatHoverPreview?.();
                });
            };

            data.forEach((entry, idx) => renderBeatEntryRow(entry, idx, data));

            // Add new field row — no drag handle or spacer; those waste space
            // on the add row where nothing is draggable.
            const addRow = listEl.createDiv({ cls: ['ert-yaml-row', 'ert-yaml-row--add', 'ert-yaml-row--add-beat'] });

            // 1. Icon input with preview for new entry
            const addIconWrapper = addRow.createDiv({ cls: 'ert-hover-icon-wrapper' });
            const addIconPreview = addIconWrapper.createDiv({ cls: 'ert-hover-icon-preview' });
            setIcon(addIconPreview, DEFAULT_HOVER_ICON);
            const addIconInput = addIconWrapper.createEl('input', {
                type: 'text',
                cls: 'ert-input ert-input--lg ert-icon-input',
                attr: { placeholder: 'Icon name...' }
            });
            addIconInput.value = DEFAULT_HOVER_ICON;
            setTooltip(addIconInput, 'Lucide icon name for beat hover synopsis');

            new IconSuggest(app, addIconInput, (selectedIcon) => {
                addIconInput.value = selectedIcon;
                addIconPreview.empty();
                setIcon(addIconPreview, selectedIcon);
            });

            addIconInput.oninput = () => {
                const iconName = addIconInput.value.trim();
                if (iconName && getIconIds().includes(iconName)) {
                    addIconPreview.empty();
                    setIcon(addIconPreview, iconName);
                }
            };

            // 2. Checkbox for new entry (default unchecked)
            const addCheckboxWrapper = addRow.createDiv({ cls: 'ert-hover-checkbox-wrapper' });
            const addCheckbox = addCheckboxWrapper.createEl('input', {
                type: 'checkbox',
                cls: 'ert-hover-checkbox'
            });
            addCheckbox.checked = false;
            setTooltip(addCheckbox, 'Show in beat hover synopsis');

            // 3. Key input
            const addKeyInput = addRow.createEl('input', { type: 'text', cls: 'ert-input ert-input--md', attr: { placeholder: 'New key' } });

            // 4. Value input
            const addValInput = addRow.createEl('input', { type: 'text', cls: 'ert-input ert-input--md', attr: { placeholder: 'Value' } }) as HTMLInputElement;

            // 5. Buttons wrapper (holds add + revert)
            const btnWrap = addRow.createDiv({ cls: ['ert-iconBtnGroup', 'ert-template-actions'] });

            const addBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-mod-cta'] });
            setIcon(addBtn, 'plus');
            setTooltip(addBtn, 'Add custom beat YAML field');

            const doAddBeatField = () => {
                const newKey = addKeyInput.value.trim();
                if (!newKey) return;
                if (beatBaseKeys.includes(newKey)) {
                    new Notice(`"${newKey}" is a base beat field.`);
                    return;
                }
                if (beatDisallowedNewWriteKeys.has(newKey)) {
                    new Notice(`"${newKey}" is a legacy beat key. Use "Purpose" instead.`);
                    return;
                }
                if (data.some(e => e.key === newKey)) {
                    new Notice(`"${newKey}" already exists.`);
                    return;
                }
                // Save hover metadata for new key
                const iconName = addIconInput.value.trim() || DEFAULT_HOVER_ICON;
                if (addCheckbox.checked || iconName !== DEFAULT_HOVER_ICON) {
                    setBeatHoverMetadata(newKey, iconName, addCheckbox.checked);
                }
                const nextList = [...data, { key: newKey, value: addValInput.value || '', required: false }];
                saveBeatEntries(nextList);
                rerenderBeatYaml(nextList);
                updateBeatHoverPreview?.();
            };
            addBtn.onclick = doAddBeatField;
            addKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAddBeatField(); } });

            const revertBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-template-reset-btn'] });
            setIcon(revertBtn, 'rotate-ccw');
            setTooltip(revertBtn, 'Revert beat YAML to default');
            revertBtn.onclick = async () => {
                const confirmed = await new Promise<boolean>((resolve) => {
                    const modal = new Modal(app);
                    const { modalEl, contentEl } = modal;
                    modal.titleEl.setText('');
                    contentEl.empty();

                    modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                    contentEl.addClass('ert-modal-container', 'ert-stack');

                    const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                    header.createSpan({ text: 'Warning', cls: 'ert-modal-badge' });
                    header.createDiv({ text: 'Reset beat YAML template', cls: 'ert-modal-title' });
                    header.createDiv({ text: 'Resetting will delete all custom beat fields, lucide icons, and restore the default template.', cls: 'ert-modal-subtitle' });

                    const body = contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                    body.createDiv({ text: 'Are you sure you want to reset? This cannot be undone.', cls: 'ert-purge-warning' });

                    const actionsRow = contentEl.createDiv({ cls: ['ert-modal-actions', 'ert-inline-actions'] });

                    new ButtonComponent(actionsRow)
                        .setButtonText('Reset to default')
                        .setWarning()
                        .onClick(() => {
                            modal.close();
                            resolve(true);
                        });

                    new ButtonComponent(actionsRow)
                        .setButtonText('Cancel')
                        .onClick(() => {
                            modal.close();
                            resolve(false);
                        });

                    modal.open();
                });

                if (!confirmed) return;

                const resetConfig = ensureBeatConfig();
                resetConfig.beatYamlAdvanced = '';
                resetConfig.beatHoverMetadataFields = [];
                await plugin.saveSettings();
                rerenderBeatYaml([]);
                updateBeatHoverPreview?.();
            };
        };

        rerenderBeatYaml(beatEntries);
    };

    renderBeatYamlEditor();

    // ─── BEAT HOVER METADATA PREVIEW (Core) ───────────────────────────
    const beatHoverPreviewContainer = beatYamlSection.createDiv({
        cls: ['ert-previewFrame', 'ert-previewFrame--center', 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'beat-metadata' }
    });
    const beatHoverPreviewHeading = beatHoverPreviewContainer.createDiv({ cls: 'ert-planetary-preview-heading', text: 'Beat Hover Metadata Preview' });
    const beatHoverPreviewBody = beatHoverPreviewContainer.createDiv({ cls: ['ert-hover-preview-body', 'ert-stack'] });

    const renderBeatHoverPreview = () => {
        beatHoverPreviewBody.empty();
        const activeConfig = getBeatConfigForSystem(plugin.settings);
        const enabledFields = activeConfig.beatHoverMetadataFields.filter(f => f.enabled);
        const currentBeatAdv = activeConfig.beatYamlAdvanced;
        const templateObj = safeParseYaml(currentBeatAdv);

        if (enabledFields.length === 0) {
            beatHoverPreviewContainer.removeClass('ert-settings-hidden');
            beatHoverPreviewHeading.setText('Beat Hover Metadata Preview (none enabled)');
            beatHoverPreviewBody.createDiv({ text: 'Enable fields using the checkboxes above to show them in beat hover synopsis.', cls: 'ert-hover-preview-empty' });
            return;
        }
        beatHoverPreviewContainer.removeClass('ert-settings-hidden');
        beatHoverPreviewHeading.setText(`Beat Hover Metadata Preview (${enabledFields.length} field${enabledFields.length > 1 ? 's' : ''})`);

        enabledFields.forEach(field => {
            const lineEl = beatHoverPreviewBody.createDiv({ cls: 'ert-hover-preview-line' });
            const iconEl = lineEl.createSpan({ cls: 'ert-hover-preview-icon' });
            setIcon(iconEl, field.icon || DEFAULT_HOVER_ICON);
            const value = templateObj[field.key];
            const valueStr = Array.isArray(value) ? value.join(', ') : (value ?? '');
            const displayText = valueStr ? `${field.key}: ${valueStr}` : field.key;
            lineEl.createSpan({ text: displayText, cls: 'ert-hover-preview-text' });
        });
    };

    updateBeatHoverPreview = renderBeatHoverPreview;
    renderBeatHoverPreview();

    // ─── SAVED BEAT SYSTEMS (Pro) — Campaign Manager card scaffold ────
    const proActive = isProfessionalActive(plugin);

    // Pro saved systems: lives in PRO Sets stage (stage 3).
    // Normal panel styling; Pro pill on heading communicates premium status.
    const savedCard = proTemplatesContainer.createDiv({
        cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-saved-beat-systems`
    });
    if (!proActive) savedCard.addClass('ert-pro-locked');

    // Card header — ert-skin--pro scoped to header only so the Pro pill
    // picks up its gradient without painting the whole card purple.
    const savedHeaderRow = savedCard.createDiv({ cls: `${ERT_CLASSES.PANEL_HEADER} ${ERT_CLASSES.SKIN_PRO}` });
    const savedTitleArea = savedHeaderRow.createDiv({ cls: 'ert-control' });
    const savedTitleRow = savedTitleArea.createEl('h4', { cls: `${ERT_CLASSES.SECTION_TITLE} ${ERT_CLASSES.INLINE}` });
    const savedProPill = savedTitleRow.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}` });
    setIcon(savedProPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), 'signature');
    savedProPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
    savedTitleRow.createSpan({ text: ' Saved beat systems' });

    savedCard.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Save and switch between multiple beat systems. Each set stores beats, custom YAML fields, and hover metadata. Core: one active system. Pro: many saved sets.'
    });

    const savedControlsContainer = savedCard.createDiv({ cls: ERT_CLASSES.STACK });

    /** Check whether the active custom system has unsaved changes vs its saved copy. */
    const hasUnsavedChanges = (): boolean => {
        const savedSystems: SavedBeatSystem[] = plugin.settings.savedBeatSystems ?? [];
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
        const saved = savedSystems.find(s => s.id === activeId);
        if (!saved) return false; // Never saved — nothing to compare against
        const currentName = plugin.settings.customBeatSystemName || 'Custom';
        if (currentName !== saved.name) return true;
        const currentBeats = plugin.settings.customBeatSystemBeats ?? [];
        if (currentBeats.length !== saved.beats.length) return true;
        for (let i = 0; i < currentBeats.length; i++) {
            const cb = currentBeats[i];
            const sb = saved.beats[i];
            const cName = typeof cb === 'string' ? cb : (cb as BeatRow).name;
            const sName = typeof sb === 'string' ? sb : (sb as BeatRow).name;
            const cAct = typeof cb === 'string' ? 1 : (cb as BeatRow).act;
            const sAct = typeof sb === 'string' ? 1 : (sb as BeatRow).act;
            if (cName !== sName || cAct !== sAct) return true;
        }
        const activeConfig = getBeatConfigForSystem(plugin.settings);
        if ((activeConfig.beatYamlAdvanced || '') !== (saved.beatYamlAdvanced || '')) return true;
        return false;
    };

    /** Apply a saved system as the active system and refresh UI. */
    const applyLoadedSystem = (system: SavedBeatSystem) => {
        plugin.settings.customBeatSystemName = system.name;
        plugin.settings.customBeatSystemBeats = system.beats.map(b => ({ ...b }));
        plugin.settings.activeCustomBeatSystemId = system.id;
        // Ensure config map exists and write per-system config
        if (!plugin.settings.beatSystemConfigs) plugin.settings.beatSystemConfigs = {};
        plugin.settings.beatSystemConfigs[`custom:${system.id}`] = {
            beatYamlAdvanced: system.beatYamlAdvanced ?? '',
            beatHoverMetadataFields: system.beatHoverMetadataFields
                ? system.beatHoverMetadataFields.map(f => ({ ...f }))
                : [],
        };
        void plugin.saveSettings();
        new Notice(`Loaded beat system "${system.name}".`);
        // Full UI refresh — re-render the entire templates section
        renderStoryBeatsSection({ app, plugin, containerEl });
    };

    const renderSavedBeatSystems = () => {
        savedControlsContainer.empty();

        if (!proActive) {
            savedControlsContainer.createDiv({ cls: 'ert-pro-locked-hint', text: 'Core includes 1 custom beat system.' });
        }

        const savedSystems: SavedBeatSystem[] = plugin.settings.savedBeatSystems ?? [];
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
        const unsaved = hasUnsavedChanges();

        // Dropdown
        const selectRow = new Settings(savedControlsContainer)
            .setName('Load a saved beat system')
            .addDropdown(drop => {
                drop.addOption('', savedSystems.length > 0 ? 'Select a system...' : '—');
                savedSystems.forEach(s => {
                    drop.addOption(s.id, `${s.name} (${s.beats.length} beats)`);
                });

                // Auto-select the currently active system if it exists in saved
                const activeMatch = savedSystems.find(s => s.id === activeId);
                if (activeMatch) {
                    drop.setValue(activeMatch.id);
                }

                drop.onChange(value => {
                    if (!value) return;
                    const system = savedSystems.find(s => s.id === value);
                    if (!system) return;

                    // Warn if there are unsaved changes before loading
                    if (hasUnsavedChanges()) {
                        const confirmModal = new Modal(app);
                        const { contentEl } = confirmModal;
                        contentEl.empty();
                        contentEl.addClass('ert-modal-container', 'ert-stack');
                        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                        header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                        header.createDiv({ cls: 'ert-modal-title', text: 'Unsaved changes' });
                        header.createDiv({ cls: 'ert-modal-subtitle', text: `Your current system has changes that haven't been saved. Loading "${system.name}" will replace them.` });
                        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
                        new ButtonComponent(footer).setButtonText('Load anyway').setCta().onClick(() => {
                            confirmModal.close();
                            applyLoadedSystem(system);
                        });
                        new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
                            confirmModal.close();
                            // Reset dropdown to the previously selected value
                            const prevMatch = savedSystems.find(s => s.id === activeId);
                            const selEl = selectRow.settingEl.querySelector('select');
                            if (selEl) selEl.value = prevMatch ? prevMatch.id : '';
                        });
                        footer.querySelectorAll('button').forEach(btn => { (btn as HTMLElement).style.cursor = 'pointer'; });
                        confirmModal.open();
                        return;
                    }

                    applyLoadedSystem(system);
                });
            });
        selectRow.settingEl.addClass('ert-saved-beat-select');

        // Show unsaved warning on dropdown
        if (unsaved) {
            const selectEl = selectRow.settingEl.querySelector('select');
            if (selectEl) selectEl.classList.add('ert-dropdown--unsaved');
            selectRow.settingEl.createDiv({ cls: 'ert-unsaved-hint', text: 'Unsaved changes — save your current system before switching.' });
        }

        // Action buttons (right-aligned under dropdown)
        const actionsRow = savedControlsContainer.createDiv({ cls: 'ert-inline-actions' });
        actionsRow.style.justifyContent = 'flex-end';

        // Save current (with "Save As" name prompt)
        new ButtonComponent(actionsRow)
            .setButtonText('Save current system')
            .onClick(async () => {
                const currentBeats = (plugin.settings.customBeatSystemBeats || []).map(b => ({ ...b }));
                if (currentBeats.length === 0) {
                    new Notice('No beats defined. Add beats before saving.');
                    return;
                }

                // Read from the active custom config slot
                const activeConfig = getBeatConfigForSystem(plugin.settings);

                // "Save As" prompt — defaults to current custom name
                const defaultName = plugin.settings.customBeatSystemName || 'Custom';
                const saveName = await new Promise<string | null>((resolve) => {
                    const modal = new Modal(app);
                    const { modalEl, contentEl } = modal;
                    modal.titleEl.setText('');
                    contentEl.empty();
                    modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                    contentEl.addClass('ert-modal-container', 'ert-stack');
                    const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                    header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                    header.createDiv({ cls: 'ert-modal-title', text: 'Save beat system' });
                    header.createDiv({ cls: 'ert-modal-subtitle', text: 'Enter a name for this beat system. Existing systems with the same name will be updated.' });
                    const inputRow = contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                    const nameInput = inputRow.createEl('input', {
                        type: 'text',
                        cls: 'ert-input ert-input--md',
                        attr: { placeholder: 'System name', value: defaultName }
                    }) as HTMLInputElement;
                    nameInput.value = defaultName;
                    nameInput.style.width = '100%'; // SAFE: inline style used for modal input full-width
                    const actionsDiv = contentEl.createDiv({ cls: ['ert-modal-actions', 'ert-inline-actions'] });
                    new ButtonComponent(actionsDiv).setButtonText('Save').setCta().onClick(() => {
                        const name = nameInput.value.trim();
                        modal.close();
                        resolve(name || null);
                    });
                    new ButtonComponent(actionsDiv).setButtonText('Cancel').onClick(() => { modal.close(); resolve(null); });
                    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const name = nameInput.value.trim(); modal.close(); resolve(name || null); } });
                    modal.open();
                    // Focus the input after modal opens
                    setTimeout(() => nameInput.focus(), 50);
                });

                if (!saveName) return;

                const existingSystems = plugin.settings.savedBeatSystems ?? [];
                const existingIdx = existingSystems.findIndex(s => s.name === saveName);

                const newSystem: SavedBeatSystem = {
                    id: existingIdx >= 0 ? existingSystems[existingIdx].id : `${Date.now()}`,
                    name: saveName,
                    beats: currentBeats,
                    beatYamlAdvanced: activeConfig.beatYamlAdvanced,
                    beatHoverMetadataFields: activeConfig.beatHoverMetadataFields.map(f => ({ ...f })),
                    createdAt: new Date().toISOString()
                };

                // Also write the config slot for this system
                if (!plugin.settings.beatSystemConfigs) plugin.settings.beatSystemConfigs = {};
                plugin.settings.beatSystemConfigs[`custom:${newSystem.id}`] = {
                    beatYamlAdvanced: newSystem.beatYamlAdvanced ?? '',
                    beatHoverMetadataFields: newSystem.beatHoverMetadataFields?.map(f => ({ ...f })) ?? [],
                };

                if (existingIdx >= 0) {
                    existingSystems[existingIdx] = newSystem;
                } else {
                    existingSystems.unshift(newSystem);
                }
                plugin.settings.savedBeatSystems = existingSystems;
                plugin.settings.activeCustomBeatSystemId = newSystem.id;
                plugin.settings.customBeatSystemName = saveName;
                await plugin.saveSettings();
                new Notice(`Beat system "${saveName}" ${existingIdx >= 0 ? 'updated' : 'saved'}.`);
                renderSavedBeatSystems();
            });

        // Delete selected
        new ButtonComponent(actionsRow)
            .setButtonText('Delete selected')
            .setWarning()
            .setDisabled(savedSystems.length === 0)
            .onClick(async () => {
                const selectEl = savedControlsContainer.querySelector('select') as HTMLSelectElement | null;
                const selectedId = selectEl?.value;
                if (!selectedId) {
                    new Notice('Select a system to delete.');
                    return;
                }
                const system = savedSystems.find(s => s.id === selectedId);
                if (!system) return;
                // Confirmation modal (mirrors Book Designer delete pattern)
                const confirmModal = new Modal(app);
                confirmModal.contentEl.empty();
                confirmModal.contentEl.addClass('ert-modal-container', 'ert-stack');
                const header = confirmModal.contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                header.createDiv({ cls: 'ert-modal-title', text: 'Delete saved system' });
                header.createDiv({ cls: 'ert-modal-subtitle', text: `Delete "${system.name}"? This cannot be undone.` });
                const footer = confirmModal.contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer).setButtonText('Delete').setCta().onClick(async () => {
                    plugin.settings.savedBeatSystems = savedSystems.filter(s => s.id !== selectedId);
                    // Clean up the config slot for this system
                    if (plugin.settings.beatSystemConfigs) {
                        delete plugin.settings.beatSystemConfigs[`custom:${selectedId}`];
                    }
                    // If the deleted system was active, fall back to custom:default
                    if (plugin.settings.activeCustomBeatSystemId === selectedId) {
                        plugin.settings.activeCustomBeatSystemId = 'default';
                    }
                    await plugin.saveSettings();
                    confirmModal.close();
                    new Notice(`Deleted beat system "${system.name}".`);
                    renderSavedBeatSystems();
                });
                new ButtonComponent(footer).setButtonText('Cancel').onClick(() => confirmModal.close());
                footer.querySelectorAll('button').forEach(btn => { (btn as HTMLElement).style.cursor = 'pointer'; });
                confirmModal.open();
            });
    };

    renderSavedBeatSystems();
    updateBeatSystemCard(plugin.settings.beatSystem || 'Custom');
    renderBeatSystemTabs();

    // Scene YAML Templates Section
    const yamlHeading = new Settings(yamlStack)
        .setName('Remap metadata & advanced scene YAML templates')
        .setHeading();
    addHeadingIcon(yamlHeading, 'form');
    addWikiLink(yamlHeading, 'Settings#yaml-templates');
    applyErtHeaderLayout(yamlHeading);

    // Frontmatter remapper (moved here) - separate from template editor visibility
    const remapContainer = yamlStack.createDiv();
    renderMetadataSection({ app, plugin, containerEl: remapContainer });

    let onAdvancedToggle: (() => void) | undefined;

    const advancedYamlSetting = new Settings(yamlStack)
        .setName('Advanced YAML editor')
        .setDesc('Setup custom scene YAML keys for the advanced YAML template. Enable fields to reveal in scene hover synopsis. Type any keyword to search for a perfect lucide icon. Reorder fields to match your preferred order.');
    const advancedToggleButton = advancedYamlSetting.controlEl.createEl('button', {
        cls: ERT_CLASSES.ICON_BTN,
        attr: {
            type: 'button',
            'aria-label': 'Show advanced YAML editor'
        }
    });
    const refreshAdvancedToggle = () => {
        const expanded = plugin.settings.enableAdvancedYamlEditor ?? false;
        setIcon(advancedToggleButton, expanded ? 'chevron-down' : 'chevron-right');
        setTooltip(advancedToggleButton, expanded ? 'Hide advanced YAML editor' : 'Show advanced YAML editor');
        advancedToggleButton.setAttribute('aria-label', expanded ? 'Hide advanced YAML editor' : 'Show advanced YAML editor');
    };
    refreshAdvancedToggle();
    // SAFE: Settings sections are standalone functions without Component lifecycle; Obsidian manages settings tab cleanup
    advancedToggleButton.addEventListener('click', async () => {
        const next = !(plugin.settings.enableAdvancedYamlEditor ?? false);
        plugin.settings.enableAdvancedYamlEditor = next;
        refreshAdvancedToggle();
        await plugin.saveSettings();
        onAdvancedToggle?.();
    });

    const templateSection = yamlStack.createDiv({ cls: ['ert-scene-template-editor', 'ert-stack'] });

    const advancedContainer = templateSection.createDiv({ cls: ['ert-panel', 'ert-advanced-template-card'] });

    // Helper functions for hover metadata management
    const getHoverMetadata = (key: string): HoverMetadataField | undefined => {
        return plugin.settings.hoverMetadataFields?.find(f => f.key === key);
    };

    const setHoverMetadata = (key: string, icon: string, enabled: boolean) => {
        if (!plugin.settings.hoverMetadataFields) {
            plugin.settings.hoverMetadataFields = [];
        }
        const existing = plugin.settings.hoverMetadataFields.find(f => f.key === key);
        if (existing) {
            existing.icon = icon;
            existing.enabled = enabled;
        } else {
            plugin.settings.hoverMetadataFields.push({ key, label: key, icon, enabled });
        }
        void plugin.saveSettings();
    };

    const removeHoverMetadata = (key: string) => {
        if (plugin.settings.hoverMetadataFields) {
            plugin.settings.hoverMetadataFields = plugin.settings.hoverMetadataFields.filter(f => f.key !== key);
            void plugin.saveSettings();
        }
    };

    const renameHoverMetadataKey = (oldKey: string, newKey: string) => {
        const existing = plugin.settings.hoverMetadataFields?.find(f => f.key === oldKey);
        if (existing) {
            existing.key = newKey;
            void plugin.saveSettings();
        }
    };

    // Reorder hoverMetadataFields to match YAML template order
    const reorderHoverMetadataToMatchYaml = (yamlKeys: string[]) => {
        if (!plugin.settings.hoverMetadataFields) return;
        const keyOrder = new Map(yamlKeys.map((k, i) => [k, i]));
        plugin.settings.hoverMetadataFields.sort((a, b) => {
            const aIdx = keyOrder.get(a.key) ?? Infinity;
            const bIdx = keyOrder.get(b.key) ?? Infinity;
            return aIdx - bIdx;
        });
        void plugin.saveSettings();
    };

    // Preview update function (will be set by the preview panel)
    let updateHoverPreview: (() => void) | undefined;

    const renderAdvancedTemplateEditor = () => {
        advancedContainer.empty();

        // Check if there are active migrations - auto-expand if so
        const currentTemplate = plugin.settings.sceneYamlTemplates?.advanced ?? '';
        const activeMigrations = getActiveMigrations(plugin.settings);
        const hasPendingMigrations = activeMigrations.some(m => currentTemplate.includes(`${m.oldKey}:`));
        
        let isEnabled = plugin.settings.enableAdvancedYamlEditor ?? false;
        
        // Auto-expand if migrations are pending
        if (hasPendingMigrations && !isEnabled) {
            isEnabled = true;
            plugin.settings.enableAdvancedYamlEditor = true;
            void plugin.saveSettings();
            // Update the toggle button state
            setIcon(advancedToggleButton, 'chevron-down');
            setTooltip(advancedToggleButton, 'Hide advanced YAML editor');
        }
        
        advancedContainer.toggleClass('ert-settings-hidden', !isEnabled);
        if (!isEnabled) return;

        // Prepare template data
        const defaultTemplate = DEFAULT_SETTINGS.sceneYamlTemplates!.advanced;
        // currentTemplate already declared above for migration check
        const baseTemplate = DEFAULT_SETTINGS.sceneYamlTemplates!.base;

        const requiredOrder = extractKeysInOrder(baseTemplate);
        const defaultObj = safeParseYaml(defaultTemplate);
        const currentObj = safeParseYaml(currentTemplate);

        const requiredValues: Record<string, TemplateEntryValue> = {};
        requiredOrder.forEach((key) => {
            requiredValues[key] = currentObj[key] ?? defaultObj[key] ?? '';
        });
        if (!requiredValues['Class']) {
            requiredValues['Class'] = 'Scene';
        }

        // Only discretionary (non-required) keys are editable
        const optionalOrder = mergeOrders(
            extractKeysInOrder(currentTemplate).filter(k => !requiredOrder.includes(k)),
            extractKeysInOrder(defaultTemplate).filter(k => !requiredOrder.includes(k))
        );

        const entries: TemplateEntry[] = optionalOrder.map((key) => {
            const value = currentObj[key] ?? defaultObj[key] ?? '';
            return { key, value, required: false };
        });

        let workingEntries = entries;
        let dragIndex: number | null = null;

        const advancedComments: Record<string, string> = {
            Duration: 'Free text duration (e.g., "45 minutes", "2 hours", "PT45M")',
            'Reader Emotion': 'Describe the intended reader emotion',
        };

        const guessTypeIcon = (raw: string): string | null => {
            const value = raw.trim();
            if (!value) return null;

            const isBool = /^(true|false)$/i.test(value);
            if (isBool) return 'check';

            const isNumber = /^-?\d+(\.\d+)?$/.test(value);
            if (isNumber) return 'hash';

            const isIsoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
            if (isIsoDateTime) return 'calendar-clock';

            const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
            if (isIsoDate) return 'calendar';

            const isTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(value);
            if (isTime) return 'clock';

            const isList = value.includes(',');
            if (isList) return 'list';

            const isDuration = /^\d+\s*(s|sec|secs|seconds|m|min|mins|minutes|h|hr|hrs|hours|d|day|days|wk|wks|weeks)$/i.test(value);
            if (isDuration) return 'timer';

            return 'type';
        };

        const guessYamlHint = (raw: string): string | null => {
            const value = raw.trim();
            if (!value) return null;

            const boolMatch = /^(true|false)$/i;
            const numberMatch = /^-?\d+(\.\d+)?$/;
            const isoDate = /^\d{4}-\d{2}-\d{2}$/;
            const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
            const shortDate = /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/;
            const partialDate = /[/-]/;
            const timeOnly = /^\d{1,2}:\d{2}(:\d{2})?$/;
            const partialTime = /:\d?$/;
            const durationMatch = /^\d+\s*(s|sec|secs|seconds|m|min|mins|minutes|h|hr|hrs|hours|d|day|days|wk|wks|weeks)$/i;

            if (boolMatch.test(value)) return 'Boolean: Use true/false.';
            if (numberMatch.test(value)) return 'Number: 42 or 3.14';
            if (isoDateTime.test(value)) return 'Datetime: YYYY-MM-DDTHH:MM';
            if (isoDate.test(value)) return 'Date: YYYY-MM-DD (e.g., 2025-07-23)';
            if (shortDate.test(value) || partialDate.test(value)) return 'Looks like a date. Prefer ISO: 2025-07-23 or 2025-07-23T14:30';
            if (timeOnly.test(value) || partialTime.test(value)) return 'Time: Use HH:MM or full ISO timestamp 2025-07-23T14:30';
            if (durationMatch.test(value)) return 'Duration: text like 45 minutes or ISO PT45M';
            if (value.includes(',')) return 'Multiple values? YAML list example:\\n- Item 1\\n- Item 2';
            return null;
        };

        const attachHint = (inputEl: HTMLInputElement, hintEl: HTMLElement, rowEl?: HTMLElement) => {
            const applyHint = () => {
                const hint = guessYamlHint(inputEl.value);
                if (hint) {
                    hintEl.removeClass('ert-hidden');
                    hintEl.setText(hint);
                    inputEl.setAttribute('title', hint);
                    rowEl?.addClass('ert-template-hint-row');
                } else {
                    hintEl.addClass('ert-hidden');
                    hintEl.setText('');
                    inputEl.removeAttribute('title');
                    rowEl?.removeClass('ert-template-hint-row');
                }
            };
            plugin.registerDomEvent(inputEl, 'input', applyHint);
            applyHint();
        };

        const attachTypeIcon = (inputEl: HTMLInputElement, iconEl: HTMLElement) => {
            const applyIcon = () => {
                const icon = guessTypeIcon(inputEl.value);
                if (icon) setIcon(iconEl, icon);
            };
            plugin.registerDomEvent(inputEl, 'input', applyIcon);
            applyIcon();
        };

        const saveEntries = (nextEntries: TemplateEntry[]) => {
            workingEntries = nextEntries;
            // Only save optional/advanced entries - base fields are now stored separately
            // This prevents duplication and ensures clean separation between base and advanced templates
            const yaml = buildYamlFromEntries(nextEntries, advancedComments);
            if (!plugin.settings.sceneYamlTemplates) plugin.settings.sceneYamlTemplates = { base: DEFAULT_SETTINGS.sceneYamlTemplates!.base, advanced: '' };
            plugin.settings.sceneYamlTemplates.advanced = yaml;
            void plugin.saveSettings();
        };

        const rerender = (next?: TemplateEntry[]) => {
            const data = next ?? workingEntries;
            workingEntries = data;
            advancedContainer.empty();
            advancedContainer.toggleClass('ert-settings-hidden', !isEnabled);
            if (!isEnabled) return;

            const listEl = advancedContainer.createDiv({ cls: ['ert-template-entries', 'ert-template-indent'] });

            // Get active migrations for highlighting rows that need updates
            const activeMigrations = getActiveMigrations(plugin.settings);

            const renderEntryRow = (entry: TemplateEntry, idx: number, list: TemplateEntry[]) => {
                // Check if this entry needs migration
                const migration = activeMigrations.find(m => m.oldKey === entry.key);
                const alert = migration ? REFACTOR_ALERTS.find(a => a.id === migration.alertId) : undefined;

                // Match beats row structure: all inputs are direct grid children
                const rowClasses = ['ert-yaml-row', 'ert-yaml-row--hover-meta'];
                if (migration) {
                    rowClasses.push('ert-yaml-row--needs-migration');
                    if (alert) rowClasses.push(`ert-yaml-row--${alert.severity}`);
                }
                const row = listEl.createDiv({ cls: rowClasses });

                // Get existing hover metadata for this key
                const hoverMeta = getHoverMetadata(entry.key);
                const currentIcon = hoverMeta?.icon ?? DEFAULT_HOVER_ICON;
                const currentEnabled = hoverMeta?.enabled ?? false;

                // 1. Drag handle (direct child)
                const dragHandle = row.createDiv({ cls: 'ert-drag-handle' });
                dragHandle.draggable = true;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, 'Drag to reorder key');

                // 2. Spacer (pushes rest to the right)
                row.createDiv({ cls: 'ert-grid-spacer' });

                // 3. Icon input with preview (for hover synopsis)
                const iconWrapper = row.createDiv({ cls: 'ert-hover-icon-wrapper' });
                const iconPreview = iconWrapper.createDiv({ cls: 'ert-hover-icon-preview' });
                setIcon(iconPreview, currentIcon);
                const iconInput = iconWrapper.createEl('input', { 
                    type: 'text', 
                    cls: 'ert-input ert-input--lg ert-icon-input',
                    attr: { placeholder: 'Icon name...' }
                });
                iconInput.value = currentIcon;
                setTooltip(iconInput, 'Lucide icon name for hover synopsis');

                // 4. Checkbox to enable in hover synopsis (defined before icon handlers so they can reference it)
                const checkboxWrapper = row.createDiv({ cls: 'ert-hover-checkbox-wrapper' });
                const checkbox = checkboxWrapper.createEl('input', { 
                    type: 'checkbox', 
                    cls: 'ert-hover-checkbox'
                });
                checkbox.checked = currentEnabled;
                setTooltip(checkbox, 'Show in hover synopsis');
                
                // Add icon suggester with preview (uses checkbox.checked for current state)
                new IconSuggest(app, iconInput, (selectedIcon) => {
                    iconInput.value = selectedIcon;
                    iconPreview.empty();
                    setIcon(iconPreview, selectedIcon);
                    setHoverMetadata(entry.key, selectedIcon, checkbox.checked);
                    updateHoverPreview?.();
                });
                
                iconInput.oninput = () => {
                    const iconName = iconInput.value.trim();
                    if (iconName && getIconIds().includes(iconName)) {
                        iconPreview.empty();
                        setIcon(iconPreview, iconName);
                        setHoverMetadata(entry.key, iconName, checkbox.checked);
                        updateHoverPreview?.();
                    }
                };

                checkbox.onchange = () => {
                    const iconName = iconInput.value.trim() || DEFAULT_HOVER_ICON;
                    setHoverMetadata(entry.key, iconName, checkbox.checked);
                    updateHoverPreview?.();
                };

                // 5. Key input (direct child - no wrapper!)
                const keyInput = row.createEl('input', { type: 'text', cls: 'ert-input ert-input--md' });
                keyInput.value = entry.key;
                keyInput.placeholder = 'Key';
                keyInput.onchange = () => {
                    const newKey = keyInput.value.trim();
                    if (!newKey) {
                        keyInput.value = entry.key;
                        return;
                    }
                    if (requiredOrder.includes(newKey)) {
                        new Notice(`"${newKey}" is a required base key and is auto-included. Choose another name.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    if (list.some((e, i) => i !== idx && e.key === newKey)) {
                        new Notice(`Key "${newKey}" already exists.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    // Rename the hover metadata key
                    renameHoverMetadataKey(entry.key, newKey);
                    const nextList = [...list];
                    nextList[idx] = { ...entry, key: newKey };
                    saveEntries(nextList);
                    rerender(nextList);
                    updateHoverPreview?.();
                };

                // 6. Value input (direct child - no wrapper!)
                const value = entry.value;
                const valInput = row.createEl('input', { type: 'text', cls: 'ert-input ert-input--md' });
                if (Array.isArray(value)) {
                    valInput.value = value.join(', ');
                    valInput.placeholder = 'Comma-separated values';
                    valInput.onchange = () => {
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: valInput.value.split(',').map(s => s.trim()).filter(Boolean) };
                        saveEntries(nextList);
                        updateHoverPreview?.();
                    };
                } else {
                    valInput.value = value ?? '';
                    valInput.placeholder = 'Value';
                    valInput.onchange = () => {
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: valInput.value };
                        saveEntries(nextList);
                        updateHoverPreview?.();
                    };
                }

                // 7. Action button: Migrate (if migration needed) or Delete
                if (migration && alert) {
                    // Migration button - replaces delete for entries that need updating
                    const migrateBtn = row.createEl('button', { 
                        cls: ['ert-iconBtn', 'ert-migrate-btn', `ert-migrate-btn--${alert.severity}`],
                        attr: { 'aria-label': migration.tooltip }
                    });
                    setIcon(migrateBtn, 'arrow-right-circle');
                    setTooltip(migrateBtn, migration.tooltip);
                    migrateBtn.onclick = async () => {
                        // Rename the key in the entry
                        const oldKey = entry.key;
                        entry.key = migration.newKey;
                        
                        // Update hover metadata key if it exists
                        renameHoverMetadataKey(oldKey, migration.newKey);
                        
                        // Save the updated entries
                        saveEntries(list);
                        
                        // Check if all migrations for this alert are complete
                        const template = plugin.settings.sceneYamlTemplates?.advanced ?? '';
                        const alertObj = REFACTOR_ALERTS.find(a => a.id === migration.alertId);
                        if (alertObj && areAlertMigrationsComplete(alertObj, template)) {
                            // All migrations done - auto-dismiss the alert
                            dismissAlert(migration.alertId, plugin.settings);
                            await plugin.saveSettings();
                            
                            // Remove the specific alert element from the DOM
                            const alertEl = document.querySelector(`[data-alert-id="${migration.alertId}"]`);
                            if (alertEl) {
                                alertEl.remove();
                            }
                            
                            new Notice('Migration complete! Alert dismissed.');
                        }
                        
                        // Re-render to update the UI
                        rerender(list);
                        updateHoverPreview?.();
                    };
                } else {
                    // Normal delete button
                    const delBtn = row.createEl('button', { cls: 'ert-iconBtn' });
                    setIcon(delBtn, 'trash');
                    delBtn.onclick = () => {
                        removeHoverMetadata(entry.key);
                        const nextList = list.filter((_, i) => i !== idx);
                        saveEntries(nextList);
                        rerender(nextList);
                        updateHoverPreview?.();
                    };
                }

                plugin.registerDomEvent(dragHandle, 'dragstart', (e) => {
                    dragIndex = idx;
                    row.classList.add('is-dragging');
                    e.dataTransfer?.setData('text/plain', idx.toString());
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                });

                plugin.registerDomEvent(dragHandle, 'dragend', () => {
                    row.classList.remove('is-dragging');
                    row.classList.remove('ert-template-dragover');
                    dragIndex = null;
                });

                plugin.registerDomEvent(row, 'dragover', (e) => {
                    e.preventDefault();
                    row.classList.add('ert-template-dragover');
                });

                plugin.registerDomEvent(row, 'dragleave', () => {
                    row.classList.remove('ert-template-dragover');
                });

                plugin.registerDomEvent(row, 'drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('ert-template-dragover');
                    const from = dragIndex ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
                    if (Number.isNaN(from) || from < 0 || from >= list.length || from === idx) {
                        dragIndex = null;
                        return;
                    }
                    const nextList = [...list];
                    const [moved] = nextList.splice(from, 1);
                    nextList.splice(idx, 0, moved);
                    dragIndex = null;
                    saveEntries(nextList);
                    // Keep hover metadata order in sync with YAML template order
                    reorderHoverMetadataToMatchYaml(nextList.map(e => e.key));
                    rerender(nextList);
                    updateHoverPreview?.();
                });
            };

            data.forEach((entry, idx, arr) => renderEntryRow(entry, idx, arr));

            // Add new key/value - inside listEl so it gets the indent border
            const addRow = listEl.createDiv({ cls: ['ert-yaml-row', 'ert-yaml-row--add', 'ert-yaml-row--hover-meta'] });

            // 1. Handle placeholder (direct child)
            addRow.createDiv({ cls: ['ert-drag-handle', 'ert-drag-placeholder'] });

            // 2. Spacer (direct child)
            addRow.createDiv({ cls: 'ert-grid-spacer' });

            // 3. Icon input with preview for new entry
            const addIconWrapper = addRow.createDiv({ cls: 'ert-hover-icon-wrapper' });
            const addIconPreview = addIconWrapper.createDiv({ cls: 'ert-hover-icon-preview' });
            setIcon(addIconPreview, DEFAULT_HOVER_ICON);
            const addIconInput = addIconWrapper.createEl('input', { 
                type: 'text', 
                cls: 'ert-input ert-input--lg ert-icon-input',
                attr: { placeholder: 'Icon name...' }
            });
            addIconInput.value = DEFAULT_HOVER_ICON;
            setTooltip(addIconInput, 'Lucide icon name for hover synopsis');
            
            // Add icon suggester with preview
            new IconSuggest(app, addIconInput, (selectedIcon) => {
                addIconInput.value = selectedIcon;
                addIconPreview.empty();
                setIcon(addIconPreview, selectedIcon);
            });
            
            addIconInput.oninput = () => {
                const iconName = addIconInput.value.trim();
                if (iconName && getIconIds().includes(iconName)) {
                    addIconPreview.empty();
                    setIcon(addIconPreview, iconName);
                }
            };

            // 4. Checkbox for new entry (default unchecked)
            const addCheckboxWrapper = addRow.createDiv({ cls: 'ert-hover-checkbox-wrapper' });
            const addCheckbox = addCheckboxWrapper.createEl('input', { 
                type: 'checkbox', 
                cls: 'ert-hover-checkbox'
            });
            addCheckbox.checked = false;
            setTooltip(addCheckbox, 'Show in hover synopsis');

            // 5. Key input (direct child - no wrapper!)
            const keyInput = addRow.createEl('input', { type: 'text', cls: 'ert-input ert-input--md', attr: { placeholder: 'New key' } });

            // 6. Value input (direct child - no wrapper!)
            const valInput = addRow.createEl('input', { type: 'text', cls: 'ert-input ert-input--md', attr: { placeholder: 'Value' } }) as HTMLInputElement;

            // 7. Buttons wrapper (holds both + and reset)
            const btnWrap = addRow.createDiv({ cls: ['ert-iconBtnGroup', 'ert-template-actions'] });

            const addBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-mod-cta'] });
            setIcon(addBtn, 'plus');
            setTooltip(addBtn, 'Add key');
            addBtn.onclick = () => {
                const k = (keyInput.value || '').trim();
                if (!k) return;
                if (requiredOrder.includes(k)) {
                    new Notice(`"${k}" is required and already present via the base template.`);
                    return;
                }
                if (data.some(e => e.key === k)) {
                    new Notice(`Key "${k}" already exists.`);
                    return;
                }
                // Save hover metadata for new key
                const iconName = addIconInput.value.trim() || DEFAULT_HOVER_ICON;
                if (addCheckbox.checked || iconName !== DEFAULT_HOVER_ICON) {
                    setHoverMetadata(k, iconName, addCheckbox.checked);
                }
                const nextList = [...data, { key: k, value: valInput.value || '', required: false }];
                saveEntries(nextList);
                rerender(nextList);
                updateHoverPreview?.();
            };

            const revertBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-template-reset-btn'] });
            setIcon(revertBtn, 'rotate-ccw');
            setTooltip(revertBtn, 'Revert to original template');
            revertBtn.onclick = async () => {
                const confirmed = await new Promise<boolean>((resolve) => {
                    const modal = new Modal(app);
                    const { modalEl, contentEl } = modal;
                    modal.titleEl.setText('');
                    contentEl.empty();

                    modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                    contentEl.addClass('ert-modal-container', 'ert-stack');

                    const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                    header.createSpan({ text: 'Warning', cls: 'ert-modal-badge' });
                    header.createDiv({ text: 'Reset advanced YAML template', cls: 'ert-modal-title' });
                    header.createDiv({ text: 'Resetting will delete all renamed and custom fields, lucide icons, and restore the default template.', cls: 'ert-modal-subtitle' });

                    const body = contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                    body.createDiv({ text: 'Are you sure you want to reset? This cannot be undone.', cls: 'ert-purge-warning' });

                    const actionsRow = contentEl.createDiv({ cls: ['ert-modal-actions', 'ert-inline-actions'] });

                    new ButtonComponent(actionsRow)
                        .setButtonText('Reset to default')
                        .setWarning()
                        .onClick(() => {
                            modal.close();
                            resolve(true);
                        });

                    new ButtonComponent(actionsRow)
                        .setButtonText('Cancel')
                        .onClick(() => {
                            modal.close();
                            resolve(false);
                        });

                    modal.open();
                });

                if (!confirmed) return;

                if (!plugin.settings.sceneYamlTemplates) plugin.settings.sceneYamlTemplates = { base: DEFAULT_SETTINGS.sceneYamlTemplates!.base, advanced: '' };
                plugin.settings.sceneYamlTemplates.advanced = defaultTemplate;
                // Clear all hover metadata fields on reset
                plugin.settings.hoverMetadataFields = [];
                await plugin.saveSettings();
                const resetEntries = entriesFromTemplate(defaultTemplate, requiredOrder).filter(e => !e.required);
                rerender(resetEntries);
                // Update the hover preview to reflect cleared fields
                updateHoverPreview?.();
            };

        };

        rerender(entries);
    };

    renderAdvancedTemplateEditor();

    // Hover Metadata Preview Panel
    const hoverPreviewContainer = yamlStack.createDiv({
        cls: ['ert-previewFrame', 'ert-previewFrame--center', 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'metadata' }
    });
    const hoverPreviewHeading = hoverPreviewContainer.createDiv({ cls: 'ert-planetary-preview-heading', text: 'Hover Metadata Preview' });
    const hoverPreviewBody = hoverPreviewContainer.createDiv({ cls: ['ert-hover-preview-body', 'ert-stack'] });

    const renderHoverPreview = () => {
        hoverPreviewBody.empty();
        const enabledFields = (plugin.settings.hoverMetadataFields || []).filter(f => f.enabled);
        const currentTemplate = plugin.settings.sceneYamlTemplates?.advanced ?? '';
        const templateObj = safeParseYaml(currentTemplate);

        if (enabledFields.length === 0) {
            hoverPreviewHeading.setText('Hover Metadata Preview (none enabled)');
            hoverPreviewBody.createDiv({ text: 'Enable fields using the checkboxes above to show them in hover synopsis.', cls: 'ert-hover-preview-empty' });
            return;
        }

        hoverPreviewHeading.setText(`Hover Metadata Preview (${enabledFields.length} field${enabledFields.length > 1 ? 's' : ''})`);

        enabledFields.forEach(field => {
            const lineEl = hoverPreviewBody.createDiv({ cls: 'ert-hover-preview-line' });
            
            // Icon bullet
            const iconEl = lineEl.createSpan({ cls: 'ert-hover-preview-icon' });
            setIcon(iconEl, field.icon || DEFAULT_HOVER_ICON);
            
            // Key: Value text (show just key if no template value)
            const value = templateObj[field.key];
            const valueStr = Array.isArray(value) ? value.join(', ') : (value ?? '');
            const displayText = valueStr ? `${field.key}: ${valueStr}` : field.key;
            lineEl.createSpan({ text: displayText, cls: 'ert-hover-preview-text' });
        });
    };

    // Set the preview update function
    updateHoverPreview = renderHoverPreview;
    renderHoverPreview();

    const refreshVisibility = () => {
        renderAdvancedTemplateEditor();
        renderHoverPreview();
    };
    onAdvancedToggle = refreshVisibility;
    refreshVisibility();

    // ═══════════════════════════════════════════════════════════════════════
    // BACKDROP YAML EDITOR
    // ═══════════════════════════════════════════════════════════════════════

    const backdropYamlSection = yamlStack.createDiv({ cls: ERT_CLASSES.STACK });

    const backdropYamlHeading = new Settings(backdropYamlSection)
        .setName('Backdrop YAML editor')
        .setDesc('Customize additional YAML keys for backdrop notes. Enable fields to show in backdrop hover synopsis.');
    const backdropYamlToggleBtn = backdropYamlHeading.controlEl.createEl('button', {
        cls: ERT_CLASSES.ICON_BTN,
        attr: { type: 'button', 'aria-label': 'Show backdrop YAML editor' }
    });
    const refreshBackdropYamlToggle = () => {
        const expanded = plugin.settings.enableBackdropYamlEditor ?? false;
        setIcon(backdropYamlToggleBtn, expanded ? 'chevron-down' : 'chevron-right');
        setTooltip(backdropYamlToggleBtn, expanded ? 'Hide backdrop YAML editor' : 'Show backdrop YAML editor');
        backdropYamlToggleBtn.setAttribute('aria-label', expanded ? 'Hide backdrop YAML editor' : 'Show backdrop YAML editor');
    };
    refreshBackdropYamlToggle();

    const backdropYamlContainer = backdropYamlSection.createDiv({ cls: ['ert-panel', 'ert-advanced-template-card'] });

    // ─── Backdrop hover metadata helpers ─────────────────────────────────
    const getBackdropHoverMetadata = (key: string): HoverMetadataField | undefined => {
        return (plugin.settings.backdropHoverMetadataFields ?? []).find(f => f.key === key);
    };

    const setBackdropHoverMetadata = (key: string, icon: string, enabled: boolean) => {
        if (!plugin.settings.backdropHoverMetadataFields) {
            plugin.settings.backdropHoverMetadataFields = [];
        }
        const existing = plugin.settings.backdropHoverMetadataFields.find(f => f.key === key);
        if (existing) {
            existing.icon = icon;
            existing.enabled = enabled;
        } else {
            plugin.settings.backdropHoverMetadataFields.push({ key, label: key, icon, enabled });
        }
        void plugin.saveSettings();
    };

    const removeBackdropHoverMetadata = (key: string) => {
        if (plugin.settings.backdropHoverMetadataFields) {
            plugin.settings.backdropHoverMetadataFields = plugin.settings.backdropHoverMetadataFields.filter(f => f.key !== key);
            void plugin.saveSettings();
        }
    };

    const renameBackdropHoverMetadataKey = (oldKey: string, newKey: string) => {
        const existing = plugin.settings.backdropHoverMetadataFields?.find(f => f.key === oldKey);
        if (existing) {
            existing.key = newKey;
            void plugin.saveSettings();
        }
    };

    let updateBackdropHoverPreview: (() => void) | undefined;

    const backdropBaseTemplate = plugin.settings.backdropYamlTemplates?.base
        ?? DEFAULT_SETTINGS.backdropYamlTemplates?.base
        ?? 'Class: Backdrop\nWhen:\nEnd:\nContext:';
    const backdropBaseKeys = extractKeysInOrder(backdropBaseTemplate);
    // `Synopsis` is legacy for Backdrop and should not be written by new templates.
    const backdropDisallowedNewWriteKeys = new Set(['Synopsis']);

    const renderBackdropYamlEditor = () => {
        backdropYamlContainer.empty();
        const isExpanded = plugin.settings.enableBackdropYamlEditor ?? false;
        backdropYamlContainer.toggleClass('ert-settings-hidden', !isExpanded);
        if (!isExpanded) return;

        const currentBackdropAdvanced = plugin.settings.backdropYamlTemplates?.advanced ?? '';
        const backdropAdvancedObj = safeParseYaml(currentBackdropAdvanced);

        const backdropOptionalOrder = extractKeysInOrder(currentBackdropAdvanced).filter(k => !backdropBaseKeys.includes(k));
        const backdropEntries: TemplateEntry[] = backdropOptionalOrder.map(key => ({
            key,
            value: backdropAdvancedObj[key] ?? '',
            required: false
        }));

        let backdropWorkingEntries = backdropEntries;
        let backdropDragIndex: number | null = null;

        const saveBackdropEntries = (nextEntries: TemplateEntry[]) => {
            backdropWorkingEntries = nextEntries;
            const yaml = buildYamlFromEntries(nextEntries);
            if (!plugin.settings.backdropYamlTemplates) {
                plugin.settings.backdropYamlTemplates = {
                    base: backdropBaseTemplate,
                    advanced: '',
                };
            }
            plugin.settings.backdropYamlTemplates.advanced = yaml;
            void plugin.saveSettings();
        };

        const rerenderBackdropYaml = (next?: TemplateEntry[]) => {
            const data = next ?? backdropWorkingEntries;
            backdropWorkingEntries = data;
            backdropYamlContainer.empty();
            const isExpanded = plugin.settings.enableBackdropYamlEditor ?? false;
            backdropYamlContainer.toggleClass('ert-settings-hidden', !isExpanded);
            if (!isExpanded) return;

            // Read-only base fields (collapsed summary)
            const baseCard = backdropYamlContainer.createDiv({ cls: 'ert-template-base-summary' });
            baseCard.createDiv({ cls: 'ert-template-base-heading', text: 'Base fields (read-only)' });
            const basePills = baseCard.createDiv({ cls: 'ert-template-base-pills' });
            backdropBaseKeys.forEach(k => {
                basePills.createSpan({ cls: 'ert-template-base-pill', text: k });
            });

            // Editable advanced entries
            const listEl = backdropYamlContainer.createDiv({ cls: ['ert-template-entries', 'ert-template-indent'] });

            if (data.length > 0) {
                listEl.createDiv({ cls: 'ert-template-section-label', text: 'Custom fields' });
            }

            const renderBackdropEntryRow = (entry: TemplateEntry, idx: number, list: TemplateEntry[]) => {
                const row = listEl.createDiv({ cls: ['ert-yaml-row', 'ert-yaml-row--hover-meta'] });

                const hoverMeta = getBackdropHoverMetadata(entry.key);
                const currentIcon = hoverMeta?.icon ?? DEFAULT_HOVER_ICON;
                const currentEnabled = hoverMeta?.enabled ?? false;

                // Drag handle
                const dragHandle = row.createDiv({ cls: 'ert-drag-handle' });
                dragHandle.draggable = true;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, 'Drag to reorder');

                row.createDiv({ cls: 'ert-grid-spacer' });

                // Icon input
                const iconWrapper = row.createDiv({ cls: 'ert-hover-icon-wrapper' });
                const iconPreview = iconWrapper.createDiv({ cls: 'ert-hover-icon-preview' });
                setIcon(iconPreview, currentIcon);
                const iconInput = iconWrapper.createEl('input', {
                    type: 'text',
                    cls: 'ert-input ert-input--lg ert-icon-input',
                    attr: { placeholder: 'Icon name...' }
                });
                iconInput.value = currentIcon;
                setTooltip(iconInput, 'Lucide icon name for hover synopsis');

                // Hover checkbox
                const checkboxWrapper = row.createDiv({ cls: 'ert-hover-checkbox-wrapper' });
                const checkbox = checkboxWrapper.createEl('input', {
                    type: 'checkbox',
                    cls: 'ert-hover-checkbox'
                });
                checkbox.checked = currentEnabled;
                setTooltip(checkbox, 'Show in backdrop hover synopsis');

                new IconSuggest(app, iconInput, (selectedIcon) => {
                    iconInput.value = selectedIcon;
                    setIcon(iconPreview, selectedIcon);
                    setBackdropHoverMetadata(entry.key, selectedIcon, checkbox.checked);
                    updateBackdropHoverPreview?.();
                });

                // SAFE: Settings sections are standalone functions without Component lifecycle
                iconInput.addEventListener('blur', () => {
                    const val = iconInput.value.trim() || DEFAULT_HOVER_ICON;
                    setIcon(iconPreview, val);
                    setBackdropHoverMetadata(entry.key, val, checkbox.checked);
                    updateBackdropHoverPreview?.();
                });

                checkbox.addEventListener('change', () => {
                    setBackdropHoverMetadata(entry.key, iconInput.value.trim() || DEFAULT_HOVER_ICON, checkbox.checked);
                    updateBackdropHoverPreview?.();
                });

                // Key input
                const keyInput = row.createEl('input', {
                    type: 'text',
                    cls: 'ert-input ert-input--lg',
                    attr: { placeholder: 'Key name...' }
                });
                keyInput.value = entry.key;

                // Value input
                const valInput = row.createEl('input', {
                    type: 'text',
                    cls: 'ert-input ert-input--lg',
                    attr: { placeholder: 'Default value...' }
                });
                valInput.value = Array.isArray(entry.value) ? entry.value.join(', ') : (entry.value ?? '');

                // Delete button
                const delBtn = row.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
                setIcon(delBtn, 'trash');
                setTooltip(delBtn, 'Remove field');
                delBtn.addEventListener('click', () => {
                    removeBackdropHoverMetadata(entry.key);
                    const next = list.filter((_, i) => i !== idx);
                    saveBackdropEntries(next);
                    rerenderBackdropYaml(next);
                    updateBackdropHoverPreview?.();
                });

                // Key rename
                keyInput.addEventListener('blur', () => {
                    const newKey = keyInput.value.trim();
                    if (!newKey || newKey === entry.key) return;
                    if (backdropBaseKeys.includes(newKey)) {
                        new Notice(`"${newKey}" is a base field and cannot be used as a custom key.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    if (backdropDisallowedNewWriteKeys.has(newKey)) {
                        new Notice(`"${newKey}" is a legacy backdrop key. Use "Context" instead.`);
                        keyInput.value = entry.key;
                        return;
                    }
                    renameBackdropHoverMetadataKey(entry.key, newKey);
                    const next = list.map((e, i) => i === idx ? { ...e, key: newKey } : e);
                    saveBackdropEntries(next);
                    rerenderBackdropYaml(next);
                });

                // Value change
                valInput.addEventListener('blur', () => {
                    const newVal = valInput.value;
                    const next = list.map((e, i) => i === idx ? { ...e, value: newVal } : e);
                    saveBackdropEntries(next);
                });

                // Drag events
                dragHandle.addEventListener('dragstart', (e) => {
                    backdropDragIndex = idx;
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                    row.classList.add('ert-drag-active');
                });
                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                });
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (backdropDragIndex === null || backdropDragIndex === idx) return;
                    const next = [...list];
                    const [moved] = next.splice(backdropDragIndex, 1);
                    next.splice(idx, 0, moved);
                    backdropDragIndex = null;
                    saveBackdropEntries(next);
                    rerenderBackdropYaml(next);
                });
                dragHandle.addEventListener('dragend', () => {
                    backdropDragIndex = null;
                    row.classList.remove('ert-drag-active');
                });
            };

            data.forEach((entry, idx) => renderBackdropEntryRow(entry, idx, data));

            // Add new field button
            const addRow = listEl.createDiv({ cls: 'ert-yaml-row ert-yaml-row--add' });
            const addBtn = addRow.createEl('button', {
                cls: `${ERT_CLASSES.ICON_BTN} ert-add-field-btn`,
                attr: { type: 'button' }
            });
            setIcon(addBtn, 'plus');
            setTooltip(addBtn, 'Add custom field');
            addBtn.addEventListener('click', () => {
                const next = [...data, { key: '', value: '', required: false }];
                saveBackdropEntries(next);
                rerenderBackdropYaml(next);
            });

            // Reset to default
            const resetRow = listEl.createDiv({ cls: 'ert-yaml-row ert-yaml-row--reset' });
            const resetBtn = resetRow.createEl('button', {
                cls: `${ERT_CLASSES.ICON_BTN} ert-reset-btn`,
                text: 'Reset to default',
                attr: { type: 'button' }
            });
            setTooltip(resetBtn, 'Clear all custom backdrop fields');
            resetBtn.addEventListener('click', async () => {
                if (!plugin.settings.backdropYamlTemplates) {
                    plugin.settings.backdropYamlTemplates = { base: backdropBaseTemplate, advanced: '' };
                }
                plugin.settings.backdropYamlTemplates.advanced = '';
                plugin.settings.backdropHoverMetadataFields = [];
                await plugin.saveSettings();
                rerenderBackdropYaml([]);
                updateBackdropHoverPreview?.();
            });
        };

        rerenderBackdropYaml(backdropEntries);
    };

    // SAFE: Settings sections are standalone functions without Component lifecycle
    backdropYamlToggleBtn.addEventListener('click', async () => {
        const next = !(plugin.settings.enableBackdropYamlEditor ?? false);
        plugin.settings.enableBackdropYamlEditor = next;
        refreshBackdropYamlToggle();
        await plugin.saveSettings();
        renderBackdropYamlEditor();
        renderBackdropHoverPreview();
    });

    renderBackdropYamlEditor();

    // ─── BACKDROP HOVER METADATA PREVIEW ─────────────────────────────────
    const backdropHoverPreviewContainer = backdropYamlSection.createDiv({
        cls: ['ert-previewFrame', 'ert-previewFrame--center', 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'backdrop-metadata' }
    });
    const backdropHoverPreviewHeading = backdropHoverPreviewContainer.createDiv({ cls: 'ert-planetary-preview-heading', text: 'Backdrop Hover Metadata Preview' });
    const backdropHoverPreviewBody = backdropHoverPreviewContainer.createDiv({ cls: ['ert-hover-preview-body', 'ert-stack'] });

    const renderBackdropHoverPreview = () => {
        backdropHoverPreviewBody.empty();
        const enabledFields = (plugin.settings.backdropHoverMetadataFields ?? []).filter(f => f.enabled);
        const currentBackdropAdv = plugin.settings.backdropYamlTemplates?.advanced ?? '';
        const templateObj = safeParseYaml(currentBackdropAdv);

        const backdropEditorVisible = plugin.settings.enableBackdropYamlEditor ?? false;
        if (!backdropEditorVisible || enabledFields.length === 0) {
            backdropHoverPreviewContainer.toggleClass('ert-settings-hidden', !backdropEditorVisible);
            backdropHoverPreviewHeading.setText('Backdrop Hover Metadata Preview (none enabled)');
            backdropHoverPreviewBody.createDiv({ text: 'Enable fields using the checkboxes above to show them in backdrop hover synopsis.', cls: 'ert-hover-preview-empty' });
            return;
        }
        backdropHoverPreviewContainer.removeClass('ert-settings-hidden');
        backdropHoverPreviewHeading.setText(`Backdrop Hover Metadata Preview (${enabledFields.length} field${enabledFields.length > 1 ? 's' : ''})`);

        enabledFields.forEach(field => {
            const lineEl = backdropHoverPreviewBody.createDiv({ cls: 'ert-hover-preview-line' });
            const iconEl = lineEl.createSpan({ cls: 'ert-hover-preview-icon' });
            setIcon(iconEl, field.icon || DEFAULT_HOVER_ICON);
            const value = templateObj[field.key];
            const valueStr = Array.isArray(value) ? value.join(', ') : (value ?? '');
            const displayText = valueStr ? `${field.key}: ${valueStr}` : field.key;
            lineEl.createSpan({ text: displayText, cls: 'ert-hover-preview-text' });
        });
    };

    updateBackdropHoverPreview = renderBackdropHoverPreview;
    renderBackdropHoverPreview();

    // ═══════════════════════════════════════════════════════════════════════
    // YAML AUDIT + BACKFILL PANELS (Beat / Scene / Backdrop)
    // ═══════════════════════════════════════════════════════════════════════

    const AUDIT_PAGE_SIZE = 5;
    const AUDIT_OPEN_ALL_MAX = 25;

    /**
     * Renders a reusable YAML Audit + Backfill panel inside the given container.
     * Used by all three editor sections (Beat, Scene, Backdrop).
     */
    function renderAuditPanel(
        parentEl: HTMLElement,
        noteType: NoteType,
        beatSystemKey?: string
    ): void {
        let auditResult: YamlAuditResult | null = null;

        // ─── Header row: two-column Setting layout (title+desc left, audit button right) ──
        const auditSetting = new Settings(parentEl)
            .setName('YAML audit')
            .setDesc(`Scan ${noteType.toLowerCase()} notes for schema drift — missing fields, extra keys, and ordering issues.`);

        // Copy button (hidden until audit runs)
        let copyBtn: HTMLButtonElement | undefined;
        auditSetting.addButton(button => {
            button
                .setIcon('clipboard-copy')
                .setTooltip('Copy audit report to clipboard')
                .onClick(() => {
                    if (!auditResult) return;
                    const report = formatAuditReport(auditResult, noteType);
                    navigator.clipboard.writeText(report).then(() => {
                        new Notice('Audit report copied to clipboard.');
                    });
                });
            copyBtn = button.buttonEl;
            copyBtn.classList.add('ert-settings-hidden');
        });

        // Insert missing button (hidden until audit finds missing fields)
        let backfillBtn: HTMLButtonElement | undefined;
        auditSetting.addButton(button => {
            button
                .setButtonText('Insert missing')
                .setTooltip('Add missing custom fields to existing notes')
                .onClick(() => void handleBackfill());
            backfillBtn = button.buttonEl;
            backfillBtn.classList.add('ert-settings-hidden');
        });

        // Run audit button
        auditSetting.addButton(button => {
            button
                .setButtonText('Run audit')
                .setTooltip(`Scan all ${noteType.toLowerCase()} notes for YAML schema drift`)
                .onClick(() => runAudit());
        });

        // ─── Results row: appears below header after audit runs ──────────
        const resultsEl = parentEl.createDiv({ cls: 'ert-audit-results-row ert-settings-hidden' });

        const runAudit = () => {
            const files = collectFilesForAudit(app, noteType, plugin.settings, beatSystemKey);
            if (files.length === 0) {
                new Notice(`No ${noteType.toLowerCase()} notes found in the vault.`);
                return;
            }
            auditResult = runYamlAudit({
                app,
                settings: plugin.settings,
                noteType,
                files,
                beatSystemKey,
            });

            console.debug('[YamlAudit] yaml_audit_run', {
                noteType,
                totalNotes: auditResult.summary.totalNotes,
                missing: auditResult.summary.notesWithMissing,
                extra: auditResult.summary.notesWithExtra,
                drift: auditResult.summary.notesWithDrift,
                warnings: auditResult.summary.notesWithWarnings,
                unread: auditResult.summary.unreadNotes,
                clean: auditResult.summary.clean,
            });

            copyBtn?.classList.remove('ert-settings-hidden');
            if (auditResult.summary.notesWithMissing > 0) {
                backfillBtn?.classList.remove('ert-settings-hidden');
            } else {
                backfillBtn?.classList.add('ert-settings-hidden');
            }

            renderResults();
        };

        // ─── Render results ──────────────────────────────────────────────
        const renderResults = () => {
            resultsEl.empty();
            resultsEl.classList.remove('ert-settings-hidden');
            if (!auditResult) return;

            const s = auditResult.summary;

            // Schema health + summary in one line
            const healthLevel = s.notesWithMissing > 0
                ? 'needs-attention'
                : (s.notesWithExtra > 0 || s.notesWithDrift > 0 || s.notesWithWarnings > 0)
                    ? 'mixed'
                    : 'clean';
            const healthLabels: Record<string, string> = {
                'clean': 'Clean',
                'mixed': 'Mixed',
                'needs-attention': 'Needs attention',
            };
            const headerEl = resultsEl.createDiv({ cls: 'ert-audit-result-header' });
            const healthEl = headerEl.createSpan({ cls: `ert-audit-health ert-audit-health--${healthLevel}` });
            healthEl.textContent = `Schema health: ${healthLabels[healthLevel]}`;
            headerEl.createSpan({ text: ` · ${s.totalNotes} note${s.totalNotes !== 1 ? 's' : ''} scanned`, cls: 'ert-audit-summary' });

            // Unread warning
            if (s.unreadNotes > 0) {
                const unreadEl = resultsEl.createDiv({ cls: 'ert-audit-unread-warn' });
                unreadEl.textContent = `${s.unreadNotes} note${s.unreadNotes !== 1 ? 's' : ''} not yet indexed — rerun audit after Obsidian finishes indexing.`;
            }

            // All clean — early return
            if (s.clean === s.totalNotes && s.unreadNotes === 0 && s.notesWithWarnings === 0) {
                resultsEl.createDiv({
                    text: `All ${s.totalNotes} notes match the template.`,
                    cls: 'ert-audit-clean'
                });
                return;
            }

            // Collect all entries across all categories for a flat display
            interface ChipConfig {
                label: string;
                count: number;
                kind: 'missing' | 'extra' | 'drift' | 'warning';
                entries: NoteAuditEntry[];
            }

            const chips: ChipConfig[] = [
                { label: 'Missing fields', count: s.notesWithMissing, kind: 'missing',
                  entries: auditResult.notes.filter(n => n.missingFields.length > 0) },
                { label: 'Extra keys', count: s.notesWithExtra, kind: 'extra',
                  entries: auditResult.notes.filter(n => n.extraKeys.length > 0) },
                { label: 'Order drift', count: s.notesWithDrift, kind: 'drift',
                  entries: auditResult.notes.filter(n => n.orderDrift) },
                { label: 'Warnings', count: s.notesWithWarnings, kind: 'warning',
                  entries: auditResult.notes.filter(n => n.semanticWarnings.length > 0) },
            ];

            // Category chips row (clickable to filter)
            let activeKind: string | null = chips.find(c => c.count > 0)?.kind ?? null;
            const chipsEl = resultsEl.createDiv({ cls: 'ert-audit-chips' });

            const detailsEl = resultsEl.createDiv({ cls: 'ert-audit-details' });

            const renderChips = () => {
                chipsEl.empty();
                for (const chip of chips) {
                    if (chip.count === 0) continue;
                    const chipBtn = chipsEl.createEl('button', {
                        cls: `ert-chip ert-audit-chip ert-audit-chip--${chip.kind}${activeKind === chip.kind ? ' is-active' : ''}`,
                        text: `${chip.count} ${chip.label.toLowerCase()}`,
                        attr: { type: 'button' }
                    });
                    chipBtn.addEventListener('click', () => {
                        activeKind = activeKind === chip.kind ? null : chip.kind;
                        renderChips();
                        renderNoteList();
                    });
                }
                if (s.clean > 0) {
                    chipsEl.createSpan({ text: `${s.clean} clean`, cls: 'ert-chip ert-audit-chip ert-audit-chip--clean' });
                }
            };

            // Note pills — flat list across the row, wrapping, up to 5 per page
            let page = 0;

            const renderNoteList = () => {
                detailsEl.empty();
                if (!activeKind) return;

                const activeChip = chips.find(c => c.kind === activeKind);
                if (!activeChip || activeChip.entries.length === 0) return;

                const total = activeChip.entries.length;
                const start = page * AUDIT_PAGE_SIZE;
                const end = Math.min(start + AUDIT_PAGE_SIZE, total);
                const pageEntries = activeChip.entries.slice(start, end);

                // Note pills in a flowing row
                const pillsEl = detailsEl.createDiv({ cls: 'ert-audit-note-pills' });
                for (const entry of pageEntries) {
                    const reason = activeChip.kind === 'missing'
                        ? entry.missingFields.join(', ')
                        : activeChip.kind === 'extra'
                            ? entry.extraKeys.join(', ')
                            : activeChip.kind === 'warning'
                                ? entry.semanticWarnings.join(' | ')
                                : 'order drift';
                    const reasonShort = reason.length > 40 ? reason.slice(0, 39) + '…' : reason;

                    const pillEl = pillsEl.createEl('button', {
                        cls: `ert-audit-note-pill ert-audit-note-pill--${activeChip.kind}`,
                        attr: { type: 'button' }
                    });
                    pillEl.createSpan({ text: entry.file.basename, cls: 'ert-audit-note-pill-name' });
                    pillEl.createSpan({ text: ` — ${reasonShort}`, cls: 'ert-audit-note-pill-reason' });
                    setTooltip(pillEl, `${entry.file.basename}: ${reason}`);

                    pillEl.addEventListener('click', async () => {
                        await openOrRevealFile(app, entry.file, false);
                        if (entry.missingFields.length > 0) {
                            new Notice(`Missing fields: ${entry.missingFields.join(', ')}`);
                        } else if (entry.semanticWarnings.length > 0) {
                            new Notice(`Warnings: ${entry.semanticWarnings.join(' | ')}`);
                        }
                    });
                }

                // Pagination + Open all row
                const navEl = detailsEl.createDiv({ cls: 'ert-audit-pagination' });
                const paginationLabel = navEl.createSpan({ cls: 'ert-audit-pagination-label' });
                paginationLabel.textContent = `${start + 1}–${end} of ${total}`;

                if (page > 0) {
                    const prevBtn = navEl.createEl('button', {
                        text: '← Prev',
                        cls: 'ert-audit-nav-btn',
                        attr: { type: 'button' }
                    });
                    prevBtn.addEventListener('click', () => { page--; renderNoteList(); });
                }
                if (end < total) {
                    const nextBtn = navEl.createEl('button', {
                        text: `Next ${Math.min(AUDIT_PAGE_SIZE, total - end)} →`,
                        cls: 'ert-audit-nav-btn',
                        attr: { type: 'button' }
                    });
                    nextBtn.addEventListener('click', () => { page++; renderNoteList(); });
                }
                if (total <= AUDIT_OPEN_ALL_MAX && total > 1) {
                    const openAllBtn = navEl.createEl('button', {
                        text: `Open all ${total}`,
                        cls: 'ert-audit-nav-btn',
                        attr: { type: 'button' }
                    });
                    openAllBtn.addEventListener('click', async () => {
                        for (const e of activeChip.entries) {
                            await openOrRevealFile(app, e.file, true);
                        }
                    });
                }
            };

            renderChips();
            renderNoteList();
        };

        // ─── Backfill action ─────────────────────────────────────────────
        const handleBackfill = async () => {
            if (!auditResult || auditResult.summary.notesWithMissing === 0) return;

            const defaults = getCustomDefaults(noteType, plugin.settings, beatSystemKey);
            const targetFiles = auditResult.notes
                .filter(n => n.missingFields.length > 0)
                .map(n => n.file);

            const allMissingKeys = new Set<string>();
            for (const n of auditResult.notes) {
                for (const k of n.missingFields) allMissingKeys.add(k);
            }
            const fieldsToInsert: Record<string, string | string[]> = {};
            for (const k of allMissingKeys) {
                fieldsToInsert[k] = defaults[k] ?? '';
            }

            // Confirmation modal
            const confirmed = await new Promise<boolean>((resolve) => {
                const modal = new Modal(app);
                modal.titleEl.setText(`Insert missing fields into ${targetFiles.length} ${noteType.toLowerCase()} note${targetFiles.length !== 1 ? 's' : ''}`);

                const bodyEl = modal.contentEl.createDiv({ cls: 'ert-stack' });
                bodyEl.createDiv({ text: 'The following fields will be added (existing values are never overwritten):' });

                const fieldListEl = bodyEl.createEl('ul');
                for (const [key, val] of Object.entries(fieldsToInsert)) {
                    const valStr = Array.isArray(val) ? val.join(', ') : val;
                    fieldListEl.createEl('li', { text: valStr ? `${key}: ${valStr}` : `${key}: (empty)` });
                }

                const btnRow = modal.contentEl.createDiv({ cls: 'ert-audit-actions' });
                const insertBtn = btnRow.createEl('button', {
                    cls: 'ert-mod-cta',
                    text: 'Insert',
                    attr: { type: 'button' }
                });
                const cancelBtn = btnRow.createEl('button', {
                    text: 'Cancel',
                    attr: { type: 'button' }
                });

                insertBtn.addEventListener('click', () => { modal.close(); resolve(true); });
                cancelBtn.addEventListener('click', () => { modal.close(); resolve(false); });
                modal.onClose = () => resolve(false);
                modal.open();
            });

            if (!confirmed) return;

            const result: BackfillResult = await runYamlBackfill({
                app,
                files: targetFiles,
                fieldsToInsert,
            });

            console.debug('[YamlAudit] yaml_backfill_execute', {
                noteType,
                updated: result.updated,
                skipped: result.skipped,
                failed: result.failed,
                fieldsInserted: Object.keys(fieldsToInsert),
            });

            const parts: string[] = [];
            if (result.updated > 0) parts.push(`Updated ${result.updated} note${result.updated !== 1 ? 's' : ''}`);
            if (result.skipped > 0) parts.push(`${result.skipped} already had all fields`);
            if (result.failed > 0) parts.push(`${result.failed} failed`);
            new Notice(parts.join(', ') || 'No changes made.');

            // Re-run audit to refresh
            runAudit();
        };
    }

    // ─── Place audit panels inside each editor section ───────────────────

    // Beat audit panel (inside beat YAML section, after hover preview)
    const beatAuditContainer = beatYamlSection.createDiv({ cls: ERT_CLASSES.STACK });
    renderAuditPanel(
        beatAuditContainer,
        'Beat',
        plugin.settings.beatSystem === 'Custom'
            ? `custom:${plugin.settings.activeCustomBeatSystemId ?? 'default'}`
            : plugin.settings.beatSystem ?? 'Save The Cat'
    );

    // Scene audit panel (inside scene YAML section, after hover preview)
    const sceneAuditContainer = yamlStack.createDiv({ cls: ERT_CLASSES.STACK });
    const renderSceneAuditVisibility = () => {
        const visible = plugin.settings.enableAdvancedYamlEditor ?? false;
        sceneAuditContainer.toggleClass('ert-settings-hidden', !visible);
    };
    renderSceneAuditVisibility();
    advancedToggleButton.addEventListener('click', () => { renderSceneAuditVisibility(); });
    renderAuditPanel(sceneAuditContainer, 'Scene');

    // Backdrop audit panel (inside backdrop YAML section, after hover preview)
    const backdropAuditContainer = backdropYamlSection.createDiv({ cls: ERT_CLASSES.STACK });
    const renderBackdropAuditVisibility = () => {
        const visible = plugin.settings.enableBackdropYamlEditor ?? false;
        backdropAuditContainer.toggleClass('ert-settings-hidden', !visible);
    };
    renderBackdropAuditVisibility();
    backdropYamlToggleBtn.addEventListener('click', () => { renderBackdropAuditVisibility(); });
    renderAuditPanel(backdropAuditContainer, 'Backdrop');

    function updateTemplateButton(setting: Settings, selectedSystem: string): void {
        const isCustom = selectedSystem === 'Custom';
        const isTemplateMode = !isCustom;
        let displayName = selectedSystem;
        let baseDesc = '';
        let hasBeats = true;

        if (isCustom) {
            displayName = plugin.settings.customBeatSystemName || 'Custom';
            const beats = (plugin.settings.customBeatSystemBeats || []).map((b: unknown) => {
                if (typeof b === 'string') return b.trim();
                if (typeof b === 'object' && b !== null && (b as { name?: unknown }).name) {
                    return String((b as { name: unknown }).name).trim();
                }
                return '';
            });
            hasBeats = beats.some(b => b.length > 0);

            if (hasBeats) {
                setting.setName(`Beat notes in your vault for ${displayName}`);
                baseDesc = `Create ${beats.length} beat note files for your custom system.`;
                setting.setDesc(baseDesc);
                setting.settingEl.style.opacity = '1';
            } else {
                setting.setName('Beat notes');
                baseDesc = 'Add at least one beat above to create beat notes.';
                setting.setDesc(baseDesc);
                setting.settingEl.style.opacity = '0.6';
            }
        } else {
            setting.setName(`Beat notes in your vault for ${selectedSystem}`);
            baseDesc = `Create ${selectedSystem} beat note files in your vault matching this system's structure.`;
            setting.setDesc(baseDesc);
            setting.settingEl.style.opacity = '1';
        }

        // Default button states before async lookup
        if (createTemplatesButton) {
            createTemplatesButton.setDisabled(!hasBeats);
            if (isTemplateMode) {
                createTemplatesButton.setButtonText('Create missing beat notes');
                createTemplatesButton.setTooltip('Create missing beat notes in your source path');
            } else {
                createTemplatesButton.setButtonText('Create beat notes');
                createTemplatesButton.setTooltip('Create beat note files in your source path');
            }
        }
        if (mergeTemplatesButton) {
            mergeTemplatesButton.setDisabled(true);
            mergeTemplatesButton.buttonEl.addClass('ert-hidden');
        }
        if (!hasBeats) return;

        void (async () => {
            const lookup = await refreshExistingBeatLookup(true, selectedSystem);
            if (!lookup) return;

            const synced = existingBeatSyncedCount;
            const misaligned = existingBeatMisalignedCount;
            const newBeats = existingBeatNewCount;
            const duplicates = existingBeatDuplicateCount;
            const allSynced = synced === existingBeatExpectedCount && misaligned === 0 && duplicates === 0;
            const hasNew = newBeats > 0;
            const hasMisaligned = misaligned > 0;
            const hasDuplicates = duplicates > 0;

            if (existingBeatMatchedCount === 0) {
                // Scenario A: Fresh — no existing files
                setting.setDesc(baseDesc);
                if (createTemplatesButton) {
                    createTemplatesButton.setDisabled(false);
                    if (isTemplateMode) {
                        createTemplatesButton.setButtonText('Create missing beat notes');
                        createTemplatesButton.setTooltip(`Create ${existingBeatExpectedCount} missing beat notes`);
                    } else {
                        createTemplatesButton.setButtonText('Create beat notes');
                        createTemplatesButton.setTooltip(`Create ${existingBeatExpectedCount} beat note files`);
                    }
                }
                return;
            }

            // Build concise status description from non-zero counts
            const parts: string[] = [];
            if (synced > 0) parts.push(`${synced} ${isTemplateMode ? 'ok' : 'synced'}`);
            if (misaligned > 0) parts.push(`${misaligned} misaligned`);
            if (newBeats > 0) parts.push(`${newBeats} missing`);
            if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates > 1 ? 's' : ''}`);
            let statusDesc = parts.join(', ') + '.';

            if (allSynced) {
                // Scenario B: All synced — nothing to do
                statusDesc = `All ${existingBeatExpectedCount} beat notes are ${isTemplateMode ? 'ok' : 'synced'}.`;
                if (createTemplatesButton) {
                    createTemplatesButton.setDisabled(true);
                    createTemplatesButton.setTooltip('All beats already have aligned files');
                }
            } else if (hasNew) {
                // Scenario D: Has new beats to create
                if (createTemplatesButton) {
                    createTemplatesButton.setDisabled(false);
                    if (isTemplateMode) {
                        createTemplatesButton.setButtonText(`Create ${newBeats} missing beat note${newBeats > 1 ? 's' : ''}`);
                        createTemplatesButton.setTooltip(`Create missing beat notes for ${newBeats} beat${newBeats > 1 ? 's' : ''} without files`);
                    } else {
                        createTemplatesButton.setButtonText(`Create ${newBeats} missing beat note${newBeats > 1 ? 's' : ''}`);
                        createTemplatesButton.setTooltip(`Create missing beat notes for ${newBeats} beat${newBeats > 1 ? 's' : ''} without files`);
                    }
                }
            } else {
                // Scenario C: All matched, some misaligned — no new beats
                if (createTemplatesButton) {
                    createTemplatesButton.setDisabled(true);
                    createTemplatesButton.setTooltip('All beats have files. Use Repair to fix alignment.');
                }
            }

            // Merge button: show when misaligned beats exist (Custom only)
            if (mergeTemplatesButton && isCustom && hasMisaligned) {
                mergeTemplatesButton.buttonEl.removeClass('ert-hidden');
                mergeTemplatesButton.setDisabled(false);
                mergeTemplatesButton.setButtonText(`Repair ${misaligned} beat note${misaligned > 1 ? 's' : ''}`);
                mergeTemplatesButton.setTooltip(`Fix ${misaligned} misaligned beat note${misaligned > 1 ? 's' : ''} to match this list`);
            }

            if (hasDuplicates) {
                statusDesc += ` Resolve duplicate${duplicates > 1 ? 's' : ''} before merging. Manual resolution is required.`;
            }

            setting.setDesc(`${baseDesc} ${statusDesc}`);

            // Refresh the health icon in the Design header
            refreshHealthIcon?.();
        })();
    }

    async function mergeExistingBeatNotes(): Promise<void> {
        const storyStructureName = plugin.settings.beatSystem || 'Custom';
        if (storyStructureName !== 'Custom') {
            new Notice('Merge is available for Custom beat systems only.');
            return;
        }

        const maxActs = getActCount();
        const beats: BeatRow[] = (plugin.settings.customBeatSystemBeats || [])
            .map(parseBeatRow)
            .map(b => ({ ...b, act: clampBeatAct(b.act, maxActs) }));
        if (beats.length === 0) {
            new Notice('No custom beats defined. Add beats in the list above.');
            return;
        }

        const ranges = await collectActRanges(true);
        const beatNumbers = buildBeatNumbers(beats, maxActs, ranges ?? new Map());
        const existing = await collectExistingBeatNotes(true, storyStructureName);
        if (!existing || existing.length === 0) {
            new Notice('No existing beat notes found to merge.');
            return;
        }

        const existingLookup = buildExistingBeatLookup(existing);
        const customModelName = plugin.settings.customBeatSystemName || 'Custom';
        const conflicts: string[] = [];
        const duplicates: string[] = [];
        const updates: Array<{ file: TFile; targetPath: string; act: number }> = [];
        const duplicateKeys = new Set<string>();

        const keyCounts = new Map<string, number>();
        beats.forEach((beatLine) => {
            const key = normalizeBeatTitle(beatLine.name);
            if (!key) return;
            keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
        });
        keyCounts.forEach((count, key) => {
            if (count > 1) duplicateKeys.add(key);
        });

        beats.forEach((beatLine, index) => {
            const key = normalizeBeatTitle(beatLine.name);
            if (!key) return;
            if (duplicateKeys.has(key)) {
                duplicates.push(beatLine.name);
                return;
            }
            const matches = existingLookup.get(key);
            if (!matches || matches.length === 0) return;
            if (matches.length > 1) {
                duplicates.push(beatLine.name);
                return;
            }
            const match = matches[0];
            if (!match.path) return;
            const file = app.vault.getAbstractFileByPath(match.path);
            if (!(file instanceof TFile)) return;

            const beatNumber = beatNumbers[index] ?? (index + 1);
            const targetBasename = buildBeatFilename(beatNumber, beatLine.name);
            const parentPath = file.parent?.path ?? '';
            const targetPath = parentPath
                ? `${parentPath}/${targetBasename}.${file.extension}`
                : `${targetBasename}.${file.extension}`;

            if (targetPath !== file.path && app.vault.getAbstractFileByPath(targetPath)) {
                conflicts.push(targetBasename);
                return;
            }

            updates.push({ file, targetPath, act: beatLine.act });
        });

        if (updates.length === 0) {
            const conflictHint = conflicts.length > 0 ? ` Conflicts: ${conflicts.length}.` : '';
            const duplicateHint = duplicates.length > 0 ? ` Duplicates: ${duplicates.length}.` : '';
            new Notice(`No beat notes could be merged.${conflictHint}${duplicateHint}`);
            return;
        }

        for (const update of updates) {
            await app.fileManager.processFrontMatter(update.file, (fm: Record<string, unknown>) => {
                fm['Act'] = update.act;
                fm['Beat Model'] = customModelName;
                if (!fm['Class']) fm['Class'] = 'Beat';
            });
        }

        const renameOps = updates
            .filter(update => update.targetPath !== update.file.path)
            .map((update, idx) => {
                const parentPath = update.file.parent?.path ?? '';
                const tempBasename = `zbeat-merge-${Date.now().toString(36)}-${idx}`;
                const tempPath = parentPath
                    ? `${parentPath}/${tempBasename}.${update.file.extension}`
                    : `${tempBasename}.${update.file.extension}`;
                return { file: update.file, tempPath, finalPath: update.targetPath };
            });

        for (const op of renameOps) {
            await app.fileManager.renameFile(op.file, op.tempPath);
        }
        for (const op of renameOps) {
            const file = app.vault.getAbstractFileByPath(op.tempPath);
            if (file instanceof TFile) {
                await app.fileManager.renameFile(file, op.finalPath);
            }
        }

        existingBeatReady = false;
        // Wait for Obsidian metadata cache to re-index after renames
        await new Promise<void>(resolve => {
            const timeout = window.setTimeout(resolve, 1500);
            const ref = app.metadataCache.on('resolved', () => {
                window.clearTimeout(timeout);
                app.metadataCache.offref(ref);
                resolve();
            });
        });
        updateTemplateButton(templateSetting, storyStructureName);
        void refreshExistingBeatLookup(true, storyStructureName).then(() => {
            refreshCustomBeatList?.();
        });

        const renamedCount = renameOps.length;
        const updatedCount = updates.length;
        const conflictHint = conflicts.length > 0 ? ` ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} skipped.` : '';
        const duplicateHint = duplicates.length > 0 ? ` ${duplicates.length} duplicate title${duplicates.length > 1 ? 's' : ''} skipped.` : '';
        new Notice(`Merged ${updatedCount} beat note${updatedCount > 1 ? 's' : ''} (${renamedCount} renamed).${conflictHint}${duplicateHint}`);
    }

    async function createBeatTemplates(): Promise<void> {
        const storyStructureName = plugin.settings.beatSystem || 'Custom';
        
        let storyStructure = getPlotSystem(storyStructureName);
        
        // Handle Custom Dynamic System
        if (storyStructureName === 'Custom') {
             const customSystem = getCustomSystemFromSettings(plugin.settings);
             if (customSystem.beats.length > 0) {
                 storyStructure = customSystem;
             } else {
                 new Notice('No custom beats defined. Add beats in the list above.');
                 return;
             }
        }

        if (!storyStructure) {
            new Notice(`Unknown story structure: ${storyStructureName}`);
            return;
        }

        const actRanges = await collectActRanges(true);
        const actSceneNumbers = new Map<number, number[]>();
        actRanges?.forEach((range, act) => {
            actSceneNumbers.set(act, range.sceneNumbers);
        });
        
        const modal = new CreateBeatsTemplatesModal(
            app,
            plugin,
            storyStructureName,
            storyStructure.beatCount || storyStructure.beats.length
        );
        modal.open();
        const result = await modal.waitForConfirmation();
        if (!result.confirmed) return;
        try {
            const sourcePath = plugin.settings.sourcePath || '';
            const beatTemplate = getMergedBeatYamlTemplate(plugin.settings);
            const { created, skipped, errors } = await createBeatTemplateNotes(
                app.vault,
                storyStructureName,
                sourcePath,
                storyStructureName === 'Custom' ? storyStructure : undefined,
                { actSceneNumbers: actSceneNumbers.size > 0 ? actSceneNumbers : undefined, beatTemplate }
            );
            if (errors.length > 0) {
                new Notice(`Created ${created} notes. ${skipped} skipped. ${errors.length} errors. Check console.`);
                console.error('[Beat Templates] Errors:', errors);
            } else if (created === 0 && skipped > 0) {
                new Notice(`All ${skipped} Beat notes already exist. No new notes created.`);
            } else {
                new Notice(`✓ Successfully created ${created} Beat template notes!`);
            }
            existingBeatReady = false;
            // Wait for Obsidian metadata cache to index newly created files
            // before refreshing beat detection. Use 'resolved' event with timeout fallback.
            await new Promise<void>(resolve => {
                const timeout = window.setTimeout(resolve, 1500);
                const ref = app.metadataCache.on('resolved', () => {
                    window.clearTimeout(timeout);
                    app.metadataCache.offref(ref);
                    resolve();
                });
            });
            updateTemplateButton(templateSetting, storyStructureName);
            void refreshExistingBeatLookup(true, storyStructureName).then(() => {
                refreshCustomBeatList?.();
            });
        } catch (error) {
            console.error('[Beat Templates] Failed:', error);
            new Notice(`Failed to create story beat templates: ${error}`);
        }
    }
}

function extractKeysInOrder(template: string): string[] {
    const keys: string[] = [];
    const lines = (template || '').split('\n');
    for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9 _'-]+):/);
        if (match) {
            const key = match[1].trim();
            if (key && !keys.includes(key)) keys.push(key);
        }
    }
    return keys;
}

function safeParseYaml(template: string): Record<string, TemplateEntryValue> {
    try {
        const parsed = parseYaml(template);
        if (!parsed || typeof parsed !== 'object') return {};
        const entries: Record<string, TemplateEntryValue> = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                entries[key] = value.map((v) => String(v));
            } else if (value === undefined || value === null) {
                entries[key] = '';
            } else {
                entries[key] = String(value);
            }
        });
        return entries;
    } catch {
        return {};
    }
}

function mergeOrders(primary: string[], secondary: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    [...primary, ...secondary].forEach(key => {
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(key);
    });
    return result;
}

function buildYamlFromEntries(entries: TemplateEntry[], commentMap?: Record<string, string>): string {
    const lines: string[] = [];
    entries.forEach(entry => {
        const comment = commentMap?.[entry.key];
        if (Array.isArray(entry.value)) {
            lines.push(comment ? `${entry.key}: # ${comment}` : `${entry.key}:`);
            entry.value.forEach((v: string) => {
                lines.push(`  - ${v}`);
            });
        } else {
            const valueStr = entry.value ?? '';
            lines.push(comment ? `${entry.key}: ${valueStr} # ${comment}` : `${entry.key}: ${valueStr}`);
        }
    });
    return lines.join('\n');
}

function buildYamlWithRequired(
    requiredOrder: string[],
    requiredValues: Record<string, TemplateEntryValue>,
    optionalEntries: TemplateEntry[],
    commentMap?: Record<string, string>
): string {
    const combined: TemplateEntry[] = [
        ...requiredOrder.map(key => ({
            key,
            value: requiredValues[key] ?? '',
            required: true
        })),
        ...optionalEntries
    ];
    return buildYamlFromEntries(combined, commentMap);
}

function entriesFromTemplate(template: string, requiredOrder: string[]): TemplateEntry[] {
    const order = mergeOrders(extractKeysInOrder(template), requiredOrder);
    const obj = safeParseYaml(template);
    return order.map(key => ({
        key,
        value: obj[key] ?? '',
        required: requiredOrder.includes(key)
    }));
}

// Alias for backward compatibility
export { renderStoryBeatsSection as renderTemplatesSection };
