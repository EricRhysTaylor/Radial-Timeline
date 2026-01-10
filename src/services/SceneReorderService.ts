import { TFile, App, Notice } from 'obsidian';

export interface SceneUpdate {
    path: string;
    newNumber: string;
    actNumber?: number;
    /** New subplot(s) to assign. If provided, replaces existing subplots. */
    subplots?: string[];
}

export async function applySceneNumberUpdates(app: App, updates: SceneUpdate[]): Promise<void> {
    // Two-phase rename to avoid "destination file already exists" conflicts
    // Phase 1: Rename all files to temporary names
    // Phase 2: Rename from temporary to final names
    
    interface RenameOp {
        originalPath: string;
        tempPath: string;
        finalPath: string;
        update: SceneUpdate;
    }
    
    const renameOps: RenameOp[] = [];
    const timestamp = Date.now();
    
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
                // Handle subplot update
                if (update.subplots.length === 1) {
                    fm['Subplot'] = update.subplots[0];
                } else if (update.subplots.length > 1) {
                    fm['Subplot'] = update.subplots;
                }
            }
        });

        // Check if rename is needed
        const currentBasename = file.basename;
        const renamedBase = buildRenamedBasename(currentBasename, update.newNumber);
        if (renamedBase !== currentBasename) {
            const parentPath = file.parent?.path ?? '';
            const prefix = parentPath ? `${parentPath}/` : '';
            const tempBase = `__temp_reorder_${timestamp}_${Math.random().toString(36).slice(2, 8)}_${renamedBase}`;
            const tempPath = `${prefix}${tempBase}.${file.extension}`;
            const finalPath = `${prefix}${renamedBase}.${file.extension}`;
            renameOps.push({ 
                originalPath: file.path, // Store current path after frontmatter update
                tempPath, 
                finalPath, 
                update 
            });
        }
    }
    
    if (renameOps.length === 0) return;
    
    // Track successful phase 1 renames for rollback if needed
    const phase1Complete: Array<{ tempPath: string; originalPath: string }> = [];
    
    try {
        // Phase 1: Rename to temporary names
        for (const op of renameOps) {
            const file = app.vault.getAbstractFileByPath(op.originalPath);
            if (!(file instanceof TFile)) {
                console.warn(`[SceneReorder] File not found for phase 1: ${op.originalPath}`);
                continue;
            }
            await app.fileManager.renameFile(file, op.tempPath);
            phase1Complete.push({ tempPath: op.tempPath, originalPath: op.originalPath });
        }
        
        // Phase 2: Rename from temporary to final names
        for (const op of renameOps) {
            const tempFile = app.vault.getAbstractFileByPath(op.tempPath);
            if (!(tempFile instanceof TFile)) {
                console.warn(`[SceneReorder] Temp file not found for phase 2: ${op.tempPath}`);
                continue;
            }
            await app.fileManager.renameFile(tempFile, op.finalPath);
        }
    } catch (error) {
        console.error('[SceneReorder] Error during rename:', error);
        new Notice(`Scene reorder error: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
        
        // Attempt to clean up any temp files that were created
        for (const completed of phase1Complete) {
            try {
                const tempFile = app.vault.getAbstractFileByPath(completed.tempPath);
                if (tempFile instanceof TFile) {
                    // Try to rename back to a safe name (original without number conflict)
                    const safeBase = tempFile.basename.replace(/^__temp_reorder_\d+_[a-z0-9]+_/, '');
                    const parentPath = tempFile.parent?.path ?? '';
                    const prefix = parentPath ? `${parentPath}/` : '';
                    const safePath = `${prefix}${safeBase}.${tempFile.extension}`;
                    
                    // Check if safe path exists
                    const existing = app.vault.getAbstractFileByPath(safePath);
                    if (!existing) {
                        await app.fileManager.renameFile(tempFile, safePath);
                    }
                }
            } catch (cleanupError) {
                console.error('[SceneReorder] Cleanup error:', cleanupError);
            }
        }
        
        throw error;
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
