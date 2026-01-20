import type { InquiryConfidence, InquirySeverity } from '../state';
import { ZONE_LAYOUT, type InquiryZoneId } from '../zoneLayout';

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
const ZONE_SEGMENT_RADIUS = FLOW_RADIUS + (FLOW_STROKE / 2) + 280;
const ZONE_RING_THICKNESS = 140;
const ZONE_RING_GAP_PX = 20;
const ZONE_DOT_RADIUS_PX = 20;
const ZONE_DOT_TEXT_PX = 12;
const ZONE_NUMBER_COUNT = 5;
const ZONE_NUMBER_SPACING_DEG = 4;
const ZONE_SEGMENT_VIEWBOX_WIDTH = 159;
const ZONE_SEGMENT_VIEWBOX_HEIGHT = 257;
const ZONE_SEGMENT_SCALE = 2.6;
const ZONE_SEGMENT_STROKE_WIDTH = 2;
const ZONE_SEGMENT_PATH = 'M154.984 7.67055C154.316 3.30311 150.229 0.286294 145.895 1.14796C120.714 6.15504 96.8629 16.4983 75.9632 31.5162C52.8952 48.0921 34.0777 69.8922 21.0492 95.1341C8.02081 120.376 1.15135 148.343 1.00251 176.748C0.867659 202.484 6.25287 227.917 16.7583 251.344C18.5662 255.375 23.3927 256.959 27.3399 254.974L42.9203 247.138C57.7222 239.693 63.2828 221.65 59.5838 205.5C57.4532 196.197 56.3914 186.649 56.4417 177.039C56.5447 157.382 61.2984 138.029 70.3141 120.562C79.3298 103.094 92.3515 88.0087 108.315 76.5382C116.118 70.9305 124.517 66.2647 133.334 62.6127C148.641 56.2724 160.128 41.2878 157.622 24.9099L154.984 7.67055Z';
const ZONE_SEGMENT_FILL = '#7b6448';
const ZONE_SEGMENT_STROKE = '#d6c3ad';
const ZONE_DOT_STROKE = '#f4eadb';
const ZONE_DOT_TEXT = '#2a2118';
const ZONE_BASE_ANGLE = Math.PI;
const ZONE_SEGMENT_AXIS_ROTATION_DEG = 90;
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

        const midR = ZONE_SEGMENT_RADIUS;
        const innerR = midR - (ZONE_RING_THICKNESS / 2);
        const outerR = midR + (ZONE_RING_THICKNESS / 2);
        const gapAngle = ZONE_RING_GAP_PX / midR;
        const zoneStep = (2 * Math.PI) / ZONE_SEGMENT_COUNT;
        const zoneSpacing = zoneStep + gapAngle;
        const zoneArcRange = zoneStep - gapAngle;
        const zoneTemplate = this.buildZoneSegmentTemplate();

        const zones: Array<{ id: InquiryZoneId; label: string; index: number; fill: string }> = [
            { id: 'setup', label: '1', index: 1, fill: '#2fbf6a' },
            { id: 'pressure', label: '2', index: -1, fill: '#3b7ddd' },
            { id: 'payoff', label: '3', index: 0, fill: '#d65252' }
        ];

        zones.forEach(zone => {
            const centerAngle = ZONE_BASE_ANGLE + (zone.index * zoneSpacing);
            const layout = ZONE_LAYOUT[zone.id];
            const fallbackX = midR * Math.sin(centerAngle);
            const fallbackY = -midR * Math.cos(centerAngle);
            const zoneX = layout?.x ?? fallbackX;
            const zoneY = layout?.y ?? fallbackY;
            const axisRotationDeg = layout?.axisRotationDeg ?? ZONE_SEGMENT_AXIS_ROTATION_DEG;
            const zoneRadius = Math.hypot(zoneX, zoneY);
            const zoneAngle = Math.atan2(zoneY, zoneX);
            const zoneGroup = document.createElementNS(SVG_NS, 'g');
            zoneGroup.classList.add('inq-zone-segment-wrap', `inq-zone-segment-wrap--${zone.id}`);

            const translateGroup = document.createElementNS(SVG_NS, 'g');
            translateGroup.setAttribute('transform', `translate(${zoneX.toFixed(2)} ${zoneY.toFixed(2)})`);
            const axisGroup = document.createElementNS(SVG_NS, 'g');
            axisGroup.setAttribute('transform', `rotate(${axisRotationDeg})`);
            const zoneNode = zoneTemplate.cloneNode(true) as SVGGElement;
            const zonePath = zoneNode.querySelector('.inq-zone-segment-path') as SVGPathElement | null;
            if (zonePath) zonePath.setAttribute('fill', zone.fill);
            axisGroup.appendChild(zoneNode);
            translateGroup.appendChild(axisGroup);
            zoneGroup.appendChild(translateGroup);
            group.appendChild(zoneGroup);

            const numberRadius = layout?.numberRadius ?? zoneRadius;
            const numberStartAngle = layout?.numberStartAngleDeg ?? ((zoneAngle + (zoneArcRange / 2)) * (180 / Math.PI));
            const numberDirection = layout?.numberDirection ?? 'ccw';
            const dotSpacingRad = (ZONE_NUMBER_SPACING_DEG * Math.PI) / 180;
            const startAngleRad = (numberStartAngle * Math.PI) / 180;
            const step = numberDirection === 'ccw' ? -dotSpacingRad : dotSpacingRad;
            for (let i = 0; i < ZONE_NUMBER_COUNT; i += 1) {
                const dotAngle = startAngleRad + (step * i);
                const dotX = numberRadius * Math.cos(dotAngle);
                const dotY = numberRadius * Math.sin(dotAngle);
                const dotGroup = document.createElementNS(SVG_NS, 'g');
                dotGroup.classList.add('inq-zone-dot', `inq-zone-dot--${zone.id}`);
                dotGroup.setAttribute('transform', `translate(${dotX.toFixed(2)} ${dotY.toFixed(2)})`);
                dotGroup.setAttribute('aria-label', `${zone.id} prompt`);
                dotGroup.setAttribute('role', 'note');

                const dotCircle = document.createElementNS(SVG_NS, 'circle');
                dotCircle.classList.add('inq-zone-dot-circle');
                dotCircle.setAttribute('r', String(ZONE_DOT_RADIUS_PX));
                dotCircle.setAttribute('fill', 'none');
                dotCircle.setAttribute('stroke', ZONE_DOT_STROKE);
                dotCircle.setAttribute('stroke-width', String(ZONE_DOT_RADIUS_PX / 2));

                const dotText = document.createElementNS(SVG_NS, 'text');
                dotText.classList.add('inq-zone-dot-text');
                dotText.setAttribute('text-anchor', 'middle');
                dotText.setAttribute('dominant-baseline', 'middle');
                dotText.setAttribute('font-size', String(ZONE_DOT_TEXT_PX));
                dotText.setAttribute('fill', ZONE_DOT_TEXT);
                dotText.textContent = String(i + 1);

                dotGroup.appendChild(dotCircle);
                dotGroup.appendChild(dotText);
                zoneGroup.appendChild(dotGroup);
                this.zoneDots.push({ circle: dotCircle, text: dotText });
            }
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

    private buildZoneSegmentTemplate(): SVGGElement {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('inq-zone-segment-template');
        const offsetX = -(ZONE_SEGMENT_VIEWBOX_WIDTH * ZONE_SEGMENT_SCALE) / 2;
        const offsetY = -(ZONE_SEGMENT_VIEWBOX_HEIGHT * ZONE_SEGMENT_SCALE) / 2;
        group.setAttribute('transform', `translate(${offsetX} ${offsetY})`);

        const scaleGroup = document.createElementNS(SVG_NS, 'g');
        scaleGroup.setAttribute('transform', `scale(${ZONE_SEGMENT_SCALE})`);

        const path = document.createElementNS(SVG_NS, 'path');
        path.classList.add('inq-zone-segment-path');
        path.setAttribute('d', ZONE_SEGMENT_PATH);
        path.setAttribute('fill', ZONE_SEGMENT_FILL);
        path.setAttribute('stroke', ZONE_SEGMENT_STROKE);
        path.setAttribute('stroke-width', String(ZONE_SEGMENT_STROKE_WIDTH));
        path.setAttribute('pointer-events', 'none');
        scaleGroup.appendChild(path);
        group.appendChild(scaleGroup);

        return group;
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
        text.setAttribute('dy', '0.35em');

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
        badgeText.style.setProperty('--ert-inquiry-badge-text-color', arcColor);
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
