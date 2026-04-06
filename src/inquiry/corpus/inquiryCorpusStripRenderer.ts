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
    ccCorpusLabel?: SVGTextElement;
    ccLegendTrigger?: SVGGElement;
    ccLegendPanel?: SVGGElement;
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

// ── Legend panel builder ────────────────────────────────────────────

type LegendRow = {
    label: string;
    buildIcon: (group: SVGGElement, cx: number, cy: number, size: number) => void;
};

/** Build a note-shaped rect (taller than wide, like corpus cells). */
function buildLegendNoteRect(
    g: SVGGElement, cx: number, cy: number, w: number, h: number,
    opts: { stroke: string; strokeWidth: string; dasharray?: string; linecap?: string; fill?: string }
): void {
    const r = createSvgElement('rect');
    r.setAttribute('x', String(cx - w / 2)); r.setAttribute('y', String(cy - h / 2));
    r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
    r.setAttribute('rx', '3'); r.setAttribute('ry', '3');
    r.style.fill = opts.fill ?? 'none';
    r.style.stroke = opts.stroke; r.style.strokeWidth = opts.strokeWidth;
    if (opts.dasharray) r.style.strokeDasharray = opts.dasharray;
    if (opts.linecap) r.style.strokeLinecap = opts.linecap;
    g.appendChild(r);
}

function buildCorpusLegendPanel(panel: SVGGElement): void {
    // All sizes in SVG viewbox units (1600-unit space).
    // At ~600px container width, 1 SVG unit ≈ 0.375 real px.
    const rowHeight = 32;
    const iconColX = 24;
    const labelColX = 58;
    const fontSize = 16;
    const sectionFontSize = 13;
    const noteW = 18;
    const noteH = 26;
    const circleR = 8;
    const padding = 14;

    const sections: { title: string; rows: LegendRow[] }[] = [
        {
            title: 'MODE (icon + color)',
            rows: [
                {
                    label: 'Full — solid disc (green)',
                    buildIcon: (g, cx, cy) => {
                        const c = createSvgElement('circle');
                        c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy));
                        c.setAttribute('r', String(circleR));
                        c.style.fill = '#00ff00';
                        g.appendChild(c);
                    }
                },
                {
                    label: 'Summary — ring + dot (blue)',
                    buildIcon: (g, cx, cy) => {
                        const outer = createSvgElement('circle');
                        outer.setAttribute('cx', String(cx)); outer.setAttribute('cy', String(cy));
                        outer.setAttribute('r', String(circleR));
                        outer.style.fill = 'none'; outer.style.stroke = '#3b82ff'; outer.style.strokeWidth = '2';
                        g.appendChild(outer);
                        const inner = createSvgElement('circle');
                        inner.setAttribute('cx', String(cx)); inner.setAttribute('cy', String(cy));
                        inner.setAttribute('r', String(circleR * 0.35));
                        inner.style.fill = '#3b82ff';
                        g.appendChild(inner);
                    }
                },
                {
                    label: 'Exclude — empty ring (red)',
                    buildIcon: (g, cx, cy) => {
                        const c = createSvgElement('circle');
                        c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy));
                        c.setAttribute('r', String(circleR));
                        c.style.fill = 'none'; c.style.stroke = '#ff4d4f'; c.style.strokeWidth = '2';
                        g.appendChild(c);
                    }
                }
            ]
        },
        {
            title: 'STATUS (border)',
            rows: [
                {
                    label: 'Complete — solid border',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, { stroke: 'var(--text-muted)', strokeWidth: '2' });
                    }
                },
                {
                    label: 'Working — dotted border',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, {
                            stroke: 'var(--text-muted)', strokeWidth: '2.5',
                            dasharray: '0 5', linecap: 'round'
                        });
                    }
                },
                {
                    label: 'Todo — dashed border',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, {
                            stroke: 'var(--text-muted)', strokeWidth: '2',
                            dasharray: '10 4'
                        });
                    }
                },
                {
                    label: 'Overdue — red border',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, {
                            stroke: '#ff4d4f', strokeWidth: '2.5'
                        });
                    }
                }
            ]
        },
        {
            title: 'TIER (fill level)',
            rows: [
                {
                    label: 'Substantive — full fill',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, { stroke: 'var(--text-muted)', strokeWidth: '2' });
                        const f = createSvgElement('rect');
                        f.setAttribute('x', String(cx - noteW / 2 + 2)); f.setAttribute('y', String(cy - noteH / 2 + 2));
                        f.setAttribute('width', String(noteW - 4)); f.setAttribute('height', String(noteH - 4));
                        f.setAttribute('rx', '2'); f.setAttribute('ry', '2');
                        f.style.fill = 'color-mix(in srgb, var(--text-normal) 40%, transparent)';
                        g.appendChild(f);
                    }
                },
                {
                    label: 'Medium — partial fill',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, { stroke: 'var(--text-muted)', strokeWidth: '2' });
                        const fillH = Math.round(noteH * 0.55);
                        const f = createSvgElement('rect');
                        f.setAttribute('x', String(cx - noteW / 2 + 2));
                        f.setAttribute('y', String(cy + noteH / 2 - fillH - 2));
                        f.setAttribute('width', String(noteW - 4)); f.setAttribute('height', String(fillH));
                        f.setAttribute('rx', '2'); f.setAttribute('ry', '2');
                        f.style.fill = 'color-mix(in srgb, var(--text-normal) 40%, transparent)';
                        g.appendChild(f);
                    }
                },
                {
                    label: 'Sketchy — low fill',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, { stroke: 'var(--text-muted)', strokeWidth: '2' });
                        const fillH = Math.round(noteH * 0.2);
                        const f = createSvgElement('rect');
                        f.setAttribute('x', String(cx - noteW / 2 + 2));
                        f.setAttribute('y', String(cy + noteH / 2 - fillH - 2));
                        f.setAttribute('width', String(noteW - 4)); f.setAttribute('height', String(fillH));
                        f.setAttribute('rx', '2'); f.setAttribute('ry', '2');
                        f.style.fill = 'color-mix(in srgb, var(--text-normal) 40%, transparent)';
                        g.appendChild(f);
                    }
                },
                {
                    label: 'Empty — no fill',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, { stroke: 'var(--text-muted)', strokeWidth: '2' });
                    }
                }
            ]
        },
        {
            title: 'ALERTS',
            rows: [
                {
                    label: 'Low substance (X)',
                    buildIcon: (g, cx, cy) => {
                        buildLegendNoteRect(g, cx, cy, noteW, noteH, { stroke: 'var(--text-muted)', strokeWidth: '2' });
                        const pad = 6;
                        const l1 = createSvgElement('line');
                        l1.setAttribute('x1', String(cx - noteW / 2 + pad)); l1.setAttribute('y1', String(cy - noteH / 2 + pad));
                        l1.setAttribute('x2', String(cx + noteW / 2 - pad)); l1.setAttribute('y2', String(cy + noteH / 2 - pad));
                        l1.style.stroke = '#ff4d4f'; l1.style.strokeWidth = '2.5'; l1.style.strokeLinecap = 'round';
                        g.appendChild(l1);
                        const l2 = createSvgElement('line');
                        l2.setAttribute('x1', String(cx + noteW / 2 - pad)); l2.setAttribute('y1', String(cy - noteH / 2 + pad));
                        l2.setAttribute('x2', String(cx - noteW / 2 + pad)); l2.setAttribute('y2', String(cy + noteH / 2 - pad));
                        l2.style.stroke = '#ff4d4f'; l2.style.strokeWidth = '2.5'; l2.style.strokeLinecap = 'round';
                        g.appendChild(l2);
                    }
                }
            ]
        }
    ];

    // Calculate total height
    let totalRows = 0;
    const sectionGap = 10;
    const titleHeight = 24;
    for (const section of sections) {
        totalRows += section.rows.length;
    }
    const panelHeight = (sections.length * (titleHeight + sectionGap)) + (totalRows * rowHeight) + padding * 2;

    // Width: labelColX + longest label (~28 chars × ~9 units at 16px) + right padding
    const panelWidth = labelColX + 252 + padding;
    const panelLeft = 0;

    // Background — fully opaque, matches viewbox bg
    const bg = createSvgElement('rect');
    bg.classList.add('ert-inquiry-cc-legend-bg');
    bg.setAttribute('x', String(panelLeft));
    bg.setAttribute('y', '14');
    bg.setAttribute('width', String(panelWidth));
    bg.setAttribute('height', String(panelHeight));
    bg.setAttribute('rx', '5');
    bg.setAttribute('ry', '5');
    panel.appendChild(bg);

    let currentY = 14 + padding + titleHeight / 2;
    for (const section of sections) {
        // Section title
        const title = createSvgText(panel, 'ert-inquiry-cc-legend-section-title', section.title, panelLeft + padding, currentY);
        title.setAttribute('dominant-baseline', 'middle');
        currentY += titleHeight;

        for (const row of section.rows) {
            const rowGroup = createSvgGroup(panel, '', 0, 0);
            const iconCx = panelLeft + iconColX;
            const iconCy = currentY;
            row.buildIcon(rowGroup, iconCx, iconCy, 0);
            const label = createSvgText(rowGroup, 'ert-inquiry-cc-legend-label', row.label, panelLeft + labelColX, iconCy);
            label.setAttribute('dominant-baseline', 'central');
            currentY += rowHeight;
        }
        currentY += sectionGap;
    }
}

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
    onGlobalContextMenu: (event: MouseEvent) => void;
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
        args.registerSvgEvent(refs.ccLabelGroup, 'contextmenu', (event: MouseEvent) => {
            args.onGlobalContextMenu(event);
        });
    }

    // ── "CORPUS" title line (static, with ? legend trigger) ──
    if (!refs.ccCorpusLabel) {
        refs.ccCorpusLabel = createSvgText(refs.ccGroup, 'ert-inquiry-cc-corpus-title', 'CORPUS', 0, 0);
        refs.ccCorpusLabel.setAttribute('text-anchor', 'middle');
        refs.ccCorpusLabel.setAttribute('dominant-baseline', 'middle');
    }

    // ── "?" legend trigger — page-shaped icon matching corpus cells ──
    if (!refs.ccLegendTrigger) {
        refs.ccLegendTrigger = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-legend-trigger', 0, 0);
        const qW = layout.pageWidth;
        const qH = layout.pageHeight;
        const qCorner = Math.max(2, Math.round(qW * 0.125));
        const qBorder = createSvgElement('rect');
        qBorder.classList.add('ert-inquiry-cc-legend-trigger-border');
        qBorder.setAttribute('x', String(-qW / 2));
        qBorder.setAttribute('y', String(-qH / 2));
        qBorder.setAttribute('width', String(qW));
        qBorder.setAttribute('height', String(qH));
        qBorder.setAttribute('rx', String(qCorner));
        qBorder.setAttribute('ry', String(qCorner));
        refs.ccLegendTrigger.appendChild(qBorder);
        const qText = createSvgText(refs.ccLegendTrigger, 'ert-inquiry-cc-legend-trigger-text', '?', 0, 0);
        qText.setAttribute('text-anchor', 'middle');
        qText.setAttribute('dominant-baseline', 'central');
        // Invisible hit rect for larger hover target
        const qHit = createSvgElement('rect');
        qHit.classList.add('ert-inquiry-cc-hint-hit');
        qHit.setAttribute('x', String(-qW));
        qHit.setAttribute('y', String(-qH));
        qHit.setAttribute('width', String(qW * 2));
        qHit.setAttribute('height', String(qH * 2));
        refs.ccLegendTrigger.appendChild(qHit);
    }

    // ── Legend panel (child of ccGroup, not the trigger — avoids clipping) ──
    if (!refs.ccLegendPanel) {
        refs.ccLegendPanel = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-legend-panel', 0, 0);
        buildCorpusLegendPanel(refs.ccLegendPanel);
        // JS hover: toggle visibility class since panel is a sibling, not child, of trigger
        const legendPanel = refs.ccLegendPanel;
        const legendTrigger = refs.ccLegendTrigger!;
        legendTrigger.addEventListener('mouseenter', () => legendPanel.classList.add('is-legend-visible'));
        legendTrigger.addEventListener('mouseleave', () => {
            // Short delay so user can move mouse to the panel itself
            setTimeout(() => {
                if (!legendPanel.matches(':hover')) {
                    legendPanel.classList.remove('is-legend-visible');
                }
            }, 80);
        });
        legendPanel.addEventListener('mouseleave', () => legendPanel.classList.remove('is-legend-visible'));
    }

    // ── Scope label line (e.g. "BOOK B1") — clickable ──
    if (!refs.ccLabel) {
        refs.ccLabel = createSvgText(refs.ccLabelGroup ?? refs.ccGroup, 'ert-inquiry-cc-label', '', 0, 0);
        refs.ccLabel.setAttribute('text-anchor', 'middle');
        refs.ccLabel.setAttribute('dominant-baseline', 'middle');
        refs.ccLabel.classList.add('is-actionable');
    }

    // ── Up-arrow hint ──
    if (!refs.ccLabelHint) {
        refs.ccLabelHint = createSvgGroup(refs.ccGroup, 'ert-inquiry-cc-hint', 0, 0);
        const hintHitPad = 10;
        const hintHitRect = createSvgElement('rect');
        hintHitRect.classList.add('ert-inquiry-cc-hint-hit');
        hintHitRect.setAttribute('x', String(-(CC_LABEL_HINT_SIZE / 2) - hintHitPad));
        hintHitRect.setAttribute('y', String(-(CC_LABEL_HINT_SIZE / 2) - hintHitPad));
        hintHitRect.setAttribute('width', String(CC_LABEL_HINT_SIZE + hintHitPad * 2));
        hintHitRect.setAttribute('height', String(CC_LABEL_HINT_SIZE + hintHitPad * 2));
        refs.ccLabelHint.appendChild(hintHitRect);
        refs.ccLabelHintIcon = args.createIconUse(
            'arrow-big-up-dash',
            -CC_LABEL_HINT_SIZE / 2,
            -CC_LABEL_HINT_SIZE / 2,
            CC_LABEL_HINT_SIZE
        );
        refs.ccLabelHintIcon.classList.add('ert-inquiry-cc-hint-icon');
        refs.ccLabelHint.appendChild(refs.ccLabelHintIcon);
        addTooltipData(
            refs.ccLabelHint,
            balanceTooltipText('Click corpus note to cycle scope.\nShift-click to toggle Targeting. Right-click for menu.'),
            'top'
        );
    }

    // ── Position labels ──
    refs.ccLabel.textContent = args.getScopeLabel();
    const stripCenterX = Math.round((layout.rightBlockLeft + layout.rightBlockRight) / 2);
    const corpusTitleY = -18;
    const scopeLabelY = 0;

    // CORPUS text centered on strip, arrow + [?] placed to its right
    const corpusTextW = refs.ccCorpusLabel?.getComputedTextLength?.() ?? 0;
    const arrowGap = 8;
    refs.ccCorpusLabel.setAttribute('x', String(stripCenterX));
    refs.ccCorpusLabel.setAttribute('y', String(corpusTitleY));

    const iconCenterX = Math.round(stripCenterX + corpusTextW / 2 + arrowGap + CC_LABEL_HINT_SIZE / 2);

    // Arrow aligned with CORPUS row
    if (refs.ccLabelHint) {
        refs.ccLabelHint.setAttribute('transform', `translate(${iconCenterX} ${corpusTitleY})`);
    }

    // [?] page icon aligned with rightmost corpus column, 30 units above the arrow
    if (refs.ccLegendTrigger) {
        const rightColCenterX = Math.round(layout.anchorRightX + layout.pageWidth / 2);
        refs.ccLegendTrigger.setAttribute('transform', `translate(${rightColCenterX} ${corpusTitleY - 30})`);
    }

    // Position legend panel: anchor right edge to stay within viewbox
    if (refs.ccLegendPanel) {
        const legendPanelW = 324; // must match panelWidth in buildCorpusLegendPanel
        const maxRight = VIEWBOX_MAX - CC_RIGHT_MARGIN;
        // Align left edge of legend with left edge of corpus strip, clamped to viewbox
        let legendX = layout.rightBlockLeft;
        if (legendX + legendPanelW > maxRight) {
            legendX = maxRight - legendPanelW;
        }
        refs.ccLegendPanel.setAttribute('transform', `translate(${Math.round(legendX)} ${corpusTitleY})`);
    }

    // BOOK B1 line: center independently on the strip
    refs.ccLabelGroup?.setAttribute('transform', `translate(0 ${scopeLabelY})`);
    refs.ccLabel.setAttribute('x', String(stripCenterX));
    refs.ccLabel.setAttribute('y', '0');
    if (refs.ccLabelGroup) {
        addTooltipData(refs.ccLabelGroup, balanceTooltipText('Cycle all corpus scopes.'), 'top');
    }
    if (refs.ccLabelHit) {
        const scopeW = refs.ccLabel?.getComputedTextLength?.() ?? 0;
        const hitPaddingX = 6;
        const hitHeight = 20;
        const hitStartX = Math.round(stripCenterX - (scopeW / 2) - hitPaddingX);
        const hitWidth = Math.max(0, Math.round(scopeW + (hitPaddingX * 2)));
        refs.ccLabelHit.setAttribute('x', String(hitStartX));
        refs.ccLabelHit.setAttribute('y', String(-Math.round(hitHeight / 2)));
        refs.ccLabelHit.setAttribute('width', String(hitWidth));
        refs.ccLabelHit.setAttribute('height', String(hitHeight));
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
        const targetLetter = createSvgText(group, 'ert-inquiry-cc-cell-target-letter', 'F', 0, 0);
        targetLetter.setAttribute('text-anchor', 'middle');
        targetLetter.setAttribute('aria-hidden', 'true');
        group.appendChild(base);
        group.appendChild(fill);
        group.appendChild(border);
        group.appendChild(icon);
        group.appendChild(targetLetter);
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
            iconInner,
            targetLetter
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
        slot.targetLetter.setAttribute('x', String(iconCenterX));
        slot.targetLetter.setAttribute('y', String(iconCenterY + 3));
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

        // Split trailing digits into a dimmed tspan for the count portion
        const finalText = header.text.textContent ?? '';
        const digitMatch = finalText.match(/^([A-Za-zΣ]+)(\d+)$/);
        if (digitMatch) {
            header.text.textContent = '';
            const letterSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            letterSpan.textContent = digitMatch[1];
            const countSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            countSpan.textContent = digitMatch[2];
            countSpan.classList.add('ert-inquiry-cc-class-label-count');
            header.text.appendChild(letterSpan);
            header.text.appendChild(countSpan);
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

    // Ensure legend panel paints on top of corpus cells (SVG z-order = DOM order)
    if (refs.ccLegendPanel && refs.ccGroup) {
        refs.ccGroup.appendChild(refs.ccLegendPanel);
    }

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
