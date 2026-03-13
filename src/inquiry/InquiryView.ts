import {
    App,
    ButtonComponent,
    ItemView,
    Modal,
    Notice,
    Platform,
    setIcon,
    setTooltip,
    TAbstractFile,
    TFile,
    TFolder,
    ToggleComponent,
    WorkspaceLeaf,
    normalizePath
} from 'obsidian';
import type RadialTimelinePlugin from '../main';
import {
    INQUIRY_MAX_OUTPUT_TOKENS,
    INQUIRY_SCHEMA_VERSION,
    INQUIRY_VIEW_DISPLAY_TEXT,
    INQUIRY_VIEW_TYPE
} from './constants';
import {
    createDefaultInquiryState,
    InquiryConfidence,
    InquiryFinding,
    InquiryMode,
    InquiryResult,
    InquiryScope,
    InquirySeverity,
    InquiryTokenUsageScope,
    InquiryZone
} from './state';
import type { InquiryClassConfig, InquiryMaterialMode, InquiryPromptConfig, InquiryPromptSlot, OmnibusProgressState } from '../types/settings';
import { buildDefaultInquiryPromptConfig, getBuiltInPromptSeed, getCanonicalPromptText, normalizeInquiryPromptConfig } from './prompts';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { ensureInquiryContentLogFolder, ensureInquiryLogFolder, resolveInquiryLogFolder } from './utils/logs';
import { openOrRevealFile, openOrRevealFileAtSubpath } from '../utils/fileUtils';
import { extractTokenUsage, formatAiLogContent, formatDuration, sanitizeLogPayload, type AiLogStatus } from '../ai/log';
import { getCredentialSecretId } from '../ai/credentials/credentials';
import { redactSensitiveValue } from '../ai/credentials/redactSensitive';
import { hasSecret, isSecretStorageAvailable } from '../ai/credentials/secretStorage';
import {
    InquiryGlyph,
    FLOW_RADIUS,
    FLOW_STROKE,
    ZONE_RING_THICKNESS,
    ZONE_SEGMENT_RADIUS,
    ZONE_SEGMENT_HALF_HEIGHT
} from './components/InquiryGlyph';
import { ZONE_LAYOUT } from './zoneLayout';
import { InquiryRunnerService } from './runner/InquiryRunnerService';
import { getLastAiAdvancedContext } from '../ai/runtime/aiClient';
// computeCaps, INPUT_TOKEN_GUARD_FACTOR: now used in inquiryReadinessBuilder.ts
import { BUILTIN_MODELS } from '../ai/registry/builtinModels';
import { selectModel } from '../ai/router/selectModel';
import { buildDefaultAiSettings, mapAiProviderToLegacyProvider, mapLegacyProviderToAiProvider } from '../ai/settings/aiSettings';
import { validateAiSettings } from '../ai/settings/validateAiSettings';
import type { AIRunAdvancedContext, AIProviderId, AiSettingsV1, Capability, ModelInfo, AccessTier, RTCorpusTokenEstimate } from '../ai/types';
import type {
    CorpusManifest,
    CorpusManifestEntry,
    EvidenceParticipationRules,
    InquiryOmnibusInput,
    InquiryRunProgressEvent,
    InquiryRunTrace,
    InquiryRunnerInput
} from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';
import type { InquirySession, InquirySessionStatus } from './sessionTypes';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import type { InquirySourcesSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { InquiryCorpusResolver, InquiryCorpusSnapshot, InquiryCorpusItem, InquirySceneItem, InquiryBookItem } from './services/InquiryCorpusResolver';
import {
    isPathIncludedByInquiryBooks,
    resolveInquiryBookResolution
} from './services/bookResolution';
import { getModelDisplayName } from '../utils/modelResolver';
import { resolveInquiryEngine, type ResolvedInquiryEngine } from './services/inquiryModelResolver';
import { buildInquirySourcesViewModel } from './services/inquirySources';
import { computeInquiryAdvisoryContext, type InquiryAdvisoryContext } from './services/inquiryAdvisory';
import type { InquiryEstimateSnapshot } from './services/inquiryEstimateSnapshot';
import type {
    TokenTier,
    InquiryPayloadStats,
    InquiryReadinessUiState,
    InquiryEnginePopoverState,
    PassPlanResult
} from './types';
import {
    buildReadinessUiState as buildReadinessUiStatePure,
    buildRunScopeLabel as buildRunScopeLabelPure,
    buildEnginePayloadSummary as buildEnginePayloadSummaryPure,
    resolveEnginePopoverState as resolveEnginePopoverStatePure,
    estimateStructuredPassCount as estimateStructuredPassCountPure,
    getCurrentPassPlan as getCurrentPassPlanPure,
    buildAdvisoryInputKey,
    formatTokenEstimate as formatTokenEstimatePure,
    getTokenTier as getTokenTierPure,
    getTokenTierFromSnapshot as getTokenTierFromSnapshotPure,
    INQUIRY_INPUT_TOKENS_AMBER,
    INQUIRY_INPUT_TOKENS_RED
} from './services/inquiryReadinessBuilder';
import { buildRTCorpusEstimate } from './services/buildRTCorpusEstimate';
import {
    InquiryCorpusService,
    isSynopsisCapableClass as isSynopsisCapableClassPure,
    normalizeEvidenceMode as normalizeEvidenceModePure,
    isModeActive as isModeActivePure,
    normalizeContributionMode as normalizeContributionModePure,
    normalizeMaterialMode as normalizeMaterialModePure,
    normalizeClassContribution as normalizeClassContributionPure,
    resolveContributionMode as resolveContributionModePure,
    getDefaultMaterialMode as getDefaultMaterialModePure,
    hashString as hashStringPure,
    getCorpusGroupKey as getCorpusGroupKeyPure,
    getCorpusGroupBaseClass as getCorpusGroupBaseClassPure,
    getCorpusItemKey as getCorpusItemKeyPure,
    parseCorpusItemKey as parseCorpusItemKeyPure,
    getCorpusCycleModes as getCorpusCycleModesPure,
    getNextCorpusMode as getNextCorpusModePure,
    getCorpusGroupKeys as getCorpusGroupKeysPure,
    getClassScopeConfig as getClassScopeConfigPure,
    extractClassValues as extractClassValuesPure,
    getFrontmatterScope as getFrontmatterScopePure,
    normalizeInquirySources as normalizeInquirySourcesPure
} from './services/InquiryCorpusService';
import { createSvgElement, createSvgGroup, createSvgText, clearSvgChildren, SVG_NS } from './minimap/svgUtils';
import {
    InquiryMinimapRenderer,
    MINIMAP_GROUP_Y,
    MIN_PROCESSING_MS,
    toRgbString,
    getExecutionColorValue,
    getBackboneStartColors,
} from './minimap/InquiryMinimapRenderer';
import { addTooltipData, setupTooltipsFromDataAttributes } from '../utils/tooltip';
import { splitIntoBalancedLinesOptimal } from '../utils/text';
import { classifySynopsis, type SynopsisQuality } from '../sceneAnalysis/synopsisQuality';
import {
    isLowSubstanceTier,
    resolveCorpusSceneStatus,
    type CorpusSceneStatus,
    type CorpusSubstanceTier
} from './services/corpusCellStatus';
import { readSceneId } from '../utils/sceneIds';
import { buildSceneRefIndex, isStableSceneId, normalizeSceneRef } from '../ai/references/sceneRefNormalizer';
import {
    DEFAULT_CHARS_PER_TOKEN,
    estimateTokensFromChars as estimateTokensFromCharsHeuristic,
    estimateUncertaintyTokens
} from '../ai/tokens/inputTokenEstimate';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    resolveScanRoots,
    toVaultRoot
} from './utils/scanRoots';

const GLYPH_PLACEHOLDER_FLOW = 0.75;
const GLYPH_PLACEHOLDER_DEPTH = 0.30;
const DEBUG_SVG_OVERLAY = false;
const VIEWBOX_MIN = -800;
const VIEWBOX_MAX = 800;
const VIEWBOX_SIZE = 1600;
const INQUIRY_CONTEXT_CLASSES = new Set(['character', 'place', 'power']);
const PREVIEW_PANEL_WIDTH = 640;
const PREVIEW_PANEL_Y = -390;
const PREVIEW_PANEL_MINIMAP_GAP = 60;
const PREVIEW_PANEL_PADDING_X = 32;
const PREVIEW_PANEL_PADDING_Y = 20;
const PREVIEW_RUNNING_CONTENT_OFFSET_Y = -3;
const PREVIEW_HERO_LINE_HEIGHT = 30;
const PREVIEW_HERO_MAX_LINES = 4;
const PREVIEW_META_GAP = 6;
const PREVIEW_META_LINE_HEIGHT = 22;
const PREVIEW_DETAIL_GAP = 16;
const PREVIEW_PILL_HEIGHT = 26;
const PREVIEW_PILL_PADDING_X = 16;
const PREVIEW_PILL_GAP_X = 20;
const PREVIEW_PILL_GAP_Y = 14;
const PREVIEW_FOOTER_GAP = 12;
const PREVIEW_FOOTER_HEIGHT = 22;
const PREVIEW_RESULTS_FOOTER_OFFSET = 30;
const PREVIEW_SHIMMER_WIDTH = 120;
const PREVIEW_SHIMMER_OVERHANG = 110;
const FLOW_FINDING_ORDER: InquiryFinding['kind'][] = ['escalation', 'conflict', 'continuity', 'loose_end', 'unclear', 'error', 'none'];
const DEPTH_FINDING_ORDER: InquiryFinding['kind'][] = ['continuity', 'loose_end', 'conflict', 'escalation', 'unclear', 'error', 'none'];
const SIGMA_CHAR = String.fromCharCode(931);
const MODE_ICON_VIEWBOX = 2048;
const MODE_ICON_OFFSET_Y = -330;
const SCENE_DOSSIER_Y = -256;
const SCENE_DOSSIER_WIDTH = VIEWBOX_SIZE / 2;
const SCENE_DOSSIER_MIN_HEIGHT = 0;
const SCENE_DOSSIER_SIDE_PADDING = 22;
const SCENE_DOSSIER_PADDING_Y = 18;
const SCENE_DOSSIER_HEADER_SIZE = 19;
const SCENE_DOSSIER_HEADER_LINE_HEIGHT = 21;
const SCENE_DOSSIER_FOOTER_SIZE = 13;
const SCENE_DOSSIER_FOOTER_LINE_HEIGHT = 15;
const SCENE_DOSSIER_LINE_HEIGHT = 20;
const SCENE_DOSSIER_MAX_BODY_LINES = 6;
const FLOW_ICON_PATHS = [
    'M1873.99,900.01c.23,1.74-2.27.94-3.48.99-14.3.59-28.74-.35-43.05-.04-2.37.05-4.55,1.03-6.92,1.08-124.15,2.86-248.6,8.35-373,4.92-91.61-2.53-181.2-15.53-273.08-17.92-101.98-2.65-204.05,7.25-305.95.95-83.2-5.14-164.18-24.05-247.02-31.98-121.64-11.65-245.9-13.5-368.04-15.96-2.37-.05-4.55-1.04-6.92-1.08-17.31-.34-34.77.75-52.05.04-1.22-.05-3.72.75-3.48-.99,26.49-.25,53.03.28,79.54.03,144.74-1.38,289.81-5.3,433.95,8.97,18.67,1.85,37.34,5.16,56.01,6.99,165.31,16.18,330.85-3.46,495.99,14.01,118.64,12.56,236.15,30.42,355.97,28.03,87.15,0,174.3,2.45,261.54,1.97h-.01Z',
    'M1858.99,840.01c.23,1.74-2.27.94-3.48.99-15.63.64-31.41-.36-47.05-.04-2.37.05-4.55,1.03-6.92,1.08-127.12,2.74-254.28,9.03-381.05,2.97-86.31-4.13-170.32-17.4-256.98-20.02-110.96-3.36-222.13,6.92-333-1-62.18-4.44-123.32-15.98-185.14-22.86-130.81-14.57-267.28-16.86-398.92-19.08-2.36-.04-4.55-1.04-6.92-1.08-20.56-.33-41.57.88-62.05.04-1.22-.05-3.72.75-3.48-.99,27.83-.25,55.7.28,83.54.03,110.53-1,221.67-2.9,331.92,2,82.52,3.67,164.67,14.08,247,17,120.4,4.27,240.84-7.91,361.03,1.97,68.04,5.59,135.16,18.98,203.02,25.98,102.05,10.53,205.5,10.76,307.95,12.05,50.17.63,100.37.51,150.54.97h-.01Z',
    'M1842.99,961.01c.23,1.74-2.27.94-3.48.99-25.56,1.05-51.45.11-77.05.96l-79.92,3.08c-11.35.14-22.73-.31-34.08-.08-75.38,1.5-150.52,3.23-225.92,0-70.84-3.04-141.24-10.76-212.08-12.92-110.8-3.38-221.44,7.94-331.95.95-87.75-5.56-170.98-27.28-258.02-35.98-121.12-12.11-248.16-13.39-370.03-15.97-2.37-.05-4.55-1.03-6.92-1.08-16.64-.35-33.43.72-50.05.04-1.22-.05-3.72.75-3.48-.99,21.16-.25,42.37.28,63.54.03,120.89-1.45,244.31-4.94,364.95,1.97,92.31,5.29,182.02,23.64,274.97,26.03,97.61,2.52,194.76-4.98,292.08-1.08,102.89,4.12,204.72,22.93,307.92,28.08,108.68,5.42,217.3,1.72,326.08,4.92,7.47.22,15.65,1.96,23.45,1.05h0Z',
    'M1892.99,1020.01c.23,1.74-2.27.94-3.48.99-16.61.68-33.41-.29-50.05-.04-2.36.04-4.55,1.04-6.92,1.08-127.73,2.28-255.33,8.29-383,4.92-71.58-1.89-142.68-9.43-214.03-11.97-125.84-4.47-251.12,11.24-377,0-78-6.96-152.8-27.94-231.01-35.99-132.21-13.59-267.3-12.99-400.03-16.97l-19.45-2.03c31.83-.25,63.7.28,95.54.03,135.4-1.07,273.36-5.92,407.82,11.1,42.78,5.42,85.05,13.34,128.15,16.85,139.4,11.34,279.58-5.96,418.98,5.02,46.43,3.66,92.62,10.85,139.01,14.99,108.66,9.68,220.94,10.96,329.95,12.05,55.16.55,110.38-.5,165.54-.03h-.02Z',
    'M1846.99,1081.01c.23,1.74-2.27.94-3.48.99-16.29.67-32.74-.35-49.05-.04-126.07,2.42-250.52,8.4-376.97,3.05-54.11-2.29-108-7.25-162.03-8.97-147.59-4.7-291.2,17.69-438.82-4.18-44.08-6.53-87.24-17.93-131.31-24.69-118.91-18.24-240.1-17.95-359.79-24.21l-138.05-1.96-3.48-.99c45.84-.3,91.68-.55,137.54-.97,118.46-1.08,241.16-3.52,358.95,8.96,49.25,5.22,97.78,15.79,147.01,20.99,134.9,14.23,269.26-2.37,404,4,115.35,5.45,230.26,23.7,345.95,24.05l269.54,3.97h-.01Z',
    'M1886.99,1140.01c.23,1.74-2.27.94-3.48.99-18.28.75-36.75-.35-55.05-.04-2.36.04-4.55,1.04-6.92,1.08-124.58,2.26-249.4,6.27-374,2.92-79.23-2.13-157.79-10.68-237-9.92-111.01,1.07-222.29,15.23-333.04,4.95-80.02-7.42-157.13-29.72-237.13-38.87-109.52-12.53-220.11-13.58-329.83-18.17-30.26-1.04-60.82.28-91.05-.96-1.22-.05-3.72.75-3.48-.99,33.41-1.66,66.99-.63,100.54-.97,132.12-1.34,266.81-5.51,397.79,13.13,35.16,5,70.02,12.4,105.29,16.71,163.13,19.92,325.43-6.76,489.87,7.13,25.01,2.11,50.01,5.78,75.01,7.99,124.74,11,249.78,13.86,374.95,15.05,42.5.4,85.05-.39,127.54-.03h-.01Z',
    'M1827.99,1201.01c.23,1.74-2.27.94-3.48.99-14.29.59-28.74-.28-43.05-.04-115.65,1.92-231.19,6.1-346.92,2-86.12-3.05-168.46-11.59-255-8.92-104.04,3.22-205.73,15.8-310.04,4.95-74.39-7.74-146.25-28.95-221.13-37.87-128.28-15.28-263.63-17.56-392.83-20.17-16.64-.34-33.43.72-50.05.04-1.22-.05-3.72.75-3.48-.99,32.01-2.07,64.38-.68,96.54-.97,143.23-1.26,287.89-5.92,429.79,15.13,72.64,10.78,132.72,21.01,207.21,22.79,120.32,2.88,237.35-12.3,357.95-2.95,126.6,9.81,252.83,24.46,379.97,24.03l154.54,1.97h-.02Z',
    'M1866.99,1260.01c.23,1.74-2.27.94-3.48.99-14.95.61-30.07-.28-45.05-.04-2.36.04-4.55,1.04-6.92,1.08-130.78,2.42-262.55,7.17-393.05.97-74.88-3.56-146.78-13.43-221.95-10.97-102.42,3.35-199.73,18.19-303.03,9.95-86.01-6.86-168.89-32.27-255.13-41.87-122.3-13.61-249.91-14.58-372.92-17.08-2.37-.05-4.55-1.04-6.92-1.08-14.31-.24-28.76.63-43.05.04-1.22-.05-3.72.75-3.48-.99,15.16-.25,30.37.28,45.54.03,2.62-.04,5.06-1.05,7.91-1.09,130.55-1.8,270.66-5.74,400.04,7.06,71.51,7.08,141.22,24.72,213.02,29.98,60.88,4.46,121.1,1.83,181.95-1.03,82.54-3.88,157.04-9.61,240.04-1.95,42.37,3.91,84.57,10.5,127.01,13.99,95.85,7.88,192.07,8.57,287.95,12.05l151.54-.03h-.02Z',
    'M1844.99,780.01c.23,1.74-2.27.94-3.48.99-13.96.57-28.07-.3-42.05-.04-141.3,2.57-283.58,13.37-424.95,1.04-43.21-3.77-85.9-11.58-129.01-15.99-177.25-18.1-353.26,10.99-529.98-14.02l-187.5-24.98c22.83,1.11,45.69,1.89,68.54,2.95,110.04,5.09,214.45,8.65,324.92,6,86.75-2.08,173.41-7.14,260.03.05,62.88,5.22,124.66,18.79,187.15,26.85,142.22,18.35,285.65,13.88,428.91,16.09,2.85.04,5.29,1.04,7.91,1.09,13.16.25,26.38-.28,39.54-.03h-.03Z',
    'M1432.99,1309.01c.23,1.74-2.27.94-3.48.99-5.14.21-10.9.2-16.05.04-95.06-2.94-189.84-5.29-284.95,1.97-64.76,4.95-127.67,14.31-193.05,12.03-95.43-3.32-186.63-31.93-281.08-42.92-123.44-14.36-254.58-17.15-378.83-19.17-15.64-.25-31.43.68-47.05.04-1.22-.05-3.72.75-3.48-.99,8.82-.24,17.71.28,26.54.03,2.37-.07,4.55-1.03,6.92-1.08,128.74-2.8,269.19-5.78,397.03,5.05,70.2,5.95,137.58,23.09,207.02,29.98,53.73,5.33,106.29,4.52,160,2.02,82.26-3.83,161.4-14.61,243.99-7.01,55.59,5.12,110.68,16.34,166.5,19.01h-.03Z'
];
const DEPTH_ICON_PATHS = [
    'M1542.99,768.01l-33.5,3.98c-68.26,5.21-131.24,1.22-196.26-20.72-28.84-9.73-55.65-24.12-83.98-35.02-107.17-41.24-258.3-49.29-366.77-9.27-33,12.18-57.99,33.25-90.23,45.77-78,30.29-162.77,26.47-244.26,14.75l50.55.54c64.38-1.63,129.41-16.59,188.13-42.87,29.78-13.32,54.15-33.78,83.65-46.35,109.08-46.45,276.14-39.65,384.35,7,46.74,20.15,86.91,43.58,136.56,59.44,56.14,17.93,112.73,25.68,171.76,22.74h0Z',
    'M1548.99,1258.01c.23,1.74-2.27.94-3.48.99-69.13,2.6-146.82,25.16-210.48,51.53-54.36,22.52-102.32,56.03-159.04,72.96-66.66,19.9-145.27,23.69-214.38,16.38-89.21-9.43-166.72-47.7-247.3-83.7-43.71-19.53-85.61-45.34-134.33-50.68,0-1.53,19.36,1.37,21.34,1.67,58.82,8.66,124.42,24.11,179.92,45.08,30.58,11.56,59.18,25.77,90.75,35.25,107.71,32.34,252.39,30.11,355.67-16.32,15.82-7.11,30.9-16.07,46.65-23.35,45.66-21.1,96.39-36.41,146.32-43.68,42.46-6.18,85.52-5.54,128.35-6.13h0Z',
    'M1525,807.01l-33.64,5.85c-59.83,8.94-119.13,6.87-177.12-10.59-36.68-11.05-70.42-29.77-107.24-40.76-102.49-30.59-258.69-34.56-359.24,3.75-26.88,10.24-49.02,25.93-77.23,34.77-73.91,23.15-151.08,19.65-226.53,6.48,0-1.97,22.34.52,24.47.54,71.35.86,143.61-12.36,209.51-39.57,26.99-11.15,50.04-27.62,77.51-37.49,104.49-37.53,268.91-32.27,372.77,6.27,23.51,8.72,45.6,20.72,68.79,30.21,71.78,29.41,149.9,46.47,227.96,40.54h-.01Z',
    'M1542,845.01l-40.64,6.85c-65.05,9.89-130.56,11.85-194.57-5.14-28.37-7.53-54.85-19.77-82.79-28.21-97.11-29.34-250.44-32.85-349.19-10.19-46.51,10.67-80.89,34.11-129.63,42.37-69.01,11.7-137.56,5.2-206.2-5.19,0-1.94,21.32.49,23.47.54,64.99,1.63,141.18-8.6,203.31-27.77,41.36-12.77,72.35-34.01,116.22-43.78,92.56-20.6,227.5-17.9,319.43,5.59,42.6,10.89,80.49,31.23,122.58,43.42,70.4,20.39,144.81,27.53,217.99,21.51h.02Z',
    'M1545.99,921.01l-99.5,12.99-59.95,4.05h-27.09c-66.17-.08-128.62-21.74-193.96-28.04-34.17-3.29-67.81-3.33-102.04-3.96-69.66-1.29-148-2.64-216.48,10.44-18.86,3.6-36.72,10.28-55.64,13.36-40.32,6.55-82.22,5.88-122.84,4.18-45.4-1.9-90.49-7.72-135.5-13.51l83.55-.46c2.37-.07,4.55-.99,6.92-1.08,55.88-2.2,129.16-6.17,182.54-21.46,35.46-10.16,60.74-18.11,98.51-21.49,74.62-6.68,169.24-5.97,243.98,0,68.77,5.5,131.69,28.13,200.15,36.85,57.38,7.31,123.03,10.93,180.91,9.19,5.33-.16,10.86-1.88,16.45-1.04v-.02Z',
    'M1545.99,960.01l-96.5,10.99c-51.09,4.48-102.73,8.55-153.98,4.99-29.5-2.05-58.6-8.22-88.02-10.98s-58.02-3.2-87.04-3.96c-83.21-2.2-174.34-4.36-256.95,2.97-26.25,2.33-51.81,8.95-78.02,10.98-47.32,3.67-94.78,1.33-141.99-2.99-42.24-3.87-84.37-10.02-126.51-14.5l117.55.54c2.37-.05,4.55-1.02,6.92-1.08,45.46-1.27,92.78-3.04,137.91-9.09,22.37-3,43.27-9.17,65.29-12.71,33.33-5.35,66.22-6.17,99.87-7.13,88.74-2.51,190.32-5.29,277.79,8.13,74.06,11.36,145.6,23.21,221.13,22.87l102.54.97h.01Z',
    'M1531.99,885.01l-42.5,5.98c-54.81,5.51-108,8.92-162.85,1.87-54.6-7.02-103.93-26.98-158.28-34.72-73.49-10.45-160.83-11.04-234.85-5.13-48.06,3.83-79.89,11.81-124.74,27.26-49.18,16.95-122.48,17.81-174.27,13.72-39.02-3.08-77.67-10.18-116.52-14.49l94.55,1.54c50.88-2.84,102.46-6.36,152.28-17.72,35.37-8.07,64.9-25.13,99.99-33.01,89.69-20.13,229.64-18.4,320.21-1.83,53.06,9.7,100.96,32.13,153.79,43.21,63,13.21,128.93,16.13,193.18,13.32h.01Z',
    'M1491.99,1300.01l-27.81,5.67c-129.12,27.16-215.5,126.38-346.16,150.84-154.14,28.86-272.45-17.99-403.7-90.35-39.88-21.99-76.66-50.48-121.34-62.67.02-1.14,3.09-.23,4.06-.05,10.21,1.8,22.73,6.13,32.95,9.06,49.85,14.26,99.28,30.33,146.68,51.32,30.48,13.5,59.05,29.27,90.8,40.2,108.1,37.2,242.45,35.24,347.2-11.84,27.3-12.27,52.74-28.57,79.96-41.04,61.8-28.31,129.59-45.07,197.35-51.13h.01Z',
    'M1474.99,729.01c.23,1.75-2.27.94-3.48.99-18.56.76-40.35-1.74-58.87-4.14-25.42-3.3-52.14-8.92-76.64-16.36-45.8-13.92-85.22-39.62-129.75-56.25-108.69-40.59-255.97-45.9-361.27,7.23-24.9,12.56-45.74,30.6-71.3,42.7-66.42,31.42-145.18,39.19-217.69,30.32,21.52-.58,42.99-.74,64.37-3.64,56.55-7.67,114.22-33.93,162.56-63.44,23.41-14.29,43.61-31.39,68.72-43.28,106.35-50.33,247.32-44.49,355.61-2.89,49.51,19.02,94.34,49.24,142.39,71.61,39.26,18.27,81.73,34.44,125.35,37.15Z',
    'M1548.99,1034.01l-114.5,13.99c-169.08,17.76-338.98,18.41-508.95,15.96-60.24-.87-119.98-1.72-180.03-5.97-76.53-5.42-152.2-17.74-228.52-24.49l1032.01.51h-.01Z',
    'M1541.99,1155.01l-3.48.99c-23,.29-46.1,1.88-69.01,4-40.29,3.74-82.92,9.13-122.69,16.31-74.09,13.38-138.89,40.39-215.32,47.68-73.98,7.06-161.33,6.83-234.85-3.14-50.54-6.85-94.53-24.79-143.63-35.37-34.06-7.34-70.38-13.56-104.83-19.17-41.56-6.77-81.94-10.47-124.2-9.81,46.37-4.23,92.92-3.5,139.55-3.54,2.37.06,4.55,1.01,6.92,1.08,27.11.86,53.98,1.83,80.92,5.08,51.8,6.25,99.87,23.5,152.25,29.75,80.25,9.58,178.58,9.46,258.73-1.02,44.84-5.86,87.06-19.55,131.3-26.7,82.4-13.32,165.27-7.78,248.34-6.15h0Z',
    'M1526,1190.99c-43.1.72-86.83,5.62-129.18,13.32-62.48,11.37-107.11,30.52-165.3,51.7-93.26,33.95-230.2,36.58-327.73,20.69-58.18-9.48-110.04-33.38-166.02-49.98-63.77-18.9-128.86-31.08-195.78-30.23,0-1.08,19.28-.43,21.5-.51,1.91-.07,3.84-.95,5.97-1.03,62.01-2.33,128.63-3.86,189.36,9.72,26.93,6.03,51.3,15.85,77.42,23.58,110.36,32.67,276.44,32.96,386.53-1,22.25-6.86,43.35-15.84,66.02-21.98,64.95-17.6,124-18.84,190.76-17.33,12.71.29,31.1-.33,43,1,1.5.17,3.09.21,3.46,2.03v.02Z',
    'M1525.99,998.01l-50.64,7.85c-130.47,20.12-261.74,7.25-392.81,6.09-83.34-.74-166.92.46-250.09,3.01-69.12,2.12-131.91,2.2-200.95-4.97-29.97-3.11-59.79-7.88-89.52-12.49l125.55-1.46c2.37-.06,4.55-1.01,6.92-1.08,53.96-1.6,102.53-4.86,156.05-9.95,94.41-8.99,197.79-5.75,292.95-3.96,89.43,1.68,177.74,11.79,267,15l135.54,1.97h0Z',
    'M1550.99,1075.01c.24,1.74-2.27.94-3.48.99-40.5,1.53-81.63,8.02-122.02,12-30.61,3.02-61.4,4.79-91.99,8.01-43.4,4.57-86.59,11.8-130.01,15.99-83.45,8.05-169.2,7.01-252.95,4.96-78.46-1.92-148.82-13.88-226.05-20.95-61.3-5.61-125.56-10.67-186.95-13.05-2.43-.09-24.55.77-24.55-.46,18.12-1.13,36.35-1.54,54.5-2.51,71.51-3.81,139.12-7.41,211.02-4,39.75,1.89,79.26,5.22,119.03,6.97,75.2,3.31,151.58,2.8,226.92,1,66.87-1.6,133.32-7.22,200.08-8.92,67.51-1.71,139.51-3.37,207.01-1.09,6.29.21,12.88,1.9,19.45,1.06h-.01Z',
    'M1551.99,1114.01c.23,1.74-2.27.94-3.49.99-28.7,1.17-57.41,3.38-86.01,6.01-50.64,4.65-102.69,10.42-152.69,19.31-45.89,8.16-90.99,20.29-137.44,25.56-70.68,8.02-151.77,8.26-222.92,5.17-53.24-2.32-94.82-10.23-146.27-20.73-38.54-7.87-77.78-13.26-116.83-18.17-54.21-6.82-108.69-12.32-163.37-13.64,0-.98,17.41-.43,19.5-.51,1.91-.07,3.84-.94,5.97-1.03,56.79-2.41,114.18-4.01,171.05-1.97,79.85,2.87,154.28,20.33,235.03,22.97,81.86,2.68,167.54,3.23,248.82-7.1,25.84-3.29,51.37-8.72,77.27-11.73,90.03-10.49,180.85-4.28,271.37-5.11v-.02Z',
    'M1464.99,1229.01l-38.18,7.3c-72.97,11.22-134.53,47.2-200.84,74.16-98.8,40.16-244.57,42.87-347.39,16.45-36.36-9.34-69.09-24.27-104.06-36.94-31.43-11.39-63.54-21.36-94.77-33.23-27.19-10.33-53.12-24.79-82.76-27.25,0-1.28,23.18,1.27,25.5,1.51,51.08,5.23,105.07,12.63,154.03,27.97,26.92,8.44,52.68,20.15,79.71,28.29,98.26,29.58,239.21,30.92,337.76,2.23,39.72-11.56,75.86-32.19,115.79-43.21,50.47-13.94,103.1-15.27,155.21-17.27h0Z'
];
const SIMULATION_DURATION_MS = 20000;
const BRIEFING_SESSION_LIMIT = 10;
const DUPLICATE_PULSE_MS = 1200;
const REHYDRATE_PULSE_MS = 1400;
const REHYDRATE_HIGHLIGHT_MS = 3500;
const BRIEFING_HIDE_DELAY_MS = 220;
const CC_CELL_SIZE = 20;
const CC_PAGE_BASE_SIZE = Math.round(CC_CELL_SIZE * 0.8);
const CC_PAGE_MIN_SIZE = Math.max(6, Math.round(CC_CELL_SIZE * 0.33));
const CC_HEADER_ICON_SIZE = 12;
const CC_HEADER_ICON_GAP = 4;
const CC_HEADER_ICON_OFFSET = 1;
const CC_CELL_ICON_OFFSET = -1;
const CC_LABEL_HINT_SIZE = 7;
const INQUIRY_NOTES_MAX = 5;
const CC_RIGHT_MARGIN = 50;
const CC_BOTTOM_MARGIN = 50;
const INQUIRY_GUIDANCE_DOC_URL = 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Inquiry';
const INQUIRY_HELP_TOOLTIP = 'How Inquiry Works';
const INQUIRY_HELP_CONFIG_TOOLTIP = [
    'Inquiry is not configured yet.',
    'Please configure the Inquiry directories where your scenes, books, and outlines are stored (Settings -> Inquiry).',
    'Then explicitly check which classes to include for the selected scope.'
].join('\n');
const INQUIRY_HELP_NO_SCENES_TOOLTIP = [
    'No scenes found for the current scope.',
    'Please configure the Inquiry directories where your scenes, books, and outlines are stored (Settings -> Inquiry).',
    'Then explicitly check which classes to include for the selected scope.'
].join('\n');
const INQUIRY_HELP_CORPUS_TOOLTIP = [
    'Corpus disabled.',
    'Enable corpus scopes in the Corpus strip to run Inquiry.'
].join('\n');
const INQUIRY_HELP_RESULTS_TOOLTIP = [
    'Review material citations for granular feedback in the minimap.',
    'View the Brief for full details.'
].join('\n');
const INQUIRY_HELP_RUNNING_TOOLTIP = [
    'Inquiry is processing an API run.',
    'You can switch to another note and keep working while it runs, but leave this Inquiry tab open.'
].join('\n');
const INQUIRY_HELP_RUNNING_SINGLE_TOOLTIP = [
    'Inquiry is processing this question now.',
    'You can switch to another note and keep working while it runs, but leave this Inquiry tab open.',
    'If you cancel this run, you must start over from the beginning. There is no resume.'
].join('\n');
const INQUIRY_HELP_ONBOARDING_TOOLTIP = 'Number buttons reveal the question and payload. Click to process a question with AI. Flow and Depth rings adjust the lens of the response. The minimap reveals contextual citations.';
const INQUIRY_TOOLTIP_BALANCE_WIDTH = 360;
const GUIDANCE_TEXT_Y = 360;
const GUIDANCE_LINE_HEIGHT = 18;
const GUIDANCE_ALERT_LINE_HEIGHT = 26;
const INQUIRY_PROMPT_OVERHEAD_CHARS = 900;
// Token tier thresholds: now exported from inquiryReadinessBuilder.ts
const INQUIRY_REQUIRED_CAPABILITIES: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];

type InquiryQuestion = {
    id: string;
    label: string;
    question: string;
    zone: InquiryZone;
    icon: string;
};

type InquiryBriefModel = {
    questionTitle: string;
    questionText: string;
    scopeIndicator?: string | null;
    pills: string[];
    flowSummary: string;
    depthSummary: string;
    findings: Array<{
        headline: string;
        clarity: string;
        impact: string;
        confidence: string;
        lens: string;
        bullets: string[];
    }>;
    sources: Array<{
        title: string;
        excerpt: string;
        classLabel: string;
        path?: string;
        url?: string;
    }>;
    sceneNotes: Array<{
        label: string;
        header: string;
        anchorId?: string;
        entries: Array<{
            headline: string;
            bullets: string[];
            impact: string;
            confidence: string;
            lens: string;
        }>;
    }>;
    pendingActions: string[];
    logTitle?: string | null;
};

type InquiryPreviewRow = {
    group: SVGGElement;
    bg: SVGRectElement;
    text: SVGTextElement;
    label: string;
};

type InquirySceneDossier = {
    header: string;
    bodyLines: string[];
    footer?: string;
};

type InquiryOmnibusPlan = {
    scope: InquiryScope;
    createIndex: boolean;
    resume?: boolean;
};

type InquiryPurgePreviewItem = {
    label: string;
    path: string;
    lineCount: number;
};

class InquiryPurgeConfirmationModal extends Modal {
    constructor(
        app: App,
        private totalScenes: number,
        private affectedScenes: InquiryPurgePreviewItem[],
        private scopeLabel: string,
        private onConfirm: () => Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '520px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Inquiry' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Purge Action Items' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Removes Inquiry-generated action items from scene frontmatter.'
        });

        const panel = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass ert-stack' });

        const affectedCount = this.affectedScenes.length;
        if (affectedCount === 0) {
            panel.createDiv({
                cls: 'ert-inquiry-purge-message',
                text: `No Inquiry action items found in ${this.totalScenes} scene${this.totalScenes !== 1 ? 's' : ''} in ${this.scopeLabel}.`
            });
        } else {
            panel.createDiv({
                cls: 'ert-inquiry-purge-message',
                text: `Found Inquiry action items in ${affectedCount} of ${this.totalScenes} scene${this.totalScenes !== 1 ? 's' : ''} in ${this.scopeLabel}:`
            });

            const listContainer = panel.createDiv({ cls: 'ert-inquiry-purge-list-container' });
            const listEl = listContainer.createEl('ul', { cls: 'ert-inquiry-purge-list' });
            this.affectedScenes.forEach(item => {
                const li = listEl.createEl('li', { cls: 'ert-inquiry-purge-list-item' });
                li.createSpan({ cls: 'ert-inquiry-purge-list-label', text: item.label });
                li.createSpan({
                    cls: 'ert-inquiry-purge-list-count',
                    text: `${item.lineCount} item${item.lineCount !== 1 ? 's' : ''}`
                });
            });

            panel.createDiv({
                cls: 'ert-inquiry-purge-details',
                text: 'User-written notes in Pending Edits are preserved.'
            });
            panel.createDiv({
                cls: 'ert-inquiry-purge-warning',
                text: 'This cannot be undone.'
            });
        }

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        if (affectedCount > 0) {
            new ButtonComponent(buttonRow)
                .setButtonText(`Purge ${affectedCount} scene${affectedCount !== 1 ? 's' : ''}`)
                .setWarning()
                .onClick(async () => {
                    this.close();
                    await this.onConfirm();
                });
        }
        new ButtonComponent(buttonRow)
            .setButtonText(affectedCount > 0 ? 'Cancel' : 'Close')
            .onClick(() => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

class InquiryCancelRunModal extends Modal {
    private didResolve = false;

    constructor(
        app: App,
        private estimateLabel: string,
        private onResolve: (confirmed: boolean) => void,
        private onClosed?: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '520px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-inquiry-cancel-modal');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Inquiry' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Cancel Inquiry Run?' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Canceling discards this run after the current pass returns.'
        });

        if (this.estimateLabel.trim()) {
            contentEl.createDiv({
                cls: 'ert-inquiry-cancel-modal-estimate',
                text: `ETA: ${this.estimateLabel}.`
            });
        }
        contentEl.createDiv({
            cls: 'ert-inquiry-cancel-modal-copy',
            text: 'You can work in another note if this Inquiry tab stays open. Cancel means start over. No resume.'
        });

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(actions)
            .setButtonText('Keep Running')
            .onClick(() => {
                this.resolveOnce(false);
                this.close();
            });
        new ButtonComponent(actions)
            .setButtonText('Cancel Run')
            .setWarning()
            .onClick(() => {
                this.resolveOnce(true);
                this.close();
            });
    }

    onClose(): void {
        this.contentEl.empty();
        this.onClosed?.();
        this.resolveOnce(false);
    }

    private resolveOnce(confirmed: boolean): void {
        if (this.didResolve) return;
        this.didResolve = true;
        this.onResolve(confirmed);
    }
}

type InquiryOmnibusModalOptions = {
    initialScope: InquiryScope;
    bookLabel: string;
    questions: InquiryQuestion[];
    providerSummary: string;
    providerLabel: string;
    logsEnabled: boolean;
    runDisabledReason?: string | null;
    priorProgress?: OmnibusProgressState;
    resumeAvailable?: boolean;
    resumeUnavailableReason?: string;
};

class InquiryOmnibusModal extends Modal {
    private didResolve = false;
    private selectedScope: InquiryScope;
    private createIndex = true;
    private runDisabledReason?: string | null;
    private isRunning = false;
    private abortRequested = false;
    private progressEl?: HTMLDivElement;
    private progressTextEl?: HTMLDivElement;
    private progressMicroEl?: HTMLDivElement;
    private configPanel?: HTMLDivElement;
    private actionsEl?: HTMLDivElement;
    private resultEl?: HTMLDivElement;
    private aiAdvancedPreEl?: HTMLPreElement;
    private aiAdvancedContext: AIRunAdvancedContext | null = null;

    constructor(
        app: App,
        private options: InquiryOmnibusModalOptions,
        private onResolve: (result: InquiryOmnibusPlan | null) => void
    ) {
        super(app);
        this.selectedScope = options.initialScope;
        this.runDisabledReason = options.runDisabledReason;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Inquiry' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Run Omnibus Pass' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Runs all enabled Inquiry questions for the selected scope.' });

        this.configPanel = contentEl.createDiv({ cls: 'ert-omnibus-config-panel ert-stack' });
        this.renderConfigPanel();

        this.progressEl = contentEl.createDiv({ cls: 'ert-omnibus-progress-panel ert-stack is-hidden' });

        this.resultEl = contentEl.createDiv({ cls: 'ert-omnibus-result-panel is-hidden' });

        this.actionsEl = contentEl.createDiv({ cls: 'ert-modal-actions' });
        this.renderConfigActions();
    }

    private renderConfigPanel(): void {
        if (!this.configPanel) return;
        this.configPanel.empty();

        // "How this run works" section
        const howSection = this.configPanel.createDiv({ cls: 'ert-omnibus-how-section' });
        howSection.createDiv({ cls: 'ert-omnibus-how-title', text: 'How this run works' });
        const howList = howSection.createEl('ul', { cls: 'ert-omnibus-how-list' });
        howList.createEl('li', { text: 'Load corpus once for the selected scope' });
        howList.createEl('li', { text: 'Run questions sequentially against that shared context' });
        howList.createEl('li', { text: 'Save results incrementally (Brief + Log per question)' });
        howList.createEl('li', { text: 'Safe to stop: abort at any time; completed results remain saved' });

        // Prior progress notice (resume info)
        const prior = this.options.priorProgress;
        if (prior) {
            const resumeNote = this.configPanel.createDiv({ cls: 'ert-omnibus-resume-note' });
            resumeNote.setText(`Last run stopped after question ${prior.completedQuestionIds.length} of ${prior.totalQuestions}.`);
            if (this.options.resumeUnavailableReason) {
                const configNote = resumeNote.createDiv({ cls: 'ert-field-note' });
                configNote.setText(`Resume unavailable: ${this.options.resumeUnavailableReason}`);
            }
        }

        const panel = this.configPanel.createDiv({ cls: 'ert-panel ert-panel--glass ert-stack' });

        const summaryGrid = panel.createDiv({ cls: 'ert-apr-status-grid ert-omnibus-summary-grid' });
        const summaryHeaderRow = summaryGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        ['Scope', 'Questions', 'Provider', 'Index'].forEach(label => {
            summaryHeaderRow.createDiv({
                text: label,
                cls: 'ert-apr-status-cell ert-apr-status-cell--header'
            });
        });

        const summaryRow = summaryGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });
        const scopeCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        const scopePillRow = scopeCell.createDiv({ cls: 'ert-inline' });
        const bookPill = scopePillRow.createEl('button', {
            cls: 'ert-badgePill ert-badgePill--sm ert-omnibus-pill',
            text: `Book (${this.options.bookLabel})`,
            type: 'button'
        });
        const sagaPill = scopePillRow.createEl('button', {
            cls: 'ert-badgePill ert-badgePill--sm ert-omnibus-pill',
            text: `Saga (${SIGMA_CHAR})`,
            type: 'button'
        });

        const totalCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        totalCell.createSpan({
            cls: 'ert-badgePill ert-badgePill--sm',
            text: `${this.options.questions.length} questions`
        });

        const providerCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        const providerPill = providerCell.createSpan({
            cls: 'ert-badgePill ert-badgePill--sm',
            text: this.options.providerLabel
        });
        setTooltip(providerPill, this.options.providerSummary);

        const indexCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        const indexRow = indexCell.createDiv({ cls: 'ert-inline' });
        const indexToggle = new ToggleComponent(indexRow);
        indexToggle.setValue(this.createIndex);
        indexToggle.onChange(value => {
            this.createIndex = value;
        });
        indexRow.createSpan({ text: 'Index note' });

        panel.createDiv({ cls: 'ert-divider' });

        const questionGrid = panel.createDiv({ cls: 'ert-apr-status-grid ert-omnibus-question-grid' });
        const questionHeaderRow = questionGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        ['Zone', 'Question', 'Lens', 'Scope', 'Status'].forEach(label => {
            questionHeaderRow.createDiv({
                text: label,
                cls: 'ert-apr-status-cell ert-apr-status-cell--header'
            });
        });

        const scopePills: HTMLSpanElement[] = [];
        const getScopeLabel = (scope: InquiryScope): string =>
            scope === 'saga' ? `Saga (${SIGMA_CHAR})` : `Book (${this.options.bookLabel})`;

        const updateScopeSelection = (scope: InquiryScope): void => {
            this.selectedScope = scope;
            const scopeLabel = getScopeLabel(scope);
            scopePills.forEach(pill => pill.setText(scopeLabel));
            bookPill.classList.toggle('is-active', scope === 'book');
            sagaPill.classList.toggle('is-active', scope === 'saga');
            bookPill.setAttribute('aria-pressed', scope === 'book' ? 'true' : 'false');
            sagaPill.setAttribute('aria-pressed', scope === 'saga' ? 'true' : 'false');
        };

        // SAFE: Modal classes do not have registerDomEvent; Obsidian manages Modal lifecycle
        bookPill.addEventListener('click', () => updateScopeSelection('book'));
        sagaPill.addEventListener('click', () => updateScopeSelection('saga')); // SAFE: continued
        updateScopeSelection(this.selectedScope);

        const lensLabel = 'Flow + Depth';
        const zoneOrder: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        zoneOrder.forEach(zone => {
            const zoneQuestions = this.options.questions.filter(question => question.zone === zone);
            if (!zoneQuestions.length) return;
            const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
            const groupRow = questionGrid.createDiv({ cls: 'ert-apr-status-row' });
            groupRow.createDiv({ cls: 'ert-apr-status-cell ert-omnibus-group', text: zoneLabel });

            zoneQuestions.forEach(question => {
                const dataRow = questionGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });

                const zoneCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                zoneCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: zoneLabel });

                const questionCell = dataRow.createDiv({ cls: 'ert-apr-status-cell ert-omnibus-question-cell' });
                const questionText = questionCell.createSpan({ cls: 'ert-omnibus-question', text: question.question });
                setTooltip(questionText, question.question);

                const lensCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                lensCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: lensLabel });

                const scopeCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                const scopePill = scopeCell.createSpan({
                    cls: 'ert-badgePill ert-badgePill--sm',
                    text: getScopeLabel(this.selectedScope)
                });
                scopePills.push(scopePill);

                const statusCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                statusCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: 'Brief + Log' });
            });
        });

        if (this.runDisabledReason) {
            const reason = this.configPanel.createDiv({ cls: 'ert-field-note' });
            reason.setText(`Run disabled: ${this.runDisabledReason}`);
        }

        const totalQuestions = this.options.questions.length;
        const briefLabel = totalQuestions === 1 ? 'Brief' : 'Briefs';
        const logLabel = totalQuestions === 1 ? 'Log' : 'Logs';
        const logsDisabledNote = this.options.logsEnabled ? '' : ' Logs are disabled in settings.';
        const volumeLine = this.configPanel.createDiv({ cls: 'ert-field-note' });
        volumeLine.setText(`This will generate ${totalQuestions} Inquiry ${briefLabel} and ${totalQuestions} ${logLabel}.${logsDisabledNote}`);
    }

    private renderConfigActions(): void {
        if (!this.actionsEl) return;
        this.actionsEl.empty();

        const prior = this.options.priorProgress;
        if (prior && this.options.resumeAvailable) {
            const resumeBtn = new ButtonComponent(this.actionsEl)
                .setButtonText('Resume Omnibus')
                .setCta();
            if (this.runDisabledReason) {
                resumeBtn.setDisabled(true);
            }
            resumeBtn.onClick(() => {
                if (this.runDisabledReason) return;
                this.resolveOnce({ scope: this.selectedScope, createIndex: this.createIndex, resume: true });
                this.switchToRunning();
            });
            setTooltip(resumeBtn.buttonEl, 'Resends corpus and runs remaining questions.');
        }

        const runButton = new ButtonComponent(this.actionsEl)
            .setButtonText(prior && this.options.resumeAvailable ? 'Restart Omnibus' : 'Run Omnibus')
            .setCta();
        if (this.runDisabledReason) {
            runButton.setDisabled(true);
        }
        runButton.onClick(() => {
            if (this.runDisabledReason) return;
            this.resolveOnce({ scope: this.selectedScope, createIndex: this.createIndex });
            this.switchToRunning();
        });

        new ButtonComponent(this.actionsEl)
            .setButtonText('Cancel')
            .onClick(() => {
                this.resolveOnce(null);
                this.close();
            });
    }

    /** Switch the modal into Running state. */
    switchToRunning(): void {
        this.isRunning = true;
        this.setHidden(this.configPanel, true);
        if (this.progressEl) {
            this.setHidden(this.progressEl, false);
            this.progressEl.empty();
            this.progressEl.createDiv({ cls: 'ert-omnibus-progress-title', text: 'Running Omnibus Pass...' });
            this.progressTextEl = this.progressEl.createDiv({ cls: 'ert-omnibus-progress-text' });
            this.progressTextEl.setText('Preparing...');
            this.progressMicroEl = this.progressEl.createDiv({ cls: 'ert-omnibus-progress-micro ert-field-note' });
            const advancedDetails = this.progressEl.createEl('details', { cls: 'ert-ai-advanced-details' });
            advancedDetails.createEl('summary', { text: 'AI Prompt & Context (Advanced)' });
            this.aiAdvancedPreEl = advancedDetails.createEl('pre', { cls: 'ert-ai-advanced-pre' });
            this.renderAiAdvancedContext();
        }
        if (this.actionsEl) {
            this.actionsEl.empty();
            new ButtonComponent(this.actionsEl)
                .setButtonText('Abort Run')
                .onClick(() => {
                    this.abortRequested = true;
                    if (this.progressMicroEl) {
                        this.progressMicroEl.setText('Stopping after current question...');
                    }
                });
        }
    }

    /** Update progress text from the running loop. */
    updateProgress(current: number, total: number, zone: string, questionLabel: string, micro?: string): void {
        if (this.progressTextEl) {
            this.progressTextEl.setText(`Question ${current} of ${total}`);
        }
        if (this.progressMicroEl && !this.abortRequested) {
            this.progressMicroEl.setText(micro ?? `${zone} \u00B7 ${questionLabel}`);
        }
    }

    setAiAdvancedContext(context: AIRunAdvancedContext | null): void {
        this.aiAdvancedContext = context;
        this.renderAiAdvancedContext();
    }

    private renderAiAdvancedContext(): void {
        if (!this.aiAdvancedPreEl) return;
        if (!this.aiAdvancedContext) {
            this.aiAdvancedPreEl.setText('Waiting for first AI request...');
            return;
        }
        const ctx = this.aiAdvancedContext;
        const lines = [
            `Role template: ${ctx.roleTemplateName}`,
            `Resolved model: ${ctx.provider} -> ${ctx.modelAlias} (${ctx.modelLabel})`,
            `Model selection reason: ${redactSensitiveValue(ctx.modelSelectionReason)}`,
            `Availability: ${ctx.availabilityStatus === 'visible' ? 'Visible to your key ✅' : ctx.availabilityStatus === 'not_visible' ? 'Not visible ⚠️' : 'Unknown (snapshot unavailable)'}`,
            `Applied caps: input=${ctx.maxInputTokens}, output=${ctx.maxOutputTokens}`,
            `Packaging: ${ctx.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : ctx.analysisPackaging === 'segmented' ? 'Segmented' : 'Automatic'}`,
            '',
            'Feature mode instructions:',
            redactSensitiveValue(ctx.featureModeInstructions || '(none)'),
            '',
            'Final composed prompt:',
            redactSensitiveValue(ctx.finalPrompt || '(none)')
        ];
        if (typeof ctx.executionPassCount === 'number' && ctx.executionPassCount > 1) {
            lines.splice(6, 0, `Pass count: ${ctx.executionPassCount}`);
        }
        if (ctx.packagingTriggerReason) {
            lines.splice(7, 0, `Packaging trigger: ${redactSensitiveValue(ctx.packagingTriggerReason)}`);
        }
        this.aiAdvancedPreEl.setText(lines.join('\n'));
    }

    /** Show completion or abort message and provide a Close button. */
    showResult(completed: number, total: number, aborted: boolean): void {
        this.isRunning = false;
        this.setHidden(this.progressEl, true);
        if (this.resultEl) {
            this.setHidden(this.resultEl, false);
            this.resultEl.empty();
            const briefLabel = completed === 1 ? 'Brief' : 'Briefs';
            const logLabel = completed === 1 ? 'Log' : 'Logs';
            if (aborted) {
                this.resultEl.createDiv({
                    cls: 'ert-omnibus-result-text',
                    text: `Omnibus pass stopped. ${completed} of ${total} completed.`
                });
            } else {
                this.resultEl.createDiv({
                    cls: 'ert-omnibus-result-text',
                    text: `Omnibus pass complete. ${completed} Inquiry ${briefLabel} and ${completed} ${logLabel} created.`
                });
            }
        }
        if (this.actionsEl) {
            this.actionsEl.empty();
            new ButtonComponent(this.actionsEl)
                .setButtonText('Close')
                .setCta()
                .onClick(() => this.close());
        }
    }

    isAbortRequested(): boolean {
        return this.abortRequested;
    }

    onClose(): void {
        this.resolveOnce(null);
    }

    private resolveOnce(result: InquiryOmnibusPlan | null): void {
        if (this.didResolve) return;
        this.didResolve = true;
        this.onResolve(result);
    }

    private setHidden(el: HTMLElement | undefined, hidden: boolean): void {
        if (!el) return;
        el.classList.toggle('is-hidden', hidden);
    }
}

type CorpusCcEntry = {
    id: string;
    entryKey: string;
    label: string;
    filePath: string;
    sceneId?: string;
    bookId?: string;
    bookLabel?: string;
    className: string;
    classKey: string;
    scope?: InquiryScope;
    mode: InquiryMaterialMode;
    sortLabel?: string;
};

type CorpusCcGroup = {
    key: string;
    className: string;
    items: CorpusCcEntry[];
    count: number;
    mode: InquiryMaterialMode;
    headerLabel?: string;
    headerTooltipLabel?: string;
};

type CorpusCcSlot = {
    group: SVGGElement;
    base: SVGRectElement;
    fill: SVGRectElement;
    border: SVGRectElement;
    lowSubstanceX: SVGGElement;
    lowSubstanceXPrimary: SVGLineElement;
    lowSubstanceXSecondary: SVGLineElement;
    icon: SVGGElement;
    iconOuter: SVGCircleElement;
    iconInner: SVGCircleElement;
};

type CorpusCcHeader = {
    group: SVGGElement;
    hit: SVGRectElement;
    icon: SVGGElement;
    iconOuter: SVGCircleElement;
    iconInner: SVGCircleElement;
    text: SVGTextElement;
};

type CorpusCcStats = {
    bodyWords: number;
    synopsisWords: number;
    synopsisQuality: SynopsisQuality;
    statusRaw?: string;
    due?: string;
    title?: string;
};

type InquiryWritebackOutcome = 'written' | 'duplicate' | 'skipped';
type InquiryGuidanceState = 'not-configured' | 'no-scenes' | 'ready' | 'running' | 'results';
type EngineProvider = 'anthropic' | 'gemini' | 'openai' | 'local';
type OmnibusProviderChoice = {
    provider: EngineProvider;
    modelId: string;
    modelLabel: string;
    useOmnibus: boolean;
    reason?: string;
};
type OmnibusProviderPlan = {
    choice: OmnibusProviderChoice | null;
    summary: string;
    label: string;
    disabledReason?: string;
};
type EngineChoice = {
    provider: EngineProvider;
    providerLabel: string;
    modelId: string;
    modelLabel: string;
    isActive: boolean;
    enabled: boolean;
    disabledReason?: string;
};
type AiSettingsFocus =
    | 'provider'
    | 'thinking-style'
    | 'access-level'
    | 'pinned-model'
    | 'execution-preference'
    | 'large-manuscript-handling';
type EngineFailureGuidance = {
    message: string;
};
export class InquiryView extends ItemView {
    static readonly viewType = INQUIRY_VIEW_TYPE;

    private plugin: RadialTimelinePlugin;
    private state = createDefaultInquiryState();

    private rootSvg?: SVGSVGElement;
    private scopeToggleButton?: SVGGElement;
    private scopeToggleIcon?: SVGUseElement;
    private modeToggleButton?: SVGGElement;
    private modeToggleIcon?: SVGUseElement;
    private artifactButton?: SVGGElement;
    private apiSimulationButton?: SVGGElement;
    private briefingPanelEl?: HTMLDivElement;
    private briefingListEl?: HTMLDivElement;
    private briefingFooterEl?: HTMLDivElement;
    private briefingSaveButton?: HTMLButtonElement;
    private briefingClearButton?: HTMLButtonElement;
    private briefingResetButton?: HTMLButtonElement;
    private briefingPurgeButton?: HTMLButtonElement;
    private briefingEmptyEl?: HTMLDivElement;
    private briefingPinned = false;
    private briefingHideTimer?: number;
    private engineBadgeGroup?: SVGGElement;
    private enginePanelEl?: HTMLDivElement;
    private enginePanelAllLabelEl?: HTMLDivElement;
    private enginePanelGuardEl?: HTMLDivElement;
    private enginePanelGuardNoteEl?: HTMLDivElement;
    private enginePanelGuardTokenEl?: HTMLElement;
    private enginePanelListEl?: HTMLDivElement;
    private enginePanelMetaEl?: HTMLDivElement;
    private enginePanelReadinessEl?: HTMLDivElement;
    private enginePanelReadinessStatusEl?: HTMLDivElement;
    private enginePanelReadinessMessageEl?: HTMLDivElement;
    private enginePanelReadinessActionsEl?: HTMLDivElement;
    private enginePanelReadinessScopeEl?: HTMLDivElement;
    private enginePanelHideTimer?: number;
    private pendingGuardQuestion?: InquiryQuestion;
    private enginePanelFailureGuidance: EngineFailureGuidance | null = null;
    private lastReadinessUiState?: InquiryReadinessUiState;
    private lastEngineAdvisoryContext: InquiryAdvisoryContext | null = null;
    private lastEngineAdvisoryInputKey = '';
    /** Memoized per-refresh-cycle. Invalidated at top of refreshUI(). */
    private _resolvedEngine: ResolvedInquiryEngine | null = null;
    private omnibusAbortRequested = false;
    private activeOmnibusModal?: InquiryOmnibusModal;
    private activeCancelRunModal?: InquiryCancelRunModal;
    private readonly minimap = new InquiryMinimapRenderer();
    private wasRunning = false;
    private zonePromptElements = new Map<InquiryZone, {
        group: SVGGElement;
        bg: SVGRectElement;
        glow: SVGRectElement;
        text: SVGTextElement;
    }>();
    private glyphAnchor?: SVGGElement;
    private glyph?: InquiryGlyph;
    private glyphHit?: SVGRectElement;
    private flowRingHit?: SVGCircleElement;
    private depthRingHit?: SVGCircleElement;
    private flowModeIconEl?: SVGSVGElement;
    private depthModeIconEl?: SVGSVGElement;
    private modeIconToggleHit?: SVGRectElement;
    private summaryEl?: SVGTextElement;
    private verdictEl?: SVGTextElement;
    private findingsListEl?: SVGGElement;
    private detailsToggle?: SVGGElement;
    private detailsIcon?: SVGUseElement;
    private detailsEl?: SVGGElement;
    private detailRows: SVGTextElement[] = [];
    private artifactPreviewEl?: SVGGElement;
    private artifactPreviewBg?: SVGRectElement;
    private hoverTextEl?: SVGTextElement;
    private sceneDossierGroup?: SVGGElement;
    private sceneDossierBg?: SVGRectElement;
    private sceneDossierHeader?: SVGTextElement;
    private sceneDossierBody?: SVGTextElement;
    private sceneDossierFooter?: SVGTextElement;
    private previewGroup?: SVGGElement;
    private previewHero?: SVGTextElement;
    private previewMeta?: SVGTextElement;
    private previewRunningNote?: SVGTextElement;
    private previewFooter?: SVGTextElement;
    private previewClickTarget?: SVGRectElement;
    private previewRows: InquiryPreviewRow[] = [];
    private previewRowDefaultLabels: string[] = [];
    private previewHideTimer?: number;
    private previewLast?: { zone: InquiryZone; question: string };
    private previewLocked = false;
    private previewShimmerGroup?: SVGGElement;
    private previewShimmerMask?: SVGMaskElement;
    private previewShimmerMaskRect?: SVGRectElement;
    private previewPanelHeight = 0;
    private payloadStats?: InquiryPayloadStats;
    private duplicatePulseTimer?: number;
    private rehydratePulseTimer?: number;
    private rehydrateHighlightTimer?: number;
    private rehydrateTargetKey?: string;
    private ccGroup?: SVGGElement;
    private ccLabelGroup?: SVGGElement;
    private ccLabelHit?: SVGRectElement;
    private ccLabel?: SVGTextElement;
    private ccLabelHint?: SVGGElement;
    private ccLabelHintIcon?: SVGUseElement;
    private ccEmptyText?: SVGTextElement;
    private ccClassLabels: CorpusCcHeader[] = [];
    private ccEntries: CorpusCcEntry[] = [];
    private ccSlots: CorpusCcSlot[] = [];
    private ccUpdateId = 0;
    private ccLayout?: { pageWidth: number; pageHeight: number; gap: number };
    private ccWordCache = new Map<string, {
        mtime: number;
        bodyWords: number;
        synopsisWords: number;
        synopsisQuality: SynopsisQuality;
        statusRaw?: string;
        due?: string;
        title?: string;
    }>();
    private corpusService = new InquiryCorpusService();
    private corpusWarningActive = false;
    private apiSimulationTimer?: number;
    private navPrevButton?: SVGGElement;
    private navNextButton?: SVGGElement;
    private navPrevIcon?: SVGUseElement;
    private navNextIcon?: SVGUseElement;
    private navSessionLabel?: SVGTextElement;
    private engineTimerLabel?: SVGTextElement;
    private helpToggleButton?: SVGGElement;
    private helpTipsEnabled = false;
    private iconSymbols = new Set<string>();
    private svgDefs?: SVGDefsElement;
    private providerSecretPresence: Partial<Record<AIProviderId, boolean>> = {};
    private providerSecretProbePending = new Set<AIProviderId>();
    private lastFocusSceneByBookId = new Map<string, string>();
    private corpusResolver: InquiryCorpusResolver;
    private corpus?: InquiryCorpusSnapshot;
    private focusPersistTimer?: number;
    private runner: InquiryRunnerService;
    private sessionStore: InquirySessionStore;
    private minimapResultPreviewActive = false;
    private guidanceState: InquiryGuidanceState = 'ready';
    private inquiryRunTokenCounter = 0;
    private activeInquiryRunToken = 0;
    private cancelledInquiryRunTokens = new Set<number>();
    private currentRunProgress: InquiryRunProgressEvent | null = null;
    private currentRunElapsedMs = 0;
    private currentRunEstimatedMaxMs = 0;

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.runner = new InquiryRunnerService(this.plugin, this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
        const lastMode = this.plugin.settings.inquiryLastMode;
        if (lastMode === 'flow' || lastMode === 'depth') {
            this.state.mode = lastMode;
        }
        this.ensurePromptConfig();
        this.state.selectedPromptIds = this.buildDefaultSelectedPromptIds();
        this.sessionStore = new InquirySessionStore(plugin);
        this.corpusResolver = new InquiryCorpusResolver(this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
    }

    private registerSvgEvent<TEvent extends Event>(
        element: SVGElement | undefined,
        event: string,
        handler: (event: TEvent) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (!element) return;
        const listener = handler as unknown as EventListener;
        element.addEventListener(event, listener, options);
        this.register(() => element.removeEventListener(event, listener, options));
    }

    getViewType(): string {
        return INQUIRY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return INQUIRY_VIEW_DISPLAY_TEXT;
    }

    getIcon(): string {
        return 'waves';
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        if (Platform.isMobile) { // SAFE: Platform imported from obsidian at top of file
            this.renderMobileGate();
            return;
        }
        this.loadFocusCache();
        this.renderDesktopLayout();
        this.refreshUI();
    }

    async onClose(): Promise<void> {
        if (this.focusPersistTimer) {
            window.clearTimeout(this.focusPersistTimer);
            this.focusPersistTimer = undefined;
        }
        if (this.apiSimulationTimer) {
            window.clearTimeout(this.apiSimulationTimer);
            this.apiSimulationTimer = undefined;
        }
        if (this.briefingHideTimer) {
            window.clearTimeout(this.briefingHideTimer);
            this.briefingHideTimer = undefined;
        }
        if (this.enginePanelHideTimer) {
            window.clearTimeout(this.enginePanelHideTimer);
            this.enginePanelHideTimer = undefined;
        }
        this.contentEl.empty();
    }

    private renderMobileGate(): void {
        const wrapper = this.contentEl.createDiv({ cls: 'ert-inquiry-mobile ert-ui' });
        wrapper.createDiv({ cls: 'ert-inquiry-mobile-title', text: 'Desktop required' });
        wrapper.createDiv({
            cls: 'ert-inquiry-mobile-subtitle',
            text: 'Inquiry is available on desktop only. Briefs remain readable on mobile.'
        });

        const actions = wrapper.createDiv({ cls: 'ert-inquiry-mobile-actions' });
        const openFolderBtn = actions.createEl('button', { cls: 'ert-inquiry-mobile-btn', text: 'Open Briefs folder' });
        const openLatestBtn = actions.createEl('button', { cls: 'ert-inquiry-mobile-btn', text: 'View most recent Brief' });

        this.registerDomEvent(openFolderBtn, 'click', () => { void this.openArtifactsFolder(); });
        this.registerDomEvent(openLatestBtn, 'click', () => { void this.openMostRecentArtifact(); });
    }

    private renderDesktopLayout(): void {
        this.contentEl.addClass('ert-inquiry-root');
        this.registerDomEvent(this.contentEl, 'click', (event: MouseEvent) => {
            if (!this.isErrorState()) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            const backgroundTarget = target.closest('.ert-inquiry-bg, .ert-inquiry-bg-image');
            if (!backgroundTarget) return;
            this.dismissError();
        }, { capture: true });
        const svg = createSvgElement('svg');
        svg.classList.add('ert-ui', 'ert-inquiry-svg');
        svg.setAttribute('viewBox', `${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.rootSvg = svg;
        this.contentEl.appendChild(svg);
        setupTooltipsFromDataAttributes(svg, this.registerDomEvent.bind(this), { rtOnly: true });

        const defs = createSvgElement('defs');
        this.svgDefs = defs;
        this.buildIconSymbols(defs);
        this.buildZoneGradients(defs);
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
        bgImage.setAttribute('href', this.getInquiryAssetHref('radial_texture.png'));
        svg.appendChild(bgImage);

        svg.classList.toggle('is-debug', DEBUG_SVG_OVERLAY);
        if (DEBUG_SVG_OVERLAY) {
            this.buildDebugOverlay(svg);
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

        this.scopeToggleButton = this.createIconButton(hudGroup, 0, 0, iconSize, 'columns-2', 'Toggle scope');
        this.scopeToggleIcon = this.scopeToggleButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.scopeToggleButton.querySelector('title')?.remove();
        addTooltipData(this.scopeToggleButton, this.balanceTooltipText('Toggle scope'), 'left');
        this.registerSvgEvent(this.scopeToggleButton, 'click', () => {
            this.handleScopeChange(this.state.scope === 'book' ? 'saga' : 'book');
        });

        const artifactX = (VIEWBOX_MAX - hudMargin - iconSize) - hudOffsetX;
        const helpX = artifactX - (iconSize + iconGap);
        const simulateX = helpX - (iconSize + iconGap);
        this.apiSimulationButton = this.createIconButton(hudGroup, simulateX, 0, iconSize, 'activity', 'Simulate API run');
        addTooltipData(this.apiSimulationButton, this.balanceTooltipText('Simulate API run'), 'left');
        this.registerSvgEvent(this.apiSimulationButton, 'click', () => this.startApiSimulation());

        this.helpToggleButton = this.createIconButton(
            hudGroup,
            helpX,
            0,
            iconSize,
            'help-circle',
            'Inquiry help',
            'ert-inquiry-help-btn'
        );
        this.helpToggleButton.querySelector('title')?.remove();
        this.registerSvgEvent(this.helpToggleButton, 'click', () => this.handleGuidanceHelpClick());

        this.artifactButton = this.createIconButton(hudGroup, artifactX, 0, iconSize, 'aperture', 'Briefing');
        this.artifactButton.querySelector('title')?.remove();
        this.registerSvgEvent(this.artifactButton, 'pointerenter', () => this.showBriefingPanel());
        this.registerSvgEvent(this.artifactButton, 'pointerleave', () => this.scheduleBriefingHide());
        this.registerSvgEvent(this.artifactButton, 'click', () => this.toggleBriefingPanel());

        const engineBadgeX = iconSize + iconGap;
        this.engineBadgeGroup = this.createIconButton(hudGroup, engineBadgeX, 0, iconSize, 'cpu', 'AI engine', 'ert-inquiry-engine-btn');
        this.engineBadgeGroup.querySelector('title')?.remove();
        this.registerSvgEvent(this.engineBadgeGroup, 'pointerenter', () => this.showEnginePanel());
        this.registerSvgEvent(this.engineBadgeGroup, 'pointerleave', () => this.scheduleEnginePanelHide());
        this.registerSvgEvent(this.engineBadgeGroup, 'click', () => this.openAiSettings());
        this.engineTimerLabel = createSvgElement('text') as unknown as SVGTextElement;
        this.engineTimerLabel.classList.add('ert-inquiry-engine-timer', 'ert-hidden');
        this.engineTimerLabel.setAttribute('x', String(engineBadgeX + iconSize + 12));
        this.engineTimerLabel.setAttribute('y', '28');
        this.engineTimerLabel.setAttribute('dominant-baseline', 'central');
        this.engineTimerLabel.setAttribute('text-anchor', 'start');
        hudGroup.appendChild(this.engineTimerLabel);

        const minimapGroup = createSvgGroup(canvasGroup, 'ert-inquiry-minimap', 0, MINIMAP_GROUP_Y);
        this.minimap.initElements(minimapGroup, VIEWBOX_SIZE);
        this.renderModeIcons(minimapGroup);

        this.glyphAnchor = createSvgGroup(canvasGroup, 'ert-inquiry-focus-area');
        this.glyph = new InquiryGlyph(this.glyphAnchor, {
            focusLabel: this.getFocusLabel(),
            flowValue: GLYPH_PLACEHOLDER_FLOW,
            depthValue: GLYPH_PLACEHOLDER_DEPTH,
            impact: 'low',
            assessmentConfidence: 'low'
        });

        this.flowRingHit = this.glyph.flowRingHit;
        this.depthRingHit = this.glyph.depthRingHit;
        this.glyphHit = this.glyph.labelHit;

        this.registerSvgEvent(this.glyphHit, 'click', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.handleGlyphClick();
        });
        this.registerSvgEvent(this.flowRingHit, 'click', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.handleRingClick('flow');
        });
        this.registerSvgEvent(this.depthRingHit, 'click', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.handleRingClick('depth');
        });
        if (this.modeIconToggleHit) {
            this.registerSvgEvent(this.modeIconToggleHit, 'click', () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.handleModeIconToggleClick();
            });
            this.registerSvgEvent(this.modeIconToggleHit, 'pointerenter', () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.setHoverText(this.buildModeToggleHoverText());
            });
            this.registerSvgEvent(this.modeIconToggleHit, 'pointerleave', () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.clearHoverText();
            });
            this.registerSvgEvent(this.modeIconToggleHit, 'keydown', (event: Event) => {
                if (this.isInquiryGuidanceLockout()) return;
                const keyboardEvent = event as KeyboardEvent;
                if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
                keyboardEvent.preventDefault();
                this.handleModeIconToggleClick();
            });
        }

        this.buildPromptPreviewPanel(canvasGroup);
        this.buildSceneDossierLayer(minimapGroup, SCENE_DOSSIER_Y);

        this.registerSvgEvent(this.glyphHit, 'pointerenter', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.setHoverText(this.buildFocusHoverText());
        });
        this.registerSvgEvent(this.glyphHit, 'pointerleave', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.clearHoverText();
        });
        this.registerSvgEvent(this.flowRingHit, 'pointerenter', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.setHoverText(this.buildRingHoverText('flow'));
        });
        this.registerSvgEvent(this.flowRingHit, 'pointerleave', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.clearHoverText();
        });
        this.registerSvgEvent(this.depthRingHit, 'pointerenter', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.setHoverText(this.buildRingHoverText('depth'));
        });
        this.registerSvgEvent(this.depthRingHit, 'pointerleave', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.clearHoverText();
        });

        const hudFooterY = 1360;
        const navGroup = createSvgGroup(hudGroup, 'ert-inquiry-nav', 0, hudFooterY);
        this.navPrevButton = this.createIconButton(navGroup, 0, -18, 44, 'chevron-left', 'Previous book', 'ert-inquiry-nav-btn');
        this.navPrevIcon = this.navPrevButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.navNextButton = this.createIconButton(navGroup, 54, -18, 44, 'chevron-right', 'Next book', 'ert-inquiry-nav-btn');
        this.navNextIcon = this.navNextButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerSvgEvent(this.navPrevButton, 'click', () => this.shiftFocus(-1));
        this.registerSvgEvent(this.navNextButton, 'click', () => this.shiftFocus(1));

        // Session timestamp label — to the right of nav arrows, same gap (10px).
        // Nav buttons: prev at x=0 (w=44), next at x=54 (w=44) → next ends at x=98. Gap = 10.
        this.navSessionLabel = createSvgElement('text') as unknown as SVGTextElement;
        this.navSessionLabel.classList.add('ert-inquiry-nav-session-label');
        this.navSessionLabel.setAttribute('x', '108');
        this.navSessionLabel.setAttribute('y', '4');  // vertical center of 44px buttons at y=-18
        this.navSessionLabel.setAttribute('dominant-baseline', 'central');
        this.navSessionLabel.setAttribute('text-anchor', 'start');
        this.navSessionLabel.textContent = '';
        navGroup.appendChild(this.navSessionLabel);

        this.buildBriefingPanel();
        this.buildEnginePanel();
    }

    private buildPromptPreviewPanel(parent: SVGGElement): void {
        const panel = createSvgGroup(parent, 'ert-inquiry-preview', 0, PREVIEW_PANEL_Y);
        this.previewGroup = panel;
        this.registerSvgEvent(panel, 'click', (event: MouseEvent) => {
            if (this.state.isRunning) {
                event.stopPropagation();
                void this.handleRunningPreviewCancelClick();
                return;
            }
            if (this.isErrorState()) {
                event.stopPropagation();
                void this.openInquiryErrorLog();
                return;
            }
            if (!this.isResultsState()) return;
            event.stopPropagation();
            this.dismissResults();
        });

        const clickTarget = createSvgElement('rect');
        clickTarget.classList.add('ert-inquiry-preview-hitbox');
        clickTarget.setAttribute('fill', 'transparent');
        clickTarget.setAttribute('pointer-events', 'all');
        panel.appendChild(clickTarget);
        this.previewClickTarget = clickTarget;

        const runningNote = createSvgText(panel, 'ert-inquiry-preview-running-note ert-hidden', '', 0, -24);
        runningNote.setAttribute('text-anchor', 'middle');
        runningNote.setAttribute('dominant-baseline', 'hanging');
        this.previewRunningNote = runningNote;

        const hero = createSvgText(panel, 'ert-inquiry-preview-hero', '', 0, PREVIEW_PANEL_PADDING_Y);
        hero.setAttribute('text-anchor', 'middle');
        hero.setAttribute('dominant-baseline', 'hanging');
        this.previewHero = hero;

        const meta = createSvgText(panel, 'ert-inquiry-preview-meta', '', 0, PREVIEW_PANEL_PADDING_Y);
        meta.setAttribute('text-anchor', 'middle');
        meta.setAttribute('dominant-baseline', 'hanging');
        this.previewMeta = meta;

        const rowLabels = ['', '', '', '', '', ''];
        this.previewRowDefaultLabels = rowLabels.slice();
        const tokensRowIndex = 4;
        this.previewRows = rowLabels.map((label, index) => {
            const group = createSvgGroup(panel, 'ert-inquiry-preview-pill');
            if (index === tokensRowIndex) {
                group.classList.add('is-tokens-slot');
            }
            const bg = createSvgElement('rect');
            bg.classList.add('ert-inquiry-preview-pill-bg');
            group.appendChild(bg);

            const pillTextY = (PREVIEW_PILL_HEIGHT / 2) + 1;
            const textEl = createSvgText(group, 'ert-inquiry-preview-pill-text', '', PREVIEW_PILL_PADDING_X, pillTextY);
            textEl.setAttribute('xml:space', 'preserve');
            textEl.setAttribute('dominant-baseline', 'middle');
            textEl.setAttribute('alignment-baseline', 'middle');
            textEl.setAttribute('text-anchor', 'start');

            return { group, bg, text: textEl, label };
        });

        const footer = createSvgText(panel, 'ert-inquiry-preview-footer', '', 0, 0);
        footer.setAttribute('text-anchor', 'middle');
        footer.setAttribute('dominant-baseline', 'hanging');
        this.previewFooter = footer;

        this.ensurePreviewShimmerResources(panel);
        if (!this.previewShimmerGroup) {
            const group = createSvgGroup(panel, 'ert-inquiry-preview-shimmer-group');
            if (this.previewShimmerMask) {
                group.setAttribute('mask', `url(#${this.previewShimmerMask.getAttribute('id')})`);
            }
            // Use simple alpha blending for "highlight" effect
            this.previewShimmerGroup = group;

            // Set the travel distance css variable on the mask rect
            if (this.previewShimmerMaskRect) {
                const travel = Math.max(0, (PREVIEW_PANEL_WIDTH + (PREVIEW_SHIMMER_OVERHANG * 2)) - PREVIEW_SHIMMER_WIDTH);
                this.previewShimmerMaskRect.style.setProperty('--ert-inquiry-shimmer-travel', `${travel}px`);
            }
        }

        this.updatePromptPreview('setup', this.state.mode, 'Hover a question to preview its payload.', undefined, undefined, { hideEmpty: true });
        this.hidePromptPreview(true);
    }

    private buildBriefingPanel(): void {
        if (this.briefingPanelEl) return;
        const panel = this.contentEl.createDiv({ cls: 'ert-inquiry-briefing-panel ert-hidden ert-ui' });
        this.briefingPanelEl = panel;
        const header = panel.createDiv({ cls: 'ert-inquiry-briefing-header' });
        header.createDiv({ cls: 'ert-inquiry-briefing-title', text: 'Recent Inquiry Sessions' });
        this.briefingListEl = panel.createDiv({ cls: 'ert-inquiry-briefing-list' });
        this.briefingEmptyEl = panel.createDiv({ cls: 'ert-inquiry-briefing-empty', text: 'No recent inquiries yet.' });
        this.briefingFooterEl = panel.createDiv({ cls: 'ert-inquiry-briefing-footer' });
        this.briefingSaveButton = this.briefingFooterEl.createEl('button', {
            cls: 'ert-inquiry-briefing-save',
            text: 'Save current brief'
        });
        this.registerDomEvent(this.briefingSaveButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            void this.handleBriefingSaveClick();
        });
        this.briefingClearButton = this.briefingFooterEl.createEl('button', {
            cls: 'ert-inquiry-briefing-clear',
            text: 'Clear recent sessions'
        });
        this.briefingResetButton = this.briefingFooterEl.createEl('button', {
            cls: 'ert-inquiry-briefing-reset',
            text: 'Reset Overrides to Settings'
        });
        addTooltipData(
            this.briefingResetButton,
            this.balanceTooltipText('Resets live corpus overrides only.'),
            'top'
        );
        this.briefingPurgeButton = this.briefingFooterEl.createEl('button', {
            cls: 'ert-inquiry-briefing-purge',
            text: 'Purge action items'
        });
        addTooltipData(
            this.briefingPurgeButton,
            this.balanceTooltipText('Removes Inquiry-generated action items from scene frontmatter. User notes are preserved.'),
            'top'
        );
        this.briefingFooterEl.createDiv({
            cls: 'ert-inquiry-briefing-note',
            text: 'Does not delete briefs.'
        });
        this.registerDomEvent(this.briefingClearButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            this.handleBriefingClearClick();
        });
        this.registerDomEvent(this.briefingResetButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            this.handleBriefingResetCorpusClick();
        });
        this.registerDomEvent(this.briefingPurgeButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            void this.handleBriefingPurgeClick();
        });
        this.registerDomEvent(panel, 'pointerenter', () => this.cancelBriefingHide());
        this.registerDomEvent(panel, 'pointerleave', () => this.scheduleBriefingHide());
        this.refreshBriefingPanel();
    }

    private buildEnginePanel(): void {
        if (this.enginePanelEl) return;
        const panel = this.contentEl.createDiv({ cls: 'ert-inquiry-engine-panel ert-hidden ert-ui' });
        this.enginePanelEl = panel;
        const header = panel.createDiv({ cls: 'ert-inquiry-engine-header' });
        header.createDiv({ cls: 'ert-inquiry-engine-title', text: 'AI Engine' });
        this.enginePanelMetaEl = header.createDiv({ cls: 'ert-inquiry-engine-meta', text: '' });

        this.enginePanelReadinessEl = panel.createDiv({ cls: 'ert-inquiry-engine-readiness' });
        this.enginePanelReadinessStatusEl = this.enginePanelReadinessEl.createDiv({
            cls: 'ert-inquiry-engine-readiness-status',
            text: 'Ready'
        });
        this.enginePanelReadinessMessageEl = this.enginePanelReadinessEl.createDiv({
            cls: 'ert-inquiry-engine-readiness-message',
            text: ''
        });
        this.enginePanelReadinessScopeEl = this.enginePanelReadinessEl.createDiv({
            cls: 'ert-inquiry-engine-readiness-scope',
            text: ''
        });
        this.enginePanelReadinessActionsEl = this.enginePanelReadinessEl.createDiv({
            cls: 'ert-inquiry-engine-readiness-actions'
        });

        this.enginePanelGuardEl = panel.createDiv({ cls: 'ert-inquiry-engine-guard ert-hidden' });
        this.enginePanelGuardNoteEl = this.enginePanelGuardEl.createDiv({
            cls: 'ert-inquiry-engine-guard-note'
        });
        this.enginePanelGuardNoteEl.setText('Adjust settings to continue.');

        this.enginePanelListEl = panel.createDiv({ cls: 'ert-inquiry-engine-list' });
        this.registerDomEvent(panel, 'pointerenter', () => this.cancelEnginePanelHide());
        this.registerDomEvent(panel, 'pointerleave', () => this.scheduleEnginePanelHide());
        this.refreshEnginePanel();
    }

    private showEnginePanel(): void {
        if (!this.enginePanelEl) return;
        this.cancelEnginePanelHide();
        this.refreshEnginePanel();
        if (this.engineBadgeGroup) this.positionPanelNearButton(this.enginePanelEl, this.engineBadgeGroup, 'left');
        this.enginePanelEl.classList.remove('ert-hidden');
    }

    private hideEnginePanel(): void {
        if (!this.enginePanelEl) return;
        this.cancelEnginePanelHide();
        this.enginePanelEl.classList.add('ert-hidden');
    }

    private scheduleEnginePanelHide(): void {
        this.cancelEnginePanelHide();
        this.enginePanelHideTimer = window.setTimeout(() => {
            this.hideEnginePanel();
        }, BRIEFING_HIDE_DELAY_MS);
    }

    private cancelEnginePanelHide(): void {
        if (this.enginePanelHideTimer) {
            window.clearTimeout(this.enginePanelHideTimer);
            this.enginePanelHideTimer = undefined;
        }
    }

    /**
     * Render the engine panel as a read-only status/diagnostics display.
     *
     * Shows the resolved engine from canonical AI Strategy (not a model picker).
     * Inquiry does not choose models — it reports the resolved engine.
     */
    private refreshEnginePanel(): void {
        if (!this.enginePanelListEl) return;
        this.enginePanelListEl.empty();

        const engine = this.getResolvedEngine();
        const readinessUi = this.buildReadinessUiState();
        const corpusEstimate = this.getRTCorpusEstimate();
        this.lastReadinessUiState = readinessUi;
        const advisoryContext = this.buildInquiryAdvisoryContext(readinessUi);
        this.lastEngineAdvisoryContext = advisoryContext;

        const failureGuidance = this.getEngineFailureGuidance();
        this.enginePanelFailureGuidance = failureGuidance;

        // ── 1. Header summary (non-repeated) ──
        if (this.enginePanelMetaEl) {
            this.enginePanelMetaEl.setText(`${engine.providerLabel} · ${engine.modelLabel}`);
        }

        // ── 2. Status card (readiness strip) ──
        this.renderEngineReadinessStrip(readinessUi);

        // ── Guard (error/failure guidance) ──
        if (this.enginePanelGuardEl) {
            const showGuard = Boolean(failureGuidance);
            this.enginePanelGuardEl.classList.toggle('ert-hidden', !showGuard);
            this.enginePanelGuardEl.classList.toggle('is-error-guidance', Boolean(failureGuidance));
            if (this.enginePanelGuardNoteEl && failureGuidance) {
                this.enginePanelGuardNoteEl.empty();
                this.enginePanelGuardTokenEl = undefined;
                this.enginePanelGuardNoteEl.setText(failureGuidance.message);
            }
        }

        // ── 3. Details card ──
        const policyLabel = engine.policySource === 'featureOverride'
            ? 'Inquiry override'
            : engine.policySource === 'globalPolicy'
                ? 'Global AI Strategy'
                : 'Legacy fallback';

        const detailsCard = this.enginePanelListEl.createDiv({ cls: 'ert-inquiry-engine-details-card' });

        const sourceRow = detailsCard.createDiv({ cls: 'ert-inquiry-engine-detail-row' });
        sourceRow.createSpan({ cls: 'ert-inquiry-engine-detail-label', text: 'Source' });
        sourceRow.createSpan({ cls: 'ert-inquiry-engine-detail-value', text: policyLabel });

        const idRow = detailsCard.createDiv({ cls: 'ert-inquiry-engine-detail-row' });
        idRow.createSpan({ cls: 'ert-inquiry-engine-detail-label', text: 'Model ID' });
        idRow.createSpan({ cls: 'ert-inquiry-engine-detail-value', text: engine.blocked ? '—' : engine.modelId });

        const contextRow = detailsCard.createDiv({ cls: 'ert-inquiry-engine-detail-row' });
        contextRow.createSpan({ cls: 'ert-inquiry-engine-detail-label', text: 'Model context' });
        contextRow.createSpan({
            cls: 'ert-inquiry-engine-detail-value',
            text: engine.blocked ? '—' : this.formatTokenEstimate(engine.contextWindow)
        });

        const payloadRow = detailsCard.createDiv({ cls: 'ert-inquiry-engine-detail-row' });
        payloadRow.createSpan({ cls: 'ert-inquiry-engine-detail-label', text: 'Corpus (current)' });
        payloadRow.createSpan({
            cls: 'ert-inquiry-engine-detail-value',
            text: engine.blocked ? '—' : `~${this.formatTokenEstimate(corpusEstimate.estimatedTokens)}`
        });

        const safeRow = detailsCard.createDiv({ cls: 'ert-inquiry-engine-detail-row' });
        safeRow.createSpan({ cls: 'ert-inquiry-engine-detail-label', text: 'Safe input (single pass)' });
        safeRow.createSpan({
            cls: 'ert-inquiry-engine-detail-value',
            text: engine.blocked ? '—' : (readinessUi.safeInputBudget > 0 ? `~${this.formatTokenEstimate(readinessUi.safeInputBudget)}` : 'n/a')
        });

        // ── 4. Advisor slot ──
        const advisorSlot = this.enginePanelListEl.createDiv({ cls: 'ert-inquiry-engine-advisor-slot' });
        if (advisoryContext) {
            this.renderEngineAdvisoryCard(advisorSlot, advisoryContext);
        }

        // ── 5. Action row ──
        const actionsRow = this.enginePanelListEl.createDiv({ cls: 'ert-inquiry-engine-actions' });

        const settingsButton = actionsRow.createEl('button', {
            cls: 'ert-inquiry-engine-action-button',
            text: 'Open AI Settings',
            attr: { type: 'button' }
        });
        this.registerDomEvent(settingsButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            this.hideEnginePanel();
            this.openAiSettings(['provider']);
        });

        const logButton = actionsRow.createEl('button', {
            cls: 'ert-inquiry-engine-action-button',
            text: 'Open Inquiry Log',
            attr: { type: 'button' }
        });
        this.registerDomEvent(logButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            this.hideEnginePanel();
            void this.openInquiryErrorLog();
        });
    }

    private openAiSettings(targets: AiSettingsFocus[] = []): void {
        if (this.plugin.settingsTab) {
            this.plugin.settingsTab.setActiveTab('ai');
        }
        // SAFE: any type used for accessing Obsidian's internal settings API
        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById('radial-timeline');
        }
        window.setTimeout(() => {
            const uniqueTargets = Array.from(new Set(targets));
            uniqueTargets.forEach((target, index) => {
                window.setTimeout(() => this.scrollAndPulseAiSetting(target, index === 0), index * 120);
            });
        }, 180);
    }

    private scrollAndPulseAiSetting(target: AiSettingsFocus, shouldScroll: boolean): void {
        const el = document.querySelector(`[data-ert-role="ai-setting:${target}"]`);
        if (!(el instanceof HTMLElement)) return;
        if (shouldScroll) {
            el.scrollIntoView({ block: 'center' });
        }
        el.classList.remove('is-attention-pulse');
        void el.offsetWidth;
        el.classList.add('is-attention-pulse');
        window.setTimeout(() => {
            el.classList.remove('is-attention-pulse');
        }, 2600);
    }

    private getEngineFailureGuidance(): EngineFailureGuidance | null {
        const result = this.state.activeResult;
        if (!result) return null;
        if (!this.isErrorResult(result)) return null;
        const reason = this.formatApiErrorReason(result);
        const reasonSuffix = reason ? ` (${reason})` : '';
        return {
            message: `Inquiry failed${reasonSuffix}. Use Open Inquiry Log in the footer for the detailed error report.`
        };
    }

    private getEngineContextQuestion(): string | null {
        if (this.pendingGuardQuestion?.question) return this.pendingGuardQuestion.question;
        const activeQuestion = this.getQuestionTextById(this.state.activeQuestionId);
        return activeQuestion ?? null;
    }

    private buildEnginePayloadSummary(): {
        text: string;
        inputTokens: number;
        tier: TokenTier;
    } {
        return buildEnginePayloadSummaryPure({
            payloadStats: this.getPayloadStats(),
            scope: this.state.scope,
            focusLabel: this.getFocusBookLabel()
        });
    }

    private getRTCorpusEstimate(): RTCorpusTokenEstimate {
        return buildRTCorpusEstimate(this.getPayloadStats());
    }

    private buildInquiryAdvisoryContext(
        readinessUi: InquiryReadinessUiState
    ): InquiryAdvisoryContext | null {
        if (readinessUi.pending) return null;
        const snapshot = this.plugin.getInquiryEstimateService().getSnapshot();
        if (!snapshot) return null;

        const engine = this.getResolvedEngine();
        const currentModel = readinessUi.model
            ?? BUILTIN_MODELS.find(model => model.provider === engine.provider && model.id === engine.modelId)
            ?? null;
        if (!currentModel) return null;

        const advancedContext = getLastAiAdvancedContext(this.plugin, 'InquiryMode');
        const corpusFingerprint = snapshot.corpus.corpusFingerprint || this.state.corpusFingerprint || 'unknown';
        const corpusFingerprintReused = advancedContext?.reuseState === 'warm';
        const overrideSummary = this.getCorpusOverrideSummary();
        const estimatedInputTokens = snapshot.estimate.estimatedInputTokens;
        const advisoryInputKey = buildAdvisoryInputKey({
            scope: this.state.scope,
            focusLabel: this.getFocusLabel(),
            provider: engine.provider,
            modelId: engine.modelId,
            packaging: readinessUi.packaging,
            estimatedInputTokens,
            estimateMethod: readinessUi.estimateMethod,
            estimateUncertaintyTokens: readinessUi.estimateUncertaintyTokens,
            corpusFingerprint,
            overrideSummary,
            corpusFingerprintReused
        });
        if (this.lastEngineAdvisoryInputKey === advisoryInputKey) {
            return this.lastEngineAdvisoryContext;
        }

        const advisory = computeInquiryAdvisoryContext({
            scope: this.state.scope,
            focusLabel: this.getFocusLabel(),
            resolvedEngine: engine,
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: readinessUi.packaging,
            estimatedInputTokens,
            currentSafeInputBudget: readinessUi.safeInputBudget,
            estimationMethod: readinessUi.estimateMethod,
            estimateUncertaintyTokens: readinessUi.estimateUncertaintyTokens,
            corpusFingerprint,
            corpusFingerprintReused,
            overrideSummary,
            previousContext: this.lastEngineAdvisoryContext
        });
        this.lastEngineAdvisoryInputKey = advisoryInputKey;
        return advisory;
    }

    private renderEngineAdvisoryCard(container: HTMLElement, advisory: InquiryAdvisoryContext): void {
        container.empty();

        const card = container.createDiv({ cls: 'ert-inquiry-engine-advisor-card' });
        card.createDiv({ cls: 'ert-inquiry-engine-advisor-title', text: 'INQUIRY ADVISOR' });
        card.createDiv({
            cls: 'ert-inquiry-engine-advisor-message',
            text: advisory.recommendation.message
        });
        advisory.recommendation.options.forEach(option => {
            card.createDiv({
                cls: 'ert-inquiry-engine-advisor-suggestion',
                text: `${option.providerLabel} · ${option.modelLabel}`
            });
        });
    }

    private getCurrentPromptQuestion(): string | null {
        const activeZone = this.state.activeZone ?? 'setup';
        const activePrompt = this.getActivePrompt(activeZone);
        if (activePrompt?.question?.trim()) return activePrompt.question.trim();
        const fallback = this.getPromptOptions('setup')[0];
        return fallback?.question?.trim() || null;
    }

    private getCanonicalAiSettings(): AiSettingsV1 {
        const validated = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings());
        this.plugin.settings.aiSettings = validated.value;
        return validated.value;
    }

    private getAccessTierForProvider(provider: AIProviderId, aiSettings: AiSettingsV1): AccessTier {
        if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
        if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
        if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
        return 1;
    }

    private buildReadinessUiState(): InquiryReadinessUiState {
        const engine = this.getResolvedEngine();
        const provider = engine.provider === 'none' ? 'openai' as const : engine.provider;
        const engineProvider = mapAiProviderToLegacyProvider(provider) as EngineProvider;
        const aiSettings = this.getCanonicalAiSettings();
        return buildReadinessUiStatePure({
            snapshot: this.plugin.getInquiryEstimateService().getSnapshot(),
            scope: this.state.scope,
            focusLabel: this.getFocusLabel(),
            aiSettings,
            resolvedEngine: engine,
            hasCredential: this.getProviderAvailability(engineProvider).enabled,
            accessTier: this.getAccessTierForProvider(provider, aiSettings),
            payloadStats: this.getPayloadStats(),
            selectedSceneOverrideCount: this.getSelectedSceneOverrideEntries().length,
            hasAnyBodyEvidence: this.hasAnyBodyEvidence(),
            estimateSummaryOnlyTokens: this.estimateSummaryOnlyTokens('')
        });
    }

    private buildRunScopeLabel(stats: InquiryPayloadStats, selectedSceneCount: number): string {
        return buildRunScopeLabelPure(stats, selectedSceneCount, this.state.scope, this.getFocusLabel());
    }

    private resolveEnginePopoverState(readinessUi: InquiryReadinessUiState): InquiryEnginePopoverState {
        return resolveEnginePopoverStatePure(readinessUi);
    }

    private estimateStructuredPassCount(readinessUi: InquiryReadinessUiState): number {
        return estimateStructuredPassCountPure(readinessUi);
    }

    private getCurrentPassPlan(readinessUi: InquiryReadinessUiState): PassPlanResult {
        return getCurrentPassPlanPure(readinessUi, getLastAiAdvancedContext(this.plugin, 'InquiryMode'));
    }

    private renderEngineReadinessStrip(readinessUi: InquiryReadinessUiState): void {
        if (!this.enginePanelReadinessEl
            || !this.enginePanelReadinessStatusEl
            || !this.enginePanelReadinessMessageEl
            || !this.enginePanelReadinessActionsEl
            || !this.enginePanelReadinessScopeEl) {
            return;
        }

        const popoverState = this.resolveEnginePopoverState(readinessUi);
        const stateClass = popoverState === 'ready'
            ? 'is-ready'
            : popoverState === 'multi-pass'
                ? 'is-amber'
                : 'is-error';
        this.enginePanelReadinessEl.classList.remove('is-ready', 'is-amber', 'is-error');
        this.enginePanelReadinessEl.classList.add(stateClass);

        const engine = this.getResolvedEngine();
        const statusText = engine.blocked
            ? 'No working model'
            : popoverState === 'ready'
                ? 'Ready'
                : popoverState === 'multi-pass'
                    ? 'Multi-pass'
                    : 'Exceeds limits';
        this.enginePanelReadinessStatusEl.setText(statusText);

        const corpusEstimate = this.getRTCorpusEstimate();
        const corpusLabel = this.formatTokenEstimate(corpusEstimate.estimatedTokens);
        const passPlan = this.getCurrentPassPlan(readinessUi);
        if (popoverState === 'ready') {
            this.enginePanelReadinessMessageEl.setText(`Corpus: ~${corpusLabel}. Single pass possible for current engine.`);
        } else if (popoverState === 'multi-pass') {
            const estimateLabel = passPlan.estimatedPassCount ?? passPlan.displayPassCount;
            const recentRunSuffix = passPlan.recentExactPassCount
                ? ` Recent run used ${passPlan.recentExactPassCount} passes.`
                : '';
            this.enginePanelReadinessMessageEl.setText(
                `Corpus: ~${corpusLabel}. Multi-pass required for current engine `
                + `(${estimateLabel} passes expected). Automatic packaging will split the request.${recentRunSuffix}`
            );
        } else if (readinessUi.readiness.cause === 'single_pass_limit') {
            this.enginePanelReadinessMessageEl.setText(`Corpus: ~${corpusLabel}. Single-pass mode blocks this run for the current engine.`);
        } else {
            this.enginePanelReadinessMessageEl.setText(readinessUi.reason);
        }
        this.enginePanelReadinessScopeEl.setText(readinessUi.runScopeLabel);

        this.enginePanelReadinessActionsEl.empty();
    }

    private hasAnyBodyEvidence(): boolean {
        const stats = this.getPayloadStats();
        return stats.sceneFullTextCount > 0 || stats.bookOutlineFullCount > 0 || stats.sagaOutlineFullCount > 0;
    }

    private estimateSummaryOnlyTokens(questionText: string): number {
        const manifest = this.buildCorpusManifest('payload-preview', {
            questionZone: this.previewLast?.zone,
            applyOverrides: true
        });
        const summaryChars = manifest.entries.reduce((sum, entry) => {
            const isSynopsisCapable = entry.class === 'scene' || entry.class === 'outline';
            if (!isSynopsisCapable) {
                return sum + this.getEntryContentLength(entry);
            }
            const summary = this.getEntrySummary(entry.path);
            if (summary.length > 0) {
                return sum + summary.length;
            }
            return sum + this.getEntryContentLength(entry);
        }, 0);
        return this.estimateTokensFromChars(summaryChars + (questionText?.length ?? 0) + INQUIRY_PROMPT_OVERHEAD_CHARS);
    }

    private getSelectedSceneOverrideEntries(): Array<{ entryKey: string; mode: InquiryMaterialMode }> {
        const entries = this.getCorpusCcEntries().filter(entry => entry.classKey === 'scene');
        const selected: Array<{ entryKey: string; mode: InquiryMaterialMode }> = [];
        entries.forEach(entry => {
            const override = this.getCorpusItemOverride(entry.classKey, entry.filePath, entry.scope, entry.sceneId);
            if (!override || !this.isModeActive(override)) return;
            selected.push({ entryKey: entry.entryKey, mode: override });
        });
        return selected;
    }

    /** Position an HTML panel near an SVG trigger button, anchored left or right. */
    private positionPanelNearButton(panel: HTMLElement, button: SVGElement, align: 'left' | 'right'): void {
        const containerRect = this.contentEl.getBoundingClientRect();
        const btnRect = (button as unknown as Element).getBoundingClientRect();
        if (align === 'right') {
            // Align panel's right edge with the button's right edge
            const rightOffset = containerRect.right - btnRect.right;
            panel.style.left = '';
            panel.style.right = `${Math.max(0, rightOffset)}px`;
        } else {
            // Align panel's left edge with the button's left edge
            const leftOffset = btnRect.left - containerRect.left;
            panel.style.right = '';
            panel.style.left = `${Math.max(0, leftOffset)}px`;
        }
    }

    private showBriefingPanel(): void {
        if (!this.briefingPanelEl) return;
        this.cancelBriefingHide();
        this.refreshBriefingPanel();
        if (this.artifactButton) this.positionPanelNearButton(this.briefingPanelEl, this.artifactButton, 'right');
        this.briefingPanelEl.classList.remove('ert-hidden');
    }

    private hideBriefingPanel(force = false): void {
        if (!this.briefingPanelEl) return;
        if (this.briefingPinned && !force) return;
        this.cancelBriefingHide();
        this.briefingPanelEl.classList.add('ert-hidden');
    }

    private toggleBriefingPanel(): void {
        if (!this.briefingPanelEl) return;
        if (this.briefingPinned) {
            this.briefingPinned = false;
            this.hideBriefingPanel(true);
            return;
        }
        this.briefingPinned = true;
        this.showBriefingPanel();
    }

    private scheduleBriefingHide(): void {
        if (this.briefingPinned) return;
        this.cancelBriefingHide();
        this.briefingHideTimer = window.setTimeout(() => {
            this.hideBriefingPanel(true);
        }, BRIEFING_HIDE_DELAY_MS);
    }

    private cancelBriefingHide(): void {
        if (this.briefingHideTimer) {
            window.clearTimeout(this.briefingHideTimer);
            this.briefingHideTimer = undefined;
        }
    }

    private refreshBriefingPanel(): void {
        if (!this.briefingListEl || !this.briefingEmptyEl || !this.briefingFooterEl) return;
        this.briefingListEl.empty();
        const sessions = this.sessionStore.getRecentSessions(BRIEFING_SESSION_LIMIT);
        const hasSessions = sessions.length > 0;
        const blocked = this.isInquiryBlocked();
        if (!hasSessions) {
            this.briefingEmptyEl.classList.remove('ert-hidden');
        } else {
            this.briefingEmptyEl.classList.add('ert-hidden');
            const grouped = this.groupSessionsByRecency(sessions);
            grouped.forEach(group => {
                if (!group.sessions.length) return;
                const groupEl = this.briefingListEl?.createDiv({ cls: 'ert-inquiry-briefing-group' });
                if (!groupEl) return;
                groupEl.createDiv({ cls: 'ert-inquiry-briefing-group-label', text: group.label });
                const groupList = groupEl.createDiv({ cls: 'ert-inquiry-briefing-group-list' });
                group.sessions.forEach(session => this.renderBriefingSessionItem(groupList, session, blocked));
            });
        }

        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const activeStatus = activeSession ? this.resolveSessionStatus(activeSession) : null;
        const canSave = !!activeSession && activeStatus === 'unsaved';
        this.briefingSaveButton?.classList.toggle('ert-hidden', !canSave);
        this.briefingClearButton?.classList.remove('ert-hidden');
        this.briefingFooterEl.classList.remove('ert-hidden');
    }

    private groupSessionsByRecency(
        sessions: InquirySession[]
    ): Array<{ label: 'Today' | 'Yesterday' | 'Earlier'; sessions: InquirySession[] }> {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterdayStart = todayStart - 86_400_000;
        const grouped: Array<{ label: 'Today' | 'Yesterday' | 'Earlier'; sessions: InquirySession[] }> = [
            { label: 'Today', sessions: [] },
            { label: 'Yesterday', sessions: [] },
            { label: 'Earlier', sessions: [] }
        ];
        sessions.forEach(session => {
            const ts = session.createdAt || session.lastAccessed;
            if (ts >= todayStart) {
                grouped[0].sessions.push(session);
            } else if (ts >= yesterdayStart) {
                grouped[1].sessions.push(session);
            } else {
                grouped[2].sessions.push(session);
            }
        });
        return grouped;
    }

    private renderBriefingSessionItem(container: HTMLElement, session: InquirySession, blocked: boolean): void {
        const item = container.createDiv({ cls: 'ert-inquiry-briefing-item' });
        const zoneId = session.questionZone ?? this.findPromptZoneById(session.result.questionId) ?? 'setup';
        item.classList.add(`is-zone-${zoneId}`);
        if (session.key === this.rehydrateTargetKey) {
            item.classList.add('is-rehydrate-target');
        }
        if (session.key === this.state.activeSessionId) {
            item.classList.add('is-active');
        }
        const textRow = item.createDiv({ cls: 'ert-inquiry-briefing-row ert-inquiry-briefing-row--text' });
        const main = textRow.createDiv({ cls: 'ert-inquiry-briefing-main' });
        main.createDiv({ cls: 'ert-inquiry-briefing-title-row', text: this.resolveSessionQuestionLabel(session) });
        const overrideLabel = this.formatSessionOverrides(session);
        const metaText = `${this.formatSessionScope(session)} · ${this.formatSessionProviderModel(session)} · ${this.formatSessionTime(session)}${overrideLabel ? ` · ${overrideLabel}` : ''}`;
        main.createDiv({ cls: 'ert-inquiry-briefing-meta', text: metaText });

        const actionRow = item.createDiv({ cls: 'ert-inquiry-briefing-row ert-inquiry-briefing-row--actions' });
        const status = this.resolveSessionStatus(session);
        const statusEl = actionRow.createDiv({
            cls: `ert-inquiry-briefing-status ert-inquiry-briefing-status--${status}`,
            text: status
        });
        statusEl.setAttribute('aria-label', `History status: ${status}`);

        const pendingEditsApplied = !!session.pendingEditsApplied;
        const autoPopulateEnabled = this.plugin.settings.inquiryActionNotesAutoPopulate ?? false;
        const actionGroup = actionRow.createDiv({ cls: 'ert-inquiry-briefing-actions' });
        const fieldLabel = this.resolveInquiryActionNotesFieldLabel();
        const pendingLabel = pendingEditsApplied
            ? `${fieldLabel} updated`
            : (autoPopulateEnabled ? `Update ${fieldLabel}` : `Write to ${fieldLabel}`);
        const updateBtn = actionGroup.createEl('button', {
            cls: 'ert-inquiry-briefing-update',
            attr: {
                'aria-label': pendingLabel
            }
        });
        setIcon(updateBtn, pendingEditsApplied ? 'check' : 'plus');
        updateBtn.disabled = blocked;
        this.registerDomEvent(updateBtn, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            if (pendingEditsApplied) return;
            void this.handleBriefingPendingEditsClick(session);
        });
        if (pendingEditsApplied) {
            updateBtn.classList.add('is-applied');
        }

        if (session.briefPath) {
            const openBtn = actionGroup.createEl('button', {
                cls: 'ert-inquiry-briefing-open',
                attr: { 'aria-label': 'Open saved brief' }
            });
            setIcon(openBtn, 'file-text');
            openBtn.disabled = blocked;
            this.registerDomEvent(openBtn, 'click', (event: MouseEvent) => {
                event.stopPropagation();
                void this.openBriefFromSession(session);
            });
        }

        this.registerDomEvent(item, 'click', () => {
            this.activateSession(session);
            this.briefingPinned = false;
            this.hideBriefingPanel(true);
        });
    }

    private resolveSessionStatus(session: InquirySession, options?: { simulated?: boolean }): InquirySessionStatus {
        if (options?.simulated) return 'simulated';
        if (session.status) return session.status;
        if (this.isErrorResult(session.result)) return 'error';
        if (session.briefPath) return 'saved';
        return 'unsaved';
    }

    private resolveSessionStatusFromResult(result: InquiryResult, options?: { simulated?: boolean }): InquirySessionStatus {
        if (options?.simulated) return 'simulated';
        if (this.isErrorResult(result)) return 'error';
        return 'unsaved';
    }

    private resolveSessionZoneLabel(session: InquirySession): string {
        const zone = session.questionZone ?? this.findPromptZoneById(session.result.questionId) ?? 'setup';
        return zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
    }

    private resolveSessionLensLabel(session: InquirySession, zoneLabel: string): string {
        const promptLabel = this.findPromptLabelById(session.result.questionId);
        if (promptLabel && promptLabel.toLowerCase() !== zoneLabel.toLowerCase()) {
            return promptLabel;
        }
        return session.result.mode === 'depth' ? 'Depth' : 'Flow';
    }

    private resolveSessionQuestionLabel(session: InquirySession): string {
        const zoneLabel = this.resolveSessionZoneLabel(session);
        const promptLabel = this.findPromptLabelById(session.result.questionId)?.trim();
        if (promptLabel) return `${zoneLabel}: ${promptLabel}`;
        if (session.result.questionId?.trim()) return `${zoneLabel}: ${session.result.questionId.trim()}`;
        return `${zoneLabel}: ${this.resolveSessionLensLabel(session, zoneLabel)}`;
    }

    private formatSessionProviderModel(session: InquirySession): string {
        const providerRaw = session.result.aiProvider?.trim().toLowerCase();
        const model = (session.result.aiModelResolved || session.result.aiModelRequested || '').trim();
        if (!providerRaw && !model) return 'Engine unknown';
        const provider = providerRaw === 'openai'
            ? 'OpenAI'
            : providerRaw === 'anthropic'
                ? 'Anthropic'
                : providerRaw === 'gemini'
                    ? 'Gemini'
                    : providerRaw === 'local'
                        ? 'Local'
                        : (providerRaw ? providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1) : 'Provider unknown');
        return model ? `${provider}/${model}` : provider;
    }

    private formatSessionTime(session: InquirySession): string {
        const timestamp = session.createdAt || session.lastAccessed;
        const date = new Date(timestamp);
        const raw = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return raw.replace(/\s+/g, '').toLowerCase();
    }

    private formatSessionScope(session: InquirySession): string {
        const scopeLabel = session.result.scope === 'saga' ? 'Saga' : 'Book';
        const focus = session.result.focusId || '';
        return `${scopeLabel} ${focus}`.trim();
    }

    private formatSessionOverrides(session: InquirySession): string | null {
        const result = session.result;
        if (!result?.corpusOverridesActive) return null;
        const summary = result.corpusOverrideSummary;
        if (!summary) return 'Overrides on';
        return `Overrides ${summary.classCount}c/${summary.itemCount}i`;
    }

    private updateBriefingButtonState(): void {
        if (!this.artifactButton) return;
        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const status = activeSession ? this.resolveSessionStatus(activeSession) : null;
        this.artifactButton.classList.toggle('is-briefing-pulse', status === 'unsaved');
        this.artifactButton.classList.toggle('is-briefing-saved', status === 'saved');
        this.artifactButton.classList.toggle('is-briefing-error', status === 'error');
        // Briefing manager has its own full panel on hover/click; keep this icon tooltip-free.
        this.artifactButton.removeAttribute('data-rt-tip');
        this.artifactButton.removeAttribute('data-rt-tip-placement');
    }

    private async handleBriefingSaveClick(): Promise<void> {
        if (this.isInquiryBlocked()) return;
        const result = this.state.activeResult;
        if (!result) {
            new Notice('Run an inquiry before saving a brief.');
            return;
        }
        await this.saveBrief(result, {
            openFile: true,
            silent: false,
            sessionKey: this.state.activeSessionId
        });
    }

    private async handleBriefingPendingEditsClick(session: InquirySession): Promise<void> {
        if (this.isInquiryBlocked()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (session.pendingEditsApplied) {
            const fieldLabel = this.resolveInquiryActionNotesFieldLabel();
            this.notifyInteraction(`${fieldLabel} already updated for this session.`);
            return;
        }
        await this.writeInquiryPendingEdits(session, session.result, { notify: true });
    }

    private handleBriefingClearClick(): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait to clear recent sessions.');
            return;
        }
        this.sessionStore.clearSessions();
        this.rehydrateTargetKey = undefined;
        if (this.rehydrateHighlightTimer) {
            window.clearTimeout(this.rehydrateHighlightTimer);
            this.rehydrateHighlightTimer = undefined;
        }
        if (this.rehydratePulseTimer) {
            window.clearTimeout(this.rehydratePulseTimer);
            this.rehydratePulseTimer = undefined;
        }
        this.artifactButton?.classList.remove('is-rehydrate-pulse');
        this.clearActiveResultState();
        this.clearResultPreview();
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI();
    }

    private handleBriefingResetCorpusClick(): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait to reset corpus overrides.');
            return;
        }
        if (!this.hasCorpusOverrides()) {
            this.notifyInteraction('Corpus overrides already match settings.');
            return;
        }
        this.resetCorpusOverrides();
        this.notifyInteraction('Corpus overrides reset to settings; sessions, logs, and briefs untouched.');
    }

    private async handleBriefingPurgeClick(): Promise<void> {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (!this.corpus) {
            this.notifyInteraction('No corpus available.');
            return;
        }
        const scenes = this.corpus.scenes ?? [];
        if (!scenes.length) {
            this.notifyInteraction('No scenes found in current scope.');
            return;
        }
        const scopeBookLabel = this.getFocusBookTitleForMessages() || this.getFocusBookLabel();
        const scopeLabel = this.state.scope === 'saga' ? 'saga' : `book "${scopeBookLabel}"`;
        const affectedScenes = await this.scanForInquiryActionItems(scenes);
        const modal = new InquiryPurgeConfirmationModal(
            this.app,
            scenes.length,
            affectedScenes,
            scopeLabel,
            async () => {
                const result = await this.purgeInquiryActionItems(scenes);
                if (result.purgedCount > 0) {
                    new Notice(`Purged Inquiry action items from ${result.purgedCount} scene${result.purgedCount !== 1 ? 's' : ''}.`);
                } else {
                    new Notice('No Inquiry action items found to purge.');
                }
            }
        );
        modal.open();
    }

    private async scanForInquiryActionItems(
        scenes: InquirySceneItem[]
    ): Promise<InquiryPurgePreviewItem[]> {
        const targetField = this.resolveInquiryActionNotesFieldLabel();
        const inquiryLinkToken = '[[Inquiry Brief —';
        const isInquiryLine = (line: string): boolean => line.includes(inquiryLinkToken);
        const results: InquiryPurgePreviewItem[] = [];

        for (const scene of scenes) {
            const filePath = scene.filePath;
            if (!filePath) continue;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) continue;

            try {
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                if (!frontmatter) continue;

                const rawValue = frontmatter[targetField];
                if (rawValue === undefined || rawValue === null) continue;

                let rawText = '';
                if (typeof rawValue === 'string') {
                    rawText = rawValue;
                } else if (Array.isArray(rawValue)) {
                    rawText = rawValue.map(entry => (typeof entry === 'string' ? entry : String(entry))).join('\n');
                } else {
                    rawText = String(rawValue);
                }

                if (!rawText.trim()) continue;

                const lines = rawText.split(/\r?\n/);
                const inquiryLines = lines.filter(line => isInquiryLine(line));
                if (inquiryLines.length > 0) {
                    results.push({
                        label: scene.displayLabel,
                        path: filePath,
                        lineCount: inquiryLines.length
                    });
                }
            } catch (error) {
                console.warn('[Inquiry] Error scanning scene for action items:', filePath, error);
            }
        }

        return results;
    }

    private async purgeInquiryActionItems(
        scenes: InquirySceneItem[]
    ): Promise<{ purgedCount: number; totalScenes: number }> {
        const targetField = this.resolveInquiryActionNotesFieldLabel();
        const inquiryLinkToken = '[[Inquiry Brief —';
        const isInquiryLine = (line: string): boolean => line.includes(inquiryLinkToken);
        let purgedCount = 0;

        for (const scene of scenes) {
            const filePath = scene.filePath;
            if (!filePath) continue;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) continue;

            try {
                let hadInquiryLines = false;
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    const frontmatter = fm as Record<string, unknown>;
                    const rawValue = frontmatter[targetField];
                    if (rawValue === undefined || rawValue === null) return;

                    let rawText = '';
                    if (typeof rawValue === 'string') {
                        rawText = rawValue;
                    } else if (Array.isArray(rawValue)) {
                        rawText = rawValue.map(entry => (typeof entry === 'string' ? entry : String(entry))).join('\n');
                    } else {
                        rawText = String(rawValue);
                    }

                    if (!rawText.trim()) return;

                    const newline = rawText.includes('\r\n') ? '\r\n' : '\n';
                    const lines = rawText.split(/\r?\n/);
                    const filteredLines = lines.filter(line => !isInquiryLine(line));

                    if (filteredLines.length < lines.length) {
                        hadInquiryLines = true;
                        const nextText = filteredLines.join(newline).trim();
                        if (nextText) {
                            frontmatter[targetField] = nextText;
                        } else {
                            delete frontmatter[targetField];
                        }
                    }
                });

                if (hadInquiryLines) {
                    purgedCount++;
                }
            } catch (error) {
                console.warn('[Inquiry] Error purging action items from scene:', filePath, error);
            }
        }

        return { purgedCount, totalScenes: scenes.length };
    }

    private activateSession(session: InquirySession): void {
        if (this.isInquiryBlocked()) return;
        this.clearErrorStateForAction();
        if (this.state.isRunning) return;
        this.state.scope = session.scope ?? session.result.scope;
        this.state.focusBookId = session.focusBookId ?? this.state.focusBookId;
        this.state.focusSceneId = session.focusSceneId ?? this.state.focusSceneId;
        this.applySession({
            result: session.result,
            key: session.key,
            focusBookId: session.focusBookId,
            focusSceneId: session.focusSceneId,
            scope: session.scope,
            questionZone: session.questionZone
        }, 'fresh');
        if (this.isErrorResult(session.result)) {
            this.setApiStatus('error', this.formatApiErrorReason(session.result));
        } else {
            this.setApiStatus('success');
        }
        this.sessionStore.updateSession(session.key, { lastAccessed: Date.now() });
    }

    private async openBriefFromSession(session: InquirySession, anchorId?: string): Promise<void> {
        if (this.isInquiryBlocked()) return;
        if (!session.briefPath) return;
        const file = this.app.vault.getAbstractFileByPath(session.briefPath);
        if (!(file instanceof TFile)) {
            new Notice('Brief not found. It may have been moved or deleted.');
            return;
        }
        if (!anchorId) {
            await openOrRevealFile(this.app, file);
            return;
        }
        await openOrRevealFileAtSubpath(this.app, file, `#^${anchorId}`);
    }

    private getMostRecentInquiryLogFile(): TFile | null {
        const folderPath = resolveInquiryLogFolder();
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) return null;

        let latest: TFile | null = null;
        const scan = (node: TAbstractFile): void => {
            if (node instanceof TFile) {
                if (node.extension !== 'md') return;
                if (!latest || node.stat.mtime > latest.stat.mtime) {
                    latest = node;
                }
                return;
            }
            if (node instanceof TFolder) {
                node.children.forEach(child => scan(child));
            }
        };
        scan(folder);
        return latest;
    }

    private async openLatestInquiryLogForContext(): Promise<boolean> {
        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const sessionLogPath = activeSession?.logPath;
        if (sessionLogPath) {
            const sessionLog = this.app.vault.getAbstractFileByPath(sessionLogPath);
            if (sessionLog instanceof TFile) {
                await openOrRevealFile(this.app, sessionLog);
                return true;
            }
        }
        const fallback = this.getMostRecentInquiryLogFile();
        if (!fallback) return false;
        await openOrRevealFile(this.app, fallback);
        return true;
    }

    private getInquiryAssetHref(fileName: string): string {
        const configDir = (this.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
        const pluginId = this.plugin.manifest.id;
        const assetPath = normalizePath(`${configDir}/plugins/${pluginId}/inquiry/assets/${fileName}`);
        // SAFE: vault.adapter.getResourcePath is required for converting vault paths to asset URLs (no Vault API alternative)
        const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };
        return adapter.getResourcePath ? adapter.getResourcePath(assetPath) : assetPath;
    }

    private loadFocusCache(): void {
        const cache = this.plugin.settings.inquiryFocusCache;
        if (cache?.lastFocusSceneByBookId) {
            this.lastFocusSceneByBookId = new Map(Object.entries(cache.lastFocusSceneByBookId));
        }
        if (cache?.lastFocusBookId) {
            this.state.focusBookId = cache.lastFocusBookId;
            const sceneId = this.lastFocusSceneByBookId.get(cache.lastFocusBookId);
            if (sceneId) {
                this.state.focusSceneId = sceneId;
            }
        }
        if (this.focusPersistTimer) {
            window.clearTimeout(this.focusPersistTimer);
            this.focusPersistTimer = undefined;
        }
    }

    private scheduleFocusPersist(): void {
        if (this.focusPersistTimer) {
            window.clearTimeout(this.focusPersistTimer);
        }
        this.focusPersistTimer = window.setTimeout(() => {
            const cache = {
                lastFocusBookId: this.state.focusBookId,
                lastFocusSceneByBookId: Object.fromEntries(this.lastFocusSceneByBookId)
            };
            this.plugin.settings.inquiryFocusCache = cache;
            void this.plugin.saveSettings();
        }, 300);
    }

    private buildIconSymbols(defs: SVGDefsElement): void {
        this.iconSymbols.clear();
        [
            'waves',
            'waves-arrow-down',
            'columns-2',
            'cpu',
            'aperture',
            'chevron-left',
            'chevron-right',
            'chevron-up',
            'chevron-down',
            'help-circle',
            'activity',
            'arrow-big-up',
            'check-circle',
            'sigma',
            'x',
            'circle',
            'circle-dot',
            'disc'
        ].forEach(icon => {
            const symbolId = this.createIconSymbol(defs, icon);
            if (symbolId) {
                this.iconSymbols.add(symbolId);
            }
        });
    }

    private buildZoneGradients(defs: SVGDefsElement): void {
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        const zoneAnchors: Record<InquiryZone, { cx: string; cy: string; r: string }> = {
            setup: { cx: '1', cy: '0', r: '1.42' },
            pressure: { cx: '0', cy: '0', r: '1.42' },
            payoff: { cx: '0.5', cy: '0', r: '1' }
        };
        const zoneStopOpacity = '0.35';
        const createStop = (offset: string, color: string, opacity?: string): SVGStopElement => {
            const stop = createSvgElement('stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', color);
            if (opacity) {
                stop.setAttribute('stop-opacity', opacity);
            }
            return stop;
        };
        const createGradient = (
            id: string,
            stops: Array<[string, string]>,
            anchor: { cx: string; cy: string; r: string },
            stopOpacity?: string
        ): SVGRadialGradientElement => {
            const gradient = createSvgElement('radialGradient');
            gradient.setAttribute('id', id);
            gradient.setAttribute('cx', anchor.cx);
            gradient.setAttribute('cy', anchor.cy);
            gradient.setAttribute('fx', anchor.cx);
            gradient.setAttribute('fy', anchor.cy);
            gradient.setAttribute('r', anchor.r);
            stops.forEach(([offset, color]) => {
                gradient.appendChild(createStop(offset, color, stopOpacity));
            });
            return gradient;
        };

        const glassGradient = createSvgElement('radialGradient');
        glassGradient.setAttribute('id', 'ert-inquiry-zone-glass');
        glassGradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        glassGradient.setAttribute('cx', '0');
        glassGradient.setAttribute('cy', '0');
        glassGradient.setAttribute('fx', '0');
        glassGradient.setAttribute('fy', '0');
        glassGradient.setAttribute('r', String(VIEWBOX_MAX));
        const toPercent = (radius: number): string => {
            const clamped = Math.min(Math.max(radius / VIEWBOX_MAX, 0), 1);
            return `${(clamped * 100).toFixed(2)}%`;
        };
        const zoneInner = ZONE_SEGMENT_RADIUS - (ZONE_RING_THICKNESS / 2);
        const zoneOuter = ZONE_SEGMENT_RADIUS + (ZONE_RING_THICKNESS / 2);
        const bandInset = ZONE_RING_THICKNESS * 0.18;
        const innerFade = Math.max(0, zoneInner - (ZONE_RING_THICKNESS * 0.22));
        const outerFade = zoneOuter + (ZONE_RING_THICKNESS * 0.22);
        [
            [toPercent(innerFade), '#ffffff', '0.015'],
            [toPercent(zoneInner), '#ffffff', '0.03'],
            [toPercent(zoneInner + bandInset), '#ffffff', '0.12'],
            [toPercent(zoneInner + (ZONE_RING_THICKNESS * 0.5)), '#ffffff', '0.26'],
            [toPercent(zoneOuter - bandInset), '#ffffff', '0.12'],
            [toPercent(zoneOuter), '#ffffff', '0.03'],
            [toPercent(outerFade), '#ffffff', '0.015']
        ].forEach(([offset, color, opacity]) => {
            glassGradient.appendChild(createStop(offset, color, opacity));
        });
        defs.appendChild(glassGradient);

        zones.forEach(zone => {
            const zoneVar = `var(--ert-inquiry-zone-${zone})`;
            const anchor = zoneAnchors[zone];
            defs.appendChild(createGradient(
                `ert-inquiry-zone-${zone}-raised`,
                [
                    ['0%', `color-mix(in srgb, ${zoneVar} 55%, #ffffff)`],
                    ['50%', zoneVar],
                    ['100%', `color-mix(in srgb, ${zoneVar} 55%, #000000)`]
                ],
                anchor,
                zoneStopOpacity
            ));
            defs.appendChild(createGradient(
                `ert-inquiry-zone-${zone}-pressed`,
                [
                    ['0%', `color-mix(in srgb, ${zoneVar} 55%, #000000)`],
                    ['60%', zoneVar],
                    ['100%', `color-mix(in srgb, ${zoneVar} 55%, #ffffff)`]
                ],
                anchor,
                zoneStopOpacity
            ));
        });

        // Neumorphic filters for zone pill states.
        const pillOutFilter = createSvgElement('filter');
        pillOutFilter.setAttribute('id', 'ert-inquiry-zone-pill-out');
        pillOutFilter.setAttribute('x', '-50%');
        pillOutFilter.setAttribute('y', '-50%');
        pillOutFilter.setAttribute('width', '200%');
        pillOutFilter.setAttribute('height', '200%');
        pillOutFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillOutLight = createSvgElement('feDropShadow');
        pillOutLight.setAttribute('dx', '-2');
        pillOutLight.setAttribute('dy', '-2');
        pillOutLight.setAttribute('stdDeviation', '1.6');
        pillOutLight.setAttribute('flood-color', '#ffffff');
        pillOutLight.setAttribute('flood-opacity', '0.28');
        const pillOutDark = createSvgElement('feDropShadow');
        pillOutDark.setAttribute('dx', '2');
        pillOutDark.setAttribute('dy', '2');
        pillOutDark.setAttribute('stdDeviation', '1.8');
        pillOutDark.setAttribute('flood-color', '#000000');
        pillOutDark.setAttribute('flood-opacity', '0.35');
        pillOutFilter.appendChild(pillOutLight);
        pillOutFilter.appendChild(pillOutDark);
        defs.appendChild(pillOutFilter);

        const pillInFilter = createSvgElement('filter');
        pillInFilter.setAttribute('id', 'ert-inquiry-zone-pill-in');
        pillInFilter.setAttribute('x', '-50%');
        pillInFilter.setAttribute('y', '-50%');
        pillInFilter.setAttribute('width', '200%');
        pillInFilter.setAttribute('height', '200%');
        pillInFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillInOffsetDark = createSvgElement('feOffset');
        pillInOffsetDark.setAttribute('in', 'SourceAlpha');
        pillInOffsetDark.setAttribute('dx', '1.6');
        pillInOffsetDark.setAttribute('dy', '1.6');
        pillInOffsetDark.setAttribute('result', 'pill-in-offset-dark');
        const pillInBlurDark = createSvgElement('feGaussianBlur');
        pillInBlurDark.setAttribute('in', 'pill-in-offset-dark');
        pillInBlurDark.setAttribute('stdDeviation', '1.2');
        pillInBlurDark.setAttribute('result', 'pill-in-blur-dark');
        const pillInCompositeDark = createSvgElement('feComposite');
        pillInCompositeDark.setAttribute('in', 'pill-in-blur-dark');
        pillInCompositeDark.setAttribute('in2', 'SourceAlpha');
        pillInCompositeDark.setAttribute('operator', 'arithmetic');
        pillInCompositeDark.setAttribute('k2', '-1');
        pillInCompositeDark.setAttribute('k3', '1');
        pillInCompositeDark.setAttribute('result', 'pill-in-inner-dark');
        const pillInFloodDark = createSvgElement('feFlood');
        pillInFloodDark.setAttribute('flood-color', '#000000');
        pillInFloodDark.setAttribute('flood-opacity', '0.35');
        pillInFloodDark.setAttribute('result', 'pill-in-flood-dark');
        const pillInShadowDark = createSvgElement('feComposite');
        pillInShadowDark.setAttribute('in', 'pill-in-flood-dark');
        pillInShadowDark.setAttribute('in2', 'pill-in-inner-dark');
        pillInShadowDark.setAttribute('operator', 'in');
        pillInShadowDark.setAttribute('result', 'pill-in-shadow-dark');

        const pillInOffsetLight = createSvgElement('feOffset');
        pillInOffsetLight.setAttribute('in', 'SourceAlpha');
        pillInOffsetLight.setAttribute('dx', '-1.6');
        pillInOffsetLight.setAttribute('dy', '-1.6');
        pillInOffsetLight.setAttribute('result', 'pill-in-offset-light');
        const pillInBlurLight = createSvgElement('feGaussianBlur');
        pillInBlurLight.setAttribute('in', 'pill-in-offset-light');
        pillInBlurLight.setAttribute('stdDeviation', '1.2');
        pillInBlurLight.setAttribute('result', 'pill-in-blur-light');
        const pillInCompositeLight = createSvgElement('feComposite');
        pillInCompositeLight.setAttribute('in', 'pill-in-blur-light');
        pillInCompositeLight.setAttribute('in2', 'SourceAlpha');
        pillInCompositeLight.setAttribute('operator', 'arithmetic');
        pillInCompositeLight.setAttribute('k2', '-1');
        pillInCompositeLight.setAttribute('k3', '1');
        pillInCompositeLight.setAttribute('result', 'pill-in-inner-light');
        const pillInFloodLight = createSvgElement('feFlood');
        pillInFloodLight.setAttribute('flood-color', '#ffffff');
        pillInFloodLight.setAttribute('flood-opacity', '0.22');
        pillInFloodLight.setAttribute('result', 'pill-in-flood-light');
        const pillInShadowLight = createSvgElement('feComposite');
        pillInShadowLight.setAttribute('in', 'pill-in-flood-light');
        pillInShadowLight.setAttribute('in2', 'pill-in-inner-light');
        pillInShadowLight.setAttribute('operator', 'in');
        pillInShadowLight.setAttribute('result', 'pill-in-shadow-light');

        const pillInMerge = createSvgElement('feMerge');
        const pillInMergeGraphic = createSvgElement('feMergeNode');
        pillInMergeGraphic.setAttribute('in', 'SourceGraphic');
        const pillInMergeDark = createSvgElement('feMergeNode');
        pillInMergeDark.setAttribute('in', 'pill-in-shadow-dark');
        const pillInMergeLight = createSvgElement('feMergeNode');
        pillInMergeLight.setAttribute('in', 'pill-in-shadow-light');
        pillInMerge.appendChild(pillInMergeGraphic);
        pillInMerge.appendChild(pillInMergeDark);
        pillInMerge.appendChild(pillInMergeLight);

        pillInFilter.appendChild(pillInOffsetDark);
        pillInFilter.appendChild(pillInBlurDark);
        pillInFilter.appendChild(pillInCompositeDark);
        pillInFilter.appendChild(pillInFloodDark);
        pillInFilter.appendChild(pillInShadowDark);
        pillInFilter.appendChild(pillInOffsetLight);
        pillInFilter.appendChild(pillInBlurLight);
        pillInFilter.appendChild(pillInCompositeLight);
        pillInFilter.appendChild(pillInFloodLight);
        pillInFilter.appendChild(pillInShadowLight);
        pillInFilter.appendChild(pillInMerge);
        defs.appendChild(pillInFilter);

        // Neumorphic "up" filter for zone dot buttons.
        const dotUpFilter = createSvgElement('filter');
        dotUpFilter.setAttribute('id', 'ert-inquiry-zone-dot-up');
        dotUpFilter.setAttribute('x', '-50%');
        dotUpFilter.setAttribute('y', '-50%');
        dotUpFilter.setAttribute('width', '200%');
        dotUpFilter.setAttribute('height', '200%');
        dotUpFilter.setAttribute('color-interpolation-filters', 'sRGB');

        const dotUpFlood = createSvgElement('feFlood');
        dotUpFlood.setAttribute('flood-opacity', '0');
        dotUpFlood.setAttribute('result', 'BackgroundImageFix');
        const dotUpAlphaDark = createSvgElement('feColorMatrix');
        dotUpAlphaDark.setAttribute('in', 'SourceAlpha');
        dotUpAlphaDark.setAttribute('type', 'matrix');
        dotUpAlphaDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaDark.setAttribute('result', 'hardAlpha');
        const dotUpOffsetDark = createSvgElement('feOffset');
        dotUpOffsetDark.setAttribute('dx', '2');
        dotUpOffsetDark.setAttribute('dy', '2');
        const dotUpBlurDark = createSvgElement('feGaussianBlur');
        dotUpBlurDark.setAttribute('stdDeviation', '2');
        const dotUpCompositeDark = createSvgElement('feComposite');
        dotUpCompositeDark.setAttribute('in2', 'hardAlpha');
        dotUpCompositeDark.setAttribute('operator', 'out');
        const dotUpColorDark = createSvgElement('feColorMatrix');
        dotUpColorDark.setAttribute('type', 'matrix');
        dotUpColorDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0');
        const dotUpBlendDark = createSvgElement('feBlend');
        dotUpBlendDark.setAttribute('mode', 'normal');
        dotUpBlendDark.setAttribute('in2', 'BackgroundImageFix');
        dotUpBlendDark.setAttribute('result', 'effect1_dropShadow');

        const dotUpAlphaLight = createSvgElement('feColorMatrix');
        dotUpAlphaLight.setAttribute('in', 'SourceAlpha');
        dotUpAlphaLight.setAttribute('type', 'matrix');
        dotUpAlphaLight.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaLight.setAttribute('result', 'hardAlpha');
        const dotUpOffsetLight = createSvgElement('feOffset');
        dotUpOffsetLight.setAttribute('dx', '-2');
        dotUpOffsetLight.setAttribute('dy', '-2');
        const dotUpBlurLight = createSvgElement('feGaussianBlur');
        dotUpBlurLight.setAttribute('stdDeviation', '3');
        const dotUpCompositeLight = createSvgElement('feComposite');
        dotUpCompositeLight.setAttribute('in2', 'hardAlpha');
        dotUpCompositeLight.setAttribute('operator', 'out');
        const dotUpColorLight = createSvgElement('feColorMatrix');
        dotUpColorLight.setAttribute('type', 'matrix');
        dotUpColorLight.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.11 0');
        const dotUpBlendLight = createSvgElement('feBlend');
        dotUpBlendLight.setAttribute('mode', 'normal');
        dotUpBlendLight.setAttribute('in2', 'effect1_dropShadow');
        dotUpBlendLight.setAttribute('result', 'effect2_dropShadow');
        const dotUpBlendShape = createSvgElement('feBlend');
        dotUpBlendShape.setAttribute('mode', 'normal');
        dotUpBlendShape.setAttribute('in', 'SourceGraphic');
        dotUpBlendShape.setAttribute('in2', 'effect2_dropShadow');
        dotUpBlendShape.setAttribute('result', 'shape');

        const dotUpAlphaInnerDark = createSvgElement('feColorMatrix');
        dotUpAlphaInnerDark.setAttribute('in', 'SourceAlpha');
        dotUpAlphaInnerDark.setAttribute('type', 'matrix');
        dotUpAlphaInnerDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaInnerDark.setAttribute('result', 'hardAlpha');
        const dotUpOffsetInnerDark = createSvgElement('feOffset');
        dotUpOffsetInnerDark.setAttribute('dx', '-2');
        dotUpOffsetInnerDark.setAttribute('dy', '-2');
        const dotUpBlurInnerDark = createSvgElement('feGaussianBlur');
        dotUpBlurInnerDark.setAttribute('stdDeviation', '1');
        const dotUpCompositeInnerDark = createSvgElement('feComposite');
        dotUpCompositeInnerDark.setAttribute('in2', 'hardAlpha');
        dotUpCompositeInnerDark.setAttribute('operator', 'arithmetic');
        dotUpCompositeInnerDark.setAttribute('k2', '-1');
        dotUpCompositeInnerDark.setAttribute('k3', '1');
        const dotUpColorInnerDark = createSvgElement('feColorMatrix');
        dotUpColorInnerDark.setAttribute('type', 'matrix');
        dotUpColorInnerDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.17 0');
        const dotUpBlendInnerDark = createSvgElement('feBlend');
        dotUpBlendInnerDark.setAttribute('mode', 'normal');
        dotUpBlendInnerDark.setAttribute('in2', 'shape');
        dotUpBlendInnerDark.setAttribute('result', 'effect3_innerShadow');

        const dotUpAlphaInnerLight = createSvgElement('feColorMatrix');
        dotUpAlphaInnerLight.setAttribute('in', 'SourceAlpha');
        dotUpAlphaInnerLight.setAttribute('type', 'matrix');
        dotUpAlphaInnerLight.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaInnerLight.setAttribute('result', 'hardAlpha');
        const dotUpOffsetInnerLight = createSvgElement('feOffset');
        dotUpOffsetInnerLight.setAttribute('dx', '2');
        dotUpOffsetInnerLight.setAttribute('dy', '2');
        const dotUpBlurInnerLight = createSvgElement('feGaussianBlur');
        dotUpBlurInnerLight.setAttribute('stdDeviation', '1');
        const dotUpCompositeInnerLight = createSvgElement('feComposite');
        dotUpCompositeInnerLight.setAttribute('in2', 'hardAlpha');
        dotUpCompositeInnerLight.setAttribute('operator', 'arithmetic');
        dotUpCompositeInnerLight.setAttribute('k2', '-1');
        dotUpCompositeInnerLight.setAttribute('k3', '1');
        const dotUpColorInnerLight = createSvgElement('feColorMatrix');
        dotUpColorInnerLight.setAttribute('type', 'matrix');
        dotUpColorInnerLight.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.17 0');
        const dotUpBlendInnerLight = createSvgElement('feBlend');
        dotUpBlendInnerLight.setAttribute('mode', 'color-dodge');
        dotUpBlendInnerLight.setAttribute('in2', 'effect3_innerShadow');
        dotUpBlendInnerLight.setAttribute('result', 'effect4_innerShadow');

        dotUpFilter.appendChild(dotUpFlood);
        dotUpFilter.appendChild(dotUpAlphaDark);
        dotUpFilter.appendChild(dotUpOffsetDark);
        dotUpFilter.appendChild(dotUpBlurDark);
        dotUpFilter.appendChild(dotUpCompositeDark);
        dotUpFilter.appendChild(dotUpColorDark);
        dotUpFilter.appendChild(dotUpBlendDark);
        dotUpFilter.appendChild(dotUpAlphaLight);
        dotUpFilter.appendChild(dotUpOffsetLight);
        dotUpFilter.appendChild(dotUpBlurLight);
        dotUpFilter.appendChild(dotUpCompositeLight);
        dotUpFilter.appendChild(dotUpColorLight);
        dotUpFilter.appendChild(dotUpBlendLight);
        dotUpFilter.appendChild(dotUpBlendShape);
        dotUpFilter.appendChild(dotUpAlphaInnerDark);
        dotUpFilter.appendChild(dotUpOffsetInnerDark);
        dotUpFilter.appendChild(dotUpBlurInnerDark);
        dotUpFilter.appendChild(dotUpCompositeInnerDark);
        dotUpFilter.appendChild(dotUpColorInnerDark);
        dotUpFilter.appendChild(dotUpBlendInnerDark);
        dotUpFilter.appendChild(dotUpAlphaInnerLight);
        dotUpFilter.appendChild(dotUpOffsetInnerLight);
        dotUpFilter.appendChild(dotUpBlurInnerLight);
        dotUpFilter.appendChild(dotUpCompositeInnerLight);
        dotUpFilter.appendChild(dotUpColorInnerLight);
        dotUpFilter.appendChild(dotUpBlendInnerLight);
        defs.appendChild(dotUpFilter);

        // Neumorphic "down" filter for zone dot buttons.
        const dotDownFilter = createSvgElement('filter');
        dotDownFilter.setAttribute('id', 'ert-inquiry-zone-dot-down');
        dotDownFilter.setAttribute('x', '-50%');
        dotDownFilter.setAttribute('y', '-50%');
        dotDownFilter.setAttribute('width', '200%');
        dotDownFilter.setAttribute('height', '200%');
        dotDownFilter.setAttribute('color-interpolation-filters', 'sRGB');

        const dotDownOffsetDark = createSvgElement('feOffset');
        dotDownOffsetDark.setAttribute('in', 'SourceAlpha');
        dotDownOffsetDark.setAttribute('dx', '3.2');
        dotDownOffsetDark.setAttribute('dy', '3.2');
        dotDownOffsetDark.setAttribute('result', 'dot-down-offset-dark');
        const dotDownBlurDark = createSvgElement('feGaussianBlur');
        dotDownBlurDark.setAttribute('in', 'dot-down-offset-dark');
        dotDownBlurDark.setAttribute('stdDeviation', '2.4');
        dotDownBlurDark.setAttribute('result', 'dot-down-blur-dark');
        const dotDownCompositeDark = createSvgElement('feComposite');
        dotDownCompositeDark.setAttribute('in', 'dot-down-blur-dark');
        dotDownCompositeDark.setAttribute('in2', 'SourceAlpha');
        dotDownCompositeDark.setAttribute('operator', 'arithmetic');
        dotDownCompositeDark.setAttribute('k2', '-1');
        dotDownCompositeDark.setAttribute('k3', '1');
        dotDownCompositeDark.setAttribute('result', 'dot-down-inner-dark');
        const dotDownFloodDark = createSvgElement('feFlood');
        dotDownFloodDark.setAttribute('flood-color', '#000000');
        dotDownFloodDark.setAttribute('flood-opacity', '0.35');
        dotDownFloodDark.setAttribute('result', 'dot-down-flood-dark');
        const dotDownShadowDark = createSvgElement('feComposite');
        dotDownShadowDark.setAttribute('in', 'dot-down-flood-dark');
        dotDownShadowDark.setAttribute('in2', 'dot-down-inner-dark');
        dotDownShadowDark.setAttribute('operator', 'in');
        dotDownShadowDark.setAttribute('result', 'dot-down-shadow-dark');

        const dotDownOffsetLight = createSvgElement('feOffset');
        dotDownOffsetLight.setAttribute('in', 'SourceAlpha');
        dotDownOffsetLight.setAttribute('dx', '-3.2');
        dotDownOffsetLight.setAttribute('dy', '-3.2');
        dotDownOffsetLight.setAttribute('result', 'dot-down-offset-light');
        const dotDownBlurLight = createSvgElement('feGaussianBlur');
        dotDownBlurLight.setAttribute('in', 'dot-down-offset-light');
        dotDownBlurLight.setAttribute('stdDeviation', '2.4');
        dotDownBlurLight.setAttribute('result', 'dot-down-blur-light');
        const dotDownCompositeLight = createSvgElement('feComposite');
        dotDownCompositeLight.setAttribute('in', 'dot-down-blur-light');
        dotDownCompositeLight.setAttribute('in2', 'SourceAlpha');
        dotDownCompositeLight.setAttribute('operator', 'arithmetic');
        dotDownCompositeLight.setAttribute('k2', '-1');
        dotDownCompositeLight.setAttribute('k3', '1');
        dotDownCompositeLight.setAttribute('result', 'dot-down-inner-light');
        const dotDownFloodLight = createSvgElement('feFlood');
        dotDownFloodLight.setAttribute('flood-color', '#ffffff');
        dotDownFloodLight.setAttribute('flood-opacity', '0.22');
        dotDownFloodLight.setAttribute('result', 'dot-down-flood-light');
        const dotDownShadowLight = createSvgElement('feComposite');
        dotDownShadowLight.setAttribute('in', 'dot-down-flood-light');
        dotDownShadowLight.setAttribute('in2', 'dot-down-inner-light');
        dotDownShadowLight.setAttribute('operator', 'in');
        dotDownShadowLight.setAttribute('result', 'dot-down-shadow-light');

        const dotDownMerge = createSvgElement('feMerge');
        const dotDownMergeGraphic = createSvgElement('feMergeNode');
        dotDownMergeGraphic.setAttribute('in', 'SourceGraphic');
        const dotDownMergeDark = createSvgElement('feMergeNode');
        dotDownMergeDark.setAttribute('in', 'dot-down-shadow-dark');
        const dotDownMergeLight = createSvgElement('feMergeNode');
        dotDownMergeLight.setAttribute('in', 'dot-down-shadow-light');
        dotDownMerge.appendChild(dotDownMergeGraphic);
        dotDownMerge.appendChild(dotDownMergeDark);
        dotDownMerge.appendChild(dotDownMergeLight);

        dotDownFilter.appendChild(dotDownOffsetDark);
        dotDownFilter.appendChild(dotDownBlurDark);
        dotDownFilter.appendChild(dotDownCompositeDark);
        dotDownFilter.appendChild(dotDownFloodDark);
        dotDownFilter.appendChild(dotDownShadowDark);
        dotDownFilter.appendChild(dotDownOffsetLight);
        dotDownFilter.appendChild(dotDownBlurLight);
        dotDownFilter.appendChild(dotDownCompositeLight);
        dotDownFilter.appendChild(dotDownFloodLight);
        dotDownFilter.appendChild(dotDownShadowLight);
        dotDownFilter.appendChild(dotDownMerge);
        defs.appendChild(dotDownFilter);

        const backboneGradient = createSvgElement('linearGradient');
        backboneGradient.setAttribute('id', 'ert-inquiry-minimap-backbone-grad');
        backboneGradient.setAttribute('x1', '0%');
        backboneGradient.setAttribute('y1', '0%');
        backboneGradient.setAttribute('x2', '100%');
        backboneGradient.setAttribute('y2', '0%');
        const startColors = getBackboneStartColors(this.getStyleSource());
        const gradientStart = startColors.gradient[0] ?? { r: 255, g: 153, b: 0 };
        const gradientMid = startColors.gradient[1] ?? { r: 255, g: 211, b: 106 };
        const gradientEnd = startColors.gradient[2] ?? { r: 255, g: 94, b: 0 };
        const backboneGradientStops = [
            createStop('0%', toRgbString(gradientStart)),
            createStop('50%', toRgbString(gradientMid)),
            createStop('100%', toRgbString(gradientEnd))
        ];
        backboneGradientStops.forEach(stop => backboneGradient.appendChild(stop));
        this.minimap.setGradientStops(backboneGradientStops);
        defs.appendChild(backboneGradient);

        const backboneShine = createSvgElement('linearGradient');
        backboneShine.setAttribute('id', 'ert-inquiry-minimap-backbone-shine');
        backboneShine.setAttribute('x1', '0%');
        backboneShine.setAttribute('y1', '0%');
        backboneShine.setAttribute('x2', '100%');
        backboneShine.setAttribute('y2', '0%');
        const shineStart = startColors.shine[0] ?? { r: 255, g: 242, b: 207 };
        const shinePeak = startColors.shine[1] ?? { r: 255, g: 247, b: 234 };
        const shineWarm = startColors.shine[2] ?? { r: 255, g: 179, b: 77 };
        const shineEnd = startColors.shine[3] ?? { r: 255, g: 242, b: 207 };
        const backboneShineStops = [
            createStop('0%', toRgbString(shineStart), '0'),
            createStop('40%', toRgbString(shinePeak), '1'),
            createStop('60%', toRgbString(shineWarm), '0.9'),
            createStop('100%', toRgbString(shineEnd), '0')
        ];
        backboneShineStops.forEach(stop => backboneShine.appendChild(stop));
        this.minimap.setShineStops(backboneShineStops);
        defs.appendChild(backboneShine);

        this.minimap.initBackboneClip(defs);

        // Hatched pattern for cached portion overlay on token cap bar
        const cachedPattern = createSvgElement('pattern');
        cachedPattern.setAttribute('id', 'ert-inquiry-minimap-cached-hatch');
        cachedPattern.setAttribute('width', '4');
        cachedPattern.setAttribute('height', '4');
        cachedPattern.setAttribute('patternUnits', 'userSpaceOnUse');
        cachedPattern.setAttribute('patternTransform', 'rotate(45)');
        const hatchLine = createSvgElement('line');
        hatchLine.setAttribute('x1', '0');
        hatchLine.setAttribute('y1', '0');
        hatchLine.setAttribute('x2', '0');
        hatchLine.setAttribute('y2', '4');
        hatchLine.classList.add('ert-inquiry-minimap-cached-hatch-stroke');
        cachedPattern.appendChild(hatchLine);
        defs.appendChild(cachedPattern);
    }

    private createIconSymbol(defs: SVGDefsElement, iconName: string): string | null {
        const holder = document.createElement('span');
        setIcon(holder, iconName);
        const source = holder.querySelector('svg');
        if (!source) {
            if (iconName !== 'sigma') return null;
            const symbol = createSvgElement('symbol');
            const symbolId = `ert-icon-${iconName}`;
            symbol.setAttribute('id', symbolId);
            symbol.setAttribute('viewBox', '0 0 24 24');
            const text = createSvgElement('text');
            text.setAttribute('x', '12');
            text.setAttribute('y', '13');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', '16');
            text.setAttribute('font-weight', '700');
            text.textContent = String.fromCharCode(931);
            symbol.appendChild(text);
            defs.appendChild(symbol);
            return symbolId;
        }
        const symbol = createSvgElement('symbol');
        const symbolId = `ert-icon-${iconName}`;
        symbol.setAttribute('id', symbolId);
        symbol.setAttribute('viewBox', source.getAttribute('viewBox') || '0 0 24 24');
        Array.from(source.children).forEach(child => {
            if (child.tagName.toLowerCase() === 'title') return;
            symbol.appendChild(child.cloneNode(true));
        });
        if (iconName === 'circle-dot') {
            const circles = Array.from(symbol.querySelectorAll('circle'));
            if (circles.length >= 2) {
                const sorted = circles
                    .slice()
                    .sort((a, b) => (Number(a.getAttribute('r')) || 0) - (Number(b.getAttribute('r')) || 0));
                const inner = sorted[0];
                const outer = sorted[sorted.length - 1];
                const outerCx = outer.getAttribute('cx');
                const outerCy = outer.getAttribute('cy');
                if (outerCx) inner.setAttribute('cx', outerCx);
                if (outerCy) inner.setAttribute('cy', outerCy);
                const innerRadius = Number(inner.getAttribute('r'));
                if (Number.isFinite(innerRadius) && innerRadius > 0) {
                    inner.setAttribute('r', String(Math.max(1, innerRadius * 0.7)));
                }
                inner.setAttribute('fill', 'currentColor');
                inner.setAttribute('stroke', 'none');
            }
        }
        defs.appendChild(symbol);
        return symbolId;
    }

    private createIconButton(
        parent: SVGElement,
        x: number,
        y: number,
        size: number,
        iconName: string,
        _label: string,
        extraClass = ''
    ): SVGGElement {
        const group = createSvgGroup(parent, `ert-inquiry-icon-btn ${extraClass}`.trim(), x, y);
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        const rect = createSvgElement('rect');
        rect.classList.add('ert-inquiry-icon-btn-bg');
        rect.setAttribute('width', String(size));
        rect.setAttribute('height', String(size));
        rect.setAttribute('rx', String(Math.round(size * 0.3)));
        rect.setAttribute('ry', String(Math.round(size * 0.3)));
        group.appendChild(rect);
        const iconSize = Math.round(size * 0.5);
        const icon = this.createIconUse(iconName, (size - iconSize) / 2, (size - iconSize) / 2, iconSize);
        icon.classList.add('ert-inquiry-icon');
        group.appendChild(icon);
        return group;
    }

    private createIconUse(iconName: string, x: number, y: number, size: number): SVGUseElement {
        const use = createSvgElement('use');
        use.setAttribute('x', String(x));
        use.setAttribute('y', String(y));
        use.setAttribute('width', String(size));
        use.setAttribute('height', String(size));
        this.setIconUse(use, iconName);
        return use;
    }

    private setIconUse(use: SVGUseElement | undefined, iconName: string): void {
        if (!use) return;
        const symbolId = `ert-icon-${iconName}`;
        use.setAttribute('href', `#${symbolId}`);
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${symbolId}`);
    }

    private buildDefaultSelectedPromptIds(): Record<InquiryZone, string> {
        const config = this.getPromptConfig();
        const pickFirstAvailable = (zone: InquiryZone): string => {
            const slots = config[zone] ?? [];
            const firstAvailable = slots.find(slot => this.getQuestionTextForSlot(zone, slot).trim().length > 0);
            return firstAvailable?.id ?? slots[0]?.id ?? zone;
        };
        return {
            setup: pickFirstAvailable('setup'),
            pressure: pickFirstAvailable('pressure'),
            payoff: pickFirstAvailable('payoff')
        };
    }

    private ensurePromptConfig(): void {
        if (!this.plugin.settings.inquiryPromptConfig) {
            this.plugin.settings.inquiryPromptConfig = buildDefaultInquiryPromptConfig();
            void this.plugin.saveSettings();
        }
    }

    private getPromptConfig(): InquiryPromptConfig {
        return normalizeInquiryPromptConfig(this.plugin.settings.inquiryPromptConfig);
    }

    private getQuestionTextForSlot(zone: InquiryZone, slot: InquiryPromptSlot): string {
        const canonicalId = getBuiltInPromptSeed(zone)?.id;
        const stored = slot.question ?? '';
        if (stored.trim().length > 0) {
            return stored;
        }
        if (slot.builtIn && slot.id === canonicalId) {
            return getCanonicalPromptText(zone);
        }
        return stored;
    }

    private getPromptOptions(zone: InquiryZone): InquiryQuestion[] {
        const config = this.getPromptConfig();
        const icon = zone === 'setup' ? 'help-circle' : zone === 'pressure' ? 'activity' : 'check-circle';
        return (config[zone] ?? [])
            .map(slot => {
                const question = this.getQuestionTextForSlot(zone, slot);
                return { slot, question };
            })
            .filter(entry => entry.question.trim().length > 0)
            .map(entry => ({
                id: entry.slot.id,
                label: entry.slot.label || (zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff'),
                question: entry.question,
                zone,
                icon
            }));
    }

    private getActivePrompt(zone: InquiryZone): InquiryQuestion | undefined {
        const options = this.getPromptOptions(zone);
        if (!options.length) return undefined;
        const activeId = this.state.selectedPromptIds[zone];
        const match = options.find(prompt => prompt.id === activeId);
        if (match) return match;
        const fallback = options[0];
        this.state.selectedPromptIds[zone] = fallback.id;
        return fallback;
    }

    private getProcessedPromptState(): { id: string | null; status: 'success' | 'error' | null } {
        const result = this.state.activeResult;
        if (!result || this.state.isRunning) return { id: null, status: null };
        if (result.scope !== this.state.scope) return { id: null, status: null };
        const focusLabel = this.getFocusLabel();
        if (result.focusId && result.focusId !== focusLabel) return { id: null, status: null };
        const status = this.isErrorResult(result) ? 'error' : 'success';
        return { id: result.questionId, status };
    }

    private updateZonePrompts(): void {
        this.syncSelectedPromptIds();
        const paddingX = 24;
        const pillHeight = 40;
        const processed = this.getProcessedPromptState();
        this.zonePromptElements.forEach((elements, zone) => {
            const prompt = this.getActivePrompt(zone);
            if (!prompt) {
                elements.text.textContent = '';
                elements.bg.setAttribute('width', '0');
                elements.bg.setAttribute('height', '0');
                elements.glow.setAttribute('width', '0');
                elements.glow.setAttribute('height', '0');
                elements.group.classList.remove('is-active', 'is-processed', 'is-processed-success', 'is-processed-error', 'is-locked');
                return;
            }
            elements.text.textContent = prompt.question;
            const textLength = elements.text.getComputedTextLength();
            const width = Math.max(textLength + (paddingX * 2), 180);
            elements.bg.setAttribute('width', width.toFixed(2));
            elements.bg.setAttribute('height', String(pillHeight));
            elements.bg.setAttribute('x', String(-width / 2));
            elements.bg.setAttribute('y', String(-pillHeight / 2));
            elements.bg.setAttribute('rx', String(pillHeight / 2));
            elements.bg.setAttribute('ry', String(pillHeight / 2));
            elements.glow.setAttribute('width', width.toFixed(2));
            elements.glow.setAttribute('height', String(pillHeight));
            elements.glow.setAttribute('x', String(-width / 2));
            elements.glow.setAttribute('y', String(-pillHeight / 2));
            elements.glow.setAttribute('rx', String(pillHeight / 2));
            elements.glow.setAttribute('ry', String(pillHeight / 2));
            elements.group.classList.toggle('is-active', this.state.selectedPromptIds[zone] === prompt.id);
            const isProcessed = processed.id === prompt.id;
            elements.group.classList.toggle('is-processed', isProcessed);
            elements.group.classList.toggle('is-processed-success', isProcessed && processed.status === 'success');
            elements.group.classList.toggle('is-processed-error', isProcessed && processed.status === 'error');
            elements.group.classList.toggle('is-locked', this.state.isRunning && this.state.activeZone === zone);
            elements.group.setAttribute('data-prompt-id', prompt.id);
            elements.group.removeAttribute('aria-label');
        });
    }

    private updateGlyphPromptState(): void {
        if (!this.glyph) return;
        this.syncSelectedPromptIds();
        const processed = this.getProcessedPromptState();
        const promptsByZone = {
            setup: this.getPromptOptions('setup').map(prompt => ({ id: prompt.id, question: prompt.question })),
            pressure: this.getPromptOptions('pressure').map(prompt => ({ id: prompt.id, question: prompt.question })),
            payoff: this.getPromptOptions('payoff').map(prompt => ({ id: prompt.id, question: prompt.question }))
        };
        this.glyph.updatePromptState({
            promptsByZone,
            selectedPromptIds: this.state.selectedPromptIds,
            processedPromptId: processed.id,
            processedStatus: processed.status,
            lockedPromptId: this.state.isRunning ? this.state.activeQuestionId : null,
            onPromptSelect: (zone, promptId) => {
                if (this.isInquiryRunDisabled()) return;
                if (this.state.isRunning) {
                    this.notifyInteraction('Inquiry running. Please wait.');
                    return;
                }
                const prompt = this.getPromptOptions(zone)
                    .find(item => item.id === promptId);
                if (prompt && this.isErrorState() && this.state.activeResult?.questionId === prompt.id) {
                    void this.openInquiryErrorLog();
                    return;
                }
                this.clearErrorStateForAction();
                this.setSelectedPrompt(zone, promptId);
                if (prompt) {
                    void this.handleQuestionClick(prompt);
                } else {
                    this.notifyInteraction('No question configured for this slot.');
                }
            },
            onPromptHover: (zone, _promptId, promptText) => {
                if (this.isInquiryRunDisabled()) return;
                this.showPromptPreview(zone, this.state.mode, promptText);
            },
            onPromptHoverEnd: () => {
                if (this.isInquiryRunDisabled()) return;
                this.hidePromptPreview();
            }
        });
    }

    private syncSelectedPromptIds(): void {
        const config = this.getPromptConfig();
        (['setup', 'pressure', 'payoff'] as InquiryZone[]).forEach(zone => {
            const slots = config[zone] ?? [];
            const available = slots.filter(slot => this.getQuestionTextForSlot(zone, slot).trim().length > 0);
            const canonicalId = getBuiltInPromptSeed(zone)?.id;
            const desired = available[0]?.id ?? canonicalId ?? slots[0]?.id ?? zone;
            if (!desired) return;
            const current = this.state.selectedPromptIds[zone];
            const currentValid = available.some(slot => slot.id === current);
            if (!currentValid) {
                this.state.selectedPromptIds[zone] = desired;
            }
        });
    }

    private setSelectedPrompt(zone: InquiryZone, promptId: string): void {
        if (this.state.isRunning) return;
        if (this.state.selectedPromptIds[zone] === promptId) return;
        this.state.selectedPromptIds[zone] = promptId;
        this.updateZonePrompts();
        this.updateGlyphPromptState();
    }

    private handlePromptClick(zone: InquiryZone): void {
        if (this.isInquiryRunDisabled()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        const options = this.getPromptOptions(zone);
        if (!options.length) {
            this.notifyInteraction('No questions configured for this zone.');
            return;
        }
        const currentId = this.state.selectedPromptIds[zone];
        const currentIdx = options.findIndex(prompt => prompt.id === currentId);
        const nextIdx = options.length > 1
            ? (currentIdx >= 0 ? (currentIdx + 1) % options.length : 0)
            : (currentIdx >= 0 ? currentIdx : 0);
        const nextPrompt = options[nextIdx] ?? options[0];
        if (!nextPrompt) {
            this.notifyInteraction('No questions configured for this zone.');
            return;
        }
        if (this.isErrorState() && this.state.activeResult?.questionId === nextPrompt.id) {
            void this.openInquiryErrorLog();
            return;
        }
        this.clearErrorStateForAction();
        if (nextPrompt.id !== currentId) {
            this.setSelectedPrompt(zone, nextPrompt.id);
        }
        void this.handleQuestionClick(nextPrompt);
    }

    private renderZonePods(parent: SVGGElement): void {
        const rZone = FLOW_RADIUS + FLOW_STROKE + 90;
        const zones: Array<{ id: InquiryZone; angle: number }> = [
            { id: 'setup', angle: 210 },
            { id: 'pressure', angle: 330 },
            { id: 'payoff', angle: 90 }
        ];

        this.zonePromptElements.clear();

        zones.forEach(zone => {
            const pos = this.polarToCartesian(rZone, zone.angle);
            const zoneEl = createSvgGroup(parent, `ert-inquiry-zone-pod ert-inquiry-zone--${zone.id}`, pos.x, pos.y);
            zoneEl.setAttribute('role', 'button');
            zoneEl.setAttribute('tabindex', '0');
            const bg = createSvgElement('rect');
            bg.classList.add('ert-inquiry-zone-pill');
            zoneEl.appendChild(bg);
            const glow = createSvgElement('rect');
            glow.classList.add('ert-inquiry-zone-pill-glow');
            zoneEl.appendChild(glow);

            const text = createSvgText(zoneEl, 'ert-inquiry-zone-pill-text', '', 0, 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('alignment-baseline', 'middle');

            this.zonePromptElements.set(zone.id, { group: zoneEl, bg, glow, text });

            this.registerSvgEvent(zoneEl, 'click', () => this.handlePromptClick(zone.id));
            this.registerSvgEvent(zoneEl, 'pointerenter', () => {
                if (this.isInquiryRunDisabled()) return;
                const prompt = this.getActivePrompt(zone.id);
                if (prompt) {
                    this.showPromptPreview(zone.id, this.state.mode, prompt.question);
                }
                this.setHoverText(this.buildZoneHoverText(zone.id));
            });
            this.registerSvgEvent(zoneEl, 'pointerleave', () => {
                if (this.isInquiryRunDisabled()) return;
                this.clearHoverText();
                this.hidePromptPreview();
            });
        });
    }

    private polarToCartesian(radius: number, degrees: number): { x: number; y: number } {
        const radians = (degrees * Math.PI) / 180;
        return {
            x: radius * Math.cos(radians),
            y: radius * Math.sin(radians)
        };
    }

    private buildDebugOverlay(parent: SVGElement): void {
        const debugGroup = createSvgGroup(parent, 'ert-inquiry-debug');
        debugGroup.setAttribute('id', 'inq-debug');

        const rect = createSvgElement('rect');
        rect.classList.add('ert-inquiry-debug-frame');
        rect.setAttribute('x', String(VIEWBOX_MIN));
        rect.setAttribute('y', String(VIEWBOX_MIN));
        rect.setAttribute('width', String(VIEWBOX_SIZE));
        rect.setAttribute('height', String(VIEWBOX_SIZE));
        debugGroup.appendChild(rect);

        const xAxis = createSvgElement('line');
        xAxis.classList.add('ert-inquiry-debug-axis');
        xAxis.setAttribute('x1', String(VIEWBOX_MIN));
        xAxis.setAttribute('y1', '0');
        xAxis.setAttribute('x2', String(VIEWBOX_MAX));
        xAxis.setAttribute('y2', '0');
        debugGroup.appendChild(xAxis);

        const yAxis = createSvgElement('line');
        yAxis.classList.add('ert-inquiry-debug-axis');
        yAxis.setAttribute('x1', '0');
        yAxis.setAttribute('y1', String(VIEWBOX_MIN));
        yAxis.setAttribute('x2', '0');
        yAxis.setAttribute('y2', String(VIEWBOX_MAX));
        debugGroup.appendChild(yAxis);

        const tickOffsets = [VIEWBOX_MAX * 0.25, VIEWBOX_MAX * 0.5];
        const tickHalf = 12;
        tickOffsets.forEach(offset => {
            [offset, -offset].forEach(position => {
                const xTick = createSvgElement('line');
                xTick.classList.add('ert-inquiry-debug-tick');
                xTick.setAttribute('x1', String(position));
                xTick.setAttribute('y1', String(-tickHalf));
                xTick.setAttribute('x2', String(position));
                xTick.setAttribute('y2', String(tickHalf));
                debugGroup.appendChild(xTick);

                const yTick = createSvgElement('line');
                yTick.classList.add('ert-inquiry-debug-tick');
                yTick.setAttribute('x1', String(-tickHalf));
                yTick.setAttribute('y1', String(position));
                yTick.setAttribute('x2', String(tickHalf));
                yTick.setAttribute('y2', String(position));
                debugGroup.appendChild(yTick);
            });
        });

        const label = createSvgText(debugGroup, 'ert-inquiry-debug-label', 'ORIGIN', 0, 0);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
    }

    private renderModeIcons(parent: SVGGElement): void {
        const iconOffsetY = MODE_ICON_OFFSET_Y;
        const iconSize = Math.round(VIEWBOX_SIZE * 0.25 * 0.7);
        const iconX = Math.round(-iconSize / 2);
        const viewBoxHalf = MODE_ICON_VIEWBOX / 2;
        const iconGroup = createSvgGroup(parent, 'ert-inquiry-mode-icons', 0, iconOffsetY);

        const createIcon = (cls: string, paths: string[], rotateDeg = 0): SVGSVGElement => {
            const group = createSvgElement('svg');
            group.classList.add('ert-inquiry-mode-icon', 'ert-inquiry-mode-icon-btn', cls);
            group.setAttribute('x', String(iconX));
            group.setAttribute('y', '0');
            group.setAttribute('width', String(iconSize));
            group.setAttribute('height', String(iconSize));
            group.setAttribute('viewBox', `${-viewBoxHalf} ${-viewBoxHalf} ${MODE_ICON_VIEWBOX} ${MODE_ICON_VIEWBOX}`);
            group.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            group.setAttribute('pointer-events', 'none');
            const transformGroup = createSvgElement('g');
            if (rotateDeg) {
                transformGroup.setAttribute('transform', `rotate(${rotateDeg})`);
            }
            const pathGroup = createSvgElement('g');
            pathGroup.setAttribute('transform', `translate(${-viewBoxHalf} ${-viewBoxHalf})`);
            paths.forEach(d => {
                const path = createSvgElement('path');
                path.setAttribute('d', d);
                pathGroup.appendChild(path);
            });
            transformGroup.appendChild(pathGroup);
            group.appendChild(transformGroup);
            iconGroup.appendChild(group);
            return group as SVGSVGElement;
        };

        this.flowModeIconEl = createIcon('ert-inquiry-mode-icon--flow', FLOW_ICON_PATHS);
        this.depthModeIconEl = createIcon('ert-inquiry-mode-icon--depth', DEPTH_ICON_PATHS, 90);

        const hit = createSvgElement('rect');
        hit.classList.add('ert-inquiry-mode-icon-hit');
        const hitHeight = Math.round(iconSize * 0.4);
        const hitY = Math.round((iconSize - hitHeight) / 2);
        hit.setAttribute('x', String(iconX));
        hit.setAttribute('y', String(hitY));
        hit.setAttribute('width', String(iconSize));
        hit.setAttribute('height', String(hitHeight));
        hit.setAttribute('rx', String(Math.round(iconSize * 0.2)));
        hit.setAttribute('ry', String(Math.round(iconSize * 0.2)));
        hit.setAttribute('pointer-events', 'all');
        hit.setAttribute('tabindex', '0');
        hit.setAttribute('role', 'button');
        iconGroup.appendChild(hit);
        this.modeIconToggleHit = hit;
    }

    private buildSceneDossierLayer(parent: SVGGElement, y: number): void {
        const group = createSvgGroup(parent, 'ert-inquiry-scene-dossier ert-hidden', 0, y);
        group.setAttribute('pointer-events', 'none');

        const bg = createSvgElement('rect');
        bg.classList.add('ert-inquiry-scene-dossier-bg');
        bg.setAttribute('x', String(-SCENE_DOSSIER_WIDTH / 2));
        bg.setAttribute('y', '0');
        bg.setAttribute('width', String(SCENE_DOSSIER_WIDTH));
        bg.setAttribute('height', String(SCENE_DOSSIER_MIN_HEIGHT));
        bg.setAttribute('rx', '18');
        bg.setAttribute('ry', '18');
        group.appendChild(bg);

        const header = createSvgText(group, 'ert-inquiry-scene-dossier-header', '', 0, SCENE_DOSSIER_PADDING_Y + SCENE_DOSSIER_HEADER_SIZE);
        header.setAttribute('text-anchor', 'middle');

        const body = createSvgText(group, 'ert-inquiry-scene-dossier-body', '', 0, 0);
        body.setAttribute('x', String((-SCENE_DOSSIER_WIDTH / 2) + SCENE_DOSSIER_SIDE_PADDING));
        body.setAttribute('text-anchor', 'start');

        const footer = createSvgText(group, 'ert-inquiry-scene-dossier-footer', '', 0, 0);
        footer.setAttribute('text-anchor', 'middle');

        this.sceneDossierGroup = group;
        this.sceneDossierBg = bg;
        this.sceneDossierHeader = header;
        this.sceneDossierBody = body;
        this.sceneDossierFooter = footer;
    }

    private renderWaveHeader(parent: SVGElement): void {
        const flowWidth = 2048;
        const flowOffsetY = 740;
        const targetWidth = VIEWBOX_SIZE * 0.5;
        const scale = targetWidth / flowWidth;
        const y = VIEWBOX_MIN + 50;
        const group = createSvgGroup(parent, 'ert-inquiry-wave-header');
        group.setAttribute('transform', `translate(0 ${y}) scale(${scale.toFixed(4)}) translate(${-flowWidth / 2} ${-flowOffsetY})`);
        group.setAttribute('pointer-events', 'none');

        // Path data is internal to the inquiry renderer.
        const paths = [
            'M1873.99,900.01c.23,1.74-2.27.94-3.48.99-14.3.59-28.74-.35-43.05-.04-2.37.05-4.55,1.03-6.92,1.08-124.15,2.86-248.6,8.35-373,4.92-91.61-2.53-181.2-15.53-273.08-17.92-101.98-2.65-204.05,7.25-305.95.95-83.2-5.14-164.18-24.05-247.02-31.98-121.64-11.65-245.9-13.5-368.04-15.96-2.37-.05-4.55-1.04-6.92-1.08-17.31-.34-34.77.75-52.05.04-1.22-.05-3.72.75-3.48-.99,26.49-.25,53.03.28,79.54.03,144.74-1.38,289.81-5.3,433.95,8.97,18.67,1.85,37.34,5.16,56.01,6.99,165.31,16.18,330.85-3.46,495.99,14.01,118.64,12.56,236.15,30.42,355.97,28.03,87.15,0,174.3,2.45,261.54,1.97Z',
            'M1858.99,840.01c.23,1.74-2.27.94-3.48.99-15.63.64-31.41-.36-47.05-.04-2.37.05-4.55,1.03-6.92,1.08-127.12,2.74-254.28,9.03-381.05,2.97-86.31-4.13-170.32-17.4-256.98-20.02-110.96-3.36-222.13,6.92-333-1-62.18-4.44-123.32-15.98-185.14-22.86-130.81-14.57-267.28-16.86-398.92-19.08-2.36-.04-4.55-1.04-6.92-1.08-20.56-.33-41.57.88-62.05.04-1.22-.05-3.72.75-3.48-.99,27.83-.25,55.7.28,83.54.03,110.53-1,221.67-2.9,331.92,2,82.52,3.67,164.67,14.08,247,17,120.4,4.27,240.84-7.91,361.03,1.97,68.04,5.59,135.16,18.98,203.02,25.98,102.05,10.53,205.5,10.76,307.95,12.05,50.17.63,100.37.51,150.54.97Z',
            'M1842.99,961.01c.23,1.74-2.27.94-3.48.99-25.56,1.05-51.45.11-77.05.96l-79.92,3.08c-11.35.14-22.73-.31-34.08-.08-75.38,1.5-150.52,3.23-225.92,0-70.84-3.04-141.24-10.76-212.08-12.92-110.8-3.38-221.44,7.94-331.95.95-87.75-5.56-170.98-27.28-258.02-35.98-121.12-12.11-248.16-13.39-370.03-15.97-2.37-.05-4.55-1.03-6.92-1.08-16.64-.35-33.43.72-50.05.04-1.22-.05-3.72.75-3.48-.99,21.16-.25,42.37.28,63.54.03,120.89-1.45,244.31-4.94,364.95,1.97,92.31,5.29,182.02,23.64,274.97,26.03,97.61,2.52,194.76-4.98,292.08-1.08,102.89,4.12,204.72,22.93,307.92,28.08,108.68,5.42,217.3,1.72,326.08,4.92,7.47.22,15.65,1.96,23.45,1.05Z',
            'M1892.99,1020.01c.23,1.74-2.27.94-3.48.99-16.61.68-33.41-.29-50.05-.04-2.36.04-4.55,1.04-6.92,1.08-127.73,2.28-255.33,8.29-383,4.92-71.58-1.89-142.68-9.43-214.03-11.97-125.84-4.47-251.12,11.24-377,0-78-6.96-152.8-27.94-231.01-35.99-132.21-13.59-267.3-12.99-400.03-16.97l-19.45-2.03c31.83-.25,63.7.28,95.54.03,135.4-1.07,273.36-5.92,407.82,11.1,42.78,5.42,85.05,13.34,128.15,16.85,139.4,11.34,279.58-5.96,418.98,5.02,46.43,3.66,92.62,10.85,139.01,14.99,108.66,9.68,220.94,10.96,329.95,12.05,55.16.55,110.38-.5,165.54-.03Z',
            'M1846.99,1081.01c.23,1.74-2.27.94-3.48.99-16.29.67-32.74-.35-49.05-.04-126.07,2.42-250.52,8.4-376.97,3.05-54.11-2.29-108-7.25-162.03-8.97-147.59-4.7-291.2,17.69-438.82-4.18-44.08-6.53-87.24-17.93-131.31-24.69-118.91-18.24-240.1-17.95-359.79-24.21l-138.05-1.96-3.48-.99c45.84-.3,91.68-.55,137.54-.97,118.46-1.08,241.16-3.52,358.95,8.96,49.25,5.22,97.78,15.79,147.01,20.99,134.9,14.23,269.26-2.37,404,4,115.35,5.45,230.26,23.7,345.95,24.05l269.54,3.97Z',
            'M1886.99,1140.01c.23,1.74-2.27.94-3.48.99-18.28.75-36.75-.35-55.05-.04-2.36.04-4.55,1.04-6.92,1.08-124.58,2.26-249.4,6.27-374,2.92-79.23-2.13-157.79-10.68-237-9.92-111.01,1.07-222.29,15.23-333.04,4.95-80.02-7.42-157.13-29.72-237.13-38.87-109.52-12.53-220.11-13.58-329.83-18.17-30.26-1.04-60.82.28-91.05-.96-1.22-.05-3.72.75-3.48-.99,33.41-1.66,66.99-.63,100.54-.97,132.12-1.34,266.81-5.51,397.79,13.13,35.16,5,70.02,12.4,105.29,16.71,163.13,19.92,325.43-6.76,489.87,7.13,25.01,2.11,50.01,5.78,75.01,7.99,124.74,11,249.78,13.86,374.95,15.05,42.5.4,85.05-.39,127.54-.03Z',
            'M1827.99,1201.01c.23,1.74-2.27.94-3.48.99-14.29.59-28.74-.28-43.05-.04-115.65,1.92-231.19,6.1-346.92,2-86.12-3.05-168.46-11.59-255-8.92-104.04,3.22-205.73,15.8-310.04,4.95-74.39-7.74-146.25-28.95-221.13-37.87-128.28-15.28-263.63-17.56-392.83-20.17-16.64-.34-33.43.72-50.05.04-1.22-.05-3.72.75-3.48-.99,32.01-2.07,64.38-.68,96.54-.97,143.23-1.26,287.89-5.92,429.79,15.13,72.64,10.78,132.72,21.01,207.21,22.79,120.32,2.88,237.35-12.3,357.95-2.95,126.6,9.81,252.83,24.46,379.97,24.03l154.54,1.97Z',
            'M1866.99,1260.01c.23,1.74-2.27.94-3.48.99-14.95.61-30.07-.28-45.05-.04-2.36.04-4.55,1.04-6.92,1.08-130.78,2.42-262.55,7.17-393.05.97-74.88-3.56-146.78-13.43-221.95-10.97-102.42,3.35-199.73,18.19-303.03,9.95-86.01-6.86-168.89-32.27-255.13-41.87-122.3-13.61-249.91-14.58-372.92-17.08-2.37-.05-4.55-1.04-6.92-1.08-14.31-.24-28.76.63-43.05.04-1.22-.05-3.72.75-3.48-.99,15.16-.25,30.37.28,45.54.03,2.62-.04,5.06-1.05,7.91-1.09,130.55-1.8,270.66-5.74,400.04,7.06,71.51,7.08,141.22,24.72,213.02,29.98,60.88,4.46,121.1,1.83,181.95-1.03,82.54-3.88,157.04-9.61,240.04-1.95,42.37,3.91,84.57,10.5,127.01,13.99,95.85,7.88,192.07,8.57,287.95,12.05l151.54-.03Z',
            'M1844.99,780.01c.23,1.74-2.27.94-3.48.99-13.96.57-28.07-.3-42.05-.04-141.3,2.57-283.58,13.37-424.95,1.04-43.21-3.77-85.9-11.58-129.01-15.99-177.25-18.1-353.26,10.99-529.98-14.02l-187.5-24.98c22.83,1.11,45.69,1.89,68.54,2.95,110.04,5.09,214.45,8.65,324.92,6,86.75-2.08,173.41-7.14,260.03.05,62.88,5.22,124.66,18.79,187.15,26.85,142.22,18.35,285.65,13.88,428.91,16.09,2.85.04,5.29,1.04,7.91,1.09,13.16.25,26.38-.28,39.54-.03Z',
            'M1432.99,1309.01c.23,1.74-2.27.94-3.48.99-5.14.21-10.9.2-16.05.04-95.06-2.94-189.84-5.29-284.95,1.97-64.76,4.95-127.67,14.31-193.05,12.03-95.43-3.32-186.63-31.93-281.08-42.92-123.44-14.36-254.58-17.15-378.83-19.17-15.64-.25-31.43.68-47.05.04-1.22-.05-3.72.75-3.48-.99,8.82-.24,17.71.28,26.54.03,2.37-.07,4.55-1.03,6.92-1.08,128.74-2.8,269.19-5.78,397.03,5.05,70.2,5.95,137.58,23.09,207.02,29.98,53.73,5.33,106.29,4.52,160,2.02,82.26-3.83,161.4-14.61,243.99-7.01,55.59,5.12,110.68,16.34,166.5,19.01Z'
        ];

        paths.forEach(d => {
            const path = createSvgElement('path');
            path.classList.add('ert-inquiry-wave-path');
            path.setAttribute('d', d);
            group.appendChild(path);
        });
    }


    private buildFindingsPanel(findingsGroup: SVGGElement, width: number, height: number): void {
        const bg = createSvgElement('rect');
        bg.classList.add('ert-inquiry-panel-bg');
        bg.setAttribute('width', String(width));
        bg.setAttribute('height', String(height));
        bg.setAttribute('rx', '22');
        bg.setAttribute('ry', '22');
        findingsGroup.appendChild(bg);

        createSvgText(findingsGroup, 'ert-inquiry-findings-title', 'Findings', 24, 36);
        this.detailsToggle = this.createIconButton(findingsGroup, width - 88, 14, 32, 'chevron-down', 'Toggle details', 'ert-inquiry-details-toggle');
        this.detailsIcon = this.detailsToggle.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerSvgEvent(this.detailsToggle, 'click', () => this.toggleDetails());

        this.detailsEl = createSvgGroup(findingsGroup, 'ert-inquiry-details ert-hidden', 24, 64);
        this.detailRows = [
            createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Corpus fingerprint: not available', 0, 0),
            createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Recent inquiry sessions: not available', 0, 20)
        ];

        this.summaryEl = createSvgText(findingsGroup, 'ert-inquiry-summary', 'No inquiry run yet.', 24, 120);
        this.verdictEl = createSvgText(findingsGroup, 'ert-inquiry-verdict', 'Run an inquiry to see verdicts.', 24, 144);

        this.findingsListEl = createSvgGroup(findingsGroup, 'ert-inquiry-findings-list', 24, 176);

        const previewY = height - 210;
        this.artifactPreviewEl = createSvgGroup(findingsGroup, 'ert-inquiry-report-preview ert-hidden', 24, previewY);
        this.artifactPreviewBg = createSvgElement('rect');
        this.artifactPreviewBg.classList.add('ert-inquiry-report-preview-bg');
        this.artifactPreviewBg.setAttribute('width', String(width - 48));
        this.artifactPreviewBg.setAttribute('height', '180');
        this.artifactPreviewBg.setAttribute('rx', '14');
        this.artifactPreviewBg.setAttribute('ry', '14');
        this.artifactPreviewEl.appendChild(this.artifactPreviewBg);
    }

    private getResolvedEngine(): ResolvedInquiryEngine {
        if (!this._resolvedEngine) {
            // resolveInquiryEngine never throws — it returns a blocked DTO
            // with honest zeros when the provider lacks required capabilities.
            this._resolvedEngine = resolveInquiryEngine(this.plugin, BUILTIN_MODELS);
        }
        return this._resolvedEngine;
    }

    /** Called externally (e.g. from Settings) when AI strategy changes. */
    onAiSettingsChanged(): void {
        this._resolvedEngine = null;
        this.updateEngineBadge();
        this.refreshEnginePanel();
    }

    private refreshUI(): void {
        this._resolvedEngine = null; // Invalidate per-refresh-cycle cache.
        this.refreshCorpus();
        this.guidanceState = this.resolveGuidanceState();
        this.updateScopeToggle();
        this.updateModeToggle();
        this.updateModeClass();
        this.updateActiveZoneStyling();
        this.updateEngineBadge();
        this.updateZonePrompts();
        this.updateGlyphPromptState();
        this.renderMinimapTicks();
        this.updateFocusGlyph();
        this.updateRings();
        this.updateFindingsIndicators();
        this.updateFooterStatus();
        this.updateNavigationIcons();
        this.updateNavSessionLabel();
        this.updateRunningState();
        this.updateBriefingButtonState();
        this.refreshBriefingPanel();
        this.updateGuidance();
        void this.requestEstimateSnapshot();
    }

    private refreshCorpus(): void {
        this.corpusResolver = new InquiryCorpusResolver(this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        this.corpus = this.corpusResolver.resolve({
            scope: this.state.scope,
            focusBookId: this.state.focusBookId,
            sources
        });

        let shouldPersist = false;
        if (this.corpus.activeBookId) {
            if (this.state.focusBookId !== this.corpus.activeBookId) {
                this.state.focusBookId = this.corpus.activeBookId;
                shouldPersist = true;
            }
        } else {
            if (this.state.focusBookId) {
                this.state.focusBookId = undefined;
                shouldPersist = true;
            }
        }

        if (this.state.scope === 'book') {
            const sceneId = this.pickFocusScene(this.corpus.activeBookId, this.corpus.scenes);
            if (sceneId) {
                if (this.state.focusSceneId !== sceneId) {
                    this.state.focusSceneId = sceneId;
                    shouldPersist = true;
                }
                if (this.corpus.activeBookId) {
                    const prior = this.lastFocusSceneByBookId.get(this.corpus.activeBookId);
                    if (prior !== sceneId) {
                        this.lastFocusSceneByBookId.set(this.corpus.activeBookId, sceneId);
                        shouldPersist = true;
                    }
                }
            } else if (this.state.focusSceneId) {
                this.state.focusSceneId = undefined;
                shouldPersist = true;
            }
        }

        this.refreshPayloadStats();

        if (shouldPersist) {
            this.scheduleFocusPersist();
        }
    }

    private updateModeClass(): void {
        if (!this.rootSvg) return;
        this.rootSvg.classList.toggle('is-mode-flow', this.state.mode === 'flow');
        this.rootSvg.classList.toggle('is-mode-depth', this.state.mode === 'depth');
    }

    private getZoneColorVar(zone: InquiryZone): string {
        if (zone === 'pressure') return 'var(--ert-inquiry-zone-pressure)';
        if (zone === 'payoff') return 'var(--ert-inquiry-zone-payoff)';
        return 'var(--ert-inquiry-zone-setup)';
    }

    private updateActiveZoneStyling(): void {
        if (!this.rootSvg) return;
        const zone = this.state.activeZone ?? 'setup';
        const zoneColor = this.getZoneColorVar(zone);
        this.rootSvg.style.setProperty('--ert-inquiry-active-zone-color', zoneColor);
        this.rootSvg.style.setProperty('--ert-inquiry-hit-color', zoneColor);
    }

    private updateScopeToggle(): void {
        this.updateToggleButton(this.scopeToggleButton, this.state.scope === 'saga');
        if (this.scopeToggleIcon) {
            const icon = this.state.scope === 'saga' ? 'sigma' : 'columns-2';
            if (this.scopeToggleIcon instanceof SVGUseElement) {
                this.setIconUse(this.scopeToggleIcon, icon);
            }
        }
    }

    private updateModeToggle(): void {
        this.updateToggleButton(this.modeToggleButton, this.state.mode === 'depth');
        if (this.modeToggleIcon) {
            const icon = this.state.mode === 'depth' ? 'waves-arrow-down' : 'waves';
            this.setIconUse(this.modeToggleIcon, icon);
        }
    }

    private updateToggleButton(button: SVGElement | undefined, isActive: boolean): void {
        if (!button) return;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    private balanceTooltipText(text: string): string {
        if (!text || text.includes('\n')) return text;
        const lines = splitIntoBalancedLinesOptimal(text, INQUIRY_TOOLTIP_BALANCE_WIDTH, 1);
        return lines.length > 1 ? lines.join('\n') : text;
    }

    private setIconButtonDisabled(button: SVGGElement | undefined, disabled: boolean): void {
        if (!button) return;
        button.classList.toggle('is-disabled', disabled);
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        button.setAttribute('tabindex', disabled ? '-1' : '0');
    }

    private updateEngineBadge(): void {
        if (!this.engineBadgeGroup) return;
        const engine = this.getResolvedEngine();
        const modelLabel = engine.modelLabel;
        const providerLabel = engine.providerLabel;
        if (this.enginePanelMetaEl) {
            const payloadSummary = this.buildEnginePayloadSummary();
            this.enginePanelMetaEl.setText(`Active: ${providerLabel} · ${modelLabel} · ${payloadSummary.text}`);
        }
        this.syncEngineBadgePulse();
        this.refreshEnginePanel();
    }

    private syncEngineBadgePulse(): void {
        if (!this.engineBadgeGroup) return;
        const readinessUi = this.buildReadinessUiState();
        // While the estimate is still loading, stay neutral — don't flash red for unknown state.
        if (readinessUi.pending) {
            this.engineBadgeGroup.classList.remove('is-engine-pulse-amber', 'is-engine-pulse-red');
            return;
        }
        const hasError = this.isErrorState();
        const red = hasError
            || readinessUi.readiness.state === 'blocked'
            || (readinessUi.packaging === 'singlePassOnly' && readinessUi.readiness.exceedsBudget);
        this.engineBadgeGroup.classList.remove('is-engine-pulse-amber');
        this.engineBadgeGroup.classList.toggle('is-engine-pulse-red', red);
    }

    /**
     * Resolve the engine selection for a run submission.
     * Delegates to the shared canonical resolver — no legacy settings read.
     */
    private resolveEngineSelectionForRun(): {
        provider: AIProviderId;
        modelId: string;
        modelLabel: string;
    } {
        const engine = this.getResolvedEngine();
        return {
            provider: engine.provider,
            modelId: engine.modelId,
            modelLabel: engine.modelLabel
        };
    }

    private getClassScopeConfig(raw?: string[]): { allowAll: boolean; allowed: Set<string> } {
        return getClassScopeConfigPure(raw);
    }

    private getCurrentItems(): InquiryCorpusItem[] {
        if (!this.corpus) return [];
        return this.state.scope === 'saga' ? this.corpus.books : this.corpus.scenes;
    }

    private getMinimapItemFilePath(item: InquiryCorpusItem): string | undefined {
        const scenePath = (item as { filePath?: string }).filePath;
        if (scenePath) return scenePath;
        const bookPath = (item as { rootPath?: string }).rootPath;
        if (bookPath) return bookPath;
        return item.filePaths?.[0];
    }

    private getMinimapItemTitle(item: InquiryCorpusItem): string {
        const filePath = this.getMinimapItemFilePath(item);
        if (filePath) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && this.isTFile(file)) {
                return this.getDocumentTitle(file);
            }
            const segments = filePath.split('/').filter(Boolean);
            return segments[segments.length - 1] || filePath;
        }
        return item.displayLabel;
    }

    private pickFocusScene(bookId: string | undefined, scenes: InquiryCorpusItem[]): string | undefined {
        if (!bookId || !scenes.length) return undefined;
        const candidates = [
            this.lastFocusSceneByBookId.get(bookId),
            this.state.focusSceneId
        ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        for (const candidate of candidates) {
            const match = scenes.find(scene => this.matchesSceneSelectionId(scene, candidate));
            if (match) {
                return match.id;
            }
        }
        return scenes[0]?.id;
    }

    private matchesSceneSelectionId(item: InquiryCorpusItem, selectionId: string): boolean {
        const target = selectionId.toLowerCase();
        if (item.id.toLowerCase() === target) return true;
        if (typeof item.sceneId === 'string' && item.sceneId.toLowerCase() === target) return true;
        if (item.filePaths?.some(path => path.toLowerCase() === target)) return true;
        const scenePath = (item as { filePath?: string }).filePath;
        if (scenePath && scenePath.toLowerCase() === target) return true;
        return false;
    }

    private isSceneFile(file: TFile): boolean {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return false;
        const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const classValues = this.extractClassValues(normalized);
        return classValues.includes('scene');
    }

    private async refreshMinimapEmptyStates(items: InquiryCorpusItem[]): Promise<void> {
        const updateId = this.minimap.nextEmptyUpdateId();
        if (!items.length) return;
        const thresholds = this.getCorpusThresholds();
        const emptyMax = thresholds.emptyMax;
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const sceneFiles = markdownFiles.filter(file => this.isSceneFile(file));
        const scenePathsByRoot = new Map<string, string[]>();

        const getScenePathsForBook = (rootPath: string): string[] => {
            const cached = scenePathsByRoot.get(rootPath);
            if (cached) return cached;
            const prefix = `${rootPath}/`;
            const paths = sceneFiles
                .filter(file => file.path === rootPath || file.path.startsWith(prefix))
                .map(file => file.path);
            scenePathsByRoot.set(rootPath, paths);
            return paths;
        };

        const wordCounts = await Promise.all(items.map(async item => {
            const scenePath = (item as { filePath?: string }).filePath;
            if (scenePath) {
                const stats = await this.loadCorpusCcStatsByPath(scenePath);
                return stats.bodyWords;
            }

            const rootPath = (item as { rootPath?: string }).rootPath;
            if (rootPath) {
                const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
                if (rootFile && this.isTFile(rootFile)) {
                    const stats = await this.loadCorpusCcStatsByPath(rootPath);
                    return stats.bodyWords;
                }
                const scenePaths = getScenePathsForBook(rootPath);
                if (!scenePaths.length) return 0;
                const stats = await Promise.all(scenePaths.map(path => this.loadCorpusCcStatsByPath(path)));
                return stats.reduce((sum, stat) => sum + stat.bodyWords, 0);
            }

            const fallbackPaths = item.filePaths ?? [];
            if (!fallbackPaths.length) return 0;
            const stats = await Promise.all(fallbackPaths.map(path => this.loadCorpusCcStatsByPath(path)));
            return stats.reduce((sum, stat) => sum + stat.bodyWords, 0);
        }));

        if (!this.minimap.isCurrentEmptyUpdate(updateId)) return;

        this.minimap.applyEmptyStates(wordCounts, emptyMax);
    }

    private renderMinimapTicks(): void {
        const items = this.getCurrentItems();
        const result = this.minimap.renderTicks(items, this.state.scope, VIEWBOX_SIZE, {
            getItemTitle: (item) => this.getMinimapItemTitle(item),
            balanceTooltipText: (text) => this.balanceTooltipText(text),
            registerDomEvent: (el, event, handler) => this.registerDomEvent(el, event, handler),
            onTickClick: (item, event) => {
                this.clearResultPreview();
                this.clearErrorStateForAction();
                if (this.state.isRunning) {
                    this.notifyInteraction('Inquiry running. Please wait.');
                    return;
                }
                if (this.state.scope === 'book') {
                    if (event.shiftKey) {
                        const filePath = this.getMinimapItemFilePath(item);
                        const targetPath = filePath || item.id;
                        if (targetPath) {
                            void this.openSceneFromMinimap(targetPath);
                        }
                        return;
                    }
                    void this.openActiveBriefForItem(item);
                    return;
                }
                this.drillIntoBook(item.id);
            },
            onTickHover: (item, label, fullLabel) => {
                if (this.state.isRunning) return;
                this.handleMinimapHover(item, label, fullLabel);
            },
            onTickLeave: () => {
                this.clearHoverText();
                this.clearResultPreview();
            }
        });

        if (!result) {
            // No items — renderer hid backbone, run post-render updates
            this.renderCorpusCcStrip();
            this.updateMinimapFocus();
            this.updateMinimapPressureGauge();
            this.updatePreviewPanelPosition();
            return;
        }

        this.updatePreviewPanelPosition();
        this.minimap.buildSweepLayer(result.tickLayouts, result.tickWidth, this.minimap.layoutLength ?? 0);
        void this.refreshMinimapEmptyStates(items);
        this.renderCorpusCcStrip();
        this.applyMinimapSubsetShading(items);
        this.updateMinimapFocus();
        this.updateMinimapPressureGauge();
    }

    private updatePreviewPanelPosition(): void {
        if (!this.previewGroup || !this.minimap.hasGroup) return;
        const targetY = this.getPreviewPanelTargetY();
        if (!Number.isFinite(targetY)) return;
        this.previewGroup.setAttribute('transform', `translate(0 ${targetY})`);
        this.updateResultsFooterPosition(targetY);
    }

    private getPreviewPanelTargetY(): number {
        return this.minimap.getPreviewPanelTargetY();
    }

    private applyMinimapSubsetShading(items: InquiryCorpusItem[]): void {
        const manifest = this.buildCorpusManifest('minimap-subset', {
            questionZone: this.state.activeZone ?? undefined,
            applyOverrides: true
        });
        this.minimap.applySubsetShading(items, this.state.scope, manifest);
    }

    private updateMinimapPressureGauge(): void {
        const readinessUi = this.buildReadinessUiState();
        const effectiveReadinessUi = readinessUi.pending
            ? (this.lastReadinessUiState ?? readinessUi)
            : readinessUi;
        // While the estimate is still loading and there is no prior stable state, skip rendering.
        if (effectiveReadinessUi.pending) return;
        this.lastReadinessUiState = effectiveReadinessUi;
        const basePassPlan = this.getCurrentPassPlan(effectiveReadinessUi);
        const passPlan = this.getDisplayedPassPlan(basePassPlan);
        const styleSource = this.getStyleSource();
        const isPro = isProfessionalActive(this.plugin);
        const advancedContext = getLastAiAdvancedContext(this.plugin, 'InquiryMode') ?? null;
        this.minimap.updatePressureGauge(
            effectiveReadinessUi,
            passPlan,
            styleSource,
            isPro,
            advancedContext,
            this.currentRunProgress,
            (value) => this.formatTokenEstimate(value),
            (text) => this.balanceTooltipText(text)
        );
        this.updateMinimapReuseStatus();
    }

    private getDisplayedPassPlan(passPlan: PassPlanResult): PassPlanResult {
        const progress = this.currentRunProgress;
        if (!this.state.isRunning || !progress || progress.totalPasses <= 1) {
            return passPlan;
        }
        return {
            ...passPlan,
            packagingExpected: true,
            recentExactPassCount: progress.totalPasses,
            displayPassCount: progress.totalPasses,
            packagingTriggerReason: this.describeRunningPassPlan(progress)
        };
    }

    private describeRunningPassPlan(progress: InquiryRunProgressEvent): string {
        if (progress.phase === 'finalizing') {
            return `Finalizing after pass ${progress.totalPasses} of ${progress.totalPasses}.`;
        }
        return `Pass ${progress.currentPass} of ${progress.totalPasses} is in progress.`;
    }

    private updateMinimapReuseStatus(): void {
        const advanced = getLastAiAdvancedContext(this.plugin, 'InquiryMode') ?? null;
        this.minimap.updateReuseStatus(
            advanced,
            this.state.corpusFingerprint,
            this.payloadStats?.manifestFingerprint,
            (text) => this.balanceTooltipText(text)
        );
    }

    private renderCorpusCcStrip(): void {
        if (!this.rootSvg) return;
        const entries = this.getCorpusCcEntries();
        const entriesByClass = new Map<string, CorpusCcEntry[]>();
        entries.forEach(entry => {
            const list = entriesByClass.get(entry.className) ?? [];
            list.push(entry);
            entriesByClass.set(entry.className, list);
        });
        entriesByClass.forEach(items => {
            items.sort((a, b) => this.compareCorpusCcEntries(a, b));
        });
        const classGroups = this.getCorpusCcClassGroups(entriesByClass);

        if (!entries.length && classGroups.length === 0) {
            if (this.ccGroup) {
                this.ccGroup.classList.add('ert-hidden');
            }
            return;
        }

        if (!this.ccGroup) {
            this.ccGroup = createSvgGroup(this.rootSvg, 'ert-inquiry-cc');
        } else {
            this.ccGroup.classList.remove('ert-hidden');
        }

        const bottomLimit = VIEWBOX_MAX - CC_BOTTOM_MARGIN;
        const maxHeight = Math.round(VIEWBOX_SIZE * (2 / 3));
        const zoneTop = Math.min(ZONE_LAYOUT.setup.y, ZONE_LAYOUT.pressure.y) - ZONE_SEGMENT_HALF_HEIGHT;
        const topLimit = Math.max(bottomLimit - maxHeight, Math.round(zoneTop));
        const zoneLeft = ZONE_LAYOUT.setup.x;
        const zoneRight = ZONE_LAYOUT.pressure.x;
        const zoneBuffer = 50;

        const buildLayout = (pageWidth: number) => {
            const pageHeight = Math.round(pageWidth * 1.45);
            const gap = pageWidth;
            const titleY = gap;
            const docStartY = titleY + gap;
            const rowStep = pageHeight + gap;
            const usableHeight = Math.max(0, (bottomLimit - topLimit) - docStartY);
            const rowsPerColumn = Math.max(1, Math.floor((usableHeight + gap) / rowStep));
            const columnStep = pageWidth + gap;
            const anchorRightX = VIEWBOX_MAX - CC_RIGHT_MARGIN - pageWidth;
            const anchorLeftX = VIEWBOX_MIN + CC_RIGHT_MARGIN;
            let placeLeft = false;
            let rightColumnsUsed = 0;
            let leftColumnsUsed = 0;
            const placements: Array<{ entry: CorpusCcEntry; x: number; y: number }> = [];
            const layoutEntries: CorpusCcEntry[] = [];
            const classLayouts: Array<{
                group: CorpusCcGroup;
                centerX: number;
                width: number;
            }> = [];

            classGroups.forEach(group => {
                const columnsNeeded = Math.max(1, Math.ceil(group.items.length / rowsPerColumn));
                const side = placeLeft ? 'left' : 'right';
                const startIndex = side === 'right' ? rightColumnsUsed : leftColumnsUsed;
                const classLeftEdge = side === 'right'
                    ? anchorRightX - ((startIndex + columnsNeeded - 1) * columnStep)
                    : anchorLeftX + (startIndex * columnStep);
                const classRightEdge = side === 'right'
                    ? anchorRightX - (startIndex * columnStep) + pageWidth
                    : anchorLeftX + ((startIndex + columnsNeeded - 1) * columnStep) + pageWidth;
                const classWidth = classRightEdge - classLeftEdge;
                classLayouts.push({
                    group,
                    centerX: Math.round(classLeftEdge + (classWidth / 2)),
                    width: Math.round(classWidth)
                });

                let entryIndex = 0;
                for (let colOffset = 0; colOffset < columnsNeeded; colOffset += 1) {
                    for (let rowIndex = 0; rowIndex < rowsPerColumn; rowIndex += 1) {
                        if (entryIndex >= group.items.length) break;
                        const entry = group.items[entryIndex];
                        const x = side === 'right'
                            ? anchorRightX - ((startIndex + colOffset) * columnStep)
                            : anchorLeftX + ((startIndex + colOffset) * columnStep);
                        const y = docStartY + (rowIndex * rowStep);
                        placements.push({ entry, x: Math.round(x), y: Math.round(y) });
                        layoutEntries.push(entry);
                        entryIndex += 1;
                    }
                }

                if (side === 'right') {
                    rightColumnsUsed += columnsNeeded;
                    const leftmostEdge = anchorRightX - ((rightColumnsUsed - 1) * columnStep);
                    if (!placeLeft && leftmostEdge <= (zoneRight + zoneBuffer)) {
                        placeLeft = true;
                    }
                } else {
                    leftColumnsUsed += columnsNeeded;
                }
            });

            const rightBlockLeft = rightColumnsUsed > 0
                ? anchorRightX - ((rightColumnsUsed - 1) * columnStep)
                : anchorRightX;
            const rightBlockRight = rightColumnsUsed > 0
                ? anchorRightX + pageWidth
                : anchorRightX + pageWidth;
            const rightmostLeftEdge = leftColumnsUsed > 0
                ? anchorLeftX + ((leftColumnsUsed - 1) * columnStep) + pageWidth
                : anchorLeftX;
            const leftmostRightEdge = rightColumnsUsed > 0
                ? anchorRightX - ((rightColumnsUsed - 1) * columnStep)
                : anchorRightX;
            const overlapSetup = rightmostLeftEdge >= zoneLeft || leftmostRightEdge <= zoneLeft;

            return {
                pageWidth,
                pageHeight,
                gap,
                titleY,
                docStartY,
                rowsPerColumn,
                anchorRightX,
                placements,
                layoutEntries,
                classLayouts,
                rightBlockLeft,
                rightBlockRight,
                overlapSetup
            };
        };

        let layout = buildLayout(CC_PAGE_BASE_SIZE);
        while (layout.overlapSetup && layout.pageWidth > CC_PAGE_MIN_SIZE) {
            const nextSize = Math.max(CC_PAGE_MIN_SIZE, layout.pageWidth - 1);
            if (nextSize === layout.pageWidth) break;
            layout = buildLayout(nextSize);
        }
        const showWarning = layout.overlapSetup && layout.pageWidth <= CC_PAGE_MIN_SIZE;
        this.ccLayout = { pageWidth: layout.pageWidth, pageHeight: layout.pageHeight, gap: layout.gap };
        this.ccGroup.setAttribute('transform', `translate(0 ${topLimit})`);

        if (!this.ccLabelGroup) {
            this.ccLabelGroup = createSvgGroup(this.ccGroup, 'ert-inquiry-cc-label-group', 0, 0);
            this.ccLabelHit = createSvgElement('rect');
            this.ccLabelHit.classList.add('ert-inquiry-cc-label-hit');
            this.ccLabelGroup.appendChild(this.ccLabelHit);
            this.registerSvgEvent(this.ccLabelGroup, 'click', () => {
                this.handleCorpusGlobalToggle();
            });
        }
        if (!this.ccLabel) {
            this.ccLabel = createSvgText(this.ccLabelGroup ?? this.ccGroup, 'ert-inquiry-cc-label', 'Corpus', 0, 0);
            this.ccLabel.setAttribute('text-anchor', 'middle');
            this.ccLabel.setAttribute('dominant-baseline', 'middle');
            this.ccLabel.classList.add('is-actionable');
        }
        if (!this.ccLabelHint) {
            this.ccLabelHint = createSvgGroup(this.ccGroup, 'ert-inquiry-cc-hint', 0, 0);
            this.ccLabelHintIcon = this.createIconUse(
                'arrow-big-up',
                -CC_LABEL_HINT_SIZE / 2,
                -CC_LABEL_HINT_SIZE / 2,
                CC_LABEL_HINT_SIZE
            );
            this.ccLabelHintIcon.classList.add('ert-inquiry-cc-hint-icon');
            this.ccLabelHint.appendChild(this.ccLabelHintIcon);
            addTooltipData(
                this.ccLabelHint,
                this.balanceTooltipText('Click notes to adjust scope. Shift-click to open note.'),
                'top'
            );
        }
        this.ccLabel.textContent = this.getCorpusCcScopeLabel();
        const labelX = Math.round((layout.rightBlockLeft + layout.rightBlockRight) / 2);
        const labelYOffset = -5;
        if (this.ccLabelGroup) {
            this.ccLabelGroup.setAttribute('transform', `translate(0 ${labelYOffset})`);
        }
        this.ccLabel.setAttribute('x', String(labelX));
        this.ccLabel.setAttribute('y', '0');
        if (this.ccLabelGroup) {
            addTooltipData(this.ccLabelGroup, this.balanceTooltipText('Cycle all corpus scopes.'), 'top');
        }
        if (this.ccLabelHint) {
            const labelWidth = this.ccLabel.getComputedTextLength?.() ?? 0;
            const hintX = Math.round(labelX + (labelWidth / 2) + 5 + (CC_LABEL_HINT_SIZE / 2));
            this.ccLabelHint.setAttribute('transform', `translate(${hintX} ${labelYOffset})`);
            if (this.ccLabelHit) {
                const hitPaddingX = 6;
                const hitHeight = 20;
                const hitStartX = Math.round(labelX - (labelWidth / 2) - hitPaddingX);
                const hitWidth = Math.max(0, Math.round(labelWidth + (hitPaddingX * 2)));
                this.ccLabelHit.setAttribute('x', String(hitStartX));
                this.ccLabelHit.setAttribute('y', String(-Math.round(hitHeight / 2)));
                this.ccLabelHit.setAttribute('width', String(hitWidth));
                this.ccLabelHit.setAttribute('height', String(hitHeight));
            }
        }

        if (!this.ccEmptyText) {
            this.ccEmptyText = createSvgText(this.ccGroup, 'ert-inquiry-cc-empty ert-hidden', 'No corpus data', 0, 0);
            this.ccEmptyText.setAttribute('text-anchor', 'start');
            this.ccEmptyText.setAttribute('dominant-baseline', 'middle');
        }
        this.ccEmptyText.setAttribute('x', String(Math.round(layout.anchorRightX)));
        this.ccEmptyText.setAttribute('y', String(Math.round(layout.docStartY + (layout.pageHeight / 2))));
        if (showWarning) {
            this.ccEmptyText.textContent = 'Corpus too large';
            this.ccEmptyText.classList.remove('ert-hidden');
        } else {
            this.ccEmptyText.classList.add('ert-hidden');
        }

        const corner = Math.max(2, Math.round(layout.pageWidth * 0.125));

        const totalEntries = entries.length;
        while (this.ccSlots.length < totalEntries) {
            const group = createSvgGroup(this.ccGroup, 'ert-inquiry-cc-cell');
            const base = createSvgElement('rect');
            base.classList.add('ert-inquiry-cc-cell-base');
            const fill = createSvgElement('rect');
            fill.classList.add('ert-inquiry-cc-cell-fill');
            const border = createSvgElement('rect');
            border.classList.add('ert-inquiry-cc-cell-border');
            const lowSubstanceX = createSvgGroup(group, 'ert-inquiry-cc-cell-low-substance-x');
            const lowSubstanceXPrimary = createSvgElement('line');
            lowSubstanceXPrimary.classList.add('ert-inquiry-cc-cell-low-substance-x-line');
            const lowSubstanceXSecondary = createSvgElement('line');
            lowSubstanceXSecondary.classList.add('ert-inquiry-cc-cell-low-substance-x-line');
            lowSubstanceX.appendChild(lowSubstanceXPrimary);
            lowSubstanceX.appendChild(lowSubstanceXSecondary);
            const icon = createSvgGroup(group, 'ert-inquiry-cc-cell-icon');
            const iconOuter = createSvgElement('circle');
            iconOuter.classList.add('ert-inquiry-cc-cell-icon-outer');
            const iconInner = createSvgElement('circle');
            iconInner.classList.add('ert-inquiry-cc-cell-icon-inner');
            icon.appendChild(iconOuter);
            icon.appendChild(iconInner);
            group.appendChild(base);
            group.appendChild(fill);
            group.appendChild(border);
            group.appendChild(icon);
            group.appendChild(lowSubstanceX);
            this.registerSvgEvent(group, 'click', (evt: MouseEvent) => {
                if (this.state.isRunning) return;
                const entryKey = group.getAttribute('data-entry-key');
                if (!entryKey) return;
                if (evt.shiftKey) {
                    const filePath = group.getAttribute('data-file-path');
                    if (!filePath) return;
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && this.isTFile(file)) {
                        void openOrRevealFile(this.app, file);
                    }
                    return;
                }
                this.handleCorpusItemToggle(entryKey);
            });
            this.ccSlots.push({
                group,
                base,
                fill,
                border,
                lowSubstanceX,
                lowSubstanceXPrimary,
                lowSubstanceXSecondary,
                icon,
                iconOuter,
                iconInner
            });
        }

        this.ccSlots.forEach((slot, idx) => {
            if (idx >= totalEntries) {
                slot.group.classList.add('ert-hidden');
                slot.group.removeAttribute('data-entry-key');
                return;
            }
            const placement = layout.placements[idx];
            slot.group.classList.remove('ert-hidden');
            slot.group.setAttribute('data-class', placement.entry.className);
            slot.group.setAttribute('data-entry-key', placement.entry.entryKey);
            slot.group.setAttribute('transform', `translate(${placement.x} ${placement.y})`);
            slot.base.setAttribute('width', String(layout.pageWidth));
            slot.base.setAttribute('height', String(layout.pageHeight));
            slot.base.setAttribute('x', '0');
            slot.base.setAttribute('y', '0');
            slot.fill.setAttribute('width', String(layout.pageWidth));
            slot.fill.setAttribute('height', '0');
            slot.fill.setAttribute('x', '0');
            slot.fill.setAttribute('y', String(layout.pageHeight));
            slot.border.setAttribute('width', String(layout.pageWidth));
            slot.border.setAttribute('height', String(layout.pageHeight));
            slot.border.setAttribute('x', '0');
            slot.border.setAttribute('y', '0');
            slot.border.setAttribute('rx', String(corner));
            slot.border.setAttribute('ry', String(corner));
            const xInset = Math.max(2, Math.round(layout.pageWidth * 0.14));
            const yInset = Math.max(2, Math.round(layout.pageHeight * 0.14));
            slot.lowSubstanceXPrimary.setAttribute('x1', String(xInset));
            slot.lowSubstanceXPrimary.setAttribute('y1', String(yInset));
            slot.lowSubstanceXPrimary.setAttribute('x2', String(layout.pageWidth - xInset));
            slot.lowSubstanceXPrimary.setAttribute('y2', String(layout.pageHeight - yInset));
            slot.lowSubstanceXSecondary.setAttribute('x1', String(layout.pageWidth - xInset));
            slot.lowSubstanceXSecondary.setAttribute('y1', String(yInset));
            slot.lowSubstanceXSecondary.setAttribute('x2', String(xInset));
            slot.lowSubstanceXSecondary.setAttribute('y2', String(layout.pageHeight - yInset));
            const iconCenterX = Math.round(layout.pageWidth / 2);
            const iconCenterY = Math.round(layout.pageHeight / 2) + CC_CELL_ICON_OFFSET;
            const maxRadius = Math.max(2, (layout.pageWidth - 2) / 2);
            const outerRadius = Math.min(maxRadius, Math.max(3, Math.round(layout.pageWidth * 0.25 * 10) / 10));
            const innerRadius = Math.max(1.2, Math.round(outerRadius * 0.35 * 10) / 10);
            slot.icon.setAttribute('transform', `translate(${iconCenterX} ${iconCenterY})`);
            slot.iconOuter.setAttribute('cx', '0');
            slot.iconOuter.setAttribute('cy', '0');
            slot.iconOuter.setAttribute('r', String(outerRadius));
            slot.iconInner.setAttribute('cx', '0');
            slot.iconInner.setAttribute('cy', '0');
            slot.iconInner.setAttribute('r', String(innerRadius));
        });

        const titleTexts = this.ccClassLabels;
        while (titleTexts.length < layout.classLayouts.length) {
            const headerGroup = createSvgGroup(this.ccGroup, 'ert-inquiry-cc-class');
            const hit = createSvgElement('rect');
            hit.classList.add('ert-inquiry-cc-class-hit');
            headerGroup.appendChild(hit);
            const icon = createSvgGroup(headerGroup, 'ert-inquiry-cc-class-icon');
            const iconOuter = createSvgElement('circle');
            iconOuter.classList.add('ert-inquiry-cc-class-icon-outer');
            const iconInner = createSvgElement('circle');
            iconInner.classList.add('ert-inquiry-cc-class-icon-inner');
            icon.appendChild(iconOuter);
            icon.appendChild(iconInner);
            const label = createSvgText(headerGroup, 'ert-inquiry-cc-class-label', '', 0, 0);
            label.setAttribute('text-anchor', 'start');
            label.setAttribute('dominant-baseline', 'middle');
            headerGroup.appendChild(label);
            this.registerSvgEvent(headerGroup, 'click', () => {
                const groupKey = headerGroup.getAttribute('data-group-key') ?? headerGroup.getAttribute('data-class');
                if (!groupKey) return;
                this.handleCorpusGroupToggle(groupKey);
            });
            titleTexts.push({ group: headerGroup, hit, icon, iconOuter, iconInner, text: label });
        }
        layout.classLayouts.forEach((classLayout, idx) => {
            const header = titleTexts[idx];
            const { group, centerX, width } = classLayout;
            const availableWidth = Math.max(4, width - layout.gap);
            const modeMeta = this.getCorpusCcModeMeta(group.mode);
            header.group.setAttribute('data-group-key', group.key);
            header.group.setAttribute('data-class', group.className);
            header.group.classList.toggle('is-off', !modeMeta.isActive);
            header.group.classList.toggle('is-active', modeMeta.isActive);
            header.group.classList.remove('is-mode-none', 'is-mode-summary', 'is-mode-full');
            if (group.mode === 'summary') {
                header.group.classList.add('is-mode-summary');
            } else if (group.mode === 'full') {
                header.group.classList.add('is-mode-full');
            } else {
                header.group.classList.add('is-mode-none');
            }

            const variants = this.getCorpusCcHeaderLabelVariants(group.className, group.count, group.headerLabel);
            header.text.textContent = variants[0] ?? '';
            const iconAllowance = CC_HEADER_ICON_SIZE + CC_HEADER_ICON_GAP;
            let fallbackVariant = variants[0] ?? '';
            let fallbackWidth = Number.POSITIVE_INFINITY;
            let hasFit = false;
            for (let i = 0; i < variants.length; i += 1) {
                const variant = variants[i] ?? '';
                header.text.textContent = variant;
                const measuredWidth = header.text.getComputedTextLength() + iconAllowance;
                if (measuredWidth < fallbackWidth) {
                    fallbackVariant = variant;
                    fallbackWidth = measuredWidth;
                }
                if (measuredWidth <= availableWidth) {
                    hasFit = true;
                    break;
                }
            }
            if (!hasFit) {
                header.text.textContent = fallbackVariant;
            }

            const textWidth = header.text.getComputedTextLength();
            const totalWidth = CC_HEADER_ICON_SIZE + CC_HEADER_ICON_GAP + textWidth;
            const startX = centerX - (totalWidth / 2);
            const iconCenterX = startX + (CC_HEADER_ICON_SIZE / 2);
            const iconCenterY = layout.titleY - CC_HEADER_ICON_OFFSET;
            const outerRadius = Math.max(3, Math.round(CC_HEADER_ICON_SIZE * 0.45 * 10) / 10);
            const innerRadius = Math.max(1.2, Math.round(outerRadius * 0.35 * 10) / 10);
            header.icon.setAttribute('transform', `translate(${Math.round(iconCenterX)} ${Math.round(iconCenterY)})`);
            header.iconOuter.setAttribute('cx', '0');
            header.iconOuter.setAttribute('cy', '0');
            header.iconOuter.setAttribute('r', String(outerRadius));
            header.iconInner.setAttribute('cx', '0');
            header.iconInner.setAttribute('cy', '0');
            header.iconInner.setAttribute('r', String(innerRadius));
            header.text.setAttribute('x', String(Math.round(startX + CC_HEADER_ICON_SIZE + CC_HEADER_ICON_GAP)));
            header.text.setAttribute('y', String(layout.titleY));
            const hitPaddingX = 4;
            const hitHeight = Math.max(CC_HEADER_ICON_SIZE, 12) + 8;
            header.hit.setAttribute('x', String(Math.round(startX - hitPaddingX)));
            header.hit.setAttribute('y', String(Math.round(layout.titleY - (hitHeight / 2))));
            header.hit.setAttribute('width', String(Math.round(totalWidth + (hitPaddingX * 2))));
            header.hit.setAttribute('height', String(Math.round(hitHeight)));
            header.group.classList.remove('ert-hidden');
            addTooltipData(
                header.group,
                this.getCorpusCcHeaderTooltip(group.className, group.mode, group.count, group.headerTooltipLabel),
                'top'
            );
        });
        titleTexts.forEach((header, idx) => {
            if (idx < layout.classLayouts.length) return;
            header.group.classList.add('ert-hidden');
        });

        this.ccEntries = layout.layoutEntries;
        void this.updateCorpusCcData(layout.layoutEntries);
    }

    private getCorpusCcScopeLabel(): string {
        const focusLabel = this.getFocusLabel();
        if (this.state.scope === 'saga') {
            return `Corpus · Saga ${focusLabel}`;
        }
        return `Corpus · Book ${focusLabel}`;
    }

    private getCorpusGroupBaseClass(className: string): string {
        return getCorpusGroupBaseClassPure(className);
    }

    private getCorpusGroupKey(className: string, scope?: InquiryScope): string {
        return getCorpusGroupKeyPure(className, scope);
    }

    private getSceneBookGroupKey(bookId: string): string {
        return `scene-book:${bookId}`;
    }

    private parseSceneBookGroupKey(groupKey: string): string | null {
        const prefix = 'scene-book:';
        if (!groupKey.startsWith(prefix)) return null;
        const bookId = groupKey.slice(prefix.length).trim();
        return bookId.length ? bookId : null;
    }

    private getCorpusItemKey(className: string, filePath: string, scope?: InquiryScope, sceneId?: string): string {
        return getCorpusItemKeyPure(className, filePath, scope, sceneId);
    }

    private parseCorpusItemKey(entryKey: string): { className: string; scope?: InquiryScope; path: string; sceneId?: string } {
        return parseCorpusItemKeyPure(entryKey);
    }

    private getCorpusItemOverride(
        className: string,
        filePath: string,
        scope?: InquiryScope,
        sceneId?: string
    ): InquiryMaterialMode | undefined {
        return this.corpusService.getItemOverride(className, filePath, scope, sceneId);
    }

    private getCorpusCycleModes(className: string): InquiryMaterialMode[] {
        return getCorpusCycleModesPure(className);
    }

    private getCorpusGroupBaseMode(
        className: string,
        configMap: Map<string, InquiryClassConfig>
    ): InquiryMaterialMode {
        return this.corpusService.getGroupBaseMode(className, configMap, this.state.scope, this.ccEntries);
    }

    private getCorpusGroupEffectiveMode(
        className: string,
        configMap: Map<string, InquiryClassConfig>
    ): InquiryMaterialMode {
        return this.corpusService.getGroupEffectiveMode(className, configMap, this.state.scope, this.ccEntries);
    }

    private getCorpusItemEffectiveMode(
        entry: CorpusManifestEntry,
        configMap: Map<string, InquiryClassConfig>
    ): InquiryMaterialMode {
        return this.corpusService.getItemEffectiveMode(entry, configMap, this.state.scope, this.ccEntries);
    }

    private getCorpusGroupKeys(sources: InquirySourcesSettings): string[] {
        return getCorpusGroupKeysPure(sources, this.ccEntries);
    }

    private getCorpusGlobalMode(
        groupKeys: string[],
        configMap: Map<string, InquiryClassConfig>
    ): InquiryMaterialMode | 'mixed' {
        return this.corpusService.getGlobalMode(groupKeys, configMap, this.state.scope, this.ccEntries);
    }

    private getNextCorpusMode(current: InquiryMaterialMode, modes: InquiryMaterialMode[]): InquiryMaterialMode {
        return getNextCorpusModePure(current, modes);
    }

    private clearItemOverridesForGroup(groupKey: string): void {
        this.corpusService.clearItemOverridesForGroup(groupKey);
    }

    private hasCorpusOverrides(): boolean {
        return this.corpusService.hasOverrides();
    }

    private getCorpusOverrideSummary(): { active: boolean; classCount: number; itemCount: number; total: number } {
        return this.corpusService.getOverrideSummary();
    }

    private applyCorpusOverrideSummary(result: InquiryResult): InquiryResult {
        return this.corpusService.applyOverrideSummary(result);
    }

    private resetCorpusOverrides(): void {
        this.corpusService.resetOverrides();
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private handleCorpusGroupToggle(groupKey: string): void {
        if (this.state.isRunning) return;
        const sceneBookId = this.parseSceneBookGroupKey(groupKey);
        if (sceneBookId) {
            this.handleCorpusSceneBookGroupToggle(sceneBookId);
            return;
        }
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const currentMode = this.getCorpusGroupEffectiveMode(groupKey, configMap);
        const modes = this.getCorpusCycleModes(groupKey);
        const nextMode = this.getNextCorpusMode(currentMode, modes);
        const baseMode = this.getCorpusGroupBaseMode(groupKey, configMap);
        const normalizedNext = this.normalizeContributionMode(nextMode, this.getCorpusGroupBaseClass(groupKey));
        if (normalizedNext === baseMode) {
            this.corpusService.deleteClassOverride(groupKey);
        } else {
            this.corpusService.setClassOverride(groupKey, normalizedNext);
        }
        this.clearItemOverridesForGroup(groupKey);
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private getSceneBookEffectiveMode(entries: CorpusCcEntry[]): InquiryMaterialMode | 'mixed' {
        if (!entries.length) return 'none';
        const modes = entries.map(entry => this.normalizeContributionMode(entry.mode ?? 'none', 'scene'));
        const first = modes[0];
        if (modes.every(mode => mode === first)) return first;
        return 'mixed';
    }

    private getSceneBookDisplayMode(entries: CorpusCcEntry[]): InquiryMaterialMode {
        const mode = this.getSceneBookEffectiveMode(entries);
        if (mode === 'mixed') {
            const hasFull = entries.some(entry => this.normalizeContributionMode(entry.mode ?? 'none', 'scene') === 'full');
            return hasFull ? 'full' : 'summary';
        }
        return mode;
    }

    private handleCorpusSceneBookGroupToggle(bookId: string): void {
        const entries = this.ccEntries.filter(entry => entry.className === 'scene' && entry.bookId === bookId);
        if (!entries.length) return;

        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const classMode = this.getCorpusGroupEffectiveMode('scene', configMap);
        const currentMode = this.getSceneBookEffectiveMode(entries);
        const modes = this.getCorpusCycleModes('scene');
        const nextMode = currentMode === 'mixed' ? 'none' : this.getNextCorpusMode(currentMode, modes);
        const normalizedNext = this.normalizeContributionMode(nextMode, 'scene');

        entries.forEach(entry => {
            if (normalizedNext === classMode) {
                this.corpusService.deleteItemOverrideByKey(entry.entryKey);
            } else {
                this.corpusService.setItemOverrideByKey(entry.entryKey, normalizedNext);
            }
        });

        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private handleCorpusItemToggle(entryKey: string): void {
        if (this.state.isRunning) return;
        const entry = this.ccEntries.find(candidate => candidate.entryKey === entryKey);
        if (!entry) return;
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const groupKey = this.getCorpusGroupKey(entry.classKey, entry.scope);
        const classMode = this.getCorpusGroupEffectiveMode(groupKey, configMap);
        const currentMode = this.normalizeContributionMode(entry.mode, this.getCorpusGroupBaseClass(groupKey));
        const modes = this.getCorpusCycleModes(groupKey);
        const nextMode = this.getNextCorpusMode(currentMode, modes);
        const normalizedNext = this.normalizeContributionMode(nextMode, this.getCorpusGroupBaseClass(groupKey));
        if (normalizedNext === classMode) {
            this.corpusService.deleteItemOverrideByKey(entryKey);
        } else {
            this.corpusService.setItemOverrideByKey(entryKey, normalizedNext);
        }
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private handleCorpusGlobalToggle(): void {
        if (this.state.isRunning) return;
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const groupKeys = this.getCorpusGroupKeys(sources);
        if (!groupKeys.length) return;
        const current = this.getCorpusGlobalMode(groupKeys, configMap);
        const next = current === 'none'
            ? 'summary'
            : current === 'summary'
                ? 'full'
                : 'none';

        this.corpusService.resetOverrides();
        groupKeys.forEach(groupKey => {
            const baseClass = this.getCorpusGroupBaseClass(groupKey);
            const normalizedTarget = this.normalizeContributionMode(next, baseClass);
            const baseMode = this.getCorpusGroupBaseMode(groupKey, configMap);
            if (normalizedTarget !== baseMode) {
                this.corpusService.setClassOverride(groupKey, normalizedTarget);
            }
        });
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private isCorpusEmpty(): boolean {
        const stats = this.getPayloadStats();
        const total = stats.sceneTotal
            + stats.bookOutlineCount
            + stats.sagaOutlineCount
            + stats.referenceCounts.total;
        return total === 0;
    }

    private handleEmptyCorpusRun(): void {
        this.corpusWarningActive = true;
        this.updateGuidanceHelpTooltip(this.guidanceState);
        this.notifyInteraction('Corpus disabled. Enable corpus to run Inquiry.');
    }

    private getCorpusCcModeMeta(mode: InquiryMaterialMode): {
        label: string;
        short: string;
        icon: string;
        isActive: boolean;
    } {
        if (mode === 'summary') {
            return { label: 'Summary', short: 'SUM', icon: 'circle-dot', isActive: true };
        }
        if (mode === 'full') {
            return { label: 'Body', short: 'BODY', icon: 'disc', isActive: true };
        }
        return { label: 'Off', short: 'OFF', icon: 'circle', isActive: false };
    }

    private getCorpusCcHeaderLabelVariants(className: string, count: number, overrideLabel?: string): string[] {
        if (overrideLabel && overrideLabel.trim().length > 0) {
            return [overrideLabel.trim()];
        }
        if (className === 'outline-saga') {
            return [`${SIGMA_CHAR}`];
        }
        const base = this.getCorpusClassLabelVariants(className);
        return base.map(label => `${label} ${count}`);
    }

    private getCorpusCcHeaderTooltip(
        className: string,
        mode: InquiryMaterialMode,
        count: number,
        overrideLabel?: string
    ): string {
        const meta = this.getCorpusCcModeMeta(mode);
        const label = (overrideLabel && overrideLabel.trim().length > 0)
            ? overrideLabel.trim()
            : this.getCorpusCcHeaderDisplayLabel(className);
        const parts = [label, meta.label];
        if (meta.isActive || count > 0) {
            parts.push(String(count));
        }
        return parts.join(' · ');
    }

    private getCorpusCcHeaderDisplayLabel(className: string): string {
        if (className === 'outline-saga') return 'Saga Outline';
        const variants = this.getCorpusClassLabelVariants(className);
        return variants[0] ?? 'Class';
    }

    private getCorpusClassLabelVariants(className: string): string[] {
        const normalized = className.trim();
        if (!normalized) return ['Class', 'Cls', 'C'];
        if (normalized === 'outline-saga') {
            return [`${SIGMA_CHAR}`, 'Saga', 'S'];
        }
        const words = normalized
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        const title = words.length
            ? words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
            : normalized.charAt(0).toUpperCase() + normalized.slice(1);
        const acronym = words.length > 1
            ? words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 3)
            : title.slice(0, 3).toUpperCase();
        const letter = title.charAt(0).toUpperCase();
        const variants = [title, acronym, letter];
        return Array.from(new Set(variants.filter(Boolean)));
    }

    private getSceneBookMetaFromEntry(entry: CorpusCcEntry): { bookId: string; bookLabel: string; order: number } {
        const books = this.corpus?.books ?? [];
        if (entry.bookId) {
            const match = books.find(book => book.id === entry.bookId);
            if (match) {
                const index = books.findIndex(book => book.id === match.id);
                return {
                    bookId: match.id,
                    bookLabel: entry.bookLabel || match.displayLabel || 'B0',
                    order: index >= 0 ? index : Number.POSITIVE_INFINITY
                };
            }
            return {
                bookId: entry.bookId,
                bookLabel: entry.bookLabel || 'B0',
                order: Number.POSITIVE_INFINITY
            };
        }

        const byPath = books.find(book => entry.filePath === book.rootPath || entry.filePath.startsWith(`${book.rootPath}/`));
        if (byPath) {
            const index = books.findIndex(book => book.id === byPath.id);
            return {
                bookId: byPath.id,
                bookLabel: byPath.displayLabel || 'B0',
                order: index >= 0 ? index : Number.POSITIVE_INFINITY
            };
        }

        const fallback = entry.filePath.split('/').filter(Boolean);
        const folder = fallback.length > 1 ? fallback[0] : 'book';
        const numeric = this.getCorpusCcOrderNumber(folder, 'outline');
        const fallbackLabel = numeric !== null ? `B${numeric}` : 'B0';
        return {
            bookId: folder || entry.filePath,
            bookLabel: fallbackLabel,
            order: numeric !== null ? numeric : Number.POSITIVE_INFINITY
        };
    }

    private buildSagaSceneGroups(
        sceneEntries: CorpusCcEntry[],
        sceneMode: InquiryMaterialMode
    ): CorpusCcGroup[] {
        if (!sceneEntries.length) {
            return [{
                key: 'scene',
                className: 'scene',
                items: [],
                count: 0,
                mode: sceneMode
            }];
        }

        const groups = new Map<string, { items: CorpusCcEntry[]; label: string; order: number }>();
        sceneEntries.forEach(entry => {
            const meta = this.getSceneBookMetaFromEntry(entry);
            const bucket = groups.get(meta.bookId);
            if (bucket) {
                bucket.items.push(entry);
                return;
            }
            groups.set(meta.bookId, { items: [entry], label: meta.bookLabel, order: meta.order });
        });

        const orderedGroups = Array.from(groups.entries())
            .map(([bookId, value]) => ({
                key: this.getSceneBookGroupKey(bookId),
                className: 'scene' as const,
                items: value.items,
                count: value.items.length,
                mode: this.getSceneBookDisplayMode(value.items),
                headerLabel: value.label,
                headerTooltipLabel: `${value.label} Scenes`,
                order: value.order
            }))
            .sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.headerLabel!.localeCompare(b.headerLabel!, undefined, { numeric: true, sensitivity: 'base' });
            });

        return orderedGroups.map(({ order: _order, ...group }) => group);
    }

    private getCorpusCcClassGroups(entriesByClass: Map<string, CorpusCcEntry[]>): CorpusCcGroup[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const configs = (sources.classes || [])
            .filter(config => classScope.allowAll || classScope.allowed.has(config.className));
        const groups: CorpusCcGroup[] = [];
        const ensureGroup = (className: string, mode: InquiryMaterialMode) => {
            const items = entriesByClass.get(className) ?? [];
            groups.push({ key: className, className, items, count: items.length, mode });
        };

        configs.forEach(config => {
            if (!config) return;
            const normalizedName = config.className;
            if (normalizedName === 'scene' && this.state.scope === 'saga') {
                const sceneMode = this.getCorpusGroupEffectiveMode('scene', configMap);
                const sceneItems = entriesByClass.get('scene') ?? [];
                groups.push(...this.buildSagaSceneGroups(sceneItems, sceneMode));
                return;
            }
            if (normalizedName === 'outline') {
                const outlineMode = this.getCorpusGroupEffectiveMode('outline', configMap);
                ensureGroup('outline', outlineMode);
                if (this.state.scope === 'saga') {
                    const sagaMode = this.getCorpusGroupEffectiveMode('outline-saga', configMap);
                    const sagaItems = entriesByClass.get('outline-saga') ?? [];
                    groups.push({
                        key: 'outline-saga',
                        className: 'outline-saga',
                        items: sagaItems,
                        count: sagaItems.length,
                        mode: sagaMode,
                        headerLabel: `${SIGMA_CHAR}`,
                        headerTooltipLabel: 'Saga Outline'
                    });
                }
                return;
            }

            const normalizedMode = this.getCorpusGroupEffectiveMode(normalizedName, configMap);
            ensureGroup(normalizedName, normalizedMode);
        });

        entriesByClass.forEach((items, className) => {
            if (groups.some(group => group.key === className || group.className === className)) return;
            const override = this.corpusService.getClassOverride(className);
            const mode = override ?? items[0]?.mode ?? 'none';
            groups.push({
                key: className,
                className,
                items,
                count: items.length,
                mode: this.normalizeContributionMode(mode, this.getCorpusGroupBaseClass(className))
            });
        });

        const order = ['scene', 'outline', 'outline-saga', 'character', 'place', 'power'];
        groups.sort((a, b) => {
            const aIndex = order.indexOf(a.className);
            const bIndex = order.indexOf(b.className);
            if (aIndex !== -1 || bIndex !== -1) {
                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
            }
            return a.className.localeCompare(b.className);
        });

        return groups;
    }

    private resolveCorpusBookForPath(path: string): { id: string; label: string } | undefined {
        const books = this.corpus?.books ?? [];
        const match = books.find(book => path === book.rootPath || path.startsWith(`${book.rootPath}/`));
        if (match) {
            return {
                id: match.id,
                label: match.displayLabel
            };
        }

        const segments = path.split('/').filter(Boolean);
        const bookSegmentIndex = segments.findIndex(segment => /^book\s+\d+/i.test(segment));
        if (bookSegmentIndex >= 0) {
            const segment = segments[bookSegmentIndex];
            const numberMatch = segment.match(/^book\s+(\d+)/i);
            const number = numberMatch ? Number.parseInt(numberMatch[1], 10) : Number.NaN;
            return {
                id: segments.slice(0, bookSegmentIndex + 1).join('/'),
                label: Number.isFinite(number) ? `B${number}` : 'B0'
            };
        }

        const fallbackRoot = segments[0] || path;
        const numeric = this.getCorpusCcOrderNumber(fallbackRoot, 'outline');
        return {
            id: fallbackRoot,
            label: numeric !== null ? `B${numeric}` : 'B0'
        };
    }

    private getCorpusCcEntries(): CorpusCcEntry[] {
        const manifest = this.buildCorpusEntryList(this.state.activeQuestionId ?? 'cc-preview', {
            questionZone: this.state.activeZone ?? undefined,
            includeInactive: true,
            applyOverrides: true
        });
        const scope = this.state.scope;
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const sceneEntries = manifest.entries.filter(entry => entry.class === 'scene');
        const outlineEntries = manifest.entries.filter(entry => entry.class === 'outline');
        const referenceEntries = manifest.entries.filter(entry => entry.class !== 'scene' && entry.class !== 'outline');

        const scopedSceneEntries = scope === 'book' && focusBookId
            ? sceneEntries.filter(entry => entry.path === focusBookId || entry.path.startsWith(`${focusBookId}/`))
            : sceneEntries;
        const bookOutlineEntries = outlineEntries
            .filter(entry => entry.scope !== 'saga')
            .filter(entry => scope === 'saga' || !focusBookId || entry.path === focusBookId || entry.path.startsWith(`${focusBookId}/`));
        const sagaOutlineEntries = scope === 'saga'
            ? outlineEntries.filter(entry => entry.scope === 'saga')
            : [];

        const scopedEntries = [
            ...scopedSceneEntries,
            ...bookOutlineEntries,
            ...sagaOutlineEntries,
            ...referenceEntries
        ];

        return scopedEntries.map(entry => {
            const fallbackLabel = entry.path.split('/').pop() || entry.path;
            const file = this.app.vault.getAbstractFileByPath(entry.path);
            const label = file && this.isTFile(file) ? this.getDocumentTitle(file) : fallbackLabel;
            const className = entry.class === 'outline' && entry.scope === 'saga'
                ? 'outline-saga'
                : entry.class;
            const entryKey = this.getCorpusItemKey(entry.class, entry.path, entry.scope, entry.sceneId);
            const resolvedSceneBook = entry.class === 'scene' ? this.resolveCorpusBookForPath(entry.path) : undefined;
            const sceneBook = entry.class === 'scene'
                ? {
                    id: entry.bookId || resolvedSceneBook?.id || '',
                    label: resolvedSceneBook?.label || 'B0'
                }
                : undefined;
            return {
                id: `${entry.class}:${entry.path}`,
                entryKey,
                label,
                filePath: entry.path,
                sceneId: entry.sceneId,
                bookId: sceneBook?.id || undefined,
                bookLabel: sceneBook?.label,
                className,
                classKey: entry.class,
                scope: entry.scope,
                mode: this.normalizeContributionMode(entry.mode ?? 'none', entry.class),
                sortLabel: label
            };
        });
    }

    private compareCorpusCcEntries(a: CorpusCcEntry, b: CorpusCcEntry): number {
        const aLabel = (a.sortLabel ?? a.label).trim();
        const bLabel = (b.sortLabel ?? b.label).trim();
        const aNumber = this.getCorpusCcOrderNumber(aLabel, a.className);
        const bNumber = this.getCorpusCcOrderNumber(bLabel, b.className);
        const aHasNumber = aNumber !== null;
        const bHasNumber = bNumber !== null;

        if (aHasNumber && bHasNumber && aNumber !== bNumber) {
            return aNumber - bNumber;
        }
        if (aHasNumber !== bHasNumber) {
            return aHasNumber ? -1 : 1;
        }

        const labelCompare = aLabel.localeCompare(bLabel, undefined, { numeric: false, sensitivity: 'base' });
        if (labelCompare !== 0) return labelCompare;
        return a.filePath.localeCompare(b.filePath);
    }

    private getCorpusCcOrderNumber(label: string, className: string): number | null {
        const normalized = label.toLowerCase();
        const patterns: RegExp[] = [];
        const isOutline = className === 'outline' || className === 'outline-saga';

        if (className === 'scene') {
            patterns.push(/^\s*(?:scene|sc)\s*#?\s*(\d+)/);
            patterns.push(/^\s*s(\d+)\b/);
            patterns.push(/^\s*(\d+)\b/);
            patterns.push(/\bscene\s*#?\s*(\d+)/);
        } else if (isOutline) {
            patterns.push(/^\s*(?:book|bk)\s*#?\s*(\d+)/);
            patterns.push(/\bbook\s*#?\s*(\d+)/);
            patterns.push(/^\s*(\d+)\b/);
        } else {
            patterns.push(/^\s*(\d+)\b/);
        }

        for (const pattern of patterns) {
            const match = normalized.match(pattern);
            if (!match) continue;
            const num = Number.parseInt(match[1], 10);
            if (Number.isFinite(num)) return num;
        }

        return null;
    }

    private buildSagaCcEntries(corpus: InquiryCorpusSnapshot): CorpusCcEntry[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const outlineConfig = (sources.classes || []).find(cfg => cfg.className === 'outline');
        if (!outlineConfig?.enabled) {
            return [];
        }
        const includeBookOutlines = this.isModeActive(outlineConfig.bookScope);
        const includeSagaOutlines = this.isModeActive(outlineConfig.sagaScope);
        const outlineAllowed = includeBookOutlines || includeSagaOutlines;
        if (!outlineAllowed || (!classScope.allowAll && !classScope.allowed.has('outline'))) {
            return [];
        }

        const outlineFiles = this.getOutlineFiles();
        const bookOutlines = outlineFiles.filter(file => (this.getOutlineScope(file) ?? 'book') === 'book');
        const sagaOutlines = outlineFiles.filter(file => this.getOutlineScope(file) === 'saga');

        const entries: CorpusCcEntry[] = [];
        if (includeBookOutlines) {
            entries.push(...corpus.books.map(book => {
                const outline = bookOutlines.find(file => file.path === book.rootPath || file.path.startsWith(`${book.rootPath}/`));
                const filePath = outline?.path || '';
                return {
                    id: outline?.path || book.id,
                    entryKey: this.getCorpusItemKey('outline', filePath || book.id, 'book'),
                    label: book.displayLabel,
                    filePath,
                    className: 'outline',
                    classKey: 'outline',
                    mode: this.normalizeContributionMode(outlineConfig.bookScope, 'outline')
                };
            }));
        }

        if (includeSagaOutlines) {
            const sagaOutline = sagaOutlines[0];
            const filePath = sagaOutline?.path || '';
            entries.push({
                id: sagaOutline?.path || 'saga-outline',
                entryKey: this.getCorpusItemKey('outline', filePath || 'saga-outline', 'saga'),
                label: 'Saga',
                filePath,
                className: 'outline',
                classKey: 'outline',
                mode: this.normalizeContributionMode(outlineConfig.sagaScope, 'outline')
            });
        }

        return entries;
    }

    private getOutlineFiles(): TFile[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const outlineConfig = (sources.classes || []).find(cfg => cfg.className === 'outline');
        if (!outlineConfig?.enabled) return [];
        if (!this.isModeActive(outlineConfig.bookScope) && !this.isModeActive(outlineConfig.sagaScope)) return [];
        if (!classScope.allowAll && !classScope.allowed.has('outline')) return [];

        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? (sources.resolvedScanRoots && sources.resolvedScanRoots.length
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);
        const bookResolution = resolveInquiryBookResolution({
            vault: this.app.vault,
            metadataCache: this.app.metadataCache,
            resolvedVaultRoots,
            frontmatterMappings: this.plugin.settings.frontmatterMappings,
            bookInclusion: sources.bookInclusion
        });

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            if (!inRoots(file.path)) return false;
            if (!isPathIncludedByInquiryBooks(file.path, bookResolution.candidates)) return false;
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return false;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            return classValues.includes('outline');
        });
    }

    private getOutlineScope(file: TFile): InquiryScope | undefined {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return undefined;
        return this.getFrontmatterScope(frontmatter);
    }

    private async updateCorpusCcData(entries: CorpusCcEntry[]): Promise<void> {
        const updateId = ++this.ccUpdateId;
        const stats = await Promise.all(entries.map(entry => this.loadCorpusCcStats(entry)));
        if (updateId !== this.ccUpdateId) return;
        stats.forEach((entryStats, idx) => {
            this.applyCorpusCcSlot(idx, entries[idx], entryStats);
        });
    }

    private applyCorpusCcSlot(
        index: number,
        entry: CorpusCcEntry,
        stats: CorpusCcStats
    ): void {
        const slot = this.ccSlots[index];
        if (!slot) return;
        const thresholds = this.getCorpusThresholds();
        const mode = entry.mode ?? 'none';
        const isSynopsis = mode === 'summary';
        const wordCount = isSynopsis ? stats.synopsisWords : stats.bodyWords;
        const tier = isSynopsis
            ? this.getCorpusSynopsisTier(stats.synopsisQuality, wordCount, thresholds)
            : this.getCorpusTier(wordCount, thresholds);
        const ratioBase = thresholds.substantiveMin > 0 ? (wordCount / thresholds.substantiveMin) : 0;
        const ratio = Math.min(Math.max(ratioBase, 0), 1);
        const pageHeight = this.ccLayout?.pageHeight ?? Math.round(CC_PAGE_BASE_SIZE * 1.45);
        const fillHeight = Math.round(pageHeight * ratio);
        slot.fill.setAttribute('height', String(fillHeight));
        slot.fill.setAttribute('y', String(pageHeight - fillHeight));

        const sceneStatus = entry.className === 'scene'
            ? resolveCorpusSceneStatus({ status: stats.statusRaw, due: stats.due })
            : undefined;
        const lowSubstance = entry.className === 'scene' && isLowSubstanceTier(tier);

        slot.group.classList.remove(
            'is-tier-empty',
            'is-tier-bare',
            'is-tier-sketchy',
            'is-tier-medium',
            'is-tier-substantive',
            'is-mode-none',
            'is-mode-summary',
            'is-mode-full',
            'is-status-todo',
            'is-status-working',
            'is-status-complete',
            'is-status-overdue',
            'is-low-substance'
        );
        slot.group.classList.add(`is-tier-${tier}`);
        if (mode === 'summary') {
            slot.group.classList.add('is-mode-summary');
        } else if (mode === 'full') {
            slot.group.classList.add('is-mode-full');
        } else {
            slot.group.classList.add('is-mode-none');
        }

        if (sceneStatus) {
            slot.group.classList.add(`is-status-${sceneStatus}`);
        }
        if (lowSubstance) {
            slot.group.classList.add('is-low-substance');
        }

        const tooltip = this.buildCorpusCcTooltip(entry, stats, thresholds, tier, sceneStatus, lowSubstance, wordCount);
        addTooltipData(slot.group, tooltip, 'left');
        slot.group.setAttribute('data-rt-tip-offset-x', '10');
        if (entry.filePath) {
            slot.group.classList.add('is-openable');
            slot.group.setAttribute('data-file-path', entry.filePath);
        } else {
            slot.group.classList.remove('is-openable');
            slot.group.removeAttribute('data-file-path');
        }
    }

    private getCorpusThresholds(): { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number } {
        const defaults = DEFAULT_SETTINGS.inquiryCorpusThresholds || {
            emptyMax: 10,
            sketchyMin: 100,
            mediumMin: 300,
            substantiveMin: 1000
        };
        const raw = this.plugin.settings.inquiryCorpusThresholds || defaults;
        return {
            emptyMax: Number.isFinite(raw.emptyMax) ? raw.emptyMax : defaults.emptyMax,
            sketchyMin: Number.isFinite(raw.sketchyMin) ? raw.sketchyMin : defaults.sketchyMin,
            mediumMin: Number.isFinite(raw.mediumMin) ? raw.mediumMin : defaults.mediumMin,
            substantiveMin: Number.isFinite(raw.substantiveMin) ? raw.substantiveMin : defaults.substantiveMin
        };
    }

    private getCorpusTier(
        wordCount: number,
        thresholds: { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number }
    ): CorpusSubstanceTier {
        if (wordCount < thresholds.emptyMax) return 'empty';
        if (wordCount < thresholds.sketchyMin) return 'bare';
        if (wordCount < thresholds.mediumMin) return 'sketchy';
        if (wordCount < thresholds.substantiveMin) return 'medium';
        return 'substantive';
    }

    private getCorpusSynopsisTier(
        quality: SynopsisQuality,
        wordCount: number,
        thresholds: { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number }
    ): CorpusSubstanceTier {
        if (quality === 'missing') return 'empty';
        if (quality === 'weak') return 'sketchy';
        return this.getCorpusTier(wordCount, thresholds);
    }

    private getCorpusTierLabel(tier: CorpusSubstanceTier): string {
        if (tier === 'empty') return 'Empty';
        if (tier === 'bare' || tier === 'sketchy') return 'Sketchy';
        if (tier === 'medium') return 'Medium';
        return 'Substantive';
    }

    private async loadCorpusCcStats(entry: CorpusCcEntry): Promise<CorpusCcStats> {
        const filePath = entry.filePath;
        if (!filePath) {
            return { bodyWords: 0, synopsisWords: 0, synopsisQuality: 'missing' };
        }
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !this.isTFile(file)) {
            return { bodyWords: 0, synopsisWords: 0, synopsisQuality: 'missing' };
        }
        const mtime = file.stat.mtime ?? 0;
        const title = this.getDocumentTitle(file);
        const frontmatter = this.getNormalizedFrontmatter(file) ?? {};
        const { statusRaw, due } = this.getDocumentStatusFields(frontmatter);
        const cached = this.ccWordCache.get(filePath);
        if (cached && cached.mtime === mtime && cached.statusRaw === statusRaw && cached.due === due && cached.title === title) {
            return {
                bodyWords: cached.bodyWords,
                synopsisWords: cached.synopsisWords,
                synopsisQuality: cached.synopsisQuality,
                statusRaw: cached.statusRaw,
                due: cached.due,
                title: cached.title
            };
        }
        const content = await this.app.vault.cachedRead(file);
        const body = this.stripFrontmatter(content);
        const bodyWords = this.countWords(body);
        const summary = this.extractSummary(frontmatter);
        const synopsisWords = this.countWords(summary);
        const synopsisQuality = classifySynopsis(summary);
        this.ccWordCache.set(filePath, {
            mtime,
            bodyWords,
            synopsisWords,
            synopsisQuality,
            statusRaw,
            due,
            title
        });
        return {
            bodyWords,
            synopsisWords,
            synopsisQuality,
            statusRaw,
            due,
            title
        };
    }

    private async loadCorpusCcStatsByPath(filePath: string): Promise<CorpusCcStats> {
        return this.loadCorpusCcStats({
            id: filePath,
            entryKey: this.getCorpusItemKey('', filePath),
            label: filePath,
            filePath,
            className: '',
            classKey: '',
            mode: 'full'
        });
    }

    private getDocumentStatusFields(frontmatter: Record<string, unknown>): { statusRaw?: string; due?: string } {
        const rawStatus = frontmatter['Status'];
        const statusCandidate = Array.isArray(rawStatus)
            ? String(rawStatus[0] ?? '').trim()
            : (typeof rawStatus === 'string' ? rawStatus.trim() : '');

        const rawDue = frontmatter['Due'];
        const due = typeof rawDue === 'string' ? rawDue.trim() : '';

        return {
            statusRaw: statusCandidate || undefined,
            due: due || undefined
        };
    }

    private getCorpusCcStatusIcon(status?: CorpusSceneStatus): string {
        if (status === 'todo') return '☐';
        if (status === 'working') return '□';
        if (status === 'complete') return '✓';
        if (status === 'overdue') return '⚠';
        return '';
    }

    private buildCorpusCcTooltip(
        entry: CorpusCcEntry,
        stats: CorpusCcStats,
        thresholds: { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number },
        tier: CorpusSubstanceTier,
        sceneStatus: CorpusSceneStatus | undefined,
        isLowSubstance: boolean,
        wordCount: number
    ): string {
        const tooltipTitle = stats.title || entry.label;
        const classInitial = entry.className?.trim().charAt(0).toLowerCase() || '?';
        const conditions: string[] = [];

        if (sceneStatus) {
            const statusLabel = sceneStatus === 'overdue'
                ? 'Overdue'
                : `${sceneStatus.charAt(0).toUpperCase()}${sceneStatus.slice(1)}`;
            const statusIcon = this.getCorpusCcStatusIcon(sceneStatus);
            const statusBorderNote = sceneStatus === 'todo'
                ? ' (dashed border)'
                : sceneStatus === 'working'
                    ? ''
                    : sceneStatus === 'overdue'
                        ? ' (solid red border)'
                        : ' (solid border)';
            const statusIconText = statusIcon ? ` ${statusIcon}` : '';
            conditions.push(`Status: ${statusLabel}${statusIconText}${statusBorderNote}`);
        }

        const tierLabel = this.getCorpusTierLabel(tier);
        const wordLabel = wordCount.toLocaleString();
        const isSynopsisCapable = entry.className === 'scene' || entry.className.startsWith('outline');
        if (entry.mode === 'none') {
            conditions.push('Mode: Off');
        }
        if (isSynopsisCapable) {
            if (entry.mode === 'summary') {
                conditions.push(`Tier: Summary ${tierLabel.toLowerCase()} (${wordLabel} words)`);
            } else if (entry.mode === 'full') {
                conditions.push(`Tier: Body ${tierLabel.toLowerCase()} (${wordLabel} words)`);
            } else {
                conditions.push(`Tier: ${tierLabel} (${wordLabel} words)`);
            }
        } else {
            conditions.push(`Tier: ${tierLabel} (${wordLabel} words)`);
        }

        if (isLowSubstance) {
            conditions.push(`Low substance: marked with X (${thresholds.sketchyMin} words target)`);
        }

        return `${tooltipTitle} [${classInitial}]\n${conditions.map(item => `• ${item}`).join('\n')}`;
    }

    private getDocumentTitle(file: TFile): string {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (frontmatter) {
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const rawTitle = normalized['Title'] ?? normalized['title'];
            if (typeof rawTitle === 'string' && rawTitle.trim()) {
                return rawTitle.trim();
            }
        }
        return file.basename;
    }

    private stripFrontmatter(content: string): string {
        if (!content.startsWith('---')) return content;
        const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
        if (!match) return content;
        return content.slice(match[0].length);
    }

    private countWords(content: string): number {
        const trimmed = content.trim();
        if (!trimmed) return 0;
        const matches = trimmed.match(/[A-Za-z0-9]+(?:['\u2019'-][A-Za-z0-9]+)*/g);
        return matches ? matches.length : 0;
    }

    private getStyleSource(): Element {
        return this.contentEl ?? this.rootSvg ?? document.documentElement;
    }

    private isTFile(file: TAbstractFile | null): file is TFile {
        return !!file && file instanceof TFile;
    }

    private updateMinimapFocus(): void {
        this.minimap.updateFocus();
    }

    private updateFocusGlyph(): void {
        this.glyph?.update({ focusLabel: this.getFocusLabel() });
    }

    private updateRings(): void {
        const result = this.state.activeResult;
        const flowValue = result ? this.normalizeMetricValue(result.verdict.flow) : GLYPH_PLACEHOLDER_FLOW;
        const depthValue = result ? this.normalizeMetricValue(result.verdict.depth) : GLYPH_PLACEHOLDER_DEPTH;
        const impact = result ? result.verdict.impact : 'low';
        const assessmentConfidence = result ? result.verdict.assessmentConfidence : 'low';
        const hasError = this.isErrorResult(result);
        const errorRing = hasError ? this.state.mode : null;
        const ringOverrideColor = this.isInquiryRunDisabled() ? this.getInquiryAlertColor() : undefined;

        this.glyph?.update({
            focusLabel: this.getFocusLabel(),
            flowValue,
            depthValue,
            impact,
            assessmentConfidence,
            errorRing,
            ringOverrideColor
        });
    }

    private updateFindingsIndicators(): void {
        const result = this.state.activeResult;
        if (this.rootSvg) {
            if (this.state.isRunning) {
                this.rootSvg.classList.remove('is-error');
            } else {
                this.rootSvg.classList.toggle('is-error', this.isErrorResult(result));
            }
        }
        this.updateMinimapHitStates(result);
    }

    private isErrorResult(result: InquiryResult | null | undefined): boolean {
        if (!result) return false;
        if (result.aiStatus && result.aiStatus !== 'success' && result.aiStatus !== 'degraded') return true;
        return result.findings.some(finding => finding.kind === 'error');
    }

    private isDegradedResult(result: InquiryResult | null | undefined): boolean {
        return !!result && (result.aiStatus === 'degraded' || result.aiReason === 'recovered_invalid_response');
    }

    private hasBindableInquiryHits(result: InquiryResult): boolean {
        return this.buildHitFindingMap(result, this.getResultItems(result)).size > 0;
    }

    private shouldRejectUnboundHitResult(result: InquiryResult): boolean {
        if (this.isErrorResult(result)) return false;
        if (result.scope !== 'book') return false;
        if (!result.findings.some(finding => this.isFindingHit(finding))) return false;
        return !this.hasBindableInquiryHits(result);
    }

    private withCitationBindingFailure(result: InquiryResult): InquiryResult {
        const message = 'Inquiry completed its passes, but no finding could be matched to this corpus. No minimap hits were available.';
        return {
            ...result,
            aiStatus: 'rejected',
            aiReason: 'citation_binding_failed',
            summary: message,
            summaryFlow: message,
            summaryDepth: message,
            findings: [{
                refId: '',
                kind: 'error',
                status: 'unclear',
                impact: 'medium',
                assessmentConfidence: 'high',
                headline: 'Inquiry citations could not be matched to this corpus.',
                bullets: [message],
                related: [],
                evidenceType: 'mixed',
                lens: 'both'
            }]
        };
    }

    private isErrorState(): boolean {
        return !this.state.isRunning && this.isErrorResult(this.state.activeResult);
    }

    private isResultsState(): boolean {
        return !this.state.isRunning && !!this.state.activeResult && !this.isErrorResult(this.state.activeResult);
    }

    private clearErrorStateForAction(): void {
        if (!this.isErrorState()) return;
        this.dismissError();
    }

    private notifyInteraction(message: string): void {
        new Notice(message);
    }

    private pulseZonePrompt(zone: InquiryZone, promptId: string): void {
        const elements = this.zonePromptElements.get(zone);
        if (elements) {
            elements.group.classList.add('is-duplicate-pulse');
        }
        if (this.glyph) {
            this.glyph.setPromptPulse(promptId, true);
        }
        if (this.duplicatePulseTimer) {
            window.clearTimeout(this.duplicatePulseTimer);
        }
        this.duplicatePulseTimer = window.setTimeout(() => {
            elements?.group.classList.remove('is-duplicate-pulse');
            this.glyph?.setPromptPulse(promptId, false);
            this.duplicatePulseTimer = undefined;
        }, DUPLICATE_PULSE_MS);
    }

    private pulseRehydrateButton(zone: InquiryZone): void {
        if (!this.artifactButton) return;
        this.state.activeZone = zone;
        this.updateActiveZoneStyling();
        this.artifactButton.classList.add('is-rehydrate-pulse');
        if (this.rehydratePulseTimer) {
            window.clearTimeout(this.rehydratePulseTimer);
        }
        this.rehydratePulseTimer = window.setTimeout(() => {
            this.artifactButton?.classList.remove('is-rehydrate-pulse');
            this.rehydratePulseTimer = undefined;
        }, REHYDRATE_PULSE_MS);
    }

    private highlightRehydrateSession(sessionKey?: string): void {
        if (!sessionKey) return;
        this.rehydrateTargetKey = sessionKey;
        this.refreshBriefingPanel();
        if (this.rehydrateHighlightTimer) {
            window.clearTimeout(this.rehydrateHighlightTimer);
        }
        this.rehydrateHighlightTimer = window.setTimeout(() => {
            this.rehydrateTargetKey = undefined;
            this.refreshBriefingPanel();
            this.rehydrateHighlightTimer = undefined;
        }, REHYDRATE_HIGHLIGHT_MS);
    }

    private handleDuplicateRunFeedback(question: InquiryQuestion, sessionKey?: string): void {
        this.state.activeZone = question.zone;
        this.updateActiveZoneStyling();
        this.pulseZonePrompt(question.zone, question.id);
        this.pulseRehydrateButton(question.zone);
        this.highlightRehydrateSession(sessionKey);
        this.notifyInteraction('Inquiry already run. Open Recent Inquiry Sessions to reopen.');
    }

    private showErrorPreview(result: InquiryResult): void {
        if (!this.previewGroup || !this.previewHero) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const zone = result.questionZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        const reason = this.formatApiErrorReason(result);
        const meta = reason ? `Error: ${reason}` : 'Error';
        const emptyRows = Array(this.previewRows.length || 6).fill('');
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-error');
        this.previewGroup.classList.remove('is-locked', 'is-results');
        this.setPreviewRunningNoteText('');
        this.resetPreviewRowLabels();
        this.setPreviewFooterText('Click panel to open the Inquiry Log.');
        this.updatePromptPreview(zone, this.state.mode, 'Inquiry paused.', emptyRows, meta, { hideEmpty: true });
    }

    private updateMinimapHitStates(result: InquiryResult | null | undefined): void {
        const resultItems = result ? this.getResultItems(result) : [];
        const hitMap = this.buildHitFindingMap(result, resultItems);
        this.minimap.updateHitStates(
            this.state.isRunning,
            this.isErrorResult(result),
            hitMap,
            (text) => this.balanceTooltipText(text)
        );
    }

    private updateArtifactPreview(): void {
        // No-op while findings panel is removed.
    }

    private updateFooterStatus(): void {
        // Legacy diagnostics removed from footer by design.
    }

    private setApiStatus(_state: 'idle' | 'running' | 'success' | 'error', _reason?: string): void {
        this.updateFooterStatus();
    }

    private updateNavigationIcons(): void {
        if (!this.navPrevButton || !this.navNextButton || !this.navPrevIcon || !this.navNextIcon) return;
        this.setIconUse(this.navPrevIcon, 'chevron-left');
        this.setIconUse(this.navNextIcon, 'chevron-right');

        const books = this.getNavigationBooks();
        const current = this.getNavigationBookIndex(books);
        const hasPrev = books.length > 1 && current > 0;
        const hasNext = books.length > 1 && current >= 0 && current < books.length - 1;
        const lockout = this.isInquiryGuidanceLockout();
        const running = this.state.isRunning;

        this.setIconButtonDisabled(this.navPrevButton, running || lockout || !hasPrev);
        this.setIconButtonDisabled(this.navNextButton, running || lockout || !hasNext);

        const prevBook = hasPrev ? books[current - 1] : undefined;
        const nextBook = hasNext ? books[current + 1] : undefined;
        const prevTooltip = prevBook
            ? `Previous book: ${this.getBookTitleForId(prevBook.id) || prevBook.displayLabel || 'Book'}`
            : 'No previous book.';
        const nextTooltip = nextBook
            ? `Next book: ${this.getBookTitleForId(nextBook.id) || nextBook.displayLabel || 'Book'}`
            : 'No next book.';

        addTooltipData(this.navPrevButton, this.balanceTooltipText(prevTooltip), 'top');
        addTooltipData(this.navNextButton, this.balanceTooltipText(nextTooltip), 'top');
    }

    private updateNavSessionLabel(): void {
        if (!this.navSessionLabel) return;
        if (this.state.isRunning) {
            this.navSessionLabel.textContent = this.buildRunningStageLabel(this.currentRunProgress) || 'Waiting for the provider response.';
            return;
        }
        const sessionId = this.state.activeSessionId;
        if (!sessionId) {
            this.navSessionLabel.textContent = 'ID: PENDING';
            return;
        }
        const session = this.sessionStore.peekSession(sessionId);
        if (!session) {
            this.navSessionLabel.textContent = 'ID: PENDING';
            return;
        }
        const timestamp = session.createdAt || session.lastAccessed;
        const date = new Date(timestamp);
        const formatted = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        // Compact: "ID: Mar 5, 3:45pm"
        this.navSessionLabel.textContent = `ID: ${formatted.replace(/\s+(AM|PM)/i, (_, m) => m.toLowerCase())}`;
    }

    private updateRunningState(): void {
        if (!this.rootSvg) return;
        const isRunning = this.state.isRunning;
        const wasRunning = this.wasRunning;
        const runDisabled = this.isInquiryRunDisabled();
        this.wasRunning = isRunning;
        this.rootSvg.classList.toggle('is-running', isRunning);
        this.previewGroup?.classList.toggle('is-running', isRunning);
        this.glyph?.setZoneInteractionsEnabled(!isRunning && !runDisabled);
        const isError = this.rootSvg.classList.contains('is-error');
        const hasResult = !!this.state.activeResult && !isError;
        this.rootSvg.classList.toggle('is-results', !isRunning && hasResult);
        if (wasRunning && !isRunning) {
            (['setup', 'pressure', 'payoff'] as InquiryZone[]).forEach(zone => {
                this.glyph?.setZoneScaleLocked(zone, false);
            });
        }
        if (isRunning) {
            this.startRunningAnimations();
            this.updateMinimapPressureGauge();
        } else {
            this.stopRunningAnimations();
            if (wasRunning) {
                this.startBackboneFadeOut();
            }
            this.updateMinimapPressureGauge();
        }
        this.updateRunningHud();
        this.updateNavSessionLabel();
    }

    private resolveGuidanceState(): InquiryGuidanceState {
        if (this.state.isRunning) return 'running';
        if (!this.isInquiryConfigured()) return 'not-configured';
        if (this.getInquirySceneCount() === 0) return 'no-scenes';
        if (this.isResultsState()) return 'results';
        return 'ready';
    }

    private isInquiryConfigured(): boolean {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        return (sources.scanRoots?.length ?? 0) > 0 && (sources.classScope?.length ?? 0) > 0;
    }

    private getInquirySceneCount(): number {
        if (!this.isInquiryConfigured()) return 0;
        const entryList = this.buildCorpusEntryList('scene-count', {
            includeInactive: true,
            applyOverrides: false
        });
        return entryList.entries.filter(entry => entry.class === 'scene').length;
    }

    private hasInquirySessions(): boolean {
        return this.sessionStore.getSessionCount() > 0;
    }

    private isInquiryRunDisabled(): boolean {
        return this.guidanceState === 'not-configured' || this.guidanceState === 'no-scenes';
    }

    private isInquiryGuidanceLockout(): boolean {
        return this.guidanceState === 'no-scenes';
    }

    private isInquiryBlocked(): boolean {
        return this.guidanceState === 'not-configured';
    }

    private getInquiryAlertColor(): string {
        const styleSource = this.getStyleSource();
        if (!this.rootSvg) return getExecutionColorValue(styleSource, '--rt-ai-error', '#ff4d4d');
        const color = getComputedStyle(this.rootSvg).getPropertyValue('--ert-inquiry-alert').trim();
        return color || getExecutionColorValue(styleSource, '--rt-ai-error', '#ff4d4d');
    }

    private updateGuidance(): void {
        const state = this.guidanceState;
        const runDisabled = this.isInquiryRunDisabled();
        const blocked = this.isInquiryBlocked();
        const lockout = this.isInquiryGuidanceLockout();
        const running = this.state.isRunning;

        if (this.rootSvg) {
            this.rootSvg.classList.toggle('is-inquiry-blocked', runDisabled);
            this.rootSvg.classList.toggle('is-run-locked', runDisabled || running);
            this.rootSvg.classList.toggle('is-no-scenes', state === 'no-scenes');
            this.rootSvg.classList.toggle('is-guidance-lockout', lockout);
        }
        this.contentEl.classList.toggle('is-inquiry-blocked', blocked);
        this.contentEl.classList.toggle('is-guidance-lockout', lockout);

        this.zonePromptElements.forEach(({ group }) => {
            const disabled = runDisabled || running;
            group.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            group.setAttribute('tabindex', disabled ? '-1' : '0');
        });

        this.setIconButtonDisabled(this.apiSimulationButton, runDisabled || running);
        this.setIconButtonDisabled(this.scopeToggleButton, lockout || running);
        this.setIconButtonDisabled(this.engineBadgeGroup, lockout || running);
        this.setIconButtonDisabled(this.artifactButton, lockout || running);
        this.setIconButtonDisabled(this.detailsToggle, lockout || running);

        if (this.briefingSaveButton) {
            this.briefingSaveButton.disabled = blocked || lockout || running;
        }
        if (this.briefingClearButton) {
            this.briefingClearButton.disabled = lockout || running;
        }
        if (this.briefingResetButton) {
            this.briefingResetButton.disabled = lockout || running || !this.hasCorpusOverrides();
        }
        if (this.briefingPurgeButton) {
            this.briefingPurgeButton.disabled = lockout || running;
        }
        if (lockout || running) {
            this.hideBriefingPanel(true);
            this.hideEnginePanel();
        }

        this.updateGuidanceText(state);
        this.updateGuidanceHelpTooltip(state);
        this.updateNavigationIcons();
    }

    private updateGuidanceText(state: InquiryGuidanceState): void {
        if (!this.hoverTextEl) return;
        if (state === 'running') {
            this.hoverTextEl.classList.add('ert-hidden');
            this.hoverTextEl.classList.remove('is-guidance', 'is-guidance-alert', 'is-guidance-results');
            clearSvgChildren(this.hoverTextEl);
            return;
        }

        const isNoScenes = state === 'no-scenes';
        const isAlert = state === 'not-configured' || isNoScenes;
        if (!isAlert) {
            this.hoverTextEl.classList.add('ert-hidden');
            this.hoverTextEl.classList.remove('is-guidance', 'is-guidance-alert', 'is-guidance-results');
            clearSvgChildren(this.hoverTextEl);
            return;
        }

        const guidanceLines = state === 'not-configured'
            ? ['Inquiry is not configured.', 'Set scan roots and class scope in Settings → Radial Timeline → Inquiry.']
            : ['No Scenes Found', 'Check scan roots and class scope in Settings → Radial Timeline → Inquiry.'];
        const lineHeight = isAlert
            ? (isNoScenes ? GUIDANCE_ALERT_LINE_HEIGHT + 14 : GUIDANCE_ALERT_LINE_HEIGHT)
            : GUIDANCE_LINE_HEIGHT;

        this.hoverTextEl.classList.remove('ert-hidden');
        this.hoverTextEl.classList.toggle('is-guidance', true);
        this.hoverTextEl.classList.toggle('is-guidance-alert', isAlert);
        this.hoverTextEl.classList.toggle('is-guidance-results', false);
        this.hoverTextEl.setAttribute('x', '0');
        this.hoverTextEl.setAttribute('y', String(GUIDANCE_TEXT_Y));
        this.hoverTextEl.setAttribute('text-anchor', 'middle');
        this.setGuidanceTextLines(
            guidanceLines,
            lineHeight,
            isNoScenes
                ? { primaryClass: 'ert-inquiry-guidance-primary', primarySize: 40, primaryWeight: 800 }
                : undefined
        );
    }

    private setGuidanceTextLines(
        lines: string[],
        lineHeight: number,
        options?: { primaryClass?: string; primarySize?: number; primaryWeight?: number }
    ): void {
        const hoverTextEl = this.hoverTextEl;
        if (!hoverTextEl) return;
        clearSvgChildren(hoverTextEl);
        const x = hoverTextEl.getAttribute('x') ?? '0';
        const primaryClass = options?.primaryClass;
        const primarySize = options?.primarySize;
        const primaryWeight = options?.primaryWeight;
        lines.forEach((line, index) => {
            const tspan = createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', index === 0 ? '0' : String(lineHeight));
            if (index === 0 && primaryClass) {
                tspan.classList.add(primaryClass);
                if (primarySize) {
                    tspan.setAttribute('font-size', String(primarySize));
                }
                if (primaryWeight) {
                    tspan.setAttribute('font-weight', String(primaryWeight));
                }
            }
            tspan.textContent = line;
            hoverTextEl.appendChild(tspan);
        });
    }

    private updateGuidanceHelpTooltip(state: InquiryGuidanceState): void {
        if (!this.helpToggleButton) return;
        const hasSessions = this.hasInquirySessions();
        const corpusAlert = this.corpusWarningActive && this.isCorpusEmpty();
        const isAlert = state === 'not-configured' || state === 'no-scenes' || corpusAlert;
        const isResults = state === 'results';
        const isRunning = state === 'running';
        const tooltip = isRunning
            ? (this.activeInquiryRunToken
                ? INQUIRY_HELP_RUNNING_SINGLE_TOOLTIP
                : INQUIRY_HELP_RUNNING_TOOLTIP)
            : (corpusAlert
                ? INQUIRY_HELP_CORPUS_TOOLTIP
                : (isAlert
                    ? (state === 'not-configured' ? INQUIRY_HELP_CONFIG_TOOLTIP : INQUIRY_HELP_NO_SCENES_TOOLTIP)
                    : (isResults ? INQUIRY_HELP_RESULTS_TOOLTIP : (hasSessions ? INQUIRY_HELP_TOOLTIP : INQUIRY_HELP_ONBOARDING_TOOLTIP))));
        const balancedTooltip = this.balanceTooltipText(tooltip);

        this.helpToggleButton.removeAttribute('aria-pressed');
        this.helpToggleButton.setAttribute('aria-disabled', isRunning ? 'true' : 'false');
        this.helpToggleButton.classList.toggle('is-help-onboarding', !hasSessions && !isAlert && !isResults);
        this.helpToggleButton.classList.toggle('is-help-results', isResults && !corpusAlert);
        this.helpToggleButton.classList.toggle('is-guidance-alert', isAlert);
        addTooltipData(this.helpToggleButton, balancedTooltip, 'left');
    }

    private handleGuidanceHelpClick(): void {
        const state = this.resolveGuidanceState();
        this.guidanceState = state;
        if (state === 'running') {
            return;
        }
        if (state === 'not-configured') {
            this.openInquirySettings('sources');
            return;
        }
        if (state === 'no-scenes') {
            this.openInquirySettings('sources');
            return;
        }
        window.open(INQUIRY_GUIDANCE_DOC_URL, '_blank');
    }

    private openInquirySettings(
        focus: 'overview' | 'sources' | 'class-scope' | 'scan-roots' | 'class-presets'
    ): void {
        if (this.plugin.settingsTab) {
            this.plugin.settingsTab.setActiveTab('inquiry');
        }
        // SAFE: any type used for accessing Obsidian's internal settings API
        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById('radial-timeline');
        }
        window.setTimeout(() => {
            if (focus === 'overview') {
                return;
            }
            if (focus === 'sources') {
                this.scrollInquirySetting('class-scope');
                window.setTimeout(() => this.scrollInquirySetting('scan-roots'), 80);
                return;
            }
            this.scrollInquirySetting(focus);
        }, 160);
    }

    private scrollInquirySetting(target: 'class-scope' | 'scan-roots' | 'class-presets'): void {
        const el = document.querySelector(`[data-ert-role="inquiry-setting:${target}"]`);
        if (!(el instanceof HTMLElement)) return;
        el.scrollIntoView({ block: 'center' });
    }

    private startRunningAnimations(): void {
        const styleSource: Element = this.contentEl ?? this.rootSvg ?? document.documentElement;
        const isPro = isProfessionalActive(this.plugin);
        this.minimap.startRunningAnimations(
            styleSource,
            isPro,
            () => this.state.isRunning,
            (elapsedMs) => this.updateRunningHudFrame(elapsedMs)
        );
    }

    private stopRunningAnimations(): void {
        this.minimap.stopRunningAnimations();
        this.updateRunningHud();
    }

    private startBackboneFadeOut(): void {
        this.minimap.startFadeOut();
    }

    private cancelBackboneFadeOut(): void {
        this.minimap.cancelFadeOut();
    }

    private handleScopeChange(scope: InquiryScope): void {
        this.clearErrorStateForAction();
        if (!scope || scope === this.state.scope) return;
        this.state.scope = scope;
        if (this.state.activeResult) {
            this.clearActiveResultState();
            this.unlockPromptPreview();
            this.setApiStatus('idle');
        }
        this.refreshUI();
    }

    private setActiveLens(mode: InquiryMode): void {
        if (!mode || mode === this.state.mode) return;
        // Lens is UI emphasis only; inquiry computation must always include flow + depth.
        this.state.mode = mode;
        this.plugin.settings.inquiryLastMode = mode;
        void this.plugin.saveSettings();
        this.updateModeClass();
        this.updateRings();
        if (this.isResultsState() && this.state.activeResult) {
            this.showResultsPreview(this.state.activeResult);
        }
        if (!this.previewLocked && this.previewGroup?.classList.contains('is-visible') && this.previewLast) {
            this.updatePromptPreview(this.previewLast.zone, mode, this.previewLast.question, undefined, undefined, { hideEmpty: true });
        }
    }

    private handleRingClick(mode: InquiryMode): void {
        if (this.isInquiryGuidanceLockout()) return;
        this.clearErrorStateForAction();
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (mode === this.state.mode) {
            if (this.isResultsState() && this.state.activeResult) {
                this.showResultsPreview(this.state.activeResult);
            }
            this.notifyInteraction(`${mode === 'flow' ? 'Flow' : 'Depth'} lens already active.`);
            return;
        }
        this.setActiveLens(mode);
    }

    private handleModeIconToggleClick(): void {
        const nextMode: InquiryMode = this.state.mode === 'flow' ? 'depth' : 'flow';
        this.handleRingClick(nextMode);
    }

    private buildModeToggleHoverText(): string {
        const nextMode = this.state.mode === 'flow' ? 'Depth' : 'Flow';
        return `Switch to ${nextMode} lens.`;
    }

    private handleGlyphClick(): void {
        if (this.isInquiryGuidanceLockout()) return;
        this.clearErrorStateForAction();
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (this.state.scope === 'saga') {
            this.state.scope = 'book';
            this.refreshUI();
            return;
        }
        this.glyph?.root.classList.toggle('is-expanded');
    }

    private beginInquiryRunToken(): number {
        const token = ++this.inquiryRunTokenCounter;
        this.activeInquiryRunToken = token;
        this.cancelledInquiryRunTokens.delete(token);
        return token;
    }

    private finishInquiryRunToken(token: number): void {
        this.cancelledInquiryRunTokens.delete(token);
        if (this.activeInquiryRunToken === token) {
            this.activeInquiryRunToken = 0;
        }
    }

    private shouldDiscardInquiryRunOutcome(token: number): boolean {
        if (!token) return false;
        if (this.cancelledInquiryRunTokens.has(token)) return true;
        return this.activeInquiryRunToken !== token;
    }

    private requestActiveInquiryCancellation(): void {
        if (!this.state.isRunning) return;
        const token = this.activeInquiryRunToken;
        if (!token) {
            this.notifyInteraction('This run cannot be cancelled from the preview panel.');
            return;
        }
        this.cancelledInquiryRunTokens.add(token);
        if (this.activeInquiryRunToken === token) {
            this.activeInquiryRunToken = 0;
        }
        this.state.isRunning = false;
        this.currentRunProgress = null;
        this.pendingGuardQuestion = undefined;
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI();
        this.notifyInteraction('Inquiry cancel requested. Inquiry will stop after the current pass returns. The active provider request may still complete.');
    }

    private async openInquiryErrorLog(): Promise<void> {
        const opened = await this.openLatestInquiryLogForContext();
        if (!opened) {
            new Notice('No Inquiry log found for this run.');
        }
    }

    private async handleQuestionClick(question: InquiryQuestion): Promise<void> {
        if (this.isErrorState() && this.state.activeResult?.questionId === question.id) {
            await this.openInquiryErrorLog();
            return;
        }
        await this.runInquiry(question);
    }

    private async runInquiry(
        question: InquiryQuestion,
        options?: { bypassTokenGuard?: boolean }
    ): Promise<void> {
        if (this.isInquiryRunDisabled()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        this.clearErrorStateForAction();
        this.state.activeZone = question.zone;
        this.updateActiveZoneStyling();

        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const focusSceneId = this.state.scope === 'book' ? this.state.focusSceneId : undefined;
        const focusBookId = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusBookId;

        const engineSelection = this.resolveEngineSelectionForRun();
        const manifest = this.buildCorpusManifest(question.id, {
            modelId: engineSelection.modelId,
            questionZone: question.zone
        });
        if (!manifest.entries.length) {
            this.handleEmptyCorpusRun();
            return;
        }
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: question.id,
            scope: this.state.scope,
            focusId
        });
        const key = this.sessionStore.buildKey(baseKey, manifest.fingerprint);
        if (this.state.activeSessionId === key && this.state.activeResult && !this.isErrorResult(this.state.activeResult)) {
            this.handleDuplicateRunFeedback(question, key);
            this.showResultsPreview(this.state.activeResult);
            return;
        }
        let cacheStatus: 'fresh' | 'stale' | 'missing' = 'missing';
        let cachedSession: InquirySession | undefined;
        const cached = this.sessionStore.getSession(key);
        if (cached) {
            cachedSession = cached;
            cacheStatus = 'fresh';
        }
        if (!cachedSession) {
            const prior = this.sessionStore.getLatestByBaseKey(baseKey);
            if (prior && prior.result.corpusFingerprint !== manifest.fingerprint) {
                cacheStatus = 'stale';
                this.sessionStore.markStaleByBaseKey(baseKey);
            }
        }
        if (cachedSession && this.isErrorResult(cachedSession.result)) {
            cachedSession = undefined;
            cacheStatus = 'missing';
        }
        if (cachedSession) {
            this.state.cacheStatus = cacheStatus;
            this.handleDuplicateRunFeedback(question, cachedSession.key);
            this.activateSession(cachedSession);
            return;
        }

        if (!options?.bypassTokenGuard) {
            const readinessUi = this.buildReadinessUiState();
            this.lastReadinessUiState = readinessUi;
            if (readinessUi.readiness.state === 'blocked') {
                this.pendingGuardQuestion = question;
                this.showEnginePanel();
                return;
            }
        }

        this.clearActiveResultState();
        this.currentRunProgress = null;
        this.currentRunElapsedMs = 0;
        this.currentRunEstimatedMaxMs = this.estimateRunDurationRange(question.question).maxSeconds * 1000;
        this.state.activeQuestionId = question.id;
        this.state.activeZone = question.zone;
        this.lockPromptPreview(question);
        this.state.cacheStatus = cacheStatus;

        const startTime = Date.now();
        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();
        let result: InquiryResult;
        let runTrace: InquiryRunTrace | null = null;
        new Notice('Inquiry: contacting AI provider.');
        const submittedAt = new Date();
        const runnerInput = {
            scope: this.state.scope,
            focusLabel,
            focusBookId: this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusBookId,
            mode: this.state.mode,
            questionId: question.id,
            questionText: question.question,
            questionZone: question.zone,
            corpus: manifest,
            rules: this.getEvidenceRules(),
            ai: {
                provider: mapAiProviderToLegacyProvider(engineSelection.provider),
                modelId: engineSelection.modelId,
                modelLabel: engineSelection.modelLabel
            }
        };
        const runToken = this.beginInquiryRunToken();
        try {
            try {
                // Lens selection is UI-only; do not vary question, evidence, or verdict structure by lens.
                // Each inquiry produces two compressed answers (flow + depth). Keep this dual-answer model intact.
                const runOutput = await this.runner.runWithTrace(runnerInput, {
                    onProgress: progress => this.updateRunProgress(progress),
                    shouldAbort: () => this.shouldDiscardInquiryRunOutcome(runToken)
                });
                result = runOutput.result;
                runTrace = runOutput.trace;
                const progressState = this.currentRunProgress as InquiryRunProgressEvent | null;
                const progressPassCount = progressState?.totalPasses;
                const finalPassCount = Math.max(1, runOutput.trace.executionPassCount ?? progressPassCount ?? 1);
                this.updateRunProgress({
                    phase: 'finalizing',
                    currentPass: finalPassCount,
                    totalPasses: finalPassCount,
                    detail: 'Provider response received. Saving the result.'
                });
            } catch (error) {
                result = this.buildErrorFallback(question, focusLabel, manifest.fingerprint, error);
                const message = error instanceof Error ? error.message : String(error);
                runTrace = await this.buildFallbackTrace(runnerInput, `Runner exception: ${message}`);
            }
            if (this.shouldDiscardInquiryRunOutcome(runToken)) {
                return;
            }
            const completedAt = new Date();
            result.submittedAt = submittedAt.toISOString();
            result.completedAt = completedAt.toISOString();
            result.roundTripMs = completedAt.getTime() - submittedAt.getTime();
            this.applyTokenEstimateFromTrace(result, runTrace);
            result.aiModelNextRunOnly = false; // Legacy field — always false.
            result = this.applyCorpusOverrideSummary(result);
            const rawResult = result;
            result = this.normalizeLegacyResult(result);
            const normalizationNotes = this.collectNormalizationNotes(rawResult, result);
            result = this.applyExecutionObservabilityFromTrace(result, runTrace);
            if (this.shouldRejectUnboundHitResult(result)) {
                runTrace?.notes.push('Inquiry result rejected after execution: no finding could be matched to the active corpus.');
                result = this.withCitationBindingFailure(result);
            }

            if (!this.isErrorResult(result)) {
                cacheStatus = 'fresh';
            } else {
                cacheStatus = 'missing';
            }

            let session: InquirySession = {
                key,
                baseKey,
                result,
                createdAt: Date.now(),
                lastAccessed: Date.now(),
                status: this.resolveSessionStatusFromResult(result),
                focusBookId,
                focusSceneId,
                scope: this.state.scope,
                questionZone: question.zone
            };
            this.sessionStore.setSession(session);
            const traceForLog = runTrace
                ?? await this.buildFallbackTrace(runnerInput, 'Trace unavailable; log created without prompt capture.');
            await this.saveInquiryLog(result, traceForLog, this.filterManifestForLog(manifest, this.state.scope, focusBookId), {
                sessionKey: session.key,
                normalizationNotes
            });
            if (this.shouldDiscardInquiryRunOutcome(runToken)) {
                return;
            }
            session = this.sessionStore.peekSession(session.key) ?? session;

            const autoSaveEnabled = this.plugin.settings.inquiryAutoSave ?? true;
            const shouldAutoSave = autoSaveEnabled
                && !this.isErrorResult(result)
                && session.status !== 'simulated'
                && session.status !== 'saved'
                && !session.briefPath;
            if (shouldAutoSave) {
                await this.saveBrief(result, {
                    openFile: false,
                    silent: true,
                    sessionKey: session.key
                });
                session = this.sessionStore.peekSession(session.key) ?? session;
            }

            const elapsed = Date.now() - startTime;
            if (elapsed < MIN_PROCESSING_MS) {
                await new Promise(resolve => window.setTimeout(resolve, MIN_PROCESSING_MS - elapsed));
            }

            if (this.shouldDiscardInquiryRunOutcome(runToken)) {
                return;
            }

            this.applySession({
                result,
                key: session.key,
                focusBookId: session.focusBookId,
                focusSceneId: session.focusSceneId,
                scope: session.scope,
                questionZone: session.questionZone
            }, cacheStatus);
            if (this.isErrorResult(result)) {
                this.setApiStatus('error', this.formatApiErrorReason(result));
            } else {
                this.setApiStatus('success');
            }
            if (this.shouldAutoPopulatePendingEdits()) {
                void this.writeInquiryPendingEdits(session, result);
            }
        } finally {
            this.currentRunElapsedMs = 0;
            this.currentRunEstimatedMaxMs = 0;
            this.finishInquiryRunToken(runToken);
        }
    }

    public reopenSessionByKey(sessionKey: string): boolean {
        if (!sessionKey || this.state.isRunning || this.isInquiryBlocked()) return false;
        const session = this.sessionStore.peekSession(sessionKey);
        if (!session) return false;
        this.activateSession(session);
        return true;
    }

    public async runOmnibusPass(): Promise<void> {
        if (Platform.isMobile) { // SAFE: Platform imported from obsidian at top of file
            new Notice('Inquiry omnibus pass is available on desktop only.');
            return;
        }

        this.refreshCorpus();
        this.guidanceState = this.resolveGuidanceState();

        const questions = this.getOmnibusQuestions();
        const providerPlan = this.buildOmnibusProviderPlan();
        const runDisabledReason = this.getOmnibusRunDisabledReason(questions, providerPlan);

        const priorProgress = this.plugin.settings.inquiryOmnibusProgress;
        const resumeCheck = priorProgress
            ? this.checkOmnibusResumeEligibility(priorProgress, questions, providerPlan)
            : { available: false };

        const plan = await this.promptOmnibusPlan({
            initialScope: this.state.scope,
            bookLabel: this.getFocusBookLabel(),
            questions,
            providerSummary: providerPlan.summary,
            providerLabel: providerPlan.label,
            logsEnabled: this.plugin.settings.logApiInteractions ?? true,
            runDisabledReason,
            priorProgress: priorProgress ?? undefined,
            resumeAvailable: resumeCheck.available,
            resumeUnavailableReason: resumeCheck.reason
        });
        if (!plan) return;

        if (this.state.isRunning) {
            new Notice('Inquiry running. Please wait.');
            return;
        }

        if (plan.scope !== this.state.scope) {
            this.handleScopeChange(plan.scope);
        } else {
            this.refreshCorpus();
        }
        this.guidanceState = this.resolveGuidanceState();
        if (this.isInquiryRunDisabled()) {
            const message = this.isInquiryBlocked()
                ? 'Inquiry is not configured yet.'
                : 'No scenes available for Inquiry.';
            new Notice(message);
            return;
        }

        let nextQuestions = this.getOmnibusQuestions();
        if (!nextQuestions.length) {
            new Notice('No enabled Inquiry questions found.');
            return;
        }

        // Filter to remaining questions if resuming
        if (plan.resume && priorProgress) {
            const completed = new Set(priorProgress.completedQuestionIds);
            nextQuestions = nextQuestions.filter(q => !completed.has(q.id));
            if (!nextQuestions.length) {
                new Notice('All questions already completed. Nothing to resume.');
                return;
            }
        } else {
            // Fresh run: clear any prior progress
            this.clearOmnibusProgress();
        }

        const nextProviderPlan = this.buildOmnibusProviderPlan();
        if (!nextProviderPlan.choice) {
            const reason = nextProviderPlan.disabledReason || 'Provider unavailable';
            new Notice(`Omnibus unavailable: ${reason}.`);
            return;
        }

        this.omnibusAbortRequested = false;
        const allQuestions = this.getOmnibusQuestions();
        const providerChoice = nextProviderPlan.choice;
        try {
            if (!providerChoice.useOmnibus) {
                await this.runOmnibusSequential(nextQuestions, providerChoice, plan.createIndex, allQuestions.length);
                return;
            }
            await this.runOmnibusCombined(nextQuestions, providerChoice, plan.createIndex, allQuestions.length);
        } finally {
            this.activeOmnibusModal = undefined;
        }
    }

    private async runOmnibusCombined(
        questions: InquiryQuestion[],
        providerChoice: OmnibusProviderChoice,
        createIndex: boolean,
        totalForProgress?: number
    ): Promise<void> {
        const total = totalForProgress ?? questions.length;
        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const focusSceneId = this.state.scope === 'book' ? this.state.focusSceneId : undefined;
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const contextRequired = this.isContextRequiredForQuestions(questions);
        const manifest = this.buildCorpusManifest('omnibus', {
            modelId: providerChoice.modelId,
            contextRequired
        });
        if (!manifest.entries.length) {
            this.handleEmptyCorpusRun();
            return;
        }
        const submittedAt = new Date();

        const omnibusInput: InquiryOmnibusInput = {
            scope: this.state.scope,
            focusLabel,
            focusSceneId,
            focusBookId,
            mode: this.state.mode,
            questions: questions.map(question => ({
                id: question.id,
                zone: question.zone,
                question: question.question
            })),
            corpus: manifest,
            rules: this.getEvidenceRules(),
            ai: {
                provider: providerChoice.provider,
                modelId: providerChoice.modelId,
                modelLabel: providerChoice.modelLabel
            }
        };

        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();

        const modal = this.activeOmnibusModal;
        if (modal) modal.updateProgress(1, total, '', 'Combined run in progress...', 'Processing all questions in a single pass...');

        const briefPaths: string[] = [];
        const completedIds: string[] = [];
        let lastSession: InquirySession | null = null;
        let lastResult: InquiryResult | null = null;
        let traceForLogs: InquiryRunTrace | null = null;

        try {
            const runOutput = await this.runner.runOmnibusWithTrace(omnibusInput);
            traceForLogs = runOutput.trace;
            if (modal) {
                modal.setAiAdvancedContext(getLastAiAdvancedContext(this.plugin, 'InquiryMode'));
            }
            const completedAt = new Date();
            const questionsById = new Map(questions.map(question => [question.id, question]));

            for (let i = 0; i < runOutput.results.length; i += 1) {
                const result = runOutput.results[i];
                const question = questionsById.get(result.questionId) ?? questions[i];
                if (!question) continue;

                if (modal) {
                    const zoneLabel = question.zone === 'setup' ? 'Setup' : question.zone === 'pressure' ? 'Pressure' : 'Payoff';
                    modal.updateProgress(i + 1, total, zoneLabel, question.label, 'Writing brief/log...');
                }

                const questionManifest = this.buildCorpusManifest(question.id, {
                    modelId: providerChoice.modelId,
                    questionZone: question.zone
                });
                const trace = traceForLogs ? this.cloneTrace(traceForLogs) : await this.buildFallbackTrace({
                    scope: this.state.scope,
                    focusLabel,
                    focusSceneId,
                    focusBookId,
                    mode: this.state.mode,
                    questionId: question.id,
                    questionText: question.question,
                    questionZone: question.zone,
                    corpus: questionManifest,
                    rules: this.getEvidenceRules(),
                    ai: omnibusInput.ai
                }, 'Omnibus trace unavailable; log created without prompt capture.');

                const persisted = await this.persistOmnibusResult({
                    question,
                    result,
                    trace,
                    manifest: questionManifest,
                    focusId,
                    focusBookId,
                    focusSceneId,
                    submittedAt,
                    completedAt
                });
                if (persisted.briefPath) {
                    briefPaths.push(persisted.briefPath);
                }
                completedIds.push(question.id);
                lastSession = persisted.session;
                lastResult = persisted.normalized;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Inquiry omnibus failed: ${message}`);
        } finally {
            const indexPath = (createIndex && briefPaths.length > 1)
                ? await this.saveOmnibusIndexNote(briefPaths, focusLabel)
                : undefined;
            const allQuestionIds = this.getOmnibusQuestions().map(q => q.id);
            const isComplete = completedIds.length >= questions.length;
            if (isComplete) {
                this.clearOmnibusProgress();
            } else {
                this.saveOmnibusProgress({
                    totalQuestions: allQuestionIds.length,
                    completedQuestionIds: this.mergeCompletedIds(completedIds),
                    scope: this.state.scope,
                    questionIds: allQuestionIds,
                    useOmnibus: true,
                    corpusSettingsFingerprint: this.buildCorpusSettingsFingerprint(),
                    indexNotePath: indexPath ?? undefined,
                    abortedAt: new Date().toISOString()
                });
            }
            if (modal) modal.showResult(completedIds.length, total, !isComplete);
            if (lastSession && lastResult) {
                this.applySession({
                    result: lastResult,
                    key: lastSession.key,
                    focusBookId: lastSession.focusBookId,
                    focusSceneId: lastSession.focusSceneId,
                    scope: lastSession.scope,
                    questionZone: lastSession.questionZone
                }, 'missing');
                if (this.isErrorResult(lastResult)) {
                    this.setApiStatus('error', this.formatApiErrorReason(lastResult));
                } else {
                    this.setApiStatus('success');
                }
            } else {
                this.state.isRunning = false;
                this.setApiStatus('idle');
                this.refreshUI();
            }
            this.updateBriefingButtonState();
            this.refreshBriefingPanel();
        }
    }

    private async runOmnibusSequential(
        questions: InquiryQuestion[],
        providerChoice: OmnibusProviderChoice,
        createIndex: boolean,
        totalForProgress?: number
    ): Promise<void> {
        const total = totalForProgress ?? questions.length;
        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const focusSceneId = this.state.scope === 'book' ? this.state.focusSceneId : undefined;
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const briefPaths: string[] = [];
        const completedIds: string[] = [];
        let lastSession: InquirySession | null = null;
        let lastResult: InquiryResult | null = null;
        let aborted = false;

        const modal = this.activeOmnibusModal;

        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();

        try {
            for (let qi = 0; qi < questions.length; qi += 1) {
                // Check abort before starting each question
                if (this.omnibusAbortRequested || (modal && modal.isAbortRequested())) {
                    aborted = true;
                    break;
                }

                const question = questions[qi];
                const questionIndex = qi + 1;
                const zoneLabel = question.zone === 'setup' ? 'Setup' : question.zone === 'pressure' ? 'Pressure' : 'Payoff';

                if (modal) modal.updateProgress(questionIndex, total, zoneLabel, question.label);

                const manifest = this.buildCorpusManifest(question.id, {
                    modelId: providerChoice.modelId,
                    questionZone: question.zone
                });
                if (!manifest.entries.length) {
                    this.handleEmptyCorpusRun();
                    break;
                }
                const runnerInput: InquiryRunnerInput = {
                    scope: this.state.scope,
                    focusLabel,
                    focusSceneId,
                    focusBookId,
                    mode: this.state.mode,
                    questionId: question.id,
                    questionText: question.question,
                    questionZone: question.zone,
                    corpus: manifest,
                    rules: this.getEvidenceRules(),
                    ai: {
                        provider: providerChoice.provider,
                        modelId: providerChoice.modelId,
                        modelLabel: providerChoice.modelLabel
                    }
                };
                const submittedAt = new Date();
                let result: InquiryResult;
                let trace: InquiryRunTrace;
                try {
                    const runOutput = await this.runner.runWithTrace(runnerInput);
                    result = runOutput.result;
                    trace = runOutput.trace;
                    if (modal) {
                        modal.setAiAdvancedContext(getLastAiAdvancedContext(this.plugin, 'InquiryMode'));
                    }
                } catch (error) {
                    result = this.buildErrorFallback(question, focusLabel, manifest.fingerprint, error);
                    const message = error instanceof Error ? error.message : String(error);
                    trace = await this.buildFallbackTrace(runnerInput, `Runner exception: ${message}`);
                }

                if (modal) modal.updateProgress(questionIndex, total, zoneLabel, question.label, 'Writing brief/log...');

                const completedAt = new Date();
                const persisted = await this.persistOmnibusResult({
                    question,
                    result,
                    trace,
                    manifest,
                    focusId,
                    focusBookId,
                    focusSceneId,
                    submittedAt,
                    completedAt
                });
                if (persisted.briefPath) {
                    briefPaths.push(persisted.briefPath);
                }
                completedIds.push(question.id);
                lastSession = persisted.session;
                lastResult = persisted.normalized;
            }
        } finally {
            const indexPath = (createIndex && briefPaths.length > 1)
                ? await this.saveOmnibusIndexNote(briefPaths, focusLabel)
                : undefined;
            const allQuestionIds = this.getOmnibusQuestions().map(q => q.id);
            const isComplete = !aborted && completedIds.length >= questions.length;
            if (isComplete) {
                this.clearOmnibusProgress();
            } else {
                this.saveOmnibusProgress({
                    totalQuestions: allQuestionIds.length,
                    completedQuestionIds: this.mergeCompletedIds(completedIds),
                    scope: this.state.scope,
                    questionIds: allQuestionIds,
                    useOmnibus: false,
                    corpusSettingsFingerprint: this.buildCorpusSettingsFingerprint(),
                    indexNotePath: indexPath ?? undefined,
                    abortedAt: new Date().toISOString()
                });
            }
            if (modal) modal.showResult(completedIds.length, total, !isComplete);
            if (lastSession && lastResult) {
                this.applySession({
                    result: lastResult,
                    key: lastSession.key,
                    focusBookId: lastSession.focusBookId,
                    focusSceneId: lastSession.focusSceneId,
                    scope: lastSession.scope,
                    questionZone: lastSession.questionZone
                }, 'missing');
                if (this.isErrorResult(lastResult)) {
                    this.setApiStatus('error', this.formatApiErrorReason(lastResult));
                } else {
                    this.setApiStatus('success');
                }
            } else {
                this.state.isRunning = false;
                this.setApiStatus('idle');
                this.refreshUI();
            }
            this.updateBriefingButtonState();
            this.refreshBriefingPanel();
        }
    }

    private async persistOmnibusResult(options: {
        question: InquiryQuestion;
        result: InquiryResult;
        trace: InquiryRunTrace;
        manifest: CorpusManifest;
        focusId: string;
        focusBookId?: string;
        focusSceneId?: string;
        submittedAt: Date;
        completedAt: Date;
    }): Promise<{ session: InquirySession; briefPath?: string; normalized: InquiryResult }> {
        const timedResult: InquiryResult = {
            ...options.result,
            questionId: options.result.questionId || options.question.id,
            questionZone: options.result.questionZone || options.question.zone,
            submittedAt: options.submittedAt.toISOString(),
            completedAt: options.completedAt.toISOString(),
            roundTripMs: options.completedAt.getTime() - options.submittedAt.getTime(),
            corpusFingerprint: options.manifest.fingerprint
        };
        this.applyCorpusOverrideSummary(timedResult);
        this.applyTokenEstimateFromTrace(timedResult, options.trace);
        if (typeof timedResult.aiModelNextRunOnly !== 'boolean') {
            timedResult.aiModelNextRunOnly = false;
        }
        const tracedResult = this.applyExecutionObservabilityFromTrace(timedResult, options.trace);

        const normalized = this.normalizeLegacyResult(tracedResult);
        const normalizationNotes = this.collectNormalizationNotes(tracedResult, normalized);
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: normalized.questionId,
            scope: normalized.scope,
            focusId: options.focusId
        });
        const key = this.sessionStore.buildKey(baseKey, options.manifest.fingerprint);

        const session: InquirySession = {
            key,
            baseKey,
            result: normalized,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            status: this.resolveSessionStatusFromResult(normalized),
            focusBookId: options.focusBookId,
            focusSceneId: options.focusSceneId,
            scope: normalized.scope,
            questionZone: options.question.zone
        };
        this.sessionStore.setSession(session);

        const logPath = await this.saveInquiryLog(normalized, options.trace, this.filterManifestForLog(options.manifest, normalized.scope, options.focusBookId), {
            sessionKey: session.key,
            normalizationNotes,
            silent: true
        });
        const briefPath = await this.saveBrief(normalized, {
            openFile: false,
            silent: true,
            sessionKey: session.key,
            logPath: logPath ?? undefined
        });
        const updated = this.sessionStore.peekSession(session.key) ?? session;
        return {
            session: updated,
            briefPath: briefPath ?? undefined,
            normalized
        };
    }

    private cloneTrace(trace: InquiryRunTrace): InquiryRunTrace {
        return {
            ...trace,
            tokenEstimate: { ...trace.tokenEstimate },
            response: trace.response ? { ...trace.response } : null,
            usage: trace.usage ? { ...trace.usage } : undefined,
            sanitizationNotes: [...(trace.sanitizationNotes || [])],
            notes: [...(trace.notes || [])]
        };
    }

    private async saveOmnibusIndexNote(briefPaths: string[], focusLabel: string): Promise<string | null> {
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) return null;
        const timestamp = this.formatInquiryBriefTimestamp(new Date());
        const scopeLabel = this.state.scope === 'saga' ? 'Saga' : `Book ${focusLabel}`;
        const title = `Inquiry Omnibus — ${scopeLabel} ${timestamp}`;
        const filePath = this.getAvailableArtifactPath(folder.path, title);
        const links = briefPaths
            .map(path => path.split('/').pop())
            .filter((basename): basename is string => typeof basename === 'string' && basename.length > 0)
            .map(basename => basename.replace(/\.md$/, ''))
            .map(name => `- [[${name}]]`);
        const content = [`# ${title}`, '', ...links, ''].join('\n');
        try {
            const file = await this.app.vault.create(filePath, content);
            return file.path;
        } catch {
            return null;
        }
    }

    private async promptOmnibusPlan(options: InquiryOmnibusModalOptions): Promise<InquiryOmnibusPlan | null> {
        return new Promise(resolve => {
            const modal = new InquiryOmnibusModal(this.app, options, result => {
                this.activeOmnibusModal = modal;
                resolve(result);
            });
            modal.open();
        });
    }

    private saveOmnibusProgress(progress: OmnibusProgressState): void {
        this.plugin.settings.inquiryOmnibusProgress = progress;
        void this.plugin.saveSettings();
    }

    private clearOmnibusProgress(): void {
        this.plugin.settings.inquiryOmnibusProgress = undefined;
        void this.plugin.saveSettings();
    }

    private mergeCompletedIds(newIds: string[]): string[] {
        const prior = this.plugin.settings.inquiryOmnibusProgress;
        if (!prior) return [...newIds];
        const merged = new Set(prior.completedQuestionIds);
        newIds.forEach(id => merged.add(id));
        return [...merged];
    }

    private buildCorpusSettingsFingerprint(): string {
        const sources = this.plugin.settings.inquirySources;
        const classes = sources?.classes ?? [];
        const parts = classes
            .filter(c => c.enabled)
            .map(c => `${c.className}:${c.bookScope}:${c.sagaScope}:${c.referenceScope}`)
            .sort();
        return parts.join('|');
    }

    private checkOmnibusResumeEligibility(
        prior: OmnibusProgressState,
        currentQuestions: InquiryQuestion[],
        providerPlan: OmnibusProviderPlan
    ): { available: boolean; reason?: string } {
        if (prior.completedQuestionIds.length >= prior.totalQuestions) {
            return { available: false, reason: 'Previous run already completed.' };
        }
        if (prior.scope !== this.state.scope) {
            return { available: false, reason: 'Scope changed since last run.' };
        }
        const currentIds = currentQuestions.map(q => q.id).sort().join(',');
        const priorIds = [...prior.questionIds].sort().join(',');
        if (currentIds !== priorIds) {
            return { available: false, reason: 'Question set changed since last run.' };
        }
        const currentFingerprint = this.buildCorpusSettingsFingerprint();
        if (currentFingerprint !== prior.corpusSettingsFingerprint) {
            return { available: false, reason: 'Corpus contribution settings changed.' };
        }
        if (providerPlan.choice && providerPlan.choice.useOmnibus !== prior.useOmnibus) {
            // Allow sequential fallback from combined, but not the reverse
            if (prior.useOmnibus && !providerPlan.choice.useOmnibus) {
                // OK: falling back to sequential
            } else {
                return { available: false, reason: 'Provider strategy changed.' };
            }
        }
        return { available: true };
    }

    private getOmnibusQuestions(): InquiryQuestion[] {
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        const questions: InquiryQuestion[] = [];
        const seen = new Set<string>();

        zones.forEach(zone => {
            const slots = config[zone] ?? [];
            if (!slots.length) return;
            const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
            const icon = zone === 'setup' ? 'help-circle' : zone === 'pressure' ? 'activity' : 'check-circle';
            slots.forEach(slot => {
                if (!slot.enabled) return;
                if (seen.has(slot.id)) return;
                const questionText = this.getQuestionTextForSlot(zone, slot);
                if (!questionText.trim()) return;
                questions.push({
                    id: slot.id,
                    label: slot.label || zoneLabel,
                    question: questionText,
                    zone,
                    icon
                });
                seen.add(slot.id);
            });
        });

        return questions;
    }

    private buildOmnibusProviderPlan(): OmnibusProviderPlan {
        const geminiAvailability = this.getProviderAvailability('gemini');
        if (geminiAvailability.enabled) {
            const modelId = this.getInquiryModelIdForProvider('gemini');
            const modelLabel = this.getInquiryModelLabelForProvider('gemini');
            return {
                choice: {
                    provider: 'gemini',
                    modelId,
                    modelLabel,
                    useOmnibus: true
                },
                summary: `Prefers Gemini for a combined omnibus run when available. Gemini is available, so this run will use Gemini · ${modelLabel}.`,
                label: 'Gemini omnibus'
            };
        }

        const fallbackProvider = (this.plugin.settings.defaultAiProvider || 'openai') as EngineProvider;
        const fallbackAvailability = this.getProviderAvailability(fallbackProvider);
        const geminiReason = geminiAvailability.reason || 'Gemini not configured';
        if (!fallbackAvailability.enabled) {
            const providerLabel = this.getInquiryProviderLabel(fallbackProvider);
            const reason = fallbackAvailability.reason || 'Provider unavailable';
            return {
                choice: null,
                summary: `Prefers Gemini for a combined omnibus run when available. Gemini is unavailable (${geminiReason}); ${providerLabel} is also unavailable (${reason}).`,
                label: 'Unavailable',
                disabledReason: `${providerLabel} ${reason}`
            };
        }

        const providerLabel = this.getInquiryProviderLabel(fallbackProvider);
        const modelLabel = this.getInquiryModelLabelForProvider(fallbackProvider);
        return {
            choice: {
                provider: fallbackProvider,
                modelId: this.getInquiryModelIdForProvider(fallbackProvider),
                modelLabel,
                useOmnibus: false,
                reason: geminiReason
            },
            summary: `Prefers Gemini for a combined omnibus run when available. Gemini is unavailable (${geminiReason}), so this run will execute sequentially with ${providerLabel} · ${modelLabel}.`,
            label: `Sequential · ${providerLabel}`
        };
    }

    private getOmnibusRunDisabledReason(questions: InquiryQuestion[], providerPlan: OmnibusProviderPlan): string | null {
        if (this.state.isRunning) return 'Inquiry is already running.';
        if (this.isInquiryBlocked()) return 'Inquiry is not configured yet.';
        if (this.guidanceState === 'no-scenes') return 'No scenes available for Inquiry.';
        if (!questions.length) return 'No enabled Inquiry questions found.';
        if (!providerPlan.choice) return providerPlan.disabledReason || 'Provider unavailable';
        return null;
    }

    private getInquiryProviderLabel(provider: EngineProvider): string {
        const labels: Record<EngineProvider, string> = {
            anthropic: 'Anthropic',
            gemini: 'Gemini',
            openai: 'OpenAI',
            local: 'Local'
        };
        return labels[provider] || 'OpenAI';
    }

    private getInquiryModelIdForProvider(provider: EngineProvider): string {
        const clean = (value: string) => value.replace(/^models\//, '').trim();
        if (provider === 'anthropic') {
            return clean(this.plugin.settings.anthropicModelId || 'claude-sonnet-4-6');
        }
        if (provider === 'gemini') {
            return clean(this.plugin.settings.geminiModelId || 'gemini-3.1-pro-preview');
        }
        if (provider === 'local') {
            return clean(this.plugin.settings.localModelId || 'local-model');
        }
        return clean(this.plugin.settings.openaiModelId || 'gpt-5.4');
    }

    private getInquiryModelLabelForProvider(provider: EngineProvider): string {
        const modelId = this.getInquiryModelIdForProvider(provider);
        return modelId ? getModelDisplayName(modelId.replace(/^models\//, '')) : 'Unknown model';
    }

    private toAiProvider(provider: EngineProvider): AIProviderId {
        if (provider === 'anthropic') return 'anthropic';
        if (provider === 'gemini') return 'google';
        if (provider === 'local') return 'ollama';
        return 'openai';
    }

    private probeSecretPresence(provider: AIProviderId, secretId: string): void {
        if (!secretId.trim()) return;
        if (this.providerSecretProbePending.has(provider)) return;
        this.providerSecretProbePending.add(provider);
        void hasSecret(this.app, secretId)
            .then(exists => {
                this.providerSecretPresence[provider] = exists;
            })
            .finally(() => {
                this.providerSecretProbePending.delete(provider);
                if (this.enginePanelEl && !this.enginePanelEl.classList.contains('ert-hidden')) {
                    this.refreshEnginePanel();
                }
            });
    }

    private getProviderAvailability(provider: EngineProvider): { enabled: boolean; reason?: string } {
        if (provider === 'local') {
            const baseUrl = this.plugin.settings.localBaseUrl?.trim();
            return baseUrl ? { enabled: true } : { enabled: false, reason: 'Local URL missing' };
        }
        const key = provider === 'anthropic'
            ? this.plugin.settings.anthropicApiKey
            : provider === 'gemini'
                ? this.plugin.settings.geminiApiKey
                : this.plugin.settings.openaiApiKey;
        if (key?.trim()) return { enabled: true };

        const aiProvider = this.toAiProvider(provider);
        const aiSettings = this.getCanonicalAiSettings();
        const secretId = getCredentialSecretId(aiSettings, aiProvider);
        if (!secretId || !isSecretStorageAvailable(this.app)) {
            return { enabled: false, reason: 'API key missing' };
        }

        const cachedPresence = this.providerSecretPresence[aiProvider];
        if (cachedPresence === true) {
            return { enabled: true };
        }
        if (cachedPresence === false) {
            return { enabled: false, reason: 'Saved key not found' };
        }
        this.probeSecretPresence(aiProvider, secretId);
        return { enabled: true };
    }

    private applySession(
        session: {
            result: InquiryResult;
            key?: string;
            focusBookId?: string;
            focusSceneId?: string;
            scope?: InquiryScope;
            questionZone?: InquiryZone;
        },
        cacheStatus: 'fresh' | 'stale' | 'missing'
    ): void {
        const normalized = this.normalizeLegacyResult(session.result);
        const resolvedZone = session.questionZone ?? this.findPromptZoneById(normalized.questionId);
        this.state.scope = session.scope ?? normalized.scope;
        this.state.mode = normalized.mode;
        this.state.activeQuestionId = normalized.questionId;
        this.state.activeZone = resolvedZone ?? this.state.activeZone;
        if (resolvedZone && normalized.questionId) {
            const options = this.getPromptOptions(resolvedZone);
            if (options.some(option => option.id === normalized.questionId)) {
                this.state.selectedPromptIds[resolvedZone] = normalized.questionId;
            }
        }
        if (session.focusBookId !== undefined) {
            this.state.focusBookId = session.focusBookId;
        }
        if (session.focusSceneId !== undefined) {
            this.state.focusSceneId = session.focusSceneId;
        }
        this.state.activeSessionId = session.key;
        this.state.activeResult = normalized;
        this.state.corpusFingerprint = normalized.corpusFingerprint;
        this.state.cacheStatus = cacheStatus;
        this.state.isRunning = false;
        if (this.isErrorResult(normalized)) {
            this.showErrorPreview(normalized);
        } else {
            this.showResultsPreview(normalized);
        }
        this.updateMinimapFocus();
        this.refreshUI();
    }

    private clearActiveResultState(): void {
        this.state.activeResult = null;
        this.state.activeSessionId = undefined;
        this.state.corpusFingerprint = undefined;
        this.state.cacheStatus = undefined;
    }

    private dismissResults(): void {
        if (!this.isResultsState()) return;
        this.clearActiveResultState();
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI();
    }

    private dismissError(): void {
        if (!this.isErrorState()) return;
        this.clearActiveResultState();
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI();
    }

    private normalizeLegacyResult(result: InquiryResult): InquiryResult {
        const verdict = result.verdict as InquiryResult['verdict'] & {
            severity?: InquirySeverity;
            confidence?: InquiryConfidence;
        };
        const impact = verdict.impact ?? verdict.severity ?? 'low';
        const assessmentConfidence = verdict.assessmentConfidence ?? verdict.confidence ?? 'low';
        const findings = result.findings.map(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity; confidence?: InquiryConfidence };
            const normalizedRefId = this.normalizeResultRefId(legacy.refId);
            return {
                refId: normalizedRefId,
                kind: legacy.kind,
                status: legacy.status,
                impact: legacy.impact ?? legacy.severity ?? 'low',
                assessmentConfidence: legacy.assessmentConfidence ?? legacy.confidence ?? 'low',
                headline: legacy.headline,
                bullets: legacy.bullets,
                related: legacy.related,
                evidenceType: legacy.evidenceType,
                lens: legacy.lens
            };
        });
        const normalized: InquiryResult = {
            ...result,
            summaryFlow: result.summaryFlow ?? result.summary,
            summaryDepth: result.summaryDepth ?? result.summary,
            verdict: {
                flow: verdict.flow,
                depth: verdict.depth,
                impact,
                assessmentConfidence
            },
            findings
        };
        const inquiryId = this.formatInquiryIdFromResult(normalized);
        if (inquiryId && (!normalized.runId || normalized.runId.startsWith('run-'))) {
            normalized.runId = inquiryId;
        }
        return normalized;
    }

    private normalizeResultRefId(refId: string | undefined): string {
        const trimmed = typeof refId === 'string' ? refId.trim() : '';
        if (!trimmed) return '';
        if (!this.corpus?.scenes?.length) {
            return isStableSceneId(trimmed) ? trimmed.toLowerCase() : '';
        }

        const index = buildSceneRefIndex(this.corpus.scenes
            .filter(scene => isStableSceneId(scene.sceneId))
            .map(scene => ({
                sceneId: String(scene.sceneId).trim().toLowerCase(),
                path: scene.filePath,
                label: scene.displayLabel,
                sceneNumber: scene.sceneNumber,
                aliases: [scene.id, ...(scene.filePaths || [])]
            })));
        const normalized = normalizeSceneRef({ ref_id: trimmed }, index);
        if (normalized.warning) {
            console.warn(`[Inquiry] ${normalized.warning}`);
        }
        return normalized.ref.ref_id || '';
    }

    private collectNormalizationNotes(raw: InquiryResult, normalized: InquiryResult): string[] {
        const notes: string[] = [];
        if (!raw.summaryFlow && normalized.summaryFlow) {
            notes.push('Filled summaryFlow from summary.');
        }
        if (!raw.summaryDepth && normalized.summaryDepth) {
            notes.push('Filled summaryDepth from summary.');
        }
        const rawVerdict = raw.verdict as InquiryResult['verdict'] & {
            severity?: InquirySeverity;
            confidence?: InquiryConfidence;
        };
        if (rawVerdict.impact == null) {
            if (rawVerdict.severity != null) {
                notes.push('Mapped verdict severity to impact.');
            } else {
                notes.push('Defaulted verdict impact.');
            }
        }
        if (rawVerdict.assessmentConfidence == null) {
            if (rawVerdict.confidence != null) {
                notes.push('Mapped verdict confidence to assessmentConfidence.');
            } else {
                notes.push('Defaulted verdict assessmentConfidence.');
            }
        }
        const missingImpact = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity };
            return legacy.impact == null && legacy.severity == null;
        }).length;
        const mappedImpact = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity };
            return legacy.impact == null && legacy.severity != null;
        }).length;
        if (mappedImpact > 0) {
            notes.push(`Mapped finding severity to impact for ${mappedImpact} finding${mappedImpact === 1 ? '' : 's'}.`);
        }
        if (missingImpact > 0) {
            notes.push(`Defaulted finding impact for ${missingImpact} finding${missingImpact === 1 ? '' : 's'}.`);
        }
        const missingConfidence = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { confidence?: InquiryConfidence };
            return legacy.assessmentConfidence == null && legacy.confidence == null;
        }).length;
        const mappedConfidence = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { confidence?: InquiryConfidence };
            return legacy.assessmentConfidence == null && legacy.confidence != null;
        }).length;
        if (mappedConfidence > 0) {
            notes.push(`Mapped finding confidence to assessmentConfidence for ${mappedConfidence} finding${mappedConfidence === 1 ? '' : 's'}.`);
        }
        if (missingConfidence > 0) {
            notes.push(`Defaulted finding assessmentConfidence for ${missingConfidence} finding${missingConfidence === 1 ? '' : 's'}.`);
        }
        if (raw.runId !== normalized.runId && normalized.runId) {
            notes.push('Normalized runId to inquiry id.');
        }
        return notes;
    }

    private resolveInquiryActionNotesFieldLabel(): string {
        const fallback = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        return (this.plugin.settings.inquiryActionNotesTargetField ?? fallback).trim() || fallback;
    }

    private shouldAutoPopulatePendingEdits(): boolean {
        return this.plugin.settings.inquiryActionNotesAutoPopulate ?? false;
    }

    private async writeInquiryPendingEdits(
        session: InquirySession,
        result: InquiryResult,
        options?: { notify?: boolean }
    ): Promise<boolean> {
        if (session.pendingEditsApplied) return true;
        if (session.status === 'simulated' || result.aiReason === 'simulated') {
            if (options?.notify) {
                const fieldLabel = this.resolveInquiryActionNotesFieldLabel();
                this.notifyInteraction(`${fieldLabel} writeback is disabled for simulated runs.`);
            }
            return false;
        }

        const normalized = this.normalizeLegacyResult(result);
        if (this.isErrorResult(normalized)) return false;
        if (normalized.scope !== 'book') return false;
        if (!this.corpus) return false;

        const briefTitle = this.formatInquiryBriefTitle(normalized);
        const notesByMaterial = this.buildInquiryActionNotes(normalized, briefTitle, session.focusBookId);
        if (!notesByMaterial.size) return false;

        const defaultField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        const targetField = (this.plugin.settings.inquiryActionNotesTargetField ?? defaultField).trim() || 'Pending Edits';
        let wroteAny = false;
        let duplicateAny = false;

        for (const [path, notes] of notesByMaterial.entries()) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) continue;
            try {
                const outcome = await this.appendInquiryNotesToFrontmatter(file, targetField, briefTitle, notes);
                if (outcome === 'written') wroteAny = true;
                if (outcome === 'duplicate') duplicateAny = true;
            } catch (error) {
                console.warn('[Inquiry] Unable to write Pending Edits.', { path, error });
            }
        }

        const applied = wroteAny || duplicateAny;
        if (applied && session.key) {
            session.pendingEditsApplied = true;
            this.sessionStore.updateSession(session.key, { pendingEditsApplied: true });
            this.refreshBriefingPanel();
        }
        return applied;
    }

    private buildInquiryActionNotes(
        result: InquiryResult,
        briefTitle: string,
        focusBookId?: string
    ): Map<string, string[]> {
        const notesByPath = new Map<string, Set<string>>();
        const addNote = (path: string, note: string) => {
            let bucket = notesByPath.get(path);
            if (!bucket) {
                bucket = new Set<string>();
                notesByPath.set(path, bucket);
            }
            bucket.add(note);
        };

        const sceneByLabel = new Map<string, string>();
        const sceneById = new Map<string, string>();
        const sceneBySceneId = new Map<string, string>();
        const sceneByPath = new Map<string, string>();
        if (this.corpus?.scenes?.length) {
            this.corpus.scenes.forEach(scene => {
                sceneByLabel.set(scene.displayLabel, scene.filePath);
                sceneById.set(scene.id, scene.filePath);
                if (scene.sceneId) {
                    sceneBySceneId.set(scene.sceneId, scene.filePath);
                }
                scene.filePaths?.forEach(path => sceneByPath.set(path, scene.filePath));
            });
        }

        const outlinePath = this.resolveBookOutlinePath(focusBookId);
        const minimumRank = this.getImpactRank('medium');
        const handledScenes = new Set<string>();

        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            if (this.getImpactRank(finding.impact) < minimumRank) return;
            const note = this.formatInquiryActionNote(finding, briefTitle);
            const refId = finding.refId?.trim();
            const filePath = refId
                ? (sceneByLabel.get(refId)
                    ?? sceneBySceneId.get(refId)
                    ?? sceneById.get(refId)
                    ?? sceneByPath.get(refId))
                : undefined;
            if (filePath && !handledScenes.has(filePath)) {
                addNote(filePath, note);
                handledScenes.add(filePath);
            }
            if (outlinePath) {
                addNote(outlinePath, note);
            }
        });

        const notesByMaterial = new Map<string, string[]>();
        notesByPath.forEach((notes, path) => {
            const list = Array.from(notes);
            if (list.length) {
                notesByMaterial.set(path, list);
            }
        });

        return notesByMaterial;
    }

    private resolveBookOutlinePath(focusBookId?: string): string | null {
        if (!this.corpus?.books?.length) return null;
        const resolvedBookId = focusBookId ?? this.corpus.activeBookId ?? this.corpus.books[0]?.id;
        if (!resolvedBookId) return null;
        const book = this.corpus.books.find(entry => entry.id === resolvedBookId) ?? this.corpus.books[0];
        if (!book) return null;
        const outlineFiles = this.getOutlineFiles();
        const bookOutlines = outlineFiles.filter(file => (this.getOutlineScope(file) ?? 'book') === 'book');
        const outline = bookOutlines.find(file => file.path === book.rootPath || file.path.startsWith(`${book.rootPath}/`));
        return outline?.path ?? null;
    }

    private async appendInquiryNotesToFrontmatter(
        file: TFile,
        fieldKey: string,
        briefTitle: string,
        notes: string[]
    ): Promise<InquiryWritebackOutcome> {
        if (!notes.length) return 'skipped';
        const briefLinkNeedle = `[[${briefTitle}`;
        let outcome: InquiryWritebackOutcome = 'skipped';
        const inquiryLinkToken = '[[Inquiry Brief —';
        const isInquiryLine = (line: string): boolean => line.includes(inquiryLinkToken);
        const normalizeInquiryLinkLine = (line: string): string => {
            if (!line) return line;
            return line
                .replace(/^\\?"(\[\[[^\]]+\]\])"\\?(\s+—\s+)/, '$1$2')
                .replace(/^\\?"(\[\[[^\]]+\]\])"\\?$/, '$1');
        };

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            const frontmatter = fm as Record<string, unknown>;
            const rawValue = frontmatter[fieldKey];
            let rawText = '';
            if (typeof rawValue === 'string') {
                rawText = rawValue;
            } else if (Array.isArray(rawValue)) {
                rawText = rawValue.map(entry => (typeof entry === 'string' ? entry : String(entry))).join('\n');
            } else if (rawValue !== undefined && rawValue !== null) {
                rawText = String(rawValue);
            }

            const newline = rawText.includes('\r\n') ? '\r\n' : '\n';
            const lines = rawText === '' ? [] : rawText.split(/\r?\n/);
            const normalizedLines = lines.map(line => normalizeInquiryLinkLine(line));
            const normalizedExisting = normalizedLines.some((line, index) => line !== lines[index]);
            const inquiryIndices = normalizedLines.reduce<number[]>((acc, line, index) => {
                if (isInquiryLine(line)) acc.push(index);
                return acc;
            }, []);

            if (inquiryIndices.some(index => normalizedLines[index].includes(briefLinkNeedle))) {
                if (!normalizedExisting) {
                    outcome = 'duplicate';
                    return;
                }
                const normalizedText = normalizedLines.join(newline);
                frontmatter[fieldKey] = normalizedText;
                outcome = 'written';
                return;
            }

            const nextNotes = notes.map(note => normalizeInquiryLinkLine(note));
            let nextLines = [...normalizedLines, ...nextNotes];

            const nextInquiryIndices = nextLines.reduce<number[]>((acc, line, index) => {
                if (isInquiryLine(line)) acc.push(index);
                return acc;
            }, []);
            if (nextInquiryIndices.length > INQUIRY_NOTES_MAX) {
                const dropCount = nextInquiryIndices.length - INQUIRY_NOTES_MAX;
                const dropIndices = new Set(nextInquiryIndices.slice(0, dropCount));
                nextLines = nextLines.filter((_, index) => !dropIndices.has(index));
            }

            const nextText = nextLines.join(newline);
            frontmatter[fieldKey] = nextText;
            outcome = 'written';
        });
        return outcome;
    }

    private formatApiErrorReason(result: InquiryResult): string {
        const status = result.aiStatus || 'unknown';
        const reason = result.aiReason;
        const reasonText = reason ? `${status} (${reason})` : status;
        const executionBits: string[] = [];
        if (result.executionState) executionBits.push(`state=${result.executionState}`);
        if (result.executionPath) executionBits.push(`path=${result.executionPath}`);
        if (result.failureStage) executionBits.push(`stage=${result.failureStage}`);
        if (typeof result.tokenUsageKnown === 'boolean') {
            executionBits.push(`usage=${this.formatTokenUsageVisibility(result.tokenUsageKnown, result.tokenUsageScope)}`);
        }
        if (!executionBits.length) return reasonText;
        return `${reasonText} [${executionBits.join(', ')}]`;
    }

    private formatTokenUsageVisibility(
        known: boolean,
        scope?: InquiryTokenUsageScope
    ): string {
        if (!known) return 'unknown';
        if (scope === 'full') return 'full multi-pass';
        if (scope === 'partial') return 'partial multi-pass';
        if (scope === 'synthesis_only') return 'synthesis-only';
        return 'known';
    }

    private applyExecutionObservabilityFromTrace(
        result: InquiryResult,
        trace?: InquiryRunTrace | null
    ): InquiryResult {
        if (!trace) return result;
        const usageKnown = typeof trace.tokenUsageKnown === 'boolean'
            ? trace.tokenUsageKnown
            : !!trace.usage;
        return {
            ...result,
            executionState: trace.executionState,
            executionPath: trace.executionPath,
            failureStage: trace.failureStage,
            tokenUsageKnown: usageKnown,
            tokenUsageScope: trace.tokenUsageScope
        };
    }

    private applyTokenEstimateFromTrace(result: InquiryResult, trace?: InquiryRunTrace | null): void {
        const inputTokens = trace?.tokenEstimate?.inputTokens;
        if (typeof inputTokens === 'number' && Number.isFinite(inputTokens)) {
            result.tokenEstimateInput = inputTokens;
            result.tokenEstimateTier = this.getTokenTier(inputTokens);
            return;
        }
        result.tokenEstimateInput = undefined;
        result.tokenEstimateTier = undefined;
    }

    private getFiniteTokenEstimateInput(
        trace?: InquiryRunTrace | null,
        result?: InquiryResult | null
    ): number | null {
        const traceInput = trace?.tokenEstimate?.inputTokens;
        if (typeof traceInput === 'number' && Number.isFinite(traceInput)) {
            return traceInput;
        }
        const resultInput = result?.tokenEstimateInput;
        if (typeof resultInput === 'number' && Number.isFinite(resultInput)) {
            return resultInput;
        }
        return null;
    }

    private startApiSimulation(): void {
        if (this.isInquiryRunDisabled()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        this.clearErrorStateForAction();
        if (this.apiSimulationTimer) {
            window.clearTimeout(this.apiSimulationTimer);
            this.apiSimulationTimer = undefined;
        }
        const prompt = this.pickSimulationPrompt();
        const fallbackPrompt: InquiryQuestion = {
            id: 'simulation',
            label: 'Simulation',
            question: 'Simulated inquiry run.',
            zone: this.state.activeZone ?? 'setup',
            icon: 'activity'
        };
        const selectedPrompt = prompt ?? fallbackPrompt;
        this.clearActiveResultState();
        this.state.activeQuestionId = selectedPrompt.id;
        this.state.activeZone = selectedPrompt.zone;
        this.lockPromptPreview(selectedPrompt);

        const manifest = this.buildCorpusManifest(selectedPrompt.id, {
            questionZone: selectedPrompt.zone
        });
        if (!manifest.entries.length) {
            this.unlockPromptPreview();
            this.handleEmptyCorpusRun();
            return;
        }
        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: selectedPrompt.id,
            scope: this.state.scope,
            focusId
        });
        const key = this.sessionStore.buildKey(baseKey, manifest.fingerprint);
        const focusSceneId = this.state.scope === 'book' ? this.state.focusSceneId : undefined;
        const focusBookId = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusBookId;
        const runnerInput = {
            scope: this.state.scope,
            focusLabel,
            focusBookId: this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusBookId,
            mode: this.state.mode,
            questionId: selectedPrompt.id,
            questionText: selectedPrompt.question,
            questionZone: selectedPrompt.zone,
            corpus: manifest,
            rules: this.getEvidenceRules(),
            ai: {
                provider: mapAiProviderToLegacyProvider(this.getResolvedEngine().provider),
                modelId: this.getResolvedEngine().modelId,
                modelLabel: this.getResolvedEngine().modelLabel
            }
        };
        const submittedAt = new Date();
        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();
        this.apiSimulationTimer = window.setTimeout(async () => {
            this.apiSimulationTimer = undefined;
            const completedAt = new Date();
            let result = this.buildSimulationResult(selectedPrompt, focusLabel, manifest.fingerprint);
            result.submittedAt = submittedAt.toISOString();
            result.completedAt = completedAt.toISOString();
            result.roundTripMs = completedAt.getTime() - submittedAt.getTime();
            const simSnapshot = this.plugin.getInquiryEstimateService().getSnapshot();
            if (typeof simSnapshot?.estimate.estimatedInputTokens === 'number'
                && Number.isFinite(simSnapshot.estimate.estimatedInputTokens)) {
                result.tokenEstimateInput = simSnapshot.estimate.estimatedInputTokens;
                result.tokenEstimateTier = this.getTokenTier(simSnapshot.estimate.estimatedInputTokens);
            } else {
                result.tokenEstimateInput = undefined;
                result.tokenEstimateTier = undefined;
            }
            result.aiModelNextRunOnly = false;
            result = this.applyCorpusOverrideSummary(result);
            const rawResult = result;
            result = this.normalizeLegacyResult(result);
            const normalizationNotes = this.collectNormalizationNotes(rawResult, result);

            const session: InquirySession = {
                key,
                baseKey,
                result,
                createdAt: Date.now(),
                lastAccessed: Date.now(),
                status: 'simulated',
                focusBookId,
                focusSceneId,
                scope: this.state.scope,
                questionZone: selectedPrompt.zone
            };
            this.sessionStore.setSession(session);
            const trace = await this.buildFallbackTrace(runnerInput, 'Simulated run: no provider call.');
            await this.saveInquiryLog(result, trace, this.filterManifestForLog(manifest, this.state.scope, focusBookId), {
                sessionKey: session.key,
                normalizationNotes
            });
            this.applySession({
                result,
                key: session.key,
                focusBookId: session.focusBookId,
                focusSceneId: session.focusSceneId,
                scope: session.scope,
                questionZone: session.questionZone
            }, 'missing');
            this.setApiStatus('success');
        }, SIMULATION_DURATION_MS);
    }

    private pickSimulationPrompt(): InquiryQuestion | undefined {
        const preferredZone = this.state.activeZone ?? 'setup';
        return this.getActivePrompt(preferredZone)
            ?? this.getActivePrompt('setup')
            ?? this.getActivePrompt('pressure')
            ?? this.getActivePrompt('payoff');
    }

    private buildErrorFallback(
        question: InquiryQuestion,
        focusLabel: string,
        fingerprint: string,
        error: unknown
    ): InquiryResult {
        const message = error instanceof Error ? error.message : 'Runner error';
        return {
            runId: `run-${Date.now()}`,
            scope: this.state.scope,
            focusId: focusLabel,
            mode: this.state.mode,
            questionId: question.id,
            questionZone: question.zone,
            summary: 'Inquiry failed; fallback result returned.',
            summaryFlow: 'Inquiry failed; fallback result returned.',
            summaryDepth: 'Inquiry failed; fallback result returned.',
            verdict: {
                flow: 0,
                depth: 0,
                impact: 'high',
                assessmentConfidence: 'low'
            },
            aiStatus: 'unavailable',
            aiReason: 'exception',
            findings: [{
                refId: focusLabel,
                kind: 'error',
                status: 'unclear',
                impact: 'high',
                assessmentConfidence: 'low',
                headline: 'Inquiry runner error.',
                bullets: [message],
                related: [],
                evidenceType: 'mixed',
                lens: 'both'
            }],
            corpusFingerprint: fingerprint
        };
    }

    private buildSimulationResult(question: InquiryQuestion, focusLabel: string, fingerprint: string): InquiryResult {
        return {
            runId: `run-${Date.now()}`,
            scope: this.state.scope,
            focusId: focusLabel,
            mode: this.state.mode,
            questionId: question.id,
            questionZone: question.zone,
            summary: 'Simulated inquiry session.',
            summaryFlow: 'Simulated inquiry session.',
            summaryDepth: 'Simulated inquiry session.',
            verdict: {
                flow: GLYPH_PLACEHOLDER_FLOW,
                depth: GLYPH_PLACEHOLDER_DEPTH,
                impact: 'low',
                assessmentConfidence: 'low'
            },
            aiStatus: 'success',
            aiReason: 'simulated',
            findings: [],
            corpusFingerprint: fingerprint
        };
    }

    private getEvidenceRules(): EvidenceParticipationRules {
        return {
            sagaOutlineScope: 'saga-only',
            bookOutlineScope: 'book-only',
            crossScopeUsage: 'conflict-only'
        };
    }

    private buildCorpusEntryList(
        questionId: string,
        options?: {
            modelId?: string;
            questionZone?: InquiryZone;
            contextRequired?: boolean;
            includeInactive?: boolean;
            applyOverrides?: boolean;
        }
    ): { entries: CorpusManifestEntry[]; resolvedRoots: string[] } {
        const rawSources = this.plugin.settings.inquirySources as Record<string, unknown> | undefined;
        if (rawSources && ('sceneFolders' in rawSources || 'bookOutlineFiles' in rawSources || 'sagaOutlineFile' in rawSources)) {
            const legacy = this.buildLegacyCorpusManifest(rawSources, questionId, { modelId: options?.modelId });
            const applyOverrides = options?.applyOverrides ?? true;
            const includeInactive = options?.includeInactive ?? false;
            let entries = legacy.entries;
            if (applyOverrides) {
                entries = entries.map(entry => {
                    const groupKey = this.getCorpusGroupKey(entry.class, entry.scope);
                    const baseClass = this.getCorpusGroupBaseClass(groupKey);
                    const classOverride = this.corpusService.getClassOverride(groupKey);
                    const itemOverride = this.getCorpusItemOverride(entry.class, entry.path, entry.scope, entry.sceneId);
                    const mode = this.normalizeContributionMode(itemOverride ?? classOverride ?? entry.mode ?? 'none', baseClass);
                    return { ...entry, mode };
                });
            }
            if (!includeInactive) {
                entries = entries.filter(entry => this.isModeActive(entry.mode));
            }
            return { entries, resolvedRoots: legacy.resolvedRoots };
        }

        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const entries: CorpusManifestEntry[] = [];
        const now = Date.now();
        const includeInactive = options?.includeInactive ?? false;
        const applyOverrides = options?.applyOverrides ?? true;
        const classConfigMap = new Map(
            (sources.classes || []).map(config => [config.className, config])
        );
        const classScope = this.getClassScopeConfig(sources.classScope);
        const contextRequired = typeof options?.contextRequired === 'boolean'
            ? options.contextRequired
            : this.isContextRequiredForQuestion(questionId, options?.questionZone);
        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? ((sources.resolvedScanRoots && sources.resolvedScanRoots.length)
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);
        const bookResolution = resolveInquiryBookResolution({
            vault: this.app.vault,
            metadataCache: this.app.metadataCache,
            resolvedVaultRoots,
            frontmatterMappings: this.plugin.settings.frontmatterMappings,
            bookInclusion: sources.bookInclusion
        });

        if (!classScope.allowAll && classScope.allowed.size === 0) {
            return { entries, resolvedRoots };
        }

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            if (!inRoots(file.path)) return;
            if (!isPathIncludedByInquiryBooks(file.path, bookResolution.candidates)) return;
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            if (!classValues.length) return;

            classValues.forEach(className => {
                if (!classScope.allowAll && !classScope.allowed.has(className)) return;
                const config = classConfigMap.get(className);
                const isContextClass = INQUIRY_CONTEXT_CLASSES.has(className);
                const contextOverride = contextRequired && isContextClass;
                if (!config && !contextOverride) return;

                let mode: InquiryMaterialMode = 'none';
                if (className === 'outline') {
                    const outlineScope = this.getFrontmatterScope(frontmatter) ?? 'book';
                    if (config && config.enabled) {
                        mode = this.normalizeContributionMode(
                            outlineScope === 'saga' ? config.sagaScope : config.bookScope,
                            className
                        );
                    }
                    if (contextOverride) {
                        mode = 'full';
                    }
                    if (applyOverrides) {
                        const groupKey = this.getCorpusGroupKey(className, outlineScope);
                        const classOverride = this.corpusService.getClassOverride(groupKey);
                        const itemOverride = this.getCorpusItemOverride(className, file.path, outlineScope);
                        mode = itemOverride ?? classOverride ?? mode;
                        mode = this.normalizeContributionMode(mode, className);
                    }
                    if (!includeInactive && !this.isModeActive(mode)) return;
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        scope: outlineScope,
                        mode
                    });
                    return;
                }

                if (!this.isSynopsisCapableClass(className)) {
                    if (config && config.enabled) {
                        mode = this.normalizeContributionMode(config.referenceScope, className);
                    }
                    if (contextOverride) {
                        mode = 'full';
                    }
                    if (applyOverrides) {
                        const groupKey = this.getCorpusGroupKey(className);
                        const classOverride = this.corpusService.getClassOverride(groupKey);
                        const itemOverride = this.getCorpusItemOverride(className, file.path);
                        mode = itemOverride ?? classOverride ?? mode;
                        mode = this.normalizeContributionMode(mode, className);
                    }
                    if (!includeInactive && !this.isModeActive(mode)) return;
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        mode
                    });
                    return;
                }

                if (config && config.enabled) {
                    mode = this.normalizeContributionMode(
                        this.state.scope === 'book' ? config.bookScope : config.sagaScope,
                        className
                    );
                }
                const sceneId = className === 'scene' ? readSceneId(normalized) : undefined;
                if (applyOverrides) {
                    const groupKey = this.getCorpusGroupKey(className);
                    const classOverride = this.corpusService.getClassOverride(groupKey);
                    const itemOverride = this.getCorpusItemOverride(className, file.path, undefined, sceneId);
                    mode = itemOverride ?? classOverride ?? mode;
                    mode = this.normalizeContributionMode(mode, className);
                }
                if (!includeInactive && !this.isModeActive(mode)) return;

                entries.push({
                    path: file.path,
                    sceneId,
                    mtime: file.stat.mtime ?? now,
                    class: className,
                    mode
                });
            });
        });

        return { entries, resolvedRoots };
    }

    private buildCorpusManifest(
        questionId: string,
        options?: { modelId?: string; questionZone?: InquiryZone; contextRequired?: boolean; applyOverrides?: boolean }
    ): CorpusManifest {
        const rawSources = this.plugin.settings.inquirySources as Record<string, unknown> | undefined;
        if (rawSources && ('sceneFolders' in rawSources || 'bookOutlineFiles' in rawSources || 'sagaOutlineFile' in rawSources)) {
            return this.buildLegacyCorpusManifest(rawSources, questionId, options);
        }
        const now = Date.now();
        const modelIdOverride = options?.modelId;
        const applyOverrides = options?.applyOverrides ?? true;
        const entryResult = this.buildCorpusEntryList(questionId, {
            modelId: modelIdOverride,
            questionZone: options?.questionZone,
            contextRequired: options?.contextRequired,
            includeInactive: false,
            applyOverrides
        });
        const entries = entryResult.entries;
        const resolvedRoots = entryResult.resolvedRoots;

        const fingerprintSource = entries
            .map(entry => `${entry.path}:${entry.sceneId ?? ''}:${entry.mtime}:${entry.mode ?? 'none'}`)
            .sort()
            .join('|');
        const modelId = modelIdOverride ?? this.getResolvedEngine().modelId;
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {});
        const allowedClasses = Array.from(new Set(entries.map(entry => entry.class)));
        const synopsisOnly = !entries.some(entry => this.normalizeEvidenceMode(entry.mode) === 'full');

        return {
            entries,
            fingerprint,
            generatedAt: now,
            resolvedRoots,
            allowedClasses,
            synopsisOnly,
            classCounts
        };
    }

    private buildLegacyCorpusManifest(
        rawSources: Record<string, unknown>,
        questionId: string,
        options?: { modelId?: string }
    ): CorpusManifest {
        const entries: CorpusManifest['entries'] = [];
        const now = Date.now();
        const modelIdOverride = options?.modelId;
        const classScope = this.getClassScopeConfig(
            this.normalizeInquirySources(this.plugin.settings.inquirySources).classScope
        );
        if (!classScope.allowAll && classScope.allowed.size === 0) {
            const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelIdOverride ?? this.getResolvedEngine().modelId}|`;
            return {
                entries,
                fingerprint: this.hashString(fingerprintRaw),
                generatedAt: now,
                resolvedRoots: [],
                allowedClasses: [],
                synopsisOnly: true,
                classCounts: {}
            };
        }
        const sources = rawSources as {
            sceneFolders?: string[];
            bookOutlineFiles?: string[];
            sagaOutlineFile?: string;
            characterFolders?: string[];
            placeFolders?: string[];
            powerFolders?: string[];
        };

        const addEntries = (paths: string[] | undefined, data: { class: string; scope?: InquiryScope; mode: InquiryMaterialMode }) => {
            if (!paths) return;
            if (!classScope.allowAll && !classScope.allowed.has(data.class)) return;
            paths.forEach(rawPath => {
                const path = normalizePath(rawPath);
                if (!path) return;
                const file = this.app.vault.getAbstractFileByPath(path);
                const mtime = file && 'stat' in file ? (file as { stat: { mtime: number } }).stat.mtime : now;
                let sceneId: string | undefined;
                if (data.class === 'scene' && file && this.isTFile(file)) {
                    const frontmatter = this.getNormalizedFrontmatter(file);
                    sceneId = readSceneId(frontmatter ?? undefined);
                }
                entries.push({
                    path,
                    sceneId,
                    mtime,
                    class: data.class,
                    scope: data.scope,
                    mode: data.mode
                });
            });
        };

        addEntries(sources.sceneFolders, { class: 'scene', scope: 'book', mode: 'summary' });
        addEntries(sources.bookOutlineFiles, { class: 'outline', scope: 'book', mode: 'full' });
        addEntries(sources.characterFolders, { class: 'character', mode: 'full' });
        addEntries(sources.placeFolders, { class: 'place', mode: 'full' });
        addEntries(sources.powerFolders, { class: 'power', mode: 'full' });

        if (sources.sagaOutlineFile) {
            addEntries([sources.sagaOutlineFile], { class: 'outline', scope: 'saga', mode: 'full' });
        }

        const fingerprintSource = entries
            .map(entry => `${entry.path}:${entry.sceneId ?? ''}:${entry.mtime}:${entry.mode ?? 'none'}`)
            .sort()
            .join('|');
        const modelId = modelIdOverride ?? this.getResolvedEngine().modelId;
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {});
        const allowedClasses = classScope.allowAll
            ? Array.from(new Set(entries.map(entry => entry.class)))
            : Array.from(classScope.allowed);
        const synopsisOnly = !entries.some(entry => this.normalizeEvidenceMode(entry.mode) === 'full');

        return {
            entries,
            fingerprint,
            generatedAt: now,
            resolvedRoots: [],
            allowedClasses,
            synopsisOnly,
            classCounts
        };
    }

    private getDefaultMaterialMode(className: string): InquiryMaterialMode {
        return getDefaultMaterialModePure(className);
    }

    private isSynopsisCapableClass(className: string): boolean {
        return isSynopsisCapableClassPure(className);
    }

    private normalizeContributionMode(mode: InquiryMaterialMode, className: string): InquiryMaterialMode {
        return normalizeContributionModePure(mode, className);
    }

    private normalizeMaterialMode(value: unknown, className: string): InquiryMaterialMode {
        return normalizeMaterialModePure(value, className);
    }

    private resolveContributionMode(config: InquiryClassConfig): InquiryMaterialMode {
        return resolveContributionModePure(config);
    }

    private normalizeClassContribution(config: InquiryClassConfig): InquiryClassConfig {
        return normalizeClassContributionPure(config);
    }

    private normalizeEvidenceMode(mode?: InquiryMaterialMode): 'none' | 'summary' | 'full' {
        return normalizeEvidenceModePure(mode);
    }

    private isModeActive(mode?: InquiryMaterialMode): boolean {
        return isModeActivePure(mode);
    }

    private normalizeInquirySources(raw?: InquirySourcesSettings): InquirySourcesSettings {
        return normalizeInquirySourcesPure(raw);
    }

    private extractClassValues(frontmatter: Record<string, unknown>): string[] {
        return extractClassValuesPure(frontmatter);
    }

    private getFrontmatterScope(frontmatter: Record<string, unknown>): InquiryScope | undefined {
        return getFrontmatterScopePure(frontmatter, this.plugin.settings.frontmatterMappings);
    }

    private hashString(value: string): string {
        return hashStringPure(value);
    }

    private getBriefSceneAnchorId(source: string): string {
        return `inquiry-${this.hashString(source || 'scene')}`;
    }

    private setFocusByIndex(index: number): void {
        const books = this.getNavigationBooks();
        const book = books[index - 1];
        if (!book) return;
        this.state.focusBookId = book.id;
        if (this.state.scope === 'book') {
            this.state.focusSceneId = this.lastFocusSceneByBookId.get(book.id);
        }
        this.scheduleFocusPersist();
        this.refreshUI();
    }

    private async openActiveBrief(anchorId?: string): Promise<void> {
        const sessionId = this.state.activeSessionId;
        if (!sessionId) {
            new Notice('No active inquiry brief.');
            return;
        }
        const session = this.sessionStore.peekSession(sessionId);
        if (!session?.briefPath) {
            new Notice('No brief saved for the active inquiry.');
            return;
        }
        await this.openBriefFromSession(session, anchorId);
    }

    private async openSceneFromMinimap(sceneId: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(sceneId);
        if (file && this.isTFile(file)) {
            await openOrRevealFile(this.app, file);
            return;
        }
        new Notice('Scene file not found.');
    }

    private async openActiveBriefForItem(item: InquiryCorpusItem): Promise<void> {
        const anchorSource = this.getMinimapItemFilePath(item) || item.id || item.displayLabel;
        const anchorId = this.getBriefSceneAnchorId(anchorSource);
        await this.openActiveBrief(anchorId);
    }

    private drillIntoBook(bookId: string): void {
        if (!bookId) return;
        const wasScope = this.state.scope;
        this.state.focusBookId = bookId;
        this.scheduleFocusPersist();
        if (wasScope === 'saga') {
            this.handleScopeChange('book');
            return;
        }
        this.refreshUI();
    }

    private shiftFocus(delta: number): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        this.clearErrorStateForAction();
        const books = this.getNavigationBooks();
        const count = books.length;
        if (!count) return;
        const current = this.getNavigationBookIndex(books) + 1;
        const next = Math.min(Math.max(current + delta, 1), count);
        if (next === current) return;
        this.setFocusByIndex(next);
    }

    private getFocusIndex(): number {
        const books = this.getNavigationBooks();
        if (!books.length) return 1;
        return this.getNavigationBookIndex(books) + 1;
    }

    private getNavigationBooks(): InquiryBookItem[] {
        return this.corpus?.books ?? [];
    }

    private getNavigationBookIndex(books: InquiryBookItem[]): number {
        if (!books.length) return 0;
        const focusBookId = this.state.focusBookId ?? this.corpus?.activeBookId ?? books[0]?.id;
        const index = focusBookId ? books.findIndex(book => book.id === focusBookId) : -1;
        return index >= 0 ? index : 0;
    }

    private getFocusBookLabel(): string {
        const books = this.corpus?.books ?? [];
        if (this.state.focusBookId) {
            const match = books.find(book => book.id === this.state.focusBookId);
            if (match) return match.displayLabel;
        }
        return books[0]?.displayLabel ?? 'B0';
    }

    private getFocusBookTitleForMessages(): string | null {
        const focusBookId = this.state.focusBookId ?? this.corpus?.activeBookId ?? this.corpus?.books?.[0]?.id;
        return this.getBookTitleForId(focusBookId);
    }

    private getBookTitleForId(bookId: string | undefined): string | null {
        if (!bookId) return null;
        const normalizedFocus = normalizePath(bookId);
        if (!normalizedFocus) return null;
        const match = (this.plugin.settings.books || []).find(book =>
            normalizePath((book.sourceFolder || '').trim()) === normalizedFocus
        );
        const title = match?.title?.trim();
        return title && title.length > 0 ? title : null;
    }

    private getFocusLabel(): string {
        if (this.guidanceState === 'not-configured') return '?';
        if (this.guidanceState === 'no-scenes') return '?';
        if (this.state.scope === 'saga') {
            return String.fromCharCode(931);
        }
        return this.getFocusBookLabel();
    }

    private getFocusId(): string {
        if (this.state.scope === 'saga') return 'saga';
        if (this.state.focusBookId) return this.state.focusBookId;
        return this.corpus?.books?.[0]?.id ?? 'book';
    }

    private buildFocusHoverText(): string {
        const label = this.getFocusLabel();
        const scopeLabel = this.state.scope === 'saga' ? 'Saga focus' : 'Book focus';
        return `${scopeLabel}: ${label}. No inquiry run yet.`;
    }

    private buildRingHoverText(ring: InquiryMode): string {
        if (!this.state.activeResult) {
            return `${ring === 'flow' ? 'Flow' : 'Depth'} verdict unavailable. Run an inquiry.`;
        }
        const verdict = this.state.activeResult.verdict;
        const score = ring === 'flow' ? verdict.flow : verdict.depth;
        return `${ring === 'flow' ? 'Flow' : 'Depth'} score ${this.formatMetricDisplay(score)}. Impact ${verdict.impact}. Assessment confidence ${verdict.assessmentConfidence}.`;
    }

    private buildZoneHoverText(zone: InquiryZone): string {
        const label = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        if (!this.state.activeResult) {
            return `${label} verdict unavailable. Run an inquiry.`;
        }
        if (this.state.activeZone !== zone) {
            return `${label} verdict unavailable for the current inquiry.`;
        }
        return `${label}: ${this.getResultSummaryForMode(this.state.activeResult, this.state.mode)}`;
    }

    private buildMinimapHoverText(label: string): string {
        return label;
    }

    private handleMinimapHover(item: InquiryCorpusItem, label: string, displayLabel?: string): void {
        const hoverLabel = displayLabel || label;
        const result = this.state.activeResult;
        if (!result || this.isErrorResult(result)) {
            this.hideSceneDossier();
            this.setHoverText(this.buildMinimapHoverText(hoverLabel));
            return;
        }
        const finding = this.resolveFindingForMinimapHover(item, label, hoverLabel, result);
        if (!finding) {
            this.hideSceneDossier();
            this.setHoverText(this.buildMinimapHoverText(hoverLabel));
            return;
        }
        this.setHoverText('');
        this.showSceneDossier(this.buildSceneDossierModel(item, label, hoverLabel, finding));
    }

    private resolveFindingForMinimapHover(
        item: InquiryCorpusItem,
        label: string,
        hoverLabel: string,
        result: InquiryResult
    ): InquiryFinding | null {
        const items = this.getResultItems(result);
        const hitMap = this.buildHitFindingMap(result, items);
        const directMatch = hitMap.get(label)
            || hitMap.get(hoverLabel)
            || hitMap.get(item.displayLabel);
        if (directMatch) return directMatch;

        const ordered = this.getOrderedFindings(result, result.mode || this.state.mode);
        const candidateKeys = new Set<string>([
            label.toLowerCase(),
            hoverLabel.toLowerCase(),
            item.displayLabel.toLowerCase(),
            item.id.toLowerCase(),
            ...(item.sceneId ? [item.sceneId.toLowerCase()] : []),
            ...(item.filePaths ?? []).map(path => path.toLowerCase())
        ]);
        for (const finding of ordered) {
            if (!this.isFindingHit(finding)) continue;
            const refId = finding.refId?.trim().toLowerCase();
            if (refId && candidateKeys.has(refId)) {
                return finding;
            }
            const resolvedLabel = this.resolveFindingChipLabel(finding, result, items)?.toLowerCase();
            if (resolvedLabel && candidateKeys.has(resolvedLabel)) {
                return finding;
            }
        }
        return null;
    }

    private clearResultPreview(): void {
        const hadPreview = this.minimapResultPreviewActive;
        this.hideSceneDossier();
        if (!hadPreview) return;
        this.minimapResultPreviewActive = false;
        if (this.previewLocked) return;
        this.hidePromptPreview(true);
    }

    private buildSceneDossierModel(
        item: InquiryCorpusItem,
        label: string,
        hoverLabel: string,
        finding: InquiryFinding
    ): InquirySceneDossier {
        const header = this.buildSceneDossierHeader(item, label, hoverLabel);
        const bodyLines = this.buildSceneDossierBodyLines(finding);

        const footerParts = [
            `Impact ${finding.impact}`,
            `Confidence ${finding.assessmentConfidence}`
        ];
        if (finding.lens) {
            footerParts.push(`Lens ${finding.lens}`);
        }

        return {
            header,
            bodyLines: bodyLines.slice(0, SCENE_DOSSIER_MAX_BODY_LINES),
            footer: footerParts.join(' · ')
        };
    }

    private buildSceneDossierBodyLines(finding: InquiryFinding): string[] {
        const headline = this.sanitizeDossierText(finding.headline);
        const bullets = (finding.bullets || [])
            .map(entry => this.sanitizeDossierText(entry))
            .filter(Boolean)
            .slice(0, 2);
        const bodyLines: string[] = [];
        if (headline) {
            bodyLines.push(headline);
        }
        if (bullets.length) {
            bullets.forEach(entry => {
                bodyLines.push(`• ${entry}`);
            });
        } else if (!headline) {
            bodyLines.push('Finding text unavailable.');
        }
        return bodyLines.slice(0, SCENE_DOSSIER_MAX_BODY_LINES);
    }

    private buildSceneDossierHeader(item: InquiryCorpusItem, label: string, hoverLabel: string): string {
        const fallbackNumber = this.parseCorpusLabelNumber(label);
        const labelNumber = this.parseCorpusLabelNumber(item.displayLabel) ?? fallbackNumber;
        const itemTitle = this.getMinimapItemTitle(item);
        const cleanTitle = this.stripNumericTitlePrefix(itemTitle);
        if (labelNumber !== null && cleanTitle) {
            return `${labelNumber} ${cleanTitle}`;
        }
        if (labelNumber !== null) {
            return item.displayLabel.toUpperCase().startsWith('B') ? `Book ${labelNumber}` : `Scene ${labelNumber}`;
        }
        return cleanTitle || hoverLabel || `Scene ${label}`;
    }

    private parseCorpusLabelNumber(label?: string): number | null {
        if (!label) return null;
        const match = label.trim().match(/^[A-Za-z](\d+)$/);
        if (!match) return null;
        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private stripNumericTitlePrefix(value: string): string {
        const cleaned = (value || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) return '';
        return cleaned.replace(/^(?:scene\s*)?\d+\s*[-:–—.)]?\s*/i, '').trim();
    }

    private sanitizeDossierText(value?: string): string {
        if (!value) return '';
        return value
            .replace(/\s+/g, ' ')
            .replace(/^(?:[SB]\d+|Scene\s+\d+)\s*[:\-–—]\s*/i, '')
            .trim();
    }

    private showSceneDossier(dossier: InquirySceneDossier): void {
        if (!this.sceneDossierGroup || !this.sceneDossierBg || !this.sceneDossierHeader || !this.sceneDossierBody || !this.sceneDossierFooter) {
            return;
        }
        const maxTextWidth = SCENE_DOSSIER_WIDTH - (SCENE_DOSSIER_SIDE_PADDING * 2);
        const headerY = SCENE_DOSSIER_PADDING_Y + SCENE_DOSSIER_HEADER_SIZE;
        this.sceneDossierHeader.setAttribute('y', String(headerY));
        const headerLines = this.setWrappedSvgText(
            this.sceneDossierHeader,
            dossier.header,
            maxTextWidth,
            2,
            SCENE_DOSSIER_HEADER_LINE_HEIGHT
        );

        const bodyStartY = headerY + (Math.max(headerLines, 1) * SCENE_DOSSIER_HEADER_LINE_HEIGHT) + 10;
        const bodyLineCount = this.setSceneDossierBodyText(
            this.sceneDossierBody,
            dossier.bodyLines.filter(Boolean),
            maxTextWidth,
            SCENE_DOSSIER_MAX_BODY_LINES,
            bodyStartY
        );

        const hasFooter = !!dossier.footer;
        const footerY = bodyStartY + (Math.max(bodyLineCount, 1) * SCENE_DOSSIER_LINE_HEIGHT) + 10;
        this.sceneDossierFooter.classList.toggle('ert-hidden', !hasFooter);
        let footerLines = 0;
        if (hasFooter) {
            this.sceneDossierFooter.setAttribute('y', String(footerY));
            footerLines = this.setWrappedSvgText(
                this.sceneDossierFooter,
                dossier.footer ?? '',
                maxTextWidth,
                2,
                SCENE_DOSSIER_FOOTER_LINE_HEIGHT
            );
        } else {
            this.sceneDossierFooter.textContent = '';
        }

        const contentHeight = hasFooter
            ? footerY + SCENE_DOSSIER_FOOTER_SIZE + SCENE_DOSSIER_PADDING_Y + (Math.max(footerLines, 1) - 1) * SCENE_DOSSIER_FOOTER_LINE_HEIGHT
            : bodyStartY + (Math.max(bodyLineCount, 1) * SCENE_DOSSIER_LINE_HEIGHT) + SCENE_DOSSIER_PADDING_Y;
        this.sceneDossierBg.setAttribute('height', String(Math.max(SCENE_DOSSIER_MIN_HEIGHT, contentHeight)));

        this.sceneDossierGroup.classList.remove('ert-hidden');
        this.minimapResultPreviewActive = true;
        this.rootSvg?.classList.add('is-scene-dossier-active');
    }

    private setSceneDossierBodyText(
        textEl: SVGTextElement,
        lines: string[],
        maxWidth: number,
        maxLines: number,
        startDy: number
    ): number {
        const bodyText = (lines.length ? lines : ['Finding text unavailable.'])
            .map(line => line.trim())
            .filter(Boolean)
            .join(' ');
        textEl.setAttribute('y', '0');
        const lineCount = this.setWrappedSvgText(textEl, bodyText, maxWidth, maxLines, SCENE_DOSSIER_LINE_HEIGHT);
        const firstLine = textEl.firstElementChild;
        if (firstLine instanceof SVGTSpanElement) {
            firstLine.setAttribute('dy', String(startDy));
        }
        return lineCount;
    }

    private hideSceneDossier(): void {
        this.sceneDossierGroup?.classList.add('ert-hidden');
        this.rootSvg?.classList.remove('is-scene-dossier-active');
        this.minimapResultPreviewActive = false;
    }

    private buildHitFindingMap(
        result: InquiryResult | null | undefined,
        items: InquiryCorpusItem[]
    ): Map<string, InquiryFinding> {
        const map = new Map<string, InquiryFinding>();
        if (!result) return map;
        const ordered = this.getOrderedFindings(result, result.mode || this.state.mode);
        ordered.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const label = this.resolveFindingChipLabel(finding, result, items);
            if (!label) return;
            if (map.has(label)) return;
            map.set(label, finding);
        });
        return map;
    }

    private isFindingHit(finding: InquiryFinding): boolean {
        return finding.kind !== 'none';
    }

    private getImpactRank(impact: InquirySeverity): number {
        if (impact === 'high') return 3;
        if (impact === 'medium') return 2;
        return 1;
    }

    private formatMetricDisplay(value: number): string {
        if (!Number.isFinite(value)) return '0';
        if (value > 1) return String(Math.round(value));
        return String(Math.round(value * 100));
    }

    private normalizeMetricValue(value: number): number {
        if (!Number.isFinite(value)) return 0;
        if (value > 1) {
            const clamped = Math.min(Math.max(value, 5), 100);
            return clamped / 100;
        }
        return Math.min(Math.max(value, 0), 1);
    }

    private setHoverText(text: string): void {
        if (this.guidanceState !== 'running') return;
        if (this.hoverTextEl) {
            this.hoverTextEl.textContent = text;
        }
    }

    private clearHoverText(): void {
        if (this.guidanceState !== 'running') return;
        if (this.hoverTextEl) {
            this.hoverTextEl.textContent = '';
        }
    }

    private showPromptPreview(zone: InquiryZone, mode: InquiryMode, question: string): void {
        if (this.previewLocked) return;
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        this.previewGroup.classList.remove('is-error');
        this.setPreviewRunningNoteText('');
        this.previewLast = { zone, question };
        this.updatePromptPreview(zone, mode, question, undefined, undefined, { hideEmpty: true });
        this.previewGroup.classList.add('is-visible');
        this.lastReadinessUiState = this.buildReadinessUiState();
        this.updateMinimapPressureGauge();
    }

    /**
     * Request an estimate snapshot from the service.
     *
     * This is the single entry point for triggering an estimate rebuild.
     * Called on scope change, focus book change, engine change, corpus
     * override toggle, vault file change, and view open.
     *
     * While the snapshot is building, UI shows "Estimating…" via the
     * pending flag in buildReadinessUiState().
     */
    private async requestEstimateSnapshot(): Promise<void> {
        const stats = this.getPayloadStats();
        const engine = this.getResolvedEngine();

        // Blocked engines (e.g. ollama) cannot produce estimates — skip the
        // snapshot request entirely and refresh displays to show the blocked state.
        if (engine.blocked) {
            this.refreshEstimateDisplays();
            return;
        }

        const overrides = this.getCorpusOverrideSummary();
        const manifest = this.buildCorpusManifest('estimate-snapshot');

        this.refreshEstimateDisplays(); // Shows "Estimating…" if snapshot is null

        const service = this.plugin.getInquiryEstimateService();
        const snapshot = await service.requestSnapshot({
            scope: this.state.scope,
            focusBookId: this.state.focusBookId ?? this.corpus?.books?.[0]?.id,
            focusSceneId: this.state.scope === 'book' ? this.state.focusSceneId : undefined,
            focusLabel: this.getFocusLabel(),
            manifest,
            payloadStats: {
                sceneCount: stats.sceneTotal,
                outlineCount: stats.bookOutlineCount + stats.sagaOutlineCount,
                referenceCount: stats.referenceCounts.total,
                evidenceChars: stats.evidenceChars
            },
            runner: this.runner,
            engine,
            overrideSummary: overrides,
            rules: this.getEvidenceRules(),
            mode: this.state.mode,
        });

        if (!snapshot) return; // stale or failed
        this.refreshEstimateDisplays(); // Renders once with final values
    }

    /**
     * Refresh all estimate-consuming UI elements from the service snapshot.
     *
     * Reads the snapshot (or null) and updates:
     *   - Engine panel (readiness strip, popover)
     *   - Minimap pressure gauge
     *   - Preview panel pills (if visible)
     */
    private refreshEstimateDisplays(): void {
        if (this.activeCancelRunModal) return;
        this.syncEngineBadgePulse();
        this.updateMinimapPressureGauge();
        if (this.enginePanelEl && !this.enginePanelEl.classList.contains('ert-hidden')) {
            this.refreshEnginePanel();
        }
        if (!this.previewLocked
            && this.previewGroup?.classList.contains('is-visible')
            && this.previewLast) {
            this.updatePromptPreview(
                this.previewLast.zone,
                this.state.mode,
                this.previewLast.question,
                undefined,
                undefined,
                { hideEmpty: true }
            );
        }
    }

    private hidePromptPreview(immediate = false): void {
        if (this.previewLocked) return;
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const hide = () => {
            this.previewGroup?.classList.remove('is-visible');
        };
        if (immediate) {
            hide();
            return;
        }
        this.previewHideTimer = window.setTimeout(hide, 140);
    }

    private setPreviewRowLabels(labels: string[]): void {
        if (!this.previewRows.length) return;
        this.previewRows.forEach((row, idx) => {
            row.label = labels[idx] ?? row.label;
        });
    }

    private resetPreviewRowLabels(): void {
        if (!this.previewRowDefaultLabels.length) return;
        this.previewRows.forEach((row, idx) => {
            row.label = this.previewRowDefaultLabels[idx] ?? row.label;
        });
    }

    private setPreviewFooterText(text: string): void {
        if (this.previewFooter) {
            this.previewFooter.textContent = text;
        }
    }

    private setPreviewRunningNoteText(text: string): void {
        if (!this.previewRunningNote) return;
        const note = text.trim();
        this.previewRunningNote.textContent = note;
        this.previewRunningNote.classList.toggle('ert-hidden', !note);
    }

    private updateRunProgress(progress: InquiryRunProgressEvent | null): void {
        this.currentRunProgress = progress;
        if (!this.state.isRunning || this.activeCancelRunModal) return;
        this.reconcileRunningEstimate(progress);
        const questionText = this.previewLast?.question || this.getCurrentPromptQuestion() || '';
        this.setPreviewRunningNoteText(this.buildRunningStatusNote(questionText));
        this.setPreviewFooterText('');
        this.updateMinimapPressureGauge();
        this.updateRunningHud();
        this.updateRunningState();
    }

    private formatRunDurationEstimate(minSeconds: number, maxSeconds: number): string {
        const min = Math.max(1, Math.round(minSeconds));
        const max = Math.max(min, Math.round(maxSeconds));
        if (max < 60) {
            if (min === max) {
                return `${min} ${min === 1 ? 'second' : 'seconds'}`;
            }
            return `${min}-${max} seconds`;
        }
        const minMinutes = Math.max(1, Math.round(min / 60));
        const maxMinutes = Math.max(minMinutes, Math.round(max / 60));
        if (minMinutes === maxMinutes) {
            return `${minMinutes} ${minMinutes === 1 ? 'minute' : 'minutes'}`;
        }
        return `${minMinutes}-${maxMinutes} minutes`;
    }

    private estimateRunDurationRange(questionText: string): { minSeconds: number; maxSeconds: number } {
        const readinessUi = this.buildReadinessUiState();
        const passPlan = this.getCurrentPassPlan(readinessUi);
        const estimatedTokens = Math.max(0, readinessUi.estimateInputTokens || 0);
        const totalPasses = Math.max(1, passPlan.displayPassCount || 1);
        const perPassTokens = estimatedTokens > 0
            ? estimatedTokens / totalPasses
            : 0;
        const questionComplexityBoost = Math.min(4, Math.max(0, Math.round((questionText?.trim().length ?? 0) / 90)));
        const perPassMin = 6 + (perPassTokens / 900) + (questionComplexityBoost * 0.5);
        const perPassMax = 12 + (perPassTokens / 550) + questionComplexityBoost;
        const multiPassOverheadMin = Math.max(0, totalPasses - 1) * 5;
        const multiPassOverheadMax = Math.max(0, totalPasses - 1) * 9;
        const minSeconds = Math.max(6, (perPassMin * totalPasses) + multiPassOverheadMin);
        const maxSeconds = Math.max(minSeconds + 6, (perPassMax * totalPasses) + multiPassOverheadMax);
        return {
            minSeconds,
            maxSeconds
        };
    }

    private buildRunningProgressLabel(progress: InquiryRunProgressEvent | null): string {
        if (!progress || progress.totalPasses <= 1) return '';
        return `Pass ${progress.currentPass} of ${progress.totalPasses}.`;
    }

    private buildRunningStageLabel(progress: InquiryRunProgressEvent | null): string {
        if (!progress) return '';
        if (progress.detail?.trim()) return progress.detail.trim();
        if (progress.phase === 'finalizing') return 'Finalizing the result.';
        return 'Waiting for the provider response.';
    }

    private buildRunningStatusNote(questionText: string): string {
        const estimate = this.estimateRunDurationRange(questionText);
        const estimateLabel = this.formatRunDurationEstimate(estimate.minSeconds, estimate.maxSeconds);
        const evidenceMode = this.describeRunEvidenceMode();
        const progressLabel = this.buildRunningProgressLabel(this.currentRunProgress);
        return [
            `Running now (${evidenceMode}). Rough ETA ${estimateLabel}.`,
            progressLabel
        ].filter(Boolean).join(' ');
    }

    private formatElapsedRunClock(elapsedMs: number): string {
        const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    private reconcileRunningEstimate(progress: InquiryRunProgressEvent | null): void {
        if (!progress || this.currentRunElapsedMs <= 0) return;
        if (progress.phase === 'finalizing') {
            this.currentRunEstimatedMaxMs = Math.max(this.currentRunElapsedMs, 1000);
            return;
        }
        const completedPasses = Math.max(0, Math.min(progress.totalPasses, progress.currentPass - 1));
        if (completedPasses <= 0 || progress.totalPasses <= 0) return;
        const observedMsPerPass = this.currentRunElapsedMs / completedPasses;
        const remainingPasses = Math.max(1, progress.totalPasses - completedPasses);
        const projectedTotalMs = this.currentRunElapsedMs + (observedMsPerPass * remainingPasses);
        this.currentRunEstimatedMaxMs = Math.max(this.currentRunElapsedMs + 1000, Math.round(projectedTotalMs));
    }

    private getRunningBackboneProgressRatio(elapsedMs: number): number {
        const estimateMaxMs = Math.max(1000, this.currentRunEstimatedMaxMs || 0);
        const timeRatio = estimateMaxMs > 0 ? Math.min(1, Math.max(0, elapsedMs / estimateMaxMs)) : 0;
        const progress = this.currentRunProgress;
        if (!progress) return timeRatio;
        if (progress.phase === 'finalizing') return 1;
        const completedPassRatio = progress.totalPasses > 0
            ? Math.max(0, Math.min(1, (progress.currentPass - 1) / progress.totalPasses))
            : 0;
        return Math.max(timeRatio, completedPassRatio);
    }

    private updateRunningHudFrame(elapsedMs: number): void {
        if (!this.state.isRunning) return;
        this.currentRunElapsedMs = elapsedMs;
        this.updateRunningHud();
        this.minimap.setRunningBackboneProgress(this.getRunningBackboneProgressRatio(elapsedMs));
    }

    private updateRunningHud(): void {
        if (this.engineTimerLabel) {
            const isRunning = this.state.isRunning;
            this.engineTimerLabel.classList.toggle('ert-hidden', !isRunning);
            this.engineTimerLabel.textContent = isRunning
                ? this.formatElapsedRunClock(this.currentRunElapsedMs)
                : '';
        }
        if (this.state.isRunning && this.navSessionLabel) {
            this.navSessionLabel.textContent = this.buildRunningStageLabel(this.currentRunProgress) || 'Waiting for the provider response.';
        }
    }

    private describeRunEvidenceMode(): string {
        const stats = this.getPayloadStats();
        const summaryCount = stats.sceneSynopsisUsed + stats.bookOutlineSummaryCount + stats.sagaOutlineSummaryCount;
        const bodyCount = stats.sceneFullTextCount + stats.bookOutlineFullCount + stats.sagaOutlineFullCount;
        if (summaryCount > 0 && bodyCount === 0) return 'Summary evidence';
        if (bodyCount > 0 && summaryCount === 0) return 'Body evidence';
        if (summaryCount > 0 && bodyCount > 0) return 'Mixed evidence';
        return 'Corpus evidence';
    }

    private async promptCancelInquiryRun(questionText: string): Promise<boolean> {
        const estimate = this.estimateRunDurationRange(questionText);
        const estimateLabel = this.formatRunDurationEstimate(estimate.minSeconds, estimate.maxSeconds);
        return await new Promise<boolean>(resolve => {
            const modal = new InquiryCancelRunModal(
                this.app,
                estimateLabel,
                confirmed => resolve(confirmed),
                () => {
                    if (this.activeCancelRunModal === modal) {
                        this.activeCancelRunModal = undefined;
                    }
                    this.refreshEstimateDisplays();
                    if (this.state.isRunning) {
                        this.updateRunProgress(this.currentRunProgress);
                    }
                }
            );
            this.activeCancelRunModal = modal;
            modal.open();
        });
    }

    private async handleRunningPreviewCancelClick(): Promise<void> {
        if (!this.state.isRunning) return;
        if (!this.activeInquiryRunToken) {
            this.notifyInteraction('Cancel is available for active single-question Inquiry runs.');
            return;
        }
        const questionText = this.previewLast?.question
            || this.getCurrentPromptQuestion()
            || '';
        const confirmed = await this.promptCancelInquiryRun(questionText);
        if (!confirmed) return;
        this.requestActiveInquiryCancellation();
    }

    private updatePromptPreview(
        zone: InquiryZone,
        mode: InquiryMode,
        question: string,
        rowsOverride?: string[],
        metaOverride?: string,
        layoutOptions?: { hideEmpty?: boolean }
    ): void {
        if (!this.previewGroup || !this.previewHero) return;
        ['setup', 'pressure', 'payoff'].forEach(zoneName => {
            this.previewGroup?.classList.remove(`is-zone-${zoneName}`);
        });
        this.previewGroup.classList.add(`is-zone-${zone}`);
        const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        const modeLabel = mode === 'flow' ? 'Flow' : 'Depth';
        const heroTargetLines = 3;
        const heroBaseWidth = this.minimap.layoutLength ?? (PREVIEW_PANEL_WIDTH - (PREVIEW_PANEL_PADDING_X * 2));
        const contentOffsetY = this.state.isRunning ? PREVIEW_RUNNING_CONTENT_OFFSET_Y : 0;
        this.previewHero.setAttribute('y', String(PREVIEW_PANEL_PADDING_Y + contentOffsetY));
        let heroLines = this.setBalancedHeroText(
            this.previewHero,
            question,
            heroBaseWidth,
            PREVIEW_HERO_LINE_HEIGHT,
            PREVIEW_HERO_MAX_LINES
        );
        if (heroLines > heroTargetLines) {
            const stageHeroWidth = Math.min(
                VIEWBOX_SIZE - (PREVIEW_PANEL_PADDING_X * 2),
                VIEWBOX_SIZE * 0.9
            );
            const expandedWidth = Math.max(heroBaseWidth, stageHeroWidth);
            heroLines = this.setBalancedHeroText(
                this.previewHero,
                question,
                expandedWidth,
                PREVIEW_HERO_LINE_HEIGHT,
                heroTargetLines
            );
        }
        if (this.previewMeta) {
            const metaY = PREVIEW_PANEL_PADDING_Y + contentOffsetY + (heroLines * PREVIEW_HERO_LINE_HEIGHT) + PREVIEW_META_GAP;
            const metaText = metaOverride ?? `${zoneLabel} + ${modeLabel}`.toUpperCase();
            this.previewMeta.textContent = metaText;
            this.previewMeta.setAttribute('y', String(metaY));
        }

        const detailStartY = PREVIEW_PANEL_PADDING_Y
            + contentOffsetY
            + (heroLines * PREVIEW_HERO_LINE_HEIGHT)
            + PREVIEW_META_GAP
            + PREVIEW_META_LINE_HEIGHT
            + PREVIEW_DETAIL_GAP;
        const rows = rowsOverride ?? this.getPreviewPayloadRows();

        const rowCount = this.layoutPreviewPills(detailStartY, rows, layoutOptions);
        const rowsBlockHeight = rowCount
            ? (rowCount * PREVIEW_PILL_HEIGHT) + ((rowCount - 1) * PREVIEW_PILL_GAP_Y)
            : 0;
        const footerY = detailStartY + rowsBlockHeight + PREVIEW_FOOTER_GAP;
        if (this.previewFooter) {
            this.previewFooter.setAttribute('y', String(footerY));
        }
        this.previewPanelHeight = footerY + PREVIEW_FOOTER_HEIGHT;
        this.updatePreviewShimmerLayout();
        if (this.previewShimmerGroup) {
            this.updatePreviewShimmerText();
        }
        this.syncTokensPillState();
        if (this.enginePanelEl && !this.enginePanelEl.classList.contains('ert-hidden')) {
            this.refreshEnginePanel();
        }
    }

    private showResultsPreview(result: InquiryResult): void {
        if (!this.previewGroup || !this.previewHero) return;
        if (this.isErrorResult(result)) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const zone = result.questionZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        const mode = this.state.mode;
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-results');
        this.previewGroup.classList.remove('is-locked', 'is-error');
        this.setPreviewRunningNoteText('');
        const hero = this.buildResultsHeroText(result, mode);
        const meta = this.buildResultsMetaText(result, mode, zone);
        const emptyRows = Array(this.previewRows.length || 6).fill('');
        this.resetPreviewRowLabels();
        this.updatePromptPreview(zone, mode, hero, emptyRows, meta, { hideEmpty: true });
        const scopeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
        const focusLabel = result.focusId || this.getFocusLabel();
        this.setPreviewFooterText(`Focus ${scopeLabel} ${focusLabel} · Click to dismiss.`);
        this.updateResultsFooterPosition();
    }

    private buildResultsHeroText(result: InquiryResult, mode: InquiryMode): string {
        return this.getResultSummaryForMode(result, mode);
    }

    private buildResultsMetaText(result: InquiryResult, mode: InquiryMode, zone: InquiryZone): string {
        const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        const flowText = `Flow ${this.formatMetricDisplay(result.verdict.flow)}`;
        const depthText = `Depth ${this.formatMetricDisplay(result.verdict.depth)}`;
        const ordered = mode === 'flow' ? [flowText, depthText] : [depthText, flowText];
        return `${zoneLabel} · ${ordered.join(' · ')}`.toUpperCase();
    }

    private getResultItems(result: InquiryResult): InquiryCorpusItem[] {
        if (!this.corpus) return [];
        return result.scope === 'saga' ? this.corpus.books : this.corpus.scenes;
    }

    private resolveFindingChipLabel(
        finding: InquiryFinding,
        result: InquiryResult,
        items: InquiryCorpusItem[]
    ): string | null {
        const refId = finding.refId?.trim();
        if (!refId) return null;
        const refLower = refId.toLowerCase();

        const displayMatch = items.find(item => item.displayLabel.toLowerCase() === refLower);
        if (displayMatch) return displayMatch.displayLabel;

        const idMatch = items.find(item => item.id === refId || item.id.toLowerCase() === refLower);
        if (idMatch) return idMatch.displayLabel;

        const sceneIdMatch = items.find(item => typeof item.sceneId === 'string' && item.sceneId.toLowerCase() === refLower);
        if (sceneIdMatch) return sceneIdMatch.displayLabel;

        const pathMatch = items.find(item => item.filePaths?.some(path => path === refId));
        if (pathMatch) return pathMatch.displayLabel;

        const scopePrefix = result.scope === 'saga' ? 'B' : 'S';
        const pattern = new RegExp(`^${scopePrefix}\\d+$`, 'i');
        if (pattern.test(refId)) {
            return refId.toUpperCase();
        }

        return null;
    }

    private sanitizeInquirySummary(rawSummary?: string | null): string {
        const fallback = 'Summary unavailable.';
        if (!rawSummary) return fallback;
        let text = String(rawSummary).replace(/\s+/g, ' ').trim();
        if (!text) return fallback;
        const prefixes: RegExp[] = [
            /^(summary(?: of)?|executive summary)\s*/i,
            /^(here(?:'s| is) (?:a )?(?:summary|overview)(?: of)?)\s*/i,
            /^(a (?:summary|overview) of)\s*/i,
            /^(in summary|overall|in conclusion|to summarize|to sum up|in short|in brief|in essence|in overview)\s*/i,
            /^(this (?:inquiry|analysis|assessment|report|result)s?)(?:\s+(?:suggests|shows|indicates|points|implies|reveals|finds|highlights|notes))?(?:\s+that)?\s*/i,
            /^(the (?:inquiry|analysis|assessment|results?) (?:suggests|shows|indicates|points|implies|reveals|finds|highlights|notes))(?:\s+that)?\s*/i,
            /^(based on (?:the|this) (?:inquiry|analysis|assessment|results?))\s*/i,
            /^(it (?:appears|seems|looks))(?:\s+that)?\s*/i
        ];

        let changed = true;
        while (changed) {
            changed = false;
            for (const prefix of prefixes) {
                const next = text.replace(prefix, '').trim();
                if (next !== text) {
                    text = next.replace(/^[^\w\s]+/, '').trim();
                    changed = true;
                    break;
                }
            }
        }

        return text || fallback;
    }

    private getResultSummaryForMode(result: InquiryResult, mode: InquiryMode): string {
        const raw = mode === 'flow'
            ? (result.summaryFlow || result.summary)
            : (result.summaryDepth || result.summary);
        return this.sanitizeInquirySummary(raw);
    }

    private getOrderedFindings(result: InquiryResult, mode: InquiryMode): InquiryFinding[] {
        const findings = result.findings.filter(finding => this.isFindingHit(finding));
        const order = mode === 'flow' ? FLOW_FINDING_ORDER : DEPTH_FINDING_ORDER;
        const rankForLens = (lens: InquiryFinding['lens'] | undefined): number => {
            if (!lens) return 2;
            if (lens === 'both') return 1;
            return lens === mode ? 0 : 3;
        };
        const rankForKind = (kind: InquiryFinding['kind']): number => {
            const idx = order.indexOf(kind);
            return idx >= 0 ? idx : order.length + 1;
        };
        return findings.slice().sort((a, b) => {
            const lensDelta = rankForLens(a.lens) - rankForLens(b.lens);
            if (lensDelta !== 0) return lensDelta;
            const kindDelta = rankForKind(a.kind) - rankForKind(b.kind);
            if (kindDelta !== 0) return kindDelta;
            const impactDelta = this.getImpactRank(b.impact) - this.getImpactRank(a.impact);
            if (impactDelta !== 0) return impactDelta;
            const confidenceDelta = this.getConfidenceRank(b.assessmentConfidence) - this.getConfidenceRank(a.assessmentConfidence);
            if (confidenceDelta !== 0) return confidenceDelta;
            return this.normalizeInquiryHeadline(a.headline).localeCompare(this.normalizeInquiryHeadline(b.headline));
        });
    }

    private getConfidenceRank(confidence: InquiryConfidence): number {
        if (confidence === 'high') return 3;
        if (confidence === 'medium') return 2;
        return 1;
    }

    private truncatePreviewValue(value: string, maxChars: number): string {
        const trimmed = value.trim();
        if (trimmed.length <= maxChars) return trimmed;
        return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
    }

    private setBalancedHeroText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        lineHeight: number,
        maxLines = 2
    ): number {
        clearSvgChildren(textEl);
        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) return 0;
        const fullLine = words.join(' ');
        textEl.textContent = fullLine;
        const fullWidth = textEl.getComputedTextLength();
        if (fullWidth <= maxWidth) {
            return 1;
        }
        if (maxLines <= 1) {
            return this.setWrappedSvgText(textEl, text, maxWidth, 1, lineHeight);
        }

        const minWordsPerLine = 3;
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;
        let bestWidths: { width1: number; width2: number } | null = null;
        for (let i = minWordsPerLine; i <= words.length - minWordsPerLine; i += 1) {
            const line1 = words.slice(0, i).join(' ');
            const line2 = words.slice(i).join(' ');
            textEl.textContent = line1;
            const width1 = textEl.getComputedTextLength();
            textEl.textContent = line2;
            const width2 = textEl.getComputedTextLength();
            const overflow = Math.max(0, width1 - maxWidth) + Math.max(0, width2 - maxWidth);
            const score = Math.abs(width1 - width2) + (overflow * 3);
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
                bestWidths = { width1, width2 };
            }
        }

        if (bestIndex < 0 || !bestWidths) {
            return this.setWrappedSvgText(textEl, text, maxWidth, maxLines, lineHeight);
        }

        if (bestWidths.width1 > maxWidth || bestWidths.width2 > maxWidth) {
            return this.setWrappedSvgText(textEl, text, maxWidth, maxLines, lineHeight);
        }

        clearSvgChildren(textEl);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            const tspan = createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', isFirst ? '0' : String(lineHeight));
            tspan.textContent = content;
            textEl.appendChild(tspan);
            return tspan;
        };

        const line1 = words.slice(0, bestIndex).join(' ');
        const line2 = words.slice(bestIndex).join(' ');
        appendTspan(line1, true);
        appendTspan(line2, false);
        return 2;
    }

    private ensurePreviewShimmerResources(panel: SVGGElement): void {
        if (this.previewShimmerMask) return;

        // Gradient for the shimmer band
        // Gradients usually live in defs, which is fine. CSS addressing of the rect using the url(#grad) doesn't require the gradient to be in the same scope, just available.
        if (this.svgDefs && !this.svgDefs.querySelector('#ert-inquiry-preview-shimmer-grad')) {
            const gradient = createSvgElement('linearGradient');
            gradient.setAttribute('id', 'ert-inquiry-preview-shimmer-grad');
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%');
            gradient.setAttribute('y2', '0%');
            const stops = [
                { offset: '0%', opacity: '0' },
                { offset: '10%', opacity: '0.08' },
                { offset: '25%', opacity: '0.4' },
                { offset: '50%', opacity: '1' },
                { offset: '75%', opacity: '0.4' },
                { offset: '90%', opacity: '0.08' },
                { offset: '100%', opacity: '0' }
            ];
            stops.forEach(stopDef => {
                const stop = createSvgElement('stop');
                stop.setAttribute('offset', stopDef.offset);
                stop.setAttribute('stop-color', '#fff'); // White mask = reveal
                stop.setAttribute('stop-opacity', stopDef.opacity);
                gradient.appendChild(stop);
            });
            this.svgDefs.appendChild(gradient);
        }

        // Mask that contains the moving/animating rect
        const mask = createSvgElement('mask');
        mask.setAttribute('id', 'ert-inquiry-preview-shimmer-mask');
        mask.setAttribute('maskUnits', 'userSpaceOnUse');

        // The moving band
        const band = createSvgElement('rect');
        band.classList.add('ert-inquiry-preview-shimmer-band'); // New class for the band
        band.setAttribute('fill', 'url(#ert-inquiry-preview-shimmer-grad)');
        // Initial values, will be updated by layout
        band.setAttribute('x', '0');
        band.setAttribute('y', '0');
        band.setAttribute('width', '100');
        band.setAttribute('height', '100');

        mask.appendChild(band);
        this.previewShimmerMask = mask;
        this.previewShimmerMaskRect = band;
        // Append mask to panel so its children can be targeted by CSS selectors scoped to the panel
        panel.appendChild(mask);
    }

    private updatePreviewShimmerText(): void {
        if (!this.previewShimmerGroup) return;
        clearSvgChildren(this.previewShimmerGroup);
        const textNodes: SVGTextElement[] = [];
        if (this.previewHero) textNodes.push(this.previewHero);
        textNodes.forEach(node => {
            const clone = node.cloneNode(true) as SVGTextElement;
            clone.setAttribute('fill', '#fff');
            clone.setAttribute('opacity', '1');
            this.previewShimmerGroup?.appendChild(clone);
        });
    }

    private updatePreviewShimmerLayout(): void {
        if (!this.previewShimmerMaskRect || !this.previewShimmerGroup) return;
        const height = Math.max(this.previewPanelHeight, PREVIEW_PILL_HEIGHT * 2);
        const startX = (-PREVIEW_PANEL_WIDTH / 2) - PREVIEW_SHIMMER_OVERHANG;
        const maskWidth = PREVIEW_PANEL_WIDTH + (PREVIEW_SHIMMER_OVERHANG * 2);

        // Update the white text overlay group (if it needs layout updates? No, it's just children)
        // Actually, the group is in the panel, so it inherits panel transform.

        if (this.previewShimmerMask) {
            this.previewShimmerMask.setAttribute('x', String(startX));
            this.previewShimmerMask.setAttribute('y', '0');
            this.previewShimmerMask.setAttribute('width', String(maskWidth));
            this.previewShimmerMask.setAttribute('height', String(height));
        }

        // Update the mask rect
        this.previewShimmerMaskRect.setAttribute('x', String(startX));
        this.previewShimmerMaskRect.setAttribute('y', '0');
        this.previewShimmerMaskRect.setAttribute('width', String(PREVIEW_SHIMMER_WIDTH));
        this.previewShimmerMaskRect.setAttribute('height', String(height));

        // Set the css variable for travel on the MASK RECT
        this.previewShimmerMaskRect.style.setProperty(
            '--ert-inquiry-shimmer-travel',
            `${Math.max(0, maskWidth - PREVIEW_SHIMMER_WIDTH)}px`
        );

        this.updatePreviewClickTargetLayout();
    }

    private updateResultsFooterPosition(targetY?: number): void {
        if (!this.previewFooter || !this.previewGroup) return;
        if (!this.previewGroup.classList.contains('is-results')) return;
        const panelY = targetY ?? this.getPreviewPanelTargetY();
        if (!Number.isFinite(panelY)) return;
        const backboneBottom = this.minimap.backboneBottomEdge;
        const footerY = (MINIMAP_GROUP_Y + backboneBottom + PREVIEW_RESULTS_FOOTER_OFFSET) - panelY;
        this.previewFooter.setAttribute('y', footerY.toFixed(2));
        this.updatePreviewClickTargetLayout();
    }

    private updatePreviewClickTargetLayout(): void {
        if (!this.previewClickTarget) return;
        const baseHeight = Math.max(this.previewPanelHeight, PREVIEW_PILL_HEIGHT * 2);
        const startX = -PREVIEW_PANEL_WIDTH / 2;
        let startY = 0;
        let height = baseHeight;
        if (this.state.isRunning && this.previewRunningNote && !this.previewRunningNote.classList.contains('ert-hidden')) {
            const noteTop = Number(this.previewRunningNote.getAttribute('y') ?? '-24');
            if (Number.isFinite(noteTop)) {
                startY = Math.min(startY, noteTop);
                height = Math.max(height, baseHeight - startY);
            }
        }
        if (this.previewFooter && this.previewGroup?.classList.contains('is-results')) {
            const footerY = Number(this.previewFooter.getAttribute('y') ?? '0');
            if (Number.isFinite(footerY)) {
                const minY = Math.min(0, footerY);
                const maxY = Math.max(baseHeight, footerY + PREVIEW_FOOTER_HEIGHT);
                startY = minY;
                height = maxY - minY;
            }
        }
        this.previewClickTarget.setAttribute('x', String(startX));
        this.previewClickTarget.setAttribute('y', String(startY));
        this.previewClickTarget.setAttribute('width', String(PREVIEW_PANEL_WIDTH));
        this.previewClickTarget.setAttribute('height', String(height));
    }

    private lockPromptPreview(question: InquiryQuestion): void {
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const rows = this.getPreviewPayloadRows();
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-locked');
        this.previewGroup.classList.remove('is-results');
        this.previewGroup.classList.remove('is-error');
        this.setPreviewRunningNoteText(this.buildRunningStatusNote(question.question));
        this.setPreviewFooterText('');
        this.resetPreviewRowLabels();
        this.updatePromptPreview(question.zone, this.state.mode, question.question, rows, undefined, { hideEmpty: true });
        this.lastReadinessUiState = this.buildReadinessUiState();
        this.updateMinimapPressureGauge();
    }

    private unlockPromptPreview(): void {
        this.previewLocked = false;
        this.currentRunProgress = null;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        if (this.previewGroup) {
            this.previewGroup.classList.remove('is-locked', 'is-visible', 'is-results');
            this.previewGroup.classList.remove('is-error');
        }
        this.resetPreviewRowLabels();
        this.setPreviewRunningNoteText('');
        this.setPreviewFooterText('');
        this.lastReadinessUiState = undefined;
        this.updateMinimapPressureGauge();
    }

    private layoutPreviewPills(startY: number, values: string[], options?: { hideEmpty?: boolean }): number {
        const items: Array<{ row: InquiryPreviewRow; width: number }> = [];
        this.previewRows.forEach((row, index) => {
            const value = values[index] ?? '';
            const isEmpty = !value.trim();
            if (options?.hideEmpty && isEmpty) {
                row.group.classList.add('ert-hidden');
                clearSvgChildren(row.text);
                return;
            }
            row.group.classList.remove('ert-hidden');
            this.setPreviewPillText(row, value);
            const textWidth = row.text.getComputedTextLength();
            const width = Math.ceil(textWidth + (PREVIEW_PILL_PADDING_X * 2));
            row.bg.setAttribute('width', String(width));
            row.bg.setAttribute('height', String(PREVIEW_PILL_HEIGHT));
            row.bg.setAttribute('rx', String(PREVIEW_PILL_HEIGHT / 2));
            row.bg.setAttribute('ry', String(PREVIEW_PILL_HEIGHT / 2));
            row.bg.setAttribute('x', '0');
            row.bg.setAttribute('y', '0');
            items.push({ row, width });
        });

        if (!items.length) return 0;
        const maxRowWidth = PREVIEW_PANEL_WIDTH - (PREVIEW_PANEL_PADDING_X * 2);
        const splitIndex = items.length > 3 ? this.pickPillSplit(items.map(item => item.width), maxRowWidth) : items.length;
        const rows = [
            items.slice(0, splitIndex),
            items.slice(splitIndex)
        ].filter(row => row.length);

        rows.forEach((row, rowIndex) => {
            const widths = row.map(item => item.width);
            const totalWidth = widths.reduce((sum, value) => sum + value, 0);
            const gap = this.computePillGap();
            const rowWidth = totalWidth + gap * (row.length - 1);
            let cursor = -rowWidth / 2;
            const rowY = startY + (rowIndex * (PREVIEW_PILL_HEIGHT + PREVIEW_PILL_GAP_Y));
            row.forEach((item, idx) => {
                item.row.group.setAttribute('transform', `translate(${cursor.toFixed(2)} ${rowY.toFixed(2)})`);
                cursor += widths[idx] + gap;
            });
        });

        return rows.length;
    }

    private setPreviewPillText(row: InquiryPreviewRow, value: string): void {
        clearSvgChildren(row.text);
        const labelText = row.label?.trim() ?? '';
        if (labelText) {
            const label = createSvgElement('tspan');
            label.classList.add('ert-inquiry-preview-pill-label');
            label.textContent = value ? `${labelText} ` : labelText;
            row.text.appendChild(label);
        }
        if (!value) return;
        const detail = createSvgElement('tspan');
        detail.classList.add('ert-inquiry-preview-pill-value');
        detail.textContent = value;
        row.text.appendChild(detail);
    }

    private syncTokensPillState(): void {
        if (!this.previewRows.length) return;
        this.previewRows.forEach(row => {
            row.group.classList.remove('is-token-amber', 'is-token-red');
            row.group.removeAttribute('data-rt-tip');
            row.group.removeAttribute('data-rt-tip-placement');
        });
        if (this.previewGroup?.classList.contains('is-results')) return;
        const tokensRow = this.previewRows.find(row => row.group.classList.contains('is-tokens-slot'));
        if (!tokensRow) return;
    }

    private pickPillSplit(widths: number[], maxWidth: number): number {
        const total = widths.length;
        let bestIndex = Math.ceil((total + 1) / 2);
        let bestScore = Number.POSITIVE_INFINITY;
        const computeRowWidth = (slice: number[]): number => {
            if (!slice.length) return 0;
            const rowTotal = slice.reduce((sum, value) => sum + value, 0);
            const gap = this.computePillGap();
            return rowTotal + gap * (slice.length - 1);
        };

        const totalRowWidth = computeRowWidth(widths);
        const targetRowWidth = totalRowWidth * 0.6;

        for (let i = 1; i < total; i += 1) {
            const row1Count = i;
            const row2Count = total - i;

            const row1Width = computeRowWidth(widths.slice(0, i));
            const row2Width = computeRowWidth(widths.slice(i));

            const overflow = Math.max(0, row1Width - maxWidth) + Math.max(0, row2Width - maxWidth);
            const orderPenalty = row1Width < row2Width ? 180 : 0;
            const score = Math.abs(row1Width - targetRowWidth) + (overflow * 8) + orderPenalty;
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    private computePillGap(): number {
        return PREVIEW_PILL_GAP_X;
    }

    private setWrappedSvgText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        maxLines: number,
        lineHeight: number
    ): number {
        clearSvgChildren(textEl);
        const words = text.split(/\s+/).filter(Boolean);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            const tspan = createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', isFirst ? '0' : String(lineHeight));
            tspan.textContent = content;
            textEl.appendChild(tspan);
            return tspan;
        };

        let line = '';
        let lineIndex = 0;
        let tspan = appendTspan('', true);
        let truncated = false;

        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            tspan.textContent = testLine;
            if (tspan.getComputedTextLength() > maxWidth && line) {
                tspan.textContent = line;
                lineIndex += 1;
                if (lineIndex >= maxLines) {
                    truncated = true;
                    break;
                }
                line = word;
                tspan = appendTspan(line, false);
            } else {
                line = testLine;
            }
        }

        if (!truncated) {
            tspan.textContent = line;
            return Math.max(lineIndex + 1, 1);
        }

        tspan.textContent = line;
        this.applyEllipsis(tspan, maxWidth);
        return maxLines;
    }

    private applyEllipsis(tspan: SVGTSpanElement, maxWidth: number): void {
        let content = tspan.textContent ?? '';
        if (!content.length) return;
        let next = `${content}…`;
        tspan.textContent = next;
        while (tspan.getComputedTextLength() > maxWidth && content.length > 1) {
            content = content.slice(0, -1).trimEnd();
            next = `${content}…`;
            tspan.textContent = next;
        }
    }

    private refreshPayloadStats(): void {
        this.payloadStats = this.buildPayloadStats();
        if (this.corpusWarningActive) {
            const stats = this.payloadStats;
            const total = stats.sceneTotal
                + stats.bookOutlineCount
                + stats.sagaOutlineCount
                + stats.referenceCounts.total;
            if (total > 0) {
                this.corpusWarningActive = false;
            }
        }
        if (!this.previewLocked
            && this.previewGroup?.classList.contains('is-visible')
            && this.previewLast) {
            this.updatePromptPreview(
                this.previewLast.zone,
                this.state.mode,
                this.previewLast.question,
                undefined,
                undefined,
                { hideEmpty: true }
            );
        }
    }

    private getPayloadStats(): InquiryPayloadStats {
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        if (!this.payloadStats
            || this.payloadStats.scope !== this.state.scope
            || this.payloadStats.focusBookId !== focusBookId) {
            this.payloadStats = this.buildPayloadStats();
        }
        return this.payloadStats;
    }

    private buildPayloadStats(): InquiryPayloadStats {
        const manifest = this.buildCorpusManifest('payload-preview', {
            questionZone: this.previewLast?.zone
        });
        const scope = this.state.scope;
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const sceneEntries = manifest.entries.filter(entry => entry.class === 'scene');
        const outlineEntries = manifest.entries.filter(entry => entry.class === 'outline');
        const referenceEntries = manifest.entries.filter(entry => entry.class !== 'scene' && entry.class !== 'outline');

        const scopedSceneEntries = scope === 'book'
            ? (focusBookId
                ? sceneEntries.filter(entry => entry.path === focusBookId || entry.path.startsWith(`${focusBookId}/`))
                : sceneEntries)
            : sceneEntries;

        const bookOutlineEntries = outlineEntries
            .filter(entry => entry.scope !== 'saga')
            .filter(entry => scope === 'saga' || !focusBookId || entry.path === focusBookId || entry.path.startsWith(`${focusBookId}/`));
        const sagaOutlineEntries = scope === 'saga'
            ? outlineEntries.filter(entry => entry.scope === 'saga')
            : [];

        const sceneStats = this.collectSceneStats(scopedSceneEntries);
        const bookOutlineStats = this.collectEntryStats(bookOutlineEntries);
        const sagaOutlineStats = this.collectEntryStats(sagaOutlineEntries);
        const referenceStats = this.collectReferenceStats(referenceEntries);

        const estimatedEvidenceChars = sceneStats.chars + bookOutlineStats.chars + sagaOutlineStats.chars + referenceStats.chars;
        const priorStats = this.payloadStats
            && this.payloadStats.manifestFingerprint === manifest.fingerprint
            && this.payloadStats.scope === scope
            && this.payloadStats.focusBookId === focusBookId
            ? this.payloadStats
            : undefined;
        const evidenceChars = priorStats?.evidenceChars ?? estimatedEvidenceChars;

        return {
            scope,
            focusBookId,
            sceneTotal: sceneStats.total,
            sceneSynopsisUsed: sceneStats.synopsisUsed,
            sceneSynopsisAvailable: sceneStats.synopsisAvailable,
            sceneFullTextCount: sceneStats.fullCount,
            bookOutlineCount: bookOutlineStats.count,
            bookOutlineSummaryCount: bookOutlineStats.summaryCount,
            bookOutlineFullCount: bookOutlineStats.fullCount,
            sagaOutlineCount: sagaOutlineStats.count,
            sagaOutlineSummaryCount: sagaOutlineStats.summaryCount,
            sagaOutlineFullCount: sagaOutlineStats.fullCount,
            referenceCounts: referenceStats.counts,
            referenceByClass: referenceStats.byClass,
            evidenceChars,
            resolvedRoots: manifest.resolvedRoots,
            manifestFingerprint: manifest.fingerprint
        };
    }

    private collectSceneStats(entries: CorpusManifestEntry[]): {
        total: number;
        synopsisUsed: number;
        synopsisAvailable: number;
        fullCount: number;
        chars: number;
    } {
        let synopsisUsed = 0;
        let synopsisAvailable = 0;
        let fullCount = 0;
        let chars = 0;
        entries.forEach(entry => {
            const summary = this.getEntrySummary(entry.path);
            if (summary) {
                synopsisAvailable += 1;
            }
            const mode = this.normalizeEvidenceMode(entry.mode);
            if (mode === 'summary') {
                if (!summary) return;
                synopsisUsed += 1;
                chars += summary.length;
                return;
            }
            if (mode === 'full') {
                const size = this.getEntryCharCount(entry.path);
                if (!size) return;
                fullCount += 1;
                chars += size;
            }
        });
        return {
            total: entries.length,
            synopsisUsed,
            synopsisAvailable,
            fullCount,
            chars
        };
    }

    private collectEntryStats(entries: CorpusManifestEntry[]): {
        count: number;
        summaryCount: number;
        fullCount: number;
        chars: number;
    } {
        let summaryCount = 0;
        let fullCount = 0;
        let chars = 0;
        entries.forEach(entry => {
            const mode = this.normalizeEvidenceMode(entry.mode);
            if (mode === 'summary') {
                const summary = this.getEntrySummary(entry.path);
                if (!summary) return;
                summaryCount += 1;
                chars += summary.length;
                return;
            }
            if (mode === 'full') {
                const size = this.getEntryCharCount(entry.path);
                if (!size) return;
                fullCount += 1;
                chars += size;
            }
        });
        return {
            count: summaryCount + fullCount,
            summaryCount,
            fullCount,
            chars
        };
    }

    private collectReferenceStats(entries: CorpusManifestEntry[]): {
        counts: { character: number; place: number; power: number; other: number; total: number };
        byClass: Record<string, number>;
        chars: number;
    } {
        const byClass: Record<string, number> = {};
        let chars = 0;
        entries.forEach(entry => {
            const size = this.getEntryContentLength(entry);
            if (!size) return;
            chars += size;
            byClass[entry.class] = (byClass[entry.class] || 0) + 1;
        });
        const character = byClass['character'] ?? 0;
        const place = byClass['place'] ?? 0;
        const power = byClass['power'] ?? 0;
        const total = Object.values(byClass).reduce((sum, value) => sum + value, 0);
        const other = Math.max(0, total - character - place - power);
        return { counts: { character, place, power, other, total }, byClass, chars };
    }

    private getEntryCharCount(path: string): number {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return 0;
        const size = file.stat.size ?? 0;
        return size > 0 ? size : 0;
    }

    private getEntrySummary(path: string): string {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return '';
        const frontmatter = this.getNormalizedFrontmatter(file);
        if (!frontmatter) return '';
        return this.extractSummary(frontmatter);
    }

    private getEntryContentLength(entry: CorpusManifestEntry): number {
        const mode = this.normalizeEvidenceMode(entry.mode);
        if (mode === 'summary') {
            const summary = this.getEntrySummary(entry.path);
            return summary.length;
        }
        if (mode === 'full') {
            return this.getEntryCharCount(entry.path);
        }
        return 0;
    }

    private getNormalizedFrontmatter(file: TFile): Record<string, unknown> | null {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return null;
        return normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
    }

    /**
     * Extract extended Summary from frontmatter for Inquiry context.
     * Reads exclusively from frontmatter["Summary"]. Synopsis is never used.
     */
    private extractSummary(frontmatter: Record<string, unknown>): string {
        const raw = frontmatter['Summary'];
        if (Array.isArray(raw)) {
            return raw.map(value => String(value)).join('\n').trim();
        }
        if (typeof raw === 'string') return raw.trim();
        if (raw === null || raw === undefined) return '';
        return String(raw).trim();
    }

    private getPreviewPayloadRows(): string[] {
        return [
            this.getPreviewScopeValue(),
            this.getPreviewScenesValue(),
            this.getPreviewOutlinesValue(),
            this.getPreviewModelValue(),
            this.getPreviewTokensValue()
        ];
    }

    private getPreviewScopeValue(): string {
        if (this.state.scope === 'saga') return `${SIGMA_CHAR} Saga`;
        return `Book ${this.getFocusLabel()}`;
    }

    private getPreviewScenesValue(): string {
        const stats = this.getPayloadStats();
        if (stats.sceneFullTextCount > 0) {
            return `Scenes · ${stats.sceneFullTextCount} (Body)`;
        }
        if (stats.sceneSynopsisUsed > 0) {
            return `Scenes · ${stats.sceneSynopsisUsed} (Summary)`;
        }
        return '';
    }

    private getPreviewOutlinesValue(): string {
        const stats = this.getPayloadStats();
        const summaryCount = stats.bookOutlineSummaryCount + stats.sagaOutlineSummaryCount;
        const fullCount = stats.bookOutlineFullCount + stats.sagaOutlineFullCount;
        if (fullCount > 0) {
            return `Outline · ${fullCount} (Body)`;
        }
        if (summaryCount > 0) {
            return `Outline · ${summaryCount} (Summary)`;
        }
        return '';
    }

    private getPreviewModelValue(): string {
        return `Model · ${this.getResolvedEngine().modelLabel}`;
    }

    private getPreviewTokensValue(): string {
        const estimate = this.getRTCorpusEstimate();
        if (estimate.estimatedTokens <= 0) return 'Tokens · Estimating…';
        return `Tokens · ~${this.formatTokenEstimate(estimate.estimatedTokens)}`;
    }


    private getTokenTier(inputTokens: number): TokenTier {
        return getTokenTierPure(inputTokens);
    }

    private getTokenTierFromSnapshot(): TokenTier {
        return getTokenTierFromSnapshotPure(this.plugin.getInquiryEstimateService().getSnapshot());
    }

    private estimateTokensFromChars(chars: number): number {
        return estimateTokensFromCharsHeuristic(chars, DEFAULT_CHARS_PER_TOKEN);
    }

    private formatTokenEstimate(value: number): string {
        return formatTokenEstimatePure(value);
    }

    private toggleDetails(): void {
        if (!this.detailsEl || !this.detailsToggle) return;
        const isOpen = !this.detailsEl.classList.contains('ert-hidden');
        this.detailsEl.classList.toggle('ert-hidden', isOpen);
        this.setIconUse(this.detailsIcon, isOpen ? 'chevron-down' : 'chevron-up');
    }

    private toggleHelpTips(): void {
        this.helpTipsEnabled = !this.helpTipsEnabled;
        this.applyHelpTips();
    }

    private applyHelpTips(): void {
        if (this.helpToggleButton) {
            this.helpToggleButton.classList.toggle('is-active', this.helpTipsEnabled);
            this.helpToggleButton.setAttribute('aria-pressed', this.helpTipsEnabled ? 'true' : 'false');
        }
        this.syncHelpTooltips();
    }

    private syncHelpTooltips(): void {
        const targets = this.getHelpTooltipTargets();
        targets.forEach(({ element, text, placement }) => {
            if (!element) return;
            const balancedText = this.balanceTooltipText(text);
            if (this.helpTipsEnabled) {
                addTooltipData(element, balancedText, placement ?? 'bottom');
                return;
            }
            const rtTooltipValue = element.getAttribute('data-rt-tip');
            if (rtTooltipValue === text || rtTooltipValue === balancedText) {
                element.removeAttribute('data-rt-tip');
            }
            element.removeAttribute('data-rt-tip-placement');
        });
    }

    private getHelpTooltipTargets(): Array<{ element?: SVGElement; text: string; placement?: 'top' | 'bottom' | 'left' | 'right' }> {
        return [
            {
                element: this.scopeToggleButton,
                text: 'Toggle between Book and Saga scope.',
                placement: 'bottom'
            },
            {
                element: this.flowRingHit,
                text: 'Switch to Flow lens.',
                placement: 'top'
            },
            {
                element: this.depthRingHit,
                text: 'Switch to Depth lens.',
                placement: 'top'
            },
            {
                element: this.modeIconToggleHit,
                text: 'Toggle flow and depth lens.',
                placement: 'top'
            },
            {
                element: this.glyphHit,
                text: 'Toggle focus ring expansion.',
                placement: 'top'
            },
            {
                element: this.navPrevButton,
                text: 'Previous book.',
                placement: 'top'
            },
            {
                element: this.navNextButton,
                text: 'Next book.',
                placement: 'top'
            }
        ];
    }

    private openReportPreview(): void {
        if (!this.state.activeResult) {
            new Notice('Run an inquiry before previewing a report.');
            return;
        }
        this.state.reportPreviewOpen = true;
        this.updateArtifactPreview();
    }

    private async saveArtifact(): Promise<void> {
        const result = this.state.activeResult;
        if (!result) {
            new Notice('Run an inquiry before saving a brief.');
            return;
        }
        await this.saveBrief(result, {
            openFile: true,
            silent: false,
            sessionKey: this.state.activeSessionId
        });
    }

    private async saveBrief(
        result: InquiryResult,
        options: { openFile: boolean; silent: boolean; sessionKey?: string; logPath?: string }
    ): Promise<string | null> {
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) {
            if (!options.silent) {
                new Notice('Unable to create brief folder.');
            }
            return null;
        }

        const briefTitle = this.formatInquiryBriefTitle(result);
        const baseName = briefTitle;
        const filePath = this.getAvailableArtifactPath(folder.path, baseName);
        const sessionLogPath = options.logPath
            ?? (options.sessionKey ? this.sessionStore.peekSession(options.sessionKey)?.logPath : undefined);
        const content = this.buildArtifactContent(result, sessionLogPath);

        try {
            const file = await this.app.vault.create(filePath, content);
            if (options.openFile) {
                await openOrRevealFile(this.app, file);
            }
            if (!options.silent) {
                new Notice('Inquiry brief saved.');
            }
            if (options.sessionKey) {
                this.sessionStore.updateSession(options.sessionKey, {
                    status: 'saved',
                    briefPath: file.path
                });
            }
            this.updateBriefingButtonState();
            this.refreshBriefingPanel();
            return file.path;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!options.silent) {
                new Notice(`Unable to save brief: ${message}`);
            }
            return null;
        }
    }

    private async buildFallbackTrace(
        input: InquiryRunnerInput,
        note?: string
    ): Promise<InquiryRunTrace> {
        try {
            const trace = await this.runner.buildTrace(input);
            if (note) {
                trace.notes.push(note);
            }
            return trace;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const notes = note ? [note] : [];
            if (message) {
                notes.push(`Trace build error: ${message}`);
            }
            return {
                systemPrompt: '',
                userPrompt: '',
                evidenceText: '',
                tokenEstimate: {
                    inputTokens: Number.NaN,
                    outputTokens: INQUIRY_MAX_OUTPUT_TOKENS,
                    totalTokens: Number.NaN,
                    inputChars: 0,
                    uncertaintyTokens: estimateUncertaintyTokens('heuristic_chars')
                },
                outputTokenCap: INQUIRY_MAX_OUTPUT_TOKENS,
                response: null,
                sanitizationNotes: [],
                notes
            };
        }
    }

    private async saveInquiryLog(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        options?: { sessionKey?: string; normalizationNotes?: string[]; silent?: boolean }
    ): Promise<string | null> {
        const folder = await ensureInquiryLogFolder(this.app);
        const silent = options?.silent ?? true;
        if (!folder) {
            if (!silent) {
                new Notice('Unable to create log folder.');
            }
            return null;
        }

        const logTitle = this.formatInquiryLogTitle(result);
        const filePath = this.getAvailableArtifactPath(folder.path, logTitle);
        const shouldWriteContent = this.plugin.settings.logApiInteractions || this.isErrorResult(result);
        const content = this.buildInquiryLogContent(result, trace, manifest, logTitle, shouldWriteContent);

        let summaryPath: string | null = null;
        try {
            const file = await this.app.vault.create(filePath, content);
            if (options?.sessionKey) {
                this.sessionStore.updateSession(options.sessionKey, {
                    logPath: file.path
                });
            }
            summaryPath = file.path;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                new Notice(`Unable to save inquiry log: ${message}`);
            }
        }

        if (shouldWriteContent) {
            await this.saveInquiryContentLog(result, trace, manifest, {
                normalizationNotes: options?.normalizationNotes,
                silent
            });
        }
        return summaryPath;
    }

    private async saveInquiryContentLog(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        options?: { normalizationNotes?: string[]; silent?: boolean }
    ): Promise<void> {
        const silent = options?.silent ?? true;
        const folder = await ensureInquiryContentLogFolder(this.app);
        if (!folder) {
            if (!silent) {
                new Notice('Unable to create inquiry content log folder.');
            }
            return;
        }

        const logTitle = this.formatInquiryContentLogTitle(result);
        const filePath = this.getAvailableArtifactPath(folder.path, logTitle);
        const content = this.buildInquiryContentLogContent(result, trace, manifest, logTitle, options?.normalizationNotes);

        try {
            await this.app.vault.create(filePath, content);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                new Notice(`Unable to save inquiry content log: ${message}`);
            }
        }
    }

    private buildArtifactContent(
        result: InquiryResult,
        logPath?: string
    ): string {
        const brief = this.buildInquiryBriefModel(result, logPath);
        return this.renderInquiryBrief(brief);
    }

    private buildInquiryBriefModel(result: InquiryResult, logPath?: string): InquiryBriefModel {
        const questionTitle = this.findPromptLabelById(result.questionId) || 'Inquiry Question';
        const questionTextRaw = this.getQuestionTextById(result.questionId);
        const questionText = questionTextRaw && questionTextRaw.trim().length > 0
            ? questionTextRaw
            : 'Question text unavailable.';
        const scopeIndicator = this.resolveInquiryScopeIndicator(result);

        const pills: string[] = [
            `Flow ${this.formatMetricDisplay(result.verdict.flow)}`,
            `Depth ${this.formatMetricDisplay(result.verdict.depth)}`,
            `Impact ${this.formatBriefLabel(result.verdict.impact)}`,
            `Assessment confidence ${this.formatBriefLabel(result.verdict.assessmentConfidence)}`
        ];

        if (result.mode) {
            pills.push(`Mode ${this.formatBriefLabel(result.mode)}`);
        }

        const modelLabel = this.getBriefModelLabel(result);
        if (modelLabel) pills.push(modelLabel);

        const flowSummary = this.getResultSummaryForMode(result, 'flow') || 'No flow summary available.';
        const depthSummary = this.getResultSummaryForMode(result, 'depth') || 'No depth summary available.';

        const orderedFindings = this.getOrderedFindings(result, result.mode);
        const findings = orderedFindings
            .filter(finding => this.isFindingHit(finding))
            .map(finding => ({
                headline: this.normalizeInquiryHeadline(finding.headline),
                clarity: this.formatBriefLabel(finding.status || 'unclear'),
                impact: this.formatBriefLabel(finding.impact),
                confidence: this.formatBriefLabel(finding.assessmentConfidence),
                lens: finding.lens === 'both'
                    ? 'Flow / Depth'
                    : this.formatBriefLabel(finding.lens || result.mode || 'flow'),
                bullets: (finding.bullets || []).filter(Boolean).slice(0, 3)
            }));

        const sourcesVM = buildInquirySourcesViewModel(result.citations, result.evidenceDocumentMeta);
        const sources = sourcesVM.items.map(item => ({
            title: item.title,
            excerpt: item.excerpt,
            classLabel: item.classLabel,
            path: item.path,
            url: item.url
        }));

        const sceneNotes = this.buildInquirySceneNotes(result);
        const pendingActions = this.getPendingInquiryActions(result);
        const logTitle = this.resolveInquiryLogLinkTitle(result, logPath);

        return {
            questionTitle,
            questionText,
            scopeIndicator,
            pills,
            flowSummary,
            depthSummary,
            findings,
            sources,
            sceneNotes,
            pendingActions,
            logTitle
        };
    }

    private renderInquiryBrief(brief: InquiryBriefModel): string {
        const lines: string[] = [];

        lines.push('# Question', '', `**${brief.questionTitle}**`, brief.questionText);
        if (brief.scopeIndicator) {
            lines.push(`Scope: ${brief.scopeIndicator}`);
        }

        lines.push('', '## Summary Pills', brief.pills.map(pill => `[${pill}]`).join(' '));

        lines.push('', '## High-Level Conclusions', '### Flow', brief.flowSummary, '', '### Depth', brief.depthSummary);

        lines.push('', '## Key Findings (Structural Hits)');
        if (!brief.findings.length) {
            lines.push('No structural hits.');
        } else {
            brief.findings.forEach(finding => {
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
        }

        if (brief.sources.length) {
            lines.push('', '## Sources', '');
            brief.sources.forEach(source => {
                const excerptPart = source.excerpt ? ` \u2014 *"${source.excerpt}"*` : '';
                const wikiPath = source.path?.replace(/\.md$/, '');
                const linkPart = (wikiPath && source.classLabel === 'Scene')
                    ? ` \u2014 [[${wikiPath}|Open scene]]`
                    : (source.url ? ` \u2014 [Source](${source.url})` : '');
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
    }

    private resolveInquiryScopeIndicator(result: InquiryResult): string | null {
        const focusId = result.focusId?.trim();
        if (result.scope === 'saga') {
            return focusId && focusId.toLowerCase() !== 'saga' ? `Saga ${focusId}` : 'Saga';
        }
        if (focusId) {
            const lowered = focusId.toLowerCase();
            if (/^s\d+/.test(lowered) || lowered.startsWith('scene')) {
                return `Scene ${focusId}`;
            }
            if (/^c\d+/.test(lowered) || lowered.startsWith('chapter')) {
                return `Chapter ${focusId}`;
            }
            return `Book ${focusId}`;
        }
        return null;
    }

    private formatBriefLabel(value?: string | null): string {
        if (!value) return 'Unknown';
        return value
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    private getBriefModelLabel(result: InquiryResult): string | null {
        const raw = result.aiModelResolved || result.aiModelRequested;
        if (!raw) return null;
        const label = getModelDisplayName(raw.replace(/^models\//, ''));
        return label.replace(/\s*\(.*\)\s*$/, '').trim() || null;
    }

    private buildInquirySceneNotes(result: InquiryResult): Array<{
        label: string;
        header: string;
        anchorId?: string;
        entries: Array<{
            headline: string;
            bullets: string[];
            impact: string;
            confidence: string;
            lens: string;
        }>;
    }> {
        if (result.scope !== 'book') return [];
        const items = this.getResultItems(result);
        const orderedFindings = this.getOrderedFindings(result, result.mode);
        const notes = new Map<string, {
            label: string;
            header: string;
            anchorId?: string;
            order: number;
            entries: Array<{
                headline: string;
                bullets: string[];
                impact: string;
                confidence: string;
                lens: string;
            }>;
        }>();

        orderedFindings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const label = this.resolveFindingChipLabel(finding, result, items)
                ?? (finding.refId && /^s\d+$/i.test(finding.refId.trim()) ? finding.refId.trim().toUpperCase() : null);
            if (!label) return;
            const labelLower = label.toLowerCase();
            const match = items.find(item => {
                if (item.displayLabel.toLowerCase() === labelLower) return true;
                if (item.id.toLowerCase() === labelLower) return true;
                if (item.sceneId && item.sceneId.toLowerCase() === labelLower) return true;
                return item.filePaths?.some(path => path.toLowerCase() === labelLower) ?? false;
            });
            const anchorSource = match
                ? (this.getMinimapItemFilePath(match) || match.id || label)
                : label;
            const anchorId = anchorSource ? this.getBriefSceneAnchorId(anchorSource) : undefined;
            const existing = notes.get(label);
            const headerTitle = match
                ? this.stripNumericTitlePrefix(this.getMinimapItemTitle(match))
                : '';
            const header = headerTitle ? `${label.toUpperCase()} · ${headerTitle}` : label.toUpperCase();
            const entry = {
                headline: this.sanitizeDossierText(finding.headline) || 'Finding text unavailable.',
                bullets: this.buildSceneDossierBodyLines(finding)
                    .filter(line => line.startsWith('• '))
                    .map(line => line.replace(/^•\s*/, '')),
                impact: this.formatBriefLabel(finding.impact),
                confidence: this.formatBriefLabel(finding.assessmentConfidence),
                lens: finding.lens === 'both'
                    ? 'Flow / Depth'
                    : this.formatBriefLabel(finding.lens || result.mode || 'flow')
            };
            if (existing) {
                existing.entries.push(entry);
                return;
            }
            const order = match
                ? items.indexOf(match)
                : this.getSceneNoteSortOrder(label);
            notes.set(label, {
                label,
                header,
                anchorId,
                order: order >= 0 ? order : Number.MAX_SAFE_INTEGER,
                entries: [entry]
            });
        });

        return Array.from(notes.values())
            .sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
            })
            .map(entry => ({
                label: entry.label,
                header: entry.header,
                anchorId: entry.anchorId,
                entries: entry.entries
            }));
    }

    private getSceneNoteSortOrder(label: string): number {
        const match = label.trim().match(/^[A-Za-z](\d+)$/);
        if (!match) return Number.MAX_SAFE_INTEGER;
        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
    }

    private getPendingInquiryActions(result: InquiryResult): string[] {
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
    }

    private formatManifestClassLabel(value: string): string {
        if (!value) return 'Class';
        return value
            .replace(/[_-]+/g, ' ')
            .trim()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    private formatManifestModeLabel(mode?: InquiryMaterialMode): string {
        const normalized = this.normalizeEvidenceMode(mode);
        if (normalized === 'summary') return 'Summary';
        if (normalized === 'full') return 'Body';
        return 'Off';
    }

    private resolveSceneLogLabel(frontmatter: Record<string, unknown> | null, file: TFile): string {
        const rawSceneNumber = frontmatter ? frontmatter['Scene Number'] : undefined;
        const parsedNumber = Number(typeof rawSceneNumber === 'string' ? rawSceneNumber.trim() : rawSceneNumber);
        const sceneNumber = Number.isFinite(parsedNumber) ? Math.max(1, Math.floor(parsedNumber)) : null;
        const rawTitle = frontmatter ? (frontmatter['Title'] ?? frontmatter['title']) : undefined;
        const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
        if (sceneNumber && title) return `${title} (S${sceneNumber})`;
        if (sceneNumber) return `S${sceneNumber}`;
        if (title) return title;
        return file.basename;
    }

    private resolveManifestEntryLabel(entry: CorpusManifestEntry): string {
        const file = this.app.vault.getAbstractFileByPath(entry.path);
        if (file && this.isTFile(file)) {
            const frontmatter = this.getNormalizedFrontmatter(file);
            if (entry.class === 'scene') {
                return this.resolveSceneLogLabel(frontmatter, file);
            }
            const rawTitle = frontmatter ? (frontmatter['Title'] ?? frontmatter['title']) : undefined;
            if (typeof rawTitle === 'string' && rawTitle.trim()) {
                return rawTitle.trim();
            }
            return file.basename;
        }
        const fallback = entry.path.split('/').pop();
        return fallback || entry.path;
    }

    private buildManifestTocLines(manifest: CorpusManifest | null): string[] {
        if (!manifest?.entries?.length) {
            return ['- none'];
        }
        const dedupedEntries: CorpusManifestEntry[] = [];
        const seen = new Set<string>();
        manifest.entries.forEach(entry => {
            const key = `${entry.class}::${entry.path}::${this.normalizeEvidenceMode(entry.mode)}`;
            if (seen.has(key)) return;
            seen.add(key);
            dedupedEntries.push(entry);
        });

        dedupedEntries.sort((a, b) => {
            if (a.class !== b.class) return a.class.localeCompare(b.class);
            return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
        });

        return dedupedEntries.map(entry => {
            const classLabel = this.formatManifestClassLabel(entry.class);
            const modeLabel = this.formatManifestModeLabel(entry.mode);
            const itemLabel = this.resolveManifestEntryLabel(entry);
            return `- ${classLabel} · ${modeLabel} · ${itemLabel} (${entry.path})`;
        });
    }

    /**
     * Returns a copy of the manifest filtered to match the entries that
     * buildEvidenceBlocks actually sends to the AI provider.
     *
     * For book scope with a focusBookId:
     *   - Scenes: only entries whose path is within the focused book
     *   - Outlines: only non-saga outlines whose path is within the focused book
     *   - References: included regardless of path
     *
     * For saga scope or when focusBookId is absent: returns the manifest unchanged.
     */
    private filterManifestForLog(
        manifest: CorpusManifest | null,
        scope: InquiryScope,
        focusBookId?: string
    ): CorpusManifest | null {
        if (!manifest || scope !== 'book' || !focusBookId) return manifest;

        const isInFocusBook = (path: string): boolean =>
            path === focusBookId || path.startsWith(`${focusBookId}/`);

        const entries = manifest.entries.filter(entry => {
            if (entry.class === 'scene') return isInFocusBook(entry.path);
            if (entry.class === 'outline') return entry.scope !== 'saga' && isInFocusBook(entry.path);
            return true;
        });

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {}) as CorpusManifest['classCounts'];

        return { ...manifest, entries, classCounts };
    }

    private buildInquiryLogContent(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        logTitle?: string,
        contentLogWritten?: boolean
    ): string {
        const title = logTitle ?? this.formatInquiryLogTitle(result);
        const isSimulated = result.aiReason === 'simulated' || result.aiReason === 'stub';
        const questionLabel = this.findPromptLabelById(result.questionId)
            || this.getQuestionTextById(result.questionId)
            || result.questionId
            || 'Inquiry Question';
        const scopeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
        const target = result.focusId || (result.scope === 'saga' ? 'Σ' : 'B0');
        const providerRaw = result.aiProvider ? result.aiProvider.trim() : '';
        const providerLabel = isSimulated
            ? 'Simulation'
            : providerRaw
            ? (['anthropic', 'gemini', 'openai', 'local'].includes(providerRaw)
                ? this.getInquiryProviderLabel(providerRaw as EngineProvider)
                : providerRaw)
            : 'Unknown';
        const modelLabel = isSimulated
            ? 'No provider call'
            : this.getBriefModelLabel(result)
            || result.aiModelResolved
            || result.aiModelRequested
            || 'unknown';
        const durationMs = typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)
            ? result.roundTripMs
            : null;
        const tokenEstimateInput = this.getFiniteTokenEstimateInput(trace, result);
        const tokenTier = typeof tokenEstimateInput === 'number'
            ? this.getTokenTier(tokenEstimateInput)
            : (result.tokenEstimateTier || null);
        const overrideSummary = result.corpusOverridesActive ? result.corpusOverrideSummary : null;
        const overrideLabel = overrideSummary
            ? `On (classes: ${overrideSummary.classCount}, items: ${overrideSummary.itemCount})`
            : (result.corpusOverridesActive ? 'On' : 'None');

        let status: AiLogStatus = 'success';
        const degraded = this.isDegradedResult(result);
        if (isSimulated) {
            status = 'simulated';
        } else if (this.isErrorResult(result)) {
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
        const usageKnown = typeof trace.tokenUsageKnown === 'boolean'
            ? trace.tokenUsageKnown
            : !!usage;
        const usageVisibility = this.formatTokenUsageVisibility(usageKnown, trace.tokenUsageScope ?? result.tokenUsageScope);
        const usageText = usage
            ? `input=${formatTokenCount(usage.inputTokens)}, output=${formatTokenCount(usage.outputTokens)}, total=${formatTokenCount(usage.totalTokens)}`
            : 'not available';

        const describeMode = (className: string): string | null => {
            if (!manifest) return null;
            const modes = new Set(
                manifest.entries
                    .filter(entry => entry.class === className)
                    .map(entry => this.normalizeEvidenceMode(entry.mode))
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

        const formatClassLabel = (value: string): string => {
            return this.formatManifestClassLabel(value);
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
                            : formatClassLabel(className);
                contextParts.push(`${label} ${count}`);
            });
            summaryLines.push(`- Context: ${contextParts.length ? contextParts.join(', ') : 'none'}`);

            const handled = new Set(['scene', 'outline', ...contextOrder]);
            const otherClasses = Object.keys(counts).filter(name => !handled.has(name));
            if (otherClasses.length) {
                const otherParts = otherClasses.map(name => `${formatClassLabel(name)} ${counts[name] ?? 0}`);
                summaryLines.push(`- Other: ${otherParts.join(', ')}`);
            }

            return summaryLines;
        };

        const resolveFailureReason = (): string | null => {
            if (!this.isErrorResult(result)) return null;
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
            if (!this.isErrorResult(result)) return ['None.'];
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
        lines.push(`# ${title}`, '');
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
        lines.push(...this.buildManifestTocLines(manifest));
        lines.push('');

        lines.push('## Tokens');
        lines.push(`- Estimated input: ${formatTokenCount(tokenEstimateInput, true)}`);
        lines.push(`- Actual usage: ${isSimulated ? 'simulated run; not applicable' : usageText}`);
        lines.push(`- Usage visibility: ${isSimulated ? 'simulated' : usageVisibility}`);
        lines.push(`- Tier: ${tokenTier ?? 'unknown'}`);
        const logSnapshot = this.plugin.getInquiryEstimateService().getSnapshot();
        if (logSnapshot) {
            lines.push(`- Pre-run estimate: ${formatTokenCount(logSnapshot.estimate.estimatedInputTokens, true)} (${logSnapshot.estimate.estimationMethod})`);
            lines.push(`- Safe ceiling: ${formatTokenCount(logSnapshot.estimate.effectiveInputCeiling)}`);
            lines.push(`- Expected passes: ${logSnapshot.estimate.expectedPassCount}`);
        }
        lines.push('');

        lines.push('## Execution');
        lines.push(`- Packaging: ${isSimulated ? 'Simulation only' : (trace.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : trace.analysisPackaging === 'segmented' ? 'Segmented' : 'Automatic')}`);
        lines.push(`- Execution state: ${isSimulated ? 'simulated' : (trace.executionState ?? 'unknown')}`);
        lines.push(`- Execution path: ${isSimulated ? 'simulated' : (trace.executionPath ?? ((typeof trace.executionPassCount === 'number' && trace.executionPassCount > 1) ? 'multi_pass' : 'one_pass'))}`);
        lines.push(`- Failure stage: ${isSimulated ? 'none' : (trace.failureStage ?? (status === 'error' ? 'provider_response_parsing' : 'none'))}`);
        if (typeof trace.executionPassCount === 'number' && trace.executionPassCount > 1) {
            lines.push(`- Pass count: ${trace.executionPassCount}`);
        }
        if (!isSimulated && trace.packagingTriggerReason) {
            lines.push(`- Packaging trigger: ${trace.packagingTriggerReason}`);
        }
        lines.push('');

        lines.push('## Result');
        if (status === 'success') {
            lines.push(`- Verdict: Flow ${this.formatMetricDisplay(result.verdict.flow)} · Depth ${this.formatMetricDisplay(result.verdict.depth)} · Impact ${this.formatBriefLabel(result.verdict.impact)} · Confidence ${this.formatBriefLabel(result.verdict.assessmentConfidence)}`);
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

        lines.push(`Content Log: ${contentLogWritten ? 'written' : 'skipped'}`);
        lines.push('');

        return lines.join('\n');
    }

    private buildInquiryContentLogContent(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        logTitle?: string,
        normalizationNotes?: string[]
    ): string {
        const title = logTitle ?? this.formatInquiryContentLogTitle(result);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const scopeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
        const target = result.focusId || (result.scope === 'saga' ? 'Σ' : 'B0');
        const aiProvider = result.aiProvider || 'unknown';
        const aiModelRequested = result.aiModelRequested || 'unknown';
        const aiModelResolved = result.aiModelResolved || aiModelRequested;
        const aiModelNextRunOnly = typeof result.aiModelNextRunOnly === 'boolean' ? result.aiModelNextRunOnly : null;
        const submittedAt = result.submittedAt ? new Date(result.submittedAt) : null;
        const completedAt = result.completedAt ? new Date(result.completedAt) : null;
        const durationMs = typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)
            ? result.roundTripMs
            : null;
        const inquiryId = this.formatInquiryIdFromResult(result);
        const artifactId = result.runId
            ? `artifact-${result.runId}`
            : (inquiryId ? `artifact-${inquiryId}` : `artifact-${Date.now()}`);
        const tokenEstimateInput = this.getFiniteTokenEstimateInput(trace, result);
        const tokenTier = typeof tokenEstimateInput === 'number'
            ? this.getTokenTier(tokenEstimateInput)
            : (result.tokenEstimateTier || null);
        const overrideSummary = result.corpusOverridesActive ? result.corpusOverrideSummary : null;
        const overrideLabel = overrideSummary
            ? `on (classes=${overrideSummary.classCount}, items=${overrideSummary.itemCount})`
            : (result.corpusOverridesActive ? 'on' : 'none');

        let status: AiLogStatus = 'success';
        const degraded = this.isDegradedResult(result);
        const isSimulated = result.aiReason === 'simulated' || result.aiReason === 'stub';
        if (isSimulated) {
            status = 'simulated';
        } else if (this.isErrorResult(result)) {
            status = 'error';
        }

        const tokenUsage = trace.usage
            ?? (trace.response?.responseData ? extractTokenUsage(aiProvider, trace.response.responseData) : null);
        const tokenUsageKnown = typeof trace.tokenUsageKnown === 'boolean'
            ? trace.tokenUsageKnown
            : !!tokenUsage;
        const tokenUsageVisibility = this.formatTokenUsageVisibility(tokenUsageKnown, trace.tokenUsageScope ?? result.tokenUsageScope);
        const { sanitized: sanitizedPayload, hadRedactions } = sanitizeLogPayload(trace.requestPayload ?? null);
        const redactionNotes = hadRedactions
            ? ['Redacted sensitive credential values from request payload.']
            : [];
        const sanitizationSteps = [...(trace.sanitizationNotes || []), ...redactionNotes].filter(Boolean);
        const schemaWarnings = [
            ...(trace.notes || []),
            ...(normalizationNotes || [])
        ].filter(Boolean);

        const contextLines = [
            '',
            '### Inquiry Context',
            `- Artifact ID: ${artifactId}`,
            `- Run ID: ${result.runId || 'unknown'}`,
            `- Plugin version: ${this.plugin.manifest.version}`,
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
        this.buildManifestTocLines(manifest).forEach(line => contextLines.push(line));

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
                parsedOutput: this.normalizeLegacyResult(result)
            },
            notes: {
                sanitizationSteps,
                retryAttempts: trace.retryCount,
                schemaWarnings
            }
        }, { jsonSpacing: 0, metadataExtras: contextLines });

        return `${logContent}\n`;
    }

    private formatInquiryLogTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.aiReason === 'simulated' || result.aiReason === 'stub') {
            parts.push('TEST RUN');
        }
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Log — ${parts.join(' · ')} ${timestamp}`;
    }

    private formatInquiryContentLogTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.aiReason === 'simulated' || result.aiReason === 'stub') {
            parts.push('TEST RUN');
        }
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Content Log — ${parts.join(' · ')} ${timestamp}`;
    }

    private resolveInquiryLogLinkTitle(result: InquiryResult, logPath?: string): string {
        if (logPath) {
            const basename = logPath.split('/').pop();
            if (basename) {
                return basename.replace(/\.md$/, '');
            }
        }
        return this.formatInquiryLogTitle(result);
    }

    private formatInquiryBriefTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Brief — ${parts.join(' · ')} ${timestamp}`;
    }

    private resolveInquiryBriefZoneLabel(result: InquiryResult): string {
        const zone = result.questionZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        return zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
    }

    private resolveInquiryBriefLensLabel(result: InquiryResult, zoneLabel: string): string {
        const promptLabel = this.findPromptLabelById(result.questionId);
        if (promptLabel && promptLabel.toLowerCase() !== zoneLabel.toLowerCase()) {
            return promptLabel;
        }
        return result.mode === 'depth' ? 'Depth' : 'Flow';
    }

    private findPromptLabelById(questionId: string): string | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (slot?.label?.trim()) {
                return slot.label.trim();
            }
        }
        return null;
    }

    private findPromptZoneById(questionId: string): InquiryZone | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            if ((config[zone] || []).some(entry => entry.id === questionId)) {
                return zone;
            }
        }
        return null;
    }

    private isContextRequiredForQuestion(questionId: string, questionZone?: InquiryZone): boolean {
        if (!questionId) return false;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (slot?.requiresContext) return true;
        }
        if (questionZone) {
            const slots = config[questionZone] || [];
            return slots.some(entry => entry.id === questionId && entry.requiresContext);
        }
        return false;
    }

    private isContextRequiredForQuestions(questions: InquiryQuestion[]): boolean {
        return questions.some(question => this.isContextRequiredForQuestion(question.id, question.zone));
    }

    private getQuestionTextById(questionId?: string): string | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (!slot) continue;
            const questionText = this.getQuestionTextForSlot(zone, slot);
            if (questionText.trim()) return questionText;
        }
        return null;
    }

    private formatInquiryBriefTimestamp(date: Date, options?: { includeSeconds?: boolean }): string {
        if (!Number.isFinite(date.getTime())) {
            return 'Unknown date';
        }
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        const am = hours < 12;
        hours = hours % 12;
        if (hours === 0) hours = 12;
        const minuteText = String(minutes).padStart(2, '0');
        const includeSeconds = options?.includeSeconds ?? false;
        const secondText = includeSeconds ? `.${String(seconds).padStart(2, '0')}` : '';
        return `${month} ${day} ${year} @ ${hours}.${minuteText}${secondText}${am ? 'am' : 'pm'}`;
    }

    private stringifyLogValue(value: unknown): string {
        if (value === undefined) return 'undefined';
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    private getInquiryTimestamp(result: InquiryResult, fallbackToNow = false): Date | null {
        const completedAt = result.completedAt ? new Date(result.completedAt) : null;
        if (completedAt && Number.isFinite(completedAt.getTime())) {
            return completedAt;
        }
        const submittedAt = result.submittedAt ? new Date(result.submittedAt) : null;
        if (submittedAt && Number.isFinite(submittedAt.getTime())) {
            return submittedAt;
        }
        if (fallbackToNow) return new Date();
        return null;
    }

    private formatInquiryId(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}.${minutes}.${seconds}`;
    }

    private formatInquiryIdFromResult(result: InquiryResult): string | null {
        const timestamp = this.getInquiryTimestamp(result);
        if (!timestamp) return null;
        return this.formatInquiryId(timestamp);
    }

    private normalizeInquiryHeadline(headline: string): string {
        return (headline || 'Finding').replace(/\s+/g, ' ').trim();
    }

    private formatInquiryBriefLink(briefTitle: string, alias = 'Briefing'): string {
        if (!alias) return `[[${briefTitle}]]`;
        return `[[${briefTitle}|${alias}]]`;
    }

    private formatInquiryActionNote(
        finding: InquiryFinding,
        briefTitle: string
    ): string {
        const suggestion = this.buildInquiryActionSuggestion(finding);
        const briefLink = this.formatInquiryBriefLink(briefTitle);
        return `${briefLink} — ${suggestion}`;
    }

    private buildInquiryActionSuggestion(finding: InquiryFinding): string {
        const source = (finding.bullets?.find(entry => entry?.trim()) || finding.headline || '').replace(/\s+/g, ' ').trim();
        if (!source) return 'Revisit this scene';
        const cleaned = source.replace(/[.?!]+$/, '').trim();
        const lowered = cleaned.toLowerCase();
        const imperativeStarts = [
            'add', 'adjust', 'align', 'anchor', 'balance', 'clarify', 'condense', 'confirm', 'connect',
            'deepen', 'define', 'emphasize', 'ensure', 'establish', 'expand', 'foreshadow', 'highlight',
            'introduce', 'move', 'reframe', 'reorder', 'revisit', 'revise', 'seed', 'sharpen', 'show',
            'simplify', 'streamline', 'strengthen', 'tighten', 'trim', 'resolve', 'rework', 'shift'
        ];
        if (imperativeStarts.some(prefix => lowered.startsWith(`${prefix} `))) {
            return cleaned;
        }
        if (lowered.startsWith('it is unclear ')) {
            return `Clarify ${cleaned.slice('it is unclear '.length)}`;
        }
        if (lowered.startsWith('unclear whether ')) {
            return `Clarify whether ${cleaned.slice('unclear whether '.length)}`;
        }
        if (lowered.startsWith('unclear if ')) {
            return `Clarify if ${cleaned.slice('unclear if '.length)}`;
        }
        if (lowered.startsWith('unclear ')) {
            return `Clarify ${cleaned.slice('unclear '.length)}`;
        }
        if (lowered.startsWith('lacks ')) {
            return `Add ${cleaned.slice('lacks '.length)}`;
        }
        if (lowered.startsWith('missing ')) {
            return `Add ${cleaned.slice('missing '.length)}`;
        }
        if (lowered.startsWith('needs ')) {
            return `Strengthen ${cleaned.slice('needs '.length)}`;
        }
        const verbMatch = cleaned.match(/\b(is|are|was|were|feels|seems|appears|looks|drags|lags|sags|rushes|stalls|slows|reads)\b/i);
        if (verbMatch?.index !== undefined && verbMatch.index > 0) {
            const subject = cleaned.slice(0, verbMatch.index).replace(/^(the|this|that|these|those|a|an)\s+/i, '').trim();
            const remainder = cleaned.slice(verbMatch.index + verbMatch[0].length).trim();
            const locationMatch = remainder.match(/\b(in|during|at|by|within|around)\s+.+$/i);
            if (subject) {
                const location = locationMatch ? ` ${locationMatch[0].trim()}` : '';
                return `Revise ${subject}${location}`;
            }
        }
        return `Consider revising ${cleaned}`;
    }

    private formatRoundTripDuration(ms: number): string {
        if (!Number.isFinite(ms) || ms <= 0) return '0s';
        const seconds = ms / 1000;
        if (seconds < 1) return `${Math.round(ms)}ms`;
        const rounded = seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
        return `${rounded.replace(/\.0+$/, '')}s`;
    }

    private getAvailableArtifactPath(folderPath: string, baseName: string): string {
        const sanitizedFolder = normalizePath(folderPath);
        let attempt = 0;
        while (attempt < 50) {
            const suffix = attempt === 0 ? '' : `-${attempt}`;
            const filePath = `${sanitizedFolder}/${baseName}${suffix}.md`;
            if (!this.app.vault.getAbstractFileByPath(filePath)) {
                return filePath;
            }
            attempt += 1;
        }
        return `${sanitizedFolder}/${baseName}-${Date.now()}.md`;
    }

    private async openArtifactsFolder(): Promise<void> {
        const folderPath = resolveInquiryArtifactFolder(this.plugin.settings);
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) {
            new Notice(`Unable to access folder: ${folderPath}`);
            return;
        }
        this.revealInFileExplorer(folder);
    }

    private async openMostRecentArtifact(): Promise<void> {
        const file = getMostRecentArtifactFile(this.app, this.plugin.settings);
        if (!file) {
            new Notice('No briefs found.');
            return;
        }
        await openOrRevealFile(this.app, file);
    }

    private revealInFileExplorer(file: TAbstractFile): void {
        const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!explorerLeaf?.view) {
            new Notice('File explorer not available.');
            return;
        }
        const explorerView = explorerLeaf.view as unknown as { revealInFolder?: (target: TAbstractFile) => void };
        if (!explorerView.revealInFolder) {
            new Notice('Unable to reveal folder.');
            return;
        }
        explorerView.revealInFolder(file);
        this.app.workspace.revealLeaf(explorerLeaf);
    }
}
