import type { TimelineItem } from '../../types';
import { formatNumber, escapeXml } from '../../utils/svg';

export interface SubplotDominanceState {
    hasSharedOverlap: boolean;
    hasHiddenSharedScenes: boolean;
}

export interface DominantSceneResolution {
    scene: TimelineItem;
    dominantSubplot: string;
    storedPreference?: string;
    preferenceMatched: boolean;
}

function normalizeSubplotName(name?: string | null): string {
    if (name && name.trim().length > 0) {
        return name.trim();
    }
    return 'Main Plot';
}

export function resolveDominantScene(params: {
    scenePath?: string;
    candidateScenes: TimelineItem[];
    masterSubplotOrder: string[];
    dominantSubplots?: Record<string, string>;
}): DominantSceneResolution {
    const { scenePath, candidateScenes, masterSubplotOrder, dominantSubplots } = params;
    if (!candidateScenes.length) {
        throw new Error('resolveDominantScene requires at least one candidate scene');
    }

    const selectFallback = (): { scene: TimelineItem; subplot: string } => {
        let fallbackScene = candidateScenes[0];
        let fallbackSubplot = normalizeSubplotName(fallbackScene.subplot);
        let bestIndex = masterSubplotOrder.indexOf(fallbackSubplot);
        if (bestIndex === -1) bestIndex = Infinity;

        candidateScenes.forEach(scene => {
            const subplotName = normalizeSubplotName(scene.subplot);
            const idx = masterSubplotOrder.indexOf(subplotName);
            if (idx !== -1 && idx < bestIndex) {
                fallbackScene = scene;
                fallbackSubplot = subplotName;
                bestIndex = idx;
            }
        });

        return { scene: fallbackScene, subplot: fallbackSubplot };
    };

    const storedPreference = scenePath && dominantSubplots ? dominantSubplots[scenePath] : undefined;
    if (storedPreference) {
        const matchedScene = candidateScenes.find(scene => normalizeSubplotName(scene.subplot) === storedPreference);
        if (matchedScene) {
            return {
                scene: matchedScene,
                dominantSubplot: storedPreference,
                storedPreference,
                preferenceMatched: true
            };
        }

        const fallback = selectFallback();
        return {
            scene: fallback.scene,
            dominantSubplot: fallback.subplot,
            storedPreference,
            preferenceMatched: false
        };
    }

    const fallback = selectFallback();
    return {
        scene: fallback.scene,
        dominantSubplot: fallback.subplot,
        preferenceMatched: false
    };
}

export function computeSubplotDominanceStates(params: {
    scenes: TimelineItem[];
    masterSubplotOrder: string[];
    dominantSubplots?: Record<string, string>;
}): Map<string, SubplotDominanceState> {
    const { scenes, masterSubplotOrder, dominantSubplots } = params;
    const subplotDominanceStates = new Map<string, SubplotDominanceState>();
    masterSubplotOrder.forEach(subplot => {
        subplotDominanceStates.set(subplot, {
            hasSharedOverlap: false,
            hasHiddenSharedScenes: false
        });
    });

    const scenesGroupedByPath = new Map<string, TimelineItem[]>();
    scenes.forEach(scene => {
        if (!scene.path) return;
        if (!scenesGroupedByPath.has(scene.path)) {
            scenesGroupedByPath.set(scene.path, []);
        }
        scenesGroupedByPath.get(scene.path)!.push(scene);
    });

    scenesGroupedByPath.forEach((items, path) => {
        const uniqueSubplots = Array.from(
            new Set(items.map(scene => normalizeSubplotName(scene.subplot)))
        );
        if (uniqueSubplots.length <= 1) return;

        const { dominantSubplot } = resolveDominantScene({
            scenePath: path,
            candidateScenes: items,
            masterSubplotOrder,
            dominantSubplots
        });

        uniqueSubplots.forEach(subplotName => {
            const existing = subplotDominanceStates.get(subplotName) || {
                hasSharedOverlap: false,
                hasHiddenSharedScenes: false
            };
            existing.hasSharedOverlap = true;
            if (subplotName !== dominantSubplot) {
                existing.hasHiddenSharedScenes = true;
            }
            subplotDominanceStates.set(subplotName, existing);
        });
    });

    return subplotDominanceStates;
}

export function renderSubplotDominanceIndicators(params: {
    masterSubplotOrder: string[];
    ringStartRadii: number[];
    ringWidths: number[];
    subplotStates: Map<string, SubplotDominanceState>;
    subplotColorFor: (subplotName: string) => string;
}): string {
    const { masterSubplotOrder, ringStartRadii, ringWidths, subplotStates, subplotColorFor } = params;
    if (masterSubplotOrder.length === 0) return '';

    const totalRings = masterSubplotOrder.length;
    const iconAngle = (3 * Math.PI) / 4; // bottom-left quadrant
    const radialX = Math.cos(iconAngle);
    const radialY = Math.sin(iconAngle);
    const iconPath = 'M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z';
    const iconViewBox = 24;
    let svg = '<g class="rt-subplot-dominance-flags">';

    masterSubplotOrder.forEach((subplotName, offset) => {
        const state = subplotStates.get(subplotName);
        if (!state || !state.hasSharedOverlap) return;

        const ring = totalRings - offset - 1;
        const innerR = ringStartRadii[ring];
        const ringWidth = ringWidths[ring];
        if (innerR === undefined || ringWidth === undefined) return;

        const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
        const radialInset = clamp(ringWidth * 0.25, 6, 14);
        const iconRadius = innerR + radialInset;
        const iconX = iconRadius * radialX;
        const iconY = iconRadius * radialY;
        const iconPixelSize = clamp(ringWidth * 0.55, 8, 18);
        const scale = iconPixelSize / iconViewBox;
        const rotationDeg = (iconAngle * 180) / Math.PI + 90;
        const fillColor = state.hasHiddenSharedScenes ? 'var(--rt-color-due)' : 'var(--rt-color-press)';
        const cssClass = state.hasHiddenSharedScenes ? 'is-hidden' : 'is-shown';

        svg += `
            <g class="rt-subplot-dominance-flag ${cssClass}"
               data-subplot-name="${escapeXml(subplotName)}"
               data-has-hidden="${state.hasHiddenSharedScenes ? 'true' : 'false'}"
               transform="
                    translate(${formatNumber(iconX)} ${formatNumber(iconY)})
                    rotate(${formatNumber(rotationDeg)})
                    scale(${formatNumber(scale)})
                    translate(-12 -12)
               ">
                <path d="${iconPath}" fill="${fillColor}" stroke="none" />
            </g>
        `;
    });

    svg += '</g>';
    return svg;
}
