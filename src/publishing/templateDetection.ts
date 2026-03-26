export type DetectedTemplateUsageContext = 'novel' | 'screenplay' | 'unknown';
export type DetectedTemplateStyleHint = 'manuscript' | 'book' | 'literary' | 'chaptered' | 'custom';
export type DetectedTemplateConfidence = 'low' | 'medium' | 'high';
export type DetectedTemplateMockPreviewKind = 'manuscript' | 'book' | 'literary' | 'chaptered' | 'generic';

export interface DetectedTemplateProfile {
    usageContext: DetectedTemplateUsageContext;
    styleHint: DetectedTemplateStyleHint;
    traits: string[];
    confidence: DetectedTemplateConfidence;
    mockPreviewKind: DetectedTemplateMockPreviewKind;
}

function includesAny(source: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(source));
}

export function detectTemplateProfile(texContent: string): DetectedTemplateProfile {
    const source = texContent || '';
    const normalized = source.toLowerCase();

    const hasBookClass = /\\documentclass(?:\[[^\]]*\])?\{book\}/i.test(source);
    const hasArticleClass = /\\documentclass(?:\[[^\]]*\])?\{article\}/i.test(source);
    const hasChapter = /\\chapter\b/i.test(source);
    const hasPart = /\\part\b/i.test(source);
    const hasSection = /\\section\b/i.test(source);
    const hasFancyhdr = /\\usepackage(?:\[[^\]]*\])?\{fancyhdr\}|\\fancyhead|\\fancyfoot/i.test(source);
    const hasTitlesec = /\\usepackage(?:\[[^\]]*\])?\{titlesec\}|\\titleformat|\\titlespacing/i.test(source);
    const hasGeometry = /\\usepackage(?:\[[^\]]*\])?\{geometry\}|\\geometry\b/i.test(source);
    const hasFontspec = /\\usepackage(?:\[[^\]]*\])?\{fontspec\}|\\setmainfont|\\newfontface/i.test(source);
    const hasSetspace = /\\usepackage(?:\[[^\]]*\])?\{setspace\}|\\onehalfspacing|\\doublespacing|\\setstretch\b/i.test(source);
    const hasHeaderFooterCommands = /\\pagestyle|\\thispagestyle|\\headrulewidth|\\footrulewidth/i.test(source);
    const hasTitlePageSignals = /\$if\(title\)\$|\$title\$|\\maketitle|titlepage/i.test(source);
    const screenplaySignals = [
        /\bint\.\b/i,
        /\bext\.\b/i,
        /\bscene heading\b/i,
        /\bslugline\b/i,
        /\bdialogue\b/i,
        /\bcharacter\b/i,
    ].filter((pattern) => pattern.test(source)).length;

    const traits: string[] = [];
    let usageContext: DetectedTemplateUsageContext = 'unknown';
    let styleHint: DetectedTemplateStyleHint = 'custom';
    let mockPreviewKind: DetectedTemplateMockPreviewKind = 'generic';
    let confidenceScore = 0;

    if (screenplaySignals >= 2) {
        usageContext = 'screenplay';
        traits.push('Scene headings detected', 'Dialogue-first formatting');
        confidenceScore += screenplaySignals >= 3 ? 3 : 2;
    } else if (hasBookClass || hasChapter || hasPart || hasSection) {
        usageContext = 'novel';
        confidenceScore += 1;
    }

    if (hasChapter) {
        styleHint = 'chaptered';
        mockPreviewKind = 'chaptered';
        traits.push('Chapter-based structure');
        confidenceScore += 2;
        if (hasPart) {
            traits.push('Part breaks detected');
            confidenceScore += 1;
        }
    } else if (hasBookClass && (hasFancyhdr || hasHeaderFooterCommands)) {
        styleHint = 'book';
        mockPreviewKind = 'book';
        traits.push('Running headers detected');
        confidenceScore += 2;
    } else if (hasTitlesec || (hasFontspec && hasFancyhdr)) {
        styleHint = 'literary';
        mockPreviewKind = 'literary';
        traits.push('Refined chapter styling');
        confidenceScore += 2;
    } else if ((hasArticleClass || !hasBookClass) && hasGeometry && hasSetspace && !hasChapter && !hasFancyhdr) {
        styleHint = 'manuscript';
        mockPreviewKind = 'manuscript';
        traits.push('Minimal manuscript formatting');
        confidenceScore += 2;
    }

    if (hasBookClass) {
        traits.push('Book-style page structure');
        confidenceScore += 1;
    }
    if (hasFontspec) {
        traits.push('Book-style typography');
        confidenceScore += 1;
    }
    if (hasGeometry && styleHint === 'manuscript') {
        traits.push('Wide page spacing');
    }
    if (hasTitlePageSignals) {
        traits.push('Front-page metadata detected');
        confidenceScore += 1;
    }

    if (styleHint === 'custom' && traits.length === 0) {
        traits.push('No strong structure detected', 'Custom formatting');
    } else if (styleHint === 'custom') {
        traits.push('Custom formatting');
    }

    if (usageContext === 'screenplay' && styleHint === 'custom') {
        mockPreviewKind = 'generic';
    } else if (usageContext === 'screenplay' && mockPreviewKind === 'generic') {
        mockPreviewKind = 'manuscript';
    }

    const dedupedTraits = [...new Set(traits)].slice(0, 5);
    const confidence: DetectedTemplateConfidence =
        confidenceScore >= 4 ? 'high' : confidenceScore >= 2 ? 'medium' : 'low';

    return {
        usageContext,
        styleHint,
        traits: dedupedTraits,
        confidence,
        mockPreviewKind,
    };
}
