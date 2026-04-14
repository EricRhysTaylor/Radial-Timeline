import type { RadialTimelineSettings } from '../types';
import { isProLicenseKeyValid } from './proEntitlement';

export const DEFAULT_PRO_OPEN_BETA_KEY = 'RT-PRO-OPEN-BETA';

export function seedProEntitlement(settings: RadialTimelineSettings): boolean {
    if (isProLicenseKeyValid(settings.proLicenseKey)) return false;
    settings.proLicenseKey = DEFAULT_PRO_OPEN_BETA_KEY;
    return true;
}
