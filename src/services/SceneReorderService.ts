import { TFile, App } from 'obsidian';

export interface SceneUpdate {
    path: string;
    newNumber: string;
    actNumber?: number;
    /** New subplot(s) to assign. If provided, replaces existing subplots. */
    subplots?: string[];
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
        
        // Update frontmatter (Act number and Subplot)
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
