import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('InquiryView cache countdown formatting', () => {
    it('formats the HUD cache countdown as HH:MM without seconds', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
        const match = source.match(/private formatCacheCountdown\(remainingMs: number\): string \{([\s\S]*?)\n    \}/);
        expect(match?.[1]).toBeTruthy();
        const block = match?.[1] ?? '';
        expect(block.includes("return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;")).toBe(true);
        expect(block.includes('const seconds =')).toBe(false);
    });
});
