/**
 * APR presets - minimal definitions for derived layout.
 */

export type AprSize = 'thumb' | 'small' | 'medium' | 'large';

export type AprPresetKey = 'xs100' | 'sm150' | 'md300' | 'lg450';

export type AprPreset = {
    key: AprPresetKey;
    outerPx: number;
    innerRadiusPx?: number;
    enableText: boolean;
    enableCenterLabel: boolean;
    density?: number;
};

export const APR_PRESETS: Record<AprPresetKey, AprPreset> = {
    xs100: {
        key: 'xs100',
        outerPx: 100,
        innerRadiusPx: 14,
        enableText: false,
        enableCenterLabel: false,
        density: 0.07,
    },
    sm150: {
        key: 'sm150',
        outerPx: 150,
        enableText: true,
        enableCenterLabel: true,
        density: 0.1,
    },
    md300: {
        key: 'md300',
        outerPx: 300,
        enableText: true,
        enableCenterLabel: true,
        density: 0.4,
    },
    lg450: {
        key: 'lg450',
        outerPx: 450,
        enableText: true,
        enableCenterLabel: true,
        density: 0.55,
    },
} as const;

export const APR_SIZE_TO_PRESET: Record<AprSize, AprPresetKey> = {
    thumb: 'xs100',
    small: 'sm150',
    medium: 'md300',
    large: 'lg450',
};

export function getAprPreset(sizeOrKey: AprSize | AprPresetKey): AprPreset {
    const key = (sizeOrKey in APR_SIZE_TO_PRESET)
        ? APR_SIZE_TO_PRESET[sizeOrKey as AprSize]
        : (sizeOrKey as AprPresetKey);
    return APR_PRESETS[key];
}
