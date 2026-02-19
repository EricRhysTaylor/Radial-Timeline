import type { ModelInfo } from '../types';

export type RecommendationIntentId = 'inquiry' | 'gossamer' | 'quick' | 'local';

function trimToMaxWords(text: string, maxWords = 14): string {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ');
}

export function formatRecommendationWhy(input: {
    intentId: RecommendationIntentId;
    model: ModelInfo | null;
    routerReason?: string;
}): string {
    if (!input.model) {
        return 'No eligible model; enable provider or refresh snapshot.';
    }

    if (input.intentId === 'inquiry') {
        if (input.model.personality.determinism >= 8) {
            return 'Best for full-manuscript questions with reliable structured answers.';
        }
        return 'Best for full-manuscript questions and broad structural pattern tracking.';
    }

    if (input.intentId === 'gossamer') {
        if (input.model.personality.writing >= 8) {
            return 'Strong thematic and prose sensitivity for momentum and tone shifts.';
        }
        return 'Balances narrative momentum signals with dependable scene-level coherence reads.';
    }

    if (input.intentId === 'quick') {
        return 'Fast iterations for small edits and lightweight writing transforms.';
    }

    if (input.intentId === 'local') {
        return 'Runs locally for privacy, with less depth than cloud models.';
    }

    return trimToMaxWords(
        input.routerReason?.trim() || 'Fits your current settings and requested writing constraints.'
    );
}
