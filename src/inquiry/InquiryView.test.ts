import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('InquiryView payload accounting', () => {
    it('uses cleaned body content instead of raw file size for full-text estimates', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes('cleanEvidenceBody(raw).length')).toBe(true);
        expect(source.includes('file.stat.size')).toBe(false);
        expect(source.includes('cachedRead(file)')).toBe(true);
    });

    it('renders selection mode from persisted result metadata instead of inferring from finding roles', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes("selectionMode: result.selectionMode === 'focused' ? 'focused' : 'discover'")).toBe(true);
        expect(source.includes('const selectionMode = this.getResultSelectionMode(result);')).toBe(true);
        expect(source.includes("result.findings.some(finding => this.getFindingRole(finding) === 'target')")).toBe(false);
    });

    it('matches latest saved inquiry seeds on book scope and normalized target selection', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes('const activeTargetKey = this.getTargetSceneKey(this.getActiveTargetSceneIds());')).toBe(true);
        expect(source.includes('return this.getTargetSceneKey(session.targetSceneIds) === activeTargetKey;')).toBe(true);
        expect(source.includes('latest saved inquiry for this selection')).toBe(true);
    });

    it('makes saga-scope minimap target authoring explicit instead of silently returning', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes("this.notifyInteraction('Target Scenes are available only in Book scope.')")).toBe(true);
    });
});
