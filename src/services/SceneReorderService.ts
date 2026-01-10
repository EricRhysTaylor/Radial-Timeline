import { TFile, App } from 'obsidian';

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
    
    const renameOps: Array<{ file: TFile; tempPath: string; finalPath: string; update: SceneUpdate }> = [];
    
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
            const tempBase = `__temp_reorder_${Date.now()}_${Math.random().toString(36).slice(2)}_${renamedBase}`;
            const tempPath = `${prefix}${tempBase}.${file.extension}`;
            const finalPath = `${prefix}${renamedBase}.${file.extension}`;
            renameOps.push({ file, tempPath, finalPath, update });
        }
    }
    
    // Phase 1: Rename to temporary names
    for (const op of renameOps) {
        // Re-fetch file in case path changed from frontmatter update
        const currentFile = app.vault.getAbstractFileByPath(op.update.path);
        if (currentFile instanceof TFile) {
            await app.fileManager.renameFile(currentFile, op.tempPath);
        }
    }
    
    // Phase 2: Rename from temporary to final names
    for (const op of renameOps) {
        const tempFile = app.vault.getAbstractFileByPath(op.tempPath);
        if (tempFile instanceof TFile) {
            await app.fileManager.renameFile(tempFile, op.finalPath);
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
