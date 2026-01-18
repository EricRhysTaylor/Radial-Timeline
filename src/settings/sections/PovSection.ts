import { Setting as ObsidianSetting } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { GlobalPovMode } from '../../types/settings';
import { resolveScenePov } from '../../utils/pov';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink } from '../wikiLink';

const POV_LABELS: Record<string, string> = {
    '0': '°',
    '1': '¹',
    '2': '²',
    '3': '³'
};

export function renderPovSection(params: {
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { plugin, containerEl } = params;

    const povHeading = new ObsidianSetting(containerEl)
        .setName(t('settings.pov.heading'))
        .setHeading();
    addHeadingIcon(povHeading, 'eye');
    addWikiLink(povHeading, 'Settings#pov');

    const povModeOptions: Record<GlobalPovMode, string> = {
        off: t('settings.pov.modes.off'),
        first: t('settings.pov.modes.first'),
        second: t('settings.pov.modes.second'),
        third: t('settings.pov.modes.third'),
        omni: t('settings.pov.modes.omni'),
        objective: t('settings.pov.modes.objective')
    };

    const storedMode = plugin.settings.globalPovMode;
    const currentMode: GlobalPovMode = storedMode && storedMode in povModeOptions ? storedMode : 'off';
    if (storedMode !== currentMode) {
        plugin.settings.globalPovMode = currentMode;
        void plugin.saveSettings();
    }
    new ObsidianSetting(containerEl)
        .setName(t('settings.pov.global.name'))
        .setDesc(t('settings.pov.global.desc'))
        .addDropdown(dropdown => {
            (Object.keys(povModeOptions) as GlobalPovMode[]).forEach((key) => {
                dropdown.addOption(key, povModeOptions[key]);
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
        .setName(t('settings.pov.yamlOverrides.name'))
        .setDesc(t('settings.pov.yamlOverrides.desc'));

    // Preview section
    const previewContainer = containerEl.createDiv({ cls: 'rt-planetary-preview rt-pov-preview' });
    const previewHeading = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading', text: t('settings.pov.preview.heading') });
    const previewBody = previewContainer.createDiv({ cls: 'rt-planetary-preview-body rt-pov-preview-body' });

    const buildPreviewEntries = (
        characters: string[],
        povValue: string,
        globalMode?: GlobalPovMode
    ) => {
        const povInfo = resolveScenePov(
            {
                Character: characters,
                pov: povValue
            } as any,
            { globalMode }
        );

        const entries: Array<{ name: string; sup: string }> = [];
        povInfo.syntheticEntries.forEach(entry => {
            entries.push({ name: entry.text, sup: POV_LABELS[entry.label] || '' });
        });

        const markerMap = new Map<number, string>();
        povInfo.characterMarkers.forEach(marker => {
            markerMap.set(marker.index, POV_LABELS[marker.label] || '');
        });

        characters.forEach((name, index) => {
            entries.push({ name, sup: markerMap.get(index) ?? '' });
        });

        return entries;
    };

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

        const renderExample = (
            label: string,
            characters: string[],
            povValue: string,
            globalMode?: GlobalPovMode
        ) => {
            const example = previewBody.createDiv({ cls: 'rt-pov-example' });
            example.createDiv({ cls: 'rt-pov-example-label', text: label });
            const content = example.createDiv({ cls: 'rt-pov-example-content' });
            renderNamesWithSup(content, buildPreviewEntries(characters, povValue, globalMode));
        };

        // Example 1: Single character with first-person
        renderExample(t('settings.pov.preview.examples.sceneFirst'), ['Alice'], 'first');

        // Example 2: Single character with third-person
        renderExample(t('settings.pov.preview.examples.sceneThird'), ['Bob'], 'third');

        // Example 3: Second-person
        renderExample(t('settings.pov.preview.examples.sceneSecond'), ['Alice', 'Bob'], 'second');

        // Example 4: Omni narrator
        renderExample(t('settings.pov.preview.examples.sceneOmni'), ['Alice', 'Bob'], 'omni');

        // Example 5: Objective narrator
        renderExample(t('settings.pov.preview.examples.sceneObjective'), ['Alice', 'Bob'], 'objective');

        // Example 6: Two characters with third-person
        renderExample(
            t('settings.pov.preview.examples.countTwoThird'),
            ['Alice', 'Bob'],
            'two',
            'third'
        );

        // Example 7: Three characters with third-person
        renderExample(
            t('settings.pov.preview.examples.countThreeThird'),
            ['Alice', 'Bob', 'Charlie'],
            'three',
            'third'
        );

        // Example 8: Four characters with third-person
        renderExample(
            t('settings.pov.preview.examples.countFourThird'),
            ['Alice', 'Bob', 'Charlie', 'Diana'],
            'four',
            'third'
        );

        // Example 9: Numeric count override with first-person
        renderExample(
            t('settings.pov.preview.examples.countTwoFirstNumeric'),
            ['Alice', 'Bob'],
            '2',
            'first'
        );

        // Example 10: All characters with first-person
        renderExample(
            t('settings.pov.preview.examples.countAllFirst'),
            ['Alice', 'Bob', 'Charlie'],
            'all',
            'first'
        );
    };

    renderPreview();
}
