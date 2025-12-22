import { App, Notice, Setting as Settings, parseYaml, stringifyYaml } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { CreateBeatsTemplatesModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem } from '../../utils/beatsSystems';
import { createBeatTemplateNotes } from '../../utils/beatsTemplates';
import { AiContextModal } from '../AiContextModal';
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

    new Settings(containerEl)
        .setName('Gossamer and story beats system')
        .setHeading();

    const beatSystemSetting = new Settings(containerEl)
        .setName('Story beats system')
        .setDesc('Select the story structure model for your manuscript. This will establish the story beat system and can be used to create beat notes and graph scores using Gossamer view.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('Save The Cat', 'Save The Cat (15 beats)')
                .addOption('Hero\'s Journey', 'Hero\'s Journey (12 beats)')
                .addOption('Story Grid', 'Story Grid (15 beats)')                    
                .addOption('Custom', 'Custom (User defined beat structure)')
                .setValue(plugin.settings.beatSystem || 'Custom')
                .onChange(async (value) => {
                    plugin.settings.beatSystem = value;
                    await plugin.saveSettings();
                    updateStoryStructureDescription(storyStructureInfo, value);
                    updateTemplateButton(templateSetting, value);
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

    const getActiveTemplateName = (): string => {
        const templates = plugin.settings.aiContextTemplates || [];
        const activeId = plugin.settings.activeAiContextTemplateId;
        const active = templates.find(t => t.id === activeId);
        return active?.name || 'Generic Editor';
    };

    const contextTemplateSetting = new Settings(containerEl)
        .setName('AI prompt role & context template')
        .setDesc(`Active: ${getActiveTemplateName()}`)
        .addExtraButton(button => button
            .setIcon('gear')
            .setTooltip('Manage context templates for AI prompt generation and Gossamer score generation')
            .onClick(() => {
                const modal = new AiContextModal(app, plugin, () => {
                    contextTemplateSetting.setDesc(`Active: ${getActiveTemplateName()}`);
                });
                modal.open();
            }));

    // Scene Templates Section
    new Settings(containerEl)
        .setName('Scene templates & metadata')
        .setHeading();

    // Default template selector (keeps Base/Advanced choice; Base is not editable here)
    new Settings(containerEl)
        .setName('Default scene template')
        .setDesc('Select which template to use when creating new scenes via commands or the Book Designer.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('base', 'Base (Minimal)')
                .addOption('advanced', 'Advanced (Comprehensive)')
                .setValue(plugin.settings.defaultSceneTemplate || 'base')
                .onChange(async (value) => {
                    plugin.settings.defaultSceneTemplate = value as 'base' | 'advanced';
                    await plugin.saveSettings();
                });
        });

    // Frontmatter remapper (moved here) - drives visibility of template editor
    const remapContainer = containerEl.createDiv();
    renderMetadataSection({ app, plugin, containerEl: remapContainer });

    const templateSection = containerEl.createDiv({ cls: 'rt-scene-template-editor' });

    // Helper text
    const helperDiv = templateSection.createDiv({ cls: 'rt-template-helper-text setting-item-description' });
    // SAFE: inline style used for layout
    helperDiv.style.marginTop = '10px';
    // SAFE: inline style used for layout
    helperDiv.style.marginBottom = '12px';
    // SAFE: innerHTML used for rich text description
    helperDiv.insertAdjacentHTML('beforeend', `
        <strong>Available Variables:</strong><br>
        <code>{{Act}}</code> - Act number<br>
        <code>{{When}}</code> - Date/Time string<br>
        <code>{{SceneNumber}}</code> - Scene number<br>
        <code>{{Subplot}}</code> - Comma-separated list of subplots<br>
        <code>{{SubplotList}}</code> - YAML-formatted list of subplots (array)<br>
        <code>{{Character}}</code> - Character name(s)<br>
        <code>{{Place}}</code> - Location name<br>
        <em>Reordering keys is not supported. Use the remapper for key name changes.</em>
    `);

    const advancedContainer = templateSection.createDiv({ cls: 'rt-advanced-template-card' });

    const renderAdvancedTemplateEditor = () => {
        advancedContainer.empty();

        const isEnabled = plugin.settings.enableCustomMetadataMapping ?? false;
        advancedContainer.toggleClass('rt-template-hidden', !isEnabled);
        if (!isEnabled) return;

        const header = advancedContainer.createDiv({ cls: 'setting-item' });
        header.createEl('div', { text: 'Advanced template (per-key)', cls: 'setting-item-name' });
        header.createEl('div', { text: 'Edit values; required keys cannot be removed.', cls: 'setting-item-description' });

        const entriesContainer = advancedContainer.createDiv({ cls: 'rt-template-entries' });

        // Prepare template data
        const defaultTemplate = DEFAULT_SETTINGS.sceneTemplates!.advanced;
        const currentTemplate = plugin.settings.sceneTemplates?.advanced || defaultTemplate;

        const requiredOrder = extractKeysInOrder(defaultTemplate);
        const defaultObj = safeParseYaml(defaultTemplate);
        const currentObj = safeParseYaml(currentTemplate);

        // Merge keys preserving current order first, then required defaults
        const order = mergeOrders(extractKeysInOrder(currentTemplate), requiredOrder);

        const entries: TemplateEntry[] = order.map((key) => {
            const value = currentObj[key] ?? defaultObj[key] ?? '';
            const required = requiredOrder.includes(key);
            return { key, value, required };
        });

        // Ensure required keys exist even if missing
        requiredOrder.forEach((key) => {
            if (!entries.find(e => e.key === key)) {
                entries.push({ key, value: defaultObj[key] ?? '', required: true });
            }
        });

        const saveEntries = (nextEntries: TemplateEntry[]) => {
            const yaml = buildYamlFromEntries(nextEntries);
            if (!plugin.settings.sceneTemplates) plugin.settings.sceneTemplates = { base: DEFAULT_SETTINGS.sceneTemplates!.base, advanced: '' };
            plugin.settings.sceneTemplates.advanced = yaml;
            void plugin.saveSettings();
        };

        const rerender = (next?: TemplateEntry[]) => {
            const data = next ?? entries;
            advancedContainer.empty();
            advancedContainer.toggleClass('rt-template-hidden', !isEnabled);
            if (!isEnabled) return;

            const headerRow = advancedContainer.createDiv({ cls: 'setting-item' });
            headerRow.createEl('div', { text: 'Advanced template (per-key)', cls: 'setting-item-name' });
            headerRow.createEl('div', { text: 'Edit values; required keys cannot be removed.', cls: 'setting-item-description' });
            const headerButtons = headerRow.createDiv({ cls: 'setting-item-control' });
            const revertBtn = headerButtons.createEl('button', { text: 'Revert to default', cls: 'rt-mod-cta' });
            revertBtn.onclick = async () => {
                if (!plugin.settings.sceneTemplates) plugin.settings.sceneTemplates = { base: DEFAULT_SETTINGS.sceneTemplates!.base, advanced: '' };
                plugin.settings.sceneTemplates.advanced = defaultTemplate;
                await plugin.saveSettings();
                rerender(entriesFromTemplate(defaultTemplate, requiredOrder));
            };

            const listEl = advancedContainer.createDiv({ cls: 'rt-template-entries' });

            const renderEntryRow = (entry: TemplateEntry, idx: number, list: TemplateEntry[]) => {
                const row = listEl.createDiv({ cls: 'rt-template-entry-row' });
                const keyCol = row.createDiv({ cls: 'rt-template-key' });
                const valCol = row.createDiv({ cls: 'rt-template-value' });
                const actionCol = row.createDiv({ cls: 'rt-template-actions' });

                const keyLabel = keyCol.createEl('div', { text: entry.key });
                keyLabel.classList.add('rt-template-key-label');

                const value = entry.value;
                if (Array.isArray(value)) {
                    const ta = valCol.createEl('textarea', { cls: 'rt-template-textarea' });
                    ta.rows = Math.max(3, value.length);
                    ta.value = value.join('\n');
                    ta.onchange = () => {
                        list[idx].value = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
                        saveEntries(list);
                    };
                } else {
                    const input = valCol.createEl('input', { cls: 'rt-template-input' });
                    input.type = 'text';
                    input.value = value ?? '';
                    input.onchange = () => {
                        list[idx].value = input.value;
                        saveEntries(list);
                    };
                }

                if (!entry.required) {
                    const delBtn = actionCol.createEl('button', { text: 'Delete', cls: 'rt-template-delete' });
                    delBtn.onclick = () => {
                        const nextList = list.filter((_, i) => i !== idx);
                        saveEntries(nextList);
                        rerender(nextList);
                    };
                } else {
                    actionCol.createEl('div', { text: 'Required', cls: 'rt-template-required' });
                }
            };

            data.forEach((entry, idx, arr) => renderEntryRow(entry, idx, arr));

            // Add new key/value
            const addRow = advancedContainer.createDiv({ cls: 'rt-template-add-row' });
            const keyInput = addRow.createEl('input', { cls: 'rt-template-input', attr: { placeholder: 'New key' } });
            const valInput = addRow.createEl('input', { cls: 'rt-template-input', attr: { placeholder: 'Value' } });
            const addBtn = addRow.createEl('button', { text: 'Add key', cls: 'rt-mod-cta' });
            addBtn.onclick = () => {
                const k = (keyInput.value || '').trim();
                if (!k) return;
                if (data.some(e => e.key === k)) {
                    new Notice(`Key "${k}" already exists.`);
                    return;
                }
                const nextList = [...data, { key: k, value: valInput.value || '', required: false }];
                saveEntries(nextList);
                rerender(nextList);
            };
        };

        rerender(entries);
    };

    renderAdvancedTemplateEditor();

    // React to remapper toggle visibility
    const refreshVisibility = () => {
        const enabled = plugin.settings.enableCustomMetadataMapping ?? false;
        templateSection.toggleClass('rt-template-hidden', !enabled);
        renderAdvancedTemplateEditor();
    };
    refreshVisibility();

    function updateStoryStructureDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery.',
            'Story Grid': 'Literary fiction and complex narratives. Balances micro and macro structure with progressive complications.',
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
            lineDiv.appendText(`: ${desc}`);
        }
    }

    function updateTemplateButton(setting: Settings, selectedSystem: string): void {
        const isCustom = selectedSystem === 'Custom';
        if (isCustom) {
            setting.setName('Create story beat template notes');
            setting.setDesc('Custom story structures must be created manually by the author.');
        } else {
            setting.setName(`Create story beat template notes for ${selectedSystem}`);
            setting.setDesc(`Generate ${selectedSystem} template beat notes including YAML frontmatter and body summary.`);
        }
        const settingEl = setting.settingEl;
        if (isCustom) {
            settingEl.style.opacity = '0.6';
        } else {
            settingEl.style.opacity = '1';
        }
    }

    async function createBeatTemplates(): Promise<void> {
        const storyStructureName = plugin.settings.beatSystem || 'Custom';
        if (storyStructureName === 'Custom') {
            new Notice('Custom story structure selected. Create your own Beat notes with Class: Beat. No templates will be generated.');
            return;
        }
        const storyStructure = getPlotSystem(storyStructureName);
        if (!storyStructure) {
            new Notice(`Unknown story structure: ${storyStructureName}`);
            return;
        }
        const modal = new CreateBeatsTemplatesModal(
            app,
            plugin,
            storyStructureName,
            storyStructure.beatCount
        );
        modal.open();
        const result = await modal.waitForConfirmation();
        if (!result.confirmed) return;
        try {
            const sourcePath = plugin.settings.sourcePath || '';
            const { created, skipped, errors } = await createBeatTemplateNotes(
                app.vault,
                storyStructureName,
                sourcePath
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

function buildYamlFromEntries(entries: TemplateEntry[]): string {
    const lines: string[] = [];
    entries.forEach(entry => {
        if (Array.isArray(entry.value)) {
            lines.push(`${entry.key}:`);
            entry.value.forEach((v: string) => {
                lines.push(`  - ${v}`);
            });
        } else {
            lines.push(`${entry.key}: ${entry.value ?? ''}`);
        }
    });
    return lines.join('\n');
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
