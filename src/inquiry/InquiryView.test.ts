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
});
