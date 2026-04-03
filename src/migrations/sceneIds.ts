import { stringifyYaml } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { ensureSceneIdFrontmatter, isSceneClassFrontmatter, readSceneId } from '../utils/sceneIds';
import { buildFrontmatterDocument } from '../utils/frontmatterDocument';
import { resolveBookScopedMarkdownFiles } from '../services/NoteScopeResolver';
import {
    formatAliasConflictMessage,
    prepareFrontmatterRewrite,
    verifyFrontmatterRewrite,
} from '../utils/frontmatterWriteSafety';

export async function migrateSceneFrontmatterIds(plugin: RadialTimelinePlugin): Promise<number> {
    let migrated = 0;
    try {
        const scope = resolveBookScopedMarkdownFiles(plugin.app, plugin.settings);
        if (!scope.sourcePath) {
            return 0;
        }

        const files = scope.files;
        for (const file of files) {
            const content = await plugin.app.vault.read(file);
            const prepared = prepareFrontmatterRewrite(content);
            if (!prepared) continue;
            if (prepared.aliasConflicts.length > 0) {
                console.warn('[Radial Timeline] Skipping scene id migration due to duplicate canonical aliases:', file.path, formatAliasConflictMessage(prepared.aliasConflicts));
                continue;
            }

            if (!isSceneClassFrontmatter(prepared.parsed)) continue;
            if (readSceneId(prepared.parsed)) continue;

            const normalized = ensureSceneIdFrontmatter(prepared.parsed);
            const rebuiltYaml = stringifyYaml(normalized.frontmatter);
            const updated = buildFrontmatterDocument(rebuiltYaml, prepared.body);
            await plugin.app.vault.modify(file, updated);
            const verifiedContent = await plugin.app.vault.read(file);
            const verification = verifyFrontmatterRewrite(verifiedContent, {
                originalBody: prepared.body,
                verifyParsed: (verifiedFrontmatter) => readSceneId(verifiedFrontmatter) === normalized.sceneId
            });
            if (!verification.ok) {
                console.warn('[Radial Timeline] Scene id migration verification failed:', file.path, verification.reason);
                continue;
            }
            migrated++;
        }
    } catch (error) {
        console.error('[Radial Timeline] Error during scene id migration:', error);
    }
    return migrated;
}
