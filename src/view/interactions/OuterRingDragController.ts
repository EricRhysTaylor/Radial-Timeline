import { Notice, App } from 'obsidian';
import { applySceneNumberUpdates, type SceneUpdate } from '../../services/SceneReorderService';
import { DragConfirmModal } from '../../modals/DragConfirmModal';
import { DRAG_DROP_ARC_RADIUS, DRAG_DROP_TICK_OUTER_RADIUS, DRAG_DROP_TICK_LENGTH } from '../../renderer/layout/LayoutConstants';

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

/**
 * Drag controller for reordering scenes and beats on the outer ring in narrative mode.
 *
 * Drag operates entirely on .rt-scene-group SVG elements (both Scene and Beat item types).
 * Number squares are not involved in drag — they have no hover/drag functionality.
 * Order is built by reading scene groups from the outer ring, sorted by data-start-angle
 * (manuscript order). Number text for renumbering is extracted from the file path basename.
 */
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
    private sourceSceneGroup: SVGGElement | null = null;  // The .rt-scene-group being dragged
    private sourceItemType: 'Scene' | 'Beat' = 'Scene';  // Track whether dragged item is Scene or Beat
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
    private dragIndicator: SVGGElement | null = null; // Tangent-aligned reorder indicator

    constructor(view: OuterRingViewAdapter, svg: SVGSVGElement, options: OuterRingDragOptions) {
        this.view = view;
        this.svg = svg;
        this.options = options;
    }

    attach(): void {
        if (this.options.mode !== 'narrative') return;
        
        // Register on scene AND beat groups in the outer ring
        const draggableGroups = Array.from(
            this.svg.querySelectorAll<SVGGElement>('.rt-scene-group[data-item-type="Scene"], .rt-scene-group[data-item-type="Beat"]')
        );
        if (!draggableGroups.length) return;

        // Create the tangent-aligned drag reorder indicator (move-horizontal arrows)
        this.createDragIndicator();

        this.view.registerDomEvent(window as unknown as HTMLElement, 'pointermove', (evt: PointerEvent) => this.onPointerMove(evt));
        this.view.registerDomEvent(window as unknown as HTMLElement, 'pointerup', (evt: PointerEvent) => this.onPointerUp(evt));
        
        draggableGroups.forEach(group => {
            // Listen on the scene/beat path for pointer events
            const scenePath = group.querySelector('.rt-scene-path');
            if (scenePath) {
                this.view.registerDomEvent(scenePath as unknown as HTMLElement, 'pointerdown', (evt: PointerEvent) => this.startDrag(evt, group));
            }
        });

        // Delegated hover for the drag indicator — show tangent arrows on scene/beat hover
        this.view.registerDomEvent(this.svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
            if (this.dragging) return;
            const group = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"], .rt-scene-group[data-item-type="Beat"]') as SVGGElement | null;
            if (group) this.showDragIndicator(group);
        });
        this.view.registerDomEvent(this.svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
            const toEl = e.relatedTarget as Element | null;
            const group = (e.target as Element).closest('.rt-scene-group') as SVGGElement | null;
            // Only hide if leaving the scene group entirely
            if (group && toEl && group.contains(toEl)) return;
            this.hideDragIndicator();
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

    /** Extract the scene/beat path element ID from an .rt-scene-group */
    private getSceneIdFromSceneGroup(group: Element | null): string | null {
        if (!group) return null;
        const pathEl = group.querySelector<SVGPathElement>('.rt-scene-path');
        return pathEl?.id || null;
    }

    /**
     * Build the combined order of scenes and beats on the outer ring.
     * Reads directly from .rt-scene-group elements sorted by data-start-angle (manuscript order).
     * Number text is extracted from the file path basename prefix (e.g., "03 Scene Title.md" → "03").
     */
    private buildOuterRingOrder(): Array<{ sceneId: string; path: string; numberText: string; subplot: string; ring: number; itemType: 'Scene' | 'Beat' }> {
        const masterSubplotOrder = (this.view.plugin.settings as any).masterSubplotOrder as string[] || ['Main Plot'];
        
        // Find the outer ring index (highest ring number used by scene groups)
        const allRings = Array.from(this.svg.querySelectorAll<SVGGElement>('.rt-scene-group'))
            .map(g => Number(g.getAttribute('data-ring') ?? -1))
            .filter(r => r >= 0);
        const outerRing = allRings.length > 0 ? Math.max(...allRings) : 0;
        
        // Get all scene AND beat groups on the outer ring, sorted by start angle (manuscript order)
        const outerGroups = Array.from(
            this.svg.querySelectorAll<SVGGElement>('.rt-scene-group')
        ).filter(g => {
            const ring = Number(g.getAttribute('data-ring') ?? -1);
            const itemType = g.getAttribute('data-item-type');
            return ring === outerRing && (itemType === 'Scene' || itemType === 'Beat');
        }).sort((a, b) => {
            const aAngle = Number(a.getAttribute('data-start-angle') ?? 0);
            const bAngle = Number(b.getAttribute('data-start-angle') ?? 0);
            return aAngle - bAngle;
        });
        
        return outerGroups.map((group) => {
            const sceneId = this.getSceneIdFromSceneGroup(group) || '';
            const encodedPath = group.getAttribute('data-path') || '';
            const path = encodedPath ? decodeURIComponent(encodedPath) : '';
            const itemType = (group.getAttribute('data-item-type') as 'Scene' | 'Beat') || 'Scene';
            
            // Extract prefix number from file path basename (e.g., "01 Opening Image.md" → "01")
            let numberText = '';
            if (path) {
                const basename = path.split('/').pop()?.replace(/\.md$/i, '') || '';
                const prefixMatch = basename.match(/^(\d+(?:\.\d+)?)\s/);
                numberText = prefixMatch ? prefixMatch[1] : '';
            }
            
            const subplotIdx = Number(group.getAttribute('data-subplot-index') ?? 0);
            const subplot = masterSubplotOrder[subplotIdx] || 'Main Plot';
            const ring = Number(group.getAttribute('data-ring') ?? 0);
            return { sceneId, path, numberText, subplot, ring, itemType };
        }).filter(entry => entry.sceneId && entry.path);
    }

    private clearHighlight(): void {
        // Clear scene/beat group highlight
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
            this.dropTick.removeAttribute('stroke');
            this.dropTick.classList.add('rt-hidden');
        }
        if (this.dropArc) {
            this.dropArc.setAttribute('d', '');
            this.dropArc.removeAttribute('stroke');
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
            // target.group is always an .rt-scene-group element (Scene or Beat)
            target.group.classList.add('rt-drop-target');
            if (this.originColor) {
                target.group.style.setProperty('--rt-drag-stroke-color', this.originColor);
            }
            
            const startAngle = Number(target.group.getAttribute('data-start-angle') ?? '');
            const outerR = Number(target.group.getAttribute('data-outer-r') ?? '');
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
        
        // Check for scene or beat groups (any ring, not just outer)
        const sceneGroup = fromPoint.closest('.rt-scene-group[data-item-type="Scene"], .rt-scene-group[data-item-type="Beat"]') as SVGGElement | null;
        if (sceneGroup) {
            const sceneId = this.getSceneIdFromSceneGroup(sceneGroup);
            const act = Number(sceneGroup.getAttribute('data-act') ?? '0');
            const ring = Number(sceneGroup.getAttribute('data-ring') ?? '0');
            if (sceneId) {
                return { type: 'scene', group: sceneGroup, sceneId, act, ring };
            }
        }
        
        return null;
    }

    private ensureDropTick(): SVGPathElement {
        if (this.dropTick && this.dropTick.isConnected) return this.dropTick;
        const existing = this.svg.querySelector<SVGPathElement>('.rt-drop-target-tick');
        if (existing) {
            // Reset existing element to hidden state
            existing.classList.add('rt-hidden');
            existing.setAttribute('d', '');
            existing.removeAttribute('stroke');
            this.dropTick = existing;
            return existing;
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('rt-drop-target-tick', 'rt-hidden');
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
            // Reset existing element to hidden state
            existing.classList.add('rt-hidden');
            existing.setAttribute('d', '');
            existing.removeAttribute('stroke');
            this.dropArc = existing;
            return existing;
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('rt-drop-target-arc', 'rt-hidden');
        path.setAttribute('d', '');
        const overlays = this.svg.querySelector<SVGGElement>('#rt-overlays');
        if (overlays) overlays.appendChild(path); else this.svg.appendChild(path);
        this.dropArc = path;
        return path;
    }

    private updateDropTick(startAngle: number, outerR: number, color?: string): void {
        const r2 = DRAG_DROP_TICK_OUTER_RADIUS;
        const r1 = r2 - DRAG_DROP_TICK_LENGTH;
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
        this.sourceItemType = 'Scene';
        if (this.sourceSceneGroup) {
            this.sourceSceneGroup.classList.remove('rt-drag-source');
        }
        this.sourceSceneGroup = null;
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
        this.hideDragIndicator(); // Hide tangent arrows during drag
        this.log('beginDrag', { sceneId: this.sourceSceneId, itemType: this.sourceItemType });
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
        const sourceType = moved.itemType;

        // Determine source act for comparison (only show Act row if it changes)
        const sourceActIdx = this.sourceSceneGroup ? Number(this.sourceSceneGroup.getAttribute('data-act') ?? 0) : 0;
        const sourceActNumber = sourceActIdx + 1;
        const actChanged = targetActNumber !== undefined && targetActNumber !== sourceActNumber;

        // Determine target item type
        const targetItemType = targetGroup?.getAttribute('data-item-type') as 'Scene' | 'Beat' | null;

        // Determine target subplot from target scene's subplot-index
        const masterSubplotOrder = (this.view.plugin.settings as any).masterSubplotOrder as string[] || ['Main Plot'];
        const targetSubplotIdx = Number(targetGroup?.getAttribute('data-subplot-index') ?? 0);
        const targetSubplot = masterSubplotOrder[targetSubplotIdx] || 'Main Plot';
        
        // Get source subplot for comparison
        const sourceSubplot = order[fromIdx]?.subplot ?? 'Main Plot';
        const subplotChanged = sourceSubplot !== targetSubplot;

        const sourceOriginalNumber = order[fromIdx]?.numberText ?? '';
        const targetOriginalNumber = order[toIdx]?.numberText ?? '';
        const sourceLabel = sourceType === 'Beat' ? 'beat' : 'scene';
        const targetLabel = (targetItemType === 'Beat') ? 'beat' : 'scene';
        const summaryLines = [
            `Move ${sourceLabel} ${sourceOriginalNumber} before ${targetLabel} ${targetOriginalNumber}.`,
            `Will renumber ${updates.length} item(s).`,
        ];
        if (actChanged) {
            summaryLines.push(`Update moved ${sourceLabel} Act → ${targetActNumber}.`);
        }
        if (subplotChanged && sourceType === 'Scene') {
            summaryLines.push(`Update moved scene Subplot → ${targetSubplot}.`);
        }

        this.confirming = true;
        let confirmed = false;
        try {
            const modal = new DragConfirmModal(this.view.plugin.app, summaryLines, this.originColor, sourceLabel);
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

        // Apply act and subplot updates to the moved item (only if they changed)
        updates.forEach(u => {
            if (u.path === sourcePath) {
                if (actChanged) {
                    u.actNumber = targetActNumber;
                }
                if (subplotChanged && sourceType === 'Scene') {
                    u.subplots = [targetSubplot];
                }
            }
        });

        // If the moved item didn't need renumbering, we still need to update its act/subplot
        const needsActOrSubplot = actChanged || (subplotChanged && sourceType === 'Scene');
        if (!updates.find(u => u.path === sourcePath) && needsActOrSubplot) {
            updates.push({
                path: sourcePath,
                newNumber: sourceOriginalNumber,
                actNumber: actChanged ? targetActNumber : undefined,
                subplots: (subplotChanged && sourceType === 'Scene') ? [targetSubplot] : undefined
            });
        }

        if (updates.length === 0) {
            this.resetState();
            return;
        }
        this.log('apply updates', { count: updates.length, from: fromIdx, to: toIdx, itemType: sourceType, subplot: subplotChanged ? targetSubplot : undefined });
        await applySceneNumberUpdates(this.view.plugin.app, updates);
        new Notice(`Moved ${sourceLabel} ${sourceOriginalNumber} → before ${targetLabel} ${targetOriginalNumber}`, 2000);
        // Small delay to allow Obsidian's metadata cache to update before refresh
        await new Promise(resolve => window.setTimeout(resolve, 100));
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

        // Determine source act for comparison (only update/show Act if it changes)
        const sourceActIdx = this.sourceSceneGroup ? Number(this.sourceSceneGroup.getAttribute('data-act') ?? 0) : 0;
        const sourceActNumber = sourceActIdx + 1;
        const actChanged = targetActNumber !== sourceActNumber;

        const sourceOriginalNumber = order[fromIdx]?.numberText ?? '';
        const sourceType = this.sourceItemType;
        const sourceLabel = sourceType === 'Beat' ? 'beat' : 'scene';
        const targetSubplotName = this.getSubplotNameFromRing(target.ring);
        
        // Get current subplots for the item
        const currentSubplots = await this.getSceneSubplots(this.sourcePath);
        const hasMainPlot = currentSubplots.includes('Main Plot');
        
        // Determine new subplots based on the move
        // Beats are always on Main Plot, so only process subplot changes for scenes
        let newSubplots: string[] | undefined;
        let subplotChangeDesc = '';
        
        if (sourceType === 'Beat') {
            // Beats stay on Main Plot - no subplot changes
            subplotChangeDesc = 'Beat subplot unchanged (Main Plot).';
        } else {
            // Check if target subplot is already one of the scene's subplots
            const isMovingToExistingSubplot = currentSubplots.includes(targetSubplotName);
            
            if (isMovingToExistingSubplot) {
                subplotChangeDesc = `Scene already belongs to "${targetSubplotName}".`;
            } else if (target.isOuterRing) {
                subplotChangeDesc = 'Subplot unchanged (outer ring).';
            } else {
                if (hasMainPlot) {
                    newSubplots = ['Main Plot', targetSubplotName];
                    if (currentSubplots.length > 1) {
                        const otherSubplots = currentSubplots.filter(s => s !== 'Main Plot');
                        subplotChangeDesc = `Keep "Main Plot", change "${otherSubplots.join(', ')}" → "${targetSubplotName}".`;
                    } else {
                        subplotChangeDesc = `Add "${targetSubplotName}" to scene subplots.`;
                    }
                } else {
                    newSubplots = [targetSubplotName];
                    if (currentSubplots.length > 0) {
                        subplotChangeDesc = `Change subplot "${currentSubplots.join(', ')}" → "${targetSubplotName}".`;
                    } else {
                        subplotChangeDesc = `Set subplot to "${targetSubplotName}".`;
                    }
                }
            }
        }
        
        // Build update (only include actNumber if it changed)
        const updates: SceneUpdate[] = [{
            path: this.sourcePath,
            newNumber: sourceOriginalNumber,
            actNumber: actChanged ? targetActNumber : undefined,
            subplots: newSubplots
        }];

        // Build descriptive summary message
        const summaryLines: string[] = [];
        if (actChanged) {
            const locationDesc = target.isOuterRing 
                ? `Act ${targetActNumber}` 
                : `Act ${targetActNumber}, "${targetSubplotName}"`;
            summaryLines.push(`Move ${sourceLabel} ${sourceOriginalNumber} to ${locationDesc}.`);
        } else {
            summaryLines.push(`Move ${sourceLabel} ${sourceOriginalNumber} to "${targetSubplotName}".`);
        }
        summaryLines.push(subplotChangeDesc);

        this.confirming = true;
        let confirmed = false;
        try {
            const modal = new DragConfirmModal(this.view.plugin.app, summaryLines, this.originColor, sourceLabel);
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
            ? `Moved ${sourceLabel} ${sourceOriginalNumber} → Act ${targetActNumber}`
            : `Moved ${sourceLabel} ${sourceOriginalNumber} → Act ${targetActNumber}, "${targetSubplotName}"`;
        this.log('apply void cell drop', { targetAct: targetActNumber, ring: target.ring, subplot: targetSubplotName, path: this.sourcePath, itemType: sourceType });
        await applySceneNumberUpdates(this.view.plugin.app, updates);
        new Notice(noticeText, 2000);
        // Small delay to allow Obsidian's metadata cache to update before refresh
        await new Promise(resolve => window.setTimeout(resolve, 100));
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
        // Count total draggable items (scenes + beats)
        const draggableGroups = this.svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"], .rt-scene-group[data-item-type="Beat"]');
        const itemCount = draggableGroups.length;
        
        // Count void cells (empty slots to drop into)
        const voidCells = this.svg.querySelectorAll('.rt-void-cell[data-act]');
        const voidCount = voidCells.length;
        
        // If only 1 item and no void cells, can't drag anywhere
        if (itemCount <= 1 && voidCount === 0) {
            return false;
        }
        
        // If multiple items, can always reorder
        if (itemCount > 1) {
            return true;
        }
        
        // If 1 item but void cells exist, can move to empty location
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
        this.sourceItemType = (group.getAttribute('data-item-type') as 'Scene' | 'Beat') || 'Scene';
        this.sourcePath = filePath;
        this.startX = evt.clientX;
        this.startY = evt.clientY;
        this.startTime = Date.now();
        
        // Get subplot color from the scene group's data attributes
        this.originColor = this.resolveSubplotColorFromGroup(group);
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

    // ── Drag reorder indicator (tangent-aligned move-horizontal arrows) ──

    /** Lucide move-horizontal icon paths, centered on origin (offset by -12,-12 from 24×24 viewBox) */
    private static readonly INDICATOR_ICON = [
        'M 6 -4 L 10 0 L 6 4',   // right arrow (18-12=6, 8-12=-4, etc.)
        'M -10 0 L 10 0',         // horizontal line
        'M -6 -4 L -10 0 L -6 4', // left arrow
    ].join(' ');
    private static readonly INDICATOR_OFFSET = 16; // px above the outer ring edge

    /**
     * Create the drag reorder indicator SVG element in the overlays layer.
     * Uses the Lucide move-horizontal icon, centered on its origin so rotate() works naturally.
     */
    private createDragIndicator(): void {
        if (this.dragIndicator?.isConnected) return;
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        g.classList.add('rt-drag-reorder-indicator');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', OuterRingDragController.INDICATOR_ICON);
        g.appendChild(path);
        const overlays = this.svg.querySelector<SVGGElement>('#rt-overlays');
        if (overlays) overlays.appendChild(g); else this.svg.appendChild(g);
        this.dragIndicator = g;
    }

    /**
     * Position and show the drag indicator above the hovered scene/beat group.
     * The icon is placed at the center angle of the arc, a few px above the outer ring,
     * and rotated so its horizontal arrows are tangent to the ring.
     */
    private showDragIndicator(group: SVGGElement): void {
        if (!this.dragIndicator || this.dragging) return;
        const startAngle = Number(group.getAttribute('data-start-angle') ?? '');
        const endAngle = Number(group.getAttribute('data-end-angle') ?? '');
        const outerR = Number(group.getAttribute('data-outer-r') ?? '');
        if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle) || !Number.isFinite(outerR)) return;

        const centerAngle = (startAngle + endAngle) / 2;
        const r = outerR + OuterRingDragController.INDICATOR_OFFSET;
        const x = r * Math.cos(centerAngle);
        const y = r * Math.sin(centerAngle);
        // Rotate so horizontal arrows align with the ring tangent at this angle
        const rotDeg = (centerAngle * 180) / Math.PI + 90;

        this.dragIndicator.setAttribute('transform', `translate(${x}, ${y}) rotate(${rotDeg})`);
        this.dragIndicator.classList.add('rt-visible');
    }

    /** Hide the drag indicator */
    private hideDragIndicator(): void {
        if (this.dragIndicator) {
            this.dragIndicator.classList.remove('rt-visible');
        }
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
