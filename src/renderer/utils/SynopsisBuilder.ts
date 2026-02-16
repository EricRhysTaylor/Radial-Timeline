import type { TimelineItem } from '../../types';
import { isBeatNote, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { splitIntoBalancedLinesOptimal } from '../../utils/text';
import { resolveScenePov } from '../../utils/pov';
import { getReadabilityMultiplier } from '../../utils/readability';
import { getSynopsisGenerationWordLimit, getSynopsisHoverLineLimit, truncateToWordLimit } from '../../utils/synopsisLimits';

/**
 * Split text into balanced lines and truncate to a maximum line count.
 * Adds "..." to the last line if truncated.
 */
function splitAndTruncateLines(text: string, maxTextWidth: number, fontScale: number, maxLines: number): string[] {
    if (!text) return [];
    const allLines = splitIntoBalancedLinesOptimal(text, maxTextWidth, fontScale);
    if (allLines.length <= maxLines) return allLines;
    const truncated = allLines.slice(0, maxLines);
    // Add ellipsis to the last line
    truncated[truncated.length - 1] = truncated[truncated.length - 1] + '...';
    return truncated;
}

export function buildSynopsisElement(
    plugin: PluginRendererFacade,
    scene: TimelineItem,
    sceneId: string,
    maxTextWidth: number,
    orderedSubplots: string[],
    subplotIndexResolver?: (name: string) => number
): SVGGElement {
    const fontScale = getReadabilityMultiplier(plugin.settings as any);
    const maxWords = getSynopsisGenerationWordLimit(plugin.settings as any);
    const maxLines = getSynopsisHoverLineLimit(plugin.settings as any);

    // For Backdrop items, only show Title and world context text
    if (scene.itemType === 'Backdrop') {
        const lines = [scene.title || 'Untitled'];
        const backdropContext = scene.Context ?? scene.synopsis ?? scene.Description;
        if (backdropContext) {
            lines.push(...splitAndTruncateLines(truncateToWordLimit(backdropContext, maxWords), maxTextWidth, fontScale, maxLines));
        }
        return plugin.synopsisManager.generateElement(scene, lines, sceneId, subplotIndexResolver);
    }

    const beatPurpose = scene.Purpose ?? scene.Description;
    const cappedSynopsis = scene.synopsis ? truncateToWordLimit(scene.synopsis, maxWords) : undefined;
    const contentLines = [
        scene.title || '',
        ...(isBeatNote(scene) && beatPurpose
            ? [beatPurpose]
            : cappedSynopsis
                ? [cappedSynopsis]
                : [])
    ];

    if (isBeatNote(scene)) {
        // Find the latest Gossamer score and justification (highest numbered field)
        let latestScore: number | undefined;
        let latestJustification: string | undefined;
        
        // Check Gossamer1 through Gossamer30 for the latest score
        for (let i = 30; i >= 1; i--) {
            const scoreKey = `Gossamer${i}` as keyof typeof scene;
            const score = scene[scoreKey];
            if (score !== undefined && score !== null && typeof score === 'number') {
                latestScore = score;
                // Get justification from rawFrontmatter (not typed on TimelineItem)
                const justificationKey = `Gossamer${i} Justification`;
                const justification = scene.rawFrontmatter?.[justificationKey];
                if (typeof justification === 'string') {
                    latestJustification = justification;
                }
                break;
            }
        }
        
        if (latestScore !== undefined) {
            // Add spacer before Gossamer line (like scenes have before pulse analysis)
            contentLines.push('<gossamer-spacer></gossamer-spacer>');
            
            // Format: "80/100 — JUSTIFICATION" with score bold (pulse-text-grade style)
            if (latestJustification) {
                const justificationUpper = latestJustification.toUpperCase();
                // Combine score + em dash + justification for balanced wrapping
                const fullText = `${latestScore}/100 — ${justificationUpper}`;
                
                // Use balanced line breaking - wider width since text wraps nicely
                const wrappedLines = splitIntoBalancedLinesOptimal(fullText, maxTextWidth * 1.6, fontScale);
                
                if (wrappedLines.length <= 1) {
                    // Short enough - single line
                    contentLines.push(`<gossamer-pulse>${fullText}</gossamer-pulse>`);
                } else {
                    // First line contains score + em dash + start of justification
                    contentLines.push(`<gossamer-pulse>${wrappedLines[0]}</gossamer-pulse>`);
                    // Continuation lines
                    for (let j = 1; j < wrappedLines.length; j++) {
                        contentLines.push(`<gossamer-pulse-cont>${wrappedLines[j]}</gossamer-pulse-cont>`);
                    }
                }
            } else {
                contentLines.push(`<gossamer-pulse>${latestScore}/100</gossamer-pulse>`);
            }
        }
    }

    contentLines.push('\u00A0');

    if (!isBeatNote(scene)) {
        contentLines.push(orderedSubplots.join(', '));
        const characters = scene.Character || [];
        const povInfo = resolveScenePov(scene, {
            globalMode: plugin.settings.globalPovMode
        });

        const formattedEntries: string[] = [];
        povInfo.syntheticEntries.forEach(entry => {
            formattedEntries.push(`${entry.text} >pov=${entry.label}<`);
        });

        const markerMap = new Map<number, string>();
        povInfo.characterMarkers.forEach(marker => {
            markerMap.set(marker.index, marker.label);
        });

        characters.forEach((char: string, index: number) => {
            const label = markerMap.get(index);
            if (label) {
                formattedEntries.push(`${char} >pov=${label}<`);
            } else {
                formattedEntries.push(char);
            }
        });

        const rawCharacters = formattedEntries.filter(str => !!str && str.trim().length > 0).join(', ');
        if (rawCharacters) {
            contentLines.push(rawCharacters);
        }
    }

    const filtered = contentLines.filter(line => line && line.trim() !== '\u00A0');
    return plugin.synopsisManager.generateElement(scene, filtered, sceneId, subplotIndexResolver);
}

type SynopsisAppendOptions = {
    plugin: PluginRendererFacade;
    scene: TimelineItem;
    sceneId: string;
    maxTextWidth: number;
    masterSubplotOrder: string[];
    scenes: TimelineItem[];
    targets: SVGGElement[];
};

export function appendSynopsisElementForScene({
    plugin,
    scene,
    sceneId,
    maxTextWidth,
    masterSubplotOrder,
    scenes,
    targets
}: SynopsisAppendOptions): void {
    if (!scene.title) {
        return;
    }

    const allSceneSubplots = scenes
        .filter(s => s.path === scene.path)
        .map(s => s.subplot)
        .filter((s): s is string => s !== undefined);
    const sceneSubplot = scene.subplot || 'Main Plot';
    const orderedSubplots = [sceneSubplot, ...allSceneSubplots.filter(s => s !== sceneSubplot)];

    try {
        const synopsisElement = buildSynopsisElement(
            plugin,
            scene,
            sceneId,
            maxTextWidth,
            orderedSubplots,
            name => {
                const idx = masterSubplotOrder.indexOf(name);
                if (idx < 0) return 0;
                return idx % 16;
            }
        );
        targets.push(synopsisElement);
    } catch (error) {
        console.warn('Failed to build synopsis for scene:', scene.path, error);
    }
}
