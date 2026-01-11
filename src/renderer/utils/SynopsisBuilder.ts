import type { TimelineItem } from '../../types';
import { isBeatNote, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { splitIntoBalancedLinesOptimal } from '../../utils/text';
import { resolveScenePov } from '../../utils/pov';
import { getReadabilityMultiplier } from '../../utils/readability';

export function buildSynopsisElement(
    plugin: PluginRendererFacade,
    scene: TimelineItem,
    sceneId: string,
    maxTextWidth: number,
    orderedSubplots: string[],
    subplotIndexResolver?: (name: string) => number
): SVGGElement {
    const fontScale = getReadabilityMultiplier(plugin.settings as any);

    // For Backdrop items, only show Title and Synopsis/Description
    if (scene.itemType === 'Backdrop') {
        const lines = [scene.title || 'Untitled'];
        if (scene.synopsis) {
            lines.push(...splitIntoBalancedLinesOptimal(scene.synopsis, maxTextWidth, fontScale));
        } else if (scene.Description) {
            lines.push(...splitIntoBalancedLinesOptimal(scene.Description, maxTextWidth, fontScale));
        }
        return plugin.synopsisManager.generateElement(scene, lines, sceneId, subplotIndexResolver);
    }

    const contentLines = [
        scene.title || '',
        ...(isBeatNote(scene) && scene.Description
            ? splitIntoBalancedLinesOptimal(scene.Description, maxTextWidth, fontScale)
            : scene.synopsis
                ? splitIntoBalancedLinesOptimal(scene.synopsis, maxTextWidth, fontScale)
                : [])
    ];

    if (isBeatNote(scene)) {
        // Find the latest Gossamer score, justification, and stage (highest numbered field)
        let latestScore: number | undefined;
        let latestJustification: string | undefined;
        let latestStage: string = 'Zero'; // Default stage
        
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
                // Get the stage for this run
                const stageKey = `GossamerStage${i}` as keyof typeof scene;
                const stage = scene[stageKey];
                if (typeof stage === 'string') {
                    latestStage = stage;
                }
                break;
            }
        }
        
        if (latestScore !== undefined) {
            // Add spacer before Gossamer line (like scenes have before pulse analysis)
            contentLines.push('<gossamer-spacer></gossamer-spacer>');
            
            // Format: "80/100 — JUSTIFICATION" with score using GossamerStage color
            // Include stage in tag for color lookup: <gossamer-pulse data-stage="Zero">
            if (latestJustification) {
                const justificationUpper = latestJustification.toUpperCase();
                // Combine score + em dash + justification for balanced wrapping
                const fullText = `${latestScore}/100 — ${justificationUpper}`;
                
                // Use balanced line breaking - wider width since text wraps nicely
                const wrappedLines = splitIntoBalancedLinesOptimal(fullText, maxTextWidth * 1.6, fontScale);
                
                if (wrappedLines.length <= 1) {
                    // Short enough - single line
                    contentLines.push(`<gossamer-pulse data-stage="${latestStage}">${fullText}</gossamer-pulse>`);
                } else {
                    // First line contains score + em dash + start of justification
                    contentLines.push(`<gossamer-pulse data-stage="${latestStage}">${wrappedLines[0]}</gossamer-pulse>`);
                    // Continuation lines
                    for (let j = 1; j < wrappedLines.length; j++) {
                        contentLines.push(`<gossamer-pulse-cont>${wrappedLines[j]}</gossamer-pulse-cont>`);
                    }
                }
            } else {
                contentLines.push(`<gossamer-pulse data-stage="${latestStage}">${latestScore}/100</gossamer-pulse>`);
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
