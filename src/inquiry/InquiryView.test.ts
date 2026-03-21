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

    it('persists focused role validation separately from selection mode truth', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes("return findings.some(finding => finding.role === 'target') ? 'ok' : 'missing-target-roles';")).toBe(true);
        expect(source.includes("const roleValidation = this.getResultRoleValidation(result);")).toBe(true);
        expect(source.includes('Warning: Focused run returned no target-specific findings.')).toBe(true);
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

    it('renders degraded focused target markers as amber F states in the minimap source', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const minimapSource = readFileSync(resolve(process.cwd(), 'src/inquiry/minimap/InquiryMinimapRenderer.ts'), 'utf8');
        const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/inquiry.css'), 'utf8');
        expect(viewSource.includes("this.minimap.updateTargetStates(targetSceneIds, { selectionMode, roleValidation });")).toBe(true);
        expect(minimapSource.includes('is-target-role-validation-warning')).toBe(true);
        expect(minimapSource.includes('Incomplete Focused Analysis')).toBe(true);
        expect(cssSource.includes('.ert-inquiry-minimap-tick.is-target.is-target-role-validation-warning')).toBe(true);
    });

    it('suppresses minimap tooltips for cited scenes that open a dossier', () => {
        const minimapSource = readFileSync(resolve(process.cwd(), 'src/inquiry/minimap/InquiryMinimapRenderer.ts'), 'utf8');
        expect(minimapSource.includes("addTooltipData(tick, '', 'bottom');")).toBe(true);
    });

    it('uses a front-loaded balancing bias for dossier anchor text', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const dossierSource = readFileSync(resolve(process.cwd(), 'src/inquiry/render/inquiryDossierRenderer.ts'), 'utf8');
        expect(viewSource.includes('preferFrontLoaded?: boolean;')).toBe(true);
        expect(viewSource.includes('shapePenalty += ((curr - prev) / maxWidth) * 4.2;')).toBe(true);
        expect(dossierSource.includes('{ preferFrontLoaded: true }')).toBe(true);
    });

    it('renders the focused-scene F marker above the corpus page icon', () => {
        const corpusSource = readFileSync(resolve(process.cwd(), 'src/inquiry/corpus/inquiryCorpusStripRenderer.ts'), 'utf8');
        const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/inquiry.css'), 'utf8');
        expect(corpusSource.includes("createSvgText(group, 'ert-inquiry-cc-cell-target-letter', 'F'")).toBe(true);
        expect(corpusSource.includes("slot.targetLetter.setAttribute('y'")).toBe(true);
        expect(cssSource.includes('.ert-inquiry-cc-cell.is-target .ert-inquiry-cc-cell-target-letter')).toBe(true);
    });

    it('uses justify-aware line balancing for dossier body paragraphs', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const dossierSource = readFileSync(resolve(process.cwd(), 'src/inquiry/render/inquiryDossierRenderer.ts'), 'utf8');
        expect(viewSource.includes('minNonFinalFillRatio?: number;')).toBe(true);
        expect(viewSource.includes('(minNonFinalFillRatio - fillRatio) * 6.5')).toBe(true);
        expect(dossierSource.includes('minNonFinalFillRatio: 0.7')).toBe(true);
    });

});
