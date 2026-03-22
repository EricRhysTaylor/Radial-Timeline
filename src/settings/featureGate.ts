import type RadialTimelinePlugin from '../main';
import { isProActive } from './proEntitlement';

export function hasProFeatureAccess(plugin: RadialTimelinePlugin): boolean {
    return isProActive(plugin);
}
