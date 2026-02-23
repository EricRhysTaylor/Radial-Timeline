import type { MetadataCache, TFile, Vault } from 'obsidian';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { readSceneId, resolveSceneReferenceId } from '../../utils/sceneIds';
import { cleanEvidenceBody } from '../../inquiry/utils/evidenceCleaning';

export type GossamerEvidenceMode = 'summaries' | 'bodies';

export interface GossamerEvidenceDocument {
    text: string;
    totalScenes: number;
    includedScenes: number;
    totalWords: number;
    evidenceMode: GossamerEvidenceMode;
}

interface SceneEvidenceEntry {
    title: string;
    sceneId: string;
    content: string;
}

const extractSummary = (frontmatter: Record<string, unknown>): string => {
    const raw = frontmatter['Summary'];
    if (Array.isArray(raw)) return raw.map(value => String(value)).join('\n').trim();
    if (typeof raw === 'string') return raw.trim();
    if (raw === null || raw === undefined) return '';
    return String(raw).trim();
};

const countWords = (text: string): number =>
    text.split(/\s+/).map(word => word.trim()).filter(Boolean).length;

const getNormalizedFrontmatter = (
    metadataCache: MetadataCache,
    file: TFile,
    frontmatterMappings?: Record<string, string>
): Record<string, unknown> => {
    const cache = metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) return {};
    return normalizeFrontmatterKeys(frontmatter, frontmatterMappings);
};

export async function buildGossamerEvidenceDocument(params: {
    sceneFiles: TFile[];
    vault: Vault;
    metadataCache: MetadataCache;
    evidenceMode: GossamerEvidenceMode;
    frontmatterMappings?: Record<string, string>;
}): Promise<GossamerEvidenceDocument> {
    const entries: SceneEvidenceEntry[] = [];
    for (const sceneFile of params.sceneFiles) {
        const frontmatter = getNormalizedFrontmatter(params.metadataCache, sceneFile, params.frontmatterMappings);
        const sceneId = resolveSceneReferenceId(readSceneId(frontmatter) ?? undefined, sceneFile.path);

        let content = '';
        if (params.evidenceMode === 'summaries') {
            content = extractSummary(frontmatter);
        } else {
            const raw = await params.vault.read(sceneFile);
            content = cleanEvidenceBody(raw);
        }

        if (!content) continue;
        entries.push({
            title: sceneFile.basename,
            sceneId,
            content
        });
    }

    if (!entries.length) {
        return {
            text: 'No scene evidence available for the selected mode.',
            totalScenes: params.sceneFiles.length,
            includedScenes: 0,
            totalWords: 0,
            evidenceMode: params.evidenceMode
        };
    }

    const tocLines = [
        '# TABLE OF CONTENTS',
        '',
        `Total Scenes: ${entries.length}`,
        `Evidence: ${params.evidenceMode === 'summaries' ? 'Summaries' : 'Bodies'}`,
        '',
        '---',
        ''
    ];
    entries.forEach((entry, index) => {
        tocLines.push(`${index + 1}. ${entry.title} (${entry.sceneId})`);
    });
    tocLines.push('', '---', '');

    const sceneSections = entries.map((entry, index) =>
        `## ${index + 1}. ${entry.title} (${entry.sceneId})\n\n${entry.content}`
    );
    const text = `${tocLines.join('\n')}\n${sceneSections.join('\n\n')}\n`;
    const totalWords = entries.reduce((sum, entry) => sum + countWords(entry.content), 0);

    return {
        text,
        totalScenes: params.sceneFiles.length,
        includedScenes: entries.length,
        totalWords,
        evidenceMode: params.evidenceMode
    };
}
