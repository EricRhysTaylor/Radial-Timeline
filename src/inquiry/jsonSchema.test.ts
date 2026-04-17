import { describe, expect, it } from 'vitest';
import { buildInquiryJsonSchema, buildInquiryOmnibusJsonSchema } from './jsonSchema';

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

describe('Inquiry JSON schemas', () => {
    it('closes all Inquiry strict-output object shapes', () => {
        const schema = buildInquiryJsonSchema() as Record<string, any>;
        assertOpenAiStrictObjectContracts(schema);
    });

    it('closes all Inquiry omnibus strict-output object shapes', () => {
        const schema = buildInquiryOmnibusJsonSchema() as Record<string, any>;
        assertOpenAiStrictObjectContracts(schema);
    });
});
