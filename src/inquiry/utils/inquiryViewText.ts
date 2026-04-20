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

export const stripInquiryReferenceArtifacts = (value?: string): string => {
    if (!value) return '';
    return String(value)
        .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
            const fallback = String(target || '').split('/').pop() || '';
            return String(alias || fallback).trim();
        })
        .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
        .replace(/\(\s*#\^[^)]+\)/gi, '')
        .replace(/\(\s*scn_[a-z0-9]+\s*\)/gi, '')
        .replace(/\bscn_[a-z0-9]+\b/gi, '')
        .replace(/\s+\^[-\w]+\b/g, '')
        .replace(/\s+([,.;:!?…])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
};

export const replaceInquiryReferenceTokens = (
    value: string | undefined,
    labelsByRef?: ReadonlyMap<string, string>
): string => {
    if (!value) return '';
    if (!labelsByRef || labelsByRef.size === 0) return String(value);
    const resolve = (raw: string): string | null => {
        const key = raw.trim().toLowerCase();
        return labelsByRef.get(key) ?? null;
    };

    const replaceCompactSequence = (text: string): string => text
        .replace(/\b([sb])(\d+)\s*([/-])\s*\1?(\d+)\b/gi, (match, prefix: string, leftNum: string, separator: string, rightNum: string) => {
            const left = resolve(`${prefix}${leftNum}`);
            const right = resolve(`${prefix}${rightNum}`);
            if (!left && !right) return match;
            if (left && right) return `${left}${separator === '/' ? ' / ' : ' - '}${right}`;
            return left ?? right ?? match;
        })
        .replace(/\b([sb]\d+)\s*\/\s*([sb]\d+)\b/gi, (match, leftRaw: string, rightRaw: string) => {
            const left = resolve(leftRaw);
            const right = resolve(rightRaw);
            if (!left && !right) return match;
            if (left && right) return `${left} / ${right}`;
            return left ?? right ?? match;
        })
        .replace(/\b([sb]\d+)\s*-\s*([sb]\d+)\b/gi, (match, leftRaw: string, rightRaw: string) => {
            const left = resolve(leftRaw);
            const right = resolve(rightRaw);
            if (!left && !right) return match;
            if (left && right) return `${left} - ${right}`;
            return left ?? right ?? match;
        })
        .replace(/\b[sb]\d+\b/gi, (match) => resolve(match) ?? match);

    return replaceCompactSequence(String(value))
        .replace(/\b\d+\s*\(\s*(scn_[a-z0-9]+)\s*\)/gi, (match, refId: string) => resolve(refId) ?? match)
        .replace(/\b(scn_[a-z0-9]+)\b\s*\(([^)]+)\)/gi, (match, refId: string) => resolve(refId) ?? match)
        .replace(/\bscn_[a-z0-9]+\b/gi, (match) => resolve(match) ?? match)
        .replace(/\s+([,.;:!?…])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
};

export const sanitizeDossierText = (value?: string): string => {
    return stripInquiryReferenceArtifacts(value)
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
    stripInquiryReferenceArtifacts(headline || 'Finding') || 'Finding';

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
    const renderRawResponse = (raw: string): void => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const fence = trimmed.includes('```') ? '~~~' : '```';
        const safeBody = fence === '~~~' ? trimmed.replace(/~~~/g, '~~\\~') : trimmed;
        lines.push('', '## Provider Response (Unparsed)', `${fence}text`, safeBody, fence);
    };

    lines.push('# Question', '', `**${brief.questionTitle}**`, brief.questionText);
    if (brief.scopeIndicator) {
        lines.push(`Scope: ${brief.scopeIndicator}`);
    }

    lines.push('', '## Summary Pills', brief.pills.map(pill => `[${pill}]`).join(' '));

    if (brief.evidenceCompromised) {
        lines.push(
            '',
            '> **⚠ Evidence compromised**',
            '> No verified evidence is available for this run. Every AI citation could not be matched to a scene in your manuscript. Treat the conclusions with caution — the evidence base is not trustworthy.'
        );
    } else if (brief.citationIntegrityWarnings && brief.citationIntegrityWarnings.length) {
        lines.push(
            '',
            '> **⚠ Citation integrity warning**',
            '> Some AI citations could not be matched to your manuscript. These citations are unverified and should not be trusted as evidence.'
        );
    }

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
            lines.push('', `### ${finding.headline}`);
            if (finding.lens) {
                lines.push(`Lens: ${finding.lens}`);
            }
            if (finding.bullets.length) {
                finding.bullets.forEach(bullet => {
                    lines.push(`- ${bullet}`);
                });
            }
        });
    };

    renderFindingSection('Target Findings', targetFindings);
    renderFindingSection('Context Findings', contextFindings);

    if (brief.unverifiedFindings && brief.unverifiedFindings.length) {
        lines.push(
            '',
            '## Unverified AI Citations',
            '_The AI returned these findings but the citations could not be matched to your manuscript. They are shown for transparency and should **not** be trusted as evidence._',
            ''
        );
        brief.unverifiedFindings.forEach(item => {
            lines.push(`### ${item.headline}`);
            const rawParts: string[] = [];
            if (item.rawRefId) rawParts.push(`ref_id=${item.rawRefId}`);
            if (item.rawRefLabel) rawParts.push(`ref_label=${item.rawRefLabel}`);
            if (item.rawRefPath) rawParts.push(`ref_path=${item.rawRefPath}`);
            if (rawParts.length) {
                lines.push(`Cited: ${rawParts.join(' · ')}`);
            }
            lines.push(`Lens: ${item.lens}`);
            if (item.bullets.length) {
                item.bullets.forEach(bullet => {
                    lines.push(`- ${bullet}`);
                });
            }
            lines.push(`_${item.warning}_`, '');
        });
    }

    if (brief.sources.length) {
        const totalCitations = brief.sources.reduce((sum, s) => sum + (s.citationCount ?? 0), 0);
        const headerSuffix = totalCitations > 0 ? ` (${totalCitations} citations)` : '';
        lines.push('', `## Sources${headerSuffix}`, '');
        brief.sources.forEach(source => {
            const countPart = (source.citationCount ?? 0) > 1 ? ` · ${source.citationCount} citations` : '';
            const excerptPart = source.excerpt ? ` — *"${source.excerpt}"*` : '';
            const wikiPath = source.path?.replace(/\.md$/, '');
            const linkPart = (wikiPath && source.classLabel === 'Scene')
                ? ` — [[${wikiPath}|Open scene]]`
                : (source.url ? ` — [Source](${source.url})` : '');
            lines.push(`- **${source.title}** (${source.classLabel}${countPart})${excerptPart}${linkPart}`);
        });
    }

    if (brief.sceneNotes.length) {
        lines.push('', '## Per-Scene / Per-Moment Notes');
        brief.sceneNotes.forEach(note => {
            lines.push('', `### ${note.header}`);
            if (note.anchorId) {
                lines.push(`^${note.anchorId}`);
            }
            note.entries.forEach(entry => {
                lines.push(
                    `- ${entry.headline}`,
                    ...entry.bullets.map(bullet => `- ${bullet}`)
                );
                if (entry.lens) {
                    lines.push(`Lens: ${entry.lens}`);
                }
            });
        });
    }

    if (brief.pendingActions.length) {
        lines.push('', '## Pending Author Actions');
        brief.pendingActions.forEach(action => {
            const prefix = action.targetLabel ? `${action.targetLabel} — ` : '';
            lines.push(`- ${prefix}${action.text}`);
        });
    } else if (brief.findings.length) {
        lines.push('', '## Pending Author Actions', 'No pending edit actions were generated for this run.');
    }

    if (brief.rawResponse) {
        renderRawResponse(brief.rawResponse);
    }

    if (brief.refNormalized) {
        lines.push('', '_\\* Some scene references were normalized from non-standard formats._');
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
