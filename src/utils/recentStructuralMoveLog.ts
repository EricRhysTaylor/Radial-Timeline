import { normalizePath, TFile, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { ensureAiOutputFolder } from './aiOutput';
import { openOrRevealFile } from './fileUtils';
import { getActiveBook, getActiveBookExportContext, getActiveBookTitle } from './books';
import { getActiveRecentStructuralMoves } from './recentStructuralMoves';

const MOVE_HISTORY_FOLDER = 'Move History';

async function ensureFolder(plugin: RadialTimelinePlugin, folderPath: string): Promise<TFolder | null> {
    const existing = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (existing && !(existing instanceof TFolder)) return null;
    try {
        await plugin.app.vault.createFolder(folderPath);
    } catch {
        // Folder may already exist.
    }
    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    return folder instanceof TFolder ? folder : null;
}

function formatBoolean(value: boolean | undefined): string {
    return value ? 'Yes' : 'No';
}

function buildMoveHistoryMarkdown(plugin: RadialTimelinePlugin): string {
    const activeBook = getActiveBook(plugin.settings);
    const bookTitle = getActiveBookTitle(plugin.settings);
    const entries = getActiveRecentStructuralMoves(plugin.settings);
    const generatedAt = new Date().toISOString();

    const lines: string[] = [
        `# Note move history — ${bookTitle}`,
        '',
        `- Generated: ${generatedAt}`,
        `- Book ID: ${activeBook?.id ?? 'unknown'}`,
        `- Source folder: ${activeBook?.sourceFolder ?? ''}`,
        `- Stored entries: ${entries.length}`,
        ''
    ];

    if (entries.length === 0) {
        lines.push('No note move history is currently stored for this book.', '');
        return lines.join('\n');
    }

    entries.forEach((entry, index) => {
        lines.push(`## ${index + 1}. ${entry.summary}`);
        lines.push(`- Timestamp: ${entry.timestamp}`);
        lines.push(`- Item type: ${entry.itemType}`);
        lines.push(`- Item label: ${entry.itemLabel}`);
        lines.push(`- Stable ID: ${entry.itemId}`);
        lines.push(`- Source context: ${entry.sourceContext ?? '—'}`);
        lines.push(`- Destination context: ${entry.destinationContext ?? '—'}`);
        lines.push(`- Rename impact: ${entry.renameCount ?? 0} note${(entry.renameCount ?? 0) === 1 ? '' : 's'}`);
        lines.push(`- Crossed Acts: ${formatBoolean(entry.crossedActs)}`);
        lines.push(`- Ripple rename: ${formatBoolean(entry.rippleRename)}`);
        lines.push('');
    });

    return lines.join('\n');
}

export async function openStructuralMoveHistoryLog(plugin: RadialTimelinePlugin): Promise<void> {
    const baseFolder = await ensureAiOutputFolder(plugin);
    const moveHistoryFolder = normalizePath(`${baseFolder}/${MOVE_HISTORY_FOLDER}`);
    const folder = await ensureFolder(plugin, moveHistoryFolder);
    if (!folder) {
        throw new Error(`Unable to prepare move history folder: ${moveHistoryFolder}`);
    }

    const { fileStem } = getActiveBookExportContext(plugin.settings);
    const logPath = normalizePath(`${moveHistoryFolder}/${fileStem}-note-move-history.md`);
    const content = buildMoveHistoryMarkdown(plugin);

    const existing = plugin.app.vault.getAbstractFileByPath(logPath);
    let file: TFile;
    if (existing instanceof TFile) {
        await plugin.app.vault.modify(existing, content);
        file = existing;
    } else {
        file = await plugin.app.vault.create(logPath, content);
    }

    await openOrRevealFile(plugin.app, file, false);
}
