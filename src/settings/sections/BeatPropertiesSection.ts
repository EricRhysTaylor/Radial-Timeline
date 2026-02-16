import { App, Notice, Setting as Settings, parseYaml, setIcon, setTooltip, Modal, ButtonComponent, getIconIds, TFile, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { TimelineItem } from '../../types';
import { CreateBeatSetModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem, getCustomSystemFromSettings, PRO_BEAT_SETS } from '../../utils/beatsSystems';
import { createBeatNotesFromSet, getMergedBeatYaml, getBeatConfigForSystem, ensureBeatConfigForSystem, spreadBeatsAcrossScenes } from '../../utils/beatsTemplates';
import type { BeatSystemConfig } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../defaults';

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
    hasBeatReadableText,
    generateBeatGuid,
    normalizeBeatFieldKeyInput,
    normalizeBeatFieldListValueInput,
    normalizeBeatFieldValueInput,
    normalizeBeatNameInput,
    normalizeBeatSetNameInput,
    sanitizeBeatFilenameSegment,
    toBeatMatchKey,
    toBeatModelMatchKey,
} from '../../utils/beatsInputNormalize';
import {
    type NoteType,
    extractKeysInOrder as sharedExtractKeysInOrder,
    safeParseYaml as sharedSafeParseYaml,
    getCustomKeys,
    getCustomDefaults,
} from '../../utils/yamlTemplateNormalize';
import { runYamlAudit, collectFilesForAudit, formatAuditReport, type YamlAuditResult, type NoteAuditEntry } from '../../utils/yamlAudit';
import { runYamlBackfill, runYamlFillEmptyValues, type BackfillResult } from '../../utils/yamlBackfill';
import { IMPACT_FULL } from '../SettingImpact';

type FieldEntryValue = string | string[];
type FieldEntry = { key: string; value: FieldEntryValue; required: boolean };
type BeatRow = { name: string; act: number; purpose?: string; id?: string; range?: string };
type BeatSystemMode = 'builtin' | 'custom';
type BuiltinBeatSetId = 'save_the_cat' | 'heros_journey' | 'story_grid';

const DEFAULT_HOVER_ICON = 'align-vertical-space-around';
const BEAT_PRESETS: Array<{ id: BuiltinBeatSetId; label: string; systemName: string }> = [
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
        examples: 'Examples: Podcast Narrative Arc, YouTube Explainer Arc, Historical Narrative, Romance Tropes Ladder, Thriller Escalation Ladder.'
    }
};

/** Edit custom system details modal (name + description). */
class SystemEditModal extends Modal {
    private initialName: string;
    private initialDesc: string;
    private onSubmit: (name: string, description: string) => Promise<boolean>;

    constructor(app: App, initialName: string, initialDesc: string, onSubmit: (name: string, description: string) => Promise<boolean>) {
        super(app);
        this.initialName = initialName;
        this.initialDesc = initialDesc;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '480px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Edit' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Edit custom system details' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'This name identifies your beat system and appears in each beat note\'s frontmatter.' });

        const formStack = contentEl.createDiv({ cls: ERT_CLASSES.STACK });

        // Name input
        const nameLabel = formStack.createDiv({ cls: 'ert-field-label', text: 'System name' });
        nameLabel.setAttribute('id', 'sys-name-label');
        const nameInput = formStack.createEl('input', {
            type: 'text',
            value: this.initialName,
            cls: 'ert-input ert-input--full'
        });
        nameInput.setAttr('placeholder', 'Custom beats');
        nameInput.setAttr('aria-labelledby', 'sys-name-label');

        // Description textarea
        const descLabel = formStack.createDiv({ cls: 'ert-field-label', text: 'Description (optional)' });
        descLabel.setAttribute('id', 'sys-desc-label');
        const descInput = formStack.createEl('textarea', {
            cls: 'ert-input ert-input--full ert-textarea'
        });
        descInput.value = this.initialDesc;
        descInput.setAttr('placeholder', 'Describe the purpose of this beat system...');
        descInput.setAttr('rows', '4');
        descInput.setAttr('aria-labelledby', 'sys-desc-label');

        window.setTimeout(() => nameInput.focus(), 50);

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const name = normalizeBeatSetNameInput(nameInput.value, '');
            if (!name || !hasBeatReadableText(name)) {
                new Notice('Please enter a system name with letters or numbers.');
                return;
            }
            const shouldClose = await this.onSubmit(name, descInput.value.trim());
            if (shouldClose) this.close();
        };

        new ButtonComponent(buttonRow).setButtonText('Save').setCta().onClick(() => { void save(); });
        new ButtonComponent(buttonRow).setButtonText('Cancel').onClick(() => this.close());

        nameInput.addEventListener('keydown', (evt: KeyboardEvent) => { // SAFE: direct addEventListener; Modal lifecycle manages cleanup
            if (evt.key === 'Enter') { evt.preventDefault(); void save(); }
        });
    }

    onClose() { this.contentEl.empty(); }
}

const resolveBuiltinBeatSetId = (system?: string): BuiltinBeatSetId | null => {
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

const deriveBeatSystemMode = (system?: string): { mode: BeatSystemMode; builtinSetId: BuiltinBeatSetId | null } => {
    const builtinSetId = resolveBuiltinBeatSetId(system);
    return builtinSetId
        ? { mode: 'builtin', builtinSetId }
        : { mode: 'custom', builtinSetId: null };
};

// ── Module-level UI state (survives re-renders within the same plugin session) ──

/** Inner tab selection. Shared by built-ins and Custom. Default: preview. */
type InnerStage = 'preview' | 'design' | 'fields' | 'sets';
let _currentInnerStage: InnerStage = 'preview';

/** @deprecated Use InnerStage. Kept for backward compatibility in string literals. */
type CustomStage = InnerStage;

/**
 * Reactive dirty-state store for loaded beat sets (starter or saved).
 *
 * Why reactive? The beats UI has multiple independent render zones (Design
 * header, Pro Sets panel) that must stay in sync when the dirty flag changes.
 * A centralized notify() eliminates the fragile callback-threading pattern
 * where each zone held a closure over stale DOM elements.
 *
 * Each render zone subscribes when it mounts and unsubscribes when its
 * container is emptied, so there are never stale listeners.
 */
const dirtyState = {
    baselineId: '' as string,
    baselineHash: '' as string,
    _listeners: new Set<() => void>(),

    /** Capture the current snapshot as the "clean" baseline for a loaded set. */
    setBaseline(id: string, hash: string) {
        this.baselineId = id;
        this.baselineHash = hash;
        this.notify();
    },

    /** Clear baseline (switching to a fresh/unsaved system). */
    clearBaseline() {
        this.baselineId = '';
        this.baselineHash = '';
        this.notify();
    },

    /** True when a loaded set is active and its current state differs from baseline. */
    isDirty(currentId: string, currentHash: string): boolean {
        if (!this.baselineId) return false;
        if (currentId !== this.baselineId) return false;
        return currentHash !== this.baselineHash;
    },

    /** Register a listener; returns an unsubscribe function. */
    subscribe(fn: () => void): () => void {
        this._listeners.add(fn);
        return () => { this._listeners.delete(fn); };
    },

    /** Notify all subscribers that dirty state may have changed. */
    notify() {
        this._listeners.forEach((fn: () => void) => fn());
    }
};

/**
 * Session-local registry of custom set ids that have been explicitly saved.
 * Used to gate safe auto-fill actions to "official" schema commits.
 */
const savedCustomSetIds = new Set<string>();
let _unsubTopBeatTabsDirty: (() => void) | null = null;
let _unsubBeatAuditDirty: (() => void) | null = null;

export function renderStoryBeatsSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    backdropYamlTargetEl?: HTMLElement;
}): void {
    const { app, plugin, containerEl, backdropYamlTargetEl } = params;
    const proActive = isProfessionalActive(plugin);
    const canEditBuiltInBeatSystems = (): boolean => proActive;
    const canEditFieldsForSystem = (systemKey: string): boolean =>
        systemKey === 'Custom' ? true : canEditBuiltInBeatSystems();
    const canManageCustomSets = (): boolean => proActive;
    _unsubTopBeatTabsDirty?.();
    _unsubTopBeatTabsDirty = null;
    _unsubBeatAuditDirty?.();
    _unsubBeatAuditDirty = null;
    containerEl.empty();
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
        return toBeatMatchKey(value);
    };

    const stripActPrefix = (name: string): string => {
        const m = name.match(/^Act\s*\d+\s*:\s*(.+)$/i);
        return m ? m[1].trim() : name.trim();
    };

    const buildBeatFilename = (beatNumber: number, name: string): string => {
        const displayName = stripActPrefix(name);
        const safeBeatName = sanitizeBeatFilenameSegment(displayName);
        return `${beatNumber} ${safeBeatName}`.trim();
    };

    const parseBeatRow = (item: unknown): BeatRow => {
        if (typeof item === 'object' && item !== null && (item as { name?: unknown }).name) {
            const obj = item as { name?: unknown; act?: unknown; purpose?: unknown; id?: unknown; range?: unknown };
            const objName = normalizeBeatNameInput(typeof obj.name === 'string' ? obj.name : String(obj.name ?? ''), '');
            const objAct = typeof obj.act === 'number' ? obj.act : 1;
            const objPurpose = typeof obj.purpose === 'string' ? obj.purpose.trim() : '';
            const objId = typeof obj.id === 'string' ? obj.id : undefined;
            const objRange = typeof obj.range === 'string' ? obj.range.trim() : undefined;
            return { name: objName, act: objAct, purpose: objPurpose || undefined, id: objId, range: objRange || undefined };
        }
        const raw = normalizeBeatNameInput(String(item ?? ''), '');
        if (!raw) return { name: '', act: 1 };
        const m = raw.match(/^(.*?)\[(\d+)\]$/);
        if (m) {
            const actNum = parseInt(m[2], 10);
            return { name: normalizeBeatNameInput(m[1], ''), act: !Number.isNaN(actNum) ? actNum : 1 };
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

    const orderBeatsByAct = (beats: BeatRow[], maxActs: number): BeatRow[] => {
        const beatsByAct: BeatRow[][] = Array.from({ length: maxActs }, () => []);
        beats.forEach((beatLine) => {
            const actNum = clampBeatAct(beatLine.act, maxActs);
            beatsByAct[actNum - 1].push({ ...beatLine, act: actNum });
        });
        return beatsByAct.flat();
    };

    const normalizeBeatModel = (value: unknown): string =>
        toBeatModelMatchKey(String(value ?? ''));

    const collectExistingBeatNotes = async (allowFetch: boolean, selectedSystem: string): Promise<TimelineItem[] | null> => {
        if (!allowFetch) return null;
        try {
            const scenes = await plugin.getSceneData({ filterBeatsBySystem: false });
            const beats = (scenes ?? []).filter(scene => scene.itemType === 'Beat' || scene.itemType === 'Plot');
            const expectedModel = selectedSystem === 'Custom'
                ? normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom')
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
        const idLookup = new Map<string, TimelineItem[]>();
        beats.forEach(beat => {
            const key = normalizeBeatTitle(getBeatBasename(beat));
            if (key) {
                const list = lookup.get(key) ?? [];
                list.push(beat);
                lookup.set(key, list);
            }
            const beatId = beat["Beat Id"];
            if (beatId) {
                const idList = idLookup.get(beatId) ?? [];
                idList.push(beat);
                idLookup.set(beatId, idList);
            }
        });
        existingBeatIdLookup = idLookup;
        return lookup;
    };

    const buildExpectedBeatNames = (selectedSystem: string): string[] => {
        if (selectedSystem === 'Custom') {
            return (plugin.settings.customBeatSystemBeats || [])
                .map(parseBeatRow)
                .map(b => b.name)
                .filter(name => name.length > 0);
        }
        const system = getPlotSystem(selectedSystem);
        return system?.beats ?? [];
    };

    /** Map of expected Beat Id → normalized beat name key for the selected system. */
    const buildExpectedBeatIdMap = (selectedSystem: string): Map<string, string> => {
        const map = new Map<string, string>();
        if (selectedSystem === 'Custom') {
            for (const b of (plugin.settings.customBeatSystemBeats || [])) {
                if (b.id && b.name) map.set(b.id, normalizeBeatTitle(b.name));
            }
        } else {
            const system = getPlotSystem(selectedSystem);
            if (system?.beatDetails) {
                for (const d of system.beatDetails) {
                    if (d.id) map.set(d.id, normalizeBeatTitle(d.name));
                }
            }
        }
        return map;
    };

    const collectBeatNotesByTemplateNames = (expectedKeys: Set<string>, selectedSystem: string): TimelineItem[] => {
        if (expectedKeys.size === 0) return [];
        const files = app.vault.getMarkdownFiles();
        const matches: TimelineItem[] = [];
        const customName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom');
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
                ? (normalized['Beat Model'] as string)
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

    const collectBeatNotesMissingModelByExpectedNames = (expectedKeys: Set<string>): TimelineItem[] => {
        if (expectedKeys.size === 0) return [];
        const files = app.vault.getMarkdownFiles();
        const matches: TimelineItem[] = [];

        files.forEach(file => {
            const key = normalizeBeatTitle(file.basename);
            if (!expectedKeys.has(key)) return;

            const cache = app.metadataCache.getFileCache(file);
            const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
            const normalized = normalizeFrontmatterKeys(fm, plugin.settings.frontmatterMappings);
            const classValue = normalized['Class'];
            if (!classValue || !isStoryBeat(classValue)) return;

            const beatModelValue = typeof normalized['Beat Model'] === 'string'
                ? (normalized['Beat Model'] as string).trim()
                : '';
            if (beatModelValue.length > 0) return;

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
                missingBeatModel: true,
                rawFrontmatter: normalized
            });
        });

        return matches;
    };

    let existingBeatLookup = new Map<string, TimelineItem[]>();
    let existingBeatIdLookup = new Map<string, TimelineItem[]>();
    let existingBeatCount = 0;
    let existingBeatMatchedCount = 0;
    let existingBeatExpectedCount = 0;
    let existingBeatDuplicateCount = 0;
    let existingBeatMisalignedCount = 0;
    let existingBeatSyncedCount = 0;
    let existingBeatNewCount = 0;
    let existingBeatMissingModelCount = 0;
    let existingBeatLegacyMatchedCount = 0;
    let existingBeatStatsSystem = '';
    let existingBeatKey = '';
    let existingBeatReady = false;
    let refreshCustomBeatList: (() => void) | null = null;
    let refreshCustomBeats: ((allowFetch: boolean) => void) | null = null;
    let refreshHealthIcon: (() => void) | null = null;
    let customBeatsObserver: IntersectionObserver | null = null;
    // Unsubscribe hooks for dirtyState subscriptions — called before re-render to prevent stale listeners
    let _unsubDesignDirty: (() => void) | null = null;
    let _unsubProSetsDirty: (() => void) | null = null;

    const getCustomTabLabel = (): string => {
        const named = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', '');
        return named.length > 0 ? named : 'Custom';
    };

    const getCustomTabStatus = (): { icon: string; statusClass: string; tooltip: string } => {
        if (isSetDirty()) {
            return {
                icon: 'circle-alert',
                statusClass: 'ert-beat-health-icon--modified',
                tooltip: 'Custom set has unsaved changes.'
            };
        }
        if (!existingBeatReady || existingBeatStatsSystem !== 'Custom') {
            return {
                icon: 'circle-dashed',
                statusClass: '',
                tooltip: 'Custom beat note status not yet checked.'
            };
        }
        const hasDups = existingBeatDuplicateCount > 0;
        const hasMisaligned = existingBeatMisalignedCount > 0;
        const hasMissing = existingBeatNewCount > 0;
        const hasMissingModel = existingBeatMissingModelCount > 0;
        const allGood = existingBeatSyncedCount === existingBeatExpectedCount
            && !hasMisaligned && !hasDups && !hasMissingModel;
        if (hasDups) {
            return {
                icon: 'alert-circle',
                statusClass: 'ert-beat-health-icon--critical',
                tooltip: `${existingBeatDuplicateCount} duplicate beat note${existingBeatDuplicateCount !== 1 ? 's' : ''} found. Manually delete duplicate notes to resolve.`
            };
        }
        if (hasMisaligned) {
            return {
                icon: 'alert-triangle',
                statusClass: 'ert-beat-health-icon--warning',
                tooltip: `${existingBeatMisalignedCount} beat note${existingBeatMisalignedCount !== 1 ? 's' : ''} need repair.`
            };
        }
        if (hasMissingModel) {
            return {
                icon: 'alert-triangle',
                statusClass: 'ert-beat-health-icon--warning',
                tooltip: `Missing Beat Model (${existingBeatMissingModelCount}) found.`
            };
        }
        if (hasMissing) {
            return {
                icon: 'alert-triangle',
                statusClass: 'ert-beat-health-icon--warning',
                tooltip: `${existingBeatNewCount} beat note${existingBeatNewCount !== 1 ? 's' : ''} not yet created.`
            };
        }
        if (allGood && existingBeatLegacyMatchedCount > 0) {
            return {
                icon: 'alert-triangle',
                statusClass: 'ert-beat-health-icon--warning',
                tooltip: `${existingBeatLegacyMatchedCount} beat note${existingBeatLegacyMatchedCount !== 1 ? 's' : ''} matched by filename (run Repair to lock Beat Id).`
            };
        }
        if (allGood) {
            return {
                icon: 'check-circle',
                statusClass: 'ert-beat-health-icon--success',
                tooltip: 'All beat notes are up to date.'
            };
        }
        return {
            icon: 'circle-dashed',
            statusClass: '',
            tooltip: 'Custom beat note status not yet checked.'
        };
    };

    /** Produce a lightweight hash string from the current custom beat state. */
    const snapshotHash = (): string => {
        const beats = (plugin.settings.customBeatSystemBeats ?? []).map(b => `${b.name}|${b.act}|${(b as { purpose?: string }).purpose ?? ''}`).join(';');
        const configKey = `custom:${plugin.settings.activeCustomBeatSystemId ?? 'default'}`;
        const cfg = plugin.settings.beatSystemConfigs?.[configKey];
        const yaml = cfg?.beatYamlAdvanced ?? '';
        const hover = (cfg?.beatHoverMetadataFields ?? []).map(f => `${f.key}:${f.icon}:${f.enabled}`).join(';');
        return `${beats}##${yaml}##${hover}`;
    };

    /** Capture the current state as the set baseline via the reactive store. */
    const captureSetBaseline = (setId: string) => {
        dirtyState.setBaseline(setId, snapshotHash());
    };

    /** Clear set baseline (switching to a fresh/unsaved system). */
    const clearSetBaseline = () => {
        dirtyState.clearBaseline();
    };

    /** Convenience: true when the loaded set has been modified from its baseline. */
    const isSetDirty = (): boolean => {
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
        return dirtyState.isDirty(activeId, snapshotHash());
    };

    const refreshExistingBeatLookup = async (allowFetch: boolean, selectedSystem: string): Promise<Map<string, TimelineItem[]> | null> => {
        const nextKey = `${selectedSystem}|${normalizeBeatSetNameInput(plugin.settings.customBeatSystemName ?? '', '')}`;
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
        const missingModelCandidates = collectBeatNotesMissingModelByExpectedNames(expectedKeys);
        const missingModelLookup = buildExistingBeatLookup(missingModelCandidates);
        const expectedIdMap = buildExpectedBeatIdMap(selectedSystem);
        const buildCounts = (lookup: Map<string, TimelineItem[]>, total: number) => {
            existingBeatLookup = lookup;
            existingBeatCount = total;
            existingBeatStatsSystem = selectedSystem;
            existingBeatExpectedCount = expectedNames.length;

            // Match by Beat Id first, then fall back to normalized name
            let matched = 0;
            let legacyMatched = 0;
            let duplicates = 0;
            const matchedByIdKeys = new Set<string>();
            for (const key of expectedKeys) {
                // Try Beat Id match first
                let foundById = false;
                for (const [beatId, nameKey] of expectedIdMap) {
                    if (nameKey === key && existingBeatIdLookup.has(beatId)) {
                        foundById = true;
                        matchedByIdKeys.add(key);
                        const idMatches = existingBeatIdLookup.get(beatId) ?? [];
                        if (idMatches.length > 1) duplicates++;
                        break;
                    }
                }
                if (foundById) {
                    matched++;
                    continue;
                }
                // Fall back to name-based matching (legacy)
                if (lookup.has(key)) {
                    matched++;
                    legacyMatched++;
                    if ((lookup.get(key)?.length ?? 0) > 1) duplicates++;
                }
            }
            existingBeatMatchedCount = matched;
            existingBeatDuplicateCount = duplicates;
            existingBeatLegacyMatchedCount = legacyMatched;
            existingBeatMissingModelCount = missingModelCandidates.length;

            // Compute misaligned count: beats matched by name but wrong number or act
            const maxActs = getActCount();
            const expectedBeats: BeatRow[] = selectedSystem === 'Custom'
                ? orderBeatsByAct(
                    (plugin.settings.customBeatSystemBeats || [])
                        .map(parseBeatRow)
                        .map(b => ({ ...b, act: clampBeatAct(b.act, maxActs) })),
                    maxActs
                )
                : (() => {
                    // Built-in templates: derive act from beatDetails[].act or infer from position
                    const system = getPlotSystem(selectedSystem);
                    const details = system?.beatDetails ?? [];
                    const total = expectedNames.length;
                    return expectedNames.map((name, idx) => {
                        const detailAct = (details[idx] as { act?: number } | undefined)?.act;
                        const act = typeof detailAct === 'number' && Number.isFinite(detailAct)
                            ? detailAct
                            : inferActForIndex(idx, total);
                        return { name, act };
                    });
                })();
            // Misaligned = matched by name but wrong Act. Prefix numbers are NOT audited (see Beat-Audit-Heal spec).
            let misaligned = 0;
            expectedBeats.forEach((beat) => {
                const key = normalizeBeatTitle(beat.name);
                if (!key || !lookup.has(key)) return;
                const matches = lookup.get(key) ?? [];
                const actNumber = clampBeatAct(beat.act, maxActs);
                let hasAligned = false;
                matches.forEach(existing => {
                    const existingActRaw = typeof existing.actNumber === 'number' ? existing.actNumber : Number(existing.act ?? actNumber);
                    const existingAct = Number.isFinite(existingActRaw) ? existingActRaw : actNumber;
                    if (existingAct === actNumber) hasAligned = true;
                });
                if (!hasAligned) misaligned++;
            });
            existingBeatMisalignedCount = misaligned;
            existingBeatSyncedCount = Math.max(0, existingBeatMatchedCount - existingBeatMisalignedCount - existingBeatDuplicateCount);
            const missingModelMatchedCount = Array.from(expectedKeys).filter(key => missingModelLookup.has(key)).length;
            existingBeatNewCount = Math.max(0, existingBeatExpectedCount - existingBeatMatchedCount - missingModelMatchedCount);
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
        .setDesc('Applies to Narrative, Publication, and Gossamer modes. Scene and Beat properties. (Minimum 3)')
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
                plugin.onSettingChanged(IMPACT_FULL); // Tier 3: act count affects timeline beat grouping
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
                plugin.onSettingChanged(IMPACT_FULL); // Tier 3: act labels affect timeline display
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
    const beatSystemOptions = [...BEAT_PRESETS, CUSTOM_SYSTEM_OPTION];

    const beatSystemCard = beatSystemWrapper.createDiv({
        cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-beat-system-card`,
        attr: { id: 'ert-beat-system-panel', role: 'tabpanel' }
    });
    // Tier banner (always visible; shows built-in vs custom, Core vs Pro)
    const tierBannerEl = beatSystemCard.createDiv({ cls: 'ert-beat-tier-banner ert-stack--tight' });

    // ── Inner stage switcher (Preview | Design | Fields | Sets) ───────
    // Rendered directly under the status block, above all content panels.
    // Visible for ALL systems. Built-ins: Preview, Design, Fields. Custom: + Sets.
    // Default: Preview. State at module level (_currentInnerStage) survives re-renders.
    const stageSwitcher = beatSystemCard.createDiv({
        cls: 'ert-stage-switcher',
        attr: { role: 'tablist' }
    });

    // ── Content panels (toggled by stage switcher) ───────────────────
    const templatePreviewContainer = beatSystemCard.createDiv({ cls: ['ert-beat-template-preview', ERT_CLASSES.STACK] });
    const templatePreviewTitle = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-title' });
    const templatePreviewDesc = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-desc' });
    const templatePreviewExamples = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-examples' });
    const templatePreviewMeta = templatePreviewContainer.createDiv({ cls: 'ert-beat-template-meta' });
    const templateActGrid = templatePreviewContainer.createDiv({ cls: 'ert-beat-act-grid' });

    // --- Custom System Configuration (Dynamic Visibility) ---
    const customConfigContainer = beatSystemCard.createDiv({ cls: ['ert-custom-beat-config', ERT_CLASSES.STACK] });

    /** Check if current system was loaded from a starter set and hasn't been modified. */
    const isStarterSetActive = (): boolean => {
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
        return PRO_BEAT_SETS.some(ps => ps.id === activeId);
    };

    const renderCustomConfig = () => {
        // Unsubscribe previous Design dirty listener before clearing DOM
        _unsubDesignDirty?.();
        _unsubDesignDirty = null;
        customConfigContainer.empty();

        // ── Custom system header (mirrors built-in template preview header) ──
        const customSystemName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom beats');
        const customSystemDesc = plugin.settings.customBeatSystemDescription || '';
        const copy = BEAT_SYSTEM_COPY['Custom'];
        const starterActive = isStarterSetActive();
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
        const savedSystems: SavedBeatSystem[] = plugin.settings.savedBeatSystems ?? [];
        const savedSetActive = !starterActive && savedSystems.some(s => s.id === activeId);
        const hasSetOrigin = starterActive || savedSetActive; // loaded from any set

        // Ensure baseline exists for whichever custom set is active (starter, saved, or default).
        if (!dirtyState.baselineId || dirtyState.baselineId !== activeId) {
            captureSetBaseline(activeId);
        }

        const headerRow = customConfigContainer.createDiv({ cls: ['ert-beat-template-preview', ERT_CLASSES.STACK] });
        const titleEl = headerRow.createDiv({ cls: 'ert-beat-template-title' });

        // Health status icon — mirrors Book card check pattern.
        // Starts neutral; updates after async beat-note lookup.
        const healthIcon = titleEl.createDiv({ cls: 'ert-beat-health-icon' });
        setIcon(healthIcon, 'circle-dashed');

        // Reference for dirty-state refresh
        let originTagEl: HTMLElement | null = null;

        if (starterActive) {
            // Starter set: plain text title, not clickable/renameable
            titleEl.createSpan({ text: customSystemName, cls: 'ert-book-name' });
            originTagEl = titleEl.createSpan({ text: 'Starter set', cls: 'ert-set-origin-tag ert-set-origin-tag--starter' });
            setTooltip(originTagEl, 'Save a copy to edit.');
        } else {
            // User system: clickable to edit details
            const nameLink = titleEl.createSpan({
                text: customSystemName,
                cls: 'ert-book-name ert-book-name--clickable'
            });
            nameLink.setAttr('role', 'button');
            nameLink.setAttr('tabindex', '0');
            nameLink.setAttr('aria-label', `Edit "${customSystemName}"`);
            const openSystemEdit = () => {
                new SystemEditModal(app, customSystemName, customSystemDesc, async (newName, newDesc) => {
                    const normalizedName = normalizeBeatSetNameInput(newName, '');
                    if (!normalizedName || !hasBeatReadableText(normalizedName)) {
                        new Notice('System name must include letters or numbers.');
                        return false;
                    }
                    plugin.settings.customBeatSystemName = normalizedName;
                    plugin.settings.customBeatSystemDescription = newDesc;
                    await plugin.saveSettings();
                    existingBeatReady = false;
                    updateTemplateButton(templateSetting, 'Custom');
                    renderCustomConfig();
                    renderPreviewContent('Custom');
                    return true;
                }).open();
            };
            nameLink.addEventListener('click', (e) => { e.stopPropagation(); openSystemEdit(); }); // SAFE: direct addEventListener; Settings lifecycle manages cleanup
            nameLink.addEventListener('keydown', (e: KeyboardEvent) => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSystemEdit(); }
            });
            // Saved set: show origin tag (user-owned)
            if (savedSetActive) {
                originTagEl = titleEl.createSpan({ text: 'Saved set', cls: 'ert-set-origin-tag ert-set-origin-tag--saved' });
                setTooltip(originTagEl, 'Last saved version is current.');
            }
        }

        // ── Description: context-aware ───────────────────────────────
        if (starterActive) {
            // Starter set — show its marketing description + meta line
            const starterSet = PRO_BEAT_SETS.find(ps => ps.id === (plugin.settings.activeCustomBeatSystemId ?? 'default'));
            if (starterSet?.description) {
                const descEl = headerRow.createDiv({ cls: 'ert-beat-template-desc' });
                descEl.style.whiteSpace = 'pre-line'; // SAFE: inline style for pre-line (no CSS class needed for one-off)
                descEl.setText(starterSet.description);
            }
            const actSet = new Set((plugin.settings.customBeatSystemBeats ?? []).map(b => b.act));
            const beatCount = (plugin.settings.customBeatSystemBeats ?? []).length;
            if (beatCount > 0) {
                headerRow.createDiv({
                    cls: 'ert-beat-template-examples',
                    text: `${beatCount} beats · ${actSet.size} act${actSet.size !== 1 ? 's' : ''}`
                });
            }
        } else if (customSystemDesc) {
            // User-owned with custom description
            const userDescEl = headerRow.createDiv({ cls: 'ert-beat-template-desc', text: customSystemDesc });
            userDescEl.style.whiteSpace = 'pre-line'; // SAFE: inline style for pre-line (preserves user line breaks)
        } else {
            // Core default — boilerplate + examples
            copy.description.split('\n\n').forEach(para => {
                headerRow.createDiv({ cls: 'ert-beat-template-desc', text: para });
            });
            if (copy.examples) {
                headerRow.createDiv({ cls: 'ert-beat-template-examples', text: copy.examples });
            }
        }

        // Update health icon from current beat-note audit counters.
        // Called immediately (from cached state) and again after async lookup.
        const updateHealthIcon = () => {
            if (!existingBeatReady || existingBeatStatsSystem !== 'Custom') {
                // No audit run yet — neutral
                healthIcon.className = 'ert-beat-health-icon';
                setIcon(healthIcon, 'circle-dashed');
                setTooltip(healthIcon, 'Beat note status not yet checked.');
                return;
            }
            const hasDups = existingBeatDuplicateCount > 0;
            const hasMisaligned = existingBeatMisalignedCount > 0;
            const hasMissing = existingBeatNewCount > 0;
            const hasMissingModel = existingBeatMissingModelCount > 0;
            const hasLegacy = existingBeatLegacyMatchedCount > 0;
            const allGood = existingBeatSyncedCount === existingBeatExpectedCount
                && !hasMisaligned && !hasDups && !hasMissingModel;

            if (hasDups) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--critical';
                setIcon(healthIcon, 'alert-circle');
                setTooltip(healthIcon, `${existingBeatDuplicateCount} duplicate beat note${existingBeatDuplicateCount !== 1 ? 's' : ''} found. Manually delete duplicate notes to resolve.`);
            } else if (hasMisaligned) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--warning';
                setIcon(healthIcon, 'alert-triangle');
                setTooltip(healthIcon, `${existingBeatMisalignedCount} beat note${existingBeatMisalignedCount !== 1 ? 's' : ''} have wrong Act. Use Repair to update frontmatter.`);
            } else if (hasMissingModel) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--warning';
                setIcon(healthIcon, 'alert-triangle');
                setTooltip(healthIcon, `Missing Beat Model (${existingBeatMissingModelCount}) found.`);
            } else if (hasMissing) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--warning';
                setIcon(healthIcon, 'alert-triangle');
                setTooltip(healthIcon, `${existingBeatNewCount} beat note${existingBeatNewCount !== 1 ? 's' : ''} not yet created.`);
            } else if (allGood && hasLegacy) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--warning';
                setIcon(healthIcon, 'alert-triangle');
                setTooltip(healthIcon, `${existingBeatLegacyMatchedCount} beat note${existingBeatLegacyMatchedCount !== 1 ? 's' : ''} matched by filename (run Repair to lock Beat Id).`);
            } else if (allGood) {
                healthIcon.className = 'ert-beat-health-icon ert-beat-health-icon--success';
                setIcon(healthIcon, 'check-circle');
                setTooltip(healthIcon, 'All beat notes are up to date.');
            } else {
                healthIcon.className = 'ert-beat-health-icon';
                setIcon(healthIcon, 'circle-dashed');
                setTooltip(healthIcon, 'Beat note status not yet checked.');
            }
        };
        updateHealthIcon();

        // Expose so updateTemplateButton can refresh the icon after async lookup
        refreshHealthIcon = updateHealthIcon;

        // ── Set dirty state subscription ─────────────────────────────
        // Subscribe to dirtyState so the Design header updates reactively.
        // The subscription is cleaned up at the top of renderCustomConfig()
        // before the container is emptied, preventing stale DOM references.
        if (hasSetOrigin) {
            // Tag DOM nodes so the subscriber can re-query them (defense against stale refs)
            healthIcon.dataset.dirtyTarget = 'health';
            if (originTagEl) originTagEl.dataset.dirtyTarget = 'origin';

            const updateDesignDirtyUI = () => {
                // Re-query from container to guarantee fresh DOM references
                const hIcon = customConfigContainer.querySelector<HTMLElement>('[data-dirty-target="health"]');
                const oTag = customConfigContainer.querySelector<HTMLElement>('[data-dirty-target="origin"]');
                if (!hIcon) return; // container was emptied — subscription will be cleaned up
                const dirty = isSetDirty();
                // Health icon: orange when dirty, restore audit-based state when clean
                if (dirty) {
                    hIcon.className = 'ert-beat-health-icon ert-beat-health-icon--modified';
                    setIcon(hIcon, 'circle-alert');
                    setTooltip(hIcon, 'Set has been modified since last save.');
                } else {
                    // Delegate to updateHealthIcon which handles all audit states
                    // (success/warning/critical/neutral) based on current counters.
                    updateHealthIcon();
                }
                // Origin tag: orange "Modified" when dirty, clean label when not
                if (oTag) {
                    const cleanLabel = starterActive ? 'Starter set' : 'Saved set';
                    const cleanTip = starterActive ? 'Save a copy to edit.' : 'Last saved version is current.';
                    const dirtyTip = starterActive
                        ? 'Starter set has been changed. Save a copy to keep your version.'
                        : 'Changes have been made since last save.';
                    oTag.setText(dirty ? 'Modified' : cleanLabel);
                    oTag.classList.toggle('ert-set-origin-tag--modified', dirty);
                    oTag.classList.toggle('ert-set-origin-tag--starter', !dirty && starterActive);
                    oTag.classList.toggle('ert-set-origin-tag--saved', !dirty && !starterActive);
                    setTooltip(oTag, dirty ? dirtyTip : cleanTip);
                }
            };
            _unsubDesignDirty = dirtyState.subscribe(updateDesignDirtyUI);
            updateDesignDirtyUI(); // initial sync
        }

        // Beat List Editor (draggable rows with Name + Act)
        const beatWrapper = customConfigContainer.createDiv({ cls: 'ert-custom-beat-wrapper' });

        const listContainer = beatWrapper.createDiv({ cls: 'ert-custom-beat-list' });

        const saveBeats = async (beats: BeatRow[]) => {
            const maxActs = getActCount();
            const normalized = beats.map((beat) => ({
                ...beat,
                name: normalizeBeatNameInput(beat.name, ''),
                act: clampBeatAct(beat.act, maxActs),
            }));
            if (normalized.some(beat => !hasBeatReadableText(beat.name))) {
                new Notice('Beat names must include letters or numbers.');
                return;
            }
            plugin.settings.customBeatSystemBeats = orderBeatsByAct(normalized, maxActs);
            await plugin.saveSettings();
            updateTemplateButton(templateSetting, 'Custom');
            renderPreviewContent('Custom');
            // Re-render stage switcher after beat list changes
            renderStageSwitcher();
            dirtyState.notify();
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
                        rowNotices.push('Duplicate beat title. Manually delete duplicate beat notes (or rename one title) to resolve.');
                    }

                    // Check for existing files
                    if (dupKey && existingBeatLookup.has(dupKey)) {
                        const matches = existingBeatLookup.get(dupKey) ?? [];
                        if (matches.length > 1) {
                            rowState = 'duplicate';
                            rowNotices.push('Multiple beat notes match this title. Manually delete duplicate beat notes to resolve.');
                        } else if (rowState !== 'duplicate') {
                            const match = matches[0];
                            const existingActRaw = typeof match.actNumber === 'number'
                                ? match.actNumber
                                : Number(match.act ?? actNumber);
                            const existingAct = Number.isFinite(existingActRaw) ? existingActRaw : actNumber;
                            const actAligned = existingAct === actNumber;

                            if (actAligned) {
                                rowState = 'synced';
                                rowNotices.push('Beat note aligned (Act matches). Prefix numbers are cosmetic.');
                            } else {
                                rowState = 'misaligned';
                                rowNotices.push(`Wrong Act: file has Act ${existingAct}, expected Act ${actNumber}. Use Repair to fix.`);
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
                        const newName = normalizeBeatNameInput(nameInput.value, '');
                        if (!newName || !hasBeatReadableText(newName)) {
                            new Notice('Beat name must include letters or numbers.');
                            nameInput.value = name;
                            return;
                        }
                        nameInput.value = newName;
                        const updated = [...orderedBeats];
                        updated[index] = { ...orderedBeats[index], name: newName, act: parseInt(act, 10) || 1 };
                        saveBeats(updated);
                        renderList();
                    });

                    // Range input
                    const rangeInput = row.createEl('input', { type: 'text', cls: 'ert-beat-range-input ert-input' });
                    rangeInput.value = beatLine.range ?? '';
                    rangeInput.placeholder = 'e.g. 10-20';
                    setTooltip(rangeInput, 'Gossamer momentum range (e.g. 10-20)');
                    plugin.registerDomEvent(rangeInput, 'change', () => {
                        const rangeVal = rangeInput.value.trim();
                        const updated = [...orderedBeats];
                        updated[index] = { ...orderedBeats[index], range: rangeVal || undefined };
                        saveBeats(updated);
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
                        const currentName = normalizeBeatNameInput(nameInput.value, name);
                        if (!hasBeatReadableText(currentName)) {
                            new Notice('Beat name must include letters or numbers.');
                            return;
                        }
                        const actNum = clampBeatAct(parseInt(act, 10) || 1, maxActs);
                        updated[index] = { ...orderedBeats[index], name: currentName, act: actNum };
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
            const addRangeInput = addRow.createEl('input', { type: 'text', cls: 'ert-beat-range-input ert-input', placeholder: 'e.g. 10-20' });
            setTooltip(addRangeInput, 'Gossamer momentum range (e.g. 10-20)');
            const addActSelect = addRow.createEl('select', { cls: 'ert-beat-act-select ert-input' });
            Array.from({ length: maxActs }, (_, i) => i + 1).forEach(n => {
                const opt = addActSelect.createEl('option', { value: n.toString(), text: actLabels[n - 1] });
                if (defaultAct === n) opt.selected = true;
            });

            const addBtn = addRow.createEl('button', { cls: ['ert-iconBtn', 'ert-beat-add-btn'], attr: { 'aria-label': 'Add beat' } });
            setIcon(addBtn, 'plus');

            const commitAdd = () => {
                const name = normalizeBeatNameInput(addNameInput.value || 'New Beat', 'New Beat');
                if (!hasBeatReadableText(name)) {
                    new Notice('Beat name must include letters or numbers.');
                    return;
                }
                const act = clampBeatAct(parseInt(addActSelect.value, 10) || defaultAct || 1, maxActs);
                const id = `custom:${plugin.settings.activeCustomBeatSystemId ?? 'default'}:${generateBeatGuid()}`;
                const rangeVal = addRangeInput.value.trim() || undefined;
                const updated = [...orderedBeats, { name, act, id, range: rangeVal }];
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
            description: 'Select a beat system to configure set notes and story beat behavior.'
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

    const buildCustomActColumns = (): { columns: ActGridColumn[]; totalBeats: number } => {
        const beats = (plugin.settings.customBeatSystemBeats || []).map(parseBeatRow).filter(b => hasBeatReadableText(b.name));
        const maxActs = getActCount();
        const ordered = orderBeatsByAct(
            beats.map(b => ({ ...b, act: clampBeatAct(b.act, maxActs) })),
            maxActs
        );
        const grouped = new Map<string, ActGridColumn>();
        ordered.forEach((beatLine) => {
            const actNum = clampBeatAct(beatLine.act, maxActs);
            const key = `act:${actNum}`;
            if (!grouped.has(key)) {
                grouped.set(key, { label: `Act ${actNum}`, beats: [], rank: actNum, isNumericAct: true });
            }
            grouped.get(key)!.beats.push(stripActPrefix(beatLine.name));
        });
        const columns = Array.from(grouped.values()).sort((a, b) => a.rank - b.rank);
        return { columns, totalBeats: ordered.length };
    };

    const renderPreviewContent = (system: string) => {
        const { mode } = deriveBeatSystemMode(system);
        const copy = getBeatSystemCopy(system);
        let columns: ActGridColumn[];
        let totalBeats: number;

        if (mode === 'builtin') {
            const result = buildTemplateActColumns(system);
            columns = result.columns;
            totalBeats = result.totalBeats;
        } else {
            const result = buildCustomActColumns();
            columns = result.columns;
            totalBeats = result.totalBeats;
        }

        const customName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom');
        templatePreviewTitle.setText(mode === 'builtin' ? copy.title : customName || 'Custom');
        const customDesc = (plugin.settings.customBeatSystemDescription ?? '').trim();
        const hasAuthorDesc = mode === 'custom' && customDesc.length > 0;
        templatePreviewDesc.setText(hasAuthorDesc ? customDesc : copy.description);
        templatePreviewDesc.style.whiteSpace = hasAuthorDesc ? 'pre-line' : ''; // SAFE: preserve author line breaks
        templatePreviewExamples.setText(copy.examples ?? '');
        templatePreviewExamples.toggleClass('ert-settings-hidden', !copy.examples || hasAuthorDesc);
        templatePreviewMeta.setText(totalBeats > 0 ? `${totalBeats} beats · ${columns.length} acts` : '');
        templatePreviewMeta.toggleClass('ert-settings-hidden', totalBeats === 0);

        templateActGrid.empty();
        if (columns.length === 0) {
            templateActGrid.createDiv({
                cls: 'ert-beat-act-empty',
                text: mode === 'custom' ? 'No beats yet. Switch to Design to add beats.' : 'No beats found for this set.'
            });
            return;
        }

        let runningBeatIdx = 0;
        columns.forEach((column) => {
            const colEl = templateActGrid.createDiv({ cls: 'ert-beat-act-column' });
            const count = column.beats.length;
            const headerText = column.isNumericAct ? `${column.label} (${count})` : `${column.label}${count > 0 ? ` (${count})` : ''}`;
            colEl.createDiv({ cls: 'ert-beat-act-header', text: headerText });
            const listEl = colEl.createDiv({ cls: 'ert-beat-act-list' });
            column.beats.forEach((beat) => {
                runningBeatIdx++;
                listEl.createDiv({ cls: 'ert-beat-act-item', text: `${runningBeatIdx}. ${beat}` });
            });
        });
    };

    const renderTemplatePreview = (system: string) => {
        renderPreviewContent(system);
    };

    // Create template beat note button — wrapped in a container for reliable stage gating.
    // The wrapper is toggled by updateStageVisibility so async Setting updates can't leak.
    const designActionsContainer = beatSystemCard.createDiv();
    let createTemplatesButton: ButtonComponent | undefined;
    let mergeTemplatesButton: ButtonComponent | undefined;
    let refreshBeatAuditPrimaryAction: (() => void) | null = null;
    let primaryDesignAction: (() => Promise<void>) = async () => { await createBeatTemplates(); };
    const saveCurrentCustomSet = async (context: 'design' | 'fields' | 'generic' = 'generic'): Promise<void> => {
        if ((plugin.settings.beatSystem || 'Custom') !== 'Custom') return;
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';

        // Regular Save never prompts rename/save-as.
        // If active set is a saved Pro set, update that set in place.
        const activeConfig = getBeatConfigForSystem(plugin.settings);
        const currentName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom');
        const currentDescription = plugin.settings.customBeatSystemDescription ?? '';
        const currentBeats = (plugin.settings.customBeatSystemBeats || [])
            .map(b => ({
                ...b,
                name: normalizeBeatNameInput(b.name, ''),
                purpose: typeof (b as { purpose?: unknown }).purpose === 'string'
                    ? String((b as { purpose?: unknown }).purpose).trim()
                    : undefined,
            }))
            .filter(b => hasBeatReadableText(b.name));

        const savedSystems = plugin.settings.savedBeatSystems ?? [];
        const existingIdx = savedSystems.findIndex(s => s.id === activeId);
        if (existingIdx >= 0) {
            savedSystems[existingIdx] = {
                ...savedSystems[existingIdx],
                name: currentName,
                description: currentDescription,
                beats: currentBeats,
                beatYamlAdvanced: activeConfig.beatYamlAdvanced,
                beatHoverMetadataFields: activeConfig.beatHoverMetadataFields.map(f => ({ ...f })),
            };
            plugin.settings.savedBeatSystems = savedSystems;
            savedCustomSetIds.add(activeId);
        }

        await plugin.saveSettings();
        captureSetBaseline(activeId);
        dirtyState.notify();
        renderBeatSystemTabs();
        renderPreviewContent(plugin.settings.beatSystem || 'Custom');
        updateTemplateButton(templateSetting, plugin.settings.beatSystem || 'Custom');
        refreshBeatAuditPrimaryAction?.();
        if (context === 'fields') {
            new Notice('Set saved. You can run the audit now.');
        }
    };

    const templateSetting = new Settings(designActionsContainer)
        .setName('Beat notes')
        .setDesc('Create beat note files in your vault based on the selected story structure system.')
        .addButton(button => {
            createTemplatesButton = button;
            button
                .setButtonText('Create beat notes')
                .setTooltip('Create beat note files in your source path')
                .onClick(() => { void primaryDesignAction(); });
        })
        .addButton(button => {
            mergeTemplatesButton = button;
            button
                .setButtonText('Repair beat notes')
                .setTooltip('Update Act and Beat Model in frontmatter for misaligned beat notes. Prefix numbers are not changed.')
                .onClick(async () => {
                    await mergeExistingBeatNotes();
                });
        });

    updateTemplateButton(templateSetting, plugin.settings.beatSystem || 'Custom');

    // Stage 3: Fields (YAML editor, hover metadata, schema audit)
    const fieldsContainer = beatSystemCard.createDiv({ cls: ERT_CLASSES.STACK });
    // Stage 4: Sets (saved/starter beat systems — Custom only)
    const proTemplatesContainer = beatSystemCard.createDiv({ cls: ERT_CLASSES.STACK });

    // ── Stage switcher rendering + visibility ───────────────────────────
    const renderStageSwitcher = () => {
        stageSwitcher.empty();
        const system = plugin.settings.beatSystem || 'Custom';
        const { mode } = deriveBeatSystemMode(system);
        const isCustom = mode === 'custom';

        // Helper: create a numbered stage button
        const makeStageBtn = (
            id: InnerStage,
            stepNum: number,
            label: string,
            disabled = false
        ): HTMLButtonElement => {
            const btn = stageSwitcher.createEl('button', {
                cls: `ert-stage-btn${_currentInnerStage === id ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`,
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': _currentInnerStage === id ? 'true' : 'false',
                    ...(disabled ? { disabled: 'true' } : {})
                }
            });
            btn.createSpan({ cls: 'ert-stage-btn-step', text: `${stepNum}.` });
            btn.appendText(` ${label}`);
            if (!disabled) {
                btn.addEventListener('click', () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                    if (_currentInnerStage === id) return;
                    _currentInnerStage = id;
                    renderStageSwitcher();
                    updateStageVisibility();
                });
            }
            return btn;
        };

        // Stage 1: Preview (acts + beats overview)
        makeStageBtn('preview', 1, 'Preview');

        // Stage 2: Design (beat list editor + beat notes in vault)
        makeStageBtn('design', 2, 'Design');

        // Stage 3: Fields (YAML editor, hover metadata, schema audit)
        makeStageBtn('fields', 3, 'Fields');

        // Stage 4: Sets (Custom only; saved/starter beat systems)
        if (isCustom) {
            const setsBtn = stageSwitcher.createEl('button', {
                cls: `ert-stage-btn${_currentInnerStage === 'sets' ? ' is-active' : ''}`,
                attr: { type: 'button', role: 'tab', 'aria-selected': _currentInnerStage === 'sets' ? 'true' : 'false' }
            });
            setsBtn.createSpan({ cls: 'ert-stage-btn-step', text: '4.' });
            setsBtn.appendText(' Sets');
            setsBtn.addEventListener('click', () => {
                if (_currentInnerStage === 'sets') return;
                _currentInnerStage = 'sets';
                renderStageSwitcher();
                updateStageVisibility();
            });
        }
    };

    /**
     * Shows/hides stage panels based on _currentInnerStage.
     * Preview/Design/Fields visible for all systems; Sets only for Custom.
     */
    const updateStageVisibility = () => {
        const system = plugin.settings.beatSystem || 'Custom';
        const { mode } = deriveBeatSystemMode(system);
        const isCustom = mode === 'custom';

        // Preview: acts + beats overview (templatePreviewContainer for both; custom uses same structure)
        templatePreviewContainer.toggleClass('ert-settings-hidden', _currentInnerStage !== 'preview');

        // Design: beat list editor (Custom only) + beat notes in vault (all)
        customConfigContainer.toggleClass('ert-settings-hidden', !isCustom || _currentInnerStage !== 'design');
        designActionsContainer.toggleClass('ert-settings-hidden', _currentInnerStage !== 'design');

        // Fields: YAML editor, hover metadata, schema audit
        fieldsContainer.toggleClass('ert-settings-hidden', _currentInnerStage !== 'fields');

        // Sets: saved/starter beat systems (Custom only)
        proTemplatesContainer.toggleClass('ert-settings-hidden', !isCustom || _currentInnerStage !== 'sets');

        if (_currentInnerStage === 'design') {
            refreshCustomBeats?.(true);
        }
    };

    const updateTierBanner = (system: string) => {
        tierBannerEl.empty();
        const { mode } = deriveBeatSystemMode(system);
        tierBannerEl.createDiv({ cls: 'ert-beat-tier-line', text: mode === 'builtin' ? 'Built-in beat set' : 'Custom beat set' });
        const builtinLocked = mode === 'builtin' && !canEditBuiltInBeatSystems();
        const statusText = builtinLocked
            ? 'Status: Read-only (Core)'
            : (proActive ? 'Status: Editable (Pro)' : 'Status: Editable (Core)');
        tierBannerEl.createDiv({ cls: 'ert-beat-tier-line ert-beat-tier-status', text: statusText });
        if (builtinLocked) {
            tierBannerEl.createDiv({ cls: 'ert-beat-tier-cta', text: 'Upgrade to Pro to edit beats and fields.' });
        }
    };

    const updateBeatSystemCard = (system: string, options?: { resetStage?: boolean }) => {
        const { mode } = deriveBeatSystemMode(system);
        beatSystemCard.toggleClass('ert-beat-system-card--custom', mode === 'custom');
        updateTierBanner(system);
        renderPreviewContent(system);
        renderBeatYamlEditor();
        updateBeatHoverPreview?.();
        if (options?.resetStage !== false) {
            _currentInnerStage = 'preview';
        }
        renderStageSwitcher();
        updateStageVisibility();
    };

    function renderBeatSystemTabs(): void {
        beatSystemTabs.empty();
        const activeSystem = plugin.settings.beatSystem || 'Custom';
        beatSystemOptions.forEach((option) => {
            const isActive = option.systemName === activeSystem;
            const isCustomTab = option.systemName === 'Custom';
            const tabLabel = isCustomTab ? getCustomTabLabel() : option.label;
            const btn = beatSystemTabs.createEl('button', {
                cls: `ert-mini-tab${isCustomTab ? ' ert-mini-tab--custom' : ''}${isActive ? ` ${ERT_CLASSES.IS_ACTIVE}` : ''}`,
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': isActive ? 'true' : 'false',
                    'aria-controls': 'ert-beat-system-panel'
                }
            });
            // Custom tab gets a live status icon + active set name.
            if (isCustomTab) {
                const status = getCustomTabStatus();
                const iconClass = `ert-mini-tab-icon ert-beat-health-icon${status.statusClass ? ` ${status.statusClass}` : ''}`;
                const iconEl = btn.createSpan({ cls: iconClass });
                setIcon(iconEl, status.icon);
                setTooltip(iconEl, status.tooltip);
                setTooltip(btn, `Custom set: ${tabLabel}. ${status.tooltip}`);
            }
            btn.appendText(tabLabel);

            btn.addEventListener('click', async () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                if (isActive) return;
                plugin.settings.beatSystem = option.systemName;
                await plugin.saveSettings();
                plugin.onSettingChanged(IMPACT_FULL); // Tier 3: beat system change rebuilds timeline beats
                existingBeatReady = false;
                updateTemplateButton(templateSetting, option.systemName);
                updateBeatSystemCard(option.systemName);
                renderBeatSystemTabs();
            });
        });
    }

    // ─── BEAT YAML EDITOR (Core) — always visible in Fields stage ──────
    const beatYamlSection = fieldsContainer.createDiv({ cls: ERT_CLASSES.STACK });
    const beatYamlSetting = new Settings(beatYamlSection)
        .setName('Beat fields')
        .setDesc('Customize additional properties for custom beat notes. Enable fields to show in beat hover info. Use the audit below to check conformity across existing beat notes.');
    // Force editor enabled so Fields content is always visible
    plugin.settings.enableBeatYamlEditor = true;

    const beatYamlContainer = beatYamlSection.createDiv({ cls: ['ert-panel', 'ert-advanced-template-card'] });

    // ─── Beat-fields config helpers (all systems: built-in + custom) ────
    const getActiveSystemKey = (): string => plugin.settings.beatSystem || 'Save The Cat';
    const getConfigForCurrentSystem = (): BeatSystemConfig =>
        getBeatConfigForSystem(plugin.settings, getActiveSystemKey());
    const ensureConfigForCurrentSystem = (): BeatSystemConfig =>
        ensureBeatConfigForSystem(plugin.settings, getActiveSystemKey());

    // Beat hover metadata helpers (operate on active system's config slot)
    const refreshBeatHoverInViews = () => {
        const timelineViews = plugin.getTimelineViews();
        timelineViews.forEach(view => view.refreshTimeline());
    };

    const getBeatHoverMetadata = (key: string): HoverMetadataField | undefined => {
        return getConfigForCurrentSystem().beatHoverMetadataFields.find(f => f.key === key);
    };

    const setBeatHoverMetadata = (key: string, icon: string, enabled: boolean) => {
        if (!canEditFieldsForSystem(getActiveSystemKey())) return;
        const config = ensureConfigForCurrentSystem();
        const existing = config.beatHoverMetadataFields.find(f => f.key === key);
        if (existing) {
            existing.icon = icon;
            existing.enabled = enabled;
        } else {
            config.beatHoverMetadataFields.push({ key, label: key, icon, enabled });
        }
        refreshBeatHoverInViews();
        void plugin.saveSettings();
        dirtyState.notify();
    };

    const removeBeatHoverMetadata = (key: string) => {
        if (!canEditFieldsForSystem(getActiveSystemKey())) return;
        const config = ensureConfigForCurrentSystem();
        config.beatHoverMetadataFields = config.beatHoverMetadataFields.filter(f => f.key !== key);
        refreshBeatHoverInViews();
        void plugin.saveSettings();
        dirtyState.notify();
    };

    const renameBeatHoverMetadataKey = (oldKey: string, newKey: string) => {
        if (!canEditFieldsForSystem(getActiveSystemKey())) return;
        const config = ensureConfigForCurrentSystem();
        const existing = config.beatHoverMetadataFields.find(f => f.key === oldKey);
        if (existing) {
            existing.key = newKey;
            refreshBeatHoverInViews();
            void plugin.saveSettings();
        }
    };

    let updateBeatHoverPreview: (() => void) | undefined;
    let refreshFillEmptyPlanAfterDefaultsChange: (() => void) | undefined;

    const beatBaseTemplate = DEFAULT_SETTINGS.beatYamlTemplates!.base;
    const beatBaseKeys = extractKeysInOrder(beatBaseTemplate);
    // Keys that are blocked from new beat writes (legacy or inapplicable).
    const beatDisallowedNewWriteKeys = new Set(['Description']);

    const renderBeatYamlEditor = () => {
        beatYamlContainer.empty();

        const fieldsReadOnly = !canEditFieldsForSystem(getActiveSystemKey());
        const currentBeatAdvanced = getConfigForCurrentSystem().beatYamlAdvanced;
        const beatAdvancedObj = safeParseYaml(currentBeatAdvanced);

        const beatOptionalOrder = extractKeysInOrder(currentBeatAdvanced).filter(
            k => !beatBaseKeys.includes(k)
        );
        const beatEntries: FieldEntry[] = beatOptionalOrder.map(key => ({
            key,
            value: beatAdvancedObj[key] ?? '',
            required: false
        }));

        let beatWorkingEntries = beatEntries;
        let beatDragIndex: number | null = null;

        const saveBeatEntries = (nextEntries: FieldEntry[]) => {
            if (!canEditFieldsForSystem(getActiveSystemKey())) return;
            beatWorkingEntries = nextEntries;
            const yaml = buildYamlFromEntries(nextEntries);
            const config = ensureConfigForCurrentSystem();
            config.beatYamlAdvanced = yaml;
            void plugin.saveSettings();
            dirtyState.notify();
            refreshFillEmptyPlanAfterDefaultsChange?.();
        };

        const rerenderBeatYaml = (next?: FieldEntry[]) => {
            const data = next ?? beatWorkingEntries;
            beatWorkingEntries = data;
            beatYamlContainer.empty();
            beatYamlContainer.toggleClass('ert-beat-fields-readonly', fieldsReadOnly);

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

            const renderBeatEntryRow = (entry: FieldEntry, idx: number, list: FieldEntry[]) => {
                const row = listEl.createDiv({ cls: ['ert-yaml-row', 'ert-yaml-row--hover-meta'] });

                const hoverMeta = getBeatHoverMetadata(entry.key);
                const currentIcon = hoverMeta?.icon ?? DEFAULT_HOVER_ICON;
                const currentEnabled = hoverMeta?.enabled ?? false;

                // Drag handle
                const dragHandle = row.createDiv({ cls: 'ert-drag-handle' });
                dragHandle.draggable = !fieldsReadOnly;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, fieldsReadOnly ? 'Requires Pro' : 'Drag to reorder');

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
                iconInput.disabled = fieldsReadOnly;
                setTooltip(iconInput, fieldsReadOnly ? 'Requires Pro' : 'Lucide icon name for hover synopsis');

                // Hover checkbox
                const checkboxWrapper = row.createDiv({ cls: 'ert-hover-checkbox-wrapper' });
                const checkbox = checkboxWrapper.createEl('input', {
                    type: 'checkbox',
                    cls: 'ert-hover-checkbox'
                });
                checkbox.checked = currentEnabled;
                checkbox.disabled = fieldsReadOnly;
                setTooltip(checkbox, fieldsReadOnly ? 'Requires Pro' : 'Show in beat hover synopsis');

                if (!fieldsReadOnly) {
                    new IconSuggest(app, iconInput, (selectedIcon) => {
                        iconInput.value = selectedIcon;
                        iconPreview.empty();
                        setIcon(iconPreview, selectedIcon);
                        setBeatHoverMetadata(entry.key, selectedIcon, checkbox.checked);
                        updateBeatHoverPreview?.();
                    });
                }

                if (!fieldsReadOnly) iconInput.oninput = () => {
                    const iconName = iconInput.value.trim();
                    if (iconName && getIconIds().includes(iconName)) {
                        iconPreview.empty();
                        setIcon(iconPreview, iconName);
                        setBeatHoverMetadata(entry.key, iconName, checkbox.checked);
                        updateBeatHoverPreview?.();
                    }
                };

                if (!fieldsReadOnly) checkbox.onchange = () => {
                    const iconName = iconInput.value.trim() || DEFAULT_HOVER_ICON;
                    setBeatHoverMetadata(entry.key, iconName, checkbox.checked);
                    updateBeatHoverPreview?.();
                };

                // Key input
                const keyInput = row.createEl('input', { type: 'text', cls: 'ert-input ert-input--md' });
                keyInput.value = entry.key;
                keyInput.placeholder = 'Key';
                keyInput.disabled = fieldsReadOnly;
                if (!fieldsReadOnly) keyInput.onchange = () => {
                    const newKey = normalizeBeatFieldKeyInput(keyInput.value);
                    if (!newKey || !hasBeatReadableText(newKey)) {
                        keyInput.value = entry.key;
                        new Notice('Field key must include letters or numbers.');
                        return;
                    }
                    keyInput.value = newKey;
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
                valInput.disabled = fieldsReadOnly;
                if (Array.isArray(value)) {
                    valInput.value = value.join(', ');
                    valInput.placeholder = 'Comma-separated values';
                    if (!fieldsReadOnly) valInput.onchange = () => {
                        valInput.value = normalizeBeatFieldListValueInput(valInput.value).join(', ');
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: normalizeBeatFieldListValueInput(valInput.value) };
                        saveBeatEntries(nextList);
                        updateBeatHoverPreview?.();
                    };
                } else {
                    valInput.value = typeof value === 'string' ? value : '';
                    valInput.placeholder = 'Default value (optional)';
                    if (!fieldsReadOnly) valInput.onchange = () => {
                        valInput.value = normalizeBeatFieldValueInput(valInput.value);
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: normalizeBeatFieldValueInput(valInput.value) };
                        saveBeatEntries(nextList);
                        updateBeatHoverPreview?.();
                    };
                }

                // Delete button (matches scene: ert-iconBtn + trash icon)
                const delBtn = row.createEl('button', { cls: 'ert-iconBtn', attr: { type: 'button', 'aria-label': 'Remove field' } });
                setIcon(delBtn, 'trash');
                setTooltip(delBtn, fieldsReadOnly ? 'Requires Pro' : 'Remove field');
                delBtn.disabled = fieldsReadOnly;
                if (!fieldsReadOnly) delBtn.onclick = () => {
                    removeBeatHoverMetadata(entry.key);
                    const nextList = list.filter((_, i) => i !== idx);
                    saveBeatEntries(nextList);
                    rerenderBeatYaml(nextList);
                    updateBeatHoverPreview?.();
                };

                // Drag events (matches scene: is-dragging / ert-template-dragover + plugin.registerDomEvent)
                if (!fieldsReadOnly) {
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
                }
            };

            data.forEach((entry, idx) => renderBeatEntryRow(entry, idx, data));

            // Add new field row — only when editable
            if (!fieldsReadOnly) {
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
            setTooltip(addBtn, 'Add custom beat property');

            const doAddBeatField = () => {
                if (!canEditFieldsForSystem(getActiveSystemKey())) return;
                const newKey = normalizeBeatFieldKeyInput(addKeyInput.value);
                if (!newKey || !hasBeatReadableText(newKey)) {
                    new Notice('Field key must include letters or numbers.');
                    return;
                }
                addKeyInput.value = newKey;
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
                const normalizedValue = normalizeBeatFieldValueInput(addValInput.value || '');
                addValInput.value = normalizedValue;
                const nextList = [...data, { key: newKey, value: normalizedValue, required: false }];
                saveBeatEntries(nextList);
                rerenderBeatYaml(nextList);
                updateBeatHoverPreview?.();
            };
            addBtn.onclick = doAddBeatField;
            addKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAddBeatField(); } });

            const revertBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-template-reset-btn'] });
            setIcon(revertBtn, 'rotate-ccw');
            setTooltip(revertBtn, 'Revert beat properties to default');
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
                    header.createDiv({ text: 'Reset beat properties', cls: 'ert-modal-title' });
                    header.createDiv({ text: 'Resetting will delete all custom beat properties, lucide icons, and restore the defaults.', cls: 'ert-modal-subtitle' });

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

                if (!canEditFieldsForSystem(getActiveSystemKey())) return;
                const resetConfig = ensureConfigForCurrentSystem();
                resetConfig.beatYamlAdvanced = '';
                resetConfig.beatHoverMetadataFields = [];
                await plugin.saveSettings();
                rerenderBeatYaml([]);
                updateBeatHoverPreview?.();
                dirtyState.notify();
            };
        };
            }

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
        const activeConfig = getConfigForCurrentSystem();
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
            const iconName = typeof field.icon === 'string' ? field.icon.trim() : '';
            if (iconName) {
                const iconEl = lineEl.createSpan({ cls: 'ert-hover-preview-icon' });
                setIcon(iconEl, iconName);
            }
            const value = templateObj[field.key];
            const valueStr = Array.isArray(value) ? value.join(', ') : (value ?? '');
            const displayText = valueStr ? `${field.key}: ${valueStr}` : field.key;
            lineEl.createSpan({ text: displayText, cls: 'ert-hover-preview-text' });
        });
    };

    updateBeatHoverPreview = renderBeatHoverPreview;
    renderBeatHoverPreview();

    // ─── SAVED BEAT SYSTEMS (Sets tab) ────
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
    savedTitleRow.createSpan({ text: ' Beat system sets' });

    savedCard.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Blank custom is always available as a reset. Starter sets are curated starting points. Saved sets are your own versions you can edit and delete. Core: one custom set. Pro: unlimited custom sets and five bonus starter sets.'
    });

    const savedControlsContainer = savedCard.createDiv({ cls: ERT_CLASSES.STACK });

    // hasUnsavedChanges() was removed — unified into isSetDirty() via dirtyState store.
    // Both dirty indicators (dropdown warning + dirty notice) now use the same baseline.

    /** Apply a saved or built-in system as the active system and refresh UI. */
    const applyLoadedSystem = (system: { id: string; name: string; description?: string; beats: { name: string; act: number; purpose?: string; id?: string; range?: string }[]; beatYamlAdvanced?: string; beatHoverMetadataFields?: { key: string; label: string; icon: string; enabled: boolean }[] }) => {
        // 1. Guarantee we're on the Custom system (config resolution depends on this)
        plugin.settings.beatSystem = 'Custom';
        // 2. Activate this set's id so config resolves to custom:<id>
        plugin.settings.activeCustomBeatSystemId = system.id;
        // 3. Write beats/name/description
        plugin.settings.customBeatSystemName = normalizeBeatSetNameInput(system.name);
        plugin.settings.customBeatSystemDescription = system.description ?? '';
        plugin.settings.customBeatSystemBeats = system.beats.map(b => ({
            ...b,
            name: normalizeBeatNameInput(b.name),
            purpose: typeof b.purpose === 'string' ? b.purpose.trim() : undefined,
        }));
        // 4. Write per-system YAML/hover config into the correct slot
        const configKey = `custom:${system.id}`;
        if (!plugin.settings.beatSystemConfigs) plugin.settings.beatSystemConfigs = {};
        plugin.settings.beatSystemConfigs[configKey] = {
            beatYamlAdvanced: system.beatYamlAdvanced ?? '',
            beatHoverMetadataFields: system.beatHoverMetadataFields
                ? system.beatHoverMetadataFields.map(f => ({ ...f }))
                : [],
        };

        // 5. Capture baseline for any loaded set (starter or saved) so we detect modifications
        captureSetBaseline(system.id);

        // DEV: prove config activation is correct
        if (process.env.NODE_ENV !== 'production') {
            const slot = plugin.settings.beatSystemConfigs[configKey];
            console.debug('[loadSet]', {
                activeCustomBeatSystemId: system.id,
                configSlotExists: !!slot,
                yamlLength: slot?.beatYamlAdvanced?.length ?? 0,
                hoverFieldCount: slot?.beatHoverMetadataFields?.length ?? 0,
            });
        }

        // 6. Switch to Design stage so the user sees the loaded beats immediately
        _currentInnerStage = 'design';
        void plugin.saveSettings().then(() => {
            plugin.onSettingChanged(IMPACT_FULL); // Tier 3: loaded set changes timeline beats
        });
        new Notice(`Loaded "${system.name}" into Custom.`);

        // 7. Targeted UI refresh — update only the affected sections instead of
        //    a full renderStoryBeatsSection() call. This avoids the callback-null
        //    window and preserves subscriptions that are still valid.
        existingBeatReady = false;
        renderCustomConfig();           // Design tab (beat list, header, health)
        renderBeatYamlEditor();         // Fields tab (YAML fields for new system)
        updateBeatHoverPreview?.();     // Fields tab (hover preview)
        renderSavedBeatSystems();       // Sets tab (dropdown, preview, dirty)
        updateBeatSystemCard('Custom', { resetStage: false }); // Keep Design visible
        renderBeatSystemTabs();         // Ensure Custom tab is visually active
    };

    type LoadableEntry = {
        id: string;
        name: string;
        description?: string;
        beats: { name: string; act: number }[];
        beatYamlAdvanced?: string;
        beatHoverMetadataFields?: { key: string; label: string; icon: string; enabled: boolean }[];
        builtIn: boolean;
        isDefault?: boolean;
    };

    const renderSavedBeatSystems = () => {
        // Unsubscribe previous Pro Sets dirty listener before clearing DOM
        _unsubProSetsDirty?.();
        _unsubProSetsDirty = null;
        savedControlsContainer.empty();

        if (!proActive) {
            savedControlsContainer.createDiv({ cls: 'ert-pro-locked-hint', text: 'Core includes 1 custom beat system.' });
        }

        const savedSystems: SavedBeatSystem[] = plugin.settings.savedBeatSystems ?? [];
        const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
        const unsaved = isSetDirty();

        // Build unified lookup of all loadable systems (built-in Pro + user-saved)
        const allLoadable = new Map<string, LoadableEntry>();
        allLoadable.set('default', {
            id: 'default',
            name: 'Custom',
            description: '',
            beats: [],
            beatYamlAdvanced: '',
            beatHoverMetadataFields: [],
            builtIn: true,
            isDefault: true
        });
        PRO_BEAT_SETS.forEach(ps => allLoadable.set(ps.id, { ...ps, builtIn: true }));
        savedSystems.forEach(s => allLoadable.set(s.id, { ...s, builtIn: false }));

        // Track currently selected entry for the preview card
        let selectedEntry: LoadableEntry | null = allLoadable.get(activeId) ?? null;

        // ── Dropdown ─────────────────────────────────────────────────
        let dropdownRef: { setValue: (v: string) => void } | null = null;
        const previousSelectionId = selectedEntry?.id ?? '';
        const selectRow = new Settings(savedControlsContainer)
            .setName('Select a set')
            .addDropdown(drop => {
                dropdownRef = drop;
                const hasAny = true;
                drop.addOption('', hasAny ? 'Select a set...' : '—');

                // Always-first reset option
                drop.addOption('default', '↺ Blank custom (reset)');

                // Built-in Pro sets first
                if (PRO_BEAT_SETS.length > 0) {
                    PRO_BEAT_SETS.forEach(ps => {
                        drop.addOption(ps.id, `★ ${ps.name}`);
                    });
                }

                // User-saved systems
                savedSystems.forEach(s => {
                    drop.addOption(s.id, s.name);
                });

                // Auto-select the currently active system if it exists
                if (selectedEntry) {
                    drop.setValue(selectedEntry.id);
                }

                drop.onChange(value => {
                    const nextEntry = value ? (allLoadable.get(value) ?? null) : null;

                    // Guard: if the current set has unsaved changes, confirm before switching
                    if (isSetDirty() && nextEntry && nextEntry.id !== previousSelectionId) {
                        const confirmModal = new Modal(app);
                        confirmModal.titleEl.setText('');
                        confirmModal.contentEl.empty();
                        confirmModal.modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                        confirmModal.contentEl.addClass('ert-modal-container', 'ert-stack');
                        const header = confirmModal.contentEl.createDiv({ cls: 'ert-modal-header' });
                        header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                        header.createDiv({ cls: 'ert-modal-title', text: 'Unsaved changes' });
                        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Your current set has been modified. Switching will discard those changes.' });
                        const footer = confirmModal.contentEl.createDiv({ cls: 'ert-modal-actions' });
                        new ButtonComponent(footer).setButtonText('Discard & switch').setWarning().onClick(() => {
                            confirmModal.close();
                            selectedEntry = nextEntry;
                            renderPreviewCard();
                            updateActionButtons();
                        });
                        new ButtonComponent(footer).setButtonText('Cancel').onClick(() => {
                            confirmModal.close();
                            // Revert dropdown to previous selection
                            dropdownRef?.setValue(previousSelectionId);
                        });
                        confirmModal.open();
                        return;
                    }

                    selectedEntry = nextEntry;
                    renderPreviewCard();
                    updateActionButtons();
                });
            });
        selectRow.settingEl.addClass('ert-saved-beat-select');

        // ── Set-dirty notice (works for both starter and saved sets) ──
        const dirtyNoticeEl = savedControlsContainer.createDiv({ cls: 'ert-starter-dirty-notice ert-settings-hidden' });
        dirtyNoticeEl.dataset.dirtyTarget = 'proNotice';

        // ── Preview card ─────────────────────────────────────────────
        const previewEl = savedControlsContainer.createDiv({ cls: 'ert-set-preview ert-settings-hidden' });
        previewEl.dataset.dirtyTarget = 'proPreview';

        // Subscribe to dirtyState for Pro Sets dirty notice.
        // Cleaned up at the top of renderSavedBeatSystems() before DOM is cleared.
        const updateProSetsDirtyNotice = () => {
            const notice = savedControlsContainer.querySelector<HTMLElement>('[data-dirty-target="proNotice"]');
            const preview = savedControlsContainer.querySelector<HTMLElement>('[data-dirty-target="proPreview"]');
            if (!notice) return; // container was emptied — subscription will be cleaned up
            const dirty = isSetDirty();
            const isStarter = isStarterSetActive();
            // Dirty notice
            notice.empty();
            if (dirty) {
                notice.removeClass('ert-settings-hidden');
                const iconEl = notice.createSpan({ cls: 'ert-starter-dirty-icon' });
                setIcon(iconEl, 'alert-triangle');
                if (isStarter) {
                    notice.appendText('Modified — Starter set changed. ');
                    const copyLink = notice.createEl('button', {
                        cls: 'ert-starter-dirty-link',
                        text: 'Save a copy',
                        attr: { type: 'button' }
                    });
                    copyLink.appendText(' to keep your version.');
                    copyLink.addEventListener('click', () => { void saveSetModal({ isCopy: true }); }); // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                } else {
                    notice.appendText('Modified — Set has unsaved changes. ');
                    const saveLink = notice.createEl('button', {
                        cls: 'ert-starter-dirty-link',
                        text: 'Save set',
                        attr: { type: 'button' }
                    });
                    saveLink.appendText(' to update.');
                    saveLink.addEventListener('click', () => { void saveCurrentCustomSet('generic'); }); // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                }
            } else {
                notice.addClass('ert-settings-hidden');
            }
            // Preview card dirty accent
            if (preview) preview.classList.toggle('ert-set-preview--dirty', dirty);
        };
        _unsubProSetsDirty = dirtyState.subscribe(updateProSetsDirtyNotice);
        updateProSetsDirtyNotice();

        const renderPreviewCard = () => {
            previewEl.empty();
            if (!selectedEntry) {
                previewEl.addClass('ert-settings-hidden');
                return;
            }
            previewEl.removeClass('ert-settings-hidden');

            const titleRow = previewEl.createDiv({ cls: 'ert-set-preview-header' });
            titleRow.createSpan({ text: selectedEntry.name, cls: 'ert-set-preview-title' });
            const tag = titleRow.createSpan({
                text: selectedEntry.isDefault ? 'Core default' : (selectedEntry.builtIn ? 'Starter' : 'Saved'),
                cls: `ert-set-preview-tag ${selectedEntry.builtIn ? 'ert-set-preview-tag--starter' : 'ert-set-preview-tag--saved'}`
            });
            if (selectedEntry.isDefault) {
                setIcon(tag, 'rotate-ccw');
            } else if (selectedEntry.builtIn) {
                setIcon(tag, 'star');
            }

            const entryDescText = selectedEntry.description
                || (selectedEntry.isDefault ? 'Blank custom set (reset to zero).' : '');
            if (entryDescText) {
                const descEl = previewEl.createDiv({ cls: 'ert-set-preview-desc ert-set-preview-desc--clamped' });
                descEl.setText(entryDescText);
                // "Show more / less" toggle for long descriptions
                const toggleEl = previewEl.createEl('button', {
                    cls: 'ert-set-preview-toggle',
                    text: 'Show more',
                    attr: { type: 'button' }
                });
                toggleEl.addEventListener('click', () => { // SAFE: direct addEventListener; Settings lifecycle manages cleanup
                    // Preserve scroll position to prevent jump in Obsidian settings pane
                    const scrollParent = previewEl.closest('.vertical-tab-content') as HTMLElement | null;
                    const scrollTop = scrollParent?.scrollTop ?? 0;
                    const expanded = descEl.classList.toggle('ert-set-preview-desc--expanded');
                    descEl.classList.toggle('ert-set-preview-desc--clamped', !expanded);
                    toggleEl.setText(expanded ? 'Show less' : 'Show more');
                    if (scrollParent) scrollParent.scrollTop = scrollTop;
                    toggleEl.focus();
                });
                // Hide toggle if content fits within the clamp
                requestAnimationFrame(() => {
                    if (descEl.scrollHeight <= descEl.clientHeight + 2) {
                        toggleEl.addClass('ert-settings-hidden');
                    }
                });
            }

            // Count unique acts
            const actSet = new Set(selectedEntry.beats.map(b => b.act));
            previewEl.createDiv({
                cls: 'ert-set-preview-meta',
                text: `${selectedEntry.beats.length} beats · ${actSet.size} act${actSet.size !== 1 ? 's' : ''}`
            });
        };
        renderPreviewCard();

        // ── Action buttons ───────────────────────────────────────────
        const actionsRow = savedControlsContainer.createDiv({ cls: 'ert-inline-actions ert-inline-actions--end' });

        // ── Shared: save-as-copy modal + persistence ─────────────────
        const saveSetModal = async (opts: { isCopy: boolean }): Promise<void> => {
            const currentBeats = (plugin.settings.customBeatSystemBeats || [])
                .map(b => ({ ...b, name: normalizeBeatNameInput(b.name, '') }));
            if (currentBeats.some(b => !hasBeatReadableText(b.name))) {
                new Notice('Beat names must include letters or numbers before saving a set.');
                return;
            }
            if (currentBeats.length === 0) {
                new Notice('No beats defined. Add beats before saving.');
                return;
            }
            const activeConfig = getBeatConfigForSystem(plugin.settings);
            const currentName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom');
            const defaultName = opts.isCopy ? `${currentName} (Copy)` : currentName;
            const modalTitle = opts.isCopy ? 'Save a copy' : 'Save set';
            const modalSubtitle = opts.isCopy
                ? 'Create an editable copy of this starter set. The original stays unchanged.'
                : 'Enter a name for this set. Existing sets with the same name will be updated.';

            const saveName = await new Promise<string | null>((resolve) => {
                const modal = new Modal(app);
                const { modalEl, contentEl } = modal;
                modal.titleEl.setText('');
                contentEl.empty();
                modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                contentEl.addClass('ert-modal-container', 'ert-stack');
                const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                header.createDiv({ cls: 'ert-modal-title', text: modalTitle });
                header.createDiv({ cls: 'ert-modal-subtitle', text: modalSubtitle });
                const inputRow = contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                const nameInput = inputRow.createEl('input', {
                    type: 'text',
                    cls: 'ert-input ert-input--full',
                    attr: { placeholder: 'Set name' }
                }) as HTMLInputElement;
                nameInput.value = defaultName;
                const actionsDiv = contentEl.createDiv({ cls: ['ert-modal-actions', 'ert-inline-actions'] });
                new ButtonComponent(actionsDiv).setButtonText('Save').setCta().onClick(() => {
                    const name = normalizeBeatSetNameInput(nameInput.value, '');
                    if (!name || !hasBeatReadableText(name)) {
                        new Notice('Set name must include letters or numbers.');
                        return;
                    }
                    modal.close();
                    resolve(name);
                });
                new ButtonComponent(actionsDiv).setButtonText('Cancel').onClick(() => { modal.close(); resolve(null); });
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const name = normalizeBeatSetNameInput(nameInput.value, '');
                        if (!name || !hasBeatReadableText(name)) {
                            new Notice('Set name must include letters or numbers.');
                            return;
                        }
                        modal.close();
                        resolve(name);
                    }
                });
                modal.open();
                setTimeout(() => nameInput.focus(), 50);
            });

            if (!saveName) return;

            const existingSystems = plugin.settings.savedBeatSystems ?? [];
            // Copies never overwrite; regular save can update same-name entry
            const existingIdx = opts.isCopy ? -1 : existingSystems.findIndex(s => s.name === saveName);

            const newSystem: SavedBeatSystem = {
                id: existingIdx >= 0 ? existingSystems[existingIdx].id : `${Date.now()}`,
                name: saveName,
                description: plugin.settings.customBeatSystemDescription ?? '',
                beats: currentBeats,
                beatYamlAdvanced: activeConfig.beatYamlAdvanced,
                beatHoverMetadataFields: activeConfig.beatHoverMetadataFields.map(f => ({ ...f })),
                createdAt: new Date().toISOString()
            };

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
            // Re-capture baseline so the saved state becomes the new "clean" reference
            captureSetBaseline(newSystem.id);
            savedCustomSetIds.add(newSystem.id);
            const verb = opts.isCopy ? 'copied' : (existingIdx >= 0 ? 'updated' : 'saved');
            new Notice(`Set "${saveName}" ${verb}.`);
            // Targeted refresh — no full re-render needed
            if (opts.isCopy) {
                _currentInnerStage = 'design';
                renderCustomConfig();           // Design header shows new name/origin
                renderPreviewContent('Custom'); // Preview reflects new set's beats/description
                renderBeatYamlEditor();         // Fields reflect new system's YAML
                updateBeatHoverPreview?.();     // Hover preview reflects new config
                renderSavedBeatSystems();       // Pro Sets dropdown updated
                renderStageSwitcher();          // Stage buttons reflect Design active
                updateStageVisibility();        // Show Design stage
            } else {
                // Non-copy save: re-render Design header (clears dirty indicators)
                // + Pro Sets panel (updates dropdown/preview)
                renderCustomConfig();
                renderPreviewContent('Custom'); // Preview reflects saved state
                renderSavedBeatSystems();
            }
        };
        // Load set CTA
        let loadBtn: ButtonComponent;
        const loadSetAction = () => {
            if (!selectedEntry) return;
            const entry = selectedEntry;
            const currentName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom beats');
            const currentHasBeats = (plugin.settings.customBeatSystemBeats ?? []).length > 0;

            if (isSetDirty()) {
                // Only confirm if the current set has unsaved modifications
                const confirmModal = new Modal(app);
                const { modalEl, contentEl } = confirmModal;
                confirmModal.titleEl.setText('');
                contentEl.empty();
                modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                contentEl.addClass('ert-modal-container', 'ert-stack');
                const header = contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                header.createDiv({ cls: 'ert-modal-title', text: 'Unsaved changes' });
                header.createDiv({ cls: 'ert-modal-subtitle', text: `"${currentName}" has unsaved changes. Loading "${entry.name}" will discard them.` });
                const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer).setButtonText('Discard & load').setWarning().onClick(() => {
                    confirmModal.close();
                    applyLoadedSystem(entry);
                });
                new ButtonComponent(footer).setButtonText('Cancel').onClick(() => confirmModal.close());
                confirmModal.open();
            } else {
                applyLoadedSystem(entry);
            }
        };
        loadBtn = new ButtonComponent(actionsRow)
            .setButtonText('Load set')
            .setCta()
            .setDisabled(!selectedEntry)
            .onClick(loadSetAction);

        // Save a copy (starter) / Save set (user-owned)
        let saveBtn: ButtonComponent;
        saveBtn = new ButtonComponent(actionsRow)
            .setButtonText(isStarterSetActive() ? 'Save a copy' : 'Save set')
            .onClick(() => {
                if (isStarterSetActive()) {
                    void saveSetModal({ isCopy: true });
                    return;
                }
                void saveCurrentCustomSet('generic');
            });

        // Delete set — hidden when starter set is selected
        let deleteBtn: ButtonComponent;
        deleteBtn = new ButtonComponent(actionsRow)
            .setButtonText('Delete set')
            .onClick(async () => {
                if (!selectedEntry || selectedEntry.builtIn) return;
                const system = savedSystems.find(s => s.id === selectedEntry!.id);
                if (!system) return;
                const confirmModal = new Modal(app);
                confirmModal.titleEl.setText('');
                confirmModal.contentEl.empty();
                confirmModal.modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                confirmModal.contentEl.addClass('ert-modal-container', 'ert-stack');
                const header = confirmModal.contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT SYSTEM' });
                header.createDiv({ cls: 'ert-modal-title', text: 'Delete set' });
                header.createDiv({ cls: 'ert-modal-subtitle', text: `Delete "${system.name}"? This cannot be undone.` });
                const footer = confirmModal.contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer).setButtonText('Delete').setWarning().onClick(async () => {
                    const wasActive = plugin.settings.activeCustomBeatSystemId === system.id;
                    plugin.settings.savedBeatSystems = savedSystems.filter(s => s.id !== system.id);
                    if (plugin.settings.beatSystemConfigs) {
                        delete plugin.settings.beatSystemConfigs[`custom:${system.id}`];
                    }
                    savedCustomSetIds.delete(system.id);
                    if (wasActive) {
                        // Reset to a clean blank custom system
                        plugin.settings.activeCustomBeatSystemId = 'default';
                        plugin.settings.customBeatSystemName = '';
                        plugin.settings.customBeatSystemDescription = '';
                        plugin.settings.customBeatSystemBeats = [];
                        // Ensure default config slot is clean
                        if (!plugin.settings.beatSystemConfigs) plugin.settings.beatSystemConfigs = {};
                        plugin.settings.beatSystemConfigs['custom:default'] = {
                            beatYamlAdvanced: '',
                            beatHoverMetadataFields: [],
                        };
                        // Clear dirty baseline — the set no longer exists
                        clearSetBaseline();
                    }
                    await plugin.saveSettings();
                    confirmModal.close();
                    new Notice(`Deleted set "${system.name}".`);
                    // Reset audit state since beats were cleared
                    existingBeatReady = false;
                    // Refresh all affected UI
                    renderCustomConfig();
                    renderPreviewContent('Custom');
                    renderBeatYamlEditor();
                    updateBeatHoverPreview?.();
                    renderSavedBeatSystems();
                    renderStageSwitcher();
                    updateStageVisibility();
                });
                new ButtonComponent(footer).setButtonText('Cancel').onClick(() => confirmModal.close());
                confirmModal.open();
            });

        const updateActionButtons = () => {
            loadBtn.setDisabled(!selectedEntry);
            // Save button adapts label based on what's active
            const starterNow = isStarterSetActive();
            saveBtn.setButtonText(starterNow ? 'Save a copy' : 'Save set');
            // Hide delete for starter sets, show for saved
            const isStarter = selectedEntry?.builtIn ?? true;
            deleteBtn.buttonEl.toggleClass('ert-settings-hidden', isStarter || !selectedEntry);
        };
        updateActionButtons();
    };

    renderSavedBeatSystems();
    updateBeatSystemCard(plugin.settings.beatSystem || 'Custom');
    renderBeatSystemTabs();
    _unsubTopBeatTabsDirty = dirtyState.subscribe(() => {
        renderBeatSystemTabs();
    });

    // Scene YAML Templates Section
    const yamlHeading = new Settings(yamlStack)
        .setName('Advanced scene YAML sets')
        .setHeading();
    addHeadingIcon(yamlHeading, 'form');
    addWikiLink(yamlHeading, 'Settings#yaml-templates');
    applyErtHeaderLayout(yamlHeading);

    let onAdvancedToggle: (() => void) | undefined;

    const advancedYamlSetting = new Settings(yamlStack)
        .setName('Advanced YAML editor')
        .setDesc('Set up custom scene YAML keys for the advanced YAML set. Enable fields to reveal in scene hover synopsis. Type any keyword to search for a perfect lucide icon. Reorder fields to match your preferred order.');
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

        const requiredValues: Record<string, FieldEntryValue> = {};
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

        const entries: FieldEntry[] = optionalOrder.map((key) => {
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

        const saveEntries = (nextEntries: FieldEntry[]) => {
            workingEntries = nextEntries;
            // Only save optional/advanced entries - base fields are now stored separately
            // This prevents duplication and ensures clean separation between base and advanced templates
            const yaml = buildYamlFromEntries(nextEntries, advancedComments);
            if (!plugin.settings.sceneYamlTemplates) plugin.settings.sceneYamlTemplates = { base: DEFAULT_SETTINGS.sceneYamlTemplates!.base, advanced: '' };
            plugin.settings.sceneYamlTemplates.advanced = yaml;
            void plugin.saveSettings();
        };

        const rerender = (next?: FieldEntry[]) => {
            const data = next ?? workingEntries;
            workingEntries = data;
            advancedContainer.empty();
            advancedContainer.toggleClass('ert-settings-hidden', !isEnabled);
            if (!isEnabled) return;

            const listEl = advancedContainer.createDiv({ cls: ['ert-template-entries', 'ert-template-indent'] });

            // Get active migrations for highlighting rows that need updates
            const activeMigrations = getActiveMigrations(plugin.settings);

            const renderEntryRow = (entry: FieldEntry, idx: number, list: FieldEntry[]) => {
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
                    new Notice(`"${k}" is required and already present in the base set.`);
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
            setTooltip(revertBtn, 'Revert to original set');
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
                    header.createDiv({ text: 'Reset advanced YAML set', cls: 'ert-modal-title' });
                    header.createDiv({ text: 'Resetting will delete all renamed and custom fields, lucide icons, and restore the default set.', cls: 'ert-modal-subtitle' });

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

    // Scene audit container (created here for DOM order: editor → audit → preview)
    const sceneAuditContainer = yamlStack.createDiv({ cls: ERT_CLASSES.STACK });

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

    const backdropYamlSection = (backdropYamlTargetEl ?? yamlStack).createDiv({ cls: ERT_CLASSES.STACK });

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
        const backdropEntries: FieldEntry[] = backdropOptionalOrder.map(key => ({
            key,
            value: backdropAdvancedObj[key] ?? '',
            required: false
        }));

        let backdropWorkingEntries = backdropEntries;
        let backdropDragIndex: number | null = null;

        const saveBackdropEntries = (nextEntries: FieldEntry[]) => {
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

        const rerenderBackdropYaml = (next?: FieldEntry[]) => {
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

            const renderBackdropEntryRow = (entry: FieldEntry, idx: number, list: FieldEntry[]) => {
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
                    cls: 'ert-input ert-input--md',
                    attr: { placeholder: 'Key' }
                });
                keyInput.value = entry.key;

                // Value input
                const valInput = row.createEl('input', {
                    type: 'text',
                    cls: 'ert-input ert-input--md',
                    attr: { placeholder: 'Value' }
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

            // Add new field row (matching scene YAML row layout)
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
            setTooltip(addCheckbox, 'Show in backdrop hover synopsis');

            // 5. Key input (direct child)
            const addKeyInput = addRow.createEl('input', { type: 'text', cls: 'ert-input ert-input--md', attr: { placeholder: 'New key' } });

            // 6. Value input (direct child)
            const addValInput = addRow.createEl('input', { type: 'text', cls: 'ert-input ert-input--md', attr: { placeholder: 'Value' } }) as HTMLInputElement;

            // 7. Buttons wrapper (holds both + and reset)
            const btnWrap = addRow.createDiv({ cls: ['ert-iconBtnGroup', 'ert-template-actions'] });

            const addBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-mod-cta'] });
            setIcon(addBtn, 'plus');
            setTooltip(addBtn, 'Add custom field');
            addBtn.addEventListener('click', () => {
                const k = (addKeyInput.value || '').trim();
                if (!k) return;
                if (backdropBaseKeys.includes(k)) {
                    new Notice(`"${k}" is a base field and cannot be used as a custom key.`);
                    return;
                }
                if (backdropDisallowedNewWriteKeys.has(k)) {
                    new Notice(`"${k}" is a legacy backdrop key. Use "Context" instead.`);
                    return;
                }
                if (data.some(e => e.key === k)) {
                    new Notice(`Key "${k}" already exists.`);
                    return;
                }
                const iconName = addIconInput.value.trim() || DEFAULT_HOVER_ICON;
                if (addCheckbox.checked || iconName !== DEFAULT_HOVER_ICON) {
                    setBackdropHoverMetadata(k, iconName, addCheckbox.checked);
                }
                const next = [...data, { key: k, value: addValInput.value || '', required: false }];
                saveBackdropEntries(next);
                rerenderBackdropYaml(next);
                updateBackdropHoverPreview?.();
            });

            const revertBtn = btnWrap.createEl('button', { cls: ['ert-iconBtn', 'ert-template-reset-btn'] });
            setIcon(revertBtn, 'rotate-ccw');
            setTooltip(revertBtn, 'Clear all custom backdrop fields');
            revertBtn.addEventListener('click', async () => {
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
        type FillEmptyPlan = {
            files: TFile[];
            entries: Array<{ file: TFile; emptyKeys: string[] }>;
            fieldsToInsert: Record<string, string | string[]>;
            filledFields: number;
            touchedKeys: string[];
            sourcePath: string;
        };
        let fillEmptyPlan: FillEmptyPlan | null = null;

        const resolveBeatAuditSystemKey = (): string | undefined => {
            if (noteType !== 'Beat') return beatSystemKey;
            return plugin.settings.beatSystem === 'Custom'
                ? `custom:${plugin.settings.activeCustomBeatSystemId ?? 'default'}`
                : (plugin.settings.beatSystem ?? 'Save The Cat');
        };
        const isCustomBeatAudit = (): boolean => {
            const activeBeatSystemKey = resolveBeatAuditSystemKey();
            return noteType === 'Beat'
                && plugin.settings.beatSystem === 'Custom'
                && !!activeBeatSystemKey
                && activeBeatSystemKey.startsWith('custom:');
        };
        const isCustomBeatSetOfficial = (): boolean => {
            if (!isCustomBeatAudit()) return false;
            const activeId = plugin.settings.activeCustomBeatSystemId ?? 'default';
            if (activeId === 'default') return false;
            if (!savedCustomSetIds.has(activeId)) return false;
            if (isSetDirty()) return false;
            return true;
        };
        const getScopedBookFiles = (files: TFile[]): { sourcePath: string; files: TFile[] } => {
            const sourcePath = normalizePath((plugin.settings.sourcePath || '').trim());
            if (!sourcePath) return { sourcePath: '', files: [] };
            const prefix = sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`;
            return {
                sourcePath,
                files: files.filter(file => file.path === sourcePath || file.path.startsWith(prefix))
            };
        };
        const isEmptyValue = (value: unknown): boolean => {
            if (value === undefined || value === null) return true;
            if (typeof value === 'string') return value.trim().length === 0;
            if (Array.isArray(value)) return value.length === 0;
            return false;
        };
        const hasDefaultValue = (value: string | string[]): boolean => {
            if (Array.isArray(value)) return value.length > 0;
            return value.trim().length > 0;
        };
        const buildFillEmptyPlan = (files: TFile[], activeBeatSystemKey?: string): FillEmptyPlan | null => {
            if (!isCustomBeatSetOfficial()) return null;

            const { sourcePath, files: scopedFiles } = getScopedBookFiles(files);
            if (!sourcePath || scopedFiles.length === 0) return null;

            const customKeys = getCustomKeys('Beat', plugin.settings, activeBeatSystemKey);
            if (customKeys.length === 0) return null;
            const defaults = getCustomDefaults('Beat', plugin.settings, activeBeatSystemKey);

            const fieldsToInsert: Record<string, string | string[]> = {};
            customKeys.forEach((key) => {
                const value = defaults[key] ?? '';
                if (hasDefaultValue(value)) {
                    fieldsToInsert[key] = value;
                }
            });
            const keys = Object.keys(fieldsToInsert);
            if (keys.length === 0) return null;

            const candidateFiles: TFile[] = [];
            const entries: Array<{ file: TFile; emptyKeys: string[] }> = [];
            const touchedKeySet = new Set<string>();
            let filledFields = 0;

            for (const file of scopedFiles) {
                const cache = app.metadataCache.getFileCache(file);
                if (!cache?.frontmatter) continue;
                const fm = cache.frontmatter as Record<string, unknown>;

                let fileHasCandidate = false;
                const fileEmptyKeys: string[] = [];
                for (const key of keys) {
                    if (!(key in fm)) continue;
                    if (!isEmptyValue(fm[key])) continue;
                    fileHasCandidate = true;
                    filledFields++;
                    touchedKeySet.add(key);
                    fileEmptyKeys.push(key);
                }
                if (fileHasCandidate) {
                    candidateFiles.push(file);
                    entries.push({ file, emptyKeys: fileEmptyKeys });
                }
            }

            if (candidateFiles.length === 0 || filledFields === 0) return null;
            return {
                files: candidateFiles,
                entries,
                fieldsToInsert,
                filledFields,
                touchedKeys: [...touchedKeySet].sort(),
                sourcePath,
            };
        };

        // ─── Header row: two-column Setting layout (title+desc left, audit button right) ──
        const auditSetting = new Settings(parentEl)
            .setName(`Validate ${noteType.toLowerCase()} properties`)
            .setDesc(
                isCustomBeatAudit()
                    ? 'Scan beat notes for schema drift and empty custom-field values.'
                    : `Scan ${noteType.toLowerCase()} notes for schema drift — missing fields, extra keys, and ordering issues.`
            );

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
        let fillEmptyBtn: HTMLButtonElement | undefined;
        auditSetting.addButton(button => {
            button
                .setButtonText('Fill empty values')
                .setTooltip('Fill empty existing custom beat fields in the active book folder')
                .onClick(() => void handleFillEmptyValues());
            fillEmptyBtn = button.buttonEl;
            fillEmptyBtn.classList.add('ert-settings-hidden');
        });

        // Run audit button — disabled when no notes of this type exist
        let auditBtn: ButtonComponent | undefined;
        let auditPrimaryAction: (() => void) | null = null;
        const updateAuditPrimaryAction = () => {
            if (!auditBtn) return;
            const isBeatFieldsStage = noteType === 'Beat' && plugin.settings.beatSystem === 'Custom';
            if (isBeatFieldsStage && isSetDirty()) {
                auditBtn.setDisabled(false);
                auditBtn.setButtonText('Save changes');
                auditBtn.setTooltip('Save changes before running beat audit');
                auditBtn.buttonEl.classList.add('ert-save-changes-btn--attention');
                auditPrimaryAction = () => { void saveCurrentCustomSet('fields'); };
                return;
            }
            auditBtn.buttonEl.classList.remove('ert-save-changes-btn--attention');
            const activeBeatSystemKey = resolveBeatAuditSystemKey();
            const preCheckFiles = collectFilesForAudit(app, noteType, plugin.settings, activeBeatSystemKey);
            if (preCheckFiles.length === 0) {
                auditBtn.setDisabled(true);
                auditBtn.setButtonText('Run audit');
                auditBtn.setTooltip(`No ${noteType.toLowerCase()} notes found. Create beat notes first.`);
            } else {
                auditBtn.setDisabled(false);
                auditBtn.setButtonText('Run audit');
                auditBtn.setTooltip(`Scan all ${noteType.toLowerCase()} notes for YAML schema drift`);
            }
            auditPrimaryAction = () => runAudit();
        };
        auditSetting.addButton(button => {
            auditBtn = button;
            button
                .setButtonText('Run audit')
                .setTooltip(`Scan all ${noteType.toLowerCase()} notes for YAML schema drift`)
                .onClick(() => auditPrimaryAction?.());
        });

        updateAuditPrimaryAction();
        if (noteType === 'Beat') {
            refreshBeatAuditPrimaryAction = updateAuditPrimaryAction;
            _unsubBeatAuditDirty?.();
            _unsubBeatAuditDirty = dirtyState.subscribe(updateAuditPrimaryAction);
        }

        // ─── Results row: appears below header after audit runs ──────────
        const resultsEl = parentEl.createDiv({ cls: 'ert-audit-results-row ert-settings-hidden' });

        const runAudit = () => {
            const activeBeatSystemKey = resolveBeatAuditSystemKey();
            const files = collectFilesForAudit(app, noteType, plugin.settings, activeBeatSystemKey);
            if (files.length === 0) {
                resultsEl.empty();
                resultsEl.classList.remove('ert-settings-hidden');
                resultsEl.createDiv({
                    text: `No ${noteType.toLowerCase()} notes found in the vault yet.`,
                    cls: 'ert-audit-clean'
                });
                new Notice(`No ${noteType.toLowerCase()} notes found in the vault.`);
                return;
            }
            auditResult = runYamlAudit({
                app,
                settings: plugin.settings,
                noteType,
                files,
                beatSystemKey: activeBeatSystemKey,
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
            const allowInsertMissing = !isCustomBeatAudit();
            if (allowInsertMissing && auditResult.summary.notesWithMissing > 0) {
                backfillBtn?.classList.remove('ert-settings-hidden');
            } else {
                backfillBtn?.classList.add('ert-settings-hidden');
            }

            fillEmptyPlan = buildFillEmptyPlan(files, activeBeatSystemKey);
            if (fillEmptyPlan) {
                fillEmptyBtn?.classList.remove('ert-settings-hidden');
                fillEmptyBtn?.setAttribute(
                    'aria-label',
                    `Fill ${fillEmptyPlan.filledFields} empty value${fillEmptyPlan.filledFields !== 1 ? 's' : ''} in ${fillEmptyPlan.files.length} note${fillEmptyPlan.files.length !== 1 ? 's' : ''}`
                );
            } else {
                fillEmptyBtn?.classList.add('ert-settings-hidden');
            }

            renderResults();
            updateAuditPrimaryAction();
        };

        // ─── Render results ──────────────────────────────────────────────
        const renderResults = () => {
            resultsEl.empty();
            resultsEl.classList.remove('ert-settings-hidden');
            if (!auditResult) return;

            const s = auditResult.summary;
            const emptyValueNotes = fillEmptyPlan?.entries.length ?? 0;
            const emptyValueFields = fillEmptyPlan?.filledFields ?? 0;
            const schemaIssuePaths = new Set(
                auditResult.notes
                    .filter(n =>
                        n.missingFields.length > 0
                        || n.extraKeys.length > 0
                        || n.orderDrift
                        || n.semanticWarnings.length > 0
                    )
                    .map(n => n.file.path)
            );
            const emptyOnlyCount = fillEmptyPlan
                ? fillEmptyPlan.entries.filter(entry => !schemaIssuePaths.has(entry.file.path)).length
                : 0;
            const effectiveClean = Math.max(0, s.clean - emptyOnlyCount);

            // Schema health + summary in one line
            const healthLevel = (s.notesWithMissing > 0 || emptyValueNotes > 0)
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

            if (emptyValueNotes > 0) {
                const emptyEl = resultsEl.createDiv({ cls: 'ert-audit-unread-warn' });
                emptyEl.textContent = `${emptyValueNotes} note${emptyValueNotes !== 1 ? 's' : ''} have ${emptyValueFields} empty custom field value${emptyValueFields !== 1 ? 's' : ''}.`;

                const emptyDetails = resultsEl.createDiv({ cls: 'ert-audit-note-pills' });
                for (const entry of fillEmptyPlan!.entries.slice(0, AUDIT_OPEN_ALL_MAX)) {
                    const keys = entry.emptyKeys.join(', ');
                    const pillEl = emptyDetails.createEl('button', {
                        cls: 'ert-audit-note-pill ert-audit-note-pill--warning',
                        attr: { type: 'button' }
                    });
                    pillEl.createSpan({ text: entry.file.basename, cls: 'ert-audit-note-pill-name' });
                    pillEl.createSpan({ text: ` — empty: ${keys}`, cls: 'ert-audit-note-pill-reason' });
                    setTooltip(pillEl, `${entry.file.basename}: empty values in ${keys}`);
                    pillEl.addEventListener('click', async () => {
                        await openOrRevealFile(app, entry.file, false);
                        new Notice(`Empty values: ${keys}`);
                    });
                }
            }

            // All clean — early return
            if (s.clean === s.totalNotes && s.unreadNotes === 0 && s.notesWithWarnings === 0 && emptyValueNotes === 0) {
                resultsEl.createDiv({
                    text: `All ${s.totalNotes} notes are up to date with this set.`,
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
                if (effectiveClean > 0) {
                    chipsEl.createSpan({ text: `${effectiveClean} clean`, cls: 'ert-chip ert-audit-chip ert-audit-chip--clean' });
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

            const defaults = getCustomDefaults(noteType, plugin.settings, resolveBeatAuditSystemKey());
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
                modal.titleEl.setText('');
                modal.contentEl.empty();
                modal.modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                modal.contentEl.addClass('ert-modal-container', 'ert-stack');

                const header = modal.contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT AUDIT' });
                header.createDiv({ cls: 'ert-modal-title', text: 'Insert missing fields' });
                header.createDiv({
                    cls: 'ert-modal-subtitle',
                    text: `Insert fields into ${targetFiles.length} ${noteType.toLowerCase()} note${targetFiles.length !== 1 ? 's' : ''}.`
                });

                const body = modal.contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                body.createDiv({ text: 'The following fields will be added (existing values are never overwritten):' });
                const fieldListEl = body.createEl('ul');
                for (const [key, val] of Object.entries(fieldsToInsert)) {
                    const valStr = Array.isArray(val) ? val.join(', ') : val;
                    fieldListEl.createEl('li', { text: valStr ? `${key}: ${valStr}` : `${key}: (empty)` });
                }

                const footer = modal.contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer).setButtonText('Insert').setCta().onClick(() => { modal.close(); resolve(true); });
                new ButtonComponent(footer).setButtonText('Cancel').onClick(() => { modal.close(); resolve(false); });

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

            // Wait for Obsidian metadata cache to re-index before refreshing audit
            setTimeout(() => runAudit(), 750);
        };

        const handleFillEmptyValues = async () => {
            if (!isCustomBeatAudit()) {
                new Notice('Fill empty values is available for Custom beat systems only.');
                return;
            }
            if (!isCustomBeatSetOfficial()) {
                new Notice('Save the active custom set before filling empty values.');
                return;
            }
            if (!fillEmptyPlan) {
                new Notice('No empty custom beat fields with defaults found in the active book folder.');
                return;
            }

            const confirmed = await new Promise<boolean>((resolve) => {
                const modal = new Modal(app);
                modal.titleEl.setText('');
                modal.contentEl.empty();
                modal.modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                modal.contentEl.addClass('ert-modal-container', 'ert-stack');

                const header = modal.contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'BEAT AUDIT' });
                header.createDiv({ cls: 'ert-modal-title', text: 'Fill empty values' });
                header.createDiv({
                    cls: 'ert-modal-subtitle',
                    text: `Fill ${fillEmptyPlan!.filledFields} empty value${fillEmptyPlan!.filledFields !== 1 ? 's' : ''} in ${fillEmptyPlan!.files.length} beat note${fillEmptyPlan!.files.length !== 1 ? 's' : ''}.`
                });

                const body = modal.contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                body.createDiv({ text: `Scope: ${fillEmptyPlan!.sourcePath}`, cls: 'ert-modal-subtitle' });
                body.createDiv({ text: 'Only existing empty keys are filled. No keys are added, removed, or overwritten.' });
                const fieldListEl = body.createEl('ul');
                fillEmptyPlan!.touchedKeys.forEach((key) => {
                    const val = fillEmptyPlan!.fieldsToInsert[key];
                    const valStr = Array.isArray(val) ? val.join(', ') : val;
                    fieldListEl.createEl('li', { text: `${key}: ${valStr}` });
                });

                const footer = modal.contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer).setButtonText('Fill').setCta().onClick(() => { modal.close(); resolve(true); });
                new ButtonComponent(footer).setButtonText('Cancel').onClick(() => { modal.close(); resolve(false); });

                modal.onClose = () => resolve(false);
                modal.open();
            });

            if (!confirmed) return;

            const result = await runYamlFillEmptyValues({
                app,
                files: fillEmptyPlan.files,
                fieldsToInsert: fillEmptyPlan.fieldsToInsert,
            });

            console.debug('[YamlAudit] yaml_fill_empty_execute', {
                noteType,
                beatSystemKey: resolveBeatAuditSystemKey(),
                sourcePath: fillEmptyPlan.sourcePath,
                updated: result.updated,
                filledFields: result.filledFields,
                skipped: result.skipped,
                failed: result.failed,
                keys: fillEmptyPlan.touchedKeys,
            });

            const parts: string[] = [];
            if (result.updated > 0) parts.push(`Updated ${result.updated} note${result.updated !== 1 ? 's' : ''}`);
            if (result.filledFields > 0) parts.push(`Filled ${result.filledFields} value${result.filledFields !== 1 ? 's' : ''}`);
            if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);
            if (result.failed > 0) parts.push(`${result.failed} failed`);
            new Notice(parts.join(', ') || 'No changes made.');

            // Wait for Obsidian metadata cache to re-index before refreshing audit
            setTimeout(() => runAudit(), 750);
        };

        // Allow the YAML fields editor to refresh the fill plan when defaults change
        refreshFillEmptyPlanAfterDefaultsChange = () => {
            if (!auditResult) return;
            const activeBeatSystemKey = resolveBeatAuditSystemKey();
            const files = collectFilesForAudit(app, noteType, plugin.settings, activeBeatSystemKey);
            fillEmptyPlan = buildFillEmptyPlan(files, activeBeatSystemKey);
            if (fillEmptyPlan) {
                fillEmptyBtn?.classList.remove('ert-settings-hidden');
                fillEmptyBtn?.setAttribute(
                    'aria-label',
                    `Fill ${fillEmptyPlan.filledFields} empty value${fillEmptyPlan.filledFields !== 1 ? 's' : ''} in ${fillEmptyPlan.files.length} note${fillEmptyPlan.files.length !== 1 ? 's' : ''}`
                );
            } else {
                fillEmptyBtn?.classList.add('ert-settings-hidden');
            }
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

    // Scene audit panel (container already created above for DOM order: editor → audit → preview)
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
        const builtinLocked = isTemplateMode && !canEditBuiltInBeatSystems();
        const isDirtyCustom = isCustom && isSetDirty();
        let displayName = selectedSystem;
        let baseDesc = '';
        let hasBeats = true;
        const setPrimaryDesignButton = (
            text: string,
            tooltip: string,
            disabled: boolean,
            action: () => Promise<void>
        ) => {
            primaryDesignAction = action;
            if (!createTemplatesButton) return;
            createTemplatesButton.setButtonText(text);
            createTemplatesButton.setTooltip(tooltip);
            createTemplatesButton.setDisabled(disabled);
            createTemplatesButton.buttonEl.classList.toggle(
                'ert-save-changes-btn--attention',
                text === 'Save changes' && !disabled
            );
        };

        if (isCustom) {
            displayName = normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom');
            const beats = (plugin.settings.customBeatSystemBeats || []).map((b: unknown) => {
                if (typeof b === 'string') return normalizeBeatNameInput(b, '');
                if (typeof b === 'object' && b !== null && (b as { name?: unknown }).name) {
                    return normalizeBeatNameInput(String((b as { name: unknown }).name), '');
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

        if (builtinLocked) {
            setPrimaryDesignButton(
                'Create missing beat notes',
                'Upgrade to Pro to edit beats and fields.',
                true,
                async () => { /* no-op: disabled */ }
            );
            if (mergeTemplatesButton) {
                mergeTemplatesButton.setDisabled(true);
                mergeTemplatesButton.buttonEl.addClass('ert-hidden');
            }
            setting.setDesc(`${baseDesc} Upgrade to Pro to create and repair beat notes.`);
            return;
        }

        // Default button states before async lookup
        if (isDirtyCustom) {
            setPrimaryDesignButton(
                'Save changes',
                'Save this set before creating or repairing beat notes',
                false,
                async () => { await saveCurrentCustomSet('design'); }
            );
        } else if (isTemplateMode) {
            setPrimaryDesignButton(
                'Create missing beat notes',
                'Create missing beat notes in your source path',
                !hasBeats,
                async () => { await createBeatTemplates(); }
            );
        } else {
            setPrimaryDesignButton(
                'Create beat notes',
                'Create beat note files in your source path',
                !hasBeats,
                async () => { await createBeatTemplates(); }
            );
        }
        if (mergeTemplatesButton) {
            mergeTemplatesButton.setDisabled(true);
            mergeTemplatesButton.buttonEl.addClass('ert-hidden');
        }
        if (isDirtyCustom) {
            setting.setDesc(`${baseDesc} Save changes before creating or repairing beat notes.`);
            return;
        }
        if (!hasBeats) return;

        void (async () => {
            const lookup = await refreshExistingBeatLookup(true, selectedSystem);
            if (!lookup) return;
            const activeSystem = plugin.settings.beatSystem || 'Custom';
            if (selectedSystem !== activeSystem) return;

            const newBeats = existingBeatNewCount;
            const hasNew = newBeats > 0;

            // ── Template mode (built-in systems): simplified status ──────
            // Built-in systems (Save The Cat, StoryGrid, Hero's Journey) only
            // offer "create". Once beats exist the author owns their placement
            // — alignment, numbering, and duplicates are not surfaced because
            // no repair tooling is provided for these read-only definitions.
            if (isTemplateMode) {
                const foundCount = existingBeatMatchedCount;
                const expectedCount = existingBeatExpectedCount;

                if (foundCount === 0) {
                    // No beat notes found yet
                    setting.setDesc(baseDesc);
                    setPrimaryDesignButton(
                        'Create missing beat notes',
                        `Create ${expectedCount} beat notes for ${selectedSystem}`,
                        false,
                        async () => { await createBeatTemplates(); }
                    );
                } else if (hasNew) {
                    // Some exist, some missing
                    const statusDesc = `${foundCount} of ${expectedCount} beat notes found.`;
                    setting.setDesc(`${baseDesc} ${statusDesc}`);
                    setPrimaryDesignButton(
                        `Create ${newBeats} missing beat note${newBeats > 1 ? 's' : ''}`,
                        `Create the remaining ${newBeats} beat note${newBeats > 1 ? 's' : ''} for ${selectedSystem}`,
                        false,
                        async () => { await createBeatTemplates(); }
                    );
                } else {
                    // All beat notes exist
                    const statusDesc = `All ${expectedCount} beat notes created.`;
                    setting.setDesc(`${baseDesc} ${statusDesc}`);
                    setPrimaryDesignButton(
                        'Create missing beat notes',
                        'All beat notes already exist',
                        true,
                        async () => { await createBeatTemplates(); }
                    );
                }
                return;
            }

            // ── Custom mode: full health analysis ────────────────────────
            const synced = existingBeatSyncedCount;
            const misaligned = existingBeatMisalignedCount;
            const duplicates = existingBeatDuplicateCount;
            const missingModel = existingBeatMissingModelCount;
            const allSynced = synced === existingBeatExpectedCount && misaligned === 0 && duplicates === 0 && missingModel === 0;
            const hasMisaligned = misaligned > 0;
            const hasDuplicates = duplicates > 0;
            const hasMissingModel = missingModel > 0;

            if (existingBeatMatchedCount === 0 && !hasMissingModel) {
                // Scenario A: Fresh — no existing files
                setting.setDesc(baseDesc);
                setPrimaryDesignButton(
                    'Create beat notes',
                    `Create ${existingBeatExpectedCount} beat note files`,
                    false,
                    async () => { await createBeatTemplates(); }
                );
                return;
            }

            // Build concise status description from non-zero counts
            const legacyMatched = existingBeatLegacyMatchedCount;
            const parts: string[] = [];
            if (synced > 0) parts.push(`${synced} synced`);
            if (misaligned > 0) parts.push(`${misaligned} misaligned`);
            if (newBeats > 0) parts.push(`${newBeats} missing`);
            if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates > 1 ? 's' : ''}`);
            if (missingModel > 0) parts.push(`Missing Beat Model (${missingModel})`);
            if (legacyMatched > 0) parts.push(`${legacyMatched} matched by filename`);
            let statusDesc = parts.join(', ') + '.';
            if (legacyMatched > 0) statusDesc += ' Run Repair to lock Beat Id.';

            if (allSynced) {
                // Scenario B: All synced — nothing to do
                statusDesc = `All ${existingBeatExpectedCount} beat notes are synced.`;
                if (createTemplatesButton) {
                    setPrimaryDesignButton(
                        createTemplatesButton.buttonEl.textContent || 'Create beat notes',
                        'All beats already have aligned files',
                        true,
                        async () => { await createBeatTemplates(); }
                    );
                }
            } else if (hasNew) {
                // Scenario D: Has new beats to create
                if (createTemplatesButton) {
                    setPrimaryDesignButton(
                        `Create ${newBeats} missing beat note${newBeats > 1 ? 's' : ''}`,
                        `Create missing beat notes for ${newBeats} beat${newBeats > 1 ? 's' : ''} without files`,
                        false,
                        async () => { await createBeatTemplates(); }
                    );
                }
            } else {
                // Scenario C: All matched, some misaligned — no new beats
                if (createTemplatesButton) {
                    setPrimaryDesignButton(
                        createTemplatesButton.buttonEl.textContent || 'Create beat notes',
                        hasMissingModel
                            ? 'All beats have files. Use Repair to set missing Beat Model values.'
                            : 'All beats have files. Use Repair to fix Act and Beat Model.',
                        true,
                        async () => { await createBeatTemplates(); }
                    );
                }
            }

            // Merge button: show when misaligned beats, missing Beat Model, or legacy-matched notes exist (Custom only)
            const hasLegacyToRepair = legacyMatched > 0;
            if (mergeTemplatesButton && isCustom && (hasMisaligned || hasMissingModel || hasLegacyToRepair)) {
                mergeTemplatesButton.buttonEl.removeClass('ert-hidden');
                mergeTemplatesButton.setDisabled(false);
                const repairCount = misaligned + missingModel + legacyMatched;
                mergeTemplatesButton.setButtonText(`Repair ${repairCount} beat note${repairCount > 1 ? 's' : ''}`);
                const repairBits: string[] = [];
                if (misaligned > 0) repairBits.push(`${misaligned} misaligned`);
                if (missingModel > 0) repairBits.push(`${missingModel} missing Beat Model`);
                if (legacyMatched > 0) repairBits.push(`${legacyMatched} missing Beat Id`);
                mergeTemplatesButton.setTooltip(`Update Act, Beat Model, and Beat Id for ${repairBits.join(' and ')} beat note${repairCount > 1 ? 's' : ''}. Prefix numbers are not changed.`);
            }

            if (hasDuplicates) {
                statusDesc += ` Resolve duplicate${duplicates > 1 ? 's' : ''} before merging. Manually delete duplicate beat notes.`;
            }

            setting.setDesc(`${baseDesc} ${statusDesc}`);

            // Refresh the health icon in the Design header
            refreshHealthIcon?.();
            // Keep top-level Custom tab status icon/label in sync.
            renderBeatSystemTabs();
        })();
    }

    async function mergeExistingBeatNotes(): Promise<void> {
        const storyStructureName = plugin.settings.beatSystem || 'Custom';
        if (storyStructureName !== 'Custom') {
            new Notice('Merge is available for Custom beat systems only.');
            return;
        }

        const maxActs = getActCount();
        const beats: BeatRow[] = orderBeatsByAct(
            (plugin.settings.customBeatSystemBeats || [])
                .map(parseBeatRow)
                .map(b => ({ ...b, act: clampBeatAct(b.act, maxActs) })),
            maxActs
        );
        if (beats.length === 0) {
            new Notice('No custom beats defined. Add beats in the list above.');
            return;
        }

        const expectedKeys = new Set(beats.map(b => normalizeBeatTitle(b.name)).filter(k => k.length > 0));
        const existing = await collectExistingBeatNotes(true, storyStructureName);
        const existingMatched = existing ?? [];
        const missingModelCandidates = collectBeatNotesMissingModelByExpectedNames(expectedKeys);
        if (existingMatched.length === 0 && missingModelCandidates.length === 0) {
            new Notice('No existing beat notes found to merge.');
            return;
        }

        const existingLookup = buildExistingBeatLookup(existingMatched);
        const missingModelLookup = buildExistingBeatLookup(missingModelCandidates);
        const customModelName = storyStructureName === 'Custom'
            ? normalizeBeatSetNameInput(plugin.settings.customBeatSystemName || '', 'Custom')
            : storyStructureName;
        const conflicts: string[] = [];
        const duplicates: string[] = [];
        const beatIdConflicts: string[] = [];
        const updates: Array<{ file: TFile; targetPath: string; act: number; needsBeatModelFix: boolean; beatId?: string }> = [];
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

        beats.forEach((beatLine) => {
            const key = normalizeBeatTitle(beatLine.name);
            if (!key) return;
            if (duplicateKeys.has(key)) {
                duplicates.push(beatLine.name);
                return;
            }

            // Try Beat Id matching first
            let matches: TimelineItem[] | undefined;
            let needsBeatModelFix = false;
            if (beatLine.id && existingBeatIdLookup.has(beatLine.id)) {
                matches = existingBeatIdLookup.get(beatLine.id);
            }
            if (!matches || matches.length === 0) {
                matches = existingLookup.get(key);
            }
            if (!matches || matches.length === 0) {
                const missingMatches = missingModelLookup.get(key);
                if (!missingMatches || missingMatches.length === 0) return;
                matches = missingMatches;
                needsBeatModelFix = true;
            }
            if (!matches || matches.length === 0) return;
            if (matches.length > 1) {
                duplicates.push(beatLine.name);
                return;
            }
            const match = matches[0];
            if (!match.path) return;
            const file = app.vault.getAbstractFileByPath(match.path);
            if (!(file instanceof TFile)) return;

            // Check Beat Id conflict: note already has a different Beat Id
            const existingBeatId = match["Beat Id"];
            let beatIdToWrite = beatLine.id;
            if (existingBeatId && beatLine.id && existingBeatId !== beatLine.id) {
                beatIdConflicts.push(beatLine.name);
                beatIdToWrite = undefined;
            }

            updates.push({ file, targetPath: file.path, act: beatLine.act, needsBeatModelFix, beatId: beatIdToWrite });
        });

        if (updates.length === 0) {
            const conflictHint = conflicts.length > 0 ? ` Conflicts: ${conflicts.length}.` : '';
            const duplicateHint = duplicates.length > 0 ? ` Duplicates: ${duplicates.length}. Manually delete duplicate beat notes.` : '';
            new Notice(`No beat notes could be merged.${conflictHint}${duplicateHint}`);
            return;
        }

        let beatIdWrittenCount = 0;
        for (const update of updates) {
            await app.fileManager.processFrontMatter(update.file, (fm: Record<string, unknown>) => {
                fm['Act'] = update.act;
                fm['Beat Model'] = customModelName;
                if (!fm['Class']) fm['Class'] = 'Beat';
                if (update.beatId && !fm['Beat Id']) {
                    fm['Beat Id'] = update.beatId;
                    beatIdWrittenCount++;
                }
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

        const updatedCount = updates.length;
        const modelFixedCount = updates.filter(update => update.needsBeatModelFix).length;
        const conflictHint = conflicts.length > 0 ? ` ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} skipped.` : '';
        const duplicateHint = duplicates.length > 0 ? ` ${duplicates.length} duplicate title${duplicates.length > 1 ? 's' : ''} skipped (manually delete duplicate beat notes).` : '';
        const modelHint = modelFixedCount > 0 ? ` Set Beat Model on ${modelFixedCount} note${modelFixedCount > 1 ? 's' : ''}.` : '';
        const beatIdHint = beatIdWrittenCount > 0 ? ` Locked Beat Id on ${beatIdWrittenCount} note${beatIdWrittenCount > 1 ? 's' : ''}.` : '';
        const beatIdConflictHint = beatIdConflicts.length > 0 ? ` ${beatIdConflicts.length} Beat Id conflict${beatIdConflicts.length > 1 ? 's' : ''} (existing id differs).` : '';
        new Notice(`Repaired ${updatedCount} beat note${updatedCount > 1 ? 's' : ''} (Act, Beat Model).${modelHint}${beatIdHint}${conflictHint}${duplicateHint}${beatIdConflictHint}`);
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
        
        const beatTemplate = getMergedBeatYaml(plugin.settings);
        const modal = new CreateBeatSetModal(
            app,
            plugin,
            storyStructureName,
            storyStructure.beatCount || storyStructure.beats.length,
            beatTemplate
        );
        modal.open();
        const result = await modal.waitForConfirmation();
        if (!result.confirmed) return;
        try {
            const sourcePath = plugin.settings.sourcePath || '';
            const { created, skipped, errors, createdPaths } = await createBeatNotesFromSet(
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
                new Notice(`✓ Successfully created ${created} Beat set notes!`);
            }
            existingBeatReady = false;
            // Wait until metadata cache is ready for all newly created beat files.
            // This prevents partial row-state updates (e.g., 2/3 rows recognized).
            const waitForCreatedBeatCaches = async (paths: string[], timeoutMs = 5000): Promise<void> => {
                if (paths.length === 0) return;
                const start = Date.now();
                const pending = new Set(paths);
                while (pending.size > 0 && (Date.now() - start) < timeoutMs) {
                    for (const path of [...pending]) {
                        const file = app.vault.getAbstractFileByPath(path);
                        if (!(file instanceof TFile)) continue;
                        const cache = app.metadataCache.getFileCache(file);
                        if (cache?.frontmatter) {
                            pending.delete(path);
                        }
                    }
                    if (pending.size === 0) break;
                    await new Promise(resolve => window.setTimeout(resolve, 120));
                }
            };
            await waitForCreatedBeatCaches(createdPaths);
            updateTemplateButton(templateSetting, storyStructureName);
            void refreshExistingBeatLookup(true, storyStructureName).then(() => {
                refreshCustomBeatList?.();
            });
        } catch (error) {
            console.error('[Beat Templates] Failed:', error);
            new Notice(`Failed to create story beat sets: ${error}`);
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

function safeParseYaml(template: string): Record<string, FieldEntryValue> {
    try {
        const parsed = parseYaml(template);
        if (!parsed || typeof parsed !== 'object') return {};
        const entries: Record<string, FieldEntryValue> = {};
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

function buildYamlFromEntries(entries: FieldEntry[], commentMap?: Record<string, string>): string {
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
    requiredValues: Record<string, FieldEntryValue>,
    optionalEntries: FieldEntry[],
    commentMap?: Record<string, string>
): string {
    const combined: FieldEntry[] = [
        ...requiredOrder.map(key => ({
            key,
            value: requiredValues[key] ?? '',
            required: true
        })),
        ...optionalEntries
    ];
    return buildYamlFromEntries(combined, commentMap);
}

function entriesFromTemplate(template: string, requiredOrder: string[]): FieldEntry[] {
    const order = mergeOrders(extractKeysInOrder(template), requiredOrder);
    const obj = safeParseYaml(template);
    return order.map(key => ({
        key,
        value: obj[key] ?? '',
        required: requiredOrder.includes(key)
    }));
}

// Primary export
export { renderStoryBeatsSection as renderBeatPropertiesSection };
