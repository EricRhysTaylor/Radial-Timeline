import type RadialTimelinePlugin from '../main';
import { isProActive } from './proEntitlement';

export type FeatureGate = 'beats' | 'exports' | 'inquiry' | 'runtime' | 'social';

export function isFeatureGateEnabled(
    plugin: RadialTimelinePlugin,
    _featureGate: FeatureGate
): boolean {
    return isProActive(plugin);
}
