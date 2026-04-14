import { describe, expect, it } from 'vitest';
import type { RadialTimelineSettings } from '../types';
import { DEFAULT_SETTINGS } from './defaults';
import { DEFAULT_PRO_OPEN_BETA_KEY, seedProEntitlement } from './proEntitlementSeed';

function createSettings(overrides: Partial<RadialTimelineSettings> = {}): RadialTimelineSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides
    } as RadialTimelineSettings;
}

describe('seedProEntitlement', () => {
    it('seeds the open-beta key for fresh vault settings', () => {
        const settings = createSettings();

        const changed = seedProEntitlement(settings);

        expect(changed).toBe(true);
        expect(settings.proLicenseKey).toBe(DEFAULT_PRO_OPEN_BETA_KEY);
    });

    it('preserves an existing valid key', () => {
        const settings = createSettings({
            proLicenseKey: '1234567890abcdef'
        });

        const changed = seedProEntitlement(settings);

        expect(changed).toBe(false);
        expect(settings.proLicenseKey).toBe('1234567890abcdef');
    });
});
