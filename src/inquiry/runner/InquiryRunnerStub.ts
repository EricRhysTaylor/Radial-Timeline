import type { InquiryRunner, InquiryRunnerInput } from './types';
import type { InquiryAiStatus, InquiryFinding, InquiryResult } from '../state';

export class InquiryRunnerStub implements InquiryRunner {
    async run(input: InquiryRunnerInput): Promise<InquiryResult> {
        const variant = this.pickVariant(input.questionId);
        const findings = this.buildFindings(variant, input.focusLabel);
        const verdict = this.buildVerdict(variant);
        const aiStatus: InquiryAiStatus = 'unavailable';

        return {
            runId: `run-${Date.now()}`,
            scope: input.scope,
            focusId: input.focusLabel,
            mode: input.mode,
            questionId: input.questionId,
            summary: verdict.summary,
            verdict: verdict.metrics,
            findings,
            corpusFingerprint: input.corpus.fingerprint,
            aiProvider: input.ai.provider,
            aiModelRequested: input.ai.modelId,
            aiModelResolved: input.ai.modelId,
            aiStatus,
            aiReason: 'stub'
        };
    }

    private pickVariant(questionId: string): 'none' | 'unclear' | 'error' | 'default' {
        if (questionId.includes('setup')) return 'none';
        if (questionId.includes('pressure')) return 'unclear';
        if (questionId.includes('payoff')) return 'error';
        return 'default';
    }

    private buildFindings(variant: 'none' | 'unclear' | 'error' | 'default', focus: string): InquiryFinding[] {
        if (variant === 'none') {
            return [{
                refId: focus,
                kind: 'none',
                status: 'resolved',
                severity: 'low',
                confidence: 'high',
                headline: 'No issues detected for the current focus.',
                bullets: ['Evidence appears consistent within the defined scope.'],
                related: [],
                evidenceType: 'scene'
            }];
        }
        if (variant === 'unclear') {
            return [{
                refId: focus,
                kind: 'unclear',
                status: 'unclear',
                severity: 'low',
                confidence: 'low',
                headline: 'Evidence is insufficient for a clear verdict.',
                bullets: ['Authoritative sources are missing or incomplete.'],
                related: [],
                evidenceType: 'mixed'
            }];
        }
        if (variant === 'error') {
            return [{
                refId: focus,
                kind: 'error',
                status: 'unclear',
                severity: 'high',
                confidence: 'low',
                headline: 'Inquiry failed to complete the analysis.',
                bullets: ['Runner error fallback result returned.'],
                related: [],
                evidenceType: 'mixed'
            }];
        }
        return [{
            refId: focus,
            kind: 'continuity',
            status: 'unclear',
            severity: 'medium',
            confidence: 'low',
            headline: 'Potential continuity gap detected.',
            bullets: ['Focus relies on prior setup not yet confirmed.'],
            related: [],
            evidenceType: 'scene'
        }];
    }

    private buildVerdict(variant: 'none' | 'unclear' | 'error' | 'default'): {
        summary: string;
        metrics: InquiryResult['verdict'];
    } {
        if (variant === 'none') {
            return {
                summary: 'No issues found in the current focus.',
                metrics: {
                    flow: 0.88,
                    depth: 0.82,
                    severity: 'low',
                    confidence: 'high'
                }
            };
        }
        if (variant === 'unclear') {
            return {
                summary: 'Result is unclear due to incomplete evidence.',
                metrics: {
                    flow: 0.5,
                    depth: 0.5,
                    severity: 'low',
                    confidence: 'low'
                }
            };
        }
        if (variant === 'error') {
            return {
                summary: 'Inquiry failed; fallback result returned.',
                metrics: {
                    flow: 0.1,
                    depth: 0.1,
                    severity: 'high',
                    confidence: 'low'
                }
            };
        }
        return {
            summary: 'Preview result for inquiry.',
            metrics: {
                flow: 0.62,
                depth: 0.48,
                severity: 'medium',
                confidence: 'low'
            }
        };
    }
}
