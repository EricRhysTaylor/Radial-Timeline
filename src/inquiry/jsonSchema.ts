export function buildInquiryJsonSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            schema_version: { type: 'number' },
            summaryFlow: { type: 'string' },
            summaryDepth: { type: 'string' },
            verdict: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    flow: { type: 'number' },
                    depth: { type: 'number' }
                },
                required: ['flow', 'depth']
            },
            findings: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        ref_id: { type: 'string' },
                        ref_label: { type: 'string' },
                        ref_path: { type: 'string' },
                        kind: { type: 'string' },
                        lens: { type: 'string' },
                        headline: { type: 'string' },
                        bullets: { type: 'array', items: { type: 'string' } },
                        role: { type: 'string' }
                    },
                    required: ['ref_id', 'ref_label', 'ref_path', 'kind', 'lens', 'headline', 'bullets', 'role']
                }
            }
        },
        required: ['schema_version', 'summaryFlow', 'summaryDepth', 'verdict', 'findings']
    };
}

export function buildInquiryOmnibusJsonSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            schema_version: { type: 'number' },
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        question_id: { type: 'string' },
                        summaryFlow: { type: 'string' },
                        summaryDepth: { type: 'string' },
                        verdict: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                flow: { type: 'number' },
                                depth: { type: 'number' }
                            },
                            required: ['flow', 'depth']
                        },
                        findings: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    ref_id: { type: 'string' },
                                    ref_label: { type: 'string' },
                                    ref_path: { type: 'string' },
                                    kind: { type: 'string' },
                                    lens: { type: 'string' },
                                    headline: { type: 'string' },
                                    bullets: { type: 'array', items: { type: 'string' } },
                                    role: { type: 'string' }
                                },
                                required: ['ref_id', 'ref_label', 'ref_path', 'kind', 'lens', 'headline', 'bullets', 'role']
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
