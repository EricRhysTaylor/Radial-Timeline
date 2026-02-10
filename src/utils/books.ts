/*
 * Book profile helpers
 */
import type { RadialTimelineSettings } from '../types/settings';
import type { BookProfile } from '../types/settings';

export const DEFAULT_BOOK_TITLE = 'Untitled Manuscript';

export function createBookId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `book_${ts}_${rand}`;
}

export function deriveBookTitleFromSourcePath(sourcePath: string | undefined | null): string | null {
  const trimmed = (sourcePath || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/').filter(p => p.length > 0);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

export function normalizeBookProfile(profile: BookProfile): BookProfile {
  const title = profile.title?.trim() || DEFAULT_BOOK_TITLE;
  const sourceFolder = (profile.sourceFolder || '').trim();
  const fileStem = profile.fileStem?.trim();
  return {
    id: profile.id || createBookId(),
    title,
    sourceFolder,
    fileStem: fileStem && fileStem.length > 0 ? fileStem : undefined
  };
}

export function getActiveBook(settings: RadialTimelineSettings): BookProfile | null {
  const books = settings.books || [];
  if (!books.length) return null;
  const active = settings.activeBookId
    ? books.find(b => b.id === settings.activeBookId)
    : undefined;
  return active || books[0] || null;
}

export function getActiveBookTitle(settings: RadialTimelineSettings, fallback = DEFAULT_BOOK_TITLE): string {
  const active = getActiveBook(settings);
  const title = active?.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

export function getActiveBookSourceFolder(settings: RadialTimelineSettings): string {
  const active = getActiveBook(settings);
  return (active?.sourceFolder || '').trim();
}

export function getActiveBookExportContext(settings: RadialTimelineSettings): { sourceFolder: string; title: string; fileStem: string } {
  const title = getActiveBookTitle(settings, DEFAULT_BOOK_TITLE);
  const sourceFolder = getActiveBookSourceFolder(settings);
  const active = getActiveBook(settings);
  const fileStem = (active?.fileStem && active.fileStem.trim().length > 0)
    ? active.fileStem.trim()
    : slugifyToFileStem(title);
  return { sourceFolder, title, fileStem };
}

function slugifyToFileStem(title: string): string {
  return title
    .replace(/[/\\:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    || 'Manuscript';
}
