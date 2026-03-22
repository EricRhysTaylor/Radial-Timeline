import { addTooltipData, balanceTooltipText } from '../../utils/tooltip';
import {
    DEBUG_SVG_OVERLAY,
    GLYPH_OFFSET_Y,
    PREVIEW_PANEL_PADDING_Y,
    PREVIEW_PANEL_WIDTH,
    PREVIEW_PANEL_Y,
    PREVIEW_PILL_HEIGHT,
    PREVIEW_PILL_PADDING_X,
    PREVIEW_SHIMMER_OVERHANG,
    PREVIEW_SHIMMER_WIDTH,
    VIEWBOX_MAX,
    VIEWBOX_MIN,
    VIEWBOX_SIZE
} from '../constants/inquiryLayout';
import { MINIMAP_GROUP_Y } from '../minimap/InquiryMinimapRenderer';
import { createSvgElement, createSvgGroup, createSvgText } from '../minimap/svgUtils';
import type { InquiryPreviewRow } from '../types/inquiryViewTypes';

export type InquiryDesktopShellRefs = {
    rootSvg: SVGSVGElement;
    svgDefs: SVGDefsElement;
    hudGroup: SVGGElement;
    canvasGroup: SVGGElement;
    minimapGroup: SVGGElement;
    glyphAnchor: SVGGElement;
    scopeToggleButton: SVGGElement;
    scopeToggleIcon?: SVGUseElement;
    artifactButton: SVGGElement;
    apiSimulationButton: SVGGElement;
    helpToggleButton: SVGGElement;
    engineBadgeGroup: SVGGElement;
    engineTimerLabel: SVGTextElement;
    navPrevButton: SVGGElement;
    navNextButton: SVGGElement;
    navPrevIcon?: SVGUseElement;
    navNextIcon?: SVGUseElement;
    navSessionLabel: SVGTextElement;
};

export type InquiryPromptPreviewPanelRefs = {
    previewGroup: SVGGElement;
    previewRunningNote: SVGTextElement;
    previewHero: SVGTextElement;
    previewMeta: SVGTextElement;
    previewFooter: SVGTextElement;
    previewClickTarget: SVGRectElement;
    previewRows: InquiryPreviewRow[];
    previewRowDefaultLabels: string[];
    previewShimmerGroup?: SVGGElement;
};

export type InquiryBriefingPanelRefs = {
    briefingPanelEl: HTMLDivElement;
    briefingListEl: HTMLDivElement;
    briefingEmptyEl: HTMLDivElement;
    briefingFooterEl: HTMLDivElement;
    briefingSaveButton: HTMLButtonElement;
    briefingClearButton: HTMLButtonElement;
    briefingResetButton: HTMLButtonElement;
    briefingPurgeButton: HTMLButtonElement;
};

export type InquiryEnginePanelRefs = {
    enginePanelEl: HTMLDivElement;
    enginePanelMetaEl: HTMLDivElement;
    enginePanelReadinessEl: HTMLDivElement;
    enginePanelReadinessStatusEl: HTMLDivElement;
    enginePanelReadinessCorpusEl: HTMLDivElement;
    enginePanelReadinessMessageEl: HTMLDivElement;
    enginePanelReadinessScopeEl: HTMLDivElement;
    enginePanelReadinessActionsEl: HTMLDivElement;
    enginePanelGuardEl: HTMLDivElement;
    enginePanelGuardNoteEl: HTMLDivElement;
    enginePanelListEl: HTMLDivElement;
};

type InquiryCreateIconButton = (
    parent: SVGGElement,
    x: number,
    y: number,
    size: number,
    iconName: string,
    label: string,
    cls?: string
) => SVGGElement;

export function createInquiryDesktopShell(args: {
    contentEl: HTMLElement;
    populateDefs: (defs: SVGDefsElement) => void;
    createIconButton: InquiryCreateIconButton;
    getBackgroundHref: () => string;
    buildDebugOverlay: (svg: SVGSVGElement) => void;
}): InquiryDesktopShellRefs {
    args.contentEl.addClass('ert-inquiry-root');

    const svg = createSvgElement('svg') as SVGSVGElement;
    svg.classList.add('ert-ui', 'ert-inquiry-svg');
    svg.setAttribute('viewBox', `${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    args.contentEl.appendChild(svg);

    const defs = createSvgElement('defs') as SVGDefsElement;
    args.populateDefs(defs);
    svg.appendChild(defs);

    const background = createSvgElement('rect');
    background.classList.add('ert-inquiry-bg');
    background.setAttribute('x', String(VIEWBOX_MIN));
    background.setAttribute('y', String(VIEWBOX_MIN));
    background.setAttribute('width', String(VIEWBOX_SIZE));
    background.setAttribute('height', String(VIEWBOX_SIZE));
    svg.appendChild(background);

    const bgImage = createSvgElement('image');
    bgImage.classList.add('ert-inquiry-bg-image');
    bgImage.setAttribute('x', String(VIEWBOX_MIN));
    bgImage.setAttribute('y', String(VIEWBOX_MIN));
    bgImage.setAttribute('width', String(VIEWBOX_SIZE));
    bgImage.setAttribute('height', String(VIEWBOX_SIZE));
    bgImage.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    bgImage.setAttribute('pointer-events', 'none');
    bgImage.setAttribute('href', args.getBackgroundHref());
    svg.appendChild(bgImage);

    svg.classList.toggle('is-debug', DEBUG_SVG_OVERLAY);
    if (DEBUG_SVG_OVERLAY) {
        args.buildDebugOverlay(svg);
    }

    const hudOffsetX = -760;
    const hudOffsetY = -740;
    const hudGroup = createSvgGroup(svg, 'ert-inquiry-hud', hudOffsetX, hudOffsetY);
    hudGroup.setAttribute('id', 'inq-hud');
    const canvasGroup = createSvgGroup(svg, 'ert-inquiry-canvas');
    canvasGroup.setAttribute('id', 'inq-canvas');

    const iconSize = 56;
    const iconGap = 16;
    const hudMargin = 40;

    const scopeToggleButton = args.createIconButton(hudGroup, 0, 0, iconSize, 'columns-2', 'Toggle scope');
    const scopeToggleIcon = scopeToggleButton.querySelector('.ert-inquiry-icon') as SVGUseElement | undefined;
    scopeToggleButton.querySelector('title')?.remove();
    addTooltipData(scopeToggleButton, balanceTooltipText('Toggle scope'), 'left');

    const artifactX = (VIEWBOX_MAX - hudMargin - iconSize) - hudOffsetX;
    const helpX = artifactX - (iconSize + iconGap);
    const simulateX = helpX - (iconSize + iconGap);
    const apiSimulationButton = args.createIconButton(hudGroup, simulateX, 0, iconSize, 'activity', 'Simulate API run');
    addTooltipData(apiSimulationButton, balanceTooltipText('Simulate API run'), 'left');

    const helpToggleButton = args.createIconButton(
        hudGroup,
        helpX,
        0,
        iconSize,
        'help-circle',
        'Inquiry help',
        'ert-inquiry-help-btn'
    );
    helpToggleButton.querySelector('title')?.remove();

    const artifactButton = args.createIconButton(hudGroup, artifactX, 0, iconSize, 'aperture', 'Briefing');
    artifactButton.querySelector('title')?.remove();

    const engineBadgeX = iconSize + iconGap;
    const engineBadgeGroup = args.createIconButton(hudGroup, engineBadgeX, 0, iconSize, 'cpu', 'AI engine', 'ert-inquiry-engine-btn');
    engineBadgeGroup.querySelector('title')?.remove();

    const engineTimerLabel = createSvgElement('text') as SVGTextElement;
    engineTimerLabel.classList.add('ert-inquiry-engine-timer', 'ert-hidden');
    engineTimerLabel.setAttribute('x', String(engineBadgeX + iconSize + 12));
    engineTimerLabel.setAttribute('y', '28');
    engineTimerLabel.setAttribute('dominant-baseline', 'central');
    engineTimerLabel.setAttribute('text-anchor', 'start');
    hudGroup.appendChild(engineTimerLabel);

    const minimapGroup = createSvgGroup(canvasGroup, 'ert-inquiry-minimap', 0, MINIMAP_GROUP_Y);
    const glyphAnchor = createSvgGroup(canvasGroup, 'ert-inquiry-focus-area', 0, GLYPH_OFFSET_Y);

    const hudFooterY = 1360;
    const navGroup = createSvgGroup(hudGroup, 'ert-inquiry-nav', 0, hudFooterY);
    const navPrevButton = args.createIconButton(navGroup, 0, -18, 44, 'chevron-left', 'Previous book', 'ert-inquiry-nav-btn');
    const navPrevIcon = navPrevButton.querySelector('.ert-inquiry-icon') as SVGUseElement | undefined;
    const navNextButton = args.createIconButton(navGroup, 54, -18, 44, 'chevron-right', 'Next book', 'ert-inquiry-nav-btn');
    const navNextIcon = navNextButton.querySelector('.ert-inquiry-icon') as SVGUseElement | undefined;

    const navSessionLabel = createSvgElement('text') as SVGTextElement;
    navSessionLabel.classList.add('ert-inquiry-nav-session-label');
    navSessionLabel.setAttribute('x', '108');
    navSessionLabel.setAttribute('y', '4');
    navSessionLabel.setAttribute('dominant-baseline', 'central');
    navSessionLabel.setAttribute('text-anchor', 'start');
    navSessionLabel.textContent = '';
    navGroup.appendChild(navSessionLabel);

    return {
        rootSvg: svg,
        svgDefs: defs,
        hudGroup,
        canvasGroup,
        minimapGroup,
        glyphAnchor,
        scopeToggleButton,
        scopeToggleIcon,
        artifactButton,
        apiSimulationButton,
        helpToggleButton,
        engineBadgeGroup,
        engineTimerLabel,
        navPrevButton,
        navNextButton,
        navPrevIcon,
        navNextIcon,
        navSessionLabel
    };
}

export function createInquiryPromptPreviewPanel(args: {
    parent: SVGGElement;
    ensurePreviewShimmerResources: (panel: SVGGElement) => { mask?: SVGMaskElement; maskRect?: SVGRectElement };
}): InquiryPromptPreviewPanelRefs {
    const panel = createSvgGroup(args.parent, 'ert-inquiry-preview', 0, PREVIEW_PANEL_Y);

    const clickTarget = createSvgElement('rect') as SVGRectElement;
    clickTarget.classList.add('ert-inquiry-preview-hitbox');
    clickTarget.setAttribute('fill', 'transparent');
    // pointer-events controlled by CSS — only enabled when preview is visible + results
    panel.appendChild(clickTarget);

    const runningNote = createSvgText(panel, 'ert-inquiry-preview-running-note ert-hidden', '', 0, -24);
    runningNote.setAttribute('text-anchor', 'middle');
    runningNote.setAttribute('dominant-baseline', 'hanging');

    const hero = createSvgText(panel, 'ert-inquiry-preview-hero', '', 0, PREVIEW_PANEL_PADDING_Y);
    hero.setAttribute('text-anchor', 'middle');
    hero.setAttribute('dominant-baseline', 'hanging');

    const meta = createSvgText(panel, 'ert-inquiry-preview-meta', '', 0, PREVIEW_PANEL_PADDING_Y);
    meta.setAttribute('text-anchor', 'middle');
    meta.setAttribute('dominant-baseline', 'hanging');

    const rowLabels = ['', '', '', '', '', ''];
    const previewRowDefaultLabels = rowLabels.slice();
    const tokensRowIndex = 4;
    const previewRows = rowLabels.map((label, index) => {
        const group = createSvgGroup(panel, 'ert-inquiry-preview-pill');
        if (index === tokensRowIndex) {
            group.classList.add('is-tokens-slot');
        }
        const bg = createSvgElement('rect') as SVGRectElement;
        bg.classList.add('ert-inquiry-preview-pill-bg');
        group.appendChild(bg);

        const pillTextY = (PREVIEW_PILL_HEIGHT / 2) + 1;
        const text = createSvgText(group, 'ert-inquiry-preview-pill-text', '', PREVIEW_PILL_PADDING_X, pillTextY);
        text.setAttribute('xml:space', 'preserve');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('alignment-baseline', 'middle');
        text.setAttribute('text-anchor', 'start');

        return { group, bg, text, label };
    });

    const footer = createSvgText(panel, 'ert-inquiry-preview-footer', '', 0, 0);
    footer.setAttribute('text-anchor', 'middle');
    footer.setAttribute('dominant-baseline', 'hanging');

    const shimmerResources = args.ensurePreviewShimmerResources(panel);
    let previewShimmerGroup: SVGGElement | undefined;
    const group = createSvgGroup(panel, 'ert-inquiry-preview-shimmer-group');
    group.setAttribute('display', 'none');
    if (shimmerResources.mask) {
        group.setAttribute('mask', `url(#${shimmerResources.mask.getAttribute('id')})`);
    }
    previewShimmerGroup = group;
    if (shimmerResources.maskRect) {
        const travel = Math.max(0, (PREVIEW_PANEL_WIDTH + (PREVIEW_SHIMMER_OVERHANG * 2)) - PREVIEW_SHIMMER_WIDTH);
        shimmerResources.maskRect.style.setProperty('--ert-inquiry-shimmer-travel', `${travel}px`);
    }

    return {
        previewGroup: panel,
        previewRunningNote: runningNote,
        previewHero: hero,
        previewMeta: meta,
        previewFooter: footer,
        previewClickTarget: clickTarget,
        previewRows,
        previewRowDefaultLabels,
        previewShimmerGroup
    };
}

export function createInquiryBriefingPanel(contentEl: HTMLElement): InquiryBriefingPanelRefs {
    const briefingPanelEl = contentEl.createDiv({ cls: 'ert-inquiry-briefing-panel ert-hidden ert-ui' });
    const header = briefingPanelEl.createDiv({ cls: 'ert-inquiry-briefing-header' });
    header.createDiv({ cls: 'ert-inquiry-briefing-title', text: 'Recent Inquiry Sessions' });
    const briefingListEl = briefingPanelEl.createDiv({ cls: 'ert-inquiry-briefing-list' });
    const briefingEmptyEl = briefingPanelEl.createDiv({ cls: 'ert-inquiry-briefing-empty', text: 'No recent inquiries yet.' });
    const briefingFooterEl = briefingPanelEl.createDiv({ cls: 'ert-inquiry-briefing-footer' });
    const briefingSaveButton = briefingFooterEl.createEl('button', {
        cls: 'ert-inquiry-briefing-save',
        text: 'Save current brief'
    });
    const briefingClearButton = briefingFooterEl.createEl('button', {
        cls: 'ert-inquiry-briefing-clear',
        text: 'Clear recent sessions'
    });
    const briefingResetButton = briefingFooterEl.createEl('button', {
        cls: 'ert-inquiry-briefing-reset',
        text: 'Reset Overrides to Settings'
    });
    addTooltipData(
        briefingResetButton,
        balanceTooltipText('Resets live corpus overrides only.'),
        'top'
    );
    const briefingPurgeButton = briefingFooterEl.createEl('button', {
        cls: 'ert-inquiry-briefing-purge',
        text: 'Purge action items'
    });
    addTooltipData(
        briefingPurgeButton,
        balanceTooltipText('Removes Inquiry-generated action items from scene frontmatter. User notes are preserved.'),
        'top'
    );
    briefingFooterEl.createDiv({
        cls: 'ert-inquiry-briefing-note',
        text: 'Does not delete briefs.'
    });

    return {
        briefingPanelEl,
        briefingListEl,
        briefingEmptyEl,
        briefingFooterEl,
        briefingSaveButton,
        briefingClearButton,
        briefingResetButton,
        briefingPurgeButton
    };
}

export function createInquiryEnginePanel(contentEl: HTMLElement): InquiryEnginePanelRefs {
    const enginePanelEl = contentEl.createDiv({ cls: 'ert-inquiry-engine-panel ert-hidden ert-ui' });
    const header = enginePanelEl.createDiv({ cls: 'ert-inquiry-engine-header' });
    header.createDiv({ cls: 'ert-inquiry-engine-title', text: 'AI Engine' });
    const enginePanelMetaEl = header.createDiv({ cls: 'ert-inquiry-engine-meta', text: '' });

    const enginePanelReadinessEl = enginePanelEl.createDiv({ cls: 'ert-inquiry-engine-readiness' });
    const enginePanelReadinessStatusEl = enginePanelReadinessEl.createDiv({
        cls: 'ert-inquiry-engine-readiness-status',
        text: 'Ready'
    });
    const enginePanelReadinessCorpusEl = enginePanelReadinessEl.createDiv({
        cls: 'ert-inquiry-engine-readiness-message',
        text: ''
    });
    const enginePanelReadinessMessageEl = enginePanelReadinessEl.createDiv({
        cls: 'ert-inquiry-engine-readiness-message',
        text: ''
    });
    const enginePanelReadinessScopeEl = enginePanelReadinessEl.createDiv({
        cls: 'ert-inquiry-engine-readiness-scope',
        text: ''
    });
    const enginePanelReadinessActionsEl = enginePanelReadinessEl.createDiv({
        cls: 'ert-inquiry-engine-readiness-actions'
    });

    const enginePanelGuardEl = enginePanelEl.createDiv({ cls: 'ert-inquiry-engine-guard ert-hidden' });
    const enginePanelGuardNoteEl = enginePanelGuardEl.createDiv({
        cls: 'ert-inquiry-engine-guard-note'
    });
    enginePanelGuardNoteEl.setText('Adjust settings to continue.');

    const enginePanelListEl = enginePanelEl.createDiv({ cls: 'ert-inquiry-engine-list' });

    return {
        enginePanelEl,
        enginePanelMetaEl,
        enginePanelReadinessEl,
        enginePanelReadinessStatusEl,
        enginePanelReadinessCorpusEl,
        enginePanelReadinessMessageEl,
        enginePanelReadinessScopeEl,
        enginePanelReadinessActionsEl,
        enginePanelGuardEl,
        enginePanelGuardNoteEl,
        enginePanelListEl
    };
}
