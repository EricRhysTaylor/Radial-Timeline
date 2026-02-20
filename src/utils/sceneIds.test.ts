import { describe, expect, it } from 'vitest';
import {
    ensureSceneIdFrontmatter,
    ensureSceneTemplateFrontmatter,
    generateSceneId,
    resolveSceneReferenceId
} from './sceneIds';

describe('sceneIds', () => {
    it('adds a stable scene id when frontmatter is missing one', () => {
        const result = ensureSceneIdFrontmatter({
            Class: 'Scene',
            Summary: 'Existing summary'
        });

        expect(result.sceneId).toMatch(/^scn_[0-9a-f]{8,10}$/);
        expect(result.frontmatter.id).toBe(result.sceneId);
        expect(result.frontmatter.Class).toBe('Scene');
    });

    it('preserves an existing scene id value', () => {
        const result = ensureSceneIdFrontmatter({
            id: 'scn_deadbeef',
            Class: 'Scene',
            Summary: 'Keep me'
        });

        expect(result.sceneId).toBe('scn_deadbeef');
        expect(result.frontmatter.id).toBe('scn_deadbeef');
    });

    it('keeps scene identity stable across rename/reorder by preferring sceneId over path', () => {
        const sceneId = generateSceneId();
        const oldPath = 'Book 1/12 Scene.md';
        const renamedPath = 'Book 1/34 Scene Renamed.md';

        expect(resolveSceneReferenceId(sceneId, oldPath)).toBe(sceneId);
        expect(resolveSceneReferenceId(sceneId, renamedPath)).toBe(sceneId);
    });

    it('puts id above class in generated scene template frontmatter', () => {
        const template = [
            'Class: Scene',
            'When: {{When}}',
            'Summary:'
        ].join('\n');
        const result = ensureSceneTemplateFrontmatter(template);
        const lines = result.frontmatter.split('\n');

        expect(lines[0]).toMatch(/^id:\s+scn_[0-9a-f]{8,10}$/);
        expect(lines[1]).toBe('Class: Scene');
    });
});
