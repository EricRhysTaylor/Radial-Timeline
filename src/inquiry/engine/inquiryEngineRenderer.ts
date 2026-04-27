import type { InquiryAdvisoryContext } from '../services/inquiryAdvisory';
import type { InquiryEnginePopoverState, InquiryReadinessUiState, PassPlanResult } from '../types';
import type { TokenUsage } from '../../ai/usage/providerUsage';

export type EngineRecentRunSnapshot = {
    /** Whether the last run requested citation anchors. */
    citationsRequested: boolean;
    /** Number of citation blocks the provider returned. Zero with citations on = mismatch. */
    citationCount: number;
    /** Token usage from the provider's response, including cache breakdown. */
    tokenUsage?: TokenUsage;
};

export function renderInquiryEngineAdvisoryCard(
    container: HTMLElement,
    advisory: InquiryAdvisoryContext
): void {
    container.empty();

    const card = container.createDiv({ cls: 'ert-inquiry-engine-advisor-card' });
    card.createDiv({ cls: 'ert-inquiry-engine-advisor-title', text: 'INQUIRY ADVISOR' });
    card.createDiv({
        cls: 'ert-inquiry-engine-advisor-message',
        text: advisory.recommendation.message
    });
    advisory.recommendation.options.forEach(option => {
        card.createDiv({
            cls: 'ert-inquiry-engine-advisor-suggestion',
            text: `${option.providerLabel} · ${option.modelLabel}`
        });
    });
}

export function renderInquiryEngineReadinessStrip(args: {
    readinessEl?: HTMLDivElement;
    readinessStatusEl?: HTMLDivElement;
    readinessCorpusEl?: HTMLDivElement;
    readinessMessageEl?: HTMLDivElement;
    readinessActionsEl?: HTMLDivElement;
    readinessScopeEl?: HTMLDivElement;
    providerLabel: string;
    popoverState: InquiryEnginePopoverState;
    blocked: boolean;
    corpusSummary: string;
    passPlan: PassPlanResult;
    readinessCause?: InquiryReadinessUiState['readiness']['cause'];
    readinessReason: string;
    runScopeLabel: string;
    cacheTtlLabel?: string;
    /** Citations toggle state from settings — drives the static "Citations" pill. */
    citationsRequested: boolean;
    /** Outcome data from the most recent run; drives dynamic pill states. */
    recentRun?: EngineRecentRunSnapshot;
}): void {
    if (!args.readinessEl
        || !args.readinessStatusEl
        || !args.readinessCorpusEl
        || !args.readinessMessageEl
        || !args.readinessActionsEl
        || !args.readinessScopeEl) {
        return;
    }

    const stateClass = args.popoverState === 'ready'
        ? 'is-ready'
        : args.popoverState === 'multi-pass'
            ? 'is-amber'
            : 'is-error';
    args.readinessEl.classList.remove('is-ready', 'is-amber', 'is-error');
    args.readinessEl.classList.add(stateClass);

    const isLocalLlm = args.providerLabel === 'Ollama' || args.providerLabel === 'Local LLM';
    const statusText = args.blocked
        ? 'No eligible model for Inquiry'
        : args.popoverState === 'ready'
            ? 'Ready'
            : args.popoverState === 'multi-pass'
                ? 'Multi-pass'
                : 'Exceeds limits';
    args.readinessStatusEl.setText(statusText);
    args.readinessCorpusEl.setText(args.corpusSummary);

    const cacheSuffix = args.cacheTtlLabel ? ` Provider cache · ${args.cacheTtlLabel}.` : '';

    if (args.blocked && isLocalLlm) {
        args.readinessCorpusEl.setText('Local LLM is connected');
        args.readinessMessageEl.setText('Selected model passes basic validation');
        args.readinessScopeEl.setText('This model does not meet Inquiry requirements for the current corpus');
    } else if (args.popoverState === 'ready') {
        args.readinessMessageEl.setText(`Execution: 1 pass.${cacheSuffix}`);
        args.readinessScopeEl.setText(args.runScopeLabel);
    } else if (args.popoverState === 'multi-pass') {
        const estimateLabel = args.passPlan.estimatedPassCount ?? args.passPlan.displayPassCount;
        const recentRunSuffix = args.passPlan.recentExactPassCount
            ? ` Recent run used ${args.passPlan.recentExactPassCount} passes.`
            : '';
        const reason = args.passPlan.multiPassTriggerReason
            ?? 'Manuscript exceeds the per-pass planning budget.';
        args.readinessMessageEl.setText(
            `Estimated execution: ${estimateLabel} ${estimateLabel === 1 ? 'pass' : 'passes'} — ${reason.replace(/\.$/, '')}.${recentRunSuffix}${cacheSuffix}`
        );
        args.readinessScopeEl.setText(args.runScopeLabel);
    } else {
        args.readinessMessageEl.setText(args.readinessReason);
        args.readinessScopeEl.setText(args.runScopeLabel);
    }
    args.readinessActionsEl.empty();
    renderEnginePostRunPills(args.readinessActionsEl, {
        citationsRequested: args.citationsRequested,
        recentRun: args.recentRun
    });
}

type CachePillState = {
    label: string;
    /** CSS modifier suffix; renderer maps to `.is-{state}`. */
    state: 'none' | 'primed' | 'confirmed' | 'miss';
    tooltip: string;
};

type CitationPillState = {
    label: string;
    state: 'off' | 'on-pending' | 'on-confirmed' | 'on-missing';
    tooltip: string;
};

/**
 * Compute the cache pill from the most recent run's token usage.
 *
 * Rules:
 *   - No recent run yet → "—" (no pill rendered)
 *   - cache_read > 0 → confirmed (green) with reuse percentage
 *   - cache_creation > 0 only → primed (cache established but not yet reused)
 *   - both zero → miss (this run did not benefit from cache)
 *
 * Pure: no DOM access, fully testable.
 */
export function computeCachePillState(usage: TokenUsage | undefined): CachePillState | null {
    if (!usage) return null;
    const cacheRead = usage.cacheReadInputTokens ?? 0;
    const cacheCreation = usage.cacheCreationInputTokens ?? 0;
    const totalInput = (usage.inputTokens ?? 0) + cacheRead + cacheCreation;
    if (cacheRead > 0) {
        const reusePct = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;
        return {
            label: `Cache reused · ${reusePct}%`,
            state: 'confirmed',
            tooltip: `Last run hit the provider's prompt cache for ${cacheRead.toLocaleString()} input tokens (${reusePct}% of input).`
        };
    }
    if (cacheCreation > 0) {
        return {
            label: 'Cache primed',
            state: 'primed',
            tooltip: `Last run established a cache prefix (${cacheCreation.toLocaleString()} tokens). The next run on the same corpus should reuse it.`
        };
    }
    if (totalInput > 0) {
        return {
            label: 'Cache miss',
            state: 'miss',
            tooltip: 'Last run did not use the provider cache. Either the cache window expired or the request prefix changed.'
        };
    }
    return null;
}

/**
 * Compute the citations pill from settings + last run outcome.
 *
 * Rules:
 *   - toggle off → "Citations off" muted (informational)
 *   - toggle on, no run yet → "Citations on" pending
 *   - toggle on, last run had citations → "Citations · N" confirmed
 *   - toggle on, last run had ZERO citations → "Citations missing" warning
 *     (catches misconfiguration, model regressions, or wrong content type)
 */
export function computeCitationPillState(
    citationsRequested: boolean,
    recentRun: EngineRecentRunSnapshot | undefined
): CitationPillState {
    if (!citationsRequested) {
        return {
            label: 'Citations off',
            state: 'off',
            tooltip: 'Findings will not be anchored to specific source passages.'
        };
    }
    if (!recentRun) {
        return {
            label: 'Citations on',
            state: 'on-pending',
            tooltip: 'Findings will be anchored to source passages. Anchor count appears here after the next run.'
        };
    }
    if (recentRun.citationCount > 0) {
        return {
            label: `Citations · ${recentRun.citationCount}`,
            state: 'on-confirmed',
            tooltip: `Last run returned ${recentRun.citationCount} citation anchor${recentRun.citationCount === 1 ? '' : 's'}.`
        };
    }
    return {
        label: 'Citations missing',
        state: 'on-missing',
        tooltip: 'Citations were enabled but the model returned zero citation anchors. Check provider/model support or the request payload.'
    };
}

function renderEnginePostRunPills(
    container: HTMLElement,
    args: { citationsRequested: boolean; recentRun?: EngineRecentRunSnapshot }
): void {
    const pillRow = container.createDiv({ cls: 'ert-inquiry-engine-pill-row' });

    const cachePill = computeCachePillState(args.recentRun?.tokenUsage);
    if (cachePill) {
        const el = pillRow.createSpan({
            cls: `ert-inquiry-engine-pill ert-inquiry-engine-pill--cache is-${cachePill.state}`,
            text: cachePill.label
        });
        el.setAttr('title', cachePill.tooltip);
    }

    const citationPill = computeCitationPillState(args.citationsRequested, args.recentRun);
    const citationEl = pillRow.createSpan({
        cls: `ert-inquiry-engine-pill ert-inquiry-engine-pill--citations is-${citationPill.state}`,
        text: citationPill.label
    });
    citationEl.setAttr('title', citationPill.tooltip);
}
