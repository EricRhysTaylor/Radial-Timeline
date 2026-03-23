import { describe, expect, it } from 'vitest';
import {
  computeSubplotDominanceStates,
  renderSubplotDominanceIndicators
} from './SubplotDominanceIndicators';
import type { TimelineItem } from '../../types';

function makeScene(path: string, subplot: string): TimelineItem {
  return {
    path,
    subplot,
    title: path,
    actNumber: 1
  };
}

describe('computeSubplotDominanceStates', () => {
  it('keeps a subplot shown when it is dominant in at least one shared scene', () => {
    const scenes: TimelineItem[] = [
      makeScene('/scene-1', 'Main Plot'),
      makeScene('/scene-1', 'Romance'),
      makeScene('/scene-2', 'Main Plot'),
      makeScene('/scene-2', 'Mystery')
    ];

    const states = computeSubplotDominanceStates({
      scenes,
      masterSubplotOrder: ['Main Plot', 'Romance', 'Mystery'],
      dominantSubplots: {
        '/scene-1': 'Main Plot',
        '/scene-2': 'Mystery'
      }
    });

    expect(states.get('Main Plot')).toMatchObject({
      hasSharedOverlap: true,
      hasExpressedSharedScenes: true,
      hasHiddenSharedScenes: true
    });
  });
});

describe('renderSubplotDominanceIndicators', () => {
  it('renders mixed dominance subplots as shown instead of hidden', () => {
    const svg = renderSubplotDominanceIndicators({
      masterSubplotOrder: ['Main Plot'],
      ringStartRadii: [200],
      ringWidths: [100],
      subplotStates: new Map([
        ['Main Plot', {
          hasSharedOverlap: true,
          hasExpressedSharedScenes: true,
          hasHiddenSharedScenes: true
        }]
      ]),
      subplotColorFor: () => '#ff77cc'
    });

    expect(svg).toContain('rt-subplot-dominance-flag is-shown');
    expect(svg).toContain('data-subplot-name="Main Plot"');
  });
});
