import { describe, expect, it, vi } from 'vitest';

vi.mock('../../ai/runtime/aiClient', () => ({
    getAIClient: vi.fn(() => ({}))
}));

import { InquiryRunnerService } from './InquiryRunnerService';
import { buildSceneRefIndex } from '../../ai/references/sceneRefNormalizer';

type Verifier = (
    rawFindings: Array<Record<string, unknown>>,
    sceneRefIndex: ReturnType<typeof buildSceneRefIndex>
) => {
    verified: Array<{ refId: string; headline: string; rawRef?: Record<string, string> }>;
    unverified: Array<{ rawRefId?: string; rawRefLabel?: string; rawRefPath?: string; headline: string; warning: string }>;
    warnings: Array<{ stage: string; message: string }>;
};

function getVerifier(): Verifier {
    const service = new InquiryRunnerService(
        { settings: {} } as never,
        { getAbstractFileByPath: () => null } as never,
        {} as never
    ) as unknown as { verifyFindingRefs: Verifier };
    return service.verifyFindingRefs.bind(service);
}

function singleSceneIndex() {
    return buildSceneRefIndex([{
        sceneId: 'scn_a1b2c3d4',
        path: 'Book 1 Shail + Trisan/3 Party.md',
        label: '3 Party.md',
        sceneNumber: 3,
        title: '3 Party',
        aliases: []
    }]);
}

function twoScenesDifferentBooksIndex() {
    return buildSceneRefIndex([
        {
            sceneId: 'scn_aaaaaaaa',
            path: 'Book 1/1 Intro.md',
            label: '1 Intro.md',
            sceneNumber: 1,
            title: '1 Intro',
            aliases: []
        },
        {
            sceneId: 'scn_bbbbbbbb',
            path: 'Book 2/1 Intro.md',
            label: '1 Intro.md',
            sceneNumber: 1,
            title: '1 Intro',
            aliases: []
        }
    ]);
}

describe('verifyFindingRefs', () => {
    it('passes clean findings straight through with no warnings', () => {
        const verify = getVerifier();
        const out = verify(
            [{
                ref_id: 'scn_a1b2c3d4',
                ref_label: '3 Party.md',
                ref_path: 'Book 1 Shail + Trisan/3 Party.md',
                kind: 'continuity',
                headline: 'Clean finding',
                bullets: ['a'],
                role: 'target'
            }],
            singleSceneIndex()
        );

        expect(out.verified.length).toBe(1);
        expect(out.verified[0].refId).toBe('scn_a1b2c3d4');
        expect(out.verified[0].rawRef).toBeUndefined();
        expect(out.unverified.length).toBe(0);
        expect(out.warnings.length).toBe(0);
    });

    it('quarantines a fabricated ref when nothing matches the corpus', () => {
        const verify = getVerifier();
        const out = verify(
            [{
                ref_id: 'scn_deadbeef',
                ref_label: 'Nowhere.md',
                ref_path: 'Made Up/Nowhere.md',
                kind: 'continuity',
                headline: 'Fabricated',
                bullets: [],
                role: 'target'
            }],
            singleSceneIndex()
        );

        expect(out.verified.length).toBe(0);
        expect(out.unverified.length).toBe(1);
        expect(out.unverified[0].rawRefId).toBe('scn_deadbeef');
        expect(out.unverified[0].rawRefLabel).toBe('Nowhere.md');
        expect(out.unverified[0].headline).toBe('Fabricated');
        expect(out.warnings.length).toBeGreaterThan(0);
        expect(out.warnings[0].stage).toBe('unresolved_ref');
        expect(out.warnings[0].message).toContain('scn_deadbeef');
        expect(out.warnings[0].message).toContain('could not be matched');
    });

    it('rescues a fabricated ref_id when ref_label matches a single corpus entry', () => {
        const verify = getVerifier();
        const out = verify(
            [{
                ref_id: 'scn_deadbeef',
                ref_label: '3 Party.md',
                ref_path: 'Book 1 Shail + Trisan/3 Party.md',
                kind: 'continuity',
                headline: 'Rescued',
                bullets: [],
                role: 'context'
            }],
            singleSceneIndex()
        );

        expect(out.verified.length).toBe(1);
        expect(out.verified[0].refId).toBe('scn_a1b2c3d4');
        expect(out.verified[0].rawRef).toEqual({
            refId: 'scn_deadbeef',
            refLabel: '3 Party.md',
            refPath: 'Book 1 Shail + Trisan/3 Party.md'
        });
        expect(out.warnings.some(w => w.stage === 'unresolved_ref' && w.message.includes('scn_a1b2c3d4'))).toBe(true);
    });

    it('quarantines when fallback keys are ambiguous (multiple scenes share a number)', () => {
        const verify = getVerifier();
        const out = verify(
            [{
                ref_id: 'scn_deadbeef',
                ref_label: 'Scene 1',
                ref_path: '',
                kind: 'continuity',
                headline: 'Ambiguous',
                bullets: [],
                role: 'target'
            }],
            twoScenesDifferentBooksIndex()
        );

        expect(out.verified.length).toBe(0);
        expect(out.unverified.length).toBe(1);
        expect(out.unverified[0].rawRefId).toBe('scn_deadbeef');
        expect(out.warnings[0].stage).toBe('unresolved_ref');
    });

    it('flags ref_label_mismatch when ref_id resolves to A but ref_label/path points to B', () => {
        const verify = getVerifier();
        const index = buildSceneRefIndex([
            {
                sceneId: 'scn_aaaaaaaa',
                path: 'Book/3 Party.md',
                label: '3 Party.md',
                sceneNumber: 3,
                title: '3 Party',
                aliases: []
            },
            {
                sceneId: 'scn_bbbbbbbb',
                path: 'Book/4 Aftermath.md',
                label: '4 Aftermath.md',
                sceneNumber: 4,
                title: '4 Aftermath',
                aliases: []
            }
        ]);

        const out = verify(
            [{
                ref_id: 'scn_aaaaaaaa',
                ref_label: '4 Aftermath.md',
                ref_path: 'Book/4 Aftermath.md',
                kind: 'continuity',
                headline: 'Mismatched citation',
                bullets: [],
                role: 'target'
            }],
            index
        );

        expect(out.verified.length).toBe(1);
        expect(out.verified[0].refId).toBe('scn_aaaaaaaa');
        expect(out.warnings.some(w => w.stage === 'ref_label_mismatch')).toBe(true);
        const mismatch = out.warnings.find(w => w.stage === 'ref_label_mismatch')!;
        expect(mismatch.message).toContain('valid scene id with mismatched label/path metadata');
        expect(mismatch.message).toContain('scn_aaaaaaaa');
        expect(mismatch.message).toContain('scn_bbbbbbbb');
        expect(out.verified[0].rawRef).toBeDefined();
    });

    it('preserves partial header data on quarantined findings so the UI can show what the AI claimed', () => {
        const verify = getVerifier();
        const out = verify(
            [{
                ref_id: 'scn_deadbeef',
                ref_label: 'Nowhere.md',
                kind: 'continuity',
                headline: 'Ghost',
                bullets: ['one', 'two'],
                role: 'context',
                lens: 'flow'
            }],
            singleSceneIndex()
        );

        expect(out.unverified[0].headline).toBe('Ghost');
        expect(out.unverified[0].warning.length).toBeGreaterThan(0);
    });

    it('completes the run with a strong warning state when every finding is unverified', () => {
        const verify = getVerifier();
        const out = verify(
            [
                { ref_id: 'scn_deadbeef', headline: 'A', bullets: [] },
                { ref_id: 'scn_feedface', headline: 'B', bullets: [] }
            ],
            singleSceneIndex()
        );

        expect(out.verified.length).toBe(0);
        expect(out.unverified.length).toBe(2);
        expect(out.warnings.length).toBeGreaterThanOrEqual(2);
        expect(out.warnings.every(w => w.stage === 'unresolved_ref')).toBe(true);
    });

    it('emits no warnings when every finding is clean', () => {
        const verify = getVerifier();
        const out = verify(
            [{
                ref_id: 'scn_a1b2c3d4',
                ref_label: '3 Party.md',
                ref_path: 'Book 1 Shail + Trisan/3 Party.md',
                headline: 'Clean',
                bullets: []
            }],
            singleSceneIndex()
        );

        expect(out.warnings.length).toBe(0);
    });
});
