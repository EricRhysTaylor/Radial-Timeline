import { TFile, App } from 'obsidian';

export interface SceneUpdate {
    path: string;
    newNumber: string;
    actNumber?: number;
}

export async function applySceneNumberUpdates(app: App, updates: SceneUpdate[]): Promise<void> {
    for (const update of updates) {
        const file = app.vault.getAbstractFileByPath(update.path);
        if (!(file instanceof TFile)) continue;
        await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            if (update.actNumber !== undefined) {
                fm['Act'] = update.actNumber;
            }
        });

        // Always rely on filename prefix for numbering (do not write Title in YAML)
        const currentBasename = file.basename;
        const renamedBase = buildRenamedBasename(currentBasename, update.newNumber);
        if (renamedBase !== currentBasename) {
            const parentPath = file.parent?.path ?? '';
            const newPath = parentPath ? `${parentPath}/${renamedBase}.${file.extension}` : `${renamedBase}.${file.extension}`;
            await app.fileManager.renameFile(file, newPath);
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
