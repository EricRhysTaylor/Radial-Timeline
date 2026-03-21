import type { SceneInclusion } from '../../types/settings';
import { addTooltipData, balanceTooltipText } from '../../utils/tooltip';
import {
    CC_BOTTOM_MARGIN,
    CC_CELL_ICON_OFFSET,
    CC_HEADER_ICON_GAP,
    CC_HEADER_ICON_OFFSET,
    CC_HEADER_ICON_SIZE,
    CC_LABEL_HINT_SIZE,
    CC_PAGE_BASE_SIZE,
    CC_PAGE_MIN_SIZE,
    CC_RIGHT_MARGIN,
    VIEWBOX_MAX,
    VIEWBOX_MIN,
    VIEWBOX_SIZE
} from '../constants/inquiryLayout';
import { createSvgElement, createSvgGroup, createSvgText } from '../minimap/svgUtils';
import type {
    CorpusCcEntry,
    CorpusCcGroup,
    CorpusCcHeader,
    CorpusCcSlot
} from '../types/inquiryViewTypes';
import { ZONE_LAYOUT } from '../zoneLayout';
import { ZONE_SEGMENT_HALF_HEIGHT } from '../components/InquiryGlyph';

export type InquiryCorpusStripLayout = {
    pageWidth: number;
    pageHeight: number;
    gap: number;
};

export type InquiryCorpusStripRefs = {
    ccGroup?: SVGGElement;
    ccLabelGroup?: SVGGElement;
    ccLabelHit?: SVGRectElement;
    ccLabel?: SVGTextElement;
    ccLabelHint?: SVGGElement;
    ccLabelHintIcon?: SVGUseElement;
    ccEmptyText?: SVGTextElement;
    ccClassLabels: CorpusCcHeader[];
    ccSlots: CorpusCcSlot[];
};

export type InquiryCorpusStripRenderResult = InquiryCorpusStripRefs & {
    ccEntries: CorpusCcEntry[];
    ccLayout?: InquiryCorpusStripLayout;
};

type InquiryCorpusStripModeMeta = {
    isActive: boolean;
};

type InquiryCorpusStripPlacement = {
    entry: CorpusCcEntry;
    x: number;
    y: number;
};

type InquiryCorpusStripClassLayout = {
    group: CorpusCcGroup;
    centerX: number;
    width: number;
};

type InquiryCorpusStripComputedLayout = InquiryCorpusStripLayout & {
    titleY: number;
    docStartY: number;
    anchorRightX: number;
    placements: InquiryCorpusStripPlacement[];
    layoutEntries: CorpusCcEntry[];
    classLayouts: InquiryCorpusStripClassLayout[];
    rightBlockLeft: number;
    rightBlockRight: number;
    overlapSetup: boolean;
};

export function renderInquiryCorpusStrip(args: {
    rootSvg: SVGSVGElement;
    refs: InquiryCorpusStripRefs;
    entries: CorpusCcEntry[];
    classGroups: CorpusCcGroup[];
    createIconUse: (iconName: string, x: number, y: number, size: number) => SVGUseElement;
    registerSvgEvent: (el: Element | null | undefined, type: string, handler: (event: MouseEvent) => void) => void;
    getScopeLabel: () => string;
    getModeMeta: (mode: SceneInclusion) => InquiryCorpusStripModeMeta;
    getHeaderLabelVariants: (className: string, count: number, overrideLabel?: string) => string[];
    getHeaderTooltip: (
        className: string,
        mode: SceneInclusion,
        count: number,
        overrideLabel?: string
    ) => string;
    onGlobalToggle: () => void;
    onGroupToggle: (groupKey: string) => void;
    onItemToggle: (entryKey: string) => void;
    onItemShiftAction: (entryKey: string, filePath: string, event: MouseEvent) => void;
    onItemContextMenu: (entryKey: string, filePath: string, event: MouseEvent) => void;
    onItemHover: (entryKey: string) => void;
    onItemLeave: () => void;
    openEntryPath: (filePath: string) => void;
}): InquiryCorpusStripRenderResult {
    const refs = args.refs;

    if (!args.entries.length && args.classGroups.length === 0) {
        refs.ccGroup?.classList.add('ert-hidden');
        return {
            ...refs,
            ccEntries: []
        };
    }

    if (!refs.ccGroup) {
        refs.ccGroup = createSvgGroup(args.rootSvg, 'ert-inquiry-cc');
    } else {
        refs.ccGroup.classList.remove('ert-hidden');
    }

    let layout = buildCorpusStripLayout(args.classGroups, CC_PAGE_BASE_SIZE);
    while (layout.overlapSetup && layout.pageWidth > CC_PAGE_MIN_SIZE) {
        const nextSize = Math.max(CC_PAGE_MIN_SIZE, layout.pageWidth - 1);
        if (nextSize === layout.pageWidth) break;
        layout = buildCorpusStripLayout(args.classGroups, nextSize);
    }

    const showWarning = layout.overlapSetup && layout.pageWidth <= CC_PAGE_MIN_SIZE;
    const topLimit = getCorpusStripTopLimit();
    refs.ccGroup.setAttribute('transform', `translate(0 ${topLimit})`);

    if (!refs.ccLabelGroup) {
        refs.ccLabelGroup = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-label-group', 0, 0);
        refs.ccLabelHit = createSvgElement('rect');
        refs.ccLabelHit.classList.add('ert-inquiry-cc-label-hit');
        refs.ccLabelGroup.appendChild(refs.ccLabelHit);
        args.registerSvgEvent(refs.ccLabelGroup, 'click', () => {
            args.onGlobalToggle();
        });
    }

    if (!refs.ccLabel) {
        refs.ccLabel = createSvgText(refs.ccLabelGroup ?? refs.ccGroup, 'ert-inquiry-cc-label', 'Corpus', 0, 0);
        refs.ccLabel.setAttribute('text-anchor', 'middle');
        refs.ccLabel.setAttribute('dominant-baseline', 'middle');
        refs.ccLabel.classList.add('is-actionable');
    }

    if (!refs.ccLabelHint) {
        refs.ccLabelHint = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-hint', 0, 0);
        refs.ccLabelHintIcon = args.createIconUse(
            'arrow-big-up',
            -CC_LABEL_HINT_SIZE / 2,
            -CC_LABEL_HINT_SIZE / 2,
            CC_LABEL_HINT_SIZE
        );
        refs.ccLabelHintIcon.classList.add('ert-inquiry-cc-hint-icon');
        refs.ccLabelHint.appendChild(refs.ccLabelHintIcon);
        addTooltipData(
            refs.ccLabelHint,
            balanceTooltipText('Click to change inclusion. Shift-click a scene to toggle Target Scenes. Right-click for the scene menu.'),
            'top'
        );
    }

    refs.ccLabel.textContent = args.getScopeLabel();
    const labelX = Math.round((layout.rightBlockLeft + layout.rightBlockRight) / 2);
    const labelYOffset = -5;
    refs.ccLabelGroup?.setAttribute('transform', `translate(0 ${labelYOffset})`);
    refs.ccLabel.setAttribute('x', String(labelX));
    refs.ccLabel.setAttribute('y', '0');
    if (refs.ccLabelGroup) {
        addTooltipData(refs.ccLabelGroup, balanceTooltipText('Cycle all corpus scopes.'), 'top');
    }
    if (refs.ccLabelHint) {
        const labelWidth = refs.ccLabel.getComputedTextLength?.() ?? 0;
        const hintX = Math.round(labelX + (labelWidth / 2) + 5 + (CC_LABEL_HINT_SIZE / 2));
        refs.ccLabelHint.setAttribute('transform', `translate(${hintX} ${labelYOffset})`);
        if (refs.ccLabelHit) {
            const hitPaddingX = 6;
            const hitHeight = 20;
            const hitStartX = Math.round(labelX - (labelWidth / 2) - hitPaddingX);
            const hitWidth = Math.max(0, Math.round(labelWidth + (hitPaddingX * 2)));
            refs.ccLabelHit.setAttribute('x', String(hitStartX));
            refs.ccLabelHit.setAttribute('y', String(-Math.round(hitHeight / 2)));
            refs.ccLabelHit.setAttribute('width', String(hitWidth));
            refs.ccLabelHit.setAttribute('height', String(hitHeight));
        }
    }

    if (!refs.ccEmptyText) {
        refs.ccEmptyText = createSvgText(refs.ccGroup, 'ert-inquiry-cc-empty ert-hidden', 'No corpus data', 0, 0);
        refs.ccEmptyText.setAttribute('text-anchor', 'start');
        refs.ccEmptyText.setAttribute('dominant-baseline', 'middle');
    }
    refs.ccEmptyText.setAttribute('x', String(Math.round(layout.anchorRightX)));
    refs.ccEmptyText.setAttribute('y', String(Math.round(layout.docStartY + (layout.pageHeight / 2))));
    if (showWarning) {
        refs.ccEmptyText.textContent = 'Corpus too large';
        refs.ccEmptyText.classList.remove('ert-hidden');
    } else {
        refs.ccEmptyText.classList.add('ert-hidden');
    }

    const corner = Math.max(2, Math.round(layout.pageWidth * 0.125));
    while (refs.ccSlots.length < args.entries.length) {
        const group = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-cell');
        const base = createSvgElement('rect');
        base.classList.add('ert-inquiry-cc-cell-base');
        const fill = createSvgElement('rect');
        fill.classList.add('ert-inquiry-cc-cell-fill');
        const border = createSvgElement('rect');
        border.classList.add('ert-inquiry-cc-cell-border');
        const lowSubstanceX = createSvgGroup(group, 'ert-inquiry-cc-cell-low-substance-x');
        const lowSubstanceXPrimary = createSvgElement('line');
        lowSubstanceXPrimary.classList.add('ert-inquiry-cc-cell-low-substance-x-line');
        const lowSubstanceXSecondary = createSvgElement('line');
        lowSubstanceXSecondary.classList.add('ert-inquiry-cc-cell-low-substance-x-line');
        lowSubstanceX.appendChild(lowSubstanceXPrimary);
        lowSubstanceX.appendChild(lowSubstanceXSecondary);
        const icon = createSvgGroup(group, 'ert-inquiry-cc-cell-icon');
        const iconOuter = createSvgElement('circle');
        iconOuter.classList.add('ert-inquiry-cc-cell-icon-outer');
        const iconInner = createSvgElement('circle');
        iconInner.classList.add('ert-inquiry-cc-cell-icon-inner');
        icon.appendChild(iconOuter);
        icon.appendChild(iconInner);
        group.appendChild(base);
        group.appendChild(fill);
        group.appendChild(border);
        group.appendChild(icon);
        group.appendChild(lowSubstanceX);
        args.registerSvgEvent(group, 'click', (event: MouseEvent) => {
            const entryKey = group.getAttribute('data-entry-key');
            if (!entryKey) return;
            const filePath = group.getAttribute('data-file-path') || '';
            if (event.shiftKey) {
                args.onItemShiftAction(entryKey, filePath, event);
                return;
            }
            args.onItemToggle(entryKey);
        });
        args.registerSvgEvent(group, 'contextmenu', (event: MouseEvent) => {
            const entryKey = group.getAttribute('data-entry-key');
            if (!entryKey) return;
            const filePath = group.getAttribute('data-file-path') || '';
            args.onItemContextMenu(entryKey, filePath, event);
        });
        args.registerSvgEvent(group, 'pointerenter', () => {
            const entryKey = group.getAttribute('data-entry-key');
            if (!entryKey) return;
            args.onItemHover(entryKey);
        });
        args.registerSvgEvent(group, 'pointerleave', () => {
            args.onItemLeave();
        });
        refs.ccSlots.push({
            group,
            base,
            fill,
            border,
            lowSubstanceX,
            lowSubstanceXPrimary,
            lowSubstanceXSecondary,
            icon,
            iconOuter,
            iconInner
        });
    }

    refs.ccSlots.forEach((slot, index) => {
        if (index >= args.entries.length) {
            slot.group.classList.add('ert-hidden');
            slot.group.removeAttribute('data-entry-key');
            slot.group.removeAttribute('data-file-path');
            return;
        }

        const placement = layout.placements[index];
        slot.group.classList.remove('ert-hidden');
        slot.group.setAttribute('data-class', placement.entry.className);
        slot.group.setAttribute('data-entry-key', placement.entry.entryKey);
        slot.group.setAttribute('data-file-path', placement.entry.filePath);
        if (placement.entry.sceneId) {
            slot.group.setAttribute('data-scene-id', placement.entry.sceneId);
        } else {
            slot.group.removeAttribute('data-scene-id');
        }
        slot.group.setAttribute('transform', `translate(${placement.x} ${placement.y})`);
        slot.group.classList.toggle('is-target', placement.entry.isTarget);
        slot.base.setAttribute('width', String(layout.pageWidth));
        slot.base.setAttribute('height', String(layout.pageHeight));
        slot.base.setAttribute('x', '0');
        slot.base.setAttribute('y', '0');
        slot.fill.setAttribute('width', String(layout.pageWidth));
        slot.fill.setAttribute('height', '0');
        slot.fill.setAttribute('x', '0');
        slot.fill.setAttribute('y', String(layout.pageHeight));
        slot.border.setAttribute('width', String(layout.pageWidth));
        slot.border.setAttribute('height', String(layout.pageHeight));
        slot.border.setAttribute('x', '0');
        slot.border.setAttribute('y', '0');
        slot.border.setAttribute('rx', String(corner));
        slot.border.setAttribute('ry', String(corner));
        const xInset = Math.max(2, Math.round(layout.pageWidth * 0.14));
        const yInset = Math.max(2, Math.round(layout.pageHeight * 0.14));
        slot.lowSubstanceXPrimary.setAttribute('x1', String(xInset));
        slot.lowSubstanceXPrimary.setAttribute('y1', String(yInset));
        slot.lowSubstanceXPrimary.setAttribute('x2', String(layout.pageWidth - xInset));
        slot.lowSubstanceXPrimary.setAttribute('y2', String(layout.pageHeight - yInset));
        slot.lowSubstanceXSecondary.setAttribute('x1', String(layout.pageWidth - xInset));
        slot.lowSubstanceXSecondary.setAttribute('y1', String(yInset));
        slot.lowSubstanceXSecondary.setAttribute('x2', String(xInset));
        slot.lowSubstanceXSecondary.setAttribute('y2', String(layout.pageHeight - yInset));
        const iconCenterX = Math.round(layout.pageWidth / 2);
        const iconCenterY = Math.round(layout.pageHeight / 2) + CC_CELL_ICON_OFFSET;
        const maxRadius = Math.max(2, (layout.pageWidth - 2) / 2);
        const outerRadius = Math.min(maxRadius, Math.max(3, Math.round(layout.pageWidth * 0.25 * 10) / 10));
        const innerRadius = Math.max(1.2, Math.round(outerRadius * 0.35 * 10) / 10);
        slot.icon.setAttribute('transform', `translate(${iconCenterX} ${iconCenterY})`);
        slot.iconOuter.setAttribute('cx', '0');
        slot.iconOuter.setAttribute('cy', '0');
        slot.iconOuter.setAttribute('r', String(outerRadius));
        slot.iconInner.setAttribute('cx', '0');
        slot.iconInner.setAttribute('cy', '0');
        slot.iconInner.setAttribute('r', String(innerRadius));
    });

    while (refs.ccClassLabels.length < layout.classLayouts.length) {
        const headerGroup = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-class');
        const hit = createSvgElement('rect');
        hit.classList.add('ert-inquiry-cc-class-hit');
        headerGroup.appendChild(hit);
        const icon = createSvgGroup(headerGroup, 'ert-inquiry-cc-class-icon');
        const iconOuter = createSvgElement('circle');
        iconOuter.classList.add('ert-inquiry-cc-class-icon-outer');
        const iconInner = createSvgElement('circle');
        iconInner.classList.add('ert-inquiry-cc-class-icon-inner');
        icon.appendChild(iconOuter);
        icon.appendChild(iconInner);
        const label = createSvgText(headerGroup, 'ert-inquiry-cc-class-label', '', 0, 0);
        label.setAttribute('text-anchor', 'start');
        label.setAttribute('dominant-baseline', 'middle');
        headerGroup.appendChild(label);
        args.registerSvgEvent(headerGroup, 'click', () => {
            const groupKey = headerGroup.getAttribute('data-group-key') ?? headerGroup.getAttribute('data-class');
            if (groupKey) {
                args.onGroupToggle(groupKey);
            }
        });
        refs.ccClassLabels.push({ group: headerGroup, hit, icon, iconOuter, iconInner, text: label });
    }

    layout.classLayouts.forEach((classLayout, index) => {
        const header = refs.ccClassLabels[index];
        const { group, centerX, width } = classLayout;
        const availableWidth = Math.max(4, width - layout.gap);
        const modeMeta = args.getModeMeta(group.mode);
        header.group.setAttribute('data-group-key', group.key);
        header.group.setAttribute('data-class', group.className);
        header.group.classList.toggle('is-excluded', !modeMeta.isActive);
        header.group.classList.toggle('is-active', modeMeta.isActive);
        header.group.classList.remove('is-mode-excluded', 'is-mode-summary', 'is-mode-full');
        if (group.mode === 'summary') {
            header.group.classList.add('is-mode-summary');
        } else if (group.mode === 'full') {
            header.group.classList.add('is-mode-full');
        } else {
            header.group.classList.add('is-mode-excluded');
        }

        const variants = args.getHeaderLabelVariants(group.className, group.count, group.headerLabel);
        header.text.textContent = variants[0] ?? '';
        const iconAllowance = CC_HEADER_ICON_SIZE + CC_HEADER_ICON_GAP;
        let fallbackVariant = variants[0] ?? '';
        let fallbackWidth = Number.POSITIVE_INFINITY;
        let hasFit = false;
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
            const variant = variants[variantIndex] ?? '';
            header.text.textContent = variant;
            const measuredWidth = header.text.getComputedTextLength() + iconAllowance;
            if (measuredWidth < fallbackWidth) {
                fallbackVariant = variant;
                fallbackWidth = measuredWidth;
            }
            if (measuredWidth <= availableWidth) {
                hasFit = true;
                break;
            }
        }
        if (!hasFit) {
            header.text.textContent = fallbackVariant;
        }

        const textWidth = header.text.getComputedTextLength();
        const totalWidth = CC_HEADER_ICON_SIZE + CC_HEADER_ICON_GAP + textWidth;
        const startX = centerX - (totalWidth / 2);
        const iconCenterX = startX + (CC_HEADER_ICON_SIZE / 2);
        const iconCenterY = layout.titleY - CC_HEADER_ICON_OFFSET;
        const outerRadius = Math.max(3, Math.round(CC_HEADER_ICON_SIZE * 0.45 * 10) / 10);
        const innerRadius = Math.max(1.2, Math.round(outerRadius * 0.35 * 10) / 10);
        header.icon.setAttribute('transform', `translate(${Math.round(iconCenterX)} ${Math.round(iconCenterY)})`);
        header.iconOuter.setAttribute('cx', '0');
        header.iconOuter.setAttribute('cy', '0');
        header.iconOuter.setAttribute('r', String(outerRadius));
        header.iconInner.setAttribute('cx', '0');
        header.iconInner.setAttribute('cy', '0');
        header.iconInner.setAttribute('r', String(innerRadius));
        header.text.setAttribute('x', String(Math.round(startX + CC_HEADER_ICON_SIZE + CC_HEADER_ICON_GAP)));
        header.text.setAttribute('y', String(layout.titleY));
        const hitPaddingX = 4;
        const hitHeight = Math.max(CC_HEADER_ICON_SIZE, 12) + 8;
        header.hit.setAttribute('x', String(Math.round(startX - hitPaddingX)));
        header.hit.setAttribute('y', String(Math.round(layout.titleY - (hitHeight / 2))));
        header.hit.setAttribute('width', String(Math.round(totalWidth + (hitPaddingX * 2))));
        header.hit.setAttribute('height', String(Math.round(hitHeight)));
        header.group.classList.remove('ert-hidden');
        addTooltipData(
            header.group,
            args.getHeaderTooltip(group.className, group.mode, group.count, group.headerTooltipLabel),
            'top'
        );
    });

    refs.ccClassLabels.forEach((header, index) => {
        if (index < layout.classLayouts.length) return;
        header.group.classList.add('ert-hidden');
    });

    return {
        ...refs,
        ccEntries: layout.layoutEntries,
        ccLayout: {
            pageWidth: layout.pageWidth,
            pageHeight: layout.pageHeight,
            gap: layout.gap
        }
    };
}

function getCorpusStripTopLimit(): number {
    const bottomLimit = VIEWBOX_MAX - CC_BOTTOM_MARGIN;
    const maxHeight = Math.round(VIEWBOX_SIZE * (2 / 3));
    const zoneTop = Math.min(ZONE_LAYOUT.setup.y, ZONE_LAYOUT.pressure.y) - ZONE_SEGMENT_HALF_HEIGHT;
    return Math.max(bottomLimit - maxHeight, Math.round(zoneTop));
}

function buildCorpusStripLayout(
    classGroups: CorpusCcGroup[],
    pageWidth: number
): InquiryCorpusStripComputedLayout {
    const topLimit = getCorpusStripTopLimit();
    const bottomLimit = VIEWBOX_MAX - CC_BOTTOM_MARGIN;
    const zoneLeft = ZONE_LAYOUT.setup.x;
    const zoneRight = ZONE_LAYOUT.pressure.x;
    const zoneBuffer = 50;

    const pageHeight = Math.round(pageWidth * 1.45);
    const gap = pageWidth;
    const titleY = gap;
    const docStartY = titleY + gap;
    const rowStep = pageHeight + gap;
    const usableHeight = Math.max(0, (bottomLimit - topLimit) - docStartY);
    const rowsPerColumn = Math.max(1, Math.floor((usableHeight + gap) / rowStep));
    const columnStep = pageWidth + gap;
    const anchorRightX = VIEWBOX_MAX - CC_RIGHT_MARGIN - pageWidth;
    const anchorLeftX = VIEWBOX_MIN + CC_RIGHT_MARGIN;
    let placeLeft = false;
    let rightColumnsUsed = 0;
    let leftColumnsUsed = 0;
    const placements: InquiryCorpusStripPlacement[] = [];
    const layoutEntries: CorpusCcEntry[] = [];
    const classLayouts: InquiryCorpusStripClassLayout[] = [];

    classGroups.forEach(group => {
        const columnsNeeded = Math.max(1, Math.ceil(group.items.length / rowsPerColumn));
        const side = placeLeft ? 'left' : 'right';
        const startIndex = side === 'right' ? rightColumnsUsed : leftColumnsUsed;
        const classLeftEdge = side === 'right'
            ? anchorRightX - ((startIndex + columnsNeeded - 1) * columnStep)
            : anchorLeftX + (startIndex * columnStep);
        const classRightEdge = side === 'right'
            ? anchorRightX - (startIndex * columnStep) + pageWidth
            : anchorLeftX + ((startIndex + columnsNeeded - 1) * columnStep) + pageWidth;
        const classWidth = classRightEdge - classLeftEdge;
        classLayouts.push({
            group,
            centerX: Math.round(classLeftEdge + (classWidth / 2)),
            width: Math.round(classWidth)
        });

        let entryIndex = 0;
        for (let colOffset = 0; colOffset < columnsNeeded; colOffset += 1) {
            for (let rowIndex = 0; rowIndex < rowsPerColumn; rowIndex += 1) {
                if (entryIndex >= group.items.length) break;
                const entry = group.items[entryIndex];
                const x = side === 'right'
                    ? anchorRightX - ((startIndex + colOffset) * columnStep)
                    : anchorLeftX + ((startIndex + colOffset) * columnStep);
                const y = docStartY + (rowIndex * rowStep);
                placements.push({ entry, x: Math.round(x), y: Math.round(y) });
                layoutEntries.push(entry);
                entryIndex += 1;
            }
        }

        if (side === 'right') {
            rightColumnsUsed += columnsNeeded;
            const leftmostEdge = anchorRightX - ((rightColumnsUsed - 1) * columnStep);
            if (!placeLeft && leftmostEdge <= (zoneRight + zoneBuffer)) {
                placeLeft = true;
            }
        } else {
            leftColumnsUsed += columnsNeeded;
        }
    });

    const rightBlockLeft = rightColumnsUsed > 0
        ? anchorRightX - ((rightColumnsUsed - 1) * columnStep)
        : anchorRightX;
    const rightBlockRight = rightColumnsUsed > 0
        ? anchorRightX + pageWidth
        : anchorRightX + pageWidth;
    const rightmostLeftEdge = leftColumnsUsed > 0
        ? anchorLeftX + ((leftColumnsUsed - 1) * columnStep) + pageWidth
        : anchorLeftX;
    const leftmostRightEdge = rightColumnsUsed > 0
        ? anchorRightX - ((rightColumnsUsed - 1) * columnStep)
        : anchorRightX;
    const overlapSetup = rightmostLeftEdge >= zoneLeft || leftmostRightEdge <= zoneLeft;

    return {
        pageWidth,
        pageHeight,
        gap,
        titleY,
        docStartY,
        anchorRightX,
        placements,
        layoutEntries,
        classLayouts,
        rightBlockLeft,
        rightBlockRight,
        overlapSetup
    };
}
