/*
 * Dev-only debug infrastructure
 * This module is only loaded in development builds via dynamic import
 */
import type RadialTimelinePlugin from '../main';
import { buildSnapshot } from './snapshot';

export function installDebug(plugin: RadialTimelinePlugin): void {
    (window as any).__RT_DEBUG_SNAPSHOT__ = () => buildSnapshot(plugin);
    (window as any).__RT_DEBUG_CAPS__ = { snapshotVersion: 1 };
}

