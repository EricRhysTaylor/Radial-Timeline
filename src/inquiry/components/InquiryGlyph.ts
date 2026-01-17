import type { InquiryConfidence, InquirySeverity } from '../state';

export interface InquiryGlyphProps {
    focusLabel: string;
    flowValue: number;  // 0..1 normalized
    depthValue: number; // 0..1 normalized
    severity: InquirySeverity;
    confidence: InquiryConfidence;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const FLOW_RADIUS = 260;
const DEPTH_RADIUS = 195;
const FLOW_STROKE = 14;
const DEPTH_STROKE = 24;
const FLOW_HIT_STROKE = 38;
const DEPTH_HIT_STROKE = 48;
const FLOW_BADGE_RADIUS = Math.round(FLOW_STROKE * 0.75);
const DEPTH_BADGE_RADIUS = Math.round(DEPTH_STROKE * 0.75);

export class InquiryGlyph {
    private props: InquiryGlyphProps;

    readonly root: SVGGElement;
    readonly flowRingHit: SVGCircleElement;
    readonly depthRingHit: SVGCircleElement;
    readonly labelHit: SVGRectElement;

    private flowProgress: SVGCircleElement;
    private depthProgress: SVGCircleElement;
    private flowGlow: SVGCircleElement;
    private depthGlow: SVGCircleElement;
    private flowBadgeCircle: SVGCircleElement;
    private flowBadgeText: SVGTextElement;
    private depthBadgeCircle: SVGCircleElement;
    private depthBadgeText: SVGTextElement;
    private labelText: SVGTextElement;
    private flowGroup: SVGGElement;
    private depthGroup: SVGGElement;

    constructor(container: SVGElement, props: InquiryGlyphProps) {
        this.props = props;
        this.root = document.createElementNS(SVG_NS, 'g');
        this.root.classList.add('ert-inquiry-glyph');
        container.appendChild(this.root);

        this.flowGroup = this.buildRingGroup('flow', FLOW_RADIUS, FLOW_STROKE, FLOW_HIT_STROKE, FLOW_BADGE_RADIUS);
        this.depthGroup = this.buildRingGroup('depth', DEPTH_RADIUS, DEPTH_STROKE, DEPTH_HIT_STROKE, DEPTH_BADGE_RADIUS);

        this.flowProgress = this.flowGroup.querySelector('.ert-inquiry-ring-progress') as SVGCircleElement;
        this.depthProgress = this.depthGroup.querySelector('.ert-inquiry-ring-progress') as SVGCircleElement;
        this.flowGlow = this.flowGroup.querySelector('.ert-inquiry-ring-glow') as SVGCircleElement;
        this.depthGlow = this.depthGroup.querySelector('.ert-inquiry-ring-glow') as SVGCircleElement;
        this.flowRingHit = this.flowGroup.querySelector('.ert-inquiry-ring-hit') as SVGCircleElement;
        this.depthRingHit = this.depthGroup.querySelector('.ert-inquiry-ring-hit') as SVGCircleElement;
        this.flowBadgeCircle = this.flowGroup.querySelector('.ert-inquiry-ring-badge-circle') as SVGCircleElement;
        this.flowBadgeText = this.flowGroup.querySelector('.ert-inquiry-ring-badge-text') as SVGTextElement;
        this.depthBadgeCircle = this.depthGroup.querySelector('.ert-inquiry-ring-badge-circle') as SVGCircleElement;
        this.depthBadgeText = this.depthGroup.querySelector('.ert-inquiry-ring-badge-text') as SVGTextElement;

        const labelGroup = document.createElementNS(SVG_NS, 'g');
        labelGroup.classList.add('ert-inquiry-glyph-label-group');
        this.labelHit = document.createElementNS(SVG_NS, 'rect');
        this.labelHit.classList.add('ert-inquiry-glyph-hit');
        this.labelHit.setAttribute('x', '-180');
        this.labelHit.setAttribute('y', '-110');
        this.labelHit.setAttribute('width', '360');
        this.labelHit.setAttribute('height', '220');
        this.labelHit.setAttribute('rx', '60');
        this.labelHit.setAttribute('ry', '60');

        this.labelText = document.createElementNS(SVG_NS, 'text');
        this.labelText.classList.add('ert-inquiry-glyph-label');
        this.labelText.setAttribute('x', '0');
        this.labelText.setAttribute('y', '0');
        this.labelText.setAttribute('text-anchor', 'middle');
        this.labelText.setAttribute('dominant-baseline', 'middle');

        labelGroup.appendChild(this.labelHit);
        labelGroup.appendChild(this.labelText);

        this.root.appendChild(this.flowGroup);
        this.root.appendChild(this.depthGroup);
        this.root.appendChild(labelGroup);

        this.applyProps(props);
    }

    update(next: Partial<InquiryGlyphProps>): void {
        this.props = { ...this.props, ...next };
        this.applyProps(this.props);
    }

    private applyProps(props: InquiryGlyphProps): void {
        this.labelText.textContent = props.focusLabel;
        this.labelText.setAttribute('aria-label', `Focus target ${props.focusLabel}`);
        this.labelHit.setAttribute('aria-label', `Focus target ${props.focusLabel}`);

        this.applyRingState(
            this.flowGroup,
            this.flowProgress,
            this.flowGlow,
            this.flowBadgeCircle,
            this.flowBadgeText,
            props.flowValue,
            FLOW_RADIUS,
            props.severity,
            props.confidence
        );
        this.applyRingState(
            this.depthGroup,
            this.depthProgress,
            this.depthGlow,
            this.depthBadgeCircle,
            this.depthBadgeText,
            props.depthValue,
            DEPTH_RADIUS,
            props.severity,
            props.confidence
        );
    }

    private buildRingGroup(
        kind: 'flow' | 'depth',
        radius: number,
        strokeWidth: number,
        hitStrokeWidth: number,
        badgeRadius: number
    ): SVGGElement {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('ert-inquiry-ring', `ert-inquiry-ring--${kind}`);

        const glow = this.buildCircle(radius, strokeWidth, 'ert-inquiry-ring-glow');
        const track = this.buildCircle(radius, strokeWidth, 'ert-inquiry-ring-track');
        const progress = this.buildCircle(radius, strokeWidth, 'ert-inquiry-ring-progress');
        const hit = this.buildCircle(radius, hitStrokeWidth, 'ert-inquiry-ring-hit');
        const badgeGroup = this.buildBadgeGroup(badgeRadius);

        const circumference = 2 * Math.PI * radius;
        progress.setAttribute('stroke-dasharray', circumference.toFixed(2));
        progress.setAttribute('stroke-dashoffset', circumference.toFixed(2));
        progress.setAttribute('stroke-linecap', 'round');
        progress.setAttribute('transform', 'rotate(-90 0 0)');
        progress.setAttribute('data-circumference', circumference.toFixed(2));

        group.appendChild(glow);
        group.appendChild(track);
        group.appendChild(progress);
        group.appendChild(hit);
        group.appendChild(badgeGroup);

        return group;
    }

    private buildBadgeGroup(badgeRadius: number): SVGGElement {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('ert-inquiry-ring-badge');

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.classList.add('ert-inquiry-ring-badge-circle');
        circle.setAttribute('r', String(badgeRadius));

        const text = document.createElementNS(SVG_NS, 'text');
        text.classList.add('ert-inquiry-ring-badge-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');

        group.appendChild(circle);
        group.appendChild(text);

        return group;
    }

    private buildCircle(radius: number, strokeWidth: number, cls: string): SVGCircleElement {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.classList.add(cls);
        circle.setAttribute('cx', '0');
        circle.setAttribute('cy', '0');
        circle.setAttribute('r', String(radius));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke-width', String(strokeWidth));
        return circle;
    }

    private applyRingState(
        ring: SVGGElement,
        progress: SVGCircleElement,
        glow: SVGCircleElement,
        badgeCircle: SVGCircleElement,
        badgeText: SVGTextElement,
        value: number,
        radius: number,
        severity: InquirySeverity,
        confidence: InquiryConfidence
    ): void {
        ring.classList.remove('is-severity-low', 'is-severity-medium', 'is-severity-high');
        ring.classList.remove('is-confidence-low', 'is-confidence-medium', 'is-confidence-high');
        ring.classList.add(`is-severity-${severity}`);
        ring.classList.add(`is-confidence-${confidence}`);
        this.updateRingProgress(progress, value);
        this.updateGlow(glow, value);
        this.updateBadge(badgeCircle, badgeText, value, radius);
    }

    private updateRingProgress(progress: SVGCircleElement, normalized: number): void {
        const circumference = Number(progress.getAttribute('data-circumference') || '0');
        if (!Number.isFinite(circumference) || circumference <= 0) return;
        const safeValue = Math.min(Math.max(normalized, 0), 1);
        const offset = circumference * (1 - safeValue);
        progress.setAttribute('stroke-dashoffset', offset.toFixed(2));
    }

    private updateGlow(glow: SVGCircleElement, normalized: number): void {
        const safeValue = Math.min(Math.max(normalized, 0), 1);
        const opacity = 0.15 + (safeValue * 0.45);
        glow.style.setProperty('--ert-inquiry-glow-opacity', opacity.toFixed(3));
    }

    private updateBadge(
        badgeCircle: SVGCircleElement,
        badgeText: SVGTextElement,
        normalized: number,
        radius: number
    ): void {
        const safeValue = Math.min(Math.max(normalized, 0), 1);
        const theta = (-90 + (360 * safeValue)) * (Math.PI / 180);
        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        badgeCircle.setAttribute('cx', x.toFixed(2));
        badgeCircle.setAttribute('cy', y.toFixed(2));
        badgeText.setAttribute('x', x.toFixed(2));
        badgeText.setAttribute('y', y.toFixed(2));
        badgeText.textContent = String(Math.round(safeValue * 100));
    }
}
