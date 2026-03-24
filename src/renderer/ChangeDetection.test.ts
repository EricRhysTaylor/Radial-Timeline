import { describe, expect, it } from 'vitest';
import { ChangeType, detectChanges, type TimelineSnapshot } from './ChangeDetection';

function makeSnapshot(overrides: Partial<TimelineSnapshot> = {}): TimelineSnapshot {
  return {
    sceneCount: 1,
    sceneHash: 'scene-hash',
    openFilePaths: new Set(),
    searchActive: false,
    searchResults: new Set(),
    currentMode: 'narrative',
    currentMonth: 0,
    currentDate: '2026-03-23',
    sortByWhen: false,
    aiEnabled: false,
    targetDate: undefined,
    chronologueDurationCap: undefined,
    discontinuityThreshold: undefined,
    showBackdropRing: true,
    microBackdropHash: '',
    publishStageColorsHash: '',
    subplotColorsHash: '',
    dominantSubplotsHash: '',
    povMode: 'off',
    gossamerRunExists: false,
    gossamerRunHash: '',
    updateAvailable: false,
    runtimeModeActive: false,
    timestamp: 1,
    ...overrides
  };
}

describe('detectChanges', () => {
  it('forces a full render when dominant subplot preferences change', () => {
    const prev = makeSnapshot();
    const current = makeSnapshot({
      dominantSubplotsHash: '{"scene.md":"Romance"}',
      timestamp: 2
    });

    const result = detectChanges(prev, current);

    expect(result.changeTypes.has(ChangeType.DOMINANT_SUBPLOT)).toBe(true);
    expect(result.canUseSelectiveUpdate).toBe(false);
    expect(result.updateStrategy).toBe('full');
  });
});
