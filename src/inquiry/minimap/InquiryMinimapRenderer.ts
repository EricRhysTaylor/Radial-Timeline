/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Rendering engine for the Inquiry minimap: backbone, tick layout,
 * pressure gauge, sweep animation, and supporting color math.
 *
 * ⚠️ GUARDRAIL: This class owns SVG elements and animation state
 *    but does NOT query plugin, vault, or InquiryView state.
 *    All data needed is passed in explicitly via method parameters.
 *    If a method needs view state, InquiryView gathers it first
 *    and passes it as an argument.
 */

import type { InquiryCorpusItem } from '../services/InquiryCorpusResolver';
import type { InquiryReadinessUiState, PassPlanResult } from '../types';
import type { InquiryRunProgressEvent } from '../runner/types';
import type { InquiryRoleValidation, InquiryScope, InquirySelectionMode } from '../state';
import type { AIRunAdvancedContext } from '../../ai/types';
import { createSvgElement, createSvgGroup, createSvgText, clearSvgChildren } from './svgUtils';
import { addTooltipData, balanceTooltipText } from '../../utils/tooltip';
import { buildPassIndicator } from '../services/readiness';
import { buildMinimapSubsetResult } from '../services/minimapSubset';

// ── Types ────────────────────────────────────────────────────────────

export type RgbColor = {
    r: number;
    g: number;
    b: number;
};

export type BackboneColors = {
    gradient: RgbColor[];
    shine: RgbColor[];
};

// ── Constants ────────────────────────────────────────────────────────

export const MINIMAP_GROUP_Y = -520;
export const MINIMAP_TOKEN_CAP_Y = 7;
export const MINIMAP_TOKEN_CAP_BAR_HEIGHT = 4;
export const MINIMAP_TOKEN_CAP_ENDCAP_HEIGHT = 10;
export const MINIMAP_TOKEN_CAP_SPLIT_TICK_HEIGHT = MINIMAP_TOKEN_CAP_ENDCAP_HEIGHT;
export const MINIMAP_TOKEN_CAP_SPLIT_TICK_WIDTH = 2;
export const MINIMAP_BACKBONE_ENDCAP_OFFSET_Y = 2;

export const SWEEP_RANDOM_CYCLE_MS = 1800;
export const MIN_PROCESSING_MS = 5000;
export const BACKBONE_FADE_OUT_MS = 800;

const PREVIEW_PANEL_MINIMAP_GAP = 60;
const PREVIEW_PANEL_PADDING_Y = 20;

// ── Color utilities (pure) ──────────────────────────────────────────

export function parseRgbColor(value: string): RgbColor | null {
    const raw = value.trim();
    if (!raw) return null;
    if (raw.startsWith('#')) {
        const hex = raw.slice(1);
        if (hex.length === 3) {
            const r = Number.parseInt(hex[0] + hex[0], 16);
            const g = Number.parseInt(hex[1] + hex[1], 16);
            const b = Number.parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
        }
        if (hex.length === 6) {
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            return { r, g, b };
        }
        return null;
    }
    const rgbMatch = raw.match(/rgb\(([^)]+)\)/i);
    const csv = (rgbMatch ? rgbMatch[1] : raw).split(',').map(part => part.trim());
    if (csv.length < 3) return null;
    const [r, g, b] = csv.map(part => Number.parseFloat(part));
    if ([r, g, b].some(v => Number.isNaN(v))) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

export function mixRgbColor(a: RgbColor, b: RgbColor, t: number): RgbColor {
    const clamped = Math.min(Math.max(t, 0), 1);
    return {
        r: Math.round(a.r + (b.r - a.r) * clamped),
        g: Math.round(a.g + (b.g - a.g) * clamped),
        b: Math.round(a.b + (b.b - a.b) * clamped)
    };
}

export function toRgbString(color: RgbColor): string {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function getExecutionColorValue(styleSource: Element, variableName: string, fallback: string): string {
    const value = getComputedStyle(styleSource).getPropertyValue(variableName).trim();
    return value || fallback;
}

export function getExecutionColorRgb(styleSource: Element, variableName: string, fallback: RgbColor): RgbColor {
    return parseRgbColor(getExecutionColorValue(styleSource, variableName, '')) ?? fallback;
}

export function getProAccentColor(): RgbColor {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const rgbVar = styles.getPropertyValue('--rt-pro-color-rgb');
    const rgbFromVar = parseRgbColor(rgbVar);
    if (rgbFromVar) return rgbFromVar;
    const hexVar = styles.getPropertyValue('--rt-pro-color') || styles.getPropertyValue('--ert-pro-accent-color');
    return parseRgbColor(hexVar) ?? { r: 217, g: 70, b: 239 };
}

export function getBackboneStartColors(styleSource: Element): BackboneColors {
    const warning = getExecutionColorRgb(styleSource, '--rt-ai-warning', { r: 255, g: 153, b: 0 });
    return {
        gradient: [warning, warning, warning],
        shine: [warning, warning, warning, warning]
    };
}

export function getBackboneTargetColors(isPro: boolean): BackboneColors {
    const base = isPro ? getProAccentColor() : { r: 34, g: 255, b: 120 };
    const bright = mixRgbColor(base, { r: 255, g: 255, b: 255 }, isPro ? 0.55 : 0.65);
    const deep = mixRgbColor(base, { r: 0, g: 0, b: 0 }, isPro ? 0.12 : 0.08);
    return {
        gradient: [base, bright, deep],
        shine: [
            mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.85),
            mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.95),
            mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.45),
            mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.85)
        ]
    };
}

export function getBackbonePressureColors(
    styleSource: Element,
    tone: 'normal' | 'amber' | 'red',
    isPro: boolean
): BackboneColors {
    if (tone === 'amber') {
        return getBackboneStartColors(styleSource);
    }
    if (tone === 'red') {
        const base = getExecutionColorRgb(styleSource, '--rt-ai-error', { r: 244, g: 76, b: 76 });
        return {
            gradient: [
                base,
                mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.35),
                mixRgbColor(base, { r: 0, g: 0, b: 0 }, 0.18)
            ],
            shine: [
                mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.68),
                mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.9),
                mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.4),
                mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.68)
            ]
        };
    }

    const themeBase = parseRgbColor(getComputedStyle(document.documentElement).getPropertyValue('--interactive-accent'))
        ?? getBackboneTargetColors(isPro).gradient[0]
        ?? { r: 87, g: 151, b: 245 };
    return {
        gradient: [
            themeBase,
            mixRgbColor(themeBase, { r: 255, g: 255, b: 255 }, 0.52),
            mixRgbColor(themeBase, { r: 0, g: 0, b: 0 }, 0.14)
        ],
        shine: [
            mixRgbColor(themeBase, { r: 255, g: 255, b: 255 }, 0.75),
            mixRgbColor(themeBase, { r: 255, g: 255, b: 255 }, 0.92),
            mixRgbColor(themeBase, { r: 255, g: 255, b: 255 }, 0.45),
            mixRgbColor(themeBase, { r: 255, g: 255, b: 255 }, 0.75)
        ]
    };
}

// ── Renderer class ──────────────────────────────────────────────────

export class InquiryMinimapRenderer {

    // ── SVG element refs (private — written via initElements) ────────

    private minimapTicksEl?: SVGGElement;
    private minimapBaseline?: SVGLineElement;
    private minimapEndCapStart?: SVGRectElement;
    private minimapEndCapEnd?: SVGRectElement;
    private minimapTokenCapBar?: SVGRectElement;
    private minimapTokenCapStartCap?: SVGRectElement;
    private minimapTokenCapEndCap?: SVGRectElement;
    private minimapTokenCapSplitGroup?: SVGGElement;
    private minimapTokenCapLabelGroup?: SVGGElement;
    private minimapTokenCapCachedOverlay?: SVGRectElement;
    private minimapTicks: SVGGElement[] = [];
    private minimapGroup?: SVGGElement;
    private minimapLayout?: { startX: number; length: number };

    // ── Backbone ─────────────────────────────────────────────────────

    private minimapBackboneGroup?: SVGGElement;
    private minimapBackboneGlow?: SVGRectElement;
    private minimapBackboneShine?: SVGRectElement;
    private minimapBackboneCachedOverlay?: SVGRectElement;
    private minimapBackboneClip?: SVGClipPathElement;
    private minimapBackboneClipRect?: SVGRectElement;
    private minimapBackboneLayout?: {
        startX: number;
        length: number;
        glowHeight: number;
        glowY: number;
        shineHeight: number;
        shineY: number;
    };
    private minimapBackboneGradientStops: SVGStopElement[] = [];
    private minimapBackboneShineStops: SVGStopElement[] = [];

    // ── Pass indicator / reuse ───────────────────────────────────────

    private minimapPassIndicatorGroup?: SVGGElement;
    private minimapPassIndicatorText?: SVGTextElement;
    private minimapReuseBand?: SVGLineElement;
    private minimapReuseDot?: SVGCircleElement;
    private minimapStagesGroup?: SVGGElement;

    // ── Color / animation state ──────────────────────────────────────

    private backboneStartColors?: BackboneColors;
    private backboneTargetColors?: BackboneColors;
    private backboneOscillationPhaseOffset = 0;
    private backboneFadeTimer?: number;
    private backboneProgressRatio = 0;
    private runningStyleSource?: Element;

    // ── Sweep state ──────────────────────────────────────────────────

    private minimapSweepTicks: Array<{ rect: SVGRectElement; centerX: number; rowIndex: number; lastOpacity?: string }> = [];
    private minimapSweepLayout?: { startX: number; endX: number; bandWidth: number };
    private sweepRandomCycle = -1;
    private sweepRandomActive = new Set<number>();
    private lastSweepUpdate = 0;
    private minimapBottomOffset = 0;
    private minimapEmptyUpdateId = 0;
    private runningAnimationFrame?: number;
    private runningAnimationStart?: number;

    // ── Initialization ───────────────────────────────────────────────

    /** Create the structural SVG elements for the minimap.
     *  Called once during InquiryView.buildSvg. */
    initElements(parentGroup: SVGGElement, viewboxSize: number): void {
        this.minimapGroup = parentGroup;
        const baselineLength = viewboxSize / 2;
        const baselineStartX = -(baselineLength / 2);
        this.minimapLayout = { startX: baselineStartX, length: baselineLength };

        this.minimapBaseline = createSvgElement('line');
        this.minimapBaseline.classList.add('ert-inquiry-minimap-baseline');
        parentGroup.appendChild(this.minimapBaseline);

        this.minimapEndCapStart = createSvgElement('rect');
        this.minimapEndCapStart.classList.add('ert-inquiry-minimap-endcap');
        parentGroup.appendChild(this.minimapEndCapStart);
        this.minimapEndCapEnd = createSvgElement('rect');
        this.minimapEndCapEnd.classList.add('ert-inquiry-minimap-endcap');
        parentGroup.appendChild(this.minimapEndCapEnd);

        this.minimapTokenCapBar = createSvgElement('rect');
        this.minimapTokenCapBar.classList.add('ert-inquiry-minimap-tokencap-bar');
        parentGroup.appendChild(this.minimapTokenCapBar);
        this.minimapTokenCapStartCap = createSvgElement('rect');
        this.minimapTokenCapStartCap.classList.add('ert-inquiry-minimap-tokencap-endcap');
        parentGroup.appendChild(this.minimapTokenCapStartCap);
        this.minimapTokenCapEndCap = createSvgElement('rect');
        this.minimapTokenCapEndCap.classList.add('ert-inquiry-minimap-tokencap-endcap');
        parentGroup.appendChild(this.minimapTokenCapEndCap);
        this.minimapTokenCapSplitGroup = createSvgGroup(parentGroup, 'ert-inquiry-minimap-tokencap-splits');
        this.minimapTokenCapLabelGroup = createSvgGroup(parentGroup, 'ert-inquiry-minimap-tokencap-labels');
        this.minimapStagesGroup = createSvgGroup(parentGroup, 'ert-inquiry-minimap-stages');

        this.minimapTokenCapCachedOverlay = createSvgElement('rect');
        this.minimapTokenCapCachedOverlay.classList.add('ert-inquiry-minimap-tokencap-cached');
        this.minimapTokenCapCachedOverlay.classList.add('ert-hidden');
        parentGroup.appendChild(this.minimapTokenCapCachedOverlay);

        this.minimapReuseBand = createSvgElement('line');
        this.minimapReuseBand.classList.add('ert-inquiry-minimap-reuse-band');
        parentGroup.appendChild(this.minimapReuseBand);

        this.minimapTicksEl = createSvgGroup(parentGroup, 'ert-inquiry-minimap-ticks', baselineStartX, 0);
    }

    /** Create the backbone clip-path in the <defs> section.
     *  Called once during InquiryView.buildZoneGradients. */
    initBackboneClip(defs: SVGDefsElement): void {
        if (this.minimapBackboneClip) return;
        const backboneClip = createSvgElement('clipPath');
        backboneClip.setAttribute('id', 'ert-inquiry-minimap-backbone-clip');
        backboneClip.setAttribute('clipPathUnits', 'userSpaceOnUse');
        const clipRect = createSvgElement('rect');
        backboneClip.appendChild(clipRect);
        defs.appendChild(backboneClip);
        this.minimapBackboneClip = backboneClip;
        this.minimapBackboneClipRect = clipRect;
    }

    // ── Read-only accessors ──────────────────────────────────────────

    /** Whether the minimap SVG group has been initialized. */
    get hasGroup(): boolean {
        return !!this.minimapGroup;
    }

    /** Current minimap layout length, or undefined if not yet laid out. */
    get layoutLength(): number | undefined {
        return this.minimapLayout?.length;
    }

    /** Bottom edge of the backbone glow, used for footer positioning. */
    get backboneBottomEdge(): number {
        return this.minimapBackboneLayout
            ? this.minimapBackboneLayout.glowY + this.minimapBackboneLayout.glowHeight
            : 0;
    }

    /** Increment and return the empty-state update counter. */
    nextEmptyUpdateId(): number {
        return ++this.minimapEmptyUpdateId;
    }

    /** Check if the given update ID is still current. */
    isCurrentEmptyUpdate(updateId: number): boolean {
        return updateId === this.minimapEmptyUpdateId;
    }

    // ── Gradient stop setters ────────────────────────────────────────

    setGradientStops(stops: SVGStopElement[]): void {
        this.minimapBackboneGradientStops = stops;
    }

    setShineStops(stops: SVGStopElement[]): void {
        this.minimapBackboneShineStops = stops;
    }

    // ── Backbone rendering ───────────────────────────────────────────

    renderBackbone(baselineStart: number, length: number): void {
        if (!this.minimapGroup) return;
        let backboneGroup = this.minimapBackboneGroup;
        if (!backboneGroup) {
            backboneGroup = createSvgGroup(this.minimapGroup, 'ert-inquiry-minimap-backbone');
            this.minimapBackboneGroup = backboneGroup;
            if (this.minimapTicksEl) {
                this.minimapGroup.insertBefore(backboneGroup, this.minimapTicksEl);
            }
        }

        const barHeight = 2;
        const barY = -1;
        const glowHeight = barHeight;
        const glowY = barY;
        const shineHeight = barHeight;
        const shineY = barY;
        this.minimapBackboneLayout = { startX: baselineStart, length, glowHeight, glowY, shineHeight, shineY };

        if (this.minimapBackboneClipRect) {
            this.minimapBackboneClipRect.setAttribute('x', baselineStart.toFixed(2));
            this.minimapBackboneClipRect.setAttribute('y', String(shineY));
            this.minimapBackboneClipRect.setAttribute('width', length.toFixed(2));
            this.minimapBackboneClipRect.setAttribute('height', String(shineHeight));
            this.minimapBackboneClipRect.setAttribute('rx', String(Math.round(shineHeight / 2)));
            this.minimapBackboneClipRect.setAttribute('ry', String(Math.round(shineHeight / 2)));
        }
        if (!backboneGroup.getAttribute('clip-path')) {
            backboneGroup.setAttribute('clip-path', 'url(#ert-inquiry-minimap-backbone-clip)');
        }

        let glow = this.minimapBackboneGlow;
        if (!glow) {
            glow = createSvgElement('rect');
            glow.classList.add('ert-inquiry-minimap-backbone-glow');
            backboneGroup.appendChild(glow);
            this.minimapBackboneGlow = glow;
        }

        let shine = this.minimapBackboneShine;
        if (!shine) {
            shine = createSvgElement('rect');
            shine.classList.add('ert-inquiry-minimap-backbone-shine');
            backboneGroup.appendChild(shine);
            this.minimapBackboneShine = shine;
        }

        let cachedOverlay = this.minimapBackboneCachedOverlay;
        if (!cachedOverlay) {
            cachedOverlay = createSvgElement('rect');
            cachedOverlay.classList.add('ert-inquiry-minimap-backbone-cached', 'ert-hidden');
            backboneGroup.appendChild(cachedOverlay);
            this.minimapBackboneCachedOverlay = cachedOverlay;
        }

        let passGroup = this.minimapPassIndicatorGroup;
        if (!passGroup) {
            passGroup = createSvgGroup(this.minimapGroup, 'ert-inquiry-minimap-pass-indicator');
            this.minimapPassIndicatorGroup = passGroup;
        }
        let passText = this.minimapPassIndicatorText;
        if (!passText && passGroup) {
            passText = createSvgText(passGroup, 'ert-inquiry-minimap-pass-text', '', 0, 0);
            passText.setAttribute('text-anchor', 'start');
            passText.setAttribute('dominant-baseline', 'middle');
            this.minimapPassIndicatorText = passText;
        }
        if (!this.minimapReuseDot && passGroup) {
            this.minimapReuseDot = createSvgElement('circle');
            this.minimapReuseDot.classList.add('ert-inquiry-minimap-reuse-dot');
            this.minimapReuseDot.setAttribute('r', '3');
            this.minimapReuseDot.setAttribute('cx', '-6');
            this.minimapReuseDot.setAttribute('cy', '0');
            passGroup.appendChild(this.minimapReuseDot);
        }

        glow.setAttribute('x', baselineStart.toFixed(2));
        glow.setAttribute('y', String(glowY));
        glow.setAttribute('width', length.toFixed(2));
        glow.setAttribute('height', String(glowHeight));
        glow.setAttribute('rx', String(Math.round(glowHeight / 2)));
        glow.setAttribute('ry', String(Math.round(glowHeight / 2)));

        shine.setAttribute('x', baselineStart.toFixed(2));
        shine.setAttribute('y', String(shineY));
        shine.setAttribute('width', length.toFixed(2));
        shine.setAttribute('height', String(shineHeight));
        shine.setAttribute('rx', String(Math.round(shineHeight / 2)));
        shine.setAttribute('ry', String(Math.round(shineHeight / 2)));
        cachedOverlay.setAttribute('x', baselineStart.toFixed(2));
        cachedOverlay.setAttribute('y', String(glowY - 1));
        cachedOverlay.setAttribute('width', '0');
        cachedOverlay.setAttribute('height', String(glowHeight + 2));
        cachedOverlay.setAttribute('rx', String(Math.round((glowHeight + 2) / 2)));
        cachedOverlay.setAttribute('ry', String(Math.round((glowHeight + 2) / 2)));
        cachedOverlay.classList.add('ert-hidden');

        if (passGroup) {
            passGroup.setAttribute('transform', `translate(${Math.round(baselineStart + length + 10)} 0)`);
        }
    }

    // ── Backbone stop colors ─────────────────────────────────────────

    applyStopColors(gradientColors: RgbColor[], shineColors: RgbColor[]): void {
        gradientColors.forEach((color, idx) => {
            const stop = this.minimapBackboneGradientStops[idx];
            if (stop) stop.setAttribute('stop-color', toRgbString(color));
        });
        shineColors.forEach((color, idx) => {
            const stop = this.minimapBackboneShineStops[idx];
            if (stop) stop.setAttribute('stop-color', toRgbString(color));
        });
    }

    applyBackboneColors(progress: number): void {
        if (!this.backboneStartColors || !this.backboneTargetColors) return;
        const gradientColors = this.backboneStartColors.gradient.map((color, idx) => {
            const target = this.backboneTargetColors?.gradient[idx] ?? color;
            return mixRgbColor(color, target, progress);
        });
        const shineColors = this.backboneStartColors.shine.map((color, idx) => {
            const target = this.backboneTargetColors?.shine[idx] ?? color;
            return mixRgbColor(color, target, progress);
        });
        this.applyStopColors(gradientColors, shineColors);
    }

    // ── Fill progress ────────────────────────────────────────────────

    setFillProgress(progress: number): void {
        if (!this.minimapBackboneLayout || !this.minimapBackboneGlow || !this.minimapBackboneShine) return;
        const clamped = Math.min(Math.max(progress, 0), 1);
        const length = this.minimapBackboneLayout.length;
        const filledWidth = length * clamped;
        const glowRadius = Math.min(this.minimapBackboneLayout.glowHeight / 2, Math.max(0, filledWidth / 2));
        this.minimapBackboneGlow.setAttribute('x', this.minimapBackboneLayout.startX.toFixed(2));
        this.minimapBackboneGlow.setAttribute('width', filledWidth.toFixed(2));
        this.minimapBackboneGlow.setAttribute('rx', String(Math.round(glowRadius)));
        this.minimapBackboneGlow.setAttribute('ry', String(Math.round(glowRadius)));

        this.minimapBackboneShine.setAttribute('x', this.minimapBackboneLayout.startX.toFixed(2));
        this.minimapBackboneShine.setAttribute('width', '0');
        this.minimapBackboneShine.setAttribute('rx', '0');
        this.minimapBackboneShine.setAttribute('ry', '0');
    }

    private applyRunningBackboneColor(): void {
        if (!this.minimapBackboneGlow) return;
        const styleSource = this.runningStyleSource ?? document.documentElement;
        const color = getExecutionColorValue(styleSource, '--rt-ai-warning', '#ff9900');
        this.minimapBackboneGlow.style.fill = color;
        if (this.minimapBackboneShine) {
            this.minimapBackboneShine.style.fill = color;
        }
    }

    setRunningBackboneProgress(progress: number): void {
        this.backboneProgressRatio = Math.min(Math.max(progress, 0), 1);
        this.applyRunningBackboneColor();
        this.setFillProgress(this.backboneProgressRatio);
    }

    // ── Pulse / animation core ───────────────────────────────────────

    updatePulse(_elapsed: number): void {
        this.applyRunningBackboneColor();
        this.setFillProgress(this.backboneProgressRatio);
    }

    // ── Sweep ────────────────────────────────────────────────────────

    updateSweep(_elapsed: number): void {
        if (!this.minimapSweepLayout || !this.minimapSweepTicks.length) return;
        
        // THROTTLE: limit active sweep updates to 10fps to calm the GPU
        if (_elapsed - this.lastSweepUpdate < 100) return;
        this.lastSweepUpdate = _elapsed;

        const cycleIndex = Math.floor(_elapsed / SWEEP_RANDOM_CYCLE_MS);
        if (cycleIndex !== this.sweepRandomCycle) {
            this.sweepRandomCycle = cycleIndex;
            const total = this.minimapSweepTicks.length;
            const count = Math.max(1, Math.floor(Math.random() * total) + 1);
            const indices = Array.from({ length: total }, (_, idx) => idx);
            for (let i = indices.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            this.sweepRandomActive = new Set(indices.slice(0, count));
        }

        const phase = (_elapsed % SWEEP_RANDOM_CYCLE_MS) / SWEEP_RANDOM_CYCLE_MS;
        const pulse = Math.sin(Math.PI * phase);
        const intensity = 0.24 + (pulse * 0.76);
        const intensityStr = intensity.toFixed(2);
        this.minimapSweepTicks.forEach((tick, index) => {
            if (!this.sweepRandomActive.has(index)) {
                if (tick.lastOpacity !== '0') {
                    tick.rect.setAttribute('opacity', '0');
                    tick.lastOpacity = '0';
                }
                return;
            }
            if (tick.lastOpacity !== intensityStr) {
                tick.rect.setAttribute('opacity', intensityStr);
                tick.lastOpacity = intensityStr;
            }
        });
    }

    buildSweepLayer(
        tickLayouts: Array<{ x: number; y: number; width: number; height: number; rowIndex: number }>,
        tickWidth: number,
        length: number
    ): void {
        if (!this.minimapTicksEl) return;
        this.minimapTicksEl.querySelector('.ert-inquiry-minimap-sweep')?.remove();
        const sweepGroup = createSvgGroup(this.minimapTicksEl, 'ert-inquiry-minimap-sweep');
        const inset = Math.max(3, Math.round(tickWidth * 0.28));
        tickLayouts.forEach(layout => {
            const inner = createSvgElement('rect');
            inner.classList.add('ert-inquiry-minimap-sweep-inner');
            inner.setAttribute('x', String(layout.x + inset));
            inner.setAttribute('y', String(layout.y + inset));
            inner.setAttribute('width', String(Math.max(4, layout.width - (inset * 2))));
            inner.setAttribute('height', String(Math.max(6, layout.height - (inset * 2))));
            inner.setAttribute('rx', '2');
            inner.setAttribute('ry', '2');
            inner.setAttribute('opacity', '0');
            sweepGroup.appendChild(inner);
            this.minimapSweepTicks.push({ rect: inner, centerX: layout.x + (layout.width / 2), rowIndex: layout.rowIndex });
        });
        this.minimapSweepLayout = {
            startX: -Math.max(tickWidth * 1.6, 36),
            endX: length + Math.max(tickWidth * 1.6, 36),
            bandWidth: Math.max(tickWidth * 1.6, 36)
        };
    }

    // ── Target Scenes ────────────────────────────────────────────────

    updateTargetStates(
        targetSceneIds: string[],
        options?: { selectionMode?: InquirySelectionMode; roleValidation?: InquiryRoleValidation }
    ): void {
        const targetSceneIdSet = new Set(targetSceneIds.map(sceneId => sceneId.trim().toLowerCase()).filter(Boolean));
        const isDegradedFocused = options?.selectionMode === 'focused' && options?.roleValidation === 'missing-target-roles';
        this.minimapTicks.forEach(tick => {
            const sceneId = tick.getAttribute('data-scene-id')?.trim().toLowerCase() || '';
            const isTarget = !!sceneId && targetSceneIdSet.has(sceneId);
            tick.classList.toggle('is-target', isTarget);
            tick.classList.toggle('is-target-role-validation-warning', isTarget && isDegradedFocused);
            if (isTarget) {
                const targetTooltip = isDegradedFocused
                    ? 'Incomplete Focused Analysis — Target scenes were selected, but no target-specific findings were returned.'
                    : 'Target Scene — Included in focused analysis.';
                tick.setAttribute('data-target-tooltip', balanceTooltipText(targetTooltip));
            } else {
                tick.removeAttribute('data-target-tooltip');
            }
        });
    }

    updateLinkedHoverState(sceneId?: string | null): void {
        const normalizedSceneId = String(sceneId || '').trim().toLowerCase();
        this.minimapTicks.forEach(tick => {
            const tickSceneId = tick.getAttribute('data-scene-id')?.trim().toLowerCase() || '';
            tick.classList.toggle('is-linked-hover', !!normalizedSceneId && !!tickSceneId && tickSceneId === normalizedSceneId);
        });
    }

    // ── Animation lifecycle ──────────────────────────────────────────

    startRunningAnimations(
        styleSource: Element,
        isPro: boolean,
        isRunningFn: () => boolean,
        onFrame?: (elapsedMs: number) => void
    ): void {
        if (this.runningAnimationFrame) return;
        this.runningAnimationStart = performance.now();
        this.runningStyleSource = styleSource;
        this.backboneProgressRatio = 0;
        this.cancelFadeOut();
        this.backboneStartColors = getBackboneStartColors(styleSource);
        this.backboneTargetColors = getBackboneTargetColors(isPro);
        this.backboneOscillationPhaseOffset = Math.PI / 2;
        this.setRunningBackboneProgress(0);
        if (this.minimapBaseline) {
            this.minimapBaseline.style.stroke = '';
        }
        this.minimapEndCapStart?.style.removeProperty('fill');
        this.minimapEndCapEnd?.style.removeProperty('fill');
        const animate = (now: number) => {
            if (!isRunningFn()) {
                this.stopRunningAnimations();
                return;
            }
            const elapsed = now - (this.runningAnimationStart ?? now);
            onFrame?.(elapsed);
            if (document.body.classList.contains('rt-modal-open')) {
                this.runningAnimationFrame = window.requestAnimationFrame(animate);
                return;
            }
            this.updatePulse(elapsed);
            this.updateSweep(elapsed);
            // SAFE: requestAnimationFrame cleanup is handled in stopRunningAnimations() called from onClose()
            this.runningAnimationFrame = window.requestAnimationFrame(animate);
        };
        // SAFE: requestAnimationFrame cleanup is handled in stopRunningAnimations() called from onClose()
        this.runningAnimationFrame = window.requestAnimationFrame(animate);
    }

    stopRunningAnimations(): void {
        if (this.runningAnimationFrame) {
            window.cancelAnimationFrame(this.runningAnimationFrame);
            this.runningAnimationFrame = undefined;
        }
        this.runningAnimationStart = undefined;
        this.minimapSweepTicks.forEach(tick => {
            if (tick.lastOpacity !== '0') {
                tick.rect.setAttribute('opacity', '0');
                tick.lastOpacity = '0';
            }
        });
        this.sweepRandomCycle = -1;
        this.sweepRandomActive.clear();
        this.lastSweepUpdate = 0;
        this.backboneStartColors = undefined;
        this.backboneTargetColors = undefined;
        this.backboneOscillationPhaseOffset = 0;
        this.runningStyleSource = undefined;
        // Clear inline fill set by applyRunningBackboneColor() during the run
        // so the glow/shine revert to their CSS-defined fill on next render.
        this.minimapBackboneGlow?.style.removeProperty('fill');
        this.minimapBackboneShine?.style.removeProperty('fill');
    }

    resetPressureGauge(): void {
        this.minimapBackboneGlow?.setAttribute('width', '0');
        this.minimapBackboneShine?.setAttribute('width', '0');
        this.minimapBackboneCachedOverlay?.classList.add('ert-hidden');
        this.minimapBackboneCachedOverlay?.setAttribute('width', '0');
        this.minimapBackboneGroup?.classList.remove(
            'is-pressure-normal',
            'is-pressure-amber',
            'is-pressure-red',
            'is-pressure-over-budget'
        );
        if (this.minimapTokenCapBar) {
            this.minimapTokenCapBar.setAttribute('width', '0');
            this.minimapTokenCapBar.style.removeProperty('fill');
            this.minimapTokenCapBar.classList.remove('is-warning-capacity', 'is-over-capacity');
        }
        this.minimapTokenCapStartCap?.classList.remove('is-warning-capacity', 'is-over-capacity');
        this.minimapTokenCapEndCap?.classList.remove('is-warning-capacity', 'is-over-capacity');
        if (this.minimapTokenCapSplitGroup) {
            clearSvgChildren(this.minimapTokenCapSplitGroup);
            this.minimapTokenCapSplitGroup.classList.add('ert-hidden');
        }
        this.minimapTokenCapCachedOverlay?.classList.add('ert-hidden');
        this.minimapTokenCapCachedOverlay?.classList.remove('is-stub');
        this.minimapTokenCapCachedOverlay?.setAttribute('width', '0');
        if (this.minimapPassIndicatorGroup) {
            this.minimapPassIndicatorGroup.classList.add('ert-hidden');
        }
        this.minimapBaseline?.style.removeProperty('stroke');
        this.minimapEndCapStart?.style.removeProperty('fill');
        this.minimapEndCapEnd?.style.removeProperty('fill');
    }

    startFadeOut(): void {
        this.cancelFadeOut();
        if (!this.minimapBackboneGroup) return;
        this.minimapBackboneGroup.classList.add('is-fading-out');
        this.backboneFadeTimer = window.setTimeout(() => {
            this.minimapBackboneGroup?.classList.remove('is-fading-out');
            this.backboneFadeTimer = undefined;
        }, BACKBONE_FADE_OUT_MS);
    }

    cancelFadeOut(): void {
        if (this.backboneFadeTimer) {
            window.clearTimeout(this.backboneFadeTimer);
            this.backboneFadeTimer = undefined;
        }
        this.minimapBackboneGroup?.classList.remove('is-fading-out');
    }

    // ── Token cap bar ────────────────────────────────────────────────

    updateTokenCapBar(
        fillRatio: number,
        isOverCapacity: boolean,
        overCapacityTone: 'amber' | 'red',
        totalPassCount: number,
        styleSource: Element,
        advancedContext: AIRunAdvancedContext | null,
        safeInputBudget?: number,
        formatTokenEstimate?: (value: number) => string
    ): void {
        if (!this.minimapTokenCapBar || !this.minimapLayout) return;
        const length = this.minimapLayout.length;
        const filledWidth = length * Math.min(Math.max(fillRatio, 0), 1);
        this.minimapTokenCapBar.setAttribute('x', String(Math.round(this.minimapLayout.startX)));
        this.minimapTokenCapBar.setAttribute('width', filledWidth.toFixed(2));
        const overCapacityColor = overCapacityTone === 'amber'
            ? getExecutionColorValue(styleSource, '--rt-ai-warning', '#ff9900')
            : getExecutionColorValue(styleSource, '--rt-ai-error', '#f44c4c');
        const neutralColor = getExecutionColorValue(styleSource, '--rt-ai-neutral', '#ffffff');
        const tokenCapColor = isOverCapacity ? overCapacityColor : neutralColor;
        this.minimapTokenCapBar.style.fill = tokenCapColor;
        this.minimapTokenCapStartCap?.style.setProperty('fill', tokenCapColor);
        this.minimapTokenCapEndCap?.style.setProperty('fill', tokenCapColor);

        const endcapStateClass = overCapacityTone === 'amber' ? 'is-warning-capacity' : 'is-over-capacity';
        const inverseStateClass = overCapacityTone === 'amber' ? 'is-over-capacity' : 'is-warning-capacity';
        this.minimapTokenCapBar.classList.toggle(endcapStateClass, isOverCapacity);
        this.minimapTokenCapStartCap?.classList.toggle(endcapStateClass, isOverCapacity);
        this.minimapTokenCapEndCap?.classList.toggle(endcapStateClass, isOverCapacity);
        this.minimapTokenCapBar.classList.remove(inverseStateClass);
        this.minimapTokenCapStartCap?.classList.remove(inverseStateClass);
        this.minimapTokenCapEndCap?.classList.remove(inverseStateClass);
        this.updateTokenCapPassSplits(
            totalPassCount,
            isOverCapacity ? overCapacityTone : undefined,
            styleSource
        );
        this.updateTokenCapLabels(totalPassCount, safeInputBudget, formatTokenEstimate);
        this.updateTokenCapCachedOverlay(fillRatio, advancedContext);
    }

    private updateTokenCapPassSplits(
        totalPassCount: number,
        overCapacityTone: 'amber' | 'red' | undefined,
        styleSource: Element
    ): void {
        if (!this.minimapTokenCapSplitGroup || !this.minimapLayout) return;
        clearSvgChildren(this.minimapTokenCapSplitGroup);
        if (totalPassCount <= 1) {
            this.minimapTokenCapSplitGroup.classList.add('ert-hidden');
            return;
        }

        const baselineStart = Math.round(this.minimapLayout.startX);
        const length = this.minimapLayout.length;
        const splitY = MINIMAP_TOKEN_CAP_Y;
        const tickHalfWidth = MINIMAP_TOKEN_CAP_SPLIT_TICK_WIDTH / 2;
        const splitColor = overCapacityTone === 'amber'
            ? '#DD9B3B'
            : overCapacityTone === 'red'
                ? getExecutionColorValue(styleSource, '--rt-ai-error', '#f44c4c')
                : getExecutionColorValue(styleSource, '--rt-ai-neutral', '#DD9B3B');
        const stateClass = overCapacityTone === 'amber' ? 'is-warning-capacity'
            : overCapacityTone === 'red' ? 'is-over-capacity'
            : undefined;
        for (let index = 1; index < totalPassCount; index += 1) {
            const ratio = index / totalPassCount;
            const centerX = baselineStart + (length * ratio);
            const splitTick = createSvgElement('rect');
            splitTick.classList.add('ert-inquiry-minimap-tokencap-split');
            if (stateClass) splitTick.classList.add(stateClass);
            splitTick.style.fill = splitColor;
            splitTick.setAttribute('x', (centerX - tickHalfWidth).toFixed(2));
            splitTick.setAttribute('y', String(splitY));
            splitTick.setAttribute('width', String(MINIMAP_TOKEN_CAP_SPLIT_TICK_WIDTH));
            splitTick.setAttribute('height', String(MINIMAP_TOKEN_CAP_SPLIT_TICK_HEIGHT));
            splitTick.setAttribute('rx', '1');
            splitTick.setAttribute('ry', '1');
            this.minimapTokenCapSplitGroup.appendChild(splitTick);
        }
        this.minimapTokenCapSplitGroup.classList.remove('ert-hidden');
    }

    private updateTokenCapLabels(
        totalPassCount: number,
        safeInputBudget?: number,
        formatTokenEstimate?: (value: number) => string
    ): void {
        if (!this.minimapTokenCapLabelGroup || !this.minimapLayout) return;
        clearSvgChildren(this.minimapTokenCapLabelGroup);

        const hasBudget = typeof safeInputBudget === 'number' && safeInputBudget > 0 && formatTokenEstimate;
        if (!hasBudget) {
            this.minimapTokenCapLabelGroup.classList.add('ert-hidden');
            return;
        }

        const baselineStart = Math.round(this.minimapLayout.startX);
        const length = this.minimapLayout.length;
        const labelY = MINIMAP_TOKEN_CAP_Y + MINIMAP_TOKEN_CAP_ENDCAP_HEIGHT + 12;

        // Left endcap label: "0"
        const leftLabel = createSvgText(this.minimapTokenCapLabelGroup, 'ert-inquiry-minimap-tokencap-label', '0', baselineStart, labelY);
        leftLabel.setAttribute('text-anchor', 'start');

        // Right endcap label: max context
        const maxLabel = formatTokenEstimate(safeInputBudget);
        const rightLabel = createSvgText(this.minimapTokenCapLabelGroup, 'ert-inquiry-minimap-tokencap-label', maxLabel, baselineStart + length, labelY);
        rightLabel.setAttribute('text-anchor', 'end');

        // Interior tick labels for multi-pass
        if (totalPassCount > 1) {
            for (let index = 1; index < totalPassCount; index += 1) {
                const ratio = index / totalPassCount;
                const centerX = baselineStart + (length * ratio);
                const passTokens = Math.round(safeInputBudget * ratio);
                const passLabel = createSvgText(
                    this.minimapTokenCapLabelGroup,
                    'ert-inquiry-minimap-tokencap-label',
                    formatTokenEstimate(passTokens),
                    centerX,
                    labelY
                );
                passLabel.setAttribute('text-anchor', 'middle');
            }
        }

        this.minimapTokenCapLabelGroup.classList.remove('ert-hidden');
    }

    private updateTokenCapCachedOverlay(
        fillRatio: number,
        advanced: AIRunAdvancedContext | null
    ): void {
        if (!this.minimapTokenCapCachedOverlay || !this.minimapLayout) return;
        const reuseState = advanced?.reuseState ?? 'idle';

        // Idle — no cache status known. Hide completely.
        if (reuseState === 'idle') {
            this.minimapTokenCapCachedOverlay.classList.add('ert-hidden');
            this.minimapTokenCapCachedOverlay.classList.remove('is-stub');
            this.minimapTokenCapCachedOverlay.setAttribute('width', '0');
            return;
        }

        const CACHE_STUB_PX = 4;
        const cachedRatio = advanced?.cachedStableRatio;
        const cachedTokens = advanced?.cachedStableTokens;
        const hasRealCacheMetric = typeof cachedRatio === 'number'
            && Number.isFinite(cachedRatio)
            && cachedRatio > 0
            && typeof cachedTokens === 'number'
            && Number.isFinite(cachedTokens)
            && cachedTokens > 0;

        if (hasRealCacheMetric) {
            // Warm or eligible with confirmed cache data — proportional overlay.
            // Leave a 4px stub at the trailing end to reveal the underlying token cap bar.
            const barWidth = this.minimapLayout.length * Math.min(Math.max(fillRatio, 0), 1);
            const rawOverlayWidth = barWidth * Math.min(cachedRatio!, 1);
            const overlayWidth = Math.max(0, rawOverlayWidth - CACHE_STUB_PX);
            if (overlayWidth < 1) {
                // Too small to render meaningfully — show the stub instead.
                this.minimapTokenCapCachedOverlay.classList.remove('ert-hidden');
                this.minimapTokenCapCachedOverlay.classList.add('is-stub');
                this.minimapTokenCapCachedOverlay.setAttribute('x', this.minimapLayout.startX.toFixed(2));
                this.minimapTokenCapCachedOverlay.setAttribute('width', String(CACHE_STUB_PX));
                return;
            }
            this.minimapTokenCapCachedOverlay.classList.remove('ert-hidden', 'is-stub');
            this.minimapTokenCapCachedOverlay.setAttribute('x', this.minimapLayout.startX.toFixed(2));
            this.minimapTokenCapCachedOverlay.setAttribute('width', overlayWidth.toFixed(2));
        } else {
            // Eligible but no confirmed data — honest 4px white stub.
            // Shows the system is checking; no fabricated values.
            this.minimapTokenCapCachedOverlay.classList.remove('ert-hidden');
            this.minimapTokenCapCachedOverlay.classList.add('is-stub');
            this.minimapTokenCapCachedOverlay.setAttribute('x', this.minimapLayout.startX.toFixed(2));
            this.minimapTokenCapCachedOverlay.setAttribute('width', String(CACHE_STUB_PX));
        }
    }

    private updateBackboneCachedOverlay(
        progress: InquiryRunProgressEvent | null,
        advanced: AIRunAdvancedContext | null
    ): void {
        if (!this.minimapBackboneCachedOverlay || !this.minimapBackboneLayout) return;
        const cachedRatio = advanced?.cachedStableRatio;
        const cachedTokens = advanced?.cachedStableTokens;
        const hasRealCacheMetric = typeof cachedRatio === 'number'
            && Number.isFinite(cachedRatio)
            && cachedRatio > 0
            && typeof cachedTokens === 'number'
            && Number.isFinite(cachedTokens)
            && cachedTokens > 0
            && advanced?.reuseState === 'warm';
        if (progress || !hasRealCacheMetric) {
            this.minimapBackboneCachedOverlay.classList.add('ert-hidden');
            this.minimapBackboneCachedOverlay.setAttribute('width', '0');
            return;
        }
        const overlayWidth = this.minimapBackboneLayout.length * Math.min(cachedRatio, 1);
        if (overlayWidth < 4) {
            this.minimapBackboneCachedOverlay.classList.add('ert-hidden');
            this.minimapBackboneCachedOverlay.setAttribute('width', '0');
            return;
        }
        this.minimapBackboneCachedOverlay.classList.remove('ert-hidden');
        this.minimapBackboneCachedOverlay.setAttribute('x', this.minimapBackboneLayout.startX.toFixed(2));
        this.minimapBackboneCachedOverlay.setAttribute('width', overlayWidth.toFixed(2));
    }

    private updateExecutionPassSegments(
        totalPassCount: number,
        progress: InquiryRunProgressEvent | null,
        styleSource: Element
    ): void {
        if (!this.minimapStagesGroup || !this.minimapLayout) return;
        clearSvgChildren(this.minimapStagesGroup);
        if (totalPassCount <= 1) {
            this.minimapStagesGroup.classList.add('ert-hidden');
            return;
        }

        const segmentGap = 4;
        const availableLength = Math.max(0, this.minimapLayout.length - (segmentGap * (totalPassCount - 1)));
        const segmentWidth = Math.max(10, availableLength / totalPassCount);
        const segmentHeight = MINIMAP_TOKEN_CAP_BAR_HEIGHT;
        const segmentY = MINIMAP_TOKEN_CAP_Y;
        const stageColor = getExecutionColorValue(styleSource, '--rt-ai-success', '#36e58d');
        const completedPasses = progress
            ? (progress.phase === 'finalizing'
                ? totalPassCount
                : Math.max(0, Math.min(totalPassCount, progress.currentPass - 1)))
            : 0;
        const activePassIndex = progress && progress.phase !== 'finalizing'
            ? Math.max(0, Math.min(totalPassCount - 1, progress.currentPass - 1))
            : -1;

        for (let index = 0; index < totalPassCount; index += 1) {
            const segment = createSvgElement('rect');
            segment.classList.add('ert-inquiry-minimap-stage-segment');
            if (index < completedPasses) {
                segment.classList.add('is-complete');
            } else if (index === activePassIndex) {
                segment.classList.add('is-active');
            }
            segment.style.setProperty('--ert-inquiry-stage-color', stageColor);
            const x = this.minimapLayout.startX + (index * (segmentWidth + segmentGap));
            segment.setAttribute('x', x.toFixed(2));
            segment.setAttribute('y', String(segmentY));
            segment.setAttribute('width', segmentWidth.toFixed(2));
            segment.setAttribute('height', String(segmentHeight));
            segment.setAttribute('rx', '2');
            segment.setAttribute('ry', '2');
            this.minimapStagesGroup.appendChild(segment);
        }

        this.minimapStagesGroup.classList.remove('ert-hidden');
    }

    // ── Pressure gauge ───────────────────────────────────────────────

    updatePressureGauge(
        readinessUi: InquiryReadinessUiState,
        passPlan: PassPlanResult,
        styleSource: Element,
        isPro: boolean,
        advancedContext: AIRunAdvancedContext | null,
        progress: InquiryRunProgressEvent | null,
        formatTokenEstimate: (value: number) => string,
        balanceTooltipText: (text: string) => string
    ): void {
        if (!this.minimapBackboneGroup || !this.minimapBaseline) return;

        const ratio = Math.max(0, readinessUi.readiness.pressureRatio);
        const clamped = Math.min(ratio, 1);
        if (!progress) {
            this.setFillProgress(0);
            this.minimapBackboneShine?.setAttribute('width', '0');
            this.minimapBackboneGlow?.setAttribute('width', '0');
        }

        const isOverCapacity = ratio >= 1;
        const usesMultiPassPackaging = readinessUi.packaging === 'segmented'
            || (readinessUi.packaging === 'automatic' && readinessUi.readiness.exceedsBudget);
        const overCapacityTone: 'amber' | 'red' = usesMultiPassPackaging ? 'amber' : 'red';
        this.updateTokenCapBar(clamped, isOverCapacity, overCapacityTone, passPlan.displayPassCount, styleSource, advancedContext, readinessUi.safeInputBudget, formatTokenEstimate);
        this.updateExecutionPassSegments(passPlan.displayPassCount, progress, styleSource);
        this.updateBackboneCachedOverlay(progress, advancedContext);
        this.minimapBaseline.style.stroke = '';
        this.minimapEndCapStart?.style.removeProperty('fill');
        this.minimapEndCapEnd?.style.removeProperty('fill');

        if (isOverCapacity) {
            const pressureColors = getBackbonePressureColors(styleSource, overCapacityTone, isPro);
            this.applyStopColors(pressureColors.gradient, pressureColors.shine);
        } else {
            const pressureColors = getBackbonePressureColors(styleSource, readinessUi.readiness.pressureTone, isPro);
            this.applyStopColors(pressureColors.gradient, pressureColors.shine);
        }

        this.minimapBackboneGroup.classList.remove('is-pressure-normal', 'is-pressure-amber', 'is-pressure-red', 'is-pressure-over-budget');
        this.minimapBackboneGroup.classList.add(
            isOverCapacity
                ? (overCapacityTone === 'amber' ? 'is-pressure-amber' : 'is-pressure-red')
                : readinessUi.readiness.pressureTone === 'red'
                    ? 'is-pressure-red'
                    : readinessUi.readiness.pressureTone === 'amber'
                        ? 'is-pressure-amber'
                        : 'is-pressure-normal'
        );
        this.minimapBackboneGroup.classList.toggle(
            'is-pressure-over-budget',
            readinessUi.packaging === 'singlePassOnly' && readinessUi.readiness.exceedsBudget
        );

        const inputLabel = formatTokenEstimate(readinessUi.estimateInputTokens);
        const safeLabel = readinessUi.safeInputBudget > 0 ? formatTokenEstimate(readinessUi.safeInputBudget) : 'n/a';
        const multiPassLabel = readinessUi.packaging === 'singlePassOnly'
            ? 'Disabled (single-pass only)'
            : readinessUi.packaging === 'segmented'
                ? 'Segmented (always multi-pass)'
                : 'Automatic';
        const tooltipLines = [
            `Inquiry request: ~${inputLabel} / ~${safeLabel} budget`,
            `Multi-pass: ${multiPassLabel}`
        ];
        if (readinessUi.packaging === 'segmented'
            || (readinessUi.packaging === 'automatic' && readinessUi.readiness.exceedsBudget)) {
            tooltipLines.push('Will split into multiple analysis passes');
        }
        addTooltipData(this.minimapBaseline, balanceTooltipText(tooltipLines.join('\n')), 'top');

        const passIndicator = buildPassIndicator(
            passPlan.recentExactPassCount ?? undefined,
            passPlan.packagingExpected,
            passPlan.estimatedPassCount ?? undefined
        );
        if (this.minimapPassIndicatorGroup && this.minimapPassIndicatorText) {
            this.minimapPassIndicatorGroup.classList.toggle('ert-hidden', !passIndicator.visible);
            if (passIndicator.visible) {
                this.minimapPassIndicatorText.textContent = passIndicator.marks;
                const reason = passPlan.packagingTriggerReason
                    || (passIndicator.expectedOnly
                        ? 'Manuscript exceeds the per-pass planning budget; splitting into structured passes.'
                        : 'Multi-pass analysis completed.');
                const passText = passIndicator.exactCount
                    ? `Passes: ${passIndicator.exactCount} total`
                    : `Estimated passes: ${passIndicator.totalPassCount ?? 2} total`;
                addTooltipData(
                    this.minimapPassIndicatorGroup,
                    balanceTooltipText(`${passText}\n${reason}`),
                    'top'
                );
            }
        }
    }

    // ── Reuse status ─────────────────────────────────────────────────

    updateReuseStatus(advanced: AIRunAdvancedContext | null): void {
        if (!this.minimapGroup) return;
        const reuseState = advanced?.reuseState ?? 'idle';
        this.minimapGroup.setAttribute('data-reuse-state', reuseState);
        // Reuse band removed — cache status now shown as overlay on the token cap bar.
        this.minimapReuseBand?.classList.add('ert-hidden');
        this.minimapReuseDot?.classList.add('ert-hidden');
    }

    // ── Preview panel position ───────────────────────────────────────

    getPreviewPanelTargetY(): number {
        return MINIMAP_GROUP_Y
            + this.minimapBottomOffset
            + PREVIEW_PANEL_MINIMAP_GAP
            - PREVIEW_PANEL_PADDING_Y;
    }

    // ── Subset shading ───────────────────────────────────────────────

    applySubsetShading(
        items: InquiryCorpusItem[],
        scope: InquiryScope,
        manifest: { entries: Array<{ class: string; sceneId?: string; path: string }> }
    ): void {
        if (scope !== 'book' || !this.minimapTicks.length || !items.length) {
            this.minimapTicks.forEach(tick => {
                tick.classList.remove('is-excluded', 'is-included', 'is-selection-boundary');
            });
            return;
        }

        const includedSceneIds = new Set(
            manifest.entries
                .filter(entry => entry.class === 'scene')
                .map(entry => entry.sceneId)
                .filter((sceneId): sceneId is string => typeof sceneId === 'string' && sceneId.trim().length > 0)
        );
        const includedPaths = new Set(
            manifest.entries
                .filter(entry => entry.class === 'scene')
                .map(entry => entry.path)
                .filter(path => typeof path === 'string' && path.trim().length > 0)
        );

        const subset = buildMinimapSubsetResult(
            items.map(item => ({
                id: item.id,
                sceneId: item.sceneId,
                filePath: (item as { filePath?: string }).filePath,
                filePaths: item.filePaths
            })),
            includedSceneIds,
            includedPaths
        );

        this.minimapTicks.forEach((tick, index) => {
            const included = subset.included[index] ?? true;
            tick.classList.toggle('is-excluded', subset.hasSubset && !included);
            tick.classList.toggle('is-included', subset.hasSubset && included);
            const prev = subset.included[index - 1];
            const next = subset.included[index + 1];
            const isBoundary = subset.hasSubset
                && included
                && ((index > 0 && prev !== included) || (index < subset.included.length - 1 && next !== included));
            tick.classList.toggle('is-selection-boundary', isBoundary);
        });
    }

    // ── Empty-state styling ─────────────────────────────────────────

    applyEmptyStates(wordCounts: number[], emptyMax: number): void {
        wordCounts.forEach((wordCount, idx) => {
            const tick = this.minimapTicks[idx];
            if (!tick) return;
            tick.classList.toggle('is-empty', wordCount < emptyMax);
        });
    }

    // ── Tick rendering ───────────────────────────────────────────────

    renderTicks(
        items: InquiryCorpusItem[],
        scope: InquiryScope,
        viewboxSize: number,
        callbacks: {
            getItemTitle: (item: InquiryCorpusItem) => string;
            balanceTooltipText: (text: string) => string;
            registerDomEvent: (el: HTMLElement, event: string, handler: (e: Event) => void) => void;
            onTickClick: (item: InquiryCorpusItem, event: MouseEvent) => void;
            onTickContextMenu: (item: InquiryCorpusItem, event: MouseEvent) => void;
            onTickHover: (item: InquiryCorpusItem, label: string, fullLabel: string) => void;
            onTickLeave: () => void;
        }
    ): { tickLayouts: Array<{ x: number; y: number; width: number; height: number; rowIndex: number }>; tickWidth: number } | null {
        if (!this.minimapTicksEl || !this.minimapLayout || !this.minimapBaseline) return null;
        clearSvgChildren(this.minimapTicksEl);
        this.minimapTicks = [];
        this.minimapSweepTicks = [];

        const count = items.length;
        const length = this.minimapLayout.length;
        const tickSize = 20;
        const tickWidth = Math.max(12, Math.round(tickSize * 0.7));
        const tickHeight = Math.max(tickWidth + 4, Math.round(tickWidth * 1.45));
        const tickGap = 4;
        const capWidth = 2;
        const capHeight = Math.max(30, tickHeight + 12);
        const capHalfWidth = Math.round(capWidth / 2);
        const edgeScenePadding = tickWidth;
        const tickInset = capWidth + (tickWidth / 2) + 4 + edgeScenePadding;
        const availableLength = Math.max(0, length - (tickInset * 2));
        const maxRowWidth = viewboxSize * 0.75;
        const minStep = tickWidth + tickGap;
        const isSaga = scope === 'saga';
        const needsWrap = count > 1 && ((availableLength / (count - 1)) < minStep || (count * minStep) > maxRowWidth);
        const rowCount = isSaga ? 1 : (needsWrap ? 2 : 1);
        const firstRowCount = rowCount === 2 ? Math.ceil(count / 2) : count;
        const secondRowCount = count - firstRowCount;
        const columnCount = rowCount === 2 ? firstRowCount : count;
        const rawColumnStep = columnCount > 1 ? (availableLength / (columnCount - 1)) : 0;
        const columnStep = columnCount > 1 ? Math.max(1, Math.floor(rawColumnStep)) : 0;
        const usedLength = columnStep * Math.max(0, columnCount - 1);
        const extraSpace = Math.max(0, availableLength - usedLength);
        const startOffset = Math.floor(extraSpace / 2);
        const verticalGap = 10;
        const baselineGap = verticalGap;
        const rowGap = verticalGap;
        const rowTopY = -(baselineGap + tickHeight + (rowCount === 2 ? (tickHeight + rowGap) : 0));
        const rowBottomY = -(baselineGap + tickHeight);

        const baselineStart = Math.round(this.minimapLayout.startX);
        const baselineEnd = Math.round(this.minimapLayout.startX + length);
        this.minimapBaseline.setAttribute('x1', String(baselineStart));
        this.minimapBaseline.setAttribute('y1', '0');
        this.minimapBaseline.setAttribute('x2', String(baselineEnd));
        this.minimapBaseline.setAttribute('y2', '0');
        if (this.minimapEndCapStart && this.minimapEndCapEnd) {
            this.minimapEndCapStart.setAttribute('x', String(baselineStart - capHalfWidth));
            this.minimapEndCapStart.setAttribute('y', String((-capHeight) + MINIMAP_BACKBONE_ENDCAP_OFFSET_Y));
            this.minimapEndCapStart.setAttribute('width', String(Math.round(capWidth)));
            this.minimapEndCapStart.setAttribute('height', String(Math.round(capHeight)));
            this.minimapEndCapEnd.setAttribute('x', String(baselineEnd - capHalfWidth));
            this.minimapEndCapEnd.setAttribute('y', String((-capHeight) + MINIMAP_BACKBONE_ENDCAP_OFFSET_Y));
            this.minimapEndCapEnd.setAttribute('width', String(Math.round(capWidth)));
            this.minimapEndCapEnd.setAttribute('height', String(Math.round(capHeight)));
        }
        const tokenCapY = MINIMAP_TOKEN_CAP_Y;
        const tokenCapBarHeight = MINIMAP_TOKEN_CAP_BAR_HEIGHT;
        const tokenCapCapHeight = MINIMAP_TOKEN_CAP_ENDCAP_HEIGHT;
        const tokenCapCapY = tokenCapY;
        if (this.minimapTokenCapBar) {
            this.minimapTokenCapBar.setAttribute('x', String(baselineStart));
            this.minimapTokenCapBar.setAttribute('y', String(tokenCapY));
            this.minimapTokenCapBar.setAttribute('width', '0');
            this.minimapTokenCapBar.setAttribute('height', String(tokenCapBarHeight));
            this.minimapTokenCapBar.setAttribute('rx', String(Math.round(tokenCapBarHeight / 2)));
            this.minimapTokenCapBar.setAttribute('ry', String(Math.round(tokenCapBarHeight / 2)));
        }
        if (this.minimapTokenCapStartCap && this.minimapTokenCapEndCap) {
            this.minimapTokenCapStartCap.setAttribute('x', String(baselineStart - capHalfWidth));
            this.minimapTokenCapStartCap.setAttribute('y', String(tokenCapCapY));
            this.minimapTokenCapStartCap.setAttribute('width', String(Math.round(capWidth)));
            this.minimapTokenCapStartCap.setAttribute('height', String(Math.round(tokenCapCapHeight)));
            this.minimapTokenCapEndCap.setAttribute('x', String(baselineEnd - capHalfWidth));
            this.minimapTokenCapEndCap.setAttribute('y', String(tokenCapCapY));
            this.minimapTokenCapEndCap.setAttribute('width', String(Math.round(capWidth)));
            this.minimapTokenCapEndCap.setAttribute('height', String(Math.round(tokenCapCapHeight)));
        }
        if (this.minimapTokenCapCachedOverlay) {
            this.minimapTokenCapCachedOverlay.setAttribute('x', String(baselineStart));
            this.minimapTokenCapCachedOverlay.setAttribute('y', String(tokenCapY));
            this.minimapTokenCapCachedOverlay.setAttribute('width', '0');
            this.minimapTokenCapCachedOverlay.setAttribute('height', String(tokenCapBarHeight));
            this.minimapTokenCapCachedOverlay.setAttribute('rx', String(Math.round(tokenCapBarHeight / 2)));
            this.minimapTokenCapCachedOverlay.setAttribute('ry', String(Math.round(tokenCapBarHeight / 2)));
            this.minimapTokenCapCachedOverlay.classList.add('ert-hidden');
        }
        if (this.minimapTokenCapSplitGroup) {
            clearSvgChildren(this.minimapTokenCapSplitGroup);
            this.minimapTokenCapSplitGroup.classList.add('ert-hidden');
        }
        const reuseBandY = MINIMAP_TOKEN_CAP_Y + MINIMAP_TOKEN_CAP_BAR_HEIGHT
                           + MINIMAP_TOKEN_CAP_SPLIT_TICK_HEIGHT; // 7+4+10 = 21
        if (this.minimapReuseBand) {
            this.minimapReuseBand.setAttribute('x1', String(baselineStart));
            this.minimapReuseBand.setAttribute('y1', String(reuseBandY));
            this.minimapReuseBand.setAttribute('x2', String(baselineEnd));
            this.minimapReuseBand.setAttribute('y2', String(reuseBandY));
        }
        this.minimapBottomOffset = tokenCapCapY + tokenCapCapHeight;
        this.minimapTicksEl.setAttribute('transform', `translate(${baselineStart} 0)`);
        this.renderBackbone(baselineStart, length);

        if (!count) {
            this.minimapBackboneGroup?.setAttribute('display', 'none');
            return null;
        }

        this.minimapBackboneGroup?.removeAttribute('display');
        const tickCorner = Math.max(2, Math.round(tickWidth * 0.18));
        const markerWidth = Math.max(3, Math.round(tickWidth * 0.18));
        const markerHeight = Math.min(8, Math.max(6, Math.round(tickHeight * 0.35)));
        const markerInsetX = 4;
        const targetLetterX = Math.round(tickWidth / 2);
        const targetLetterY = Math.round(tickHeight / 2) + 1;
        const tickLayouts: Array<{ x: number; y: number; width: number; height: number; rowIndex: number }> = [];

        for (let i = 0; i < count; i += 1) {
            const item = items[i];
            const rowIndex = rowCount === 2 && i >= firstRowCount ? 1 : 0;
            const colIndex = rowIndex === 0 ? i : (i - firstRowCount);
            const pos = columnCount > 1
                ? tickInset + startOffset + (columnStep * colIndex)
                : tickInset + startOffset + (availableLength / 2);
            const rowY = rowIndex === 0 ? rowTopY : rowBottomY;
            const x = Math.round(pos - (tickWidth / 2));
            const y = Math.round(rowY);
            const tick = createSvgGroup(this.minimapTicksEl, 'ert-inquiry-minimap-tick', x, y);
            if (isSaga) {
                tick.classList.add('is-saga');
            }
            const base = createSvgElement('rect');
            base.classList.add('ert-inquiry-minimap-tick-base');
            base.setAttribute('x', '0');
            base.setAttribute('y', '0');
            base.setAttribute('width', String(tickWidth));
            base.setAttribute('height', String(tickHeight));
            base.setAttribute('rx', String(tickCorner));
            base.setAttribute('ry', String(tickCorner));
            const border = createSvgElement('rect');
            border.classList.add('ert-inquiry-minimap-tick-border');
            border.setAttribute('x', '0');
            border.setAttribute('y', '0');
            border.setAttribute('width', String(tickWidth));
            border.setAttribute('height', String(tickHeight));
            border.setAttribute('rx', String(tickCorner));
            border.setAttribute('ry', String(tickCorner));
            tick.appendChild(base);
            tick.appendChild(border);
            if (isSaga) {
                const marker = createSvgElement('rect');
                marker.classList.add('ert-inquiry-minimap-tick-marker');
                marker.setAttribute('width', String(markerWidth));
                marker.setAttribute('height', String(markerHeight));
                marker.setAttribute('x', String(Math.round(tickWidth - markerInsetX - markerWidth)));
                marker.setAttribute('y', '0');
                marker.setAttribute('rx', '1');
                marker.setAttribute('ry', '1');
                tick.appendChild(marker);
            }
            const targetLetter = createSvgText(tick, 'ert-inquiry-minimap-target-letter', 'F', targetLetterX, targetLetterY);
            targetLetter.setAttribute('text-anchor', 'middle');
            targetLetter.setAttribute('dominant-baseline', 'middle');
            targetLetter.setAttribute('aria-hidden', 'true');
            const label = item.displayLabel;
            const fullLabel = callbacks.getItemTitle(item) || label;
            tick.setAttribute('data-index', String(i + 1));
            tick.setAttribute('data-id', item.id);
            tick.setAttribute('data-label', label);
            tick.setAttribute('data-full-label', fullLabel);
            if (item.sceneId) {
                tick.setAttribute('data-scene-id', item.sceneId);
            } else {
                tick.removeAttribute('data-scene-id');
            }
            addTooltipData(tick, callbacks.balanceTooltipText(fullLabel), 'bottom');
            tick.setAttribute('data-rt-tip-offset-y', '6');
            callbacks.registerDomEvent(tick as unknown as HTMLElement, 'click', (event: Event) => {
                callbacks.onTickClick(item, event as MouseEvent);
            });
            callbacks.registerDomEvent(tick as unknown as HTMLElement, 'contextmenu', (event: Event) => {
                callbacks.onTickContextMenu(item, event as MouseEvent);
            });
            callbacks.registerDomEvent(tick as unknown as HTMLElement, 'pointerenter', () => {
                callbacks.onTickHover(item, label, fullLabel);
            });
            callbacks.registerDomEvent(tick as unknown as HTMLElement, 'pointerleave', () => {
                callbacks.onTickLeave();
            });
            this.minimapTicks.push(tick);
            tickLayouts.push({ x, y, width: tickWidth, height: tickHeight, rowIndex });
        }

        return { tickLayouts, tickWidth };
    }

    // ── Finding states ───────────────────────────────────────────────

    updateFindingStates(
        isRunning: boolean,
        isError: boolean,
        findingMap: Map<string, { kind: string; role?: 'target' | 'context' }>,
        balanceTooltipText: (text: string) => string
    ): void {
        if (!this.minimapTicks.length) return;
        const severityClasses = ['is-severity-low', 'is-severity-medium', 'is-severity-high'];
        if (isRunning || isError) {
            this.minimapTicks.forEach(tick => {
                tick.classList.remove('is-finding');
                tick.classList.remove('is-target-finding', 'is-context-finding');
                severityClasses.forEach(cls => tick.classList.remove(cls));
                const label = tick.getAttribute('data-label') || '';
                if (label) {
                    const fullLabel = tick.getAttribute('data-full-label') || label;
                    const targetTooltip = tick.getAttribute('data-target-tooltip') || '';
                    addTooltipData(tick, targetTooltip || balanceTooltipText(fullLabel), 'bottom');
                }
            });
            return;
        }

        this.minimapTicks.forEach((tick, idx) => {
            const label = tick.getAttribute('data-label') || `T${idx + 1}`;
            const finding = findingMap.get(label);
            tick.classList.toggle('is-finding', !!finding);
            tick.classList.toggle('is-target-finding', finding?.role === 'target');
            tick.classList.toggle('is-context-finding', !!finding && finding.role !== 'target');
            severityClasses.forEach(cls => tick.classList.remove(cls));
            const fullLabel = tick.getAttribute('data-full-label') || label;
            const targetTooltip = tick.getAttribute('data-target-tooltip') || '';
            if (finding) {
                addTooltipData(tick, '', 'bottom');
            } else {
                addTooltipData(tick, targetTooltip || balanceTooltipText(fullLabel), 'bottom');
            }
        });
    }
}
