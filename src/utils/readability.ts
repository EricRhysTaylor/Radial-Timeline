import type { RadialTimelineSettings, ReadabilityScale } from '../types';

const SCALE_MAP: Record<ReadabilityScale, number> = {
  normal: 1,
  large: 1.4
};

/** Maximum scale factor - corresponds to 'large' setting */
const MAX_SCALE = 1.4;

/** Track last known zoom factor for change detection */
let lastKnownZoomFactor = 1;

/** Callback for zoom change notifications */
let zoomChangeCallback: (() => void) | null = null;

/** Polling interval ID */
let zoomPollingInterval: number | null = null;

export function getReadabilityScale(options?: { readabilityScale?: ReadabilityScale }): ReadabilityScale {
  const value = options?.readabilityScale;
  if (value && value in SCALE_MAP) return value as ReadabilityScale;
  return 'normal';
}

/**
 * Get Obsidian's current zoom factor.
 * Tries multiple detection methods:
 * 1. Electron webFrame API (for View > Zoom)
 * 2. CSS zoom on body (for Settings > Appearance > Zoom)
 * 3. CSS transform scale on app container
 * Returns 1.0 if unable to detect or if zoom is at default.
 */
export function getObsidianZoomFactor(): number {
  try {
    // Method 1: Electron webFrame API (View > Zoom In/Out)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electronRequire = (window as any).require?.('electron');
    if (electronRequire?.webFrame) {
      const zoomFactor = electronRequire.webFrame.getZoomFactor();
      if (Number.isFinite(zoomFactor) && zoomFactor > 0 && zoomFactor !== 1) {
        return zoomFactor;
      }
    }
  } catch {
    // Electron API not available
  }

  try {
    // Method 2: Check CSS zoom on body (some Obsidian versions use this)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyZoom = (getComputedStyle(document.body) as any).zoom;
    if (bodyZoom && bodyZoom !== 'normal' && bodyZoom !== '1') {
      const zoomValue = parseFloat(bodyZoom);
      if (Number.isFinite(zoomValue) && zoomValue > 0) {
        return zoomValue;
      }
    }
  } catch {
    // CSS zoom not available
  }

  try {
    // Method 3: Check for transform scale on app container
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      const transform = getComputedStyle(appContainer).transform;
      if (transform && transform !== 'none') {
        // Parse matrix(a, b, c, d, tx, ty) - 'a' is the scale factor
        const match = transform.match(/matrix\(([^,]+)/);
        if (match) {
          const scale = parseFloat(match[1]);
          if (Number.isFinite(scale) && scale > 0 && scale !== 1) {
            return scale;
          }
        }
      }
    }
  } catch {
    // Transform detection failed
  }

  return 1;
}

/**
 * Start polling for zoom changes.
 * Calls the callback when zoom factor changes.
 */
export function startZoomPolling(callback: () => void): void {
  zoomChangeCallback = callback;
  lastKnownZoomFactor = getObsidianZoomFactor();
  
  // Poll every 500ms for zoom changes
  if (zoomPollingInterval) clearInterval(zoomPollingInterval);
  zoomPollingInterval = window.setInterval(() => {
    const currentZoom = getObsidianZoomFactor();
    if (currentZoom !== lastKnownZoomFactor) {
      lastKnownZoomFactor = currentZoom;
      zoomChangeCallback?.();
    }
  }, 500);
}

/**
 * Stop polling for zoom changes.
 */
export function stopZoomPolling(): void {
  if (zoomPollingInterval) {
    clearInterval(zoomPollingInterval);
    zoomPollingInterval = null;
  }
  zoomChangeCallback = null;
}

/**
 * Get the combined readability multiplier.
 * Combines plugin's readability setting with Obsidian's zoom level,
 * capped at the maximum scale (1.4x = 'large' setting).
 */
export function getReadabilityMultiplier(settings?: RadialTimelineSettings | { readabilityScale?: ReadabilityScale }): number {
  const pluginScale = SCALE_MAP[getReadabilityScale(settings)];
  const obsidianZoom = getObsidianZoomFactor();
  
  // Combine scales: if plugin is 'normal' (1.0), Obsidian zoom can increase it
  // If plugin is 'large' (1.4), it's already at max
  const combinedScale = pluginScale * obsidianZoom;
  
  // Cap at maximum scale
  return Math.min(combinedScale, MAX_SCALE);
}

/**
 * Get raw plugin readability multiplier without Obsidian zoom.
 * Use this when you need just the plugin setting.
 */
export function getPluginReadabilityMultiplier(settings?: RadialTimelineSettings | { readabilityScale?: ReadabilityScale }): number {
  const scale = getReadabilityScale(settings);
  return SCALE_MAP[scale];
}
