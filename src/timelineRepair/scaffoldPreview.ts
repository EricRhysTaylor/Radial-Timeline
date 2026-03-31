/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard - Scaffold Preview
 * Small presentational helper for the config-phase pattern preview.
 */

import type { PatternPresetId, TimeBucket } from './types';
import { TIME_BUCKET_LABELS } from './types';
import { detectTimeBucket } from './patternSync';

const TWO_BEAT_SEQUENCE: TimeBucket[] = ['morning', 'evening'];
const FOUR_BEAT_SEQUENCE: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];

export interface ScaffoldPreviewStep {
    sceneLabel: string;
    spacingLabel: string;
}

export interface ScaffoldPreviewModel {
    startLabel: string;
    helperLabel: string;
    steps: ScaffoldPreviewStep[];
}

export function buildScaffoldPreview(
    patternPreset: PatternPresetId,
    anchorWhen: Date,
    totalScenes: number,
    maxSteps = 5
): ScaffoldPreviewModel {
    const visibleSteps = Math.max(1, Math.min(Math.max(totalScenes, 1), maxSteps));

    return {
        startLabel: `Start: ${formatAnchorLabel(anchorWhen)}`,
        helperLabel: `Scaffolds ${totalScenes} ${totalScenes === 1 ? 'scene' : 'scenes'} in manuscript order.`,
        steps: buildPreviewLabels(patternPreset, anchorWhen, visibleSteps).map((spacingLabel, index) => ({
            sceneLabel: `S${index + 1}`,
            spacingLabel
        }))
    };
}

function buildPreviewLabels(
    patternPreset: PatternPresetId,
    anchorWhen: Date,
    count: number
): string[] {
    switch (patternPreset) {
        case 'daily':
            return Array.from({ length: count }, (_, index) => `Day ${index + 1}`);
        case 'weekly':
            return Array.from({ length: count }, (_, index) => `Week ${index + 1}`);
        case 'twoBeatDay':
            return buildBeatLabels(TWO_BEAT_SEQUENCE, getTwoBeatStartIndex(anchorWhen), count);
        case 'fourBeatDay':
            return buildBeatLabels(FOUR_BEAT_SEQUENCE, getFourBeatStartIndex(anchorWhen), count);
        default:
            return Array.from({ length: count }, (_, index) => `Step ${index + 1}`);
    }
}

function buildBeatLabels(cycle: TimeBucket[], startIndex: number, count: number): string[] {
    const labels: string[] = [];

    for (let index = 0; index < count; index++) {
        const cycleIndex = (startIndex + index) % cycle.length;
        const bucket = cycle[cycleIndex];
        const wrapped = index > 0 && cycleIndex === 0;
        const bucketLabel = TIME_BUCKET_LABELS[bucket];
        labels.push(wrapped ? `Next ${bucketLabel.toLowerCase()}` : bucketLabel);
    }

    return labels;
}

function getTwoBeatStartIndex(anchorWhen: Date): number {
    return anchorWhen.getHours() < 15 ? 0 : 1;
}

function getFourBeatStartIndex(anchorWhen: Date): number {
    const bucket = detectTimeBucket(anchorWhen);
    return FOUR_BEAT_SEQUENCE.indexOf(bucket);
}

function formatAnchorLabel(anchorWhen: Date): string {
    const dateLabel = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(anchorWhen);

    const timeLabel = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    }).format(anchorWhen);

    return `${dateLabel} · ${timeLabel}`;
}
