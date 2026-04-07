export function buildInquiryJsonSchema(): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            schema_version: { type: 'number' },
            summaryFlow: { type: 'string' },
            summaryDepth: { type: 'string' },
            verdict: {
                type: 'object',
                properties: {
                    flow: { type: 'number' },
                    depth: { type: 'number' },
                    impact: { type: 'string' },
                    assessmentConfidence: { type: 'string' },
                    severity: { type: 'string' },
                    confidence: { type: 'string' }
                },
                required: ['flow', 'depth', 'impact', 'assessmentConfidence']
            },
            findings: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        ref_id: { type: 'string' },
                        ref_label: { type: 'string' },
                        ref_path: { type: 'string' },
                        kind: { type: 'string' },
                        lens: { type: 'string' },
                        headline: { type: 'string' },
                        bullets: { type: 'array', items: { type: 'string' } },
                        role: { type: 'string', enum: ['target', 'context'] },
                        impact: { type: 'string' },
                        assessmentConfidence: { type: 'string' },
                        severity: { type: 'string' },
                        confidence: { type: 'string' }
                    },
                    required: ['ref_id', 'kind', 'headline', 'impact', 'assessmentConfidence']
                }
            }
        },
        required: ['schema_version', 'summaryFlow', 'summaryDepth', 'verdict', 'findings']
    };
}

export function buildInquiryOmnibusJsonSchema(): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            schema_version: { type: 'number' },
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        question_id: { type: 'string' },
                        question_zone: { type: 'string' },
                        summaryFlow: { type: 'string' },
                        summaryDepth: { type: 'string' },
                        verdict: {
                            type: 'object',
                            properties: {
                                flow: { type: 'number' },
                                depth: { type: 'number' },
                                impact: { type: 'string' },
                                assessmentConfidence: { type: 'string' },
                                severity: { type: 'string' },
                                confidence: { type: 'string' }
                            },
                            required: ['flow', 'depth', 'impact', 'assessmentConfidence']
                        },
                        findings: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    ref_id: { type: 'string' },
                                    ref_label: { type: 'string' },
                                    ref_path: { type: 'string' },
                                    kind: { type: 'string' },
                                    lens: { type: 'string' },
                                    headline: { type: 'string' },
                                    bullets: { type: 'array', items: { type: 'string' } },
                                    role: { type: 'string', enum: ['target', 'context'] },
                                    impact: { type: 'string' },
                                    assessmentConfidence: { type: 'string' },
                                    severity: { type: 'string' },
                                    confidence: { type: 'string' }
                                },
                                required: ['ref_id', 'kind', 'headline', 'impact', 'assessmentConfidence']
                            }
                        }
                    },
                    required: ['question_id', 'summaryFlow', 'summaryDepth', 'verdict', 'findings']
                }
            }
        },
        required: ['schema_version', 'results']
    };
}
