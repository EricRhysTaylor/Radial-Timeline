import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { RadialTimelineSettings } from '../types/settings';
import { getActiveBookExportContext } from './exportContext';
import { shouldSeedBookProfileFromLegacySettings } from './books';
import type RadialTimelinePlugin from '../main';

describe('getActiveBookExportContext', () => {
  it('resolves active profile and derives fileStem', () => {
    const settings: RadialTimelineSettings = {
      ...DEFAULT_SETTINGS,
      sourcePath: 'Legacy/Path',
      books: [
        { id: 'b1', title: 'Book One', sourceFolder: 'Books/One', fileStem: 'OneStem' },
        { id: 'b2', title: 'Second Book', sourceFolder: 'Books/Two' }
      ],
      activeBookId: 'b2'
    };

    const plugin = { settings } as RadialTimelinePlugin;
    const ctx = getActiveBookExportContext(plugin);
    expect(ctx).toEqual({
      sourceFolder: 'Books/Two',
      title: 'Second Book',
      fileStem: 'Second-Book'
    });

    settings.activeBookId = 'b1';
    const ctx2 = getActiveBookExportContext(plugin);
    expect(ctx2).toEqual({
      sourceFolder: 'Books/One',
      title: 'Book One',
      fileStem: 'OneStem'
    });
  });

  it('falls back cleanly when no books are configured', () => {
    const settings: RadialTimelineSettings = {
      ...DEFAULT_SETTINGS,
      books: [],
      activeBookId: undefined,
      sourcePath: ''
    };

    const plugin = { settings } as RadialTimelinePlugin;
    const ctx = getActiveBookExportContext(plugin);
    expect(ctx).toEqual({
      sourceFolder: '',
      title: 'Untitled Manuscript',
      fileStem: 'Untitled-Manuscript'
    });
  });
});

describe('shouldSeedBookProfileFromLegacySettings', () => {
  it('returns false for a clean empty settings state', () => {
    expect(shouldSeedBookProfileFromLegacySettings({
      sourcePath: '',
      legacyTitle: ''
    })).toBe(false);
  });

  it('returns true when legacy data exists', () => {
    expect(shouldSeedBookProfileFromLegacySettings({
      sourcePath: 'Books/One',
      legacyTitle: ''
    })).toBe(true);

    expect(shouldSeedBookProfileFromLegacySettings({
      sourcePath: '',
      legacyTitle: 'Legacy Title'
    })).toBe(true);
  });
});
