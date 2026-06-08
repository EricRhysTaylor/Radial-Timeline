const BOOK_MANAGER_AUTOLOAD_KEY = 'rt-book-manager-autoload-highlight';
const AUTOLOAD_HIGHLIGHT_TTL_MS = 2 * 60 * 1000;

interface AutoloadHighlightPayload {
    bookId: string;
    createdAt: number;
}

export function markBookManagerAutoloadHighlight(bookId: string): void {
    if (!bookId) return;
    try {
        window.sessionStorage.setItem(
            BOOK_MANAGER_AUTOLOAD_KEY,
            JSON.stringify({ bookId, createdAt: Date.now() } satisfies AutoloadHighlightPayload)
        );
    } catch {
        // Session storage can be unavailable in restricted webviews; the
        // autoload itself is already persisted, so the visual hint is optional.
    }
}

export function consumeBookManagerAutoloadHighlight(): string | null {
    try {
        const raw = window.sessionStorage.getItem(BOOK_MANAGER_AUTOLOAD_KEY);
        if (!raw) return null;
        window.sessionStorage.removeItem(BOOK_MANAGER_AUTOLOAD_KEY);
        const payload = JSON.parse(raw) as Partial<AutoloadHighlightPayload>;
        const bookId = typeof payload.bookId === 'string' ? payload.bookId.trim() : '';
        const createdAt = typeof payload.createdAt === 'number' ? payload.createdAt : 0;
        if (!bookId || Date.now() - createdAt > AUTOLOAD_HIGHLIGHT_TTL_MS) return null;
        return bookId;
    } catch {
        return null;
    }
}
