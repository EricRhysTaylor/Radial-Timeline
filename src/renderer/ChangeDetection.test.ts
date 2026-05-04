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
    stageTargetDatesHash: 'Zero:|Author:|House:|Press:',
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
    activeBookId: '',
    activeBookTitle: 'Untitled Book',
    readabilityScale: 'normal',
    showChapterMarkers: false,
    activeNovelPandocLayoutId: '',
    recentMovesHash: '',
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

  it('uses a selective update when per-stage target dates change', () => {
    const prev = makeSnapshot();
    const current = makeSnapshot({
      stageTargetDatesHash: 'Zero:2026-07-01|Author:|House:|Press:',
      timestamp: 2
    });

    const result = detectChanges(prev, current);

    expect(result.changeTypes.has(ChangeType.TARGET_DATES)).toBe(true);
    expect(result.canUseSelectiveUpdate).toBe(true);
    expect(result.updateStrategy).toBe('selective');
  });

  it('uses a selective update when the legacy target date changes', () => {
    const prev = makeSnapshot();
    const current = makeSnapshot({
      targetDate: '2026-07-01',
      timestamp: 2
    });

    const result = detectChanges(prev, current);

    expect(result.changeTypes.has(ChangeType.TARGET_DATES)).toBe(true);
    expect(result.canUseSelectiveUpdate).toBe(true);
    expect(result.updateStrategy).toBe('selective');
  });

  it('forces a full render when the active novel PDF layout changes', () => {
    const prev = makeSnapshot({
      activeNovelPandocLayoutId: 'bundled-fiction-signature-literary'
    });
    const current = makeSnapshot({
      activeNovelPandocLayoutId: 'bundled-fiction-modern-classic',
      timestamp: 2
    });

    const result = detectChanges(prev, current);

    expect(result.changeTypes.has(ChangeType.SETTINGS)).toBe(true);
    expect(result.canUseSelectiveUpdate).toBe(false);
    expect(result.updateStrategy).toBe('full');
  });
});
