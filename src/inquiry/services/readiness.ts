import type { AnalysisPackaging } from '../../ai/types';

export type InquiryReadinessState = 'ready' | 'large' | 'blocked';
export type InquiryPressureTone = 'normal' | 'amber' | 'red';
export type InquiryReadinessCause =
    | 'ok'
    | 'packaging_expected'
    | 'single_pass_limit'
    | 'capability_floor'
    | 'missing_key';

export interface EvaluateInquiryReadinessInput {
    hasEligibleModel: boolean;
    hasCredential: boolean;
    analysisPackaging: AnalysisPackaging;
    estimatedInputTokens: number;
    safeInputBudget: number;
}

export interface InquiryReadinessResult {
    state: InquiryReadinessState;
    cause: InquiryReadinessCause;
    pressureRatio: number;
    pressureTone: InquiryPressureTone;
    exceedsBudget: boolean;
}

export interface PassIndicatorResult {
    visible: boolean;
    marks: string;
    visibleCount: number;
    exactCount: number | null;
    expectedOnly: boolean;
}

function toPressureTone(ratio: number): InquiryPressureTone {
    if (!Number.isFinite(ratio) || ratio >= 0.9) return 'red';
    if (ratio >= 0.7) return 'amber';
    return 'normal';
}

export function evaluateInquiryReadiness(input: EvaluateInquiryReadinessInput): InquiryReadinessResult {
    const safeInputBudget = Number.isFinite(input.safeInputBudget) ? Math.max(0, input.safeInputBudget) : 0;
    const estimatedInputTokens = Number.isFinite(input.estimatedInputTokens) ? Math.max(0, input.estimatedInputTokens) : 0;
    const pressureRatio = safeInputBudget > 0 ? (estimatedInputTokens / safeInputBudget) : Number.POSITIVE_INFINITY;
    const exceedsBudget = safeInputBudget > 0 ? estimatedInputTokens > safeInputBudget : true;

    if (!input.hasCredential) {
        return {
            state: 'blocked',
            cause: 'missing_key',
            pressureRatio,
            pressureTone: toPressureTone(pressureRatio),
            exceedsBudget
        };
    }

    if (!input.hasEligibleModel || safeInputBudget <= 0) {
        return {
            state: 'blocked',
            cause: 'capability_floor',
            pressureRatio,
            pressureTone: toPressureTone(pressureRatio),
            exceedsBudget
        };
    }

    if (exceedsBudget && input.analysisPackaging === 'singlePassOnly') {
        return {
            state: 'blocked',
            cause: 'single_pass_limit',
            pressureRatio,
            pressureTone: toPressureTone(pressureRatio),
            exceedsBudget
        };
    }

    if (exceedsBudget) {
        return {
            state: 'large',
            cause: 'packaging_expected',
            pressureRatio,
            pressureTone: toPressureTone(pressureRatio),
            exceedsBudget
        };
    }

    return {
        state: 'ready',
        cause: 'ok',
        pressureRatio,
        pressureTone: toPressureTone(pressureRatio),
        exceedsBudget
    };
}

export function buildPassIndicator(passCount?: number, packagingExpected?: boolean): PassIndicatorResult {
    const normalizedPassCount = Number.isFinite(passCount) ? Math.max(0, Math.round(passCount as number)) : 0;
    if (normalizedPassCount > 1) {
        const visibleCount = Math.min(5, normalizedPassCount);
        return {
            visible: true,
            marks: '+'.repeat(visibleCount),
            visibleCount,
            exactCount: normalizedPassCount,
            expectedOnly: false
        };
    }

    if (packagingExpected) {
        return {
            visible: true,
            marks: '+',
            visibleCount: 1,
            exactCount: null,
            expectedOnly: true
        };
    }

    return {
        visible: false,
        marks: '',
        visibleCount: 0,
        exactCount: null,
        expectedOnly: false
    };
}
