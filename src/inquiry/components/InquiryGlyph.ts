import type { InquiryConfidence, InquirySeverity } from '../state';

export interface InquiryGlyphProps {
    focusLabel: string;
    flowValue: number;  // 0..1 normalized
    depthValue: number; // 0..1 normalized
    severity: InquirySeverity;
    confidence: InquiryConfidence;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export const FLOW_RADIUS = 260;
export const DEPTH_RADIUS = 195;
export const FLOW_STROKE = 14;
export const DEPTH_STROKE = 24;
const FLOW_HIT_STROKE = 38;
const DEPTH_HIT_STROKE = 48;
const FLOW_BADGE_RADIUS_PX = FLOW_STROKE / 2;
const DEPTH_BADGE_RADIUS_PX = DEPTH_STROKE / 2;
const FLOW_BADGE_TEXT_PX = Math.round(16 / 2);
const DEPTH_BADGE_TEXT_PX = Math.round(20 * (2 / 3));
const LABEL_TEXT_PX = 70;
const ARC_BASE_TINT = '#dff5e7';
const ARC_MAX_GREEN = '#22c55e';
const DOT_DARKEN = 0.35;
const ZONE_SEGMENT_COUNT = 3;
const ZONE_RING_OFFSET = 40;
const ZONE_RING_THICKNESS = 140;
const ZONE_RING_GAP_PX = 20;
const ZONE_DOT_RADIUS_PX = 13;
const ZONE_DOT_TEXT_PX = 12;
const ZONE_SEGMENT_FILL = '#7b6448';
const ZONE_SEGMENT_STROKE = '#d6c3ad';
const ZONE_OUTLINE_WIDTH = 6;
const ZONE_CAP_START_SCALE = 0.55;
const ZONE_CAP_END_SCALE = 0.75;
const ZONE_DOT_FILL = '#e7d5bf';
const ZONE_DOT_STROKE = '#f4eadb';
const ZONE_DOT_TEXT = '#2a2118';
const ZONE_BASE_ANGLE = Math.PI / 2;
const DEBUG_INQUIRY_ZONES = false;

export const GLYPH_OUTER_DIAMETER = (FLOW_RADIUS * 2) + FLOW_STROKE;

export class InquiryGlyph {
    private props: InquiryGlyphProps;

    readonly root: SVGGElement;
    readonly flowRingHit: SVGCircleElement;
    readonly depthRingHit: SVGCircleElement;
    readonly labelHit: SVGRectElement;

    private flowProgressGroup: SVGGElement;
    private depthProgressGroup: SVGGElement;
    private flowArc: SVGPathElement;
    private depthArc: SVGPathElement;
    private flowBadgeCircle: SVGCircleElement;
    private flowBadgeText: SVGTextElement;
    private depthBadgeCircle: SVGCircleElement;
    private depthBadgeText: SVGTextElement;
    private labelText: SVGTextElement;
    private flowGroup: SVGGElement;
    private depthGroup: SVGGElement;
    private badgeScaleFactor = 1;
    private zoneDots: Array<{ circle: SVGCircleElement; text: SVGTextElement }> = [];

    constructor(container: SVGElement, props: InquiryGlyphProps) {
        this.props = props;
        this.root = document.createElementNS(SVG_NS, 'g');
        this.root.classList.add('ert-inquiry-glyph');
        container.appendChild(this.root);

        this.root.appendChild(this.buildZoneRing());
        this.flowGroup = this.buildRingGroup('flow', FLOW_RADIUS, FLOW_STROKE, FLOW_HIT_STROKE, FLOW_BADGE_RADIUS_PX);
        this.depthGroup = this.buildRingGroup('depth', DEPTH_RADIUS, DEPTH_STROKE, DEPTH_HIT_STROKE, DEPTH_BADGE_RADIUS_PX);

        this.flowProgressGroup = this.flowGroup.querySelector('.ert-inquiry-ring-progress') as SVGGElement;
        this.depthProgressGroup = this.depthGroup.querySelector('.ert-inquiry-ring-progress') as SVGGElement;
        this.flowArc = this.flowGroup.querySelector('.ert-inquiry-ring-arc') as SVGPathElement;
        this.depthArc = this.depthGroup.querySelector('.ert-inquiry-ring-arc') as SVGPathElement;
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
        this.labelText.setAttribute('dy', '0.12em');

        labelGroup.appendChild(this.labelHit);
        labelGroup.appendChild(this.labelText);

        this.root.appendChild(this.flowGroup);
        this.root.appendChild(this.depthGroup);
        this.root.appendChild(labelGroup);

        this.applyProps(props);
        this.setDisplayScale(1, 1);
    }

    update(next: Partial<InquiryGlyphProps>): void {
        this.props = { ...this.props, ...next };
        this.applyProps(this.props);
    }

    setDisplayScale(scale: number, unitsPerPx: number): void {
        const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
        const safeUnits = Number.isFinite(unitsPerPx) && unitsPerPx > 0 ? unitsPerPx : 1;
        const scaleFactor = safeUnits / safeScale;
        this.badgeScaleFactor = scaleFactor;
        this.labelText.setAttribute('font-size', (LABEL_TEXT_PX * scaleFactor).toFixed(2));
        this.flowBadgeText.setAttribute('font-size', (FLOW_BADGE_TEXT_PX * scaleFactor).toFixed(2));
        this.depthBadgeText.setAttribute('font-size', (DEPTH_BADGE_TEXT_PX * scaleFactor).toFixed(2));
        this.flowBadgeCircle.setAttribute('r', ((FLOW_STROKE / 2) * scaleFactor).toFixed(2));
        this.depthBadgeCircle.setAttribute('r', ((DEPTH_STROKE / 2) * scaleFactor).toFixed(2));
        this.zoneDots.forEach(dot => {
            dot.circle.setAttribute('r', (ZONE_DOT_RADIUS_PX * scaleFactor).toFixed(2));
            dot.text.setAttribute('font-size', (ZONE_DOT_TEXT_PX * scaleFactor).toFixed(2));
        });
    }

    private applyProps(props: InquiryGlyphProps): void {
        this.labelText.textContent = props.focusLabel;
        this.labelText.setAttribute('aria-label', `Focus target ${props.focusLabel}`);
        this.labelHit.setAttribute('aria-label', `Focus target ${props.focusLabel}`);

        this.applyRingState(
            this.flowGroup,
            this.flowProgressGroup,
            this.flowArc,
            this.flowBadgeCircle,
            this.flowBadgeText,
            props.flowValue,
            FLOW_RADIUS,
            FLOW_STROKE,
            props.severity,
            props.confidence,
            'flow'
        );
        this.applyRingState(
            this.depthGroup,
            this.depthProgressGroup,
            this.depthArc,
            this.depthBadgeCircle,
            this.depthBadgeText,
            props.depthValue,
            DEPTH_RADIUS,
            DEPTH_STROKE,
            props.severity,
            props.confidence,
            'depth'
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

        const track = this.buildCircle(radius, strokeWidth, 'ert-inquiry-ring-track');
        const progress = document.createElementNS(SVG_NS, 'g');
        progress.classList.add('ert-inquiry-ring-progress');
        const arc = document.createElementNS(SVG_NS, 'path');
        arc.classList.add('ert-inquiry-ring-arc');
        progress.appendChild(arc);
        const hit = this.buildCircle(radius, hitStrokeWidth, 'ert-inquiry-ring-hit');
        const badgeGroup = this.buildBadgeGroup(badgeRadius);

        group.appendChild(track);
        group.appendChild(progress);
        group.appendChild(hit);
        group.appendChild(badgeGroup);

        return group;
    }

    private buildZoneRing(): SVGGElement {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('inq-zones', 'ert-inquiry-zones');

        const flowOuterRadius = FLOW_RADIUS + (FLOW_STROKE / 2);
        const innerR = flowOuterRadius + ZONE_RING_OFFSET;
        const outerR = innerR + ZONE_RING_THICKNESS;
        const midR = innerR + (ZONE_RING_THICKNESS / 2);
        const gapAngle = ZONE_RING_GAP_PX / midR;
        const segmentSpan = (2 * Math.PI) / ZONE_SEGMENT_COUNT;
        const segmentHalfSpan = (segmentSpan - gapAngle) / 2;
        const capStartRadius = ZONE_RING_THICKNESS * ZONE_CAP_START_SCALE;
        const capEndRadius = ZONE_RING_THICKNESS * ZONE_CAP_END_SCALE;

        const segments = [
            { id: 'setup', label: '1', centerAngle: ZONE_BASE_ANGLE - (segmentSpan * 2) },
            { id: 'pressure', label: '2', centerAngle: ZONE_BASE_ANGLE },
            { id: 'payoff', label: '3', centerAngle: ZONE_BASE_ANGLE - segmentSpan }
        ];

        segments.forEach(segment => {
            const startAngle = segment.centerAngle - segmentHalfSpan;
            const endAngle = segment.centerAngle + segmentHalfSpan;
            const startPoint = this.polarToCartesianRad(midR, startAngle);
            const endPoint = this.polarToCartesianRad(midR, endAngle);
            const arcPath = this.buildArcPath(midR, startAngle, endAngle);

            const outlineArc = document.createElementNS(SVG_NS, 'path');
            outlineArc.classList.add('inq-zone-segment-outline', `inq-zone-segment-outline--${segment.id}`);
            outlineArc.setAttribute('d', arcPath);
            outlineArc.setAttribute('fill', 'none');
            outlineArc.setAttribute('stroke', ZONE_SEGMENT_STROKE);
            outlineArc.setAttribute('stroke-width', String(ZONE_RING_THICKNESS + (ZONE_OUTLINE_WIDTH * 2)));
            outlineArc.setAttribute('stroke-linecap', 'round');
            outlineArc.setAttribute('pointer-events', 'none');
            group.appendChild(outlineArc);

            const outlineStart = document.createElementNS(SVG_NS, 'circle');
            outlineStart.classList.add('inq-zone-cap-outline', `inq-zone-cap-outline--${segment.id}`);
            outlineStart.setAttribute('cx', startPoint.x);
            outlineStart.setAttribute('cy', startPoint.y);
            outlineStart.setAttribute('r', String(capStartRadius + ZONE_OUTLINE_WIDTH));
            outlineStart.setAttribute('fill', ZONE_SEGMENT_STROKE);
            outlineStart.setAttribute('pointer-events', 'none');
            group.appendChild(outlineStart);

            const outlineEnd = document.createElementNS(SVG_NS, 'circle');
            outlineEnd.classList.add('inq-zone-cap-outline', `inq-zone-cap-outline--${segment.id}`);
            outlineEnd.setAttribute('cx', endPoint.x);
            outlineEnd.setAttribute('cy', endPoint.y);
            outlineEnd.setAttribute('r', String(capEndRadius + ZONE_OUTLINE_WIDTH));
            outlineEnd.setAttribute('fill', ZONE_SEGMENT_STROKE);
            outlineEnd.setAttribute('pointer-events', 'none');
            group.appendChild(outlineEnd);

            const fillArc = document.createElementNS(SVG_NS, 'path');
            fillArc.classList.add('inq-zone-segment', `inq-zone-segment--${segment.id}`);
            fillArc.setAttribute('d', arcPath);
            fillArc.setAttribute('fill', 'none');
            fillArc.setAttribute('stroke', ZONE_SEGMENT_FILL);
            fillArc.setAttribute('stroke-width', String(ZONE_RING_THICKNESS));
            fillArc.setAttribute('stroke-linecap', 'round');
            fillArc.setAttribute('pointer-events', 'none');
            group.appendChild(fillArc);

            const fillStart = document.createElementNS(SVG_NS, 'circle');
            fillStart.classList.add('inq-zone-cap', `inq-zone-cap--${segment.id}`);
            fillStart.setAttribute('cx', startPoint.x);
            fillStart.setAttribute('cy', startPoint.y);
            fillStart.setAttribute('r', String(capStartRadius));
            fillStart.setAttribute('fill', ZONE_SEGMENT_FILL);
            fillStart.setAttribute('pointer-events', 'none');
            group.appendChild(fillStart);

            const fillEnd = document.createElementNS(SVG_NS, 'circle');
            fillEnd.classList.add('inq-zone-cap', `inq-zone-cap--${segment.id}`);
            fillEnd.setAttribute('cx', endPoint.x);
            fillEnd.setAttribute('cy', endPoint.y);
            fillEnd.setAttribute('r', String(capEndRadius));
            fillEnd.setAttribute('fill', ZONE_SEGMENT_FILL);
            fillEnd.setAttribute('pointer-events', 'none');
            group.appendChild(fillEnd);

            const dotPos = this.polarToCartesianRad(midR, segment.centerAngle);
            const dotGroup = document.createElementNS(SVG_NS, 'g');
            dotGroup.classList.add('inq-zone-dot', `inq-zone-dot--${segment.id}`);
            dotGroup.setAttribute('transform', `translate(${dotPos.x} ${dotPos.y})`);
            dotGroup.setAttribute('aria-label', `${segment.id} prompt`);
            dotGroup.setAttribute('role', 'note');

            const dotCircle = document.createElementNS(SVG_NS, 'circle');
            dotCircle.classList.add('inq-zone-dot-circle');
            dotCircle.setAttribute('r', String(ZONE_DOT_RADIUS_PX));
            dotCircle.setAttribute('fill', ZONE_DOT_FILL);
            dotCircle.setAttribute('stroke', ZONE_DOT_STROKE);
            dotCircle.setAttribute('stroke-width', '1');

            const dotText = document.createElementNS(SVG_NS, 'text');
            dotText.classList.add('inq-zone-dot-text');
            dotText.setAttribute('text-anchor', 'middle');
            dotText.setAttribute('dominant-baseline', 'middle');
            dotText.setAttribute('font-size', String(ZONE_DOT_TEXT_PX));
            dotText.setAttribute('fill', ZONE_DOT_TEXT);
            dotText.textContent = segment.label;

            dotGroup.appendChild(dotCircle);
            dotGroup.appendChild(dotText);
            group.appendChild(dotGroup);
            this.zoneDots.push({ circle: dotCircle, text: dotText });
        });

        if (DEBUG_INQUIRY_ZONES) {
            const debugGroup = document.createElementNS(SVG_NS, 'g');
            debugGroup.classList.add('inq-zone-debug');
            [innerR, midR, outerR].forEach(radius => {
                const circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('r', radius.toFixed(2));
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke', '#ffb400');
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('stroke-dasharray', '5 4');
                debugGroup.appendChild(circle);
            });
            group.appendChild(debugGroup);
        }

        return group;
    }

    private buildArcPath(radius: number, startAngle: number, endAngle: number): string {
        let sweepAngle = endAngle - startAngle;
        if (sweepAngle < 0) sweepAngle += Math.PI * 2;
        const largeArc = sweepAngle > Math.PI ? 1 : 0;
        const start = this.polarToCartesianRad(radius, startAngle);
        const end = this.polarToCartesianRad(radius, endAngle);
        return `M ${start.x} ${start.y} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${end.x} ${end.y}`;
    }

    private polarToCartesianRad(radius: number, radians: number): { x: string; y: string } {
        return {
            x: (radius * Math.cos(radians)).toFixed(2),
            y: (radius * Math.sin(radians)).toFixed(2)
        };
    }

    private buildBadgeGroup(badgeRadius: number): SVGGElement {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('ert-inquiry-ring-badge');
        group.setAttribute('stroke', 'none');

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.classList.add('ert-inquiry-ring-badge-circle');
        circle.setAttribute('r', String(badgeRadius));
        circle.setAttribute('stroke', 'none');
        circle.setAttribute('stroke-width', '0');

        const text = document.createElementNS(SVG_NS, 'text');
        text.classList.add('ert-inquiry-ring-badge-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('alignment-baseline', 'middle');

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
        progress: SVGGElement,
        arc: SVGPathElement,
        badgeCircle: SVGCircleElement,
        badgeText: SVGTextElement,
        value: number,
        radius: number,
        strokeWidth: number,
        severity: InquirySeverity,
        confidence: InquiryConfidence,
        kind: 'flow' | 'depth'
    ): void {
        ring.classList.remove('is-severity-low', 'is-severity-medium', 'is-severity-high');
        ring.classList.remove('is-confidence-low', 'is-confidence-medium', 'is-confidence-high');
        ring.classList.add(`is-severity-${severity}`);
        ring.classList.add(`is-confidence-${confidence}`);
        this.updateRingArc(progress, arc, value, radius, strokeWidth);
        this.updateBadge(badgeCircle, badgeText, value, radius, strokeWidth);
    }

    private updateRingArc(
        progressGroup: SVGGElement,
        arc: SVGPathElement,
        normalized: number,
        radius: number,
        strokeWidth: number
    ): void {
        const safeValue = Math.min(Math.max(normalized, 0), 1);
        if (safeValue <= 0) {
            arc.setAttribute('d', '');
            progressGroup.setAttribute('opacity', '0');
            return;
        }
        progressGroup.setAttribute('opacity', '1');
        const startDeg = -90;
        let sweepDeg = safeValue * 360;
        if (sweepDeg > 359.999) sweepDeg = 359.999;
        const endDeg = startDeg + sweepDeg;
        const start = this.polarToCartesian(radius, startDeg);
        const end = this.polarToCartesian(radius, endDeg);
        const largeArc = sweepDeg > 180 ? 1 : 0;
        let d = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
        if (safeValue >= 0.9999) {
            const mid = this.polarToCartesian(radius, startDeg + 180);
            d = [
                `M ${start.x} ${start.y}`,
                `A ${radius} ${radius} 0 1 1 ${mid.x} ${mid.y}`,
                `A ${radius} ${radius} 0 1 1 ${start.x} ${start.y}`
            ].join(' ');
        }
        arc.setAttribute('d', d);
        arc.setAttribute('stroke-width', String(strokeWidth));
        arc.setAttribute('stroke-linecap', 'round');
        arc.setAttribute('fill', 'none');
        const arcColor = InquiryGlyph.mixColors(ARC_BASE_TINT, ARC_MAX_GREEN, safeValue);
        arc.setAttribute('stroke', arcColor);
    }

    private updateBadge(
        badgeCircle: SVGCircleElement,
        badgeText: SVGTextElement,
        normalized: number,
        radius: number,
        strokeWidth: number
    ): void {
        const safeValue = Math.min(Math.max(normalized, 0), 1);
        const theta = (-90 + (360 * safeValue)) * (Math.PI / 180);
        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        const badgeRadius = (strokeWidth / 2) * this.badgeScaleFactor;
        badgeCircle.setAttribute('cx', x.toFixed(2));
        badgeCircle.setAttribute('cy', y.toFixed(2));
        badgeCircle.setAttribute('r', badgeRadius.toFixed(2));
        badgeText.setAttribute('x', x.toFixed(2));
        badgeText.setAttribute('y', y.toFixed(2));
        badgeText.textContent = String(Math.round(safeValue * 100));
        const arcColor = InquiryGlyph.mixColors(ARC_BASE_TINT, ARC_MAX_GREEN, safeValue);
        const badgeColor = InquiryGlyph.darkenColor(arcColor, DOT_DARKEN);
        badgeCircle.style.setProperty('--ert-inquiry-badge-color', badgeColor);
    }

    private static mixColors(start: string, end: string, t: number): string {
        const clamp = Math.min(Math.max(t, 0), 1);
        const parse = (hex: string) => {
            const clean = hex.replace('#', '');
            const num = parseInt(clean, 16);
            return {
                r: (num >> 16) & 0xff,
                g: (num >> 8) & 0xff,
                b: num & 0xff
            };
        };
        const a = parse(start);
        const b = parse(end);
        const r = Math.round(a.r + (b.r - a.r) * clamp);
        const g = Math.round(a.g + (b.g - a.g) * clamp);
        const bl = Math.round(a.b + (b.b - a.b) * clamp);
        return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
    }

    private static darkenColor(hex: string, amount: number): string {
        const clamp = Math.min(Math.max(amount, 0), 1);
        const clean = hex.replace('#', '');
        const num = parseInt(clean, 16);
        const r = (num >> 16) & 0xff;
        const g = (num >> 8) & 0xff;
        const b = num & 0xff;
        const factor = 1 - clamp;
        const dr = Math.round(r * factor);
        const dg = Math.round(g * factor);
        const db = Math.round(b * factor);
        return `#${((1 << 24) + (dr << 16) + (dg << 8) + db).toString(16).slice(1)}`;
    }

    private polarToCartesian(radius: number, degrees: number): { x: string; y: string } {
        const radians = (degrees * Math.PI) / 180;
        return {
            x: (radius * Math.cos(radians)).toFixed(2),
            y: (radius * Math.sin(radians)).toFixed(2)
        };
    }
}
