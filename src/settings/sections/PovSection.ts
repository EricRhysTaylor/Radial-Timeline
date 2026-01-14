import { Setting as ObsidianSetting } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { GlobalPovMode } from '../../types/settings';
import { addWikiLink } from '../wikiLink';

const POV_MODE_OPTIONS: Record<GlobalPovMode, string> = {
    off: 'first listed character (pov)',
    first: 'First-person (¹)',
    second: 'Second-person (You²)',
    third: 'Third-person limited (³)',
    omni: 'Omni narrator (Omni³)',
    objective: 'Objective (Narrator°)'
};

export function renderPovSection(params: {
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { plugin, containerEl } = params;

    const povHeading = new ObsidianSetting(containerEl)
        .setName('Point of view')
        .setHeading();
    addWikiLink(povHeading, 'Settings#pov');

    const storedMode = plugin.settings.globalPovMode;
    const currentMode: GlobalPovMode = storedMode && storedMode in POV_MODE_OPTIONS ? storedMode : 'off';
    if (storedMode !== currentMode) {
        plugin.settings.globalPovMode = currentMode;
        void plugin.saveSettings();
    }
    new ObsidianSetting(containerEl)
        .setName('Global POV')
        .setDesc('Choose a default mode to apply. Scene level POV will override this global setting.')
        .addDropdown(dropdown => {
            (Object.keys(POV_MODE_OPTIONS) as GlobalPovMode[]).forEach((key) => {
                dropdown.addOption(key, POV_MODE_OPTIONS[key]);
            });
            dropdown.setValue(currentMode);
            dropdown.onChange(async (value) => {
                const next = (value as GlobalPovMode) || 'off';
                plugin.settings.globalPovMode = next;
                await plugin.saveSettings();
                const debounce = plugin.settings.metadataRefreshDebounceMs ?? 10000;
                plugin.refreshTimelineIfNeeded(null, debounce);
            });
        });

    new ObsidianSetting(containerEl)
        .setName('Scene level YAML overrides')
        .setDesc('Values you can use for YAML field `POV:` first, second, third, omni, objective, or a number such as two, four, count, or all to designate more than one character is carrying the scene POV. If two, for example, then the first two characters in `Character:` YAML list will get a POV mark.');

    // Preview section
    const previewContainer = containerEl.createDiv({ cls: 'rt-planetary-preview rt-pov-preview' });
    const previewHeading = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading', text: 'POV Examples' });
    const previewBody = previewContainer.createDiv({ cls: 'rt-planetary-preview-body rt-pov-preview-body' });

    const renderNamesWithSup = (parent: HTMLElement, entries: Array<{ name: string; sup: string }>) => {
        parent.empty();
        entries.forEach((entry, idx) => {
            parent.appendText(entry.name);
            const supEl = parent.createEl('sup');
            supEl.setText(entry.sup);
            if (idx < entries.length - 1) {
                parent.appendText(', ');
            }
        });
    };

    const renderPreview = () => {
        previewBody.empty();

        // Example 1: Single character with first-person
        const example1 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example1.createDiv({ cls: 'rt-pov-example-label', text: 'POV: first' });
        const content1 = example1.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content1, [{ name: 'Alice', sup: '¹' }]);

        // Example 2: Single character with third-person
        const example2 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example2.createDiv({ cls: 'rt-pov-example-label', text: 'POV: third' });
        const content2 = example2.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content2, [{ name: 'Bob', sup: '³' }]);

        // Example 3: Second-person
        const example3 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example3.createDiv({ cls: 'rt-pov-example-label', text: 'POV: second' });
        const content3 = example3.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content3, [
            { name: 'You', sup: '²' },
            { name: 'Alice', sup: '' },
            { name: 'Bob', sup: '' },
        ]);

        // Example 4: Omni narrator
        const example4 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example4.createDiv({ cls: 'rt-pov-example-label', text: 'POV: omni' });
        const content4 = example4.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content4, [
            { name: 'Omni', sup: '³' },
            { name: 'Alice', sup: '' },
            { name: 'Bob', sup: '' },
        ]);

        // Example 5: Objective narrator
        const example5 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example5.createDiv({ cls: 'rt-pov-example-label', text: 'POV: objective' });
        const content5 = example5.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content5, [
            { name: 'Narrator', sup: '°' },
            { name: 'Alice', sup: '' },
            { name: 'Bob', sup: '' },
        ]);

        // Example 6: Two characters with third-person
        const example6 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example6.createDiv({ cls: 'rt-pov-example-label', text: 'POV: two, Character: [Alice, Bob]' });
        const content6 = example6.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content6, [
            { name: 'Alice', sup: '³' },
            { name: 'Bob', sup: '³' },
        ]);

        // Example 7: Three characters with third-person
        const example7 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example7.createDiv({ cls: 'rt-pov-example-label', text: 'POV: three, Character: [Alice, Bob, Charlie]' });
        const content7 = example7.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content7, [
            { name: 'Alice', sup: '³' },
            { name: 'Bob', sup: '³' },
            { name: 'Charlie', sup: '³' },
        ]);

        // Example 8: Four characters with third-person
        const example8 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example8.createDiv({ cls: 'rt-pov-example-label', text: 'POV: four, Character: [Alice, Bob, Charlie, Diana]' });
        const content8 = example8.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content8, [
            { name: 'Alice', sup: '³' },
            { name: 'Bob', sup: '³' },
            { name: 'Charlie', sup: '³' },
            { name: 'Diana', sup: '³' },
        ]);

        // Example 9: Two characters with first-person (global POV: first, scene POV: two)
        const example9 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example9.createDiv({ cls: 'rt-pov-example-label', text: 'Global POV: first, Scene POV: two, Character: [Alice, Bob]' });
        const content9 = example9.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content9, [
            { name: 'Alice', sup: '¹' },
            { name: 'Bob', sup: '¹' },
        ]);

        // Example 10: All characters with first-person
        const example10 = previewBody.createDiv({ cls: 'rt-pov-example' });
        example10.createDiv({ cls: 'rt-pov-example-label', text: 'POV: all, Character: [Alice, Bob, Charlie]' });
        const content10 = example10.createDiv({ cls: 'rt-pov-example-content' });
        renderNamesWithSup(content10, [
            { name: 'Alice', sup: '¹' },
            { name: 'Bob', sup: '¹' },
            { name: 'Charlie', sup: '¹' },
        ]);
    };

    renderPreview();
}
