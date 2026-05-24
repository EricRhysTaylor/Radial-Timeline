import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { getActiveRefactorAlerts } from './refactorAlerts';

describe('settings notification center log-folder alert', () => {
    it('shows the log folder structure notification as the lowest-priority info alert', () => {
        const active = getActiveRefactorAlerts({ ...DEFAULT_SETTINGS, dismissedAlerts: [] });
        const ids = active.map(alert => alert.id);
        const alert = active.find(item => item.id === 'logs-folder-structure-v1');

        expect(alert).toMatchObject({
            severity: 'info',
            icon: 'folder-tree',
            title: 'Log folders reorganized'
        });
        expect(alert?.description).toContain('Radial Timeline/Logs');
        expect(alert?.description).toContain('Inquiry');
        expect(alert?.description).toContain('Gossamer');
        expect(alert?.description).toContain('Pulse');
        expect(alert?.description).toContain('Moves');
        expect(alert?.description).toContain('Snapshots');
        expect(alert?.description).toContain('Gossamer Archive');
        expect(ids.at(-1)).toBe('logs-folder-structure-v1');
    });
});
