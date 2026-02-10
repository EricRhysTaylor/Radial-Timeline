import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { RadialTimelineSettings } from '../types/settings';
import { getActiveBookExportContext } from './exportContext';
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
});
