import { getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { ensureSceneIdFrontmatter, isSceneClassFrontmatter, readSceneId } from '../utils/sceneIds';
import { buildFrontmatterDocument, extractBodyAfterFrontmatter } from '../utils/frontmatterDocument';
import { resolveBookScopedMarkdownFiles } from '../services/NoteScopeResolver';

type FrontmatterInfo = {
    exists?: boolean;
    frontmatter?: string;
    to?: number;
    position?: { end?: { offset?: number } };
};

export async function migrateSceneFrontmatterIds(plugin: RadialTimelinePlugin): Promise<number> {
    let migrated = 0;
    try {
        const scope = resolveBookScopedMarkdownFiles(plugin.app, plugin.settings);
        if (!scope.sourcePath) {
            console.debug('[RT] Scene ID migration: no source path configured');
            return 0;
        }

        const files = scope.files;
        console.debug(`[RT] Scene ID migration: scanning ${files.length} files in "${scope.sourcePath}"`);
        for (const file of files) {
            const content = await plugin.app.vault.read(file);
            const info = getFrontMatterInfo(content) as unknown as FrontmatterInfo;
            if (!info?.exists || !info.frontmatter) continue;

            let parsed: Record<string, unknown>;
            try {
                const yaml = parseYaml(info.frontmatter);
                if (!yaml || typeof yaml !== 'object') continue;
                parsed = yaml as Record<string, unknown>;
            } catch {
                console.warn(`[RT] Scene ID migration: YAML parse failed for ${file.path}`);
                continue;
            }

            if (!isSceneClassFrontmatter(parsed)) continue;
            if (readSceneId(parsed)) continue;

            const normalized = ensureSceneIdFrontmatter(parsed);
            const rebuiltYaml = stringifyYaml(normalized.frontmatter);
            const body = extractBodyAfterFrontmatter(content, info);
            const updated = buildFrontmatterDocument(rebuiltYaml, body);
            await plugin.app.vault.modify(file, updated);
            migrated++;
        }
        if (migrated > 0) {
            console.log(`[RT] Scene ID migration: added IDs to ${migrated} scene(s)`);
        }
    } catch (error) {
        console.error('[Radial Timeline] Error during scene id migration:', error);
    }
    return migrated;
}
