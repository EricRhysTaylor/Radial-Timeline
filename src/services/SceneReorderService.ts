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
            const rawTitle = typeof fm['Title'] === 'string' ? (fm['Title'] as string) : file.basename;
            const numericPrefixMatch = rawTitle.match(/^\s*\d+(?:\.\d+)?\s+(.*)$/);
            if (numericPrefixMatch) {
                const cleanTitle = numericPrefixMatch[1]?.trim() ?? '';
                fm['Title'] = `${update.newNumber} ${cleanTitle}`.trim();
            } else {
                fm['Title'] = `${update.newNumber} ${rawTitle}`.trim();
            }
        });
    }
}
