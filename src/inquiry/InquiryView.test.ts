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
        const enLocale = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en.ts'), 'utf8');
        expect(source.includes("return findings.some(finding => finding.role === 'target') ? 'ok' : 'missing-target-roles';")).toBe(true);
        expect(source.includes("const roleValidation = this.getResultRoleValidation(result);")).toBe(true);
        // The validation copy lives in the i18n catalog now.
        expect(source.includes("t('inquiry.findings.validationMissingTargetRoles')")).toBe(true);
        expect(enLocale.includes('Warning: Focused run returned no target-specific findings.')).toBe(true);
    });

    it('matches latest saved inquiry seeds on book scope and normalized target selection', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes('const activeTargetKey = this.getTargetSceneKey(this.getActiveTargetSceneIds());')).toBe(true);
        expect(source.includes('return this.getTargetSceneKey(session.targetSceneIds) === activeTargetKey;')).toBe(true);
        expect(source.includes('latest saved inquiry for this selection')).toBe(true);
    });

    it('makes saga-scope minimap target authoring explicit instead of silently returning', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(source.includes("this.notifyInteraction(t('inquiry.interaction.targetScenesBookOnly'))")).toBe(true);
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
        // Labels are now sourced from the i18n catalog.
        expect(viewSource.includes("{ label: t('inquiry.menu.optionDefaultRun'), value: 'auto' }")).toBe(true);
        expect(viewSource.includes("{ label: t('inquiry.menu.optionStandard'), value: 'standard' }")).toBe(true);
        expect(viewSource.includes("{ label: t('inquiry.menu.optionFocused'), value: 'focused' }")).toBe(true);
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
        // Menu titles flow through the i18n catalog now.
        expect(viewSource.includes("item.setTitle(t('inquiry.menu.cancelTargeting'))")).toBe(true);
        expect(viewSource.includes("this.notifyInteraction(t('inquiry.interaction.clearedAllTargetScenes'))")).toBe(true);
        expect(corpusSource.includes('onGlobalContextMenu')).toBe(true);
        expect(corpusSource.includes('args.onGlobalContextMenu(event)')).toBe(true);
    });

    it('starts Inquiry in a fresh launch mode instead of auto-rehydrating cached state', () => {
        const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(mainSource.includes('public inquiryFreshLaunchPending = true;')).toBe(true);
        expect(mainSource.includes('public consumeInquiryFreshLaunchPending(): boolean')).toBe(true);
        expect(viewSource.includes('const freshLaunchPending = this.plugin.consumeInquiryFreshLaunchPending();')).toBe(true);
        expect(viewSource.includes("if (!this.state.isRunning) {\n            this.clearRehydrateState();\n            this.clearActiveResultState();\n            this.clearResultPreview();\n            this.unlockPromptPreview();\n            this.setApiStatus('idle');\n        }")).toBe(true);
        expect(viewSource.includes("this.startupFreshMode = freshLaunchPending || !this.state.isRunning;")).toBe(true);
        expect(viewSource.includes('this.loadTargetCache({ adoptPersistedSelection: !this.startupFreshMode });')).toBe(true);
        expect(viewSource.includes('if (this.startupFreshMode) {\n            return undefined;\n        }')).toBe(true);
    });

    it('uses a dated welcome label and suppresses persisted target focus until the user acts', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const enLocale = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en.ts'), 'utf8');
        // Welcome label string lives in i18n catalog and is composed via t() at render time.
        expect(enLocale.includes('Welcome to Inquiry. {{weekday}} {{month}} {{day}}{{ordinal}}.')).toBe(true);
        expect(viewSource.includes("t('inquiry.nav.welcome'")).toBe(true);
        expect(viewSource.includes("this.setTextIfChanged(this.navSessionLabel, this.buildWelcomeNavLabel(), 'hudTextWrites');")).toBe(true);
        expect(viewSource.includes("this.state.targetSceneIds = this.getVisibleTargetSceneIdsForBook(book.id);")).toBe(true);
        expect(viewSource.includes('...this.getVisibleTargetSceneIdsForBook(bookId),')).toBe(true);
    });

    it('uses a single plus for predicted multi-pass and lets CSS own the token-cap endcap fill', () => {
        const readinessSource = readFileSync(resolve(process.cwd(), 'src/inquiry/services/readiness.ts'), 'utf8');
        const minimapSource = readFileSync(resolve(process.cwd(), 'src/inquiry/minimap/InquiryMinimapRenderer.ts'), 'utf8');
        expect(readinessSource.includes("marks: '+'")).toBe(true);
        expect(readinessSource.includes('const visibleCount = 1;')).toBe(true);
        // Endcap fill is now driven by CSS (over-capacity / warning-capacity
        // classes + the [data-reuse-state] cache-armed rule). The renderer
        // must NOT set an inline `fill` on the endcaps — inline styles beat
        // class selectors and would freeze the endcap color regardless of
        // capacity / cache state. Renderer should explicitly remove any
        // previous inline fill so the CSS chain wins.
        expect(minimapSource.includes("this.minimapTokenCapStartCap?.style.removeProperty('fill');")).toBe(true);
        expect(minimapSource.includes("this.minimapTokenCapEndCap?.style.removeProperty('fill');")).toBe(true);
        expect(minimapSource.includes("this.minimapTokenCapStartCap?.style.setProperty('fill'")).toBe(false);
        expect(minimapSource.includes("this.minimapTokenCapEndCap?.style.setProperty('fill'")).toBe(false);
    });

    it('turns clear recent sessions into a full Inquiry reset and mutes the button once empty', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/inquiry.css'), 'utf8');
        expect(viewSource.includes('const canClear = this.sessionStore.getSessionCount() > 0;')).toBe(true);
        expect(viewSource.includes("this.briefingClearButton.classList.toggle('is-inert', !canClear);")).toBe(true);
        expect(viewSource.includes('this.resetInquiryToFreshBaseState({ clearPersistedTargets: true });')).toBe(true);
        expect(viewSource.includes("this.refreshUI({ reason: 'recent sessions cleared' });")).toBe(true);
        expect(viewSource.includes('this.plugin.settings.inquiryTargetCache = {\n            lastBookId: undefined,\n            lastTargetSceneIdsByBookId: {}\n        };')).toBe(true);
        expect(viewSource.includes('this.startupFreshMode = true;')).toBe(true);
        expect(cssSource.includes('.ert-inquiry-briefing-clear.is-inert')).toBe(true);
    });

    it('returns to fresh glyph stubs when dismissing rehydrated results or errors', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('private dismissResults(): void {')).toBe(true);
        expect(viewSource.includes('private dismissError(): void {')).toBe(true);
        expect(viewSource.includes("this.startupFreshMode = true;\n        this.freshModeTouchedBookIds.clear();\n        this.refreshUI({ skipCorpus: true });")).toBe(true);
    });

    it('uses the canonical active book id for estimate snapshots and payload stats', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('const activeBookId = this.getCanonicalActiveBookId();')).toBe(true);
        expect(viewSource.includes('activeBookId,\n            targetSceneIds,')).toBe(true);
        expect(viewSource.includes('const activeBookId = this.getCanonicalActiveBookId();\n        if (!this.payloadStats')).toBe(true);
    });

    it('keeps context reuse HUD tied to the current engine instead of hydrated result state', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('private getLatestCacheSessionForResolvedEngine(): InquirySession | null {')).toBe(true);
        expect(viewSource.includes("return 'Cache expired';")).toBe(true);
        expect(viewSource.includes("const hasLiveContextCountdown = !this.state.isRunning && !!this.getActiveCacheWindowExpiry();")).toBe(true);
        expect(viewSource.includes('this.reconcileEngineTimerInterval(hasLiveContextCountdown);')).toBe(true);
    });

    it('self-heals stale pending-edits flags and aligns brief actions with writeback suggestions', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('const prior = session.pendingEditsEmpty;')).toBe(true);
        expect(viewSource.includes('if (session.key && prior !== pendingEditsEmpty) {')).toBe(true);
        expect(viewSource.includes('private buildBriefPendingActions(')).toBe(true);
        expect(viewSource.includes('const pendingActions = this.buildBriefPendingActions(result, items, referenceLabels);')).toBe(true);
    });

    it('prefers the strongest live warm-cache metrics over stale persisted reuse data', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('private getLiveReuseAdvancedContext(): AIRunAdvancedContext | null {')).toBe(true);
        expect(viewSource.includes('private scoreReuseAdvancedContext(context: AIRunAdvancedContext | null): number {')).toBe(true);
        expect(viewSource.includes('return this.scoreReuseAdvancedContext(live) > this.scoreReuseAdvancedContext(persisted)')).toBe(true);
    });

    it('defines a visibly tinted cached-overlay hatch for the minimap token bar', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/inquiry.css'), 'utf8');
        expect(viewSource.includes("hatchBg.classList.add('ert-inquiry-minimap-cached-hatch-bg');")).toBe(true);
        expect(viewSource.includes('hatchLineSecondary')).toBe(true);
        expect(cssSource.includes('.ert-inquiry-minimap-tokencap-cached')).toBe(true);
        expect(viewSource.includes("cachedPattern.setAttribute('id', 'ert-inquiry-minimap-cached-hatch');")).toBe(true);
        expect(cssSource.includes('fill: color-mix(in srgb, var(--ert-inquiry-ai-success) 92%, #dfffe7 8%);')).toBe(true);
    });

    it('repaints the minimap cache overlay when a persisted provider cache certificate appears', () => {
        const minimapSource = readFileSync(resolve(process.cwd(), 'src/inquiry/minimap/InquiryMinimapRenderer.ts'), 'utf8');
        expect(minimapSource.includes('private lastTokenCapFillRatio = 0;')).toBe(true);
        expect(minimapSource.includes('this.lastTokenCapFillRatio = fillRatio;')).toBe(true);
        expect(minimapSource.includes('this.updateTokenCapCachedOverlay(this.lastTokenCapFillRatio, advanced);')).toBe(true);
    });

    it('does not describe hard Inquiry failures as fallback results', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('Inquiry failed before results were produced.')).toBe(true);
        expect(viewSource.includes('Inquiry failed; fallback result returned.')).toBe(false);
    });

    it('renders the warm cache HUD countdown as a green flame icon plus timer text', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const domSource = readFileSync(resolve(process.cwd(), 'src/inquiry/dom/inquiryDomFactory.ts'), 'utf8');
        const cssSource = readFileSync(resolve(process.cwd(), 'src/styles/inquiry.css'), 'utf8');
        expect(viewSource.includes("'flame-kindling'")).toBe(true);
        expect(viewSource.includes("return `${this.formatCacheCountdown(remainingMs)} remaining`;")).toBe(true);
        expect(domSource.includes("engineTimerIcon.setAttribute('href', '#ert-icon-flame-kindling');")).toBe(true);
        expect(domSource.includes("engineTimerIcon.setAttribute('width', '34');")).toBe(true);
        expect(cssSource.includes('font-size: 18px;')).toBe(true);
        expect(cssSource.includes('.ert-inquiry-engine-timer-icon.is-context-warm')).toBe(true);
    });

    it('spells briefing writeback targets from the computed pending-edits plan', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const rendererSource = readFileSync(resolve(process.cwd(), 'src/inquiry/briefing/inquiryBriefingRenderer.ts'), 'utf8');
        expect(viewSource.includes('private buildInquiryPendingEditsPlan(')).toBe(true);
        expect(viewSource.includes('pendingEditsTooltip')).toBe(true);
        expect(viewSource.includes("return `Write to Pending Edits: ${labels.join(', ')}`;")).toBe(true);
        expect(viewSource.includes("return `Pending Edits updated for ${labels.join(', ')}.`;")).toBe(true);
        expect(viewSource.includes("this.formatPendingEditsSuccessMessage(pendingPlan.targetLabels).replace(/\\.$/, '')")).toBe(true);
        expect(rendererSource.includes('pendingEditsTooltip?: string;')).toBe(true);
        expect(rendererSource.includes('const pendingLabel = args.pendingEditsTooltip ||')).toBe(true);
    });

    it('keeps scene-targeted pending edits on their resolved scene and preserves multiple notes per scene', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('if (filePath) {\n                addNote(filePath, note);\n                return;\n            }')).toBe(true);
        expect(viewSource.includes('const outlinePath = this.resolveInquiryOutlinePathForFinding(result, finding, activeBookId);')).toBe(true);
        expect(viewSource.includes('private resolveSagaOutlinePath(): string | null')).toBe(true);
        expect(viewSource.includes('const handledScenes = new Set<string>();')).toBe(false);
    });

    it('preserves saga book anchors through legacy result normalization', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes("if (scope === 'saga') {")).toBe(true);
        expect(viewSource.includes("/^book_[a-z0-9][a-z0-9_-]{1,80}$/i.test(trimmed)")).toBe(true);
        expect(viewSource.includes('book.sceneId?.toLowerCase() === lower')).toBe(true);
    });

    it('keeps saga book anchor mtimes stable so estimate fingerprints can settle', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('Book rows are Saga minimap anchors, not evidence-bearing files.')).toBe(true);
        expect(viewSource.includes('mtime: 0,\n                    class: \'book\'')).toBe(true);
    });

    it('keeps synthetic saga book anchors out of the visible corpus strip', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes("const referenceEntries = manifest.entries.filter(entry => entry.class !== 'scene' && entry.class !== 'outline' && entry.class !== 'book');")).toBe(true);
    });

    it('uses explicit OpenAI quota-exceeded copy for provider quota failures', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes("reason === 'quota_exceeded') return 'OpenAI API quota exceeded.'")).toBe(true);
        expect(viewSource.includes('Your OpenAI API account has run out of quota, credits, or billing allowance.')).toBe(true);
        expect(viewSource.includes('ChatGPT subscription quota is separate from API billing.')).toBe(true);
    });

    it('passes actual usage-based cost into the engine popover recent-run snapshot', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('actualCostUSD: this.getActualUsageCostForResult(result)')).toBe(true);
        expect(viewSource.includes('private getActualUsageCostForResult(result: InquiryResult): number | undefined')).toBe(true);
        expect(viewSource.includes('estimateUsageCost(provider, modelId, result.tokenUsage)')).toBe(true);
    });

    it('forces the AI settings tab after Obsidian opens the plugin settings pane', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes("this.plugin.settingsTab.setActiveTab('ai');\n            }\n            const uniqueTargets")).toBe(true);
    });

    it('re-arms matching sessions for fresh pending-edits writeback after a purge', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const storeSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquirySessionStore.ts'), 'utf8');
        expect(viewSource.includes('this.sessionStore.clearPendingEditsAppliedFlags({')).toBe(true);
        expect(viewSource.includes("statuses: ['saved', 'unsaved']")).toBe(true);
        expect(viewSource.includes('Re-armed')).toBe(true);
        expect(storeSource.includes('clearPendingEditsAppliedFlags(options?: {')).toBe(true);
        expect(storeSource.includes("session.pendingEditsApplied = false;")).toBe(true);
    });

    it('keeps session history visible across Inquiry and Settings before debounced disk save', () => {
        const storeSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquirySessionStore.ts'), 'utf8');
        expect(storeSource.includes('getLatestSessionForEngineInScope(provider: string, modelId: string, scope: InquiryScope)')).toBe(true);
        expect(storeSource.includes('this.plugin.settings.inquirySessionCache = this.cache;\n        if (this.saveTimeout)')).toBe(true);
    });

    it('self-heals stale applied writeback flags by checking current pending-edits markers before disabling the session action', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('const pendingEditsApplied = this.syncPendingEditsAppliedState(session, pendingPlan.notesByMaterial);')).toBe(true);
        expect(viewSource.includes('if (this.syncPendingEditsAppliedState(session)) {')).toBe(true);
        expect(viewSource.includes('private hasPendingEditsMarkerForSession(')).toBe(true);
        expect(viewSource.includes('normalizeInquiryLinkLine(line)')).toBe(true);
        expect(viewSource.includes("this.sessionStore.updateSession(session.key, { pendingEditsApplied: false });")).toBe(true);
    });

    it('routes timing prediction through inquiryTimingPrediction (cache-poison guard, mode-keyed history, blended prediction)', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        // Pure module is imported and used — no more inline EWMA math in InquiryView.
        expect(viewSource.includes("from './services/inquiryTimingPrediction'")).toBe(true);
        expect(viewSource.includes('computeSampleRate({')).toBe(true);
        expect(viewSource.includes('blendSampleRate({')).toBe(true);
        expect(viewSource.includes('predictTimingFromEntry(entry, estimatedInputTokens)')).toBe(true);
        // Mode is part of the history key.
        expect(viewSource.includes('this.getCurrentEvidenceModeKey()')).toBe(true);
        expect(viewSource.includes('computeTimingHistoryKey(provider, model, mode)')).toBe(true);
        // The discredited preferLatestSample shortcut is gone for good.
        expect(viewSource.includes('const preferLatestSample = true;')).toBe(false);
        expect(viewSource.includes('options?: { preferLatestSample?: boolean }')).toBe(false);
        // The HUD still refreshes after a sample is recorded.
        expect(viewSource.includes('this.refreshEstimateDisplays();')).toBe(true);
        // Unrelated assertions from the original guardian — kept since they
        // still apply to the cached-cost label path.
        expect(viewSource.includes('const nextRunCanReuseCache = !!cacheSession?.cacheWindowExpiresAt')).toBe(true);
        expect(viewSource.includes("return `Cost · ${cachedLabel} cached`;")).toBe(true);
    });

    it('derives persisted cache coverage from actual usage and refreshes the HUD after estimate snapshots', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('private getObservedCacheMetrics(trace?: InquiryRunTrace | null):')).toBe(true);
        expect(viewSource.includes('usage.cacheReadInputTokens')).toBe(true);
        expect(viewSource.includes('const observedCacheMetrics = this.getObservedCacheMetrics(runTrace);')).toBe(true);
        expect(viewSource.includes('this.updateRunningHud();')).toBe(true);
    });

    it('stamps Anthropic dispatch fingerprints into the trace and compares them to the previous same-engine run', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes('private lastAnthropicDispatchPrefixByEngine = new Map<string, string>();')).toBe(true);
        expect(viewSource.includes('private appendAnthropicDispatchTraceNote(result: InquiryResult, trace: InquiryRunTrace | null | undefined): void {')).toBe(true);
        expect(viewSource.includes("private getAnthropicAcceptedCacheTtl(trace: InquiryRunTrace | null | undefined): '5m' | '1h' | 'mixed' | 'unknown' {")).toBe(true);
        expect(viewSource.includes("if (!trace.notes.includes(note)) {\n            trace.notes.unshift(note);\n        }")).toBe(true);
        expect(viewSource.includes('`requested=${diagnostics.requestedCacheTtl}`')).toBe(true);
        expect(viewSource.includes('`accepted=${acceptedCacheTtl}`')).toBe(true);
        expect(viewSource.includes('same-as-previous=')).toBe(true);
        expect(viewSource.includes('this.lastAnthropicDispatchPrefixByEngine.set(engineKey, diagnostics.cachePrefixFingerprint);')).toBe(true);
    });

    it('matches current corpus context against the estimate-snapshot manifest fingerprints instead of a separate current-corpus hash', () => {
        const viewSource = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        expect(viewSource.includes("const manifest = this.buildCorpusManifest('estimate-snapshot');")).toBe(true);
        // Corpus content match uses the model-free fingerprint so the corpus
        // estimate stays valid across model switches.
        expect(viewSource.includes('snapshot.corpus.corpusOnlyFingerprint === manifest.corpusOnlyFingerprint')).toBe(true);
        // Request envelope match uses the full manifest fingerprint (model included).
        expect(viewSource.includes('snapshot.corpus.corpusFingerprint === manifest.fingerprint')).toBe(true);
        expect(viewSource.includes("this.hashString(`current-corpus|${fingerprintSource}`)")).toBe(false);
    });

});
