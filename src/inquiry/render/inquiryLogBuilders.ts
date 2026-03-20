import type { InquiryEstimateSnapshot } from '../services/inquiryEstimateSnapshot';
import type { CorpusManifest, CorpusManifestEntry, InquiryRunTrace } from '../runner/types';
import type { InquiryResult, InquiryFinding, InquiryZone } from '../state';
import type { InquiryMaterialMode } from '../../types/settings';
import type { TokenTier } from '../types';
import { extractTokenUsage, formatAiLogContent, formatDuration, formatUsageCostBreakdownLines, sanitizeLogPayload, type AiLogStatus } from '../../ai/log';
import { buildManifestTocLines, formatBriefLabel, formatManifestClassLabel } from '../utils/inquiryViewText';
import type { EngineProvider } from '../types/inquiryViewTypes';

type InquiryLogCostEstimateInput = {
    executionInputTokens: number;
    expectedOutputTokens: number;
    expectedPasses: number;
    cacheReuseRatio?: number;
};

export type InquiryLogBuilderDependencies = {
    getQuestionLabel: (result: InquiryResult) => string;
    getBriefModelLabel: (result: InquiryResult) => string | null;
    getInquiryProviderLabel: (provider: EngineProvider) => string;
    getFiniteTokenEstimateInput: (trace: InquiryRunTrace, result: InquiryResult) => number | null;
    getTokenTier: (inputTokens: number) => TokenTier;
    buildInquiryLogCostEstimateInput: (trace: InquiryRunTrace, result: InquiryResult) => InquiryLogCostEstimateInput | null;
    formatTokenUsageVisibility: (tokenUsageKnown?: boolean, tokenUsageScope?: InquiryResult['tokenUsageScope']) => string;
    isErrorResult: (result: InquiryResult) => boolean;
    isDegradedResult: (result: InquiryResult) => boolean;
    formatMetricDisplay: (value: number) => string;
    resolveManifestEntryLabel: (entry: CorpusManifestEntry) => string;
    normalizeEvidenceMode: (mode?: InquiryMaterialMode) => 'none' | 'summary' | 'full';
    normalizeLegacyResult: (result: InquiryResult) => InquiryResult;
    resolveInquiryBriefZoneLabel: (result: InquiryResult) => string;
    resolveInquiryBriefLensLabel: (result: InquiryResult, zoneLabel: string) => string;
    formatInquiryIdFromResult: (result: InquiryResult) => string | null;
    pluginVersion: string;
    estimateSnapshot: InquiryEstimateSnapshot | null;
};

export function buildInquiryLogContent(args: {
    result: InquiryResult;
    trace: InquiryRunTrace;
    manifest: CorpusManifest | null;
    deps: InquiryLogBuilderDependencies;
    logTitle?: string;
    contentLogWritten?: boolean;
}): string {
    const { result, trace, manifest, deps } = args;
    const title = args.logTitle ?? 'Inquiry Log';
    const isSimulated = result.aiReason === 'simulated' || result.aiReason === 'stub';
    const questionLabel = deps.getQuestionLabel(result);
    const scopeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
    const target = result.focusId || (result.scope === 'saga' ? 'Σ' : '?');
    const providerRaw = result.aiProvider ? result.aiProvider.trim() : '';
    const providerLabel = isSimulated
        ? 'Simulation'
        : providerRaw
            ? (['anthropic', 'gemini', 'openai', 'local'].includes(providerRaw)
                ? deps.getInquiryProviderLabel(providerRaw as EngineProvider)
                : providerRaw)
            : 'Unknown';
    const modelLabel = isSimulated
        ? 'No provider call'
        : deps.getBriefModelLabel(result)
            || result.aiModelResolved
            || result.aiModelRequested
            || 'unknown';
    const durationMs = typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)
        ? result.roundTripMs
        : null;
    const tokenEstimateInput = deps.getFiniteTokenEstimateInput(trace, result);
    const tokenTier = typeof tokenEstimateInput === 'number'
        ? deps.getTokenTier(tokenEstimateInput)
        : (result.tokenEstimateTier || null);
    const overrideSummary = result.corpusOverridesActive ? result.corpusOverrideSummary : null;
    const overrideLabel = overrideSummary
        ? `On (classes: ${overrideSummary.classCount}, items: ${overrideSummary.itemCount})`
        : (result.corpusOverridesActive ? 'On' : 'None');

    let status: AiLogStatus = 'success';
    const degraded = deps.isDegradedResult(result);
    if (isSimulated) {
        status = 'simulated';
    } else if (deps.isErrorResult(result)) {
        status = 'error';
    }
    const statusLabel = degraded
        ? 'Degraded'
        : (status === 'success' ? 'Success' : status === 'error' ? 'Failed' : 'Simulated');
    const statusDetail = result.aiReason
        ? ` (${result.aiReason})`
        : (result.aiStatus && result.aiStatus !== 'success' && result.aiStatus !== 'degraded' ? ` (${result.aiStatus})` : '');

    const formatTokenCount = (value?: number | null, approximate = false): string => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
        const prefix = approximate ? '~' : '';
        if (value >= 1000) {
            const scaled = value / 1000;
            const fixed = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
            return `${prefix}${fixed.replace(/\.0$/, '')}k`;
        }
        return `${prefix}${Math.round(value)}`;
    };

    const usage = trace.usage
        ?? (trace.response?.responseData && result.aiProvider
            ? extractTokenUsage(result.aiProvider, trace.response.responseData)
            : null);
    const logCostEstimateInput = !isSimulated
        ? deps.buildInquiryLogCostEstimateInput(trace, result)
        : null;
    const usageKnown = typeof trace.tokenUsageKnown === 'boolean'
        ? trace.tokenUsageKnown
        : !!usage;
    const usageVisibility = deps.formatTokenUsageVisibility(usageKnown, trace.tokenUsageScope ?? result.tokenUsageScope);
    const formatUsageMetric = (value?: number | null): string => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
        return formatTokenCount(value);
    };
    const usageDetailParts = usage
        ? [
            typeof usage.rawInputTokens === 'number' ? `raw input=${formatTokenCount(usage.rawInputTokens)}` : null,
            typeof usage.cacheReadInputTokens === 'number' ? `cache read=${formatTokenCount(usage.cacheReadInputTokens)}` : null,
            typeof usage.cacheCreationInputTokens === 'number' ? `cache write=${formatTokenCount(usage.cacheCreationInputTokens)}` : null
        ].filter((value): value is string => !!value)
        : [];
    const usageText = usage
        ? `input=${formatUsageMetric(usage.inputTokens)}, output=${formatUsageMetric(usage.outputTokens)}, total=${formatUsageMetric(usage.totalTokens)}`
        : 'not available';
    const cacheReuseLabel = trace.cacheReuseState
        ? trace.cacheReuseState.replace(/_/g, ' ')
        : null;
    const cachePrefixLabel = typeof trace.cachedStableRatio === 'number' && Number.isFinite(trace.cachedStableRatio)
        ? `${Math.round(trace.cachedStableRatio * 100)}%`
        : null;
    const cacheTokensLabel = typeof trace.cachedStableTokens === 'number' && Number.isFinite(trace.cachedStableTokens)
        ? formatTokenCount(trace.cachedStableTokens)
        : null;

    const describeMode = (className: string): string | null => {
        if (!manifest) return null;
        const modes = new Set(
            manifest.entries
                .filter(entry => entry.class === className)
                .map(entry => deps.normalizeEvidenceMode(entry.mode))
                .filter(mode => mode !== 'none')
        );
        if (modes.size === 1) {
            return modes.has('summary') ? 'Summary' : 'Body';
        }
        if (modes.size > 1) {
            return 'Mixed';
        }
        return null;
    };

    const buildCorpusSummary = (): string[] => {
        const summaryLines: string[] = [];
        if (!manifest) {
            summaryLines.push('- Corpus: unavailable');
            return summaryLines;
        }
        const counts = manifest.classCounts || {};
        const sceneCount = counts.scene ?? 0;
        const outlineCount = counts.outline ?? 0;
        const sceneMode = describeMode('scene');
        const outlineMode = describeMode('outline');
        summaryLines.push(`- Scenes: ${sceneCount}${sceneMode ? ` × ${sceneMode}` : ''}`);
        summaryLines.push(`- Outlines: ${outlineCount}${outlineMode ? ` × ${outlineMode}` : ''}`);

        const contextParts: string[] = [];
        const contextOrder = ['character', 'place', 'power'];
        contextOrder.forEach(className => {
            const count = counts[className] ?? 0;
            if (!count) return;
            const label = className === 'character'
                ? 'Characters'
                : className === 'place'
                    ? 'Places'
                    : className === 'power'
                        ? 'Powers'
                        : formatManifestClassLabel(className);
            contextParts.push(`${label} ${count}`);
        });
        summaryLines.push(`- Context: ${contextParts.length ? contextParts.join(', ') : 'none'}`);

        const handled = new Set(['scene', 'outline', ...contextOrder]);
        const otherClasses = Object.keys(counts).filter(name => !handled.has(name));
        if (otherClasses.length) {
            const otherParts = otherClasses.map(name => `${formatManifestClassLabel(name)} ${counts[name] ?? 0}`);
            summaryLines.push(`- Other: ${otherParts.join(', ')}`);
        }

        return summaryLines;
    };

    const resolveFailureReason = (): string | null => {
        if (!deps.isErrorResult(result)) return null;
        const errorMessage = trace.response?.error;
        if (errorMessage && String(errorMessage).trim().length > 0) {
            return String(errorMessage);
        }
        if (trace.notes && trace.notes.length) {
            return trace.notes[0];
        }
        if (result.summary && result.summary.trim().length > 0) {
            return result.summary;
        }
        if (result.aiReason === 'truncated') {
            return 'Response exceeded maximum output tokens before completion.';
        }
        return result.aiReason ? `AI request failed (${result.aiReason}).` : 'Unknown failure.';
    };

    const buildSuggestedFixes = (): string[] => {
        if (!deps.isErrorResult(result)) return ['None.'];
        const suggestions: string[] = [];
        const reason = result.aiReason ?? '';
        const reasonLower = reason.toLowerCase();
        const failureReason = resolveFailureReason() ?? '';
        const failureLower = failureReason.toLowerCase();
        const isPackagingFailure = reasonLower === 'packaging_failed'
            || trace.failureStage === 'chunk_execution'
            || trace.failureStage === 'synthesis'
            || trace.failureStage === 'preflight';
        const isInvalidStructuredOutput = reasonLower === 'invalid_response'
            || failureLower.includes('invalid_response')
            || failureLower.includes('malformed json')
            || failureLower.includes('structured output');
        const isTruncated = reasonLower === 'truncated'
            || failureLower.includes('truncated')
            || failureLower.includes('max tokens')
            || failureLower.includes('token limit')
            || failureLower.includes('context length')
            || failureLower.includes('length exceeded');

        if (isPackagingFailure) {
            suggestions.push('Run failed during Inquiry packaging/parsing. Open Inquiry Log for exact chunk/synthesis failure details.');
            suggestions.push('Retry once with the same settings after reviewing the log.');
        } else if (isInvalidStructuredOutput) {
            suggestions.push('Run failed because Inquiry did not receive valid structured output.');
            suggestions.push('Open Inquiry Log for the exact parser failure detail, then retry once.');
        } else if (isTruncated) {
            suggestions.push('Reduce corpus scope and rerun.');
        } else if (reasonLower === 'rate_limit') {
            suggestions.push('Retry later.');
        } else if (reasonLower === 'auth') {
            suggestions.push('Verify API key and provider access.');
        } else if (reasonLower === 'timeout'
            || reasonLower === 'unavailable'
            || reasonLower === 'unsupported_param') {
            suggestions.push('Retry and review Inquiry Log for provider error details.');
        }

        if (!suggestions.length) {
            suggestions.push('Open Inquiry Log for details, then retry.');
        }
        return suggestions;
    };

    const lines: string[] = [];
    if (isSimulated) {
        lines.push('> Simulated test run. No provider request was sent.', '');
    }

    lines.push('## Run Summary');
    lines.push(`- Scope: ${scopeLabel} · ${target}`);
    lines.push(`- Question: ${questionLabel}`);
    lines.push(`- Provider / Model: ${providerLabel} · ${modelLabel}`);
    lines.push(`- Overrides: ${overrideLabel}`);
    lines.push(`- Status: ${statusLabel}${statusDetail}`);
    lines.push(`- Duration: ${formatDuration(durationMs)}`);
    lines.push('');

    lines.push('## Corpus Summary');
    lines.push(...buildCorpusSummary());
    lines.push('');

    lines.push('## Corpus TOC');
    lines.push(...buildManifestTocLines({
        manifestEntries: manifest?.entries,
        normalizeEvidenceMode: deps.normalizeEvidenceMode,
        resolveManifestEntryLabel: deps.resolveManifestEntryLabel
    }));
    lines.push('');

    lines.push('## Tokens');
    lines.push(`- Estimated input: ${formatTokenCount(tokenEstimateInput, true)}`);
    lines.push(`- Actual usage: ${isSimulated ? 'simulated run; not applicable' : usageText}`);
    lines.push(`- Usage visibility: ${isSimulated ? 'simulated' : usageVisibility}`);
    if (!isSimulated && usageDetailParts.length) {
        lines.push(`- Usage detail: ${usageDetailParts.join(', ')}`);
    }
    lines.push(`- Tier: ${tokenTier ?? 'unknown'}`);
    if (deps.estimateSnapshot) {
        lines.push(`- Pre-run estimate: ${formatTokenCount(deps.estimateSnapshot.estimate.estimatedInputTokens, true)} (${deps.estimateSnapshot.estimate.estimationMethod})`);
        lines.push(`- Per-pass planning budget: ${formatTokenCount(deps.estimateSnapshot.estimate.effectiveInputCeiling)}`);
        lines.push(`- Expected structured passes: ${deps.estimateSnapshot.estimate.expectedPassCount}`);
    }
    lines.push('');

    lines.push('## Execution');
    lines.push(`- Packaging: ${isSimulated ? 'Simulation only' : (trace.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : trace.analysisPackaging === 'segmented' ? 'Segmented' : 'Automatic')}`);
    lines.push(`- Execution state: ${isSimulated ? 'simulated' : (trace.executionState ?? 'unknown')}`);
    lines.push(`- Execution path: ${isSimulated ? 'simulated' : (trace.executionPath ?? ((typeof trace.executionPassCount === 'number' && trace.executionPassCount > 1) ? 'multi_pass' : 'one_pass'))}`);
    lines.push(`- Failure stage: ${isSimulated ? 'none' : (trace.failureStage ?? (status === 'error' ? 'provider_response_parsing' : 'none'))}`);
    if (!isSimulated && cacheReuseLabel) {
        const cacheParts = [`- Cache reuse: ${cacheReuseLabel}`];
        if (trace.cacheStatus) cacheParts.push(`status=${trace.cacheStatus}`);
        if (cachePrefixLabel) cacheParts.push(`prefix=${cachePrefixLabel}`);
        if (cacheTokensLabel) cacheParts.push(`tokens=${cacheTokensLabel}`);
        lines.push(cacheParts.join(' · '));
    }
    if (typeof trace.executionPassCount === 'number' && trace.executionPassCount > 1) {
        lines.push(`- Pass count: ${trace.executionPassCount}`);
    }
    if (!isSimulated && trace.packagingTriggerReason) {
        lines.push(`- Packaging trigger: ${trace.packagingTriggerReason}`);
    }
    lines.push('');

    if (!isSimulated) {
        const costBreakdownLines = formatUsageCostBreakdownLines(
            result.aiProvider,
            result.aiModelResolved || result.aiModelRequested,
            usage,
            logCostEstimateInput
        );
        if (costBreakdownLines.length) {
            lines.push(...costBreakdownLines);
        }
    }

    lines.push('## Result');
    if (status === 'success') {
        lines.push(`- Verdict: Flow ${args.deps.formatMetricDisplay(result.verdict.flow)} · Depth ${args.deps.formatMetricDisplay(result.verdict.depth)} · Impact ${formatBriefLabel(result.verdict.impact)} · Confidence ${formatBriefLabel(result.verdict.assessmentConfidence)}`);
    } else if (status === 'simulated') {
        lines.push('- Result: Simulated test run. The corpus was packaged and rendered locally, but no API request was sent.');
    } else {
        lines.push(`- Failure reason: ${resolveFailureReason() ?? 'Unknown failure.'}`);
    }
    lines.push('');

    lines.push('## Suggested Fixes');
    buildSuggestedFixes().forEach(fix => {
        lines.push(`- ${fix}`);
    });
    lines.push('');

    lines.push(`Content Log: ${args.contentLogWritten ? 'written' : 'skipped'}`);
    lines.push('');

    return lines.join('\n');
}

export function buildInquiryContentLogContent(args: {
    result: InquiryResult;
    trace: InquiryRunTrace;
    manifest: CorpusManifest | null;
    deps: InquiryLogBuilderDependencies;
    logTitle?: string;
    normalizationNotes?: string[];
}): string {
    const { result, trace, manifest, deps } = args;
    const title = args.logTitle ?? 'Inquiry Content Log';
    const zoneLabel = deps.resolveInquiryBriefZoneLabel(result);
    const lensLabel = deps.resolveInquiryBriefLensLabel(result, zoneLabel);
    const scopeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
    const target = result.focusId || (result.scope === 'saga' ? 'Σ' : '?');
    const aiProvider = result.aiProvider || 'unknown';
    const aiModelRequested = result.aiModelRequested || 'unknown';
    const aiModelResolved = result.aiModelResolved || aiModelRequested;
    const aiModelNextRunOnly = typeof result.aiModelNextRunOnly === 'boolean' ? result.aiModelNextRunOnly : null;
    const submittedAt = result.submittedAt ? new Date(result.submittedAt) : null;
    const completedAt = result.completedAt ? new Date(result.completedAt) : null;
    const durationMs = typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)
        ? result.roundTripMs
        : null;
    const inquiryId = deps.formatInquiryIdFromResult(result);
    const artifactId = result.runId
        ? `artifact-${result.runId}`
        : (inquiryId ? `artifact-${inquiryId}` : `artifact-${Date.now()}`);
    const tokenEstimateInput = deps.getFiniteTokenEstimateInput(trace, result);
    const tokenTier = typeof tokenEstimateInput === 'number'
        ? deps.getTokenTier(tokenEstimateInput)
        : (result.tokenEstimateTier || null);
    const overrideSummary = result.corpusOverridesActive ? result.corpusOverrideSummary : null;
    const overrideLabel = overrideSummary
        ? `on (classes=${overrideSummary.classCount}, items=${overrideSummary.itemCount})`
        : (result.corpusOverridesActive ? 'on' : 'none');

    let status: AiLogStatus = 'success';
    const degraded = deps.isDegradedResult(result);
    const isSimulated = result.aiReason === 'simulated' || result.aiReason === 'stub';
    if (isSimulated) {
        status = 'simulated';
    } else if (deps.isErrorResult(result)) {
        status = 'error';
    }

    const tokenUsage = trace.usage
        ?? (trace.response?.responseData ? extractTokenUsage(aiProvider, trace.response.responseData) : null);
    const logCostEstimateInput = !isSimulated
        ? deps.buildInquiryLogCostEstimateInput(trace, result)
        : null;
    const tokenUsageKnown = typeof trace.tokenUsageKnown === 'boolean'
        ? trace.tokenUsageKnown
        : !!tokenUsage;
    const tokenUsageVisibility = deps.formatTokenUsageVisibility(tokenUsageKnown, trace.tokenUsageScope ?? result.tokenUsageScope);
    const tokenUsageDetailParts = tokenUsage
        ? [
            typeof tokenUsage.rawInputTokens === 'number' ? `raw input=${tokenUsage.rawInputTokens}` : null,
            typeof tokenUsage.cacheReadInputTokens === 'number' ? `cache read=${tokenUsage.cacheReadInputTokens}` : null,
            typeof tokenUsage.cacheCreationInputTokens === 'number' ? `cache write=${tokenUsage.cacheCreationInputTokens}` : null
        ].filter((value): value is string => !!value)
        : [];
    const cacheDetailParts = [
        trace.cacheReuseState ? `reuse=${trace.cacheReuseState}` : null,
        trace.cacheStatus ? `status=${trace.cacheStatus}` : null,
        typeof trace.cachedStableRatio === 'number' && Number.isFinite(trace.cachedStableRatio)
            ? `prefix=${Math.round(trace.cachedStableRatio * 100)}%`
            : null,
        typeof trace.cachedStableTokens === 'number' && Number.isFinite(trace.cachedStableTokens)
            ? `cached stable tokens=${Math.round(trace.cachedStableTokens)}`
            : null
    ].filter((value): value is string => !!value);
    const { sanitized: sanitizedPayload, hadRedactions } = sanitizeLogPayload(trace.requestPayload ?? null);
    const redactionNotes = hadRedactions
        ? ['Redacted sensitive credential values from request payload.']
        : [];
    const sanitizationSteps = [...(trace.sanitizationNotes || []), ...redactionNotes].filter(Boolean);
    const schemaWarnings = [
        ...(trace.notes || []),
        ...(args.normalizationNotes || [])
    ].filter(Boolean);

    const contextLines = [
        '',
        '### Inquiry Context',
        `- Artifact ID: ${artifactId}`,
        `- Run ID: ${result.runId || 'unknown'}`,
        `- Plugin version: ${deps.pluginVersion}`,
        `- Corpus fingerprint: ${result.corpusFingerprint || 'unknown'}`,
        `- Corpus overrides: ${overrideLabel}`,
        `- Scope: ${result.scope || 'unknown'}`,
        `- Focus ID: ${result.focusId || 'unknown'}`,
        `- Mode: ${result.mode || 'unknown'}`,
        `- Question ID: ${result.questionId || 'unknown'}`,
        `- Question zone: ${result.questionZone || 'unknown'}`,
        `- AI provider: ${isSimulated ? 'simulation' : (result.aiProvider || 'unknown')}`,
        `- AI model requested: ${isSimulated ? 'not applicable' : (result.aiModelRequested || 'unknown')}`,
        `- AI model resolved: ${isSimulated ? 'not applicable' : (result.aiModelResolved || 'unknown')}`,
        `- OpenAI transport lane: ${trace.openAiTransportLane || 'n/a'}`,
        `- AI next-run override: ${typeof result.aiModelNextRunOnly === 'boolean' ? String(result.aiModelNextRunOnly) : 'unknown'}`,
        `- Packaging: ${isSimulated ? 'simulated' : (trace.analysisPackaging === 'singlePassOnly' ? 'singlePassOnly' : trace.analysisPackaging === 'segmented' ? 'segmented' : 'automatic')}`,
        `- AI status: ${degraded ? 'degraded' : (result.aiStatus || 'unknown')}`,
        `- AI reason: ${result.aiReason || 'none'}`,
        `- Execution state: ${isSimulated ? 'simulated' : (trace.executionState ?? 'unknown')}`,
        `- Execution path: ${isSimulated ? 'simulated' : (trace.executionPath ?? ((typeof trace.executionPassCount === 'number' && trace.executionPassCount > 1) ? 'multi_pass' : 'one_pass'))}`,
        `- Failure stage: ${isSimulated ? 'none' : (trace.failureStage ?? (status === 'error' ? 'provider_response_parsing' : 'none'))}`,
        `- Token usage visibility: ${isSimulated ? 'simulated' : tokenUsageVisibility}`,
        `- Submitted at (raw): ${result.submittedAt || 'unknown'}`,
        `- Returned at (raw): ${result.completedAt || 'unknown'}`,
        `- Round trip ms: ${typeof result.roundTripMs === 'number' ? String(result.roundTripMs) : 'unknown'}`,
        `- Token estimate input: ${typeof result.tokenEstimateInput === 'number' ? String(Math.round(result.tokenEstimateInput)) : 'unknown'}`,
        `- Token estimate tier: ${result.tokenEstimateTier || 'unknown'}`
    ];
    if (tokenUsageDetailParts.length) {
        contextLines.push(`- Token usage detail: ${tokenUsageDetailParts.join(', ')}`);
    }
    if (cacheDetailParts.length) {
        contextLines.push(`- Cache detail: ${cacheDetailParts.join(', ')}`);
    }
    if (typeof trace.executionPassCount === 'number' && trace.executionPassCount > 1) {
        contextLines.push(`- Execution pass count: ${trace.executionPassCount}`);
    }
    if (trace.packagingTriggerReason) {
        contextLines.push(`- Packaging trigger reason: ${trace.packagingTriggerReason}`);
    }
    if (manifest) {
        const counts = manifest.classCounts || {};
        const countList = Object.keys(counts)
            .map(key => `${key}:${counts[key] ?? 0}`)
            .sort()
            .join(', ');
        if (countList) {
            contextLines.push(`- Corpus counts: ${countList}`);
        }
    }
    contextLines.push('', '### Corpus TOC');
    buildManifestTocLines({
        manifestEntries: manifest?.entries,
        normalizeEvidenceMode: deps.normalizeEvidenceMode,
        resolveManifestEntryLabel: deps.resolveManifestEntryLabel
    }).forEach(line => contextLines.push(line));

    const logContent = formatAiLogContent({
        title,
        metadata: {
            feature: 'Inquiry',
            scopeTarget: `${scopeLabel} · ${target} · ${zoneLabel} · ${lensLabel}`,
            provider: aiProvider,
            modelRequested: aiModelRequested,
            modelResolved: aiModelResolved,
            modelNextRunOnly: aiModelNextRunOnly,
            estimatedInputTokens: tokenEstimateInput,
            tokenTier,
            submittedAt,
            returnedAt: completedAt,
            durationMs,
            status,
            tokenUsage
        },
        request: {
            systemPrompt: trace.systemPrompt,
            userPrompt: trace.userPrompt,
            evidenceText: trace.evidenceText,
            requestPayload: sanitizedPayload
        },
        response: {
            rawResponse: trace.response?.responseData ?? null,
            assistantContent: trace.response?.content ?? '',
            parsedOutput: deps.normalizeLegacyResult(result)
        },
        notes: {
            sanitizationSteps,
            retryAttempts: trace.retryCount,
            schemaWarnings
        }
    }, { jsonSpacing: 0, metadataExtras: contextLines });
    const costBreakdownLines = !isSimulated
        ? formatUsageCostBreakdownLines(
            aiProvider,
            aiModelResolved || aiModelRequested,
            tokenUsage,
            logCostEstimateInput
        )
        : [];

    return costBreakdownLines.length
        ? `${logContent}\n${costBreakdownLines.join('\n')}\n`
        : `${logContent}\n`;
}
