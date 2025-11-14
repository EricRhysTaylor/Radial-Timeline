import type { TimelineItem } from '../../types';
import { isBeatNote } from '../../utils/sceneHelpers';
import { splitIntoBalancedLines } from '../../utils/text';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';

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
        const rawCharacters = characters.length > 0
            ? characters.map((char: string, index: number) => index === 0 ? `${char} >pov<` : char).join(', ')
            : '';
        contentLines.push(rawCharacters);
    }

    const filtered = contentLines.filter(line => line && line.trim() !== '\u00A0');
    return plugin.synopsisManager.generateElement(scene, filtered, sceneId, subplotIndexResolver);
}
