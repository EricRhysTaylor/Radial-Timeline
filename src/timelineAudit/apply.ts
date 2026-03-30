/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Auditor - Apply Adapter
 */

import type { App, TFile } from 'obsidian';
import { writeFrontmatterUpdates, type WriteOptions } from '../timelineRepair/frontmatterWriter';
import type { FrontmatterUpdate, FrontmatterWriteResult } from '../timelineRepair/types';
import type { TimelineAuditFinding } from './types';

export interface TimelineAuditApplyPlan {
    whenUpdates: FrontmatterUpdate[];
    reviewOnly: Array<{ file: TFile; needsReview: boolean }>;
}

export function buildAuditApplyPlan(findings: TimelineAuditFinding[]): TimelineAuditApplyPlan {
    const whenUpdates: FrontmatterUpdate[] = [];
    const reviewOnly: Array<{ file: TFile; needsReview: boolean }> = [];

    for (const finding of findings) {
        if (finding.reviewAction === 'apply' && finding.suggestedWhen && finding.suggestedConfidence && finding.suggestedProvenance) {
            whenUpdates.push({
                file: finding.file,
                when: finding.suggestedWhen,
                whenSource: finding.suggestedProvenance,
                whenConfidence: finding.suggestedConfidence,
                needsReview: false
            });
            continue;
        }

        const needsReview = finding.reviewAction === 'mark_review'
            || (finding.reviewAction === 'keep' && finding.unresolved);

        reviewOnly.push({
            file: finding.file,
            needsReview
        });
    }

    return { whenUpdates, reviewOnly };
}

export async function applyAuditFindings(
    app: App,
    findings: TimelineAuditFinding[],
    options: WriteOptions = {}
): Promise<FrontmatterWriteResult> {
    const plan = buildAuditApplyPlan(findings);
    const result = await writeFrontmatterUpdates(app, plan.whenUpdates, options);

    for (const update of plan.reviewOnly) {
        try {
            await app.fileManager.processFrontMatter(update.file, (fm) => {
                const fmObj = fm as Record<string, unknown>;
                if (update.needsReview) {
                    fmObj['NeedsReview'] = true;
                } else if ('NeedsReview' in fmObj) {
                    delete fmObj['NeedsReview'];
                }
            });
        } catch (error) {
            result.failed += 1;
            result.errors.push({
                file: update.file,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    return result;
}
