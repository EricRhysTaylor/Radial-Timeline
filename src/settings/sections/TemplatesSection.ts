import { App, Notice, Setting as Settings, parseYaml, setIcon, setTooltip, Modal, ButtonComponent, getIconIds } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { TimelineItem } from '../../types';
import { CreateBeatsTemplatesModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem, getCustomSystemFromSettings } from '../../utils/beatsSystems';
import { createBeatTemplateNotes } from '../../utils/beatsTemplates';
import { DEFAULT_SETTINGS } from '../defaults';
import { renderMetadataSection } from './MetadataSection';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import type { HoverMetadataField } from '../../types/settings';
import { IconSuggest } from '../IconSuggest';
import { clampActNumber, parseActLabels, resolveActLabel } from '../../utils/acts';
import { ERT_CLASSES, ERT_DATA } from '../../ui/classes';
import { getActiveMigrations, REFACTOR_ALERTS, areAlertMigrationsComplete, type FieldMigration } from '../refactorAlerts';
import { getScenePrefixNumber } from '../../utils/text';

type TemplateEntryValue = string | string[];
type TemplateEntry = { key: string; value: TemplateEntryValue; required: boolean };

const DEFAULT_HOVER_ICON = 'align-vertical-space-around';

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

    type ActRange = { min: number; max: number };

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
            if (scene.itemType === 'Beat' || scene.itemType === 'Plot' || scene.itemType === 'Backdrop') return;
            const numStr = getScenePrefixNumber(scene.title, scene.number);
            if (!numStr) return;
            const num = Number(numStr);
            if (!Number.isFinite(num)) return;
            const rawAct = Number(scene.actNumber ?? scene.act ?? 1);
            const act = clampActNumber(rawAct, actCount);
            const existing = ranges.get(act);
            if (!existing) {
                ranges.set(act, { min: num, max: num });
            } else {
                if (num < existing.min) existing.min = num;
                if (num > existing.max) existing.max = num;
            }
        });

        return ranges;
    };

    const buildActStartNumbers = (ranges: Map<number, ActRange>): Map<number, number> => {
        const actStarts = new Map<number, number>();
        ranges.forEach((range, act) => {
            if (act > 1) actStarts.set(act, range.min);
        });
        return actStarts;
    };

    new Settings(actsStack)
        .setName('Act count')
        .setDesc('Applies to Narrative, Subplot, and Gossamer modes. Scene and Beats YAML. (Minimum 3)')
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

    const beatSystemSetting = new Settings(beatsStack)
        .setName('Available system templates')
        .setDesc('Select the story structure model for your manuscript. This will establish the story beat system and can be used to create beat notes and graph scores using Gossamer mode manually or automatically using AI.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('Save The Cat', 'Save The Cat (15 beats)')
                .addOption('Hero\'s Journey', 'Hero\'s Journey (12 beats)')
                .addOption('Story Grid', 'Story Grid (5 Commandments)')                    
                .addOption('Custom', 'Custom (User defined beat structure)')
                .setValue(plugin.settings.beatSystem || 'Custom')
                .onChange(async (value) => {
                    plugin.settings.beatSystem = value;
                    await plugin.saveSettings();
                    updateStoryStructureDescription(storyStructureInfo, value);
                    updateTemplateButton(templateSetting, value);
                    updateCustomInputsVisibility(value);
                });
            dropdown.selectEl.classList.add('ert-setting-dropdown', 'ert-setting-dropdown--wide');
        });
    beatSystemSetting.settingEl.addClass('ert-setting-two-row');

    // Story structure explanation
    const storyStructureInfo = beatSystemSetting.settingEl.createDiv({
        cls: 'ert-story-structure-info setting-item-description'
    });
    
    updateStoryStructureDescription(storyStructureInfo, plugin.settings.beatSystem || 'Custom');

    // --- Custom System Configuration (Dynamic Visibility) ---
    const customConfigContainer = beatsStack.createDiv({ cls: ['ert-custom-beat-config', ERT_CLASSES.STACK] });

    const renderCustomConfig = () => {
        customConfigContainer.empty();
        
        new Settings(customConfigContainer)
            .setName('Custom story beat system editor')
            .setDesc('The name of your custom beat system (e.g. "7 Point Structure"). Assigned to the "Beat Model" field in YAML. Drag to reorder beats.')
            .addText(text => text
                .setPlaceholder('Custom')
                .setValue(plugin.settings.customBeatSystemName || 'Custom')
                .then(t => {
                    t.inputEl.addClass('ert-input--md');
                    return t;
                })
                .onChange(async (value) => {
                    plugin.settings.customBeatSystemName = value;
                    await plugin.saveSettings();
                    updateTemplateButton(templateSetting, 'Custom');
                }));

        // Beat List Editor (draggable rows with Name + Act)
        const beatWrapper = customConfigContainer.createDiv({ cls: 'ert-custom-beat-wrapper' });

        const listContainer = beatWrapper.createDiv({ cls: 'ert-custom-beat-list' });

        type BeatRow = { name: string; act: number };

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

        const saveBeats = async (beats: BeatRow[]) => {
            plugin.settings.customBeatSystemBeats = beats;
            await plugin.saveSettings();
            updateTemplateButton(templateSetting, 'Custom');
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

        const clampAct = (val: number, maxActs: number) => {
            const n = Number.isFinite(val) ? val : 1;
            return Math.min(Math.max(1, n), maxActs);
        };

        let actRanges = new Map<number, ActRange>();

        const buildBeatNumbers = (beats: BeatRow[], maxActs: number, ranges: Map<number, ActRange>): number[] => {
            if (!ranges || ranges.size === 0) {
                return beats.map((_, idx) => idx + 1);
            }
            const actStarts = buildActStartNumbers(ranges);
            const useActAligned = actStarts.size > 0;
            if (!useActAligned) return beats.map((_, idx) => idx + 1);

            const nextByAct = new Map<number, number>();
            return beats.map((beatLine, index) => {
                const actNum = clampAct(beatLine.act, maxActs);
                const start = actStarts.get(actNum);
                if (start !== undefined) {
                    const next = nextByAct.get(actNum) ?? start;
                    nextByAct.set(actNum, next + 1);
                    return next;
                }
                if (actNum === 1) {
                    const next = nextByAct.get(actNum) ?? 1;
                    nextByAct.set(actNum, next + 1);
                    return next;
                }
                return index + 1;
            });
        };

        const renderList = () => {
            listContainer.empty();
            const maxActs = getActCount();
            const actLabels = buildActLabels(maxActs, actRanges);
            const beats: BeatRow[] = (plugin.settings.customBeatSystemBeats || [])
                .map(parseBeatRow)
                .map(b => ({ ...b, act: clampAct(b.act, maxActs) }));
            const beatNumbers = buildBeatNumbers(beats, maxActs, actRanges);

            let lastAct: number | null = null;
            beats.forEach((beatLine, index) => {
                const currentAct = clampAct(beatLine.act, maxActs);
                if (lastAct !== null && currentAct !== lastAct) {
                    const divider = listContainer.createDiv({ cls: 'ert-custom-beat-divider' });
                    divider.createDiv({ cls: 'ert-custom-beat-divider-label', text: actLabels[currentAct - 1] });
                }
                lastAct = currentAct;

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
                let act = currentAct.toString();

                // Name input
                const nameInput = row.createEl('input', { type: 'text', cls: 'ert-beat-name-input ert-input' });
                nameInput.value = name;
                nameInput.placeholder = 'Beat name';
                plugin.registerDomEvent(nameInput, 'change', () => {
                    const newName = nameInput.value.trim();
                    if (!newName) return;
                    const updated = [...beats];
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
                    const updated = [...beats];
                    const currentName = nameInput.value.trim() || name;
                    const actNum = clampAct(parseInt(act, 10) || 1, maxActs);
                    updated[index] = { name: currentName, act: actNum };
                    saveBeats(updated);
                    renderList();
                });

                // Delete button
                const delBtn = row.createEl('button', { cls: 'ert-iconBtn' });
                setIcon(delBtn, 'trash');
                delBtn.onclick = () => {
                    const updated = [...beats];
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
                    const updated = [...beats];
                    const [moved] = updated.splice(from, 1);
                    updated.splice(index, 0, moved);
                    const neighbor = updated[index + 1] ?? updated[index - 1];
                    const nextAct = clampAct(neighbor?.act ?? moved.act ?? currentAct, maxActs);
                    moved.act = nextAct;
                    saveBeats(updated);
                    renderList();
                });
            });

            // Add row at bottom (single line, matches advanced YAML add row)
            const defaultAct = beats.length > 0 ? clampAct(beats[beats.length - 1].act, maxActs) : 1;
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
                const act = clampAct(parseInt(addActSelect.value, 10) || defaultAct || 1, maxActs);
                const updated = [...beats, { name, act }];
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

        renderList();
        void (async () => {
            const ranges = await collectActRanges(true);
            if (!ranges) return;
            actRanges = ranges;
            renderList();
        })();
    };
    renderCustomConfig();

    const updateCustomInputsVisibility = (system: string) => {
        customConfigContainer.toggleClass('ert-settings-hidden', system !== 'Custom');
    };
    updateCustomInputsVisibility(plugin.settings.beatSystem || 'Custom');
    // --------------------------------------------------------

    // Create template beat note button
    const templateSetting = new Settings(beatsStack)
        .setName('Create story beat template notes')
        .setDesc('Generate template beat notes based on the selected story structure system including YAML frontmatter and body summary.')
        .addButton(button => button
            .setButtonText('Create templates')
            .setTooltip('Creates story beat note templates in your source path')
            .onClick(async () => {
                await createBeatTemplates();
            }));

    updateTemplateButton(templateSetting, plugin.settings.beatSystem || 'Custom');

    // Scene YAML Templates Section
    const yamlHeading = new Settings(yamlStack)
        .setName('Remap  & advanced YAML templates')
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
        .setDesc('Setup custom YAML keys for the advanced scene template. Enable fields to reveal in scene hover synopsis. Assign a perfect lucide icon. Reorder fields to match your preferred order.');
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
            const yaml = buildYamlWithRequired(requiredOrder, requiredValues, nextEntries, advancedComments);
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
                            if (!plugin.settings.dismissedAlerts) {
                                plugin.settings.dismissedAlerts = [];
                            }
                            if (!plugin.settings.dismissedAlerts.includes(migration.alertId)) {
                                plugin.settings.dismissedAlerts.push(migration.alertId);
                            }
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

    function updateStoryStructureDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement. <i>The Hunger Games</i>, <i>The Martian</i>, <i>The Fault in Our Stars</i>.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery. <i>The Odyssey</i>, <i>The Hobbit</i>, <i>Harry Potter and the Sorcerer\'s Stone</i>.',
            'Story Grid': 'Scene-driven structure built around the 5 Commandments: Inciting Incident, Progressive Complications, Crisis, Climax, Resolution. Useful per-scene and at the global level. <i>The Silence of the Lambs</i>, <i>Pride and Prejudice</i>.',
            'Custom': 'Uses any story beat note you create manually or below via the custom story beat system editor. Perfect for when you don\'t follow a traditional story structure.'
        };

        container.empty();
        for (const [system, desc] of Object.entries(descriptions)) {
            const isSelected = system === selectedSystem;
            const lineDiv = container.createDiv();
            if (isSelected) {
                lineDiv.classList.add('ert-story-structure-selected');
            }
            const boldSpan = lineDiv.createEl('b');
            boldSpan.textContent = system;
            lineDiv.createSpan().innerHTML = `: ${desc}`; // SAFE: innerHTML used for displaying HTML tags in hardcoded descriptions
        }
    }

    function updateTemplateButton(setting: Settings, selectedSystem: string): void {
        const isCustom = selectedSystem === 'Custom';
        
        // Dynamic name for custom system
        let displayName = selectedSystem;
        if (isCustom) {
            displayName = plugin.settings.customBeatSystemName || 'Custom';
            
            // Check if beats are defined
            const beats = (plugin.settings.customBeatSystemBeats || []).map((b: unknown) => {
                if (typeof b === 'string') return b.trim();
                if (typeof b === 'object' && b !== null && (b as { name?: unknown }).name) {
                    return String((b as { name: unknown }).name).trim();
                }
                return '';
            });
            const hasBeats = beats.some(b => b.length > 0);
            
            if (hasBeats) {
                setting.setName(`Create story beat template notes for ${displayName}`);
                setting.setDesc(`Generate ${beats.length} template beat notes for your custom system.`);
                setting.settingEl.style.opacity = '1';
                // Enable button
                const btn = setting.controlEl.querySelector('button');
                if (btn) btn.disabled = false;
            } else {
                setting.setName('Create story beat template notes');
                setting.setDesc('Define your custom beat list above to generate templates.');
                setting.settingEl.style.opacity = '0.6';
                // Disable button
                const btn = setting.controlEl.querySelector('button');
                if (btn) btn.disabled = true;
            }
        } else {
            setting.setName(`Create story beat template notes for ${selectedSystem}`);
            setting.setDesc(`Generate ${selectedSystem} template beat notes including YAML frontmatter and body summary.`);
            setting.settingEl.style.opacity = '1';
            const btn = setting.controlEl.querySelector('button');
            if (btn) btn.disabled = false;
        }
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
        const actStartNumbers = actRanges ? buildActStartNumbers(actRanges) : undefined;
        
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
            const { created, skipped, errors } = await createBeatTemplateNotes(
                app.vault,
                storyStructureName,
                sourcePath,
                storyStructureName === 'Custom' ? storyStructure : undefined,
                { actStartNumbers }
            );
            if (errors.length > 0) {
                new Notice(`Created ${created} notes. ${skipped} skipped. ${errors.length} errors. Check console.`);
                console.error('[Beat Templates] Errors:', errors);
            } else if (created === 0 && skipped > 0) {
                new Notice(`All ${skipped} Beat notes already exist. No new notes created.`);
            } else {
                new Notice(`✓ Successfully created ${created} Beat template notes!`);
            }
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
