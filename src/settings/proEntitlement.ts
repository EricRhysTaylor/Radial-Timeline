import type RadialTimelinePlugin from '../main';

export type ProEntitlementState = 'active' | 'inactive';

export interface ProEntitlement {
    state: ProEntitlementState;
    isProActive: boolean;
    hasProLicenseKey: boolean;
}

export function isProLicenseKeyValid(key: string | undefined): boolean {
    if (!key || key.trim().length === 0) return false;
    return key.trim().length >= 16;
}

export function getProEntitlement(plugin: RadialTimelinePlugin): ProEntitlement {
    const hasProLicenseKey = isProLicenseKeyValid(plugin.settings.proLicenseKey);
    return {
        state: hasProLicenseKey ? 'active' : 'inactive',
        isProActive: hasProLicenseKey,
        hasProLicenseKey
    };
}

export function isProActive(plugin: RadialTimelinePlugin): boolean {
    return getProEntitlement(plugin).isProActive;
}
