import type { SceneRef } from '../types';

const SCENE_ID_REGEX = /^scn_[a-f0-9]{8,10}$/i;

type SceneRefEntry = {
    sceneId: string;
    path: string;
    label?: string;
};

export type SceneRefIndex = {
    bySceneId: Map<string, SceneRefEntry>;
    byPath: Map<string, SceneRefEntry>;
    byLabel: Map<string, SceneRefEntry>;
};

export type SceneRefNormalizationResult = {
    ref: SceneRef;
    normalizedFromLegacy: boolean;
    warning?: string;
};

export function isStableSceneId(value: string | null | undefined): boolean {
    if (typeof value !== 'string') return false;
    return SCENE_ID_REGEX.test(value.trim());
}

export function buildSceneRefIndex(entries: SceneRefEntry[]): SceneRefIndex {
    const bySceneId = new Map<string, SceneRefEntry>();
    const byPath = new Map<string, SceneRefEntry>();
    const byLabel = new Map<string, SceneRefEntry>();

    entries.forEach(entry => {
        const sceneId = normalizeSceneId(entry.sceneId);
        const path = normalizeText(entry.path);
        if (!sceneId || !path) return;

        const canonical: SceneRefEntry = {
            sceneId,
            path,
            label: normalizeText(entry.label)
        };

        bySceneId.set(sceneId.toLowerCase(), canonical);
        byPath.set(path.toLowerCase(), canonical);
        if (canonical.label) {
            byLabel.set(canonical.label.toLowerCase(), canonical);
        }
    });

    return {
        bySceneId,
        byPath,
        byLabel
    };
}

export function normalizeSceneRef(
    input: Partial<SceneRef>,
    index: SceneRefIndex,
    options?: { fallbackRefId?: string }
): SceneRefNormalizationResult {
    const rawRefId = normalizeText(input.ref_id);
    const rawRefPath = normalizeText(input.ref_path);
    const rawRefLabel = normalizeText(input.ref_label);

    if (rawRefId && isStableSceneId(rawRefId)) {
        return {
            ref: {
                ref_id: normalizeSceneId(rawRefId)!,
                ref_label: rawRefLabel,
                ref_path: rawRefPath
            },
            normalizedFromLegacy: false
        };
    }

    const candidates = [rawRefId, rawRefPath, rawRefLabel].filter((value): value is string => !!value);

    for (const candidate of candidates) {
        const byPath = index.byPath.get(candidate.toLowerCase());
        if (byPath) {
            return {
                ref: {
                    ref_id: byPath.sceneId,
                    ref_label: rawRefLabel,
                    ref_path: rawRefPath ?? byPath.path
                },
                normalizedFromLegacy: true,
                warning: `Normalized legacy scene reference "${candidate}" to ${byPath.sceneId}.`
            };
        }

        const byLabel = index.byLabel.get(candidate.toLowerCase());
        if (byLabel) {
            return {
                ref: {
                    ref_id: byLabel.sceneId,
                    ref_label: rawRefLabel ?? byLabel.label,
                    ref_path: rawRefPath ?? byLabel.path
                },
                normalizedFromLegacy: true,
                warning: `Normalized legacy scene label "${candidate}" to ${byLabel.sceneId}.`
            };
        }

        const bySceneId = index.bySceneId.get(candidate.toLowerCase());
        if (bySceneId) {
            return {
                ref: {
                    ref_id: bySceneId.sceneId,
                    ref_label: rawRefLabel,
                    ref_path: rawRefPath ?? bySceneId.path
                },
                normalizedFromLegacy: false
            };
        }
    }

    const fallbackStable = normalizeSceneId(options?.fallbackRefId);
    if (fallbackStable) {
        return {
            ref: {
                ref_id: fallbackStable,
                ref_label: rawRefLabel,
                ref_path: rawRefPath
            },
            normalizedFromLegacy: true,
            warning: rawRefId
                ? `Could not resolve "${rawRefId}" to a known scene; used fallback ${fallbackStable}.`
                : `Missing scene reference; used fallback ${fallbackStable}.`
        };
    }

    const fallbackRefId = rawRefId || rawRefPath || rawRefLabel || 'unknown';
    return {
        ref: {
            ref_id: fallbackRefId,
            ref_label: rawRefLabel,
            ref_path: rawRefPath
        },
        normalizedFromLegacy: true,
        warning: rawRefId
            ? `Could not normalize scene reference "${rawRefId}" to a stable scene id.`
            : 'Missing scene reference id.'
    };
}

function normalizeSceneId(value: string | null | undefined): string | undefined {
    const normalized = normalizeText(value);
    if (!normalized || !isStableSceneId(normalized)) return undefined;
    return normalized.toLowerCase();
}

function normalizeText(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
