import { getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { ensureSceneIdFrontmatter, isSceneClassFrontmatter, readSceneId } from '../utils/sceneIds';
import { buildFrontmatterDocument, extractBodyAfterFrontmatter } from '../utils/frontmatterDocument';

type FrontmatterInfo = {
    exists?: boolean;
    frontmatter?: string;
    to?: number;
    position?: { end?: { offset?: number } };
};

export async function migrateSceneFrontmatterIds(plugin: RadialTimelinePlugin): Promise<void> {
    try {
        const files = plugin.app.vault.getMarkdownFiles();
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
                continue;
            }

            if (!isSceneClassFrontmatter(parsed)) continue;
            if (readSceneId(parsed)) continue;

            const normalized = ensureSceneIdFrontmatter(parsed);
            const rebuiltYaml = stringifyYaml(normalized.frontmatter);
            const body = extractBodyAfterFrontmatter(content, info);
            const updated = buildFrontmatterDocument(rebuiltYaml, body);
            await plugin.app.vault.modify(file, updated);
        }
    } catch (error) {
        console.error('[Radial Timeline] Error during scene id migration:', error);
    }
}
