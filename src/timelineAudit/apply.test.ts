import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { applyAuditFindings } from './apply';
import type { TimelineAuditFinding } from './types';

function makeFile(path: string): TFile {
    const basename = path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
    return { path, basename } as TFile;
}

function makeFinding(path: string, action: TimelineAuditFinding['reviewAction'], options: Partial<TimelineAuditFinding> = {}): TimelineAuditFinding {
    return {
        file: makeFile(path),
        sceneId: path,
        title: path,
        path,
        manuscriptOrderIndex: 0,
        currentWhenRaw: '2026-01-01 08:00',
        currentWhen: new Date('2026-01-01T08:00:00'),
        whenValid: true,
        whenParseIssue: null,
        expectedChronologyPosition: 1,
        inferredWrittenTimelinePosition: null,
        status: 'warning',
        issues: [],
        evidence: [],
        rationale: '',
        suggestedWhen: action === 'apply' ? new Date('2026-01-02T19:00:00') : null,
        suggestedConfidence: action === 'apply' ? 'high' : null,
        suggestedProvenance: action === 'apply' ? 'keyword' : null,
        allowedActions: ['apply', 'keep', 'mark_review'],
        reviewAction: action,
        unresolved: action !== 'apply',
        aiSuggested: false,
        safeApplyEligible: action === 'apply',
        ...options
    };
}

describe('timeline audit apply adapter', () => {
    it('writes only accepted When changes and persists review flags conservatively', async () => {
        const docs = new Map<string, Record<string, unknown>>([
            ['Story/1 Apply.md', { When: '2026-01-01 08:00', NeedsReview: true }],
            ['Story/2 Keep.md', { When: '2026-01-01 08:00' }],
            ['Story/3 Review.md', { When: '2026-01-01 08:00' }]
        ]);

        const app = {
            fileManager: {
                processFrontMatter: async (file: TFile, updater: (fm: Record<string, unknown>) => void) => {
                    const current = docs.get(file.path);
                    if (!current) throw new Error(`Missing doc: ${file.path}`);
                    updater(current);
                }
            }
        } as unknown as App;

        await applyAuditFindings(app, [
            makeFinding('Story/1 Apply.md', 'apply'),
            makeFinding('Story/2 Keep.md', 'keep'),
            makeFinding('Story/3 Review.md', 'mark_review')
        ]);

        expect(docs.get('Story/1 Apply.md')?.When).toBe('2026-01-02 19:00');
        expect(docs.get('Story/1 Apply.md')?.WhenSource).toBe('keyword');
        expect(docs.get('Story/1 Apply.md')?.NeedsReview).toBeUndefined();
        expect(docs.get('Story/2 Keep.md')?.NeedsReview).toBe(true);
        expect(docs.get('Story/3 Review.md')?.NeedsReview).toBe(true);
    });
});
