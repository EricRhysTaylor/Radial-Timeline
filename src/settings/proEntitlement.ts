import type RadialTimelinePlugin from '../main';

export type ProEntitlementState = 'beta_active' | 'licensed_active' | 'needs_key';

export const PRO_BETA_EXPIRY_UTC_MS = Date.parse('2026-12-31T23:59:59.000Z');

export function isProfessionalLicenseValid(key: string | undefined): boolean {
    if (!key || key.trim().length === 0) return false;
    // TODO(#SAN-1): Connect to license validation API when beta ends.
    return key.trim().length >= 16;
}

export function isEarlyAccessWindow(nowMs?: number): boolean {
    const now = nowMs ?? Date.now();
    return now < PRO_BETA_EXPIRY_UTC_MS;
}

function validateCachedLicenseKeyIfPresent(plugin: RadialTimelinePlugin): boolean {
    return isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
}

export function getProEntitlementState(
    plugin: RadialTimelinePlugin,
    nowMs?: number
): ProEntitlementState {
    const now = nowMs ?? Date.now();

    // Core-vs-Pro simulation is only honored during Early Access.
    if (isEarlyAccessWindow(now) && plugin.settings.devProActive === false) {
        return 'needs_key';
    }

    const licenseValid = validateCachedLicenseKeyIfPresent(plugin);
    if (licenseValid) return 'licensed_active';
    if (now < PRO_BETA_EXPIRY_UTC_MS) return 'beta_active';
    return 'needs_key';
}

