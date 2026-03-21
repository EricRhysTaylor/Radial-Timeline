import type { InquiryAdvisoryContext } from '../services/inquiryAdvisory';
import type { InquiryEnginePopoverState, InquiryReadinessUiState, PassPlanResult } from '../types';

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
    popoverState: InquiryEnginePopoverState;
    blocked: boolean;
    corpusSummary: string;
    passPlan: PassPlanResult;
    readinessCause?: InquiryReadinessUiState['readiness']['cause'];
    readinessReason: string;
    runScopeLabel: string;
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

    const statusText = args.blocked
        ? 'No working model'
        : args.popoverState === 'ready'
            ? 'Ready'
            : args.popoverState === 'multi-pass'
                ? 'Multi-pass'
                : 'Exceeds limits';
    args.readinessStatusEl.setText(statusText);
    args.readinessCorpusEl.setText(args.corpusSummary);

    if (args.popoverState === 'ready') {
        args.readinessMessageEl.setText('Single pass.');
    } else if (args.popoverState === 'multi-pass') {
        const estimateLabel = args.passPlan.estimatedPassCount ?? args.passPlan.displayPassCount;
        const recentRunSuffix = args.passPlan.recentExactPassCount
            ? ` Recent run used ${args.passPlan.recentExactPassCount} passes.`
            : '';
        const reason = args.passPlan.packagingTriggerReason
            ?? 'Manuscript exceeds the per-pass planning budget.';
        args.readinessMessageEl.setText(
            `Expected structured passes: ${estimateLabel} — ${reason.replace(/\.$/, '')}.${recentRunSuffix}`
        );
    } else if (args.readinessCause === 'single_pass_limit') {
        const estimateLabel = args.passPlan.estimatedPassCount ?? args.passPlan.displayPassCount;
        args.readinessMessageEl.setText(
            `Expected structured passes: ${estimateLabel} — single-pass mode blocks this run.`
        );
    } else {
        args.readinessMessageEl.setText(args.readinessReason);
    }

    args.readinessScopeEl.setText(args.runScopeLabel);
    args.readinessActionsEl.empty();
}
