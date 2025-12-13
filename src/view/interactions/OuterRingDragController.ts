import { Notice, App } from 'obsidian';
import { applySceneNumberUpdates, type SceneUpdate } from '../../services/SceneReorderService';
import { DragConfirmModal } from '../../modals/DragConfirmModal';
import { DRAG_DROP_ARC_RADIUS, DRAG_DROP_TICK_OUTER_RADIUS } from '../../renderer/layout/LayoutConstants';

export interface OuterRingViewAdapter {
    plugin: { app: App; settings: Record<string, unknown> };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

export interface OuterRingDragOptions {
    onRefresh: () => void;
    enableDebug?: boolean;
    mode: string;
}

export class OuterRingDragController {
    private readonly svg: SVGSVGElement;
    private readonly view: OuterRingViewAdapter;
    private readonly options: OuterRingDragOptions;

    private HOLD_MS = 180;
    private MOVE_THRESHOLD_PX = 7;

    private currentTarget: SVGGElement | null = null;
    private dragging = false;
    private sourceSceneId: string | null = null;
    private sourceGroup: SVGGElement | null = null;
    private holdTimer: number | null = null;
    private startX = 0;
    private startY = 0;
    private confirming = false;
    private dropTick: SVGPathElement | null = null;
    private originColor?: string;
    private originStartAngle?: number;
    private originOuterR?: number;
    private dropArc: SVGPathElement | null = null;

    constructor(view: OuterRingViewAdapter, svg: SVGSVGElement, options: OuterRingDragOptions) {
        this.view = view;
        this.svg = svg;
        this.options = options;
    }

    attach(): void {
        if (this.options.mode !== 'narrative') return;
        const outerGroups = Array.from(this.svg.querySelectorAll<SVGGElement>('.number-square-group[data-outer-ring="true"]'));
        if (!outerGroups.length) return;

        this.view.registerDomEvent(window as unknown as HTMLElement, 'pointermove', (evt: PointerEvent) => this.onPointerMove(evt));
        this.view.registerDomEvent(window as unknown as HTMLElement, 'pointerup', () => this.onPointerUp());
        outerGroups.forEach(group => {
            this.view.registerDomEvent(group as unknown as HTMLElement, 'pointerdown', (evt: PointerEvent) => this.startDrag(evt, group));
        });
    }

    private log(msg: string, data?: Record<string, unknown>): void {
        if (!this.options.enableDebug) return;
        const pluginAny = this.view?.plugin as { log?: (message: string, meta?: Record<string, unknown>) => void } | undefined;
        if (pluginAny?.log) {
            pluginAny.log(`Outer ring drag · ${msg}`, data);
        }
    }

    private cssEscape(value: string): string {
        if (typeof (window as any).CSS !== 'undefined' && (window as any).CSS.escape) {
            return (window as any).CSS.escape(value);
        }
        return value.replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
    }

    private splitNumberParts(numText: string | null | undefined): { intPart: number; suffix: string } {
        if (!numText) return { intPart: 0, suffix: '' };
        const trimmed = String(numText).trim();
        const match = trimmed.match(/^(\d+)(\..+)?$/);
        if (!match) return { intPart: 0, suffix: '' };
        return { intPart: Number(match[1]) || 0, suffix: match[2] || '' };
    }

    private getSceneIdFromNumberGroup(group: Element | null): string | null {
        if (!group) return null;
        const rect = group.querySelector<SVGRectElement>('.rt-number-square[data-scene-id]');
        return rect?.dataset.sceneId || null;
    }

    private buildOuterRingOrder(): Array<{ sceneId: string; path: string; numberText: string }> {
        const groups = Array.from(this.svg.querySelectorAll<SVGGElement>('.number-square-group[data-outer-ring="true"]'));
        return groups.map((group) => {
            const sceneId = this.getSceneIdFromNumberGroup(group) || '';
            const pathEl = sceneId
                ? this.svg.querySelector<SVGPathElement>(`#${this.cssEscape(sceneId)}`)
                : null;
            const sceneGroup = pathEl?.closest('.rt-scene-group');
            const encodedPath = sceneGroup?.getAttribute('data-path') || '';
            const path = encodedPath ? decodeURIComponent(encodedPath) : '';
            const numberTextEl = this.svg.querySelector<SVGTextElement>(`.rt-number-text[data-scene-id="${this.cssEscape(sceneId)}"]`);
            const numberText = numberTextEl?.textContent?.trim() || '';
            return { sceneId, path, numberText };
        }).filter(entry => entry.sceneId && entry.path);
    }

    private clearHighlight(): void {
        if (this.currentTarget) {
            this.currentTarget.classList.remove('rt-drop-target');
            this.currentTarget = null;
        }
        if (this.dropTick) {
            this.dropTick.setAttribute('d', '');
        }
        if (this.dropArc) {
            this.dropArc.setAttribute('d', '');
        }
    }

    private setHighlight(group: SVGGElement | null): void {
        if (!group || group === this.currentTarget) return;
        this.clearHighlight();
        this.currentTarget = group;
        this.currentTarget.classList.add('rt-drop-target');
        const sceneId = this.getSceneIdFromNumberGroup(group);
        if (!sceneId) return;
        const pathEl = this.svg.querySelector<SVGPathElement>(`#${this.cssEscape(sceneId)}`);
        const sceneGroup = pathEl?.closest<SVGGElement>('.rt-scene-group');
        if (!sceneGroup) return;
        const startAngle = Number(sceneGroup.getAttribute('data-start-angle') ?? '');
        const outerR = Number(sceneGroup.getAttribute('data-outer-r') ?? '');
        if (!Number.isFinite(startAngle) || !Number.isFinite(outerR)) return;
        this.updateDropTick(startAngle, outerR, this.originColor);
        if (this.originStartAngle !== undefined && this.originOuterR !== undefined) {
            const rArc = DRAG_DROP_ARC_RADIUS;
            this.updateDropArc(this.originStartAngle, startAngle, rArc, this.originColor);
        }
    }

    private findOuterGroup(evt: PointerEvent): SVGGElement | null {
        const direct = (evt.target as Element | null)?.closest('.number-square-group[data-outer-ring="true"]');
        if (direct) return direct as SVGGElement;
        const fromPoint = document.elementFromPoint(evt.clientX, evt.clientY);
        const fallback = fromPoint?.closest('.number-square-group[data-outer-ring="true"]');
        return fallback as SVGGElement | null;
    }

    private ensureDropTick(): SVGPathElement {
        if (this.dropTick && this.dropTick.isConnected) return this.dropTick;
        const existing = this.svg.querySelector<SVGPathElement>('.rt-drop-target-tick');
        if (existing) {
            this.dropTick = existing;
            return existing;
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('rt-drop-target-tick');
        path.setAttribute('d', '');
        const overlays = this.svg.querySelector<SVGGElement>('#rt-overlays');
        if (overlays) overlays.appendChild(path); else this.svg.appendChild(path);
        this.dropTick = path;
        return path;
    }

    private ensureDropArc(): SVGPathElement {
        if (this.dropArc && this.dropArc.isConnected) return this.dropArc;
        const existing = this.svg.querySelector<SVGPathElement>('.rt-drop-target-arc');
        if (existing) {
            this.dropArc = existing;
            return existing;
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('rt-drop-target-arc');
        path.setAttribute('d', '');
        const overlays = this.svg.querySelector<SVGGElement>('#rt-overlays');
        if (overlays) overlays.appendChild(path); else this.svg.appendChild(path);
        this.dropArc = path;
        return path;
    }

    private updateDropTick(startAngle: number, outerR: number, color?: string): void {
        const tick = this.ensureDropTick();

        const r1 = outerR;
        const r2 = DRAG_DROP_TICK_OUTER_RADIUS;
        const x1 = r1 * Math.cos(startAngle);
        const y1 = r1 * Math.sin(startAngle);
        const x2 = r2 * Math.cos(startAngle);
        const y2 = r2 * Math.sin(startAngle);
        tick.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
        if (color) {
            tick.style.setProperty('--rt-drag-color', color);
        } else {
            tick.style.removeProperty('--rt-drag-color');
        }
    }

    private updateDropArc(startAngle: number, endAngle: number, radius: number, color?: string): void {
        const arc = this.ensureDropArc();

        const norm = (a: number) => {
            while (a < 0) a += Math.PI * 2;
            while (a >= Math.PI * 2) a -= Math.PI * 2;
            return a;
        };
        const a0 = norm(startAngle);
        const a1 = norm(endAngle);
        // travel shortest path
        let delta = a1 - a0;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        const aEnd = a0 + delta;
        const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
        const sweep = delta >= 0 ? 1 : 0;
        const x0 = radius * Math.cos(a0);
        const y0 = radius * Math.sin(a0);
        const x1p = radius * Math.cos(aEnd);
        const y1p = radius * Math.sin(aEnd);
        arc.setAttribute('d', `M ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x1p} ${y1p}`);
        if (color) {
            arc.style.setProperty('--rt-drag-color', color);
        } else {
            arc.style.removeProperty('--rt-drag-color');
        }
    }

    private resetState(): void {
        this.dragging = false;
        this.sourceSceneId = null;
        this.sourceGroup = null;
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        this.svg.classList.remove('rt-dragging-outer');
        this.clearHighlight();
        this.log('resetState');
    }

    private beginDrag(): void {
        if (this.dragging || !this.sourceGroup) return;
        this.dragging = true;
        this.svg.classList.add('rt-dragging-outer');
        this.setHighlight(this.sourceGroup);
        this.log('beginDrag', { sceneId: this.sourceSceneId });
    }

    private async finishDrag(): Promise<void> {
        if (this.confirming) {
            this.resetState();
            return;
        }

        const targetId = this.currentTarget ? this.getSceneIdFromNumberGroup(this.currentTarget) : null;
        if (!this.sourceSceneId || !targetId || this.sourceSceneId === targetId) {
            this.resetState();
            return;
        }

        const order = this.buildOuterRingOrder();
        const fromIdx = order.findIndex(o => o.sceneId === this.sourceSceneId);
        const toIdx = order.findIndex(o => o.sceneId === targetId);
        if (fromIdx === -1 || toIdx === -1) {
            this.resetState();
            return;
        }

        const reordered = [...order];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);

        const updates: SceneUpdate[] = [];
        reordered.forEach((entry, idx) => {
            const { suffix } = this.splitNumberParts(entry.numberText);
            const nextNumber = `${idx + 1}${suffix}`;
            if (nextNumber !== entry.numberText) {
                updates.push({ path: entry.path, newNumber: nextNumber });
            }
        });

        const targetPathEl = this.svg.querySelector<SVGPathElement>(`#${this.cssEscape(targetId)}`);
        const targetGroup = targetPathEl?.closest('.rt-scene-group');
        const targetActIdx = targetGroup ? Number(targetGroup.getAttribute('data-act') ?? 0) : 0;
        const targetActNumber = Number.isFinite(targetActIdx) ? (targetActIdx + 1) : undefined;
        const sourcePath = moved.path;

        const sourceOriginalNumber = order[fromIdx]?.numberText ?? '';
        const targetOriginalNumber = order[toIdx]?.numberText ?? '';
        const summaryLines = [
            `Move scene ${sourceOriginalNumber} before scene ${targetOriginalNumber}.`,
            `Will renumber ${updates.length} scene(s).`,
        ];
        if (targetActNumber !== undefined) {
            summaryLines.push(`Update moved scene Act → ${targetActNumber}.`);
        }

        this.confirming = true;
        let confirmed = false;
        try {
            const modal = new DragConfirmModal(this.view.plugin.app, summaryLines, this.originColor);
            confirmed = await new Promise<boolean>((resolve) => {
                const onClose = () => resolve(modal.getResult());
                modal.onClose = onClose;
                modal.open();
            });
        } finally {
            this.confirming = false;
        }

        if (!confirmed) {
            this.resetState();
            return;
        }

        if (targetActNumber !== undefined) {
            updates.forEach(u => {
                if (u.path === sourcePath) {
                    u.actNumber = targetActNumber;
                }
            });
        }

        if (updates.length === 0) {
            this.resetState();
            return;
        }
        this.log('apply updates', { count: updates.length, from: fromIdx, to: toIdx });
        await applySceneNumberUpdates(this.view.plugin.app, updates);
        new Notice(`Moved scene ${sourceOriginalNumber} → before ${targetOriginalNumber}`, 2000);
        this.options.onRefresh();
        this.resetState();
    }

    private onPointerMove(evt: PointerEvent): void {
        if (!this.sourceGroup || !this.sourceSceneId) return;
        if (!this.dragging) {
            const dx = evt.clientX - this.startX;
            const dy = evt.clientY - this.startY;
            if (Math.sqrt(dx * dx + dy * dy) >= this.MOVE_THRESHOLD_PX) {
                if (this.holdTimer !== null) {
                    window.clearTimeout(this.holdTimer);
                    this.holdTimer = null;
                }
                this.beginDrag();
            }
        }
        if (this.dragging) {
            const group = this.findOuterGroup(evt);
            this.setHighlight(group);
            this.log('drag move', { target: this.getSceneIdFromNumberGroup(group) });
        }
    }

    private async onPointerUp(): Promise<void> {
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        if (this.dragging) {
            await this.finishDrag();
        } else {
            this.resetState();
        }
    }

    private startDrag(evt: PointerEvent, group: SVGGElement): void {
        if (evt.button !== 0) return;
        const sceneId = this.getSceneIdFromNumberGroup(group);
        if (!sceneId) return;
        evt.preventDefault();
        this.sourceSceneId = sceneId;
        this.sourceGroup = group;
        this.startX = evt.clientX;
        this.startY = evt.clientY;
        this.originColor = this.resolveSubplotColorFromGroup(group);
        this.captureOriginGeometry(sceneId);
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
        }
        this.holdTimer = window.setTimeout(() => {
            this.holdTimer = null;
            this.beginDrag();
        }, this.HOLD_MS);
        this.log('pointerdown', { sceneId });
    }

    private captureOriginGeometry(sceneId: string): void {
        const pathEl = this.svg.querySelector<SVGPathElement>(`#${this.cssEscape(sceneId)}`);
        const sceneGroup = pathEl?.closest<SVGGElement>('.rt-scene-group');
        if (!sceneGroup) {
            this.originStartAngle = undefined;
            this.originOuterR = undefined;
            return;
        }
        const startAngle = Number(sceneGroup.getAttribute('data-start-angle') ?? '');
        const outerR = Number(sceneGroup.getAttribute('data-outer-r') ?? '');
        this.originStartAngle = Number.isFinite(startAngle) ? startAngle : undefined;
        this.originOuterR = Number.isFinite(outerR) ? outerR : undefined;
    }

    private resolveSubplotColorFromGroup(group: SVGGElement): string | undefined {
        const subplotIdxAttr = group.getAttribute('data-subplot-index');
        if (!subplotIdxAttr) return undefined;
        const idx = Number(subplotIdxAttr);
        if (!Number.isFinite(idx)) return undefined;

        // Use CSS variable lookup compatible with TimelineRenderer.ts
        const normalized = idx % 16;
        const varName = `--rt-subplot-colors-${normalized}`;

        // Attempt to get from computed style
        if (typeof document !== 'undefined') {
            const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            if (computed) return computed;
        }

        // Fallback to settings if CSS var fails (legacy/backup)
        const colors = (this.view.plugin.settings as any)?.subplotColors as string[] | undefined;
        if (colors && colors[idx]) return colors[idx];

        return undefined;
    }
}
