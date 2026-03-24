import type {
    OutputIntent,
    PandocLayoutTemplate,
    ProfileOrigin,
    TemplateAsset,
    TemplateCapability,
    TemplateProfile,
    TemplateSource,
    UsageContext,
} from '../types';

const SUPPORTED_MATTER_ROLES = [
    'title-page',
    'copyright',
    'dedication',
    'epigraph',
    'acknowledgments',
    'about-author',
    'foreword',
    'afterword',
    'appendix',
];

const CAPABILITY_LABELS: Record<TemplateCapability['key'], string> = {
    sceneHeadingMode: 'Scene heading controls',
    actEpigraphs: 'Act epigraphs',
    modernClassicStructure: 'Modern classic structure',
    semanticMatter: 'Semantic matter support',
};

export interface AdaptedPublishingModel {
    assets: TemplateAsset[];
    profiles: TemplateProfile[];
}

function getTemplateSource(layout: PandocLayoutTemplate): TemplateSource {
    if (layout.bundled) return 'bundled';
    if (/^\s*https?:\/\//i.test(layout.path)) return 'imported';
    return 'vault';
}

function getProfileOrigin(layout: PandocLayoutTemplate): ProfileOrigin {
    if (layout.origin) return layout.origin;
    return layout.bundled ? 'built-in' : 'legacy-custom';
}

function getOutputIntent(layout: PandocLayoutTemplate): OutputIntent {
    if (layout.preset === 'screenplay') return 'screenplay-pdf';
    if (layout.preset === 'podcast') return 'podcast-script';

    const fingerprint = `${layout.id} ${layout.name} ${layout.description || ''}`.toLowerCase();
    if (fingerprint.includes('basic manuscript') || fingerprint.includes('classic manuscript')) {
        return 'submission-manuscript';
    }
    return 'print-book';
}

function getStyleKey(layout: PandocLayoutTemplate): string {
    const fingerprint = `${layout.id} ${layout.name} ${layout.path}`.toLowerCase();
    if (fingerprint.includes('signature') && fingerprint.includes('literary')) return 'signature-literary';
    if (fingerprint.includes('modern') && fingerprint.includes('classic')) return 'modern-classic';
    if (fingerprint.includes('contemporary') && fingerprint.includes('literary')) return 'contemporary-literary';
    if (fingerprint.includes('basic manuscript') || fingerprint.includes('classic manuscript')) return 'basic-manuscript';
    if (layout.preset === 'screenplay') return 'screenplay-standard';
    if (layout.preset === 'podcast') return 'podcast-script';
    return `${layout.preset}-custom`;
}

function getSummary(layout: PandocLayoutTemplate, outputIntent: OutputIntent): string {
    if (layout.description?.trim()) return layout.description.trim();

    switch (outputIntent) {
        case 'screenplay-pdf':
            return 'Production-style screenplay PDF layout for dialogue-forward scripts.';
        case 'podcast-script':
            return 'Readable script layout for host narration and audio production notes.';
        case 'submission-manuscript':
            return 'Traditional manuscript formatting for agent, editor, and workshop submission.';
        case 'print-book':
        default:
            return 'Book-style interior layout for polished reading PDFs and print proofs.';
    }
}

function getCapabilities(layout: PandocLayoutTemplate): TemplateCapability[] {
    const capabilities: TemplateCapability[] = [];
    const add = (key: TemplateCapability['key']) => {
        if (!capabilities.some(item => item.key === key)) {
            capabilities.push({ key, label: CAPABILITY_LABELS[key] });
        }
    };

    if (layout.hasSceneOpenerHeadingOptions) add('sceneHeadingMode');
    if (layout.hasEpigraphs) add('actEpigraphs');
    if (layout.usesModernClassicStructure) add('modernClassicStructure');
    if (layout.preset === 'novel') add('semanticMatter');

    return capabilities;
}

function getRecommendedBookMetaFields(layout: PandocLayoutTemplate, capabilities: TemplateCapability[]): string[] {
    const fields = ['Book.title', 'Book.author'];
    if (capabilities.some(item => item.key === 'semanticMatter')) {
        fields.push('Rights.year', 'Rights.copyright_holder', 'Publisher.name', 'Identifiers.isbn_paperback');
    }
    return fields;
}

function getRequiredBookMetaFields(layout: PandocLayoutTemplate, capabilities: TemplateCapability[]): string[] {
    if (layout.preset !== 'novel') return [];
    if (!capabilities.some(item => item.key === 'semanticMatter')) return [];
    return ['Book.title', 'Book.author'];
}

function getSupportedMatterRoles(layout: PandocLayoutTemplate): string[] {
    if (layout.preset !== 'novel') return [];
    return [...SUPPORTED_MATTER_ROLES];
}

function deriveProfileStatus(layout: PandocLayoutTemplate): TemplateProfile['status'] {
    const trimmedPath = layout.path?.trim() || '';
    if (layout.draft) return 'draft';
    if (!trimmedPath) return 'invalid';
    return 'ready';
}

export function adaptPandocLayoutToTemplateAsset(layout: PandocLayoutTemplate): TemplateAsset {
    return {
        id: `${layout.id}::asset`,
        source: getTemplateSource(layout),
        engine: 'pandoc-latex',
        path: layout.path,
        bundled: layout.bundled,
        installed: !!layout.path?.trim(),
    };
}

export function adaptPandocLayoutToTemplateProfile(layout: PandocLayoutTemplate): TemplateProfile {
    const outputIntent = getOutputIntent(layout);
    const capabilities = getCapabilities(layout);
    return {
        id: layout.id,
        assetId: `${layout.id}::asset`,
        legacyLayoutId: layout.id,
        origin: getProfileOrigin(layout),
        name: layout.name,
        description: layout.description?.trim() || getSummary(layout, outputIntent),
        usageContexts: [layout.preset as UsageContext],
        outputIntent,
        styleKey: getStyleKey(layout),
        summary: getSummary(layout, outputIntent),
        guidance: layout.preset === 'novel'
            ? 'Pairs with the current Pandoc + LaTeX pipeline and the existing matter workflow.'
            : 'Uses the current Pandoc + LaTeX pipeline without changing the export engine.',
        previewMode: 'static',
        capabilities,
        requiredBookMetaFields: getRequiredBookMetaFields(layout, capabilities),
        recommendedBookMetaFields: getRecommendedBookMetaFields(layout, capabilities),
        supportedMatterRoles: getSupportedMatterRoles(layout),
        status: deriveProfileStatus(layout),
    };
}

export function adaptPandocLayoutsToPublishingModel(layouts: PandocLayoutTemplate[] | undefined): AdaptedPublishingModel {
    const normalized = Array.isArray(layouts) ? layouts : [];
    return {
        assets: normalized.map(adaptPandocLayoutToTemplateAsset),
        profiles: normalized.map(adaptPandocLayoutToTemplateProfile),
    };
}
