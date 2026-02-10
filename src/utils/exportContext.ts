/*
 * Active Book Export Context
 *
 * Adapter used by the export pipeline.
 * Delegates to the Book Profiles system (source of truth).
 */

import type RadialTimelinePlugin from '../main';
import { getActiveBookExportContext as getActiveBookExportContextFromBooks } from './books';

export interface BookExportContext {
    sourceFolder: string;  // e.g. "Book 1 Shail + Trisan"
    title: string;         // display title, e.g. "Book 1 Shail + Trisan"
    fileStem: string;      // safe filename stem, e.g. "Book-1-Shail-Trisan"
}

/**
 * Return the active book's export identity.
 * Delegates to the Book Profiles system (source of truth).
 */
export function getActiveBookExportContext(plugin: RadialTimelinePlugin): BookExportContext {
    return getActiveBookExportContextFromBooks(plugin.settings);
}
