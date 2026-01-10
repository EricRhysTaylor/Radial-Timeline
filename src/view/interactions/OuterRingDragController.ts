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

/** 
 * Result type for drop target detection
 * Can be either a scene group or a void cell (empty act/subplot ring)
 */
type DropTarget = 
    | { type: 'scene'; group: SVGGElement; sceneId: string; act: number; ring: number }
    | { type: 'void'; element: SVGPathElement; act: number; ring: number; startAngle: number; endAngle: number; isOuterRing: boolean };

/**
 * Flag to coordinate with click handlers - prevents file open during/after drag
 */
let dragInProgress = false;
let lastInteractionTime = 0;

export function isDragInProgress(): boolean {
    return dragInProgress;
}

/**
 * Check if the drag controller recently handled an interaction.
 * This prevents the click handler from double-opening files.
 */
export function wasRecentlyHandledByDrag(): boolean {
    return Date.now() - lastInteractionTime < 100;
}

export class OuterRingDragController {
    private readonly svg: SVGSVGElement;
    private readonly view: OuterRingViewAdapter;
    private readonly options: OuterRingDragOptions;

    // Click vs drag discrimination timing
    private CLICK_THRESHOLD_MS = 500;  // If release within this time, treat as click
    private MOVE_THRESHOLD_PX = 7;     // Movement beyond this triggers drag mode

    private currentTarget: DropTarget | null = null;
    private dragging = false;
    private sourceSceneId: string | null = null;
    private sourceSceneGroup: SVGGElement | null = null;  // The .rt-scene-group
    private sourceNumberGroup: SVGGElement | null = null; // The .number-square-group for styling
    private holdTimer: number | null = null;
    private startX = 0;
    private startY = 0;
    private startTime = 0;
    private confirming = false;
    private dropTick: SVGPathElement | null = null;
    private originColor?: string;
    private originStartAngle?: number;
    private originOuterR?: number;
    private dropArc: SVGPathElement | null = null;
    private sourcePath: string | null = null;

    constructor(view: OuterRingViewAdapter, svg: SVGSVGElement, options: OuterRingDragOptions) {
        this.view = view;
        this.svg = svg;
        this.options = options;
    }

    attach(): void {
        if (this.options.mode !== 'narrative') return;
        
        // Register on scene groups in the outer ring instead of number squares
        const sceneGroups = Array.from(
            this.svg.querySelectorAll<SVGGElement>('.rt-scene-group[data-item-type="Scene"]')
        );
        if (!sceneGroups.length) return;

        this.view.registerDomEvent(window as unknown as HTMLElement, 'pointermove', (evt: PointerEvent) => this.onPointerMove(evt));
        this.view.registerDomEvent(window as unknown as HTMLElement, 'pointerup', (evt: PointerEvent) => this.onPointerUp(evt));
        
        sceneGroups.forEach(group => {
            // Listen on the scene path for pointer events
            const scenePath = group.querySelector('.rt-scene-path');
            if (scenePath) {
                this.view.registerDomEvent(scenePath as unknown as HTMLElement, 'pointerdown', (evt: PointerEvent) => this.startDrag(evt, group));
            }
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

    private getSceneIdFromSceneGroup(group: Element | null): string | null {
        if (!group) return null;
        const pathEl = group.querySelector<SVGPathElement>('.rt-scene-path');
        return pathEl?.id || null;
    }

    private getSceneIdFromNumberGroup(group: Element | null): string | null {
        if (!group) return null;
        const rect = group.querySelector<SVGRectElement>('.rt-number-square[data-scene-id]');
        return rect?.dataset.sceneId || null;
    }

    private getNumberGroupForSceneId(sceneId: string): SVGGElement | null {
        const rect = this.svg.querySelector<SVGRectElement>(`.rt-number-square[data-scene-id="${this.cssEscape(sceneId)}"]`);
        return rect?.closest('.number-square-group') as SVGGElement | null;
    }

    private buildOuterRingOrder(): Array<{ sceneId: string; path: string; numberText: string; subplot: string; ring: number }> {
        const masterSubplotOrder = (this.view.plugin.settings as any).masterSubplotOrder as string[] || ['Main Plot'];
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
            // Get subplot from scene group's subplot-index attribute
            const subplotIdx = Number(sceneGroup?.getAttribute('data-subplot-index') ?? 0);
            const subplot = masterSubplotOrder[subplotIdx] || 'Main Plot';
            const ring = Number(sceneGroup?.getAttribute('data-ring') ?? 0);
            return { sceneId, path, numberText, subplot, ring };
        }).filter(entry => entry.sceneId && entry.path);
    }

    private clearHighlight(): void {
        // Clear scene/number group highlight
        if (this.currentTarget?.type === 'scene') {
            this.currentTarget.group.classList.remove('rt-drop-target');
            this.currentTarget.group.style.removeProperty('--rt-drag-stroke-color');
        }
        // Clear void cell highlight
        if (this.currentTarget?.type === 'void') {
            this.currentTarget.element.classList.remove('rt-drop-target');
            this.currentTarget.element.style.removeProperty('--rt-drag-stroke-color');
        }
        this.currentTarget = null;
        
        // Hide tick and arc completely when not in use
        if (this.dropTick) {
            this.dropTick.setAttribute('d', '');
            this.dropTick.classList.add('rt-hidden');
        }
        if (this.dropArc) {
            this.dropArc.setAttribute('d', '');
            this.dropArc.classList.add('rt-hidden');
        }
    }

    private setHighlight(target: DropTarget | null): void {
        if (!target) {
            this.clearHighlight();
            return;
        }
        
        // Check if same target
        if (this.currentTarget) {
            if (target.type === 'scene' && this.currentTarget.type === 'scene' && 
                target.group === this.currentTarget.group) return;
            if (target.type === 'void' && this.currentTarget.type === 'void' &&
                target.element === this.currentTarget.element) return;
        }
        
        this.clearHighlight();
        this.currentTarget = target;
        
        if (target.type === 'scene') {
            target.group.classList.add('rt-drop-target');
            if (this.originColor) {
                target.group.style.setProperty('--rt-drag-stroke-color', this.originColor);
            }
            
            const sceneId = this.getSceneIdFromNumberGroup(target.group);
            if (!sceneId) return;
            const pathEl = this.svg.querySelector<SVGPathElement>(`#${this.cssEscape(sceneId)}`);
            const sceneGroup = pathEl?.closest<SVGGElement>('.rt-scene-group');
            if (!sceneGroup) return;
            const startAngle = Number(sceneGroup.getAttribute('data-start-angle') ?? '');
            const outerR = Number(sceneGroup.getAttribute('data-outer-r') ?? '');
            if (!Number.isFinite(startAngle) || !Number.isFinite(outerR)) return;
            this.updateDropTick(startAngle, outerR, this.originColor);
            if (this.originStartAngle !== undefined && this.originOuterR !== undefined) {
                this.updateDropArc(this.originStartAngle, startAngle, this.originColor);
            }
        } else if (target.type === 'void') {
            target.element.classList.add('rt-drop-target');
            if (this.originColor) {
                target.element.style.setProperty('--rt-drag-stroke-color', this.originColor);
            }
            // For void cell, show tick at the start of the void area
            const outerR = Number(target.element.getAttribute('data-outer-r') ?? '');
            if (Number.isFinite(target.startAngle) && Number.isFinite(outerR)) {
                this.updateDropTick(target.startAngle, outerR, this.originColor);
                if (this.originStartAngle !== undefined) {
                    this.updateDropArc(this.originStartAngle, target.startAngle, this.originColor);
                }
            }
        }
    }

    private findDropTarget(evt: PointerEvent): DropTarget | null {
        const fromPoint = document.elementFromPoint(evt.clientX, evt.clientY);
        if (!fromPoint) return null;
        
        // First check for void cells (empty act areas or empty subplot rings)
        // Look for ANY void cell with data-act attribute (all rings)
        const voidCell = fromPoint.closest('.rt-void-cell[data-act]') as SVGPathElement | null;
        if (voidCell) {
            const act = Number(voidCell.getAttribute('data-act') ?? '');
            const ring = Number(voidCell.getAttribute('data-ring') ?? '');
            const startAngle = Number(voidCell.getAttribute('data-start-angle') ?? '');
            const endAngle = Number(voidCell.getAttribute('data-end-angle') ?? '');
            const isOuterRing = voidCell.getAttribute('data-outer-ring') === 'true';
            if (Number.isFinite(act) && Number.isFinite(ring)) {
                return { 
                    type: 'void', 
                    element: voidCell, 
                    act,
                    ring,
                    startAngle,
                    endAngle,
                    isOuterRing
                };
            }
        }
        
        // Check for scene groups (any ring, not just outer)
        const sceneGroup = fromPoint.closest('.rt-scene-group[data-item-type="Scene"]') as SVGGElement | null;
        if (sceneGroup) {
            const sceneId = this.getSceneIdFromSceneGroup(sceneGroup);
            const act = Number(sceneGroup.getAttribute('data-act') ?? '0');
            const ring = Number(sceneGroup.getAttribute('data-ring') ?? '0');
            if (sceneId) {
                const numberGroup = this.getNumberGroupForSceneId(sceneId);
                if (numberGroup) {
                    return { type: 'scene', group: numberGroup, sceneId, act, ring };
                }
            }
        }
        
        return null;
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
        const tickLen = 18;
        const r2 = DRAG_DROP_TICK_OUTER_RADIUS;
        const r1 = r2 - tickLen;
        const x1 = r1 * Math.cos(startAngle);
        const y1 = r1 * Math.sin(startAngle);
        const x2 = r2 * Math.cos(startAngle);
        const y2 = r2 * Math.sin(startAngle);
        const tick = this.ensureDropTick();
        tick.classList.remove('rt-hidden');
        tick.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
        if (color) {
            tick.setAttribute('stroke', color);
        } else {
            tick.removeAttribute('stroke');
        }
    }

    private updateDropArc(startAngle: number, endAngle: number, color?: string): void {
        const arc = this.ensureDropArc();
        arc.classList.remove('rt-hidden');
        const rArc = DRAG_DROP_ARC_RADIUS;

        const norm = (a: number) => {
            while (a < -Math.PI) a += Math.PI * 2;
            while (a > Math.PI) a -= Math.PI * 2;
            return a;
        };
        const a0 = startAngle;
        const a1 = endAngle;
        const delta = norm(a1 - a0);
        const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
        const sweep = delta >= 0 ? 1 : 0;
        const x0 = rArc * Math.cos(a0);
        const y0 = rArc * Math.sin(a0);
        const x1p = rArc * Math.cos(a1);
        const y1p = rArc * Math.sin(a1);
        arc.setAttribute('d', `M ${x0} ${y0} A ${rArc} ${rArc} 0 ${largeArc} ${sweep} ${x1p} ${y1p}`);
        if (color) {
            arc.setAttribute('stroke', color);
        } else {
            arc.removeAttribute('stroke');
        }
    }

    private resetState(): void {
        // Only mark interaction time if a drag was actually in progress
        // Quick clicks should NOT block the click handler
        if (this.dragging) {
            lastInteractionTime = Date.now();
        }
        this.dragging = false;
        dragInProgress = false;
        this.sourceSceneId = null;
        this.sourcePath = null;
        if (this.sourceSceneGroup) {
            this.sourceSceneGroup.classList.remove('rt-drag-source');
        }
        if (this.sourceNumberGroup) {
            this.sourceNumberGroup.classList.remove('rt-drag-source');
        }
        this.sourceSceneGroup = null;
        this.sourceNumberGroup = null;
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        this.svg.classList.remove('rt-dragging-outer');
        this.clearHighlight();
        this.log('resetState');
    }

    private beginDrag(): void {
        if (this.dragging || !this.sourceSceneGroup) return;
        this.dragging = true;
        dragInProgress = true;
        lastInteractionTime = Date.now(); // Mark start so click handler knows to skip
        this.svg.classList.add('rt-dragging-outer');
        this.sourceSceneGroup.classList.add('rt-drag-source');
        if (this.sourceNumberGroup) {
            this.sourceNumberGroup.classList.add('rt-drag-source');
        }
        this.log('beginDrag', { sceneId: this.sourceSceneId });
    }

    private async finishDrag(): Promise<void> {
        if (this.confirming) {
            this.resetState();
            return;
        }

        // Handle drop on void cell (empty act)
        if (this.currentTarget?.type === 'void') {
            await this.finishDropOnVoidCell(this.currentTarget);
            return;
        }

        // Handle drop on another scene
        if (this.currentTarget?.type === 'scene') {
            await this.finishDropOnScene(this.currentTarget);
            return;
        }

        // No valid target
        this.resetState();
    }

    private async finishDropOnScene(target: { type: 'scene'; group: SVGGElement; sceneId: string; act: number; ring: number }): Promise<void> {
        const targetId = target.sceneId;
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

        // Determine target subplot from target scene's subplot-index
        const masterSubplotOrder = (this.view.plugin.settings as any).masterSubplotOrder as string[] || ['Main Plot'];
        const targetSubplotIdx = Number(targetGroup?.getAttribute('data-subplot-index') ?? 0);
        const targetSubplot = masterSubplotOrder[targetSubplotIdx] || 'Main Plot';
        
        // Get source subplot for comparison
        const sourceSubplot = order[fromIdx]?.subplot ?? 'Main Plot';
        const subplotChanged = sourceSubplot !== targetSubplot;

        const sourceOriginalNumber = order[fromIdx]?.numberText ?? '';
        const targetOriginalNumber = order[toIdx]?.numberText ?? '';
        const summaryLines = [
            `Move scene ${sourceOriginalNumber} before scene ${targetOriginalNumber}.`,
            `Will renumber ${updates.length} scene(s).`,
        ];
        if (targetActNumber !== undefined) {
            summaryLines.push(`Update moved scene Act → ${targetActNumber}.`);
        }
        if (subplotChanged) {
            summaryLines.push(`Update moved scene Subplot → ${targetSubplot}.`);
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

        // Apply act and subplot updates to the moved scene
        updates.forEach(u => {
            if (u.path === sourcePath) {
                if (targetActNumber !== undefined) {
                    u.actNumber = targetActNumber;
                }
                if (subplotChanged) {
                    u.subplots = [targetSubplot];
                }
            }
        });

        // If the moved scene didn't need renumbering, we still need to update its act/subplot
        if (!updates.find(u => u.path === sourcePath) && (targetActNumber !== undefined || subplotChanged)) {
            updates.push({
                path: sourcePath,
                newNumber: sourceOriginalNumber,
                actNumber: targetActNumber,
                subplots: subplotChanged ? [targetSubplot] : undefined
            });
        }

        if (updates.length === 0) {
            this.resetState();
            return;
        }
        this.log('apply updates', { count: updates.length, from: fromIdx, to: toIdx, subplot: subplotChanged ? targetSubplot : undefined });
        await applySceneNumberUpdates(this.view.plugin.app, updates);
        new Notice(`Moved scene ${sourceOriginalNumber} → before ${targetOriginalNumber}`, 2000);
        // Small delay to allow Obsidian's metadata cache to update before refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        this.options.onRefresh();
        this.resetState();
    }

    private async finishDropOnVoidCell(target: { type: 'void'; element: SVGPathElement; act: number; ring: number; startAngle: number; endAngle: number; isOuterRing: boolean }): Promise<void> {
        if (!this.sourceSceneId || !this.sourcePath) {
            this.resetState();
            return;
        }

        const targetActNumber = target.act + 1; // Convert 0-indexed to 1-indexed
        const order = this.buildOuterRingOrder();
        const fromIdx = order.findIndex(o => o.sceneId === this.sourceSceneId);
        if (fromIdx === -1) {
            this.resetState();
            return;
        }

        const sourceOriginalNumber = order[fromIdx]?.numberText ?? '';
        const targetSubplotName = this.getSubplotNameFromRing(target.ring);
        
        // Get current subplots for the scene
        const currentSubplots = await this.getSceneSubplots(this.sourcePath);
        const hasMainPlot = currentSubplots.includes('Main Plot');
        
        // Determine new subplots based on the move
        let newSubplots: string[] | undefined;
        let subplotChangeDesc = '';
        
        // Check if target subplot is already one of the scene's subplots
        const isMovingToExistingSubplot = currentSubplots.includes(targetSubplotName);
        
        if (isMovingToExistingSubplot) {
            // No subplot change needed - scene already belongs to this subplot
            subplotChangeDesc = `Scene already belongs to "${targetSubplotName}".`;
        } else if (target.isOuterRing) {
            // Dropping to outer ring (All Scenes) - no subplot change
            subplotChangeDesc = 'Subplot unchanged (outer ring).';
        } else {
            // Moving to a different subplot ring
            if (hasMainPlot) {
                // Keep Main Plot, replace other subplots with the new one
                newSubplots = ['Main Plot', targetSubplotName];
                if (currentSubplots.length > 1) {
                    const otherSubplots = currentSubplots.filter(s => s !== 'Main Plot');
                    subplotChangeDesc = `Keep "Main Plot", change "${otherSubplots.join(', ')}" → "${targetSubplotName}".`;
                } else {
                    subplotChangeDesc = `Add "${targetSubplotName}" to scene subplots.`;
                }
            } else {
                // No Main Plot - replace all subplots with the new one
                newSubplots = [targetSubplotName];
                if (currentSubplots.length > 0) {
                    subplotChangeDesc = `Change subplot "${currentSubplots.join(', ')}" → "${targetSubplotName}".`;
                } else {
                    subplotChangeDesc = `Set subplot to "${targetSubplotName}".`;
                }
            }
        }
        
        // Build update
        const updates: SceneUpdate[] = [{
            path: this.sourcePath,
            newNumber: sourceOriginalNumber,
            actNumber: targetActNumber,
            subplots: newSubplots
        }];

        // Build descriptive summary message
        const locationDesc = target.isOuterRing 
            ? `Act ${targetActNumber}` 
            : `Act ${targetActNumber}, "${targetSubplotName}"`;
        const summaryLines = [
            `Move scene ${sourceOriginalNumber} to ${locationDesc}.`,
            subplotChangeDesc,
        ];

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

        const noticeText = target.isOuterRing 
            ? `Moved scene ${sourceOriginalNumber} → Act ${targetActNumber}`
            : `Moved scene ${sourceOriginalNumber} → Act ${targetActNumber}, "${targetSubplotName}"`;
        this.log('apply void cell drop', { targetAct: targetActNumber, ring: target.ring, subplot: targetSubplotName, path: this.sourcePath });
        await applySceneNumberUpdates(this.view.plugin.app, updates);
        new Notice(noticeText, 2000);
        // Small delay to allow Obsidian's metadata cache to update before refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        this.options.onRefresh();
        this.resetState();
    }

    private onPointerMove(evt: PointerEvent): void {
        if (!this.sourceSceneGroup || !this.sourceSceneId) return;
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
            const target = this.findDropTarget(evt);
            this.setHighlight(target);
            this.log('drag move', { targetType: target?.type });
        }
    }

    private async onPointerUp(evt: PointerEvent): Promise<void> {
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        
        if (this.dragging) {
            // Drag was in progress - finish it and prevent click handler from firing
            await this.finishDrag();
        } else {
            // No drag happened - just reset, let the click event fire naturally
            // The click handler in AllScenesMode will handle file opening
            // Only mark interaction time if we were tracking (had a source)
            if (this.sourceSceneGroup) {
                // Check if user moved - if so, they started a drag but didn't complete it
                const dx = evt.clientX - this.startX;
                const dy = evt.clientY - this.startY;
                const moved = Math.sqrt(dx * dx + dy * dy) >= this.MOVE_THRESHOLD_PX;
                if (moved) {
                    // User moved but cancelled - mark as handled to prevent click
                    lastInteractionTime = Date.now();
                }
                // If no movement, let the click event fire naturally
            }
            this.resetState();
        }
    }

    /**
     * Check if dragging is possible - requires at least 2 possible locations
     * (either multiple scenes or multiple subplots/acts to drop into)
     */
    private canDrag(): boolean {
        // Count total scenes
        const sceneGroups = this.svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]');
        const sceneCount = sceneGroups.length;
        
        // Count void cells (empty slots to drop into)
        const voidCells = this.svg.querySelectorAll('.rt-void-cell[data-act]');
        const voidCount = voidCells.length;
        
        // If only 1 scene and no void cells, can't drag anywhere
        if (sceneCount <= 1 && voidCount === 0) {
            return false;
        }
        
        // If multiple scenes, can always reorder
        if (sceneCount > 1) {
            return true;
        }
        
        // If 1 scene but void cells exist, can move to empty location
        return voidCount > 0;
    }

    private startDrag(evt: PointerEvent, group: SVGGElement): void {
        if (evt.button !== 0) return;
        
        const sceneId = this.getSceneIdFromSceneGroup(group);
        if (!sceneId) return;
        
        // Get the file path
        const encodedPath = group.getAttribute('data-path');
        const filePath = encodedPath ? decodeURIComponent(encodedPath) : null;
        if (!filePath) return;
        
        // Check if dragging is possible
        if (!this.canDrag()) {
            // Let the click proceed normally - don't capture the event
            return;
        }
        
        // Don't call preventDefault/stopPropagation yet - let quick clicks work
        // We'll only block clicks if an actual drag begins
        
        this.sourceSceneId = sceneId;
        this.sourceSceneGroup = group;
        this.sourceNumberGroup = this.getNumberGroupForSceneId(sceneId);
        this.sourcePath = filePath;
        this.startX = evt.clientX;
        this.startY = evt.clientY;
        this.startTime = Date.now();
        
        // Get color from scene group or number group
        this.originColor = this.resolveSubplotColorFromGroup(group) || 
                          (this.sourceNumberGroup ? this.resolveSubplotColorFromGroup(this.sourceNumberGroup) : undefined);
        this.captureOriginGeometry(sceneId);
        
        if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
        }
        // Begin drag after hold threshold (if not moved)
        this.holdTimer = window.setTimeout(() => {
            this.holdTimer = null;
            this.beginDrag();
        }, this.CLICK_THRESHOLD_MS);
        
        this.log('pointerdown', { sceneId, path: filePath });
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
        const subplotIdxAttr = group.getAttribute('data-subplot-color-index') || group.getAttribute('data-subplot-index');
        if (!subplotIdxAttr) return undefined;
        const idx = Number(subplotIdxAttr);
        if (!Number.isFinite(idx)) return undefined;
        const colors = (this.view.plugin.settings as any)?.subplotColors as string[] | undefined;
        if (colors && colors[idx]) return colors[idx];
        return undefined;
    }

    /**
     * Get the master subplot order from SVG labels
     * Ring 0 (outermost) = first subplot in the array
     */
    private getMasterSubplotOrder(): string[] {
        const labels = this.svg.querySelectorAll('.rt-subplot-ring-label-text');
        return Array.from(labels)
            .map(label => label.getAttribute('data-subplot-name'))
            .filter((name): name is string => name !== null);
    }

    /**
     * Get subplot name from ring number
     * Ring offset 0 = outermost = first in masterSubplotOrder
     */
    private getSubplotNameFromRing(ring: number): string {
        const order = this.getMasterSubplotOrder();
        const numRings = order.length;
        // Ring is stored as the actual ring index, with higher numbers being inner rings
        // masterSubplotOrder[0] = outermost ring
        const ringOffset = numRings - 1 - ring;
        if (ringOffset >= 0 && ringOffset < order.length) {
            return order[ringOffset];
        }
        return `Ring ${ring}`;
    }

    /**
     * Get the current subplots for a scene from frontmatter
     */
    private async getSceneSubplots(filePath: string): Promise<string[]> {
        const file = this.view.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!file) return [];
        const cache = this.view.plugin.app.metadataCache.getFileCache(file as any);
        const fm = cache?.frontmatter;
        if (!fm) return [];
        
        const subplotValue = fm['Subplot'] || fm['subplot'];
        if (!subplotValue) return [];
        
        if (Array.isArray(subplotValue)) {
            return subplotValue.map(s => String(s).trim()).filter(s => s.length > 0);
        }
        return [String(subplotValue).trim()].filter(s => s.length > 0);
    }
}
