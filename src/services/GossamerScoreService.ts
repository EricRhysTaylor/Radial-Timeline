import { Notice, TFile, App } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { isStoryBeat } from '../utils/sceneHelpers';
import { appendGossamerScore, collectGossamerManagedSnapshot, detectDominantStage, willAppendGossamerPrune } from '../utils/gossamer';
import { isPathInFolderScope } from '../utils/pathScope';
import { snapshotFrontmatterFields } from '../utils/safeVaultOps';

export class GossamerScoreService {
    constructor(private app: App, private plugin: RadialTimelinePlugin) {}

    async saveScores(scores: Map<string, number>): Promise<void> {
        const sourcePath = this.plugin.settings.sourcePath || '';
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = sourcePath
            ? allFiles.filter(f => isPathInFolderScope(f.path, sourcePath))
            : allFiles;

        // Detect dominant stage from current scene data
        let dominantStage = 'Zero';
        try {
            const scenes = await this.plugin.getSceneData();
            dominantStage = detectDominantStage(scenes);
        } catch (e) {
            console.error('[Gossamer] Failed to detect dominant stage, defaulting to Zero:', e);
        }

        let updateCount = 0;
        const snapshotPaths = new Set<string>();

        for (const [beatTitle, newScore] of scores) {
            let file: TFile | null = null;
            for (const f of files) {
                const cache = this.app.metadataCache.getFileCache(f);
                const rawFm = cache?.frontmatter;
                const fm = rawFm ? normalizeFrontmatterKeys(rawFm) : undefined;
                if (fm && isStoryBeat(fm.Class)) {
                    const filename = f.basename;
                    const titleMatch = filename === beatTitle ||
                        filename === beatTitle.replace(/^\d+\s+/, '') ||
                        filename.toLowerCase() === beatTitle.toLowerCase() ||
                        filename.toLowerCase().replace(/[-\s]/g, '') === beatTitle.toLowerCase().replace(/[-\s]/g, '');
                    if (titleMatch) {
                        file = f;
                        break;
                    }
                }
            }

            if (!file) continue;

            try {
                const priorFrontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, any> | undefined;
                const snapshotPath = priorFrontmatter && (willAppendGossamerPrune(priorFrontmatter) || Object.keys(collectGossamerManagedSnapshot(priorFrontmatter)).length > 0)
                    ? await snapshotFrontmatterFields(this.app, [file], {
                        operation: 'gossamer-save',
                        aiOutputFolder: this.plugin.settings.aiOutputFolder,
                        selectFields: (frontmatter) => collectGossamerManagedSnapshot(frontmatter as Record<string, any>),
                        meta: {
                            scope: 'beat-note',
                            beat: beatTitle
                        }
                    })
                    : null;
                await this.app.fileManager.processFrontMatter(file, (yaml) => {
                    const fm = yaml as Record<string, any>;
                    const { nextIndex, updated } = appendGossamerScore(fm);
                    Object.assign(fm, updated);
                    fm[`Gossamer${nextIndex}`] = newScore;
                    fm[`GossamerStage${nextIndex}`] = dominantStage;
                    delete fm.GossamerLocation;
                    delete fm.GossamerNote;
                    delete fm.GossamerRuns;
                    delete fm.GossamerLatestRun;
                });
                if (snapshotPath) snapshotPaths.add(snapshotPath);
                updateCount++;
            } catch (e) {
                console.error(`[Gossamer] Failed to update beat ${beatTitle}:`, e);
            }
        }

        if (updateCount > 0) {
            const parts = [`Updated ${updateCount} beat score${updateCount > 1 ? 's' : ''} (${dominantStage} stage).`];
            if (snapshotPaths.size > 0) parts.push(`Archived replaced Gossamer history in ${snapshotPaths.size} snapshot${snapshotPaths.size === 1 ? '' : 's'}.`);
            new Notice(parts.join(' '));
        } else {
            new Notice('No beats were updated.');
        }
    }
}
