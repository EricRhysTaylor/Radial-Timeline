import type { TimelineItem } from '../../types';
import { isBeatNote, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { splitIntoBalancedLines } from '../../utils/text';
import { resolveScenePov } from '../../utils/pov';

export function buildSynopsisElement(
    plugin: PluginRendererFacade,
    scene: TimelineItem,
    sceneId: string,
    maxTextWidth: number,
    orderedSubplots: string[],
    subplotIndexResolver?: (name: string) => number
): SVGGElement {
    const contentLines = [
        scene.title || '',
        ...(isBeatNote(scene) && scene.Description
            ? splitIntoBalancedLines(scene.Description, maxTextWidth)
            : scene.synopsis
            ? splitIntoBalancedLines(scene.synopsis, maxTextWidth)
            : [])
    ];

    if (isBeatNote(scene)) {
        const gossamer1 = scene.Gossamer1;
        if (gossamer1 !== undefined && gossamer1 !== null) {
            contentLines.push(`<gossamer>${gossamer1}/100</gossamer>`);
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
