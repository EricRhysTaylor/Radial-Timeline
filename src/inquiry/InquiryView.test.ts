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

    it('routes question execution through the dual-form resolver without adding new UI sets', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('resolveQuestionPromptForRun(question, selectionMode')).toBe(true);
        expect(viewSource.includes('resolveQuestionPromptFormForRun(question, selectionMode')).toBe(true);
        expect(viewSource.includes("{ label: 'Auto', value: 'auto' }")).toBe(true);
        expect(viewSource.includes("{ label: 'Standard', value: 'standard' }")).toBe(true);
        expect(viewSource.includes("{ label: 'Focused', value: 'focused' }")).toBe(true);
        expect(viewSource.includes('this.setPromptFormOverride(question.id, opt.value)')).toBe(true);
        expect(viewSource.includes('standardPrompt:')).toBe(true);
        expect(viewSource.includes('focusedPrompt:')).toBe(true);
        expect(viewSource.includes('Focus question panel')).toBe(false);
    });

    it('persists executed prompt truth on results instead of rebuilding it from current config', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const runnerSource = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(viewSource.includes("questionText: result.questionText?.trim() || this.getQuestionTextById(result.questionId) || undefined")).toBe(true);
        expect(viewSource.includes("const questionTextRaw = result.questionText?.trim() || this.getQuestionTextById(result.questionId)")).toBe(true);
        expect(runnerSource.includes('questionPromptForm: input.questionPromptForm')).toBe(true);
        expect(runnerSource.includes('questionText: input.questionText')).toBe(true);
    });

    it('offers a corpus-level cancel all targeting action in the global corpus context menu', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const corpusSource = readFileSync(resolve(process.cwd(), 'src/inquiry/corpus/inquiryCorpusStripRenderer.ts'), 'utf8');
        expect(viewSource.includes("item.setTitle('Cancel all targeting')")).toBe(true);
        expect(viewSource.includes("this.notifyInteraction('Cleared all Target Scenes.')")).toBe(true);
        expect(corpusSource.includes('onGlobalContextMenu')).toBe(true);
        expect(corpusSource.includes('args.onGlobalContextMenu(event)')).toBe(true);
    });

    it('starts Inquiry in a fresh launch mode instead of auto-rehydrating cached state', () => {
        const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(mainSource.includes('public inquiryFreshLaunchPending = true;')).toBe(true);
        expect(mainSource.includes('public consumeInquiryFreshLaunchPending(): boolean')).toBe(true);
        expect(viewSource.includes('this.startupFreshMode = this.plugin.consumeInquiryFreshLaunchPending();')).toBe(true);
        expect(viewSource.includes('this.loadTargetCache({ adoptPersistedSelection: !this.startupFreshMode });')).toBe(true);
        expect(viewSource.includes('if (this.startupFreshMode) {\n            return undefined;\n        }')).toBe(true);
    });

    it('uses a dated welcome label and suppresses persisted target focus until the user acts', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('Welcome to Inquiry. ${weekday} ${month} ${day}.')).toBe(true);
        expect(viewSource.includes("this.setTextIfChanged(this.navSessionLabel, this.buildWelcomeNavLabel(), 'hudTextWrites');")).toBe(true);
        expect(viewSource.includes("this.state.targetSceneIds = this.getVisibleTargetSceneIdsForBook(book.id);")).toBe(true);
        expect(viewSource.includes('...this.getVisibleTargetSceneIdsForBook(bookId),')).toBe(true);
    });

});
