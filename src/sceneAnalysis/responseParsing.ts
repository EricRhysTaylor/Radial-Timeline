/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type RadialTimelinePlugin from '../main';
import type { BeatItem, ParsedSceneAnalysis, SceneAnalysisJsonResponse } from './types';

function parseJsonBeatsResponse(jsonResult: string, plugin: RadialTimelinePlugin): ParsedSceneAnalysis | null {
    try {
        const parsed = JSON.parse(jsonResult) as SceneAnalysisJsonResponse;
        const convertArrayToString = (items?: BeatItem[]): string => {
            if (!Array.isArray(items) || items.length === 0) return '';
            return items
                .map(item => {
                    const sceneSegment = item.scene ? `${item.scene}` : '';
                    const titleSegment = item.title ? ` ${item.title}` : '';
                    const gradeSegment = item.grade ? ` ${item.grade}` : '';
                    const commentSegment = item.comment ? ` / ${item.comment}` : '';
                    return `- ${sceneSegment}${titleSegment}${gradeSegment}${commentSegment}`.trim();
                })
                .join('\n');
        };

        return {
            previousSceneAnalysis: convertArrayToString(parsed.previousSceneAnalysis),
            currentSceneAnalysis: convertArrayToString(parsed.currentSceneAnalysis),
            nextSceneAnalysis: convertArrayToString(parsed.nextSceneAnalysis)
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

        const trimmed = gptResult.trim();
        if (trimmed.startsWith('{')) {
            const jsonResult = parseJsonBeatsResponse(gptResult, plugin);
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
