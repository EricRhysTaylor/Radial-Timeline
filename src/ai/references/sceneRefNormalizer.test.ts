import { describe, expect, it } from 'vitest';
import { buildSceneRefIndex, isStableSceneId, normalizeSceneRef } from './sceneRefNormalizer';

describe('sceneRefNormalizer', () => {
    const index = buildSceneRefIndex([
        { sceneId: 'scn_a1b2c3d4', path: 'Book 1/01.md', label: 'S1' },
        { sceneId: 'scn_b2c3d4e5', path: 'Book 1/02.md', label: 'S2' }
    ]);

    it('recognizes stable scene IDs', () => {
        expect(isStableSceneId('scn_a1b2c3d4')).toBe(true);
        expect(isStableSceneId('Book 1/01.md')).toBe(false);
    });

    it('normalizes legacy path references to sceneId', () => {
        const normalized = normalizeSceneRef({ ref_id: 'Book 1/01.md' }, index);
        expect(normalized.ref.ref_id).toBe('scn_a1b2c3d4');
        expect(normalized.normalizedFromLegacy).toBe(true);
        expect(normalized.warning).toBeTruthy();
    });

    it('preserves existing stable sceneId values', () => {
        const normalized = normalizeSceneRef({ ref_id: 'scn_b2c3d4e5' }, index);
        expect(normalized.ref.ref_id).toBe('scn_b2c3d4e5');
        expect(normalized.normalizedFromLegacy).toBe(false);
        expect(normalized.warning).toBeUndefined();
    });

    it('falls back to provided sceneId when unresolved', () => {
        const normalized = normalizeSceneRef({ ref_id: 'Unknown Scene' }, index, { fallbackRefId: 'scn_a1b2c3d4' });
        expect(normalized.ref.ref_id).toBe('scn_a1b2c3d4');
        expect(normalized.normalizedFromLegacy).toBe(true);
        expect(normalized.warning).toContain('fallback');
    });
});
