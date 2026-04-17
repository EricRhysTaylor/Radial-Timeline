import { describe, expect, it } from 'vitest';
import { getUnifiedBeatAnalysisJsonSchema } from './unifiedBeatAnalysis';
import { getSceneAnalysisJsonSchema } from './sceneAnalysis';
import { getSummaryJsonSchema, getSynopsisJsonSchema } from './synopsis';

function assertOpenAiStrictObjectContracts(schema: Record<string, any>): void {
    if (schema.type === 'object' && schema.additionalProperties === false) {
        const propertyKeys = Object.keys(schema.properties || {}).sort();
        const requiredKeys = Array.isArray(schema.required) ? [...schema.required].sort() : [];
        expect(requiredKeys).toEqual(propertyKeys);
    }

    Object.values(schema.properties || {}).forEach(value => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            assertOpenAiStrictObjectContracts(value as Record<string, any>);
        }
    });

    const items = schema.items;
    if (items && typeof items === 'object' && !Array.isArray(items)) {
        assertOpenAiStrictObjectContracts(items as Record<string, any>);
    }
}

describe('Strict JSON schemas', () => {
    it('keeps unified beat analysis OpenAI-strict compatible', () => {
        const schema = getUnifiedBeatAnalysisJsonSchema() as Record<string, any>;
        assertOpenAiStrictObjectContracts(schema);
    });

    it('keeps scene analysis OpenAI-strict compatible', () => {
        const schema = getSceneAnalysisJsonSchema() as Record<string, any>;
        assertOpenAiStrictObjectContracts(schema);
    });

    it('keeps summary and synopsis OpenAI-strict compatible', () => {
        assertOpenAiStrictObjectContracts(getSummaryJsonSchema() as Record<string, any>);
        assertOpenAiStrictObjectContracts(getSynopsisJsonSchema() as Record<string, any>);
    });
});
