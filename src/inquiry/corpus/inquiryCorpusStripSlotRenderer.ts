import { addTooltipData } from '../../utils/tooltip';
import type { CorpusCcEntry, CorpusCcSlot, CorpusCcStats } from '../types/inquiryViewTypes';
import type { SynopsisQuality } from '../../sceneAnalysis/synopsisQuality';
import {
    isLowSubstanceTier,
    resolveCorpusSceneStatus,
    type CorpusSceneStatus,
    type CorpusSubstanceTier
} from '../services/corpusCellStatus';

export type InquiryCorpusThresholds = {
    emptyMax: number;
    sketchyMin: number;
    mediumMin: number;
    substantiveMin: number;
};

export type InquiryCorpusCcSlotViewModel = {
    fillHeight: number;
    fillY: number;
    tier: CorpusSubstanceTier;
    mode: string;
    sceneStatus?: CorpusSceneStatus;
    lowSubstance: boolean;
    tooltip: string;
    filePath?: string;
};

export function buildInquiryCorpusCcSlotViewModel(args: {
    entry: CorpusCcEntry;
    stats: CorpusCcStats;
    thresholds: InquiryCorpusThresholds;
    pageHeight: number;
}): InquiryCorpusCcSlotViewModel {
    const mode = args.entry.mode ?? 'excluded';
    const isSynopsis = mode === 'summary';
    const wordCount = isSynopsis ? args.stats.synopsisWords : args.stats.bodyWords;
    const tier = isSynopsis
        ? getInquiryCorpusSynopsisTier(args.stats.synopsisQuality, wordCount, args.thresholds)
        : getInquiryCorpusTier(wordCount, args.thresholds);
    const ratioBase = args.thresholds.substantiveMin > 0 ? (wordCount / args.thresholds.substantiveMin) : 0;
    const ratio = Math.min(Math.max(ratioBase, 0), 1);
    const fillHeight = Math.round(args.pageHeight * ratio);
    const sceneStatus = args.entry.className === 'scene'
        ? resolveCorpusSceneStatus({ status: args.stats.statusRaw, due: args.stats.due })
        : undefined;
    const lowSubstance = args.entry.className === 'scene' && isLowSubstanceTier(tier);

    return {
        fillHeight,
        fillY: args.pageHeight - fillHeight,
        tier,
        mode,
        sceneStatus,
        lowSubstance,
        tooltip: buildInquiryCorpusCcTooltip({
            entry: args.entry,
            stats: args.stats,
            thresholds: args.thresholds,
            tier,
            sceneStatus,
            isLowSubstance: lowSubstance,
            wordCount
        }),
        filePath: args.entry.filePath || undefined
    };
}

export function applyInquiryCorpusCcSlotViewModel(
    slot: CorpusCcSlot,
    viewModel: InquiryCorpusCcSlotViewModel
): void {
    slot.fill.setAttribute('height', String(viewModel.fillHeight));
    slot.fill.setAttribute('y', String(viewModel.fillY));

    slot.group.classList.remove(
        'is-tier-empty',
        'is-tier-sketchy',
        'is-tier-medium',
        'is-tier-substantive',
        'is-mode-excluded',
        'is-mode-summary',
        'is-mode-full',
        'is-status-todo',
        'is-status-working',
        'is-status-complete',
        'is-status-overdue',
        'is-low-substance'
    );
    slot.group.classList.add(`is-tier-${viewModel.tier}`);
    if (viewModel.mode === 'summary') {
        slot.group.classList.add('is-mode-summary');
    } else if (viewModel.mode === 'full') {
        slot.group.classList.add('is-mode-full');
    } else {
        slot.group.classList.add('is-mode-excluded');
    }

    if (viewModel.sceneStatus) {
        slot.group.classList.add(`is-status-${viewModel.sceneStatus}`);
    }
    if (viewModel.lowSubstance) {
        slot.group.classList.add('is-low-substance');
    }

    addTooltipData(slot.group, viewModel.tooltip, 'left');
    slot.group.setAttribute('data-rt-tip-offset-x', '-3');
    if (viewModel.filePath) {
        slot.group.classList.add('is-openable');
        slot.group.setAttribute('data-file-path', viewModel.filePath);
    } else {
        slot.group.classList.remove('is-openable');
        slot.group.removeAttribute('data-file-path');
    }
}

function getInquiryCorpusTier(
    wordCount: number,
    thresholds: InquiryCorpusThresholds
): CorpusSubstanceTier {
    if (wordCount < thresholds.emptyMax) return 'empty';
    if (wordCount < thresholds.sketchyMin) return 'sketchy';
    if (wordCount < thresholds.mediumMin) return 'sketchy';
    if (wordCount < thresholds.substantiveMin) return 'medium';
    return 'substantive';
}

function getInquiryCorpusSynopsisTier(
    quality: SynopsisQuality,
    wordCount: number,
    thresholds: InquiryCorpusThresholds
): CorpusSubstanceTier {
    if (quality === 'missing') return 'empty';
    if (quality === 'weak') return 'sketchy';
    return getInquiryCorpusTier(wordCount, thresholds);
}

function getInquiryCorpusTierLabel(tier: CorpusSubstanceTier): string {
    if (tier === 'empty') return 'Empty';
    if (tier === 'sketchy') return 'Sketchy';
    if (tier === 'medium') return 'Medium';
    return 'Substantive';
}

function getInquiryCorpusCcStatusIcon(status?: CorpusSceneStatus): string {
    if (status === 'todo') return '☐';
    if (status === 'working') return '□';
    if (status === 'complete') return '✓';
    if (status === 'overdue') return '⚠';
    return '';
}

function buildInquiryCorpusCcTooltip(args: {
    entry: CorpusCcEntry;
    stats: CorpusCcStats;
    thresholds: InquiryCorpusThresholds;
    tier: CorpusSubstanceTier;
    sceneStatus?: CorpusSceneStatus;
    isLowSubstance: boolean;
    wordCount: number;
}): string {
    const tooltipTitle = args.stats.title || args.entry.label;
    const classInitial = args.entry.className?.trim().charAt(0).toLowerCase() || '?';
    const conditions: string[] = [];

    if (args.sceneStatus) {
        const statusLabel = args.sceneStatus === 'overdue'
            ? 'Overdue'
            : `${args.sceneStatus.charAt(0).toUpperCase()}${args.sceneStatus.slice(1)}`;
        const statusIcon = getInquiryCorpusCcStatusIcon(args.sceneStatus);
        const statusBorderNote = args.sceneStatus === 'todo'
            ? ' (dashed border)'
            : args.sceneStatus === 'working'
                ? ''
                : args.sceneStatus === 'overdue'
                    ? ' (solid red border)'
                    : ' (solid border)';
        const statusIconText = statusIcon ? ` ${statusIcon}` : '';
        conditions.push(`Status: ${statusLabel}${statusIconText}${statusBorderNote}`);
    }

    if (args.entry.isTarget) {
        conditions.push('Target Scene: Active');
    }

    const tierLabel = getInquiryCorpusTierLabel(args.tier);
    const wordLabel = args.wordCount.toLocaleString();
    const isSynopsisCapable = args.entry.className === 'scene' || args.entry.className.startsWith('outline');
    if (args.entry.mode === 'excluded') {
        conditions.push('Mode: Exclude');
    }
    if (isSynopsisCapable) {
        if (args.entry.mode === 'summary') {
            conditions.push(`Tier: Summary ${tierLabel.toLowerCase()} (${wordLabel} words)`);
        } else if (args.entry.mode === 'full') {
            conditions.push(`Tier: Full Scene ${tierLabel.toLowerCase()} (${wordLabel} words)`);
        } else {
            conditions.push(`Tier: ${tierLabel} (${wordLabel} words)`);
        }
    } else {
        conditions.push(`Tier: ${tierLabel} (${wordLabel} words)`);
    }

    if (args.isLowSubstance) {
        conditions.push(`Low substance: marked with X (${args.thresholds.sketchyMin} words target)`);
    }

    return `${tooltipTitle} [${classInitial}]\n${conditions.map(item => `• ${item}`).join('\n')}`;
}
