import type RadialTimelinePlugin from '../main';

export async function migrateSceneAnalysisFields(plugin: RadialTimelinePlugin): Promise<void> {
    try {
        const files = plugin.app.vault.getMarkdownFiles();
        let migratedCount = 0;

        for (const file of files) {
            const cache = plugin.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;

            if (fm && (fm['1beats'] || fm['2beats'] || fm['3beats'])) {
                const needsMigration =
                    (fm['1beats'] || fm['2beats'] || fm['3beats']) &&
                    !(fm['previousSceneAnalysis'] || fm['currentSceneAnalysis'] || fm['nextSceneAnalysis']);

                if (needsMigration) {
                    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                        const fmObj = frontmatter as Record<string, unknown>;

                        if (fmObj['1beats']) {
                            fmObj['previousSceneAnalysis'] = fmObj['1beats'];
                            delete fmObj['1beats'];
                        }
                        if (fmObj['2beats']) {
                            fmObj['currentSceneAnalysis'] = fmObj['2beats'];
                            delete fmObj['2beats'];
                        }
                        if (fmObj['3beats']) {
                            fmObj['nextSceneAnalysis'] = fmObj['3beats'];
                            delete fmObj['3beats'];
                        }
                    });
                    migratedCount++;
                }
            }
        }

        void migratedCount;
    } catch (error) {
        console.error('[Radial Timeline] Error during migration:', error);
    }
}
