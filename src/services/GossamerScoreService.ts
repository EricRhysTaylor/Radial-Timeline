import { Notice, TFile, App } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { isStoryBeat } from '../utils/sceneHelpers';
import { appendGossamerScore } from '../utils/gossamer';

export class GossamerScoreService {
    constructor(private app: App, private plugin: RadialTimelinePlugin) {}

    async saveScores(scores: Map<string, number>): Promise<void> {
        const sourcePath = this.plugin.settings.sourcePath || '';
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = sourcePath
            ? allFiles.filter(f => f.path.startsWith(sourcePath))
            : allFiles;

        let updateCount = 0;

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
                await this.app.fileManager.processFrontMatter(file, (yaml) => {
                    const fm = yaml as Record<string, any>;
                    const { nextIndex, updated } = appendGossamerScore(fm);
                    Object.assign(fm, updated);
                    fm[`Gossamer${nextIndex}`] = newScore;
                    delete fm.GossamerLocation;
                    delete fm.GossamerNote;
                    delete fm.GossamerRuns;
                    delete fm.GossamerLatestRun;
                });
                updateCount++;
            } catch (e) {
                console.error(`[Gossamer] Failed to update beat ${beatTitle}:`, e);
            }
        }

        if (updateCount > 0) {
            new Notice(`Updated ${updateCount} beat score${updateCount > 1 ? 's' : ''}.`);
        } else {
            new Notice('No beats were updated.');
        }
    }
}
