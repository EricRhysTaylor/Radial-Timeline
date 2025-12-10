import { Notice, App } from 'obsidian';
import { applySceneNumberUpdates, type SceneUpdate } from '../../services/SceneReorderService';
import { DragConfirmModal } from '../../modals/DragConfirmModal';

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
        if (this.options.enableDebug) {
            // eslint-disable-next-line no-console
            console.debug('[RT drag]', msg, data ?? {});
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
    }

    private setHighlight(group: SVGGElement | null): void {
        if (!group || group === this.currentTarget) return;
        this.clearHighlight();
        this.currentTarget = group;
        this.currentTarget.classList.add('rt-drop-target');
    }

    private findOuterGroup(evt: PointerEvent): SVGGElement | null {
        const direct = (evt.target as Element | null)?.closest('.number-square-group[data-outer-ring="true"]');
        if (direct) return direct as SVGGElement;
        const fromPoint = document.elementFromPoint(evt.clientX, evt.clientY);
        const fallback = fromPoint?.closest('.number-square-group[data-outer-ring="true"]');
        return fallback as SVGGElement | null;
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
            const modal = new DragConfirmModal(this.view.plugin.app, summaryLines);
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
        new Notice('Scenes reordered', 2000);
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
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
        }
        this.holdTimer = window.setTimeout(() => {
            this.holdTimer = null;
            this.beginDrag();
        }, this.HOLD_MS);
        this.log('pointerdown', { sceneId });
    }
}
