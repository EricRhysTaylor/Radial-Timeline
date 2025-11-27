import type { RadialTimelineSettings, ReadabilityScale } from '../types';

const SCALE_MAP: Record<ReadabilityScale, number> = {
  normal: 1,
  large: 2
};

export function getReadabilityScale(options?: { readabilityScale?: ReadabilityScale }): ReadabilityScale {
  const value = options?.readabilityScale;
  if (value && value in SCALE_MAP) return value as ReadabilityScale;
  return 'normal';
}

export function getReadabilityMultiplier(settings?: RadialTimelineSettings | { readabilityScale?: ReadabilityScale }): number {
  const scale = getReadabilityScale(settings);
  return SCALE_MAP[scale];
}
