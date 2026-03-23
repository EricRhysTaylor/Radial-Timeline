import { describe, expect, it } from 'vitest';
import { inferLocalLlmCapability, LOCAL_LLM_TIER_FEATURES } from './capabilityInference';
import type { LocalLlmDiagnosticsReport } from './diagnostics';

const buildDiagnostics = (overrides: Partial<LocalLlmDiagnosticsReport> = {}): LocalLlmDiagnosticsReport => ({
    backend: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelId: 'mistral-nemo:12b',
    reachable: { ok: true, message: 'Ollama responded with 4 models.' },
    modelAvailable: { ok: true, message: 'Model "mistral-nemo:12b" is available.' },
    basicCompletion: { ok: true, message: 'Basic completion succeeded.' },
    structuredJson: { ok: true, message: 'Structured JSON path succeeded.' },
    repairPath: { ok: true, message: 'Repair path self-check succeeded.' },
    ...overrides
});

describe('inferLocalLlmCapability', () => {
    it('returns tier 0 when backend validation fails', () => {
        const assessment = inferLocalLlmCapability({
            modelId: 'llama3.1:8b',
            diagnostics: buildDiagnostics({
                reachable: { ok: false, message: 'connect timeout' }
            })
        });
        expect(assessment.tier).toBe(0);
        expect(assessment.confidence).toBe('validated');
    });

    it('returns tier 1 when structured JSON fails', () => {
        const assessment = inferLocalLlmCapability({
            modelId: 'llama3.1:8b',
            diagnostics: buildDiagnostics({
                structuredJson: { ok: false, message: 'Expected object but got markdown.' }
            })
        });
        expect(assessment.tier).toBe(1);
        expect(assessment.featureSupport).toEqual(LOCAL_LLM_TIER_FEATURES[1]);
    });

    it('returns tier 4 for a validated strong local model', () => {
        const assessment = inferLocalLlmCapability({
            modelId: 'mistral-nemo:12b',
            contextWindow: 131072,
            maxOutput: 8192,
            diagnostics: buildDiagnostics()
        });
        expect(assessment.tier).toBe(4);
        expect(assessment.featureSupport.inquiry).toBe('yes');
    });

    it('returns a conservative heuristic tier for an unvalidated 8B model', () => {
        const assessment = inferLocalLlmCapability({
            modelId: 'llama3.1:8b',
            contextWindow: 32768,
            maxOutput: 4096
        });
        expect(assessment.tier).toBe(3);
        expect(assessment.confidence).toBe('heuristic');
    });

    it('keeps models without clear size hints conservative', () => {
        const assessment = inferLocalLlmCapability({
            modelId: 'local-model',
            contextWindow: 32768,
            maxOutput: 2048
        });
        expect(assessment.tier).toBe(2);
    });
});
