/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Scene maintenance utilities (template creation, YAML test, purge helpers)
 */

import { App, Notice, stringifyYaml, Modal, ButtonComponent, TFile, getFrontMatterInfo, parseYaml, type Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { sanitizeSourcePath, buildInitialSceneFilename } from '../utils/sceneCreation';
import { openOrRevealFileByPath } from '../utils/fileUtils';
import { getAllSceneData, getSubplotNamesFromFM } from './data';
import type { SceneData, ParsedSceneAnalysis } from './types';
import { parseGptResult } from './responseParsing';

type FMInfo = {
    exists: boolean;
    frontmatter?: string;
    position?: { start?: { offset: number }, end?: { offset: number } };
};

async function updateSceneFile(
    vault: Vault,
    scene: SceneData,
    parsedAnalysis: ParsedSceneAnalysis,
    plugin: RadialTimelinePlugin,
    modelIdUsed: string | null
): Promise<boolean> {
    try {
        const toArray = (block: string): string[] => {
            return block
                .split('\n')
                .map(s => s.replace(/^\s*-\s*/, '').trim())
                .filter(Boolean);
        };

        await plugin.app.fileManager.processFrontMatter(scene.file, (fm) => {
            const fmObj = fm as Record<string, unknown>;
            delete fmObj['1beats'];
            delete fmObj['2beats'];
            delete fmObj['3beats'];

            const now = new Date();
            const timestamp = now.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            const updatedValue = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
            fmObj['Pulse Last Updated'] = updatedValue;

            const pulseKeys = [
                'Pulse Update',
                'PulseUpdate',
                'pulseupdate',
                'Beats Update',
                'BeatsUpdate',
                'beatsupdate',
                'Review Update',
                'ReviewUpdate',
                'reviewupdate'
            ];
            let updatedFlag = false;
            for (const key of pulseKeys) {
                if (Object.prototype.hasOwnProperty.call(fmObj, key)) {
                    fmObj[key] = false;
                    updatedFlag = true;
                }
            }
            if (!updatedFlag) {
                fmObj['Pulse Update'] = false;
            }

            const b1 = parsedAnalysis['previousSceneAnalysis']?.trim();
            const b2 = parsedAnalysis['currentSceneAnalysis']?.trim();
            const b3 = parsedAnalysis['nextSceneAnalysis']?.trim();

            if (b1) fmObj['previousSceneAnalysis'] = toArray(b1);
            if (b2) fmObj['currentSceneAnalysis'] = toArray(b2);
            if (b3) fmObj['nextSceneAnalysis'] = toArray(b3);
        });
        return true;
    } catch (error) {
        console.error(`[updateSceneFile] Error updating file:`, error);
        new Notice(`Error saving updates to ${scene.file.basename}`);
        return false;
    }
}

const DUMMY_API_RESPONSE = `previousSceneAnalysis:
 - 33.2 Trisan Inner Turmoil - / Lacks clarity
 - Chae Ban Hesitation ? / Uncertain decision
 - Entiat Reflection ? / Needs clearer link: should explore motive
 - Chae Ban Plan + / Strengthens connection to currentSceneAnalysis choices
 - Meeting Entiat + / Sets up tension
currentSceneAnalysis:
 - 33.5 B / Scene will be stronger by making Entiat motivations clearer. Clarify: imminent threat
 - Entiat Adoption Reflections ? / Lacks tension link to events in previousSceneAnalysis
 - Chae Ban Escape News + / Advances plot
 - Entiat Internal Conflict + / Highlights dilemma: how to handle the situation from previousSceneAnalysis
 - Connection to nextSceneAnalysis + / Sets up the coming conflict
nextSceneAnalysis:
 - 34 Teco Routine Disruption - / Needs purpose
 - Entiat Unexpected Visit ? / Confusing motivation: clarify intention here
 - Sasha Defense and Defeat + / Builds on tension from currentSceneAnalysis
 - Teco Escape Decision + / Strong transition
 - Final Choice + / Resolves arc started in previousSceneAnalysis`;

export async function testYamlUpdateFormatting(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    const dummyFilePath = 'AITestDummyScene.md';
    const dummyBody = 'This is the body text of the dummy scene.\nIt has multiple lines.';
    const dummyInitialFrontmatter = {
        Class: 'Scene',
        Synopsis: 'Dummy synopsis for testing YAML update.',
        Subplot: ['Test Arc'],
        When: '2024-01-01',
        Words: 10,
        'Pulse Update': 'Yes'
    };

    new Notice(`Starting YAML update test on ${dummyFilePath}...`);
    try {
        let file = vault.getAbstractFileByPath(dummyFilePath);
        if (!(file instanceof TFile)) {
            const initialContent = `---\n${stringifyYaml(dummyInitialFrontmatter)}---\n${dummyBody}`;
            await vault.create(dummyFilePath, initialContent);
            file = vault.getAbstractFileByPath(dummyFilePath);
        }

        if (!(file instanceof TFile)) {
            new Notice(`Error: Could not get TFile for ${dummyFilePath}`);
            return;
        }

        const currentContent = await vault.read(file);
        const fmInfo = getFrontMatterInfo(currentContent) as unknown as FMInfo;
        if (!fmInfo || !fmInfo.exists) {
            new Notice(`Error: Dummy file ${dummyFilePath} is missing frontmatter.`);
            return;
        }

        const fmText = fmInfo.frontmatter ?? '';
        const currentFrontmatter = fmText ? (parseYaml(fmText) || {}) : {};
        let currentBody = currentContent;
        const endOffset = fmInfo.position?.end?.offset as number | undefined;
        if (typeof endOffset === 'number' && endOffset >= 0 && endOffset <= currentContent.length) {
            currentBody = currentContent.slice(endOffset).trim();
        } else {
            currentBody = currentContent.replace(/^---[\s\S]*?\n---/, '').trim();
        }

        const dummySceneData: SceneData = {
            file,
            frontmatter: currentFrontmatter,
            sceneNumber: 999,
            body: currentBody
        };

        const parsedAnalysis = parseGptResult(DUMMY_API_RESPONSE, plugin);
        if (!parsedAnalysis) {
            new Notice('Error: Failed to parse dummy API response data.');
            return;
        }

        const success = await updateSceneFile(vault, dummySceneData, parsedAnalysis, plugin, null);
        if (success) {
            new Notice(`Successfully updated YAML in ${dummyFilePath}. Please check the file formatting.`);
        } else {
            new Notice(`Failed to update YAML in ${dummyFilePath}. Check console for errors.`);
        }
    } catch (error) {
        console.error('Error during YAML update test:', error);
        new Notice('Error during YAML update test. Check console.');
    }
}

export async function createTemplateScene(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    try {
        const today = new Date();
        const isoDate = today.toISOString().slice(0, 10);
        const folderPath = sanitizeSourcePath(plugin.settings.sourcePath);
        if (folderPath) {
            const f = vault.getAbstractFileByPath(folderPath);
            if (!f) await vault.createFolder(folderPath);
        }

        let sceneNumber = 1;
        let targetPath = buildInitialSceneFilename(folderPath, `${sceneNumber} Template Scene.md`);
        while (vault.getAbstractFileByPath(targetPath)) {
            sceneNumber++;
            targetPath = buildInitialSceneFilename(folderPath, `${sceneNumber} Template Scene.md`);
        }

        const frontmatter = {
            Class: 'Scene',
            Act: 1,
            When: isoDate,
            Duration: '2 hours',
            Synopsis: 'Write a one-sentence summary of this scene.',
            Status: 'Todo',
            Subplot: ['Main Plot', 'Romance Arc'],
            Character: ['Protagonist', 'Mentor'],
            Place: '',
            POV: 'first',
            Due: isoDate,
            'Publish Stage': 'Zero',
            Revision: 0,
            'Pending Edits': '',
            Words: 0,
            'Pulse Update': ''
        } as Record<string, unknown>;

        const body = '\nWrite your scene here. Fill in Character and Subplot fields as needed. Use array format for multiple items.';
        let yamlContent = stringifyYaml(frontmatter);
        yamlContent = yamlContent.replace(/^POV: (.+)$/m, 'POV: $1 # first | second | third | omni | objective | two | count | all');
        const content = `---\n${yamlContent}---\n${body}\n`;

        await vault.create(targetPath, content);
        new Notice(`Created template scene: ${targetPath}`);
        await openOrRevealFileByPath(plugin.app, targetPath, false);
    } catch (error) {
        console.error('[createTemplateScene] Failed:', error);
        new Notice('Failed to create template scene. Check console for details.');
    }
}

class PurgeConfirmationModal extends Modal {
    constructor(
        app: App,
        private readonly message: string,
        private readonly details: string[],
        private readonly onConfirm: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Confirm purge beats');

        const messageEl = contentEl.createDiv({ cls: 'rt-purge-message' });
        messageEl.setText(this.message);

        const detailsEl = contentEl.createDiv({ cls: 'rt-purge-details' });
        detailsEl.createEl('strong', { text: 'This will permanently delete:' });
        const listEl = detailsEl.createEl('ul');
        this.details.forEach(detail => listEl.createEl('li', { text: detail }));

        const warningEl = contentEl.createDiv({ cls: 'rt-purge-warning' });
        warningEl.createEl('strong', { text: 'This cannot be undone. Continue?' });

        const buttonRow = contentEl.createDiv({ cls: 'rt-pulse-actions' });
        new ButtonComponent(buttonRow)
            .setButtonText('Purge beats')
            .setWarning()
            .onClick(() => {
                this.close();
                this.onConfirm();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }
}

async function purgeScenesBeats(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    scenes: SceneData[]
): Promise<number> {
    let purgedCount = 0;
    for (const scene of scenes) {
        try {
            await plugin.app.fileManager.processFrontMatter(scene.file, (fm) => {
                const fmObj = fm as Record<string, unknown>;
                const hadPrevious = fmObj['previousSceneAnalysis'] !== undefined;
                const hadCurrent = fmObj['currentSceneAnalysis'] !== undefined;
                const hadNext = fmObj['nextSceneAnalysis'] !== undefined;
                const hadTimestamp = fmObj['Pulse Last Updated'] !== undefined || fmObj['Beats Last Updated'] !== undefined;

                delete fmObj['previousSceneAnalysis'];
                delete fmObj['currentSceneAnalysis'];
                delete fmObj['nextSceneAnalysis'];
                delete fmObj['Pulse Last Updated'];
                delete fmObj['Beats Last Updated'];

                if (hadPrevious || hadCurrent || hadNext || hadTimestamp) {
                    purgedCount++;
                }
            });
        } catch (error) {
            console.error(`[purgeScenesBeats] Error purging beats from ${scene.file.path}:`, error);
        }
    }
    return purgedCount;
}

export async function purgeBeatsByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length === 0) {
            new Notice('No scenes found in manuscript.');
            return;
        }

        const modal = new PurgeConfirmationModal(
            plugin.app,
            `Purge ALL beats from ${allScenes.length} scene${allScenes.length !== 1 ? 's' : ''} in your manuscript?`,
            [
                'previousSceneAnalysis, currentSceneAnalysis, nextSceneAnalysis fields',
                'Pulse Last Updated timestamps'
            ],
            async () => {
                const notice = new Notice('Purging beats from all scenes...', 0);
                const purgedCount = await purgeScenesBeats(plugin, vault, allScenes);

                notice.hide();
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                new Notice(`Purged beats from ${purgedCount} of ${allScenes.length} scene${allScenes.length !== 1 ? 's' : ''}.`);
            }
        );

        modal.open();
    } catch (error) {
        console.error('[purgeBeatsByManuscriptOrder] Error:', error);
        new Notice('Error purging beats. Check console for details.');
    }
}

export async function purgeBeatsBySubplotName(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));

        if (filtered.length === 0) {
            new Notice(`No scenes found for subplot "${subplotName}".`);
            return;
        }

        const modal = new PurgeConfirmationModal(
            plugin.app,
            `Purge beats from ${filtered.length} scene${filtered.length !== 1 ? 's' : ''} in subplot "${subplotName}"?`,
            [
                'previousSceneAnalysis, currentSceneAnalysis, nextSceneAnalysis fields',
                'Pulse Last Updated timestamps'
            ],
            async () => {
                const notice = new Notice(`Purging beats from "${subplotName}"...`, 0);
                const purgedCount = await purgeScenesBeats(plugin, vault, filtered);

                notice.hide();
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                new Notice(`Purged beats from ${purgedCount} of ${filtered.length} scene${filtered.length !== 1 ? 's' : ''} in subplot "${subplotName}".`);
            }
        );

        modal.open();
    } catch (error) {
        console.error(`[purgeBeatsBySubplotName] Error purging subplot "${subplotName}":`, error);
        new Notice('Error purging beats. Check console for details.');
    }
}
