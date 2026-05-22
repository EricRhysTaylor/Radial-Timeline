/** Inner tab selection. Shared by loaded system tabs and the library surface. */
export type InnerStage = 'preview' | 'design' | 'fields' | 'library';

/**
 * Reactive dirty-state store for loaded beat sets (starter or saved).
 *
 * Why reactive? The beats UI has multiple independent render zones (Design
 * header and library panel) that must stay in sync when the dirty flag changes.
 * A centralized notify() eliminates the fragile callback-threading pattern
 * where each zone held a closure over stale DOM elements.
 *
 * Each render zone subscribes when it mounts and unsubscribes when its
 * container is emptied, so there are never stale listeners.
 */
export const dirtyState = {
    baselineId: '' as string,
    baselineHash: '' as string,
    _listeners: new Set<() => void>(),

    /** Capture the current snapshot as the "clean" baseline for a loaded set. */
    setBaseline(id: string, hash: string) {
        this.baselineId = id;
        this.baselineHash = hash;
        this.notify();
    },

    /** Clear baseline (switching to a fresh/unsaved system). */
    clearBaseline() {
        this.baselineId = '';
        this.baselineHash = '';
        this.notify();
    },

    /** True when a loaded set is active and its current state differs from baseline. */
    isDirty(currentId: string, currentHash: string): boolean {
        if (!this.baselineId) return false;
        if (currentId !== this.baselineId) return false;
        return currentHash !== this.baselineHash;
    },

    /** Register a listener; returns an unsubscribe function. */
    subscribe(fn: () => void): () => void {
        this._listeners.add(fn);
        return () => { this._listeners.delete(fn); };
    },

    /** Notify all subscribers that dirty state may have changed. */
    notify() {
        this._listeners.forEach((fn: () => void) => fn());
    }
};
