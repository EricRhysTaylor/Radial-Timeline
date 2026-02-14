
import type { TimelineItem } from '../../types';
import { isNonSceneItem } from '../../utils/sceneHelpers';
import { parseSceneTitle, normalizeStatus, getScenePrefixNumber } from '../../utils/text';
import { isOverdueDateString } from '../../utils/date';
import { STAGES_FOR_GRID, STATUSES_FOR_GRID } from '../../utils/constants';
import { parseRuntimeField } from '../../utils/runtimeEstimator';

/**
 * Normalize a YAML value that might be accidentally formatted as an array.
 * Handles: "Author", ["Author"], or undefined → returns first string value or undefined
 * This handles sloppy YAML like:
 *   Publish Stage:
 *     - Author
 * which becomes ["Author"] instead of "Author"
 */
function normalizeYamlValue(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        return value.length > 0 ? String(value[0]).trim() : undefined;
    }
    if (typeof value === 'string') {
        return value.trim() || undefined;
    }
    return String(value).trim() || undefined;
}

export interface GridDataResult {
    statusCounts: Record<string, number>;
    gridCounts: Record<string, Record<string, number>>;
    gridSceneNames: Record<string, Record<string, string[]>>;
    estimatedTotalScenes: number;
    totalRuntimeSeconds: number;
}

export function computeGridData(scenes: TimelineItem[]): GridDataResult {
    // 1. Calculate Status Counts (for Color Key and Estimate)
    // Only count actual scenes (not Beat, Plot, or Backdrop items)
    const sceneNotesOnly = scenes.filter(scene => !isNonSceneItem(scene));
    const processedScenes = new Set<string>();

    // Initialize Accumulator with known stages to ensure keys exist? 
    // The original code didn't initialize, it just accumulated.
    const statusCounts = sceneNotesOnly.reduce((acc, scene) => {
        if (scene.path && processedScenes.has(scene.path)) {
            return acc;
        }
        if (scene.path) {
            processedScenes.add(scene.path);
        }

        const normalizedStatus = scene.status?.toString().trim().toLowerCase() || '';

        // If status is empty/undefined/null, count it as "Todo"
        if (!normalizedStatus || normalizedStatus === '') {
            acc["Todo"] = (acc["Todo"] || 0) + 1;
            return acc;
        }

        if (normalizedStatus === "complete") {
            // For completed scenes, count by Publish Stage (handle array from sloppy YAML)
            const publishStage = normalizeYamlValue(scene["Publish Stage"]) || 'Zero';
            acc[publishStage] = (acc[publishStage] || 0) + 1;
        } else if (scene.due) {
            // simplified overdue check logic needed here or import isOverdueDateString?
            // The original code had a manual date parse check inline for statusCounts (lines 508-536)
            // BUT for gridCounts (lines 624) it used isOverdueDateString.
            // We should standardise on isOverdueDateString if possible, but the inline one was more specific about today/future handling

            // Let's reuse the logic from the original file for statusCounts to be safe, 
            // but maybe we can refactor it to use isOverdueDateString if it matches?
            // isOverdueDateString checks if date < today (ignoring time).

            if (isOverdueDateString(scene.due)) {
                acc["Due"] = (acc["Due"] || 0) + 1;
            } else {
                // Future or today
                let statusKey = "Todo";
                if (scene.status) {
                    if (Array.isArray(scene.status) && scene.status.length > 0) {
                        statusKey = String(scene.status[0]);
                    } else if (typeof scene.status === 'string') {
                        statusKey = scene.status;
                    }
                }
                acc[statusKey] = (acc[statusKey] || 0) + 1;
            }
        } else {
            // No due date
            let statusKey = "Todo";
            if (scene.status) {
                if (Array.isArray(scene.status) && scene.status.length > 0) {
                    statusKey = String(scene.status[0]);
                } else if (typeof scene.status === 'string') {
                    statusKey = scene.status;
                }
            }
            acc[statusKey] = (acc[statusKey] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    // 2. Calculate Grid Counts (Stage x Status) and track scene names
    const processedPathsForGrid = new Set<string>();
    const gridCounts: Record<string, Record<string, number>> = {};
    const gridSceneNames: Record<string, Record<string, string[]>> = {};
    // Initialize grid
    (STAGES_FOR_GRID as readonly string[]).forEach(s => {
        gridCounts[s] = { Todo: 0, Working: 0, Due: 0, Completed: 0 };
        gridSceneNames[s] = { Todo: [], Working: [], Due: [], Completed: [] };
    });

    scenes.forEach(scene => {
        if (isNonSceneItem(scene)) return;
        if (!scene.path || processedPathsForGrid.has(scene.path)) return;
        processedPathsForGrid.add(scene.path);

        // Handle Publish Stage that might be accidentally an array (sloppy YAML)
        const rawStage = normalizeYamlValue(scene["Publish Stage"]);
        const stageKey = rawStage && (STAGES_FOR_GRID as readonly string[]).includes(rawStage)
            ? (rawStage as typeof STAGES_FOR_GRID[number])
            : 'Zero';

        const normalized = normalizeStatus(scene.status);
        let bucket: string = 'Todo';
        if (normalized === 'Completed') {
            bucket = 'Completed';
        } else if (scene.due && isOverdueDateString(scene.due)) {
            bucket = 'Due';
        } else if (normalized) {
            bucket = normalized;
        }

        if (!(bucket in gridCounts[stageKey])) {
            bucket = 'Todo';
        }
        gridCounts[stageKey][bucket] += 1;

        // Track scene name for tooltip (include scene number prefix)
        const rawTitle = scene.title || scene.path?.split('/').pop()?.replace('.md', '') || 'Unknown';
        const baseTitle = rawTitle.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
        const sceneNumber = getScenePrefixNumber(scene.title, scene.number);
        const sceneName = sceneNumber ? `${sceneNumber}. ${baseTitle}` : baseTitle;
        gridSceneNames[stageKey][bucket].push(sceneName);
    });

    // 3. Calculate Estimated Total Scenes
    const uniqueScenesCount = processedPathsForGrid.size;
    const seenForMax = new Set<string>();
    let highestPrefixNumber = 0;

    scenes.forEach(scene => {
        if (isNonSceneItem(scene)) return;
        if (!scene.path || seenForMax.has(scene.path)) return;
        seenForMax.add(scene.path);

        const { number } = parseSceneTitle(scene.title || '', scene.number);
        if (number) {
            const n = parseFloat(String(number));
            if (!isNaN(n)) {
                highestPrefixNumber = Math.max(highestPrefixNumber, n);
            }
        }
    });

    const estimatedTotalScenes = Math.max(uniqueScenesCount, Math.floor(highestPrefixNumber));

    // 4. Calculate Total Runtime (sum of all scene Runtime fields)
    const seenForRuntime = new Set<string>();
    let totalRuntimeSeconds = 0;

    scenes.forEach(scene => {
        if (isNonSceneItem(scene)) return;
        if (!scene.path || seenForRuntime.has(scene.path)) return;
        seenForRuntime.add(scene.path);

        if (scene.Runtime) {
            const seconds = parseRuntimeField(scene.Runtime);
            if (seconds !== null && seconds > 0) {
                totalRuntimeSeconds += seconds;
            }
        }
    });

    // Sort scene names naturally (numeric awareness) so tooltips show 1, 2, 3...
    Object.values(gridSceneNames).forEach(statusMap => {
        Object.values(statusMap).forEach(namesList => {
            namesList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        });
    });

    return {
        statusCounts,
        gridCounts,
        gridSceneNames,
        estimatedTotalScenes,
        totalRuntimeSeconds
    };
}
