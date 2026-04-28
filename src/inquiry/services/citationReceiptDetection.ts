/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Detect "citations were requested but the response carried zero anchors."
 *
 * Sibling to cacheMissDetection — the engine pill already shows the
 * outcome, this detector decides whether to escalate to a Notice + run-log
 * note. Pure function, no side effects.
 *
 * Important: the detector deliberately stays silent when the active model
 * has no citation capability at all (the toggle is honored at the request
 * level but the provider cannot emit anchors). Surfacing a warning in that
 * case would be a false alarm — the user already chose this model knowing
 * it does not support source anchoring.
 */

export type CitationReceiptDetection =
    | {
        kind: 'citations_requested_but_missing';
        /** What the user requested. Echoed back so the message can be specific. */
        modelLabel: string;
    }
    | { kind: 'citations_disabled' }
    | { kind: 'model_does_not_support_citations' }
    | { kind: 'citations_received_as_expected'; count: number };

export interface DetectCitationReceiptArgs {
    citationsRequested: boolean;
    /**
     * Whether the active model can actually emit citations. False for models
     * with no citation capability (heuristic-only providers, generic chat
     * endpoints, etc.). Pass true when uncertain — a false alarm here is
     * better than silently missing a real misconfiguration.
     */
    modelSupportsCitations: boolean;
    /** Number of citation anchors the provider returned. */
    citationCount: number;
    /** Display label for the active model — used in the surfaced message. */
    modelLabel: string;
}

export function detectCitationReceipt(args: DetectCitationReceiptArgs): CitationReceiptDetection {
    if (!args.citationsRequested) return { kind: 'citations_disabled' };
    if (!args.modelSupportsCitations) return { kind: 'model_does_not_support_citations' };
    if (args.citationCount > 0) {
        return { kind: 'citations_received_as_expected', count: args.citationCount };
    }
    return { kind: 'citations_requested_but_missing', modelLabel: args.modelLabel };
}

/**
 * Build a short human-readable warning. Returns null for non-warning
 * outcomes so the caller can `if (!message) return;` cleanly.
 */
export function describeCitationReceiptDetection(
    detection: CitationReceiptDetection
): string | null {
    if (detection.kind !== 'citations_requested_but_missing') return null;
    return `Citations enabled but ${detection.modelLabel} returned zero anchors. Findings will not be source-anchored. Check the citations toggle, the model's capability, or the request payload.`;
}
