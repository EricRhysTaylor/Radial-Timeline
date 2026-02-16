import { TFile, App } from 'obsidian';
import type { TimelineItem } from '../types';
import { filterBeatsBySystem } from '../utils/gossamer';

export interface SceneUpdate {
    path: string;
    newNumber: string;
    actNumber?: number;
    /** New subplot(s) to assign. If provided, replaces existing subplots. */
    subplots?: string[];
}

export interface RippleRenamePlan {
    updates: SceneUpdate[];
    checked: number;
    needRename: number;
}

export interface RippleRenamePlanOptions {
    beatSystem?: string;
    customBeatSystemName?: string;
}

/**
 * Apply scene updates - updates frontmatter and renames files.
 * Uses two-phase rename: ALL files go through temp namespace first.
 * This is the safest approach - never rename directly from old to new.
 */
export async function applySceneNumberUpdates(app: App, updates: SceneUpdate[]): Promise<void> {
    interface RenameOp {
        originalPath: string;
        tempPath: string;
        finalBasename: string;
        finalPath: string;
    }
    
    const renameOps: RenameOp[] = [];
    
    // First pass: Update frontmatter and collect rename operations
    for (const update of updates) {
        const file = app.vault.getAbstractFileByPath(update.path);
        if (!(file instanceof TFile)) continue;
        
        // Update frontmatter only when explicitly requested.
        // Ripple rename passes number-only updates and should not touch file contents.
        const needsFrontmatterUpdate = update.actNumber !== undefined || update.subplots !== undefined;
        if (needsFrontmatterUpdate) {
            await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                if (update.actNumber !== undefined) {
                    fm['Act'] = update.actNumber;
                }
                if (update.subplots !== undefined) {
                    if (update.subplots.length === 1) {
                        fm['Subplot'] = update.subplots[0];
                    } else if (update.subplots.length > 1) {
                        fm['Subplot'] = update.subplots;
                    }
                }
            });
        }

        // Check if rename is needed
        const currentBasename = file.basename;
        const finalBasename = buildRenamedBasename(currentBasename, update.newNumber);
        
        if (finalBasename !== currentBasename) {
            const parentPath = file.parent?.path ?? '';
            const prefix = parentPath ? `${parentPath}/` : '';
            // Simple temp name: z + final basename (sorts to end, easy to spot)
            const tempBasename = `z${finalBasename}`;
            
            renameOps.push({ 
                originalPath: file.path,
                tempPath: `${prefix}${tempBasename}.${file.extension}`,
                finalBasename,
                finalPath: `${prefix}${finalBasename}.${file.extension}`
            });
        }
    }
    
    if (renameOps.length === 0) return;
    
    // Phase 1: Rename ALL files to temp namespace
    // This clears ALL original positions
    for (const op of renameOps) {
        const file = app.vault.getAbstractFileByPath(op.originalPath);
        if (file instanceof TFile) {
            await app.fileManager.renameFile(file, op.tempPath);
        }
    }
    
    // Phase 2: Rename ALL files from temp to final
    // All target positions are now guaranteed free
    for (const op of renameOps) {
        const file = app.vault.getAbstractFileByPath(op.tempPath);
        if (file instanceof TFile) {
            await app.fileManager.renameFile(file, op.finalPath);
        }
    }
}

function buildRenamedBasename(basename: string, newNumber: string): string {
    const match = basename.match(/^\s*(\d+(?:\.\d+)?)\s+(.*)$/);
    if (match) {
        const rest = match[2]?.trim() ?? '';
        return `${newNumber} ${rest}`.trim();
    }
    return `${newNumber} ${basename}`.trim();
}

interface RippleCandidate {
    path: string;
    itemType: 'Scene' | 'Beat';
    basename: string;
    actNumber: number;
    sourceIndex: number;
}

function parseIntegerPrefixWidth(basename: string): number {
    const match = basename.match(/^\s*(\d+)(?:\.\d+)?\s+/);
    return match?.[1]?.length ?? 0;
}

function formatNormalizedPrefix(index: number, width: number): string {
    const raw = String(index);
    if (width > 1) return raw.padStart(width, '0');
    return raw;
}

function extractBasename(path: string): string {
    const fileName = path.split('/').pop() ?? path;
    const extensionMatch = fileName.match(/\.([^.]+)$/);
    return extensionMatch ? fileName.slice(0, -(extensionMatch[0].length)) : fileName;
}

function parsePrefixPosition(basename: string): number | null {
    const match = basename.match(/^\s*(\d+(?:\.\d+)?)\s+/);
    if (!match) return null;
    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function getActiveBeatPaths(items: TimelineItem[], options?: RippleRenamePlanOptions): Set<string> | undefined {
    const beats = items.filter((item): item is TimelineItem & { path: string } =>
        item.itemType === 'Beat' && typeof item.path === 'string' && item.path.length > 0
    );
    if (beats.length === 0) return undefined;

    const filteredBeats = filterBeatsBySystem(
        beats.map((item) => ({
            path: item.path,
            "Beat Model": typeof item["Beat Model"] === 'string' ? item["Beat Model"] : undefined
        })),
        options?.beatSystem,
        options?.customBeatSystemName
    );

    return new Set(filteredBeats.map(beat => beat.path));
}

function dedupeAndCollectEligible(items: TimelineItem[], activeBeatPaths?: Set<string>): RippleCandidate[] {
    const byPath = new Map<string, RippleCandidate>();
    items.forEach((item, sourceIndex) => {
        const path = item.path;
        if (!path) return;
        if (item.itemType !== 'Scene' && item.itemType !== 'Beat') return;
        if (item.itemType === 'Beat' && activeBeatPaths && !activeBeatPaths.has(path)) return;
        if (byPath.has(path)) return;
        const actFromNumber = item.actNumber;
        const parsedAct = Number(item.act ?? 1);
        const actNumber = Number.isFinite(actFromNumber as number) && (actFromNumber as number) > 0
            ? (actFromNumber as number)
            : (Number.isFinite(parsedAct) && parsedAct > 0 ? parsedAct : 1);
        byPath.set(path, {
            path,
            itemType: item.itemType,
            basename: extractBasename(path),
            actNumber,
            sourceIndex
        });
    });
    return Array.from(byPath.values());
}

function buildCanonicalOrder(candidates: RippleCandidate[]): RippleCandidate[] {
    const byAct = new Map<number, RippleCandidate[]>();
    for (const candidate of candidates) {
        if (!byAct.has(candidate.actNumber)) byAct.set(candidate.actNumber, []);
        byAct.get(candidate.actNumber)!.push(candidate);
    }

    const orderedActs = Array.from(byAct.keys()).sort((a, b) => a - b);
    const ordered: RippleCandidate[] = [];
    for (const act of orderedActs) {
        const actItems = byAct.get(act) ?? [];
        actItems.sort((a, b) => {
            const aPos = parsePrefixPosition(a.basename);
            const bPos = parsePrefixPosition(b.basename);
            if (aPos !== bPos) {
                if (aPos === null) return 1;
                if (bPos === null) return -1;
                return aPos - bPos;
            }

            const basenameCmp = a.basename.localeCompare(b.basename, undefined, { numeric: true, sensitivity: 'base' });
            if (basenameCmp !== 0) return basenameCmp;

            const pathCmp = a.path.localeCompare(b.path);
            if (pathCmp !== 0) return pathCmp;

            return a.sourceIndex - b.sourceIndex;
        });
        ordered.push(...actItems);
    }
    return ordered;
}

/**
 * Build a targeted manuscript-wide ripple rename plan.
 * Expects input already filtered to the active beat set.
 */
export function buildRippleRenamePlan(items: TimelineItem[], options?: RippleRenamePlanOptions): RippleRenamePlan {
    const activeBeatPaths = getActiveBeatPaths(items, options);
    const candidates = dedupeAndCollectEligible(items, activeBeatPaths);
    const ordered = buildCanonicalOrder(candidates);
    const updates: SceneUpdate[] = [];

    ordered.forEach((entry, idx) => {
        const currentBasename = entry.basename;
        const width = parseIntegerPrefixWidth(currentBasename);
        const newNumber = formatNormalizedPrefix(idx + 1, width);
        const finalBasename = buildRenamedBasename(currentBasename, newNumber);
        if (finalBasename !== currentBasename) {
            updates.push({ path: entry.path, newNumber });
        }
    });

    return {
        updates,
        checked: ordered.length,
        needRename: updates.length
    };
}
