import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../../types';
import { computeCacheableValues } from './Precompute';

describe('computeCacheableValues', () => {
    it('uses the project most-advanced publish stage color in Gossamer mode', () => {
        const plugin = {
            settings: {
                currentMode: 'gossamer',
                publishStageColors: {
                    Zero: '#9900ff',
                    Author: '#3366ff',
                    House: '#33aa44',
                    Press: '#ffaa00',
                },
                subplotColors: ['#eeeeee'],
                enableAiSceneAnalysis: false,
                actCount: 3,
            },
            searchActive: false,
            searchResults: new Set<string>(),
            searchTerm: '',
            openScenePaths: new Set<string>(),
            desaturateColor: (hex: string) => hex,
            calculateCompletionEstimate: () => null,
            synopsisManager: {
                generateElement: () => document.createElementNS('http://www.w3.org/2000/svg', 'g'),
            },
        };
        const scenes: TimelineItem[] = [
            {
                title: '1 Opening',
                path: 'Book/1 Opening.md',
                date: '',
                subplot: 'Main Plot',
                actNumber: 1,
                'Publish Stage': 'Author',
            },
            {
                title: '1 Catalyst',
                path: 'Beats/1 Catalyst.md',
                date: '',
                itemType: 'Beat',
                subplot: 'Main Plot',
                actNumber: 1,
                'Publish Stage': 'Zero',
            },
        ];

        const values = computeCacheableValues(plugin as never, scenes);

        expect(values.maxStageColor).toBe('#3366ff');
    });
});
