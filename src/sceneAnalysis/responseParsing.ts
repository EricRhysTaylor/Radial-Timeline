/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type RadialTimelinePlugin from '../main';
import type { BeatItem, ParsedSceneAnalysis, SceneAnalysisJsonResponse } from './types';

const MAIN_GRADE_VALUES = new Set(['A', 'B', 'C']);
const LINK_GRADE_VALUES = new Set(['+', '-', '?']);

function formatBeatLines(
    items: BeatItem[] | undefined,
    section: 'previous' | 'current' | 'next'
): string {
    if (!Array.isArray(items) || items.length === 0) return '';

    return items
        .map((item, index) => {
            const sceneNumber = typeof item.scene === 'string' ? item.scene.trim() : '';
            const title = typeof item.title === 'string' ? item.title.trim() : '';
            const grade = typeof item.grade === 'string' ? item.grade.trim() : '';
            const comment = typeof item.comment === 'string' ? item.comment.trim() : '';

            let lineCore = '';

            if (section === 'current' && index === 0) {
                // Scene pulse headline: "<scene> <grade>"
                lineCore = [sceneNumber, grade.toUpperCase()].filter(Boolean).join(' ').trim();
            } else {
                const pieces: string[] = [];
                if (index === 0 && sceneNumber) pieces.push(sceneNumber);
                if (title) pieces.push(title);
                if (grade) pieces.push(grade);
                lineCore = pieces.join(' ').trim();
            }

            if (!lineCore && comment) lineCore = comment;
            const commentSegment = comment ? ` / ${comment}` : '';
            return `- ${lineCore}${commentSegment}`.trim();
        })
        .join('\n');
}

function validateSceneAnalysisPayload(payload: SceneAnalysisJsonResponse): void {
    if (!Array.isArray(payload.currentSceneAnalysis) || payload.currentSceneAnalysis.length < 2) {
        throw new Error('currentSceneAnalysis must contain an overall grade plus additional pulse points.');
    }

    const [firstCurrent, ...restCurrent] = payload.currentSceneAnalysis;
    if (!firstCurrent || !MAIN_GRADE_VALUES.has(firstCurrent.grade)) {
        throw new Error('The first currentSceneAnalysis item must use grade A, B, or C.');
    }

    restCurrent.forEach((item, index) => {
        if (!LINK_GRADE_VALUES.has(item.grade)) {
            throw new Error(`currentSceneAnalysis item #${index + 2} must use "+", "-", or "?".`);
        }
    });

    const ensureLinkGrades = (items: BeatItem[] | undefined, label: string) => {
        if (!items) return;
        items.forEach((item, index) => {
            if (!LINK_GRADE_VALUES.has(item.grade)) {
                throw new Error(`${label} item #${index + 1} must use "+", "-", or "?".`);
            }
        });
    };

    ensureLinkGrades(payload.previousSceneAnalysis, 'previousSceneAnalysis');
    ensureLinkGrades(payload.nextSceneAnalysis, 'nextSceneAnalysis');
}

function sanitizeJsonControlCharacters(input: string): string {
    // Replace unescaped control characters (except common whitespace) with spaces so JSON.parse succeeds.
    return input.replace(/[\u0000-\u001F]/g, char => {
        if (char === '\n' || char === '\r' || char === '\t') {
            return char;
        }
        return ' ';
    });
}

function parseJsonBeatsResponse(jsonResult: string, plugin: RadialTimelinePlugin): ParsedSceneAnalysis | null {
    try {
        let parsed: SceneAnalysisJsonResponse;
        try {
            parsed = JSON.parse(jsonResult) as SceneAnalysisJsonResponse;
        } catch (error) {
            if (error instanceof SyntaxError) {
                const sanitized = sanitizeJsonControlCharacters(jsonResult);
                if (sanitized !== jsonResult) {
                    parsed = JSON.parse(sanitized) as SceneAnalysisJsonResponse;
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
        validateSceneAnalysisPayload(parsed);
        (plugin as any).lastAnalysisError = '';
        return {
            previousSceneAnalysis: formatBeatLines(parsed.previousSceneAnalysis, 'previous'),
            currentSceneAnalysis: formatBeatLines(parsed.currentSceneAnalysis, 'current'),
            nextSceneAnalysis: formatBeatLines(parsed.nextSceneAnalysis, 'next')
        };
    } catch (error) {
        console.error('[parseJsonBeatsResponse] Error parsing JSON beats response:', error);
        (plugin as any).lastAnalysisError = String(error);
        return null;
    }
}

export function parseGptResult(gptResult: string, plugin: RadialTimelinePlugin): ParsedSceneAnalysis | null {
    try {
        if (!gptResult || typeof gptResult !== 'string') {
            throw new Error('LLM returned empty result.');
        }

        let trimmed = gptResult.trim();
        if (trimmed.startsWith('```')) {
            trimmed = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/i, '');
            if (trimmed.endsWith('```')) {
                trimmed = trimmed.slice(0, -3);
            }
            trimmed = trimmed.trim();
        }

        if (!trimmed.startsWith('{')) {
            throw new Error('LLM response was not valid JSON.');
        }

        const jsonResult = parseJsonBeatsResponse(trimmed, plugin);
        if (jsonResult) {
            (plugin as any).lastAnalysisError = '';
            return jsonResult;
        }
        return null;
    } catch (error) {
        console.error('[parseGptResult] Error parsing beats response:', error);
        (plugin as any).lastAnalysisError = String(error);
        return null;
    }
}
