/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type RadialTimelinePlugin from '../main';
import type { BeatItem, ParsedSceneAnalysis, SceneAnalysisJsonResponse } from './types';

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

        if (trimmed.startsWith('{')) {
            const jsonResult = parseJsonBeatsResponse(trimmed, plugin);
            if (jsonResult) return jsonResult;
        }

        const sections = trimmed.split(/\n(?=previousSceneAnalysis:|currentSceneAnalysis:|nextSceneAnalysis:)/);
        const sectionMap: Record<string, string> = {};
        let currentSection = '';

        sections.forEach(section => {
            const match = section.match(/^(previousSceneAnalysis|currentSceneAnalysis|nextSceneAnalysis):/);
            if (match) {
                currentSection = match[1];
                sectionMap[currentSection] = section.substring(match[0].length).trim();
            } else if (currentSection) {
                sectionMap[currentSection] += '\n' + section.trim();
            }
        });

        const buildList = (content: string | undefined): string => {
            if (!content) return '';
            return content
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => (line.startsWith('-') ? line : `- ${line}`))
                .join('\n');
        };

        return {
            previousSceneAnalysis: buildList(sectionMap.previousSceneAnalysis),
            currentSceneAnalysis: buildList(sectionMap.currentSceneAnalysis),
            nextSceneAnalysis: buildList(sectionMap.nextSceneAnalysis)
        };
    } catch (error) {
        console.error('[parseGptResult] Error parsing beats response:', error);
        (plugin as any).lastAnalysisError = String(error);
        return null;
    }
}
