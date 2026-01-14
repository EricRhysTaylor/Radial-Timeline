import type RadialTimelinePlugin from '../main';
import { TimelineItem } from '../types/timeline';
import { isNonSceneItem } from '../utils/sceneHelpers';
import { STAGE_ORDER } from '../utils/constants';
import type { MilestoneInfo } from '../renderer/components/MilestoneIndicator';

/**
 * Milestones Service - Single source of truth for stage completion milestones.
 * 
 * MILESTONES SYSTEM (this service):
 * - Detects when stages are COMPLETELY done (all scenes at that stage complete)
 * - Shows celebration hero cards in settings (PublicationSection)
 * - Shows pulsing indicator on timeline (above Help icon)
 * - Detects staleness warnings (author getting behind)
 * 
 * Used by:
 * - PublicationSection (Progress Tracker in settings - hero cards with quotes)
 * - Timeline indicator (pulsing icon above Help icon, bottom-right)
 * 
 * SEPARATE FROM: TimelineMetricsService (estimation/tick tracking system)
 * - TimelineMetricsService: Progress tracking, completion estimates, target dates
 * - Shows tick marks on timeline, calculates pace, estimates completion dates
 * - Much more nuanced - tracks progress through stages, not just completions
 * 
 * Keep these systems separate - they serve different purposes:
 * - Milestones: Celebration & encouragement (binary: stage done or not)
 * - Estimation: Progress tracking & planning (continuous: pace, dates, remaining)
 */
export class MilestonesService {
    constructor(private plugin: RadialTimelinePlugin) {}

    /**
     * Detect milestones for celebration or encouragement.
     * 
     * Milestone detection logic:
     * 1. Find the highest stage that has ANY scenes
     * 2. Check if ALL scenes at that highest stage are complete
     *    AND no scenes remain at lower stages (must be promoted up)
     * 3. If yes → celebrate that stage completion (Zero/Author/House/Press)
     * 4. If no completion → check for staleness warnings (author getting behind)
     * 
     * Priority: Book complete > Stage complete > Staleness encouragement
     * 
     * Note: This is binary detection (stage done or not), not continuous progress tracking.
     * For progress tracking, see TimelineMetricsService.calculateCompletionEstimate()
     */
    public detectMilestone(scenes: TimelineItem[]): MilestoneInfo | null {
        const sceneNotesOnly = scenes.filter(scene => !isNonSceneItem(scene));
        if (sceneNotesOnly.length === 0) return null;

        const normalizeStage = (raw: unknown): (typeof STAGE_ORDER)[number] => {
            const v = (raw ?? 'Zero').toString().trim().toLowerCase();
            const match = STAGE_ORDER.find(stage => stage.toLowerCase() === v);
            return match ?? 'Zero';
        };

        const isCompleted = (status: unknown): boolean => {
            const val = Array.isArray(status) ? status[0] : status;
            const normalized = (val ?? '').toString().trim().toLowerCase();
            return normalized === 'complete' || normalized === 'completed' || normalized === 'done';
        };

        // STEP 1: Check for stage completions
        // Find the highest stage that has any scenes
        const highestStageWithScenes = [...STAGE_ORDER].reverse().find(stage =>
            sceneNotesOnly.some(scene => normalizeStage(scene['Publish Stage']) === stage)
        );
        
        if (!highestStageWithScenes) return null;
        
        const highestStageIndex = STAGE_ORDER.indexOf(highestStageWithScenes);
        const hasLowerStageScenes = sceneNotesOnly.some(scene => {
            const sceneStageIndex = STAGE_ORDER.indexOf(normalizeStage(scene['Publish Stage']));
            return sceneStageIndex < highestStageIndex;
        });

        // Check if ALL scenes at the highest stage are complete
        // AND there are no scenes still at lower stages.
        // This is what triggers the hero card celebrations in PublicationSection
        const scenesAtHighestStage = sceneNotesOnly.filter(scene => 
            normalizeStage(scene['Publish Stage']) === highestStageWithScenes
        );
        const allComplete = scenesAtHighestStage.length > 0 && 
            scenesAtHighestStage.every(scene => isCompleted(scene.status));
        
        if (allComplete && !hasLowerStageScenes) {
            // Stage is completely done → show celebration milestone
            // This syncs with the hero cards in PublicationSection (Zero/Author/House/Press complete)
            if (highestStageWithScenes === 'Press') {
                return { type: 'book-complete', stage: highestStageWithScenes };
            } else if (highestStageWithScenes === 'House') {
                return { type: 'stage-house-complete', stage: highestStageWithScenes };
            } else if (highestStageWithScenes === 'Author') {
                return { type: 'stage-author-complete', stage: highestStageWithScenes };
            } else if (highestStageWithScenes === 'Zero') {
                return { type: 'stage-zero-complete', stage: highestStageWithScenes };
            }
        }

        // STEP 2: Check for staleness warnings (author getting behind)
        // This also syncs with PublicationSection which shows warn/late/stalled styling
        try {
            const estimate = this.plugin.calculateCompletionEstimate(scenes);
            if (estimate && estimate.staleness !== 'fresh') {
                if (estimate.staleness === 'stalled') {
                    return { type: 'staleness-stalled' };
                } else if (estimate.staleness === 'late') {
                    return { type: 'staleness-late' };
                } else if (estimate.staleness === 'warn') {
                    return { type: 'staleness-warn' };
                }
            }
        } catch {
            // Estimate calculation failed - skip staleness check
        }

        return null;
    }
}
