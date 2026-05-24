import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GossamerProcessingModal progress UX', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/modals/GossamerProcessingModal.ts'), 'utf8');

    it('uses the last observed Gossamer runtime as the API progress baseline', () => {
        expect(source).toContain('this.plugin.settings.gossamerLastRunMsBySignal?.[signal]');
        expect(source).toContain('Math.min(300000, Math.max(5000, observed))');
        expect(source).toContain('return 60000');
    });

    it('keeps the API progress animation linear and full-width', () => {
        expect(source).toContain('return 60000');
        expect(source).toContain('startPercent: 0');
        expect(source).toContain('maxPercent: 100');
        expect(source).toContain('jitter: 0');
        expect(source).toContain('completeOnDuration: true');
    });

    it('does not use manuscript-size heuristics for the progress bar', () => {
        expect(source).not.toContain('tokenSeconds');
        expect(source).not.toContain('sceneSeconds');
        expect(source).not.toContain('beatSeconds');
    });
});

describe('GossamerProcessingModal error presentation', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/modals/GossamerProcessingModal.ts'), 'utf8');

    it('renders errors as one icon-led paragraph instead of separate lines', () => {
        expect(source).toContain('setIcon(icon, \'alert-triangle\')');
        expect(source).toContain('ert-gossamer-proc-error-summary');
        expect(source).toContain('ert-gossamer-proc-error-copy');
        expect(source).toContain('this.errorMessages');
        expect(source).not.toContain('ert-gossamer-proc-error-item');
    });
});
