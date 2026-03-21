import type { SceneInclusion } from '../../types/settings';
import type { CorpusManifestEntry } from '../runner/types';
import type { InquiryFinding, InquiryResult, InquiryScope } from '../state';
import type { InquiryBriefModel, InquirySceneDossier } from '../types/inquiryViewTypes';

export const parseCorpusLabelNumber = (label?: string): number | null => {
    if (!label) return null;
    const match = label.trim().match(/^[A-Za-z](\d+)$/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};

export const stripNumericTitlePrefix = (value: string): string => {
    const cleaned = (value || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.replace(/^(?:scene\s*)?\d+\s*[-:–—.)]?\s*/i, '').trim();
};

export const sanitizeDossierText = (value?: string): string => {
    if (!value) return '';
    return value
        .replace(/\s+/g, ' ')
        .replace(/^(?:[SB]\d+|Scene\s+\d+)\s*[:\-–—]\s*/i, '')
        .trim();
};

export const normalizeSceneDossierSentence = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/[.!?…]$/.test(trimmed)) return trimmed;
    return `${trimmed}.`;
};

export const buildSceneDossierBodyLines = (finding: InquiryFinding): string[] => {
    const headline = sanitizeDossierText(finding.headline);
    const bullets = (finding.bullets || [])
        .map(entry => sanitizeDossierText(entry))
        .filter(Boolean)
        .slice(0, 2);
    const bodyLines: string[] = [];
    if (headline) {
        bodyLines.push(normalizeSceneDossierSentence(headline));
    }
    if (bullets.length) {
        bullets.forEach(entry => {
            bodyLines.push(normalizeSceneDossierSentence(entry));
        });
    } else if (!headline) {
        bodyLines.push('Finding text unavailable.');
    }
    return bodyLines;
};

export const buildSceneDossierHeader = (options: {
    label: string;
    itemDisplayLabel?: string;
    itemTitle: string;
    hoverLabel: string;
}): string => {
    const fallbackNumber = parseCorpusLabelNumber(options.label);
    const labelNumber = parseCorpusLabelNumber(options.itemDisplayLabel) ?? fallbackNumber;
    const cleanTitle = stripNumericTitlePrefix(options.itemTitle);
    if (labelNumber !== null && cleanTitle) {
        return `${labelNumber} ${cleanTitle}`;
    }
    if (labelNumber !== null) {
        return options.itemDisplayLabel?.toUpperCase().startsWith('B') ? `Book ${labelNumber}` : `Scene ${labelNumber}`;
    }
    return cleanTitle || options.hoverLabel || `Scene ${options.label}`;
};

export const resolveInquiryScopeIndicator = (result: InquiryResult): string | null => {
    const scopeLabel = result.scopeLabel?.trim();
    if (result.scope === 'saga') {
        return scopeLabel && scopeLabel.toLowerCase() !== 'saga' ? `Saga ${scopeLabel}` : 'Saga';
    }
    if (scopeLabel) {
        const lowered = scopeLabel.toLowerCase();
        if (/^s\d+/.test(lowered) || lowered.startsWith('scene')) {
            return `Scene ${scopeLabel}`;
        }
        if (/^c\d+/.test(lowered) || lowered.startsWith('chapter')) {
            return `Chapter ${scopeLabel}`;
        }
        return `Book ${scopeLabel}`;
    }
    return null;
};

export const formatBriefLabel = (value?: string | null): string => {
    if (!value) return 'Unknown';
    return value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
};

export const getSceneNoteSortOrder = (label: string): number => {
    const match = label.trim().match(/^[A-Za-z](\d+)$/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export const getPendingInquiryActions = (result: InquiryResult): string[] => {
    const legacy = result as unknown as {
        pendingActions?: unknown;
        followUps?: unknown;
        pendingInputs?: unknown;
    };
    const raw = legacy.pendingActions ?? legacy.followUps ?? legacy.pendingInputs;
    if (!Array.isArray(raw)) return [];
    return raw
        .map(item => String(item).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
};

export const normalizeInquiryHeadline = (headline: string): string =>
    (headline || 'Finding').replace(/\s+/g, ' ').trim();

export const formatInquiryBriefLink = (briefTitle: string, alias = 'Briefing'): string => {
    if (!alias) return `[[${briefTitle}]]`;
    return `[[${briefTitle}|${alias}]]`;
};

export const formatManifestClassLabel = (value: string): string => {
    if (!value) return 'Class';
    return value
        .replace(/[_-]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

export const formatManifestModeLabel = (
    mode: SceneInclusion | undefined,
    normalizeEvidenceMode: (mode?: SceneInclusion) => 'excluded' | 'summary' | 'full'
): string => {
    const normalized = normalizeEvidenceMode(mode);
    if (normalized === 'summary') return 'Summary';
    if (normalized === 'full') return 'Full Scene';
    return 'Exclude';
};

export const renderInquiryBrief = (brief: InquiryBriefModel): string => {
    const lines: string[] = [];

    lines.push('# Question', '', `**${brief.questionTitle}**`, brief.questionText);
    if (brief.scopeIndicator) {
        lines.push(`Scope: ${brief.scopeIndicator}`);
    }

    lines.push('', '## Summary Pills', brief.pills.map(pill => `[${pill}]`).join(' '));

    lines.push('', '## High-Level Conclusions', '### Flow', brief.flowSummary, '', '### Depth', brief.depthSummary);

    if (brief.selectionMode === 'focused' && brief.roleValidation === 'missing-target-roles') {
        lines.push(
            '',
            '_Warning: Incomplete Focused Analysis — target scenes were selected, but no target-specific findings were returned._'
        );
    }

    const targetFindings = brief.findings.filter(finding => finding.role === 'target');
    const contextFindings = brief.findings.filter(finding => finding.role === 'context');
    const renderFindingSection = (title: string, findings: InquiryBriefModel['findings']) => {
        lines.push('', `## ${title}`);
        if (!findings.length) {
            lines.push('None.');
            return;
        }
        findings.forEach(finding => {
            lines.push(
                '',
                `### ${finding.headline}`,
                `Clarity: ${finding.clarity} · Impact: ${finding.impact} · Confidence: ${finding.confidence} · Lens: ${finding.lens}`
            );
            if (finding.bullets.length) {
                finding.bullets.forEach(bullet => {
                    lines.push(`- ${bullet}`);
                });
            }
        });
    };

    renderFindingSection('Target Findings', targetFindings);
    renderFindingSection('Context Findings', contextFindings);

    if (brief.sources.length) {
        lines.push('', '## Sources', '');
        brief.sources.forEach(source => {
            const excerptPart = source.excerpt ? ` — *"${source.excerpt}"*` : '';
            const wikiPath = source.path?.replace(/\.md$/, '');
            const linkPart = (wikiPath && source.classLabel === 'Scene')
                ? ` — [[${wikiPath}|Open scene]]`
                : (source.url ? ` — [Source](${source.url})` : '');
            lines.push(`- **${source.title}** (${source.classLabel})${excerptPart}${linkPart}`);
        });
    }

    if (brief.sceneNotes.length) {
        lines.push('', '## Per-Scene / Per-Moment Notes');
        brief.sceneNotes.forEach(note => {
            const anchor = note.anchorId ? ` ^${note.anchorId}` : '';
            lines.push('', `### ${note.header}${anchor}`);
            note.entries.forEach(entry => {
                lines.push(
                    `- ${entry.headline}`,
                    ...entry.bullets.map(bullet => `- ${bullet}`),
                    `Impact: ${entry.impact} · Confidence: ${entry.confidence} · Lens: ${entry.lens}`
                );
            });
        });
    }

    if (brief.pendingActions.length) {
        lines.push('', '## Pending Author Actions');
        brief.pendingActions.forEach(action => {
            lines.push(`- ${action}`);
        });
    }

    lines.push('', brief.logTitle
        ? `[[${brief.logTitle}|View full Inquiry Log →]]`
        : 'View full Inquiry Log →');

    lines.push('');
    return lines.join('\n');
};

export const buildManifestTocLines = (options: {
    manifestEntries: CorpusManifestEntry[] | null | undefined;
    normalizeEvidenceMode: (mode?: SceneInclusion) => 'excluded' | 'summary' | 'full';
    resolveManifestEntryLabel: (entry: CorpusManifestEntry) => string;
}): string[] => {
    const entries = options.manifestEntries;
    if (!entries?.length) {
        return ['- none'];
    }

    const dedupedEntries: CorpusManifestEntry[] = [];
    const seen = new Set<string>();
    entries.forEach(entry => {
        const key = `${entry.class}::${entry.path}::${options.normalizeEvidenceMode(entry.mode)}`;
        if (seen.has(key)) return;
        seen.add(key);
        dedupedEntries.push(entry);
    });

    dedupedEntries.sort((a, b) => {
        if (a.class !== b.class) return a.class.localeCompare(b.class);
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    });

    return dedupedEntries.map(entry => {
        const classLabel = formatManifestClassLabel(entry.class);
        const modeLabel = formatManifestModeLabel(entry.mode, options.normalizeEvidenceMode);
        const itemLabel = options.resolveManifestEntryLabel(entry);
        return `- ${classLabel} · ${modeLabel} · ${itemLabel} (${entry.path})`;
    });
};
