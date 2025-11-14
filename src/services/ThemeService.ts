import type RadialTimelinePlugin from '../main';
import { DEFAULT_SETTINGS } from '../main';

export class ThemeService {
    constructor(private plugin: RadialTimelinePlugin) {}

    applyCssVariables(): void {
        const root = document.documentElement;
        const { publishStageColors, subplotColors } = this.plugin.settings;

        Object.entries(publishStageColors).forEach(([stage, color]) => {
            root.style.setProperty(`--rt-publishStageColors-${stage}`, color);
            const rgbValues = this.hexToRGB(color);
            if (rgbValues) {
                root.style.setProperty(`--rt-publishStageColors-${stage}-rgb`, rgbValues);
            }
        });

        if (Array.isArray(subplotColors)) {
            for (let i = 0; i < 16; i++) {
                const color = subplotColors[i] || DEFAULT_SETTINGS.subplotColors[i];
                if (color) {
                    root.style.setProperty(`--rt-subplot-colors-${i}`, color);
                }
            }
        }
    }

    private hexToRGB(hex: string): string | null {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return null;
        }

        return `${r}, ${g}, ${b}`;
    }
}
