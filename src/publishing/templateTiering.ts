import type { PandocLayoutTemplate, TemplateKind, TemplateTier, ValidationIssue } from '../types';

export const BASIC_MANUSCRIPT_LAYOUT_ID = 'bundled-fiction-classic-manuscript';
export const CONTEMPORARY_LITERARY_LAYOUT_ID = 'bundled-fiction-contemporary-literary';

export const TEMPLATE_ACCESS_FALLBACK_MESSAGE = 'Your selected PDF style requires Pro. Basic Manuscript will be used for this export.';
export const TEMPLATE_ACCESS_LOCKED_MESSAGE = 'Selected PDF style requires Pro and no Core fallback is available.';

export interface TemplateAccessResolution {
    requestedLayout?: PandocLayoutTemplate;
    effectiveLayout?: PandocLayoutTemplate;
    fallbackLayout?: PandocLayoutTemplate;
    tier?: TemplateTier;
    usedFallback: boolean;
    issues: ValidationIssue[];
}

export function getPandocLayoutTier(layout: Pick<PandocLayoutTemplate, 'id' | 'preset' | 'bundled' | 'tier'>): TemplateTier {
    if (layout.tier === 'free' || layout.tier === 'pro') return layout.tier;
    if (layout.preset === 'screenplay' || layout.preset === 'podcast') return 'pro';
    if (layout.bundled && (layout.id === BASIC_MANUSCRIPT_LAYOUT_ID || layout.id === CONTEMPORARY_LITERARY_LAYOUT_ID)) {
        return 'free';
    }
    return 'pro';
}

export function getPandocLayoutKind(layout: Pick<PandocLayoutTemplate, 'preset' | 'bundled' | 'origin' | 'templateKind'>): TemplateKind {
    if (layout.templateKind) return layout.templateKind;
    if (!layout.bundled || layout.origin === 'imported') return 'custom';
    if (layout.preset === 'screenplay') return 'screenplay';
    if (layout.preset === 'podcast') return 'podcast';
    return 'book';
}

export function getPandocLayoutRecommendedUse(layout: Pick<PandocLayoutTemplate, 'id' | 'recommendedUse'>): string | undefined {
    if (layout.recommendedUse?.trim()) return layout.recommendedUse.trim();
    if (layout.id === BASIC_MANUSCRIPT_LAYOUT_ID) return 'Standard Manuscript';
    if (layout.id === CONTEMPORARY_LITERARY_LAYOUT_ID) return 'Reading Draft';
    return undefined;
}

export function getPandocLayoutSortRank(layout: Pick<PandocLayoutTemplate, 'id' | 'preset' | 'name' | 'bundled' | 'tier'>): number {
    if (layout.id === BASIC_MANUSCRIPT_LAYOUT_ID) return 10;
    if (layout.id === CONTEMPORARY_LITERARY_LAYOUT_ID) return 20;
    if (layout.id === 'bundled-fiction-signature-literary') return 30;
    if (layout.id === 'bundled-fiction-modern-classic') return 40;
    if (layout.preset === 'screenplay') return 50;
    if (layout.preset === 'podcast') return 60;
    return getPandocLayoutTier(layout) === 'free' ? 70 : 80;
}

export function isPandocLayoutAccessible(layout: PandocLayoutTemplate, hasProAccess: boolean): boolean {
    return hasProAccess || getPandocLayoutTier(layout) === 'free';
}

export function findBasicManuscriptFallback(layouts: PandocLayoutTemplate[], preset: PandocLayoutTemplate['preset'] = 'novel'): PandocLayoutTemplate | undefined {
    if (preset !== 'novel') return undefined;
    return layouts.find(layout => layout.id === BASIC_MANUSCRIPT_LAYOUT_ID && getPandocLayoutTier(layout) === 'free')
        || layouts.find(layout => layout.preset === 'novel' && getPandocLayoutTier(layout) === 'free');
}

function buildIssue(level: ValidationIssue['level'], code: string, message: string, field?: string): ValidationIssue {
    return {
        level,
        code,
        message,
        scope: 'export',
        actionable: level !== 'info',
        ...(field ? { field } : {}),
    };
}

export function resolveTemplateAccess(params: {
    layouts: PandocLayoutTemplate[];
    selectedLayoutId?: string;
    manuscriptPreset?: PandocLayoutTemplate['preset'];
    hasProAccess: boolean;
}): TemplateAccessResolution {
    const requestedLayout = params.selectedLayoutId
        ? params.layouts.find(layout => layout.id === params.selectedLayoutId)
        : [...params.layouts]
            .filter(layout => layout.preset === (params.manuscriptPreset || 'novel'))
            .sort((a, b) => getPandocLayoutSortRank(a) - getPandocLayoutSortRank(b) || a.name.localeCompare(b.name))
            .find(layout => params.hasProAccess || getPandocLayoutTier(layout) === 'free')
            || params.layouts.find(layout => layout.preset === (params.manuscriptPreset || 'novel'));
    if (!requestedLayout) {
        return { usedFallback: false, issues: [] };
    }

    const tier = getPandocLayoutTier(requestedLayout);
    if (isPandocLayoutAccessible(requestedLayout, params.hasProAccess)) {
        return {
            requestedLayout,
            effectiveLayout: requestedLayout,
            tier,
            usedFallback: false,
            issues: [
                buildIssue(
                    'info',
                    tier === 'free' ? 'template_access_core_included' : 'template_access_requires_pro',
                    tier === 'free' ? 'Template is included in Core.' : 'Template requires Pro.',
                    requestedLayout.id
                ),
            ],
        };
    }

    const fallbackLayout = findBasicManuscriptFallback(params.layouts, requestedLayout.preset);
    if (fallbackLayout) {
        return {
            requestedLayout,
            effectiveLayout: fallbackLayout,
            fallbackLayout,
            tier,
            usedFallback: true,
            issues: [
                buildIssue('warning', 'template_access_fallback_to_basic', TEMPLATE_ACCESS_FALLBACK_MESSAGE, requestedLayout.id),
                buildIssue('info', 'template_access_core_included', 'Template is included in Core.', fallbackLayout.id),
            ],
        };
    }

    return {
        requestedLayout,
        tier,
        usedFallback: false,
        issues: [
            buildIssue('error', 'template_access_locked_no_fallback', TEMPLATE_ACCESS_LOCKED_MESSAGE, requestedLayout.id),
            buildIssue('info', 'template_access_requires_pro', 'Template requires Pro.', requestedLayout.id),
        ],
    };
}
