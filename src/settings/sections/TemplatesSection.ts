import { App, Notice, Setting as Settings, parseYaml, setIcon, setTooltip, Modal, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { CreateBeatsTemplatesModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem, getCustomSystemFromSettings } from '../../utils/beatsSystems';
import { createBeatTemplateNotes } from '../../utils/beatsTemplates';
import { DEFAULT_SETTINGS } from '../defaults';
import { renderMetadataSection } from './MetadataSection';

type TemplateEntryValue = string | string[];
type TemplateEntry = { key: string; value: TemplateEntryValue; required: boolean };

export function renderStoryBeatsSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    // Acts Section (above beats)
    new Settings(containerEl)
        .setName('Acts')
        .setHeading();

    const getActCount = () => Math.max(3, plugin.settings.actCount ?? 3);

    const getActPreviewLabels = () => {
        const count = getActCount();
        const raw = plugin.settings.actLabelsRaw ?? '';
        const labels = raw.split(',').map(l => l.trim()).filter(Boolean).slice(0, count);
        const showLabels = plugin.settings.showActLabels ?? true;
        return Array.from({ length: count }, (_, idx) => {
            if (!showLabels) return `${idx + 1}`;
            return labels[idx] && labels[idx].length > 0 ? labels[idx] : `Act ${idx + 1}`;
        });
    };

    const updateActPreview = () => {
        const previewLabels = getActPreviewLabels();
        actsPreviewHeading.setText(`Preview (${previewLabels.length} acts)`);
        actsPreviewBody.setText(previewLabels.join(' · '));
    };

    new Settings(containerEl)
        .setName('Act count')
        .setDesc('Applies to Narrative, Subplot, and Gossamer layouts. Scene and Beats YAML. (Minimum 3)')
        .addText(text => {
            text.setPlaceholder('3');
            text.setValue(String(getActCount()));
            text.inputEl.type = 'number';
            text.inputEl.min = '3';
            text.inputEl.addClass('rt-input-xs');
            text.onChange(async (value) => {
                const parsed = parseInt(value, 10);
                const next = Number.isFinite(parsed) ? Math.max(3, parsed) : 3;
                plugin.settings.actCount = next;
                await plugin.saveSettings();
                updateActPreview();
            });
        });

    new Settings(containerEl)
        .setName('Act labels (optional)')
        .setDesc('Comma-separated labels. Extra labels are ignored; empty slots fall back to numbers.')
        .addTextArea(text => {
            text.setValue(plugin.settings.actLabelsRaw ?? 'Act 1, Act 2, Act 3');
            text.inputEl.rows = 2;
            text.inputEl.addClass('rt-input-full');
            text.onChange(async (value) => {
                plugin.settings.actLabelsRaw = value;
                await plugin.saveSettings();
                updateActPreview();
            });
        });

    new Settings(containerEl)
        .setName('Show act labels')
        .setDesc('When off, acts show numbers only.')
        .addToggle(toggle => {
            toggle.setValue(plugin.settings.showActLabels ?? true);
            toggle.onChange(async (value) => {
                plugin.settings.showActLabels = value;
                await plugin.saveSettings();
                updateActPreview();
            });
        });

    // Preview (planet-style)
    const actsPreview = containerEl.createDiv({ cls: 'rt-planetary-preview rt-acts-preview' });
    const actsPreviewHeading = actsPreview.createDiv({ cls: 'rt-planetary-preview-heading', text: 'Preview' });
    const actsPreviewBody = actsPreview.createDiv({ cls: 'rt-planetary-preview-body rt-acts-preview-body' });

    updateActPreview();

    new Settings(containerEl)
        .setName('Story beats system')
        .setHeading();

    const beatSystemSetting = new Settings(containerEl)
        .setName('Story beats system')
        .setDesc('Select the story structure model for your manuscript. This will establish the story beat system and can be used to create beat notes and graph scores using Gossamer mode.')
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
            dropdown.selectEl.style.minWidth = '200px';
        });

    beatSystemSetting.settingEl.classList.add('rt-setting-two-row');
    
    // Explicitly enforce grid layout via inline styles to override any stubborn Flexbox
    beatSystemSetting.settingEl.style.setProperty('display', 'grid', 'important');
    beatSystemSetting.settingEl.style.gridTemplateColumns = '1fr auto';
    beatSystemSetting.settingEl.style.gridTemplateRows = 'auto auto';

    // Align the dropdown to the top
    beatSystemSetting.controlEl.style.setProperty('align-self', 'flex-start', 'important');
    beatSystemSetting.controlEl.style.marginTop = '6px';

    // Story structure explanation
    const storyStructureInfo = beatSystemSetting.settingEl.createDiv({
        cls: 'rt-story-structure-info setting-item-description'
    });
    // Ensure styles are set if CSS class doesn't fully cover it (redundancy)
    storyStructureInfo.style.gridColumn = '1 / 3';
    storyStructureInfo.style.gridRow = '2 / 3';
    storyStructureInfo.style.marginTop = '8px';
    storyStructureInfo.style.marginBottom = '0';
    
    updateStoryStructureDescription(storyStructureInfo, plugin.settings.beatSystem || 'Custom');

    // --- Custom System Configuration (Dynamic Visibility) ---
    const customConfigContainer = containerEl.createDiv({ cls: 'rt-custom-beat-config' });

    const renderCustomConfig = () => {
        customConfigContainer.empty();
        
        new Settings(customConfigContainer)
            .setName('Custom story beat system')
            .setDesc('The name of your custom beat system (e.g. "7 Point Structure"). Assigned to the "Beat Model" field in YAML. Drag to reorder beats.')
            .addText(text => text
                .setPlaceholder('Custom')
                .setValue(plugin.settings.customBeatSystemName || 'Custom')
                .then(t => {
                    t.inputEl.addClass('rt-input-md');
                    return t;
                })
                .onChange(async (value) => {
                    plugin.settings.customBeatSystemName = value;
                    await plugin.saveSettings();
                    updateTemplateButton(templateSetting, 'Custom');
                }));

        // Beat List Editor (draggable rows with Name + Act)
        const beatWrapper = customConfigContainer.createDiv({ cls: 'rt-custom-beat-wrapper' });

        const listContainer = beatWrapper.createDiv({ cls: 'rt-custom-beat-list' });

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

        const buildActLabels = (count: number): string[] => {
            const raw = plugin.settings.actLabelsRaw ?? '';
            const showLabels = plugin.settings.showActLabels ?? true;
            const labels = raw.split(',').map(l => l.trim()).filter(Boolean);
            return Array.from({ length: count }, (_, idx) => {
                if (!showLabels) return `Act ${idx + 1}`;
                return labels[idx] && labels[idx].length > 0 ? labels[idx] : `Act ${idx + 1}`;
            });
        };

        const clampAct = (val: number, maxActs: number) => {
            const n = Number.isFinite(val) ? val : 1;
            return Math.min(Math.max(1, n), maxActs);
        };

        const renderList = () => {
            listContainer.empty();
            const maxActs = getActCount();
            const actLabels = buildActLabels(maxActs);
            const beats: BeatRow[] = (plugin.settings.customBeatSystemBeats || [])
                .map(parseBeatRow)
                .map(b => ({ ...b, act: clampAct(b.act, maxActs) }));

            beats.forEach((beatLine, index) => {
                const row = listContainer.createDiv({ cls: 'rt-custom-beat-row' });
                row.draggable = true;

                // Drag handle
                const handle = row.createDiv({ cls: 'rt-drag-handle' });
                setIcon(handle, 'grip-vertical');
                setTooltip(handle, 'Drag to reorder beat');

                // Spacer (pushes rest to the right, matches YAML row structure)
                row.createDiv({ cls: 'rt-grid-spacer' });

                // Index
                const idxEl = row.createDiv({ text: `${index + 1}.`, cls: 'rt-beat-index' });
                idxEl.style.minWidth = '24px'; // SAFE: inline width for index

                // Parse "Name [Act]"
                let name = beatLine.name;
                let act = clampAct(beatLine.act, maxActs).toString();

                // Name input
                const nameInput = row.createEl('input', { type: 'text', cls: 'rt-beat-name-input rt-template-input' });
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
                const actSelect = row.createEl('select', { cls: 'rt-beat-act-select rt-template-input' });
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
                const delBtn = row.createEl('button', { cls: 'rt-template-icon-btn' });
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
                    row.classList.add('rt-dragging');
                });
                plugin.registerDomEvent(row, 'dragend', () => {
                    row.classList.remove('rt-dragging');
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
                    saveBeats(updated);
                    renderList();
                });
            });

            // Add row at bottom (single line, matches advanced YAML add row)
            const defaultAct = beats.length > 0 ? clampAct(beats[beats.length - 1].act, maxActs) : 1;
            const addRow = listContainer.createDiv({ cls: 'rt-custom-beat-row rt-custom-beat-add-row' });

            addRow.createDiv({ cls: 'rt-drag-handle rt-drag-placeholder' });
            addRow.createDiv({ cls: 'rt-grid-spacer' });
            addRow.createDiv({ cls: 'rt-beat-index rt-beat-add-index', text: '' });

            const addNameInput = addRow.createEl('input', { type: 'text', cls: 'rt-beat-name-input rt-template-input', placeholder: 'New beat' });
            const addActSelect = addRow.createEl('select', { cls: 'rt-beat-act-select rt-template-input' });
            Array.from({ length: maxActs }, (_, i) => i + 1).forEach(n => {
                const opt = addActSelect.createEl('option', { value: n.toString(), text: actLabels[n - 1] });
                if (defaultAct === n) opt.selected = true;
            });

            const addBtn = addRow.createEl('button', { cls: 'rt-beat-add-btn', attr: { 'aria-label': 'Add beat' } });
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
    };
    renderCustomConfig();

    const updateCustomInputsVisibility = (system: string) => {
        if (system === 'Custom') {
            customConfigContainer.style.display = 'block'; // SAFE: inline style used for toggling visibility
        } else {
            customConfigContainer.style.display = 'none'; // SAFE: inline style used for toggling visibility
        }
    };
    updateCustomInputsVisibility(plugin.settings.beatSystem || 'Custom');
    // --------------------------------------------------------

    // Create template beat note button
    const templateSetting = new Settings(containerEl)
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
    new Settings(containerEl)
        .setName('Scene YAML templates & remapping')
        .setHeading();

    // Frontmatter remapper (moved here) - separate from template editor visibility
    const remapContainer = containerEl.createDiv();
    renderMetadataSection({ app, plugin, containerEl: remapContainer });

    let onAdvancedToggle: (() => void) | undefined;

    new Settings(containerEl)
        .setName('Advanced YAML editor')
        .setDesc('Enable editing of custom YAML keys for the advanced scene template.')
        .addExtraButton(button => {
            const refreshButton = () => {
                const expanded = plugin.settings.enableAdvancedYamlEditor ?? false;
                button.setIcon('chevrons-up-down');
                button.setTooltip(expanded ? 'Hide advanced YAML editor' : 'Show advanced YAML editor');
            };
            refreshButton();
            button.onClick(async () => {
                const next = !(plugin.settings.enableAdvancedYamlEditor ?? false);
                plugin.settings.enableAdvancedYamlEditor = next;
                refreshButton();
                await plugin.saveSettings();
                onAdvancedToggle?.();
            });
        });

    const templateSection = containerEl.createDiv({ cls: 'rt-scene-template-editor' });

    const advancedContainer = templateSection.createDiv({ cls: 'rt-advanced-template-card' });

    const renderAdvancedTemplateEditor = () => {
        advancedContainer.empty();

        const isEnabled = plugin.settings.enableAdvancedYamlEditor ?? false;
        advancedContainer.toggleClass('rt-settings-hidden', !isEnabled);
        if (!isEnabled) return;

        // Prepare template data
        const defaultTemplate = DEFAULT_SETTINGS.sceneYamlTemplates!.advanced;
        const currentTemplate = plugin.settings.sceneYamlTemplates?.advanced ?? '';
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
                    hintEl.removeClass('rt-template-hint-hidden');
                    hintEl.setText(hint);
                    inputEl.setAttribute('title', hint);
                    rowEl?.addClass('rt-template-hint-row');
                } else {
                    hintEl.addClass('rt-template-hint-hidden');
                    hintEl.setText('');
                    inputEl.removeAttribute('title');
                    rowEl?.removeClass('rt-template-hint-row');
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
            advancedContainer.toggleClass('rt-settings-hidden', !isEnabled);
            if (!isEnabled) return;

            const listEl = advancedContainer.createDiv({ cls: 'rt-template-entries rt-template-indent' });

            const renderEntryRow = (entry: TemplateEntry, idx: number, list: TemplateEntry[]) => {
                // Match beats row structure: all inputs are direct grid children
                const row = listEl.createDiv({ cls: 'rt-yaml-row' });

                // 1. Drag handle (direct child)
                const dragHandle = row.createDiv({ cls: 'rt-drag-handle' });
                dragHandle.draggable = true;
                setIcon(dragHandle, 'grip-vertical');
                setTooltip(dragHandle, 'Drag to reorder key');

                // 2. Spacer (pushes rest to the right)
                row.createDiv({ cls: 'rt-grid-spacer' });

                // 3. Key input (direct child - no wrapper!)
                const keyInput = row.createEl('input', { type: 'text', cls: 'rt-template-input rt-input-md' });
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
                    const nextList = [...list];
                    nextList[idx] = { ...entry, key: newKey };
                    saveEntries(nextList);
                    rerender(nextList);
                };

                // 4. Value input (direct child - no wrapper!)
                const value = entry.value;
                const valInput = row.createEl('input', { type: 'text', cls: 'rt-template-input rt-input-md' });
                if (Array.isArray(value)) {
                    valInput.value = value.join(', ');
                    valInput.placeholder = 'Comma-separated values';
                    valInput.onchange = () => {
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: valInput.value.split(',').map(s => s.trim()).filter(Boolean) };
                        saveEntries(nextList);
                    };
                } else {
                    valInput.value = value ?? '';
                    valInput.placeholder = 'Value';
                    valInput.onchange = () => {
                        const nextList = [...list];
                        nextList[idx] = { ...entry, value: valInput.value };
                        saveEntries(nextList);
                    };
                }

                // 5. Delete button (direct child - no wrapper!)
                const delBtn = row.createEl('button', { cls: 'rt-template-icon-btn' });
                setIcon(delBtn, 'trash');
                delBtn.onclick = () => {
                    const nextList = list.filter((_, i) => i !== idx);
                    saveEntries(nextList);
                    rerender(nextList);
                };

                plugin.registerDomEvent(dragHandle, 'dragstart', (e) => {
                    dragIndex = idx;
                    row.classList.add('rt-template-dragging');
                    e.dataTransfer?.setData('text/plain', idx.toString());
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                });

                plugin.registerDomEvent(dragHandle, 'dragend', () => {
                    row.classList.remove('rt-template-dragging');
                    row.classList.remove('rt-template-dragover');
                    dragIndex = null;
                });

                plugin.registerDomEvent(row, 'dragover', (e) => {
                    e.preventDefault();
                    row.classList.add('rt-template-dragover');
                });

                plugin.registerDomEvent(row, 'dragleave', () => {
                    row.classList.remove('rt-template-dragover');
                });

                plugin.registerDomEvent(row, 'drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('rt-template-dragover');
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
                    rerender(nextList);
                });
            };

            data.forEach((entry, idx, arr) => renderEntryRow(entry, idx, arr));

            // Add new key/value - inside listEl so it gets the indent border
            const addRow = listEl.createDiv({ cls: 'rt-yaml-row rt-yaml-add-row' });

            // 1. Handle placeholder (direct child)
            addRow.createDiv({ cls: 'rt-drag-handle rt-drag-placeholder' });

            // 2. Spacer (direct child)
            addRow.createDiv({ cls: 'rt-grid-spacer' });

            // 3. Key input (direct child - no wrapper!)
            const keyInput = addRow.createEl('input', { type: 'text', cls: 'rt-template-input rt-input-md', attr: { placeholder: 'New key' } });

            // 4. Value input (direct child - no wrapper!)
            const valInput = addRow.createEl('input', { type: 'text', cls: 'rt-template-input rt-input-md', attr: { placeholder: 'Value' } }) as HTMLInputElement;

            // 5. Buttons wrapper (holds both + and reset)
            const btnWrap = addRow.createDiv({ cls: 'rt-template-add-buttons' });

            const addBtn = btnWrap.createEl('button', { cls: 'rt-template-icon-btn rt-mod-cta' });
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
                const nextList = [...data, { key: k, value: valInput.value || '', required: false }];
                saveEntries(nextList);
                rerender(nextList);
            };

            const revertBtn = btnWrap.createEl('button', { cls: 'rt-template-icon-btn rt-template-reset-btn' });
            setIcon(revertBtn, 'rotate-ccw');
            setTooltip(revertBtn, 'Revert to original template');
            revertBtn.onclick = async () => {
                const confirmed = await new Promise<boolean>((resolve) => {
                    const modal = new Modal(app);
                    const { modalEl, contentEl } = modal;
                    modal.titleEl.setText('');
                    contentEl.empty();

                    modalEl.classList.add('rt-modal-shell');
                    contentEl.addClass('rt-modal-container');

                    const header = contentEl.createDiv({ cls: 'rt-modal-header' });
                    header.createSpan({ text: 'Warning', cls: 'rt-modal-badge' });
                    header.createDiv({ text: 'Reset advanced YAML template', cls: 'rt-modal-title' });
                    header.createDiv({ text: 'Resetting will delete all custom changes and restore the default template.', cls: 'rt-modal-subtitle' });

                    const body = contentEl.createDiv({ cls: 'rt-glass-card' });
                    body.createDiv({ text: 'Are you sure you want to reset? This cannot be undone.', cls: 'rt-purge-warning' });

                    const actionsRow = contentEl.createDiv({ cls: ['rt-modal-actions', 'rt-inline-actions'] });

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
                await plugin.saveSettings();
                const resetEntries = entriesFromTemplate(defaultTemplate, requiredOrder).filter(e => !e.required);
                rerender(resetEntries);
            };

        };

        rerender(entries);
    };

    renderAdvancedTemplateEditor();

    const refreshVisibility = () => {
        renderAdvancedTemplateEditor();
    };
    onAdvancedToggle = refreshVisibility;
    refreshVisibility();

    function updateStoryStructureDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement. <i>The Hunger Games</i>, <i>The Martian</i>, <i>The Fault in Our Stars</i>.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery. <i>The Odyssey</i>, <i>The Hobbit</i>, <i>Harry Potter and the Sorcerer\'s Stone</i>.',
            'Story Grid': 'Scene-driven structure built around the 5 Commandments: Inciting Incident, Progressive Complications, Crisis, Climax, Resolution. Useful per-scene and at the global level. <i>The Silence of the Lambs</i>, <i>Pride and Prejudice</i>.',
            'Custom': 'Uses any story beat notes you create. Perfect for when you don\'t follow a traditional story structure.'
        };

        container.empty();
        for (const [system, desc] of Object.entries(descriptions)) {
            const isSelected = system === selectedSystem;
            const lineDiv = container.createDiv();
            if (isSelected) {
                lineDiv.classList.add('rt-story-structure-selected');
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
                storyStructureName === 'Custom' ? storyStructure : undefined
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
