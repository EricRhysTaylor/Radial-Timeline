import type { InquiryConfidence, InquirySeverity } from '../state';

export interface InquiryGlyphProps {
    focusLabel: string;
    flowValue: number;  // 0..1 normalized
    depthValue: number; // 0..1 normalized
    severity: InquirySeverity;
    confidence: InquiryConfidence;
}

const GLYPH_VIEWBOX = '-800 -800 1600 1600';
const FLOW_RADIUS = 260;
const DEPTH_RADIUS = 195;
const FLOW_STROKE = 14;
const DEPTH_STROKE = 28;
const FLOW_HIT_STROKE = 38;
const DEPTH_HIT_STROKE = 52;

export class InquiryGlyph {
    private props: InquiryGlyphProps;

    readonly root: HTMLDivElement;
    readonly svg: SVGSVGElement;
    readonly flowRingHit: SVGCircleElement;
    readonly depthRingHit: SVGCircleElement;
    readonly labelHit: SVGRectElement;

    private flowProgress: SVGCircleElement;
    private depthProgress: SVGCircleElement;
    private labelText: SVGTextElement;
    private flowGroup: SVGGElement;
    private depthGroup: SVGGElement;

    constructor(container: HTMLElement, props: InquiryGlyphProps) {
        this.props = props;
        this.root = container.createDiv({ cls: 'rt-inquiry-glyph-stack' });

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('viewBox', GLYPH_VIEWBOX);
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.svg.classList.add('rt-inquiry-glyph-svg');

        this.flowGroup = this.buildRingGroup('flow', FLOW_RADIUS, FLOW_STROKE, FLOW_HIT_STROKE);
        this.depthGroup = this.buildRingGroup('depth', DEPTH_RADIUS, DEPTH_STROKE, DEPTH_HIT_STROKE);

        this.flowProgress = this.flowGroup.querySelector('.rt-inquiry-ring-progress') as SVGCircleElement;
        this.depthProgress = this.depthGroup.querySelector('.rt-inquiry-ring-progress') as SVGCircleElement;
        this.flowRingHit = this.flowGroup.querySelector('.rt-inquiry-ring-hit') as SVGCircleElement;
        this.depthRingHit = this.depthGroup.querySelector('.rt-inquiry-ring-hit') as SVGCircleElement;

        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelGroup.classList.add('rt-inquiry-glyph-label-group');
        this.labelHit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this.labelHit.classList.add('rt-inquiry-glyph-hit');
        this.labelHit.setAttribute('x', '-180');
        this.labelHit.setAttribute('y', '-110');
        this.labelHit.setAttribute('width', '360');
        this.labelHit.setAttribute('height', '220');
        this.labelHit.setAttribute('rx', '60');
        this.labelHit.setAttribute('ry', '60');

        this.labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        this.labelText.classList.add('rt-inquiry-glyph-label');
        this.labelText.setAttribute('x', '0');
        this.labelText.setAttribute('y', '0');
        this.labelText.setAttribute('text-anchor', 'middle');
        this.labelText.setAttribute('dominant-baseline', 'middle');

        labelGroup.appendChild(this.labelHit);
        labelGroup.appendChild(this.labelText);

        this.svg.appendChild(this.flowGroup);
        this.svg.appendChild(this.depthGroup);
        this.svg.appendChild(labelGroup);
        this.root.appendChild(this.svg);

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

        this.applyRingState(this.flowGroup, this.flowProgress, props.flowValue, props.severity, props.confidence);
        this.applyRingState(this.depthGroup, this.depthProgress, props.depthValue, props.severity, props.confidence);
    }

    private buildRingGroup(
        kind: 'flow' | 'depth',
        radius: number,
        strokeWidth: number,
        hitStrokeWidth: number
    ): SVGGElement {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('rt-inquiry-ring', `rt-inquiry-ring--${kind}`);

        const track = this.buildCircle(radius, strokeWidth, 'rt-inquiry-ring-track');
        const progress = this.buildCircle(radius, strokeWidth, 'rt-inquiry-ring-progress');
        const hit = this.buildCircle(radius, hitStrokeWidth, 'rt-inquiry-ring-hit');

        const circumference = 2 * Math.PI * radius;
        progress.setAttribute('stroke-dasharray', circumference.toFixed(2));
        progress.setAttribute('stroke-dashoffset', circumference.toFixed(2));
        progress.setAttribute('stroke-linecap', 'round');
        progress.setAttribute('transform', 'rotate(-90 0 0)');
        progress.setAttribute('data-circumference', circumference.toFixed(2));

        group.appendChild(track);
        group.appendChild(progress);
        group.appendChild(hit);

        return group;
    }

    private buildCircle(radius: number, strokeWidth: number, cls: string): SVGCircleElement {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
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
        value: number,
        severity: InquirySeverity,
        confidence: InquiryConfidence
    ): void {
        ring.classList.remove('is-severity-low', 'is-severity-medium', 'is-severity-high');
        ring.classList.remove('is-confidence-low', 'is-confidence-medium', 'is-confidence-high');
        ring.classList.add(`is-severity-${severity}`);
        ring.classList.add(`is-confidence-${confidence}`);
        this.updateRingProgress(progress, value);
    }

    private updateRingProgress(progress: SVGCircleElement, normalized: number): void {
        const circumference = Number(progress.getAttribute('data-circumference') || '0');
        if (!Number.isFinite(circumference) || circumference <= 0) return;
        const safeValue = Math.min(Math.max(normalized, 0), 1);
        const offset = circumference * (1 - safeValue);
        progress.setAttribute('stroke-dashoffset', offset.toFixed(2));
    }
}
