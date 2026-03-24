import type { ValidationSummary } from '../types';

export type PublishingStageStatus = 'Ready' | 'Needs setup' | 'In progress' | 'Attention needed';
export type PublishingStageTone = 'success' | 'warning' | 'neutral';
export type PublishingStageId = 'book-details' | 'book-pages' | 'pdf-style' | 'export-check';

export interface PublishingStageModel {
    id: PublishingStageId;
    title: string;
    description: string;
    statusLabel: PublishingStageStatus;
    tone: PublishingStageTone;
    detail: string;
    actionLabel: string;
}

export interface PublishingStageSummary {
    state: ValidationSummary['state'];
    topMessage?: string;
}

export interface PublishingLayoutSummary extends PublishingStageSummary {
    validCount: number;
    totalCount: number;
}

export interface PublishingProgressInputs {
    hasBookMeta: boolean;
    bookMetaSummary: PublishingStageSummary;
    matterSummary: PublishingStageSummary;
    matterCount: number;
    layoutSummary: PublishingLayoutSummary;
    pandocPathValid: boolean;
}

function mapSummaryState(summary: PublishingStageSummary, missingLabel: PublishingStageStatus): PublishingStageModel['statusLabel'] {
    if (summary.state === 'blocked') return 'Attention needed';
    if (summary.state === 'warning') return 'In progress';
    return missingLabel;
}

function getTone(statusLabel: PublishingStageStatus): PublishingStageTone {
    if (statusLabel === 'Ready') return 'success';
    if (statusLabel === 'In progress') return 'neutral';
    return 'warning';
}

export function buildPublishingProgressStages(inputs: PublishingProgressInputs): PublishingStageModel[] {
    const bookDetailsStatus: PublishingStageStatus = !inputs.hasBookMeta
        ? 'Needs setup'
        : inputs.bookMetaSummary.state === 'blocked'
            ? 'Attention needed'
            : inputs.bookMetaSummary.state === 'warning'
                ? 'In progress'
                : 'Ready';

    const bookPagesStatus: PublishingStageStatus = inputs.matterCount === 0
        ? 'Needs setup'
        : inputs.matterSummary.state === 'blocked'
            ? 'Attention needed'
            : inputs.matterSummary.state === 'warning'
                ? 'In progress'
                : 'Ready';

    const pdfStyleStatus: PublishingStageStatus = inputs.layoutSummary.totalCount === 0
        ? 'Needs setup'
        : inputs.layoutSummary.validCount === 0 || inputs.layoutSummary.state === 'blocked'
            ? 'Attention needed'
            : inputs.layoutSummary.state === 'warning' || inputs.layoutSummary.validCount < inputs.layoutSummary.totalCount
                ? 'In progress'
                : 'Ready';

    const exportCheckReady = inputs.pandocPathValid
        && inputs.hasBookMeta
        && inputs.matterCount > 0
        && inputs.layoutSummary.validCount > 0
        && inputs.bookMetaSummary.state !== 'blocked'
        && inputs.matterSummary.state !== 'blocked'
        && inputs.layoutSummary.state !== 'blocked';

    const exportCheckStatus: PublishingStageStatus = exportCheckReady
        ? 'Ready'
        : !inputs.pandocPathValid
            ? 'Attention needed'
            : !inputs.hasBookMeta || inputs.matterCount === 0 || inputs.layoutSummary.totalCount === 0
                ? 'Needs setup'
                : inputs.bookMetaSummary.state === 'blocked' || inputs.matterSummary.state === 'blocked' || inputs.layoutSummary.state === 'blocked'
                    ? 'Attention needed'
                    : 'In progress';

    return [
        {
            id: 'book-details',
            title: 'Book Details',
            description: 'Create or review the file that holds the book’s title, author, and publishing info.',
            statusLabel: bookDetailsStatus,
            tone: getTone(bookDetailsStatus),
            detail: !inputs.hasBookMeta
                ? 'Create the book details file first.'
                : inputs.bookMetaSummary.topMessage || 'Your publishing details are in place.',
            actionLabel: !inputs.hasBookMeta ? 'Create details' : 'Open details',
        },
        {
            id: 'book-pages',
            title: 'Book Pages',
            description: 'Set up the pages that appear before and after your manuscript.',
            statusLabel: bookPagesStatus,
            tone: getTone(bookPagesStatus),
            detail: inputs.matterCount === 0
                ? 'Add the pages that frame the manuscript and support the export.'
                : inputs.matterSummary.topMessage || 'Your book pages are ready to review.',
            actionLabel: inputs.matterCount === 0 ? 'Set up pages' : 'Review pages',
        },
        {
            id: 'pdf-style',
            title: 'PDF Style',
            description: 'Choose the layout that shapes your exported PDF.',
            statusLabel: pdfStyleStatus,
            tone: getTone(pdfStyleStatus),
            detail: inputs.layoutSummary.totalCount === 0
                ? 'Choose a PDF style before exporting.'
                : inputs.layoutSummary.topMessage || `${inputs.layoutSummary.validCount} of ${inputs.layoutSummary.totalCount} styles are ready.`,
            actionLabel: inputs.layoutSummary.totalCount === 0 ? 'Choose style' : 'Review styles',
        },
        {
            id: 'export-check',
            title: 'Export Check',
            description: 'Confirm everything is ready before you export.',
            statusLabel: exportCheckStatus,
            tone: getTone(exportCheckStatus),
            detail: exportCheckReady
                ? 'You’re ready to export.'
                : !inputs.pandocPathValid
                    ? 'Set up your export tools before starting the export.'
                    : inputs.bookMetaSummary.topMessage || inputs.matterSummary.topMessage || inputs.layoutSummary.topMessage || 'Finish the remaining setup steps before exporting.',
            actionLabel: exportCheckReady ? 'Review export' : 'Check export',
        },
    ];
}
