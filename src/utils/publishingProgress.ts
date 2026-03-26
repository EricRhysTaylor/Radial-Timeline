import type { ValidationSummary } from '../types';

export type PublishingStageStatus = 'Ready' | 'Needs setup' | 'Needs attention' | 'Blocked';
export type PublishingStageStatusKey = 'needs-setup' | 'attention' | 'blocked' | 'ready';
export type PublishingStageId = 'book-details' | 'book-pages' | 'pdf-style' | 'export-check';

export interface PublishingStageModel {
    id: PublishingStageId;
    title: string;
    description: string;
    statusLabel: PublishingStageStatus;
    statusKey: PublishingStageStatusKey;
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

function getStatusKey(statusLabel: PublishingStageStatus): PublishingStageStatusKey {
    if (statusLabel === 'Ready') return 'ready';
    if (statusLabel === 'Blocked') return 'blocked';
    if (statusLabel === 'Needs attention') return 'attention';
    return 'needs-setup';
}

export function buildPublishingProgressStages(inputs: PublishingProgressInputs): PublishingStageModel[] {
    const bookDetailsStatus: PublishingStageStatus = !inputs.hasBookMeta
        ? 'Needs setup'
        : inputs.bookMetaSummary.state === 'blocked'
            ? 'Blocked'
            : inputs.bookMetaSummary.state === 'warning'
                ? 'Needs attention'
                : 'Ready';

    const bookPagesStatus: PublishingStageStatus = inputs.matterCount === 0
        ? 'Needs setup'
        : inputs.matterSummary.state === 'blocked'
            ? 'Blocked'
            : inputs.matterSummary.state === 'warning'
                ? 'Needs attention'
                : 'Ready';

    const pdfStyleStatus: PublishingStageStatus = inputs.layoutSummary.totalCount === 0
        ? 'Needs setup'
        : inputs.layoutSummary.validCount === 0 || inputs.layoutSummary.state === 'blocked'
            ? 'Blocked'
            : inputs.layoutSummary.state === 'warning' || inputs.layoutSummary.validCount < inputs.layoutSummary.totalCount
                ? 'Needs attention'
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
            ? 'Blocked'
            : !inputs.hasBookMeta || inputs.matterCount === 0 || inputs.layoutSummary.totalCount === 0
                ? 'Needs setup'
                : inputs.bookMetaSummary.state === 'blocked' || inputs.matterSummary.state === 'blocked' || inputs.layoutSummary.state === 'blocked'
                    ? 'Blocked'
                    : 'Needs attention';

    return [
        {
            id: 'book-details',
            title: 'Book Details',
            description: 'Title, author, and publishing info.',
            statusLabel: bookDetailsStatus,
            statusKey: getStatusKey(bookDetailsStatus),
            detail: !inputs.hasBookMeta
                ? 'Create Book Details first.'
                : inputs.bookMetaSummary.topMessage || 'Your details are in place.',
            actionLabel: !inputs.hasBookMeta ? 'Create details' : 'Open details',
        },
        {
            id: 'book-pages',
            title: 'Book Pages',
            description: 'Pages before and after the manuscript.',
            statusLabel: bookPagesStatus,
            statusKey: getStatusKey(bookPagesStatus),
            detail: inputs.matterCount === 0
                ? 'Add the pages around the manuscript.'
                : inputs.matterSummary.topMessage || 'Your book pages are ready.',
            actionLabel: inputs.matterCount === 0 ? 'Set up pages' : 'Review pages',
        },
        {
            id: 'pdf-style',
            title: 'PDF Style',
            description: 'Choose the layout for your PDF.',
            statusLabel: pdfStyleStatus,
            statusKey: getStatusKey(pdfStyleStatus),
            detail: inputs.layoutSummary.totalCount === 0
                ? 'Choose a PDF style before exporting.'
                : inputs.layoutSummary.topMessage || `${inputs.layoutSummary.validCount} of ${inputs.layoutSummary.totalCount} styles are ready.`,
            actionLabel: inputs.layoutSummary.totalCount === 0 ? 'Choose style' : 'Review styles',
        },
        {
            id: 'export-check',
            title: 'Export Check',
            description: 'Make sure export is ready.',
            statusLabel: exportCheckStatus,
            statusKey: getStatusKey(exportCheckStatus),
            detail: exportCheckReady
                ? 'Open manuscript exports.'
                : !inputs.pandocPathValid
                    ? 'Set up your export tools first.'
                    : inputs.bookMetaSummary.topMessage || inputs.matterSummary.topMessage || inputs.layoutSummary.topMessage || 'Finish the remaining setup steps.',
            actionLabel: exportCheckReady ? 'Review export' : 'Check export',
        },
    ];
}
