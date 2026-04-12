import { describe, expect, it } from 'vitest';
import { hasProFeatureAccess } from './featureGate';

describe('hasProFeatureAccess', () => {
    it('uses Pro entitlement as the single feature access source', () => {
        expect(hasProFeatureAccess({
            settings: {}
        } as any)).toBe(true);

        expect(hasProFeatureAccess({
            settings: {
                proAccessEnabled: true
            }
        } as any)).toBe(true);

        expect(hasProFeatureAccess({
            settings: {
                proLicenseKey: '1234567890abcdef',
                proAccessEnabled: false
            }
        } as any)).toBe(false);
    });
});
