import type { CorpusManifest, InquiryRunTrace, InquiryRunnerInput } from '../runner/types';
import type { InquiryRunnerService } from '../runner/InquiryRunnerService';
import { isStableSceneId } from '../../ai/references/sceneRefNormalizer';

function buildDeterministicEstimateSceneId(path: string): string {
    let hash = 2166136261;
    for (let i = 0; i < path.length; i += 1) {
        hash ^= path.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const hex = (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
    return `scn_${hex}`;
}

function buildEstimateManifest(manifest: CorpusManifest): CorpusManifest {
    return {
        ...manifest,
        entries: manifest.entries.map(entry => {
            if (entry.class !== 'scene') return entry;
            if (isStableSceneId(entry.sceneId)) return entry;
            return {
                ...entry,
                sceneId: buildDeterministicEstimateSceneId(entry.path)
            };
        })
    };
}

export async function buildInquiryEstimateTrace(
    runner: InquiryRunnerService,
    input: InquiryRunnerInput
): Promise<InquiryRunTrace> {
    return await runner.buildTrace({
        ...input,
        corpus: buildEstimateManifest(input.corpus)
    });
}
