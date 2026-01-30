import {
    App,
    ItemView,
    WorkspaceLeaf,
    Platform,
    Notice,
    setIcon,
    TAbstractFile,
    TFile,
    normalizePath,
    SuggestModal
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
    InquiryZone
} from './state';
import type { InquiryClassConfig, InquiryMaterialMode, InquiryPromptConfig, InquiryPromptSlot } from '../types/settings';
import { buildDefaultInquiryPromptConfig, getBuiltInPromptSeed, getCanonicalPromptText, normalizeInquiryPromptConfig } from './prompts';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { ensureInquiryLogFolder } from './utils/logs';
import { openOrRevealFile } from '../utils/fileUtils';
import { extractTokenUsage, formatAiLogContent, sanitizeLogPayload, type AiLogStatus } from '../ai/log';
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
import type {
    CorpusManifest,
    CorpusManifestEntry,
    EvidenceParticipationRules,
    InquiryOmnibusInput,
    InquiryRunTrace,
    InquiryRunnerInput
} from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';
import type { InquirySession, InquirySessionStatus } from './sessionTypes';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import type { InquirySourcesSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { InquiryCorpusResolver, InquiryCorpusSnapshot, InquiryCorpusItem } from './services/InquiryCorpusResolver';
import { getModelDisplayName } from '../utils/modelResolver';
import { addTooltipData, setupTooltipsFromDataAttributes } from '../utils/tooltip';
import { splitIntoBalancedLinesOptimal } from '../utils/text';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    resolveScanRoots,
    toVaultRoot
} from './utils/scanRoots';

const GLYPH_PLACEHOLDER_FLOW = 0.75;
const GLYPH_PLACEHOLDER_DEPTH = 0.30;
const DEBUG_SVG_OVERLAY = false;
const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX_MIN = -800;
const VIEWBOX_MAX = 800;
const VIEWBOX_SIZE = 1600;
const INQUIRY_REFERENCE_ONLY_CLASSES = new Set(['character', 'place', 'power']);
const MINIMAP_GROUP_Y = -520;
const PREVIEW_PANEL_WIDTH = 640;
const PREVIEW_PANEL_Y = -390;
const PREVIEW_PANEL_MINIMAP_GAP = 60;
const PREVIEW_PANEL_PADDING_X = 32;
const PREVIEW_PANEL_PADDING_Y = 20;
const PREVIEW_HERO_LINE_HEIGHT = 30;
const PREVIEW_HERO_MAX_LINES = 4;
const PREVIEW_META_GAP = 6;
const PREVIEW_META_LINE_HEIGHT = 22;
const PREVIEW_DETAIL_GAP = 16;
const PREVIEW_PILL_HEIGHT = 26;
const PREVIEW_PILL_PADDING_X = 16;
const PREVIEW_PILL_GAP_X = 16;
const PREVIEW_PILL_GAP_Y = 14;
const PREVIEW_PILL_MIN_GAP_X = 8;
const PREVIEW_FOOTER_GAP = 12;
const PREVIEW_FOOTER_HEIGHT = 22;
const PREVIEW_RESULTS_FOOTER_OFFSET = 30;
const PREVIEW_SHIMMER_WIDTH = 80;
const PREVIEW_SHIMMER_OVERHANG = 110;
const RESULTS_EMPTY_TEXT = 'No notable findings.';
const RESULTS_MAX_CHIPS = 6;
const SWEEP_RANDOM_CYCLE_MS = 2000;
const FLOW_FINDING_ORDER: InquiryFinding['kind'][] = ['escalation', 'conflict', 'continuity', 'loose_end', 'unclear', 'error', 'none'];
const DEPTH_FINDING_ORDER: InquiryFinding['kind'][] = ['continuity', 'loose_end', 'conflict', 'escalation', 'unclear', 'error', 'none'];
const SIGMA_CHAR = String.fromCharCode(931);
const MODE_ICON_VIEWBOX = 2048;
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
const BACKBONE_SWEEP_WIDTH_RATIO = 0.2;
const BACKBONE_SWEEP_MIN_WIDTH = 80;
const BACKBONE_SWEEP_MAX_WIDTH = 200;
const MIN_PROCESSING_MS = 5000;
const BACKBONE_SHINE_DURATION_MS = 7200;
const BACKBONE_OSCILLATION_MS = 8000;
const BACKBONE_FADE_OUT_MS = 800;
const SIMULATION_DURATION_MS = 20000;
const BRIEFING_SESSION_LIMIT = 10;
const DUPLICATE_PULSE_MS = 1200;
const REHYDRATE_PULSE_MS = 1400;
const REHYDRATE_HIGHLIGHT_MS = 3500;
const BRIEFING_HIDE_DELAY_MS = 220;
const CC_CELL_SIZE = 20;
const CC_PAGE_BASE_SIZE = Math.round(CC_CELL_SIZE * 0.8);
const CC_PAGE_MIN_SIZE = Math.max(6, Math.round(CC_CELL_SIZE * 0.33));
const INQUIRY_NOTES_MAX = 5;
const CC_RIGHT_MARGIN = 50;
const CC_BOTTOM_MARGIN = 50;
const INQUIRY_GUIDANCE_DOC_URL = 'https://github.com/EricRhysTaylor/Radial-Timeline/wiki';
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
const INQUIRY_HELP_RESULTS_TOOLTIP = [
    'Review material citations for granular feedback in the minimap.',
    'View the Brief for full details.'
].join('\n');
const INQUIRY_HELP_ONBOARDING_TOOLTIP = [
    'Number buttons reveal the question and payload.',
    'Click to process a question with AI.',
    'Flow and Depth rings adjust the lens of the response.',
    'The minimap reveals contextual citations.'
].join('\n');
const INQUIRY_TOOLTIP_BALANCE_WIDTH = 360;
const GUIDANCE_TEXT_Y = 360;
const GUIDANCE_LINE_HEIGHT = 18;
const GUIDANCE_ALERT_LINE_HEIGHT = 26;
const INQUIRY_PROMPT_OVERHEAD_CHARS = 900;
const INQUIRY_CHARS_PER_TOKEN = 4;
const INQUIRY_INPUT_TOKENS_AMBER = 60000;
const INQUIRY_INPUT_TOKENS_RED = 110000;
const INQUIRY_TOKENS_RED_TOOLTIP = 'Payload is very large and may be truncated by some models. Consider switching to a larger-context model.';

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
    sceneNotes: Array<{ label: string; note: string }>;
    pendingActions: string[];
    logTitle?: string | null;
};

type InquiryPreviewRow = {
    group: SVGGElement;
    bg: SVGRectElement;
    text: SVGTextElement;
    label: string;
};

type TokenTier = 'normal' | 'amber' | 'red';

type InquiryChoiceOption<T> = {
    label: string;
    value: T;
};

class InquiryChoiceModal<T> extends SuggestModal<InquiryChoiceOption<T>> {
    private didChoose = false;

    constructor(
        app: App,
        private choices: InquiryChoiceOption<T>[],
        private onChoose: (value: T) => void,
        private onCancel: () => void,
        placeholder?: string
    ) {
        super(app);
        if (placeholder) {
            this.setPlaceholder(placeholder);
        }
    }

    getSuggestions(query: string): InquiryChoiceOption<T>[] {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return this.choices;
        return this.choices.filter(choice => choice.label.toLowerCase().includes(normalized));
    }

    renderSuggestion(item: InquiryChoiceOption<T>, el: HTMLElement): void {
        el.setText(item.label);
    }

    onChooseSuggestion(item: InquiryChoiceOption<T>, _evt: MouseEvent | KeyboardEvent): void {
        this.onChooseItem(item);
    }

    getItems(): InquiryChoiceOption<T>[] {
        return this.choices;
    }

    getItemText(item: InquiryChoiceOption<T>): string {
        return item.label;
    }

    onChooseItem(item: InquiryChoiceOption<T>): void {
        this.didChoose = true;
        this.onChoose(item.value);
    }

    onClose(): void {
        if (!this.didChoose) {
            this.onCancel();
        }
    }
}

type InquiryPayloadStats = {
    scope: InquiryScope;
    focusBookId?: string;
    sceneTotal: number;
    sceneSynopsisUsed: number;
    sceneSynopsisAvailable: number;
    sceneFullTextCount: number;
    bookOutlineCount: number;
    sagaOutlineCount: number;
    referenceCounts: { character: number; place: number; power: number; other: number; total: number };
    referenceByClass: Record<string, number>;
    evidenceChars: number;
    resolvedRoots: string[];
    manifestFingerprint: string;
    tokenEstimate?: InquiryRunTrace['tokenEstimate'];
    tokenEstimateQuestion?: string;
};

type RgbColor = {
    r: number;
    g: number;
    b: number;
};

type BackboneColors = {
    gradient: RgbColor[];
    shine: RgbColor[];
};

type CorpusCcEntry = {
    id: string;
    label: string;
    filePath: string;
    className: string;
};

type CorpusCcSlot = {
    group: SVGGElement;
    base: SVGRectElement;
    fill: SVGRectElement;
    border: SVGRectElement;
    icon: SVGTextElement;
    fold: SVGPathElement;
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
type EngineChoice = {
    provider: EngineProvider;
    providerLabel: string;
    modelId: string;
    modelLabel: string;
    isActive: boolean;
    enabled: boolean;
    disabledReason?: string;
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
    private briefingEmptyEl?: HTMLDivElement;
    private briefingPinned = false;
    private briefingHideTimer?: number;
    private engineBadgeGroup?: SVGGElement;
    private enginePanelEl?: HTMLDivElement;
    private enginePanelRecommendedEl?: HTMLDivElement;
    private enginePanelRecommendedListEl?: HTMLDivElement;
    private enginePanelAllLabelEl?: HTMLDivElement;
    private enginePanelControlsEl?: HTMLDivElement;
    private enginePanelNextRunToggle?: HTMLButtonElement;
    private enginePanelSetDefaultButton?: HTMLButtonElement;
    private enginePanelGuardEl?: HTMLDivElement;
    private enginePanelGuardNoteEl?: HTMLDivElement;
    private enginePanelRunAnywayButton?: HTMLButtonElement;
    private enginePanelListEl?: HTMLDivElement;
    private enginePanelMetaEl?: HTMLDivElement;
    private enginePanelHideTimer?: number;
    private engineNextRunOnly?: boolean;
    private engineNextRunOnlyTouched = false;
    private nextRunEngineOverride?: { provider: EngineProvider; providerLabel: string; modelId: string; modelLabel: string };
    private pendingGuardQuestion?: InquiryQuestion;
    private minimapTicksEl?: SVGGElement;
    private minimapBaseline?: SVGLineElement;
    private minimapEndCapStart?: SVGRectElement;
    private minimapEndCapEnd?: SVGRectElement;
    private minimapTicks: SVGGElement[] = [];
    private minimapGroup?: SVGGElement;
    private minimapBackboneGroup?: SVGGElement;
    private minimapBackboneGlow?: SVGRectElement;
    private minimapBackboneShine?: SVGRectElement;
    private minimapBackboneClip?: SVGClipPathElement;
    private minimapBackboneClipRect?: SVGRectElement;
    private minimapBackboneLayout?: {
        startX: number;
        length: number;
        glowHeight: number;
        glowY: number;
        shineHeight: number;
        shineY: number;
    };
    private minimapBackboneGradientStops: SVGStopElement[] = [];
    private minimapBackboneShineStops: SVGStopElement[] = [];
    private backboneStartColors?: BackboneColors;
    private backboneTargetColors?: BackboneColors;
    private backboneOscillationColors?: { base: BackboneColors; target: BackboneColors };
    private backboneOscillationPhaseOffset = 0;
    private backboneFadeTimer?: number;
    private minimapSweepTicks: Array<{ rect: SVGRectElement; centerX: number; rowIndex: number }> = [];
    private minimapSweepLayout?: { startX: number; endX: number; bandWidth: number };
    private sweepRandomCycle = -1;
    private sweepRandomActive = new Set<number>();
    private minimapBottomOffset = 0;
    private minimapEmptyUpdateId = 0;
    private runningAnimationFrame?: number;
    private runningAnimationStart?: number;
    private wasRunning = false;
    private minimapLayout?: { startX: number; length: number };
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
    private previewGroup?: SVGGElement;
    private previewHero?: SVGTextElement;
    private previewMeta?: SVGTextElement;
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
    private payloadEstimateRequestId = 0;
    private duplicatePulseTimer?: number;
    private rehydratePulseTimer?: number;
    private rehydrateHighlightTimer?: number;
    private rehydrateTargetKey?: string;
    private cacheStatusEl?: SVGTextElement;
    private confidenceEl?: SVGTextElement;
    private apiStatusEl?: SVGTextElement;
    private apiStatusState: { state: 'idle' | 'running' | 'success' | 'error'; reason?: string } = { state: 'idle' };
    private ccGroup?: SVGGElement;
    private ccLabel?: SVGTextElement;
    private ccEmptyText?: SVGTextElement;
    private ccClassLabels: SVGTextElement[] = [];
    private ccEntries: CorpusCcEntry[] = [];
    private ccSlots: CorpusCcSlot[] = [];
    private ccUpdateId = 0;
    private ccLayout?: { pageWidth: number; pageHeight: number; gap: number };
    private ccWordCache = new Map<string, { mtime: number; words: number; status?: 'todo' | 'working' | 'complete'; title?: string }>();
    private apiSimulationTimer?: number;
    private navPrevButton?: SVGGElement;
    private navNextButton?: SVGGElement;
    private navPrevIcon?: SVGUseElement;
    private navNextIcon?: SVGUseElement;
    private helpToggleButton?: SVGGElement;
    private helpTipsEnabled = false;
    private iconSymbols = new Set<string>();
    private svgDefs?: SVGDefsElement;
    private lastFocusSceneByBookId = new Map<string, string>();
    private corpusResolver: InquiryCorpusResolver;
    private corpus?: InquiryCorpusSnapshot;
    private focusPersistTimer?: number;
    private runner: InquiryRunnerService;
    private sessionStore: InquirySessionStore;
    private minimapResultPreviewActive = false;
    private guidanceState: InquiryGuidanceState = 'ready';

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
        if (Platform.isMobile) {
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
        this.registerDomEvent(this.contentEl, 'click', () => {
            if (!this.isErrorState()) return;
            this.dismissError();
        }, { capture: true });
        const svg = this.createSvgElement('svg');
        svg.classList.add('ert-ui', 'ert-inquiry-svg');
        svg.setAttribute('viewBox', `${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.rootSvg = svg;
        this.contentEl.appendChild(svg);
        setupTooltipsFromDataAttributes(svg, this.registerDomEvent.bind(this));

        const defs = this.createSvgElement('defs');
        this.svgDefs = defs;
        this.buildIconSymbols(defs);
        this.buildZoneGradients(defs);
        svg.appendChild(defs);

        const background = this.createSvgElement('rect');
        background.classList.add('ert-inquiry-bg');
        background.setAttribute('x', String(VIEWBOX_MIN));
        background.setAttribute('y', String(VIEWBOX_MIN));
        background.setAttribute('width', String(VIEWBOX_SIZE));
        background.setAttribute('height', String(VIEWBOX_SIZE));
        svg.appendChild(background);

        const bgImage = this.createSvgElement('image');
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
        const hudGroup = this.createSvgGroup(svg, 'ert-inquiry-hud', hudOffsetX, hudOffsetY);
        hudGroup.setAttribute('id', 'inq-hud');
        const canvasGroup = this.createSvgGroup(svg, 'ert-inquiry-canvas');
        canvasGroup.setAttribute('id', 'inq-canvas');

        const iconSize = 56;
        const iconGap = 16;
        const hudMargin = 40;

        this.scopeToggleButton = this.createIconButton(hudGroup, 0, 0, iconSize, 'columns-2', 'Toggle scope');
        this.scopeToggleIcon = this.scopeToggleButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.scopeToggleButton.querySelector('title')?.remove();
        addTooltipData(this.scopeToggleButton, this.balanceTooltipText('Toggle scope'), 'left');
        this.registerDomEvent(this.scopeToggleButton as unknown as HTMLElement, 'click', () => {
            this.handleScopeChange(this.state.scope === 'book' ? 'saga' : 'book');
        });

        const artifactX = (VIEWBOX_MAX - hudMargin - iconSize) - hudOffsetX;
        const helpX = artifactX - (iconSize + iconGap);
        const simulateX = helpX - (iconSize + iconGap);
        this.apiSimulationButton = this.createIconButton(hudGroup, simulateX, 0, iconSize, 'activity', 'Simulate API run');
        addTooltipData(this.apiSimulationButton, this.balanceTooltipText('Simulate API run'), 'left');
        this.registerDomEvent(this.apiSimulationButton as unknown as HTMLElement, 'click', () => this.startApiSimulation());

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
        this.registerDomEvent(this.helpToggleButton as unknown as HTMLElement, 'click', () => this.handleGuidanceHelpClick());

        this.artifactButton = this.createIconButton(hudGroup, artifactX, 0, iconSize, 'aperture', 'Briefing');
        this.artifactButton.querySelector('title')?.remove();
        this.registerDomEvent(this.artifactButton as unknown as HTMLElement, 'pointerenter', () => this.showBriefingPanel());
        this.registerDomEvent(this.artifactButton as unknown as HTMLElement, 'pointerleave', () => this.scheduleBriefingHide());
        this.registerDomEvent(this.artifactButton as unknown as HTMLElement, 'click', () => this.toggleBriefingPanel());

        const engineBadgeX = iconSize + iconGap;
        this.engineBadgeGroup = this.createIconButton(hudGroup, engineBadgeX, 0, iconSize, 'cpu', 'AI engine', 'ert-inquiry-engine-btn');
        this.engineBadgeGroup.querySelector('title')?.remove();
        this.registerDomEvent(this.engineBadgeGroup as unknown as HTMLElement, 'pointerenter', () => this.showEnginePanel());
        this.registerDomEvent(this.engineBadgeGroup as unknown as HTMLElement, 'pointerleave', () => this.scheduleEnginePanelHide());
        this.registerDomEvent(this.engineBadgeGroup as unknown as HTMLElement, 'click', () => this.openAiSettings());

        const minimapGroup = this.createSvgGroup(canvasGroup, 'ert-inquiry-minimap', 0, MINIMAP_GROUP_Y);
        this.minimapGroup = minimapGroup;

        const baselineLength = VIEWBOX_SIZE / 2;
        const baselineStartX = -(baselineLength / 2);
        this.minimapLayout = { startX: baselineStartX, length: baselineLength };
        this.minimapBaseline = this.createSvgElement('line');
        this.minimapBaseline.classList.add('ert-inquiry-minimap-baseline');
        minimapGroup.appendChild(this.minimapBaseline);
        this.minimapEndCapStart = this.createSvgElement('rect');
        this.minimapEndCapStart.classList.add('ert-inquiry-minimap-endcap');
        minimapGroup.appendChild(this.minimapEndCapStart);
        this.minimapEndCapEnd = this.createSvgElement('rect');
        this.minimapEndCapEnd.classList.add('ert-inquiry-minimap-endcap');
        minimapGroup.appendChild(this.minimapEndCapEnd);

        this.minimapTicksEl = this.createSvgGroup(minimapGroup, 'ert-inquiry-minimap-ticks', baselineStartX, 0);
        this.renderModeIcons(minimapGroup);

        this.glyphAnchor = this.createSvgGroup(canvasGroup, 'ert-inquiry-focus-area');
        this.glyph = new InquiryGlyph(this.glyphAnchor, {
            focusLabel: this.getFocusLabel(),
            flowValue: GLYPH_PLACEHOLDER_FLOW,
            depthValue: GLYPH_PLACEHOLDER_DEPTH,
            impact: 'low',
            assessmentConfidence: 'low'
        });
        this.logInquirySvgDebug();

        this.flowRingHit = this.glyph.flowRingHit;
        this.depthRingHit = this.glyph.depthRingHit;
        this.glyphHit = this.glyph.labelHit;

        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'click', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.handleGlyphClick();
        });
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'click', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.handleRingClick('flow');
        });
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'click', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.handleRingClick('depth');
        });

        this.buildPromptPreviewPanel(canvasGroup);

        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'pointerenter', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.setHoverText(this.buildFocusHoverText());
        });
        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'pointerleave', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.clearHoverText();
        });
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'pointerenter', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.setHoverText(this.buildRingHoverText('flow'));
        });
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'pointerleave', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.clearHoverText();
        });
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'pointerenter', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.setHoverText(this.buildRingHoverText('depth'));
        });
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'pointerleave', () => {
            if (this.isInquiryGuidanceLockout()) return;
            this.clearHoverText();
        });

        const hudFooterY = 1360;
        const navGroup = this.createSvgGroup(hudGroup, 'ert-inquiry-nav', 0, hudFooterY);
        this.navPrevButton = this.createIconButton(navGroup, 0, -18, 44, 'chevron-left', 'Previous focus', 'ert-inquiry-nav-btn');
        this.navPrevIcon = this.navPrevButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.navNextButton = this.createIconButton(navGroup, 54, -18, 44, 'chevron-right', 'Next focus', 'ert-inquiry-nav-btn');
        this.navNextIcon = this.navNextButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerDomEvent(this.navPrevButton as unknown as HTMLElement, 'click', () => this.shiftFocus(-1));
        this.registerDomEvent(this.navNextButton as unknown as HTMLElement, 'click', () => this.shiftFocus(1));

        const statusGroup = this.createSvgGroup(hudGroup, 'ert-inquiry-status', 180, hudFooterY + 6);
        this.cacheStatusEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'Cache: none', 0, 0);
        this.confidenceEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'Assessment confidence: none', 140, 0);
        this.apiStatusEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'API: idle', 0, 18);

        this.buildBriefingPanel();
        this.buildEnginePanel();
    }

    private buildPromptPreviewPanel(parent: SVGGElement): void {
        const panel = this.createSvgGroup(parent, 'ert-inquiry-preview', 0, PREVIEW_PANEL_Y);
        this.previewGroup = panel;
        this.registerDomEvent(panel as unknown as HTMLElement, 'click', (event: MouseEvent) => {
            if (!this.isResultsState()) return;
            event.stopPropagation();
            this.dismissResults();
        });

        const clickTarget = this.createSvgElement('rect');
        clickTarget.classList.add('ert-inquiry-preview-hitbox');
        clickTarget.setAttribute('fill', 'transparent');
        clickTarget.setAttribute('pointer-events', 'all');
        panel.appendChild(clickTarget);
        this.previewClickTarget = clickTarget;

        const hero = this.createSvgText(panel, 'ert-inquiry-preview-hero', '', 0, PREVIEW_PANEL_PADDING_Y);
        hero.setAttribute('text-anchor', 'middle');
        hero.setAttribute('dominant-baseline', 'hanging');
        this.previewHero = hero;

        const meta = this.createSvgText(panel, 'ert-inquiry-preview-meta', '', 0, PREVIEW_PANEL_PADDING_Y);
        meta.setAttribute('text-anchor', 'middle');
        meta.setAttribute('dominant-baseline', 'hanging');
        this.previewMeta = meta;

        const rowLabels = ['SCOPE', 'SCENES', 'OUTLINES', 'REFERENCES', 'TOKENS', 'ROOTS', 'CLASSES'];
        this.previewRowDefaultLabels = rowLabels.slice();
        this.previewRows = rowLabels.map(label => {
            const group = this.createSvgGroup(panel, 'ert-inquiry-preview-pill');
            if (label === 'TOKENS') {
                group.classList.add('is-tokens-slot');
            }
            const bg = this.createSvgElement('rect');
            bg.classList.add('ert-inquiry-preview-pill-bg');
            group.appendChild(bg);

            const pillTextY = (PREVIEW_PILL_HEIGHT / 2) + 1;
            const textEl = this.createSvgText(group, 'ert-inquiry-preview-pill-text', '', PREVIEW_PILL_PADDING_X, pillTextY);
            textEl.setAttribute('xml:space', 'preserve');
            textEl.setAttribute('dominant-baseline', 'middle');
            textEl.setAttribute('alignment-baseline', 'middle');
            textEl.setAttribute('text-anchor', 'start');

            return { group, bg, text: textEl, label };
        });

        const footer = this.createSvgText(panel, 'ert-inquiry-preview-footer', '', 0, 0);
        footer.setAttribute('text-anchor', 'middle');
        footer.setAttribute('dominant-baseline', 'hanging');
        this.previewFooter = footer;

        this.ensurePreviewShimmerResources(panel);
        if (!this.previewShimmerGroup) {
            const group = this.createSvgGroup(panel, 'ert-inquiry-preview-shimmer-group');
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
        header.createDiv({ cls: 'ert-inquiry-briefing-title', text: 'Recent Inquiries' });
        this.briefingListEl = panel.createDiv({ cls: 'ert-inquiry-briefing-list' });
        this.briefingEmptyEl = panel.createDiv({ cls: 'ert-inquiry-briefing-empty', text: 'No inquiries yet.' });
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
            text: 'Clear sessions'
        });
        this.briefingFooterEl.createDiv({
            cls: 'ert-inquiry-briefing-note',
            text: 'Does not delete briefs.'
        });
        this.registerDomEvent(this.briefingClearButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            this.handleBriefingClearClick();
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

        this.enginePanelGuardEl = panel.createDiv({ cls: 'ert-inquiry-engine-guard ert-hidden' });
        this.enginePanelGuardNoteEl = this.enginePanelGuardEl.createDiv({
            cls: 'ert-inquiry-engine-guard-note',
            text: 'Payload is very large. Choose a larger-context model or run anyway.'
        });
        this.enginePanelRunAnywayButton = this.enginePanelGuardEl.createEl('button', {
            cls: 'ert-inquiry-engine-run-anyway',
            text: 'Run anyway',
            attr: { type: 'button' }
        });
        this.registerDomEvent(this.enginePanelRunAnywayButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            void this.handleRunAnywayClick();
        });

        this.enginePanelControlsEl = panel.createDiv({ cls: 'ert-inquiry-engine-controls' });
        this.enginePanelNextRunToggle = this.enginePanelControlsEl.createEl('button', {
            cls: 'ert-inquiry-engine-toggle',
            text: 'Use for next run only',
            attr: { type: 'button', 'aria-pressed': 'false' }
        });
        this.enginePanelSetDefaultButton = this.enginePanelControlsEl.createEl('button', {
            cls: 'ert-inquiry-engine-set-default',
            text: 'Set as default',
            attr: { type: 'button', 'aria-pressed': 'false' }
        });
        this.registerDomEvent(this.enginePanelNextRunToggle, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            this.toggleEngineNextRunOnly();
        });
        this.registerDomEvent(this.enginePanelSetDefaultButton, 'click', (event: MouseEvent) => {
            event.stopPropagation();
            void this.commitEngineOverrideAsDefault();
        });

        this.enginePanelRecommendedEl = panel.createDiv({ cls: 'ert-inquiry-engine-recommended ert-hidden' });
        this.enginePanelRecommendedEl.createDiv({ cls: 'ert-inquiry-engine-section-title', text: 'Recommended' });
        this.enginePanelRecommendedListEl = this.enginePanelRecommendedEl.createDiv({ cls: 'ert-inquiry-engine-list' });
        this.enginePanelAllLabelEl = panel.createDiv({ cls: 'ert-inquiry-engine-section-title', text: 'All models' });
        this.enginePanelListEl = panel.createDiv({ cls: 'ert-inquiry-engine-list' });
        panel.createDiv({ cls: 'ert-inquiry-engine-note', text: 'Updates Settings > AI.' });
        this.registerDomEvent(panel, 'pointerenter', () => this.cancelEnginePanelHide());
        this.registerDomEvent(panel, 'pointerleave', () => this.scheduleEnginePanelHide());
        this.refreshEnginePanel();
    }

    private showEnginePanel(): void {
        if (!this.enginePanelEl) return;
        this.cancelEnginePanelHide();
        this.refreshEnginePanel();
        this.enginePanelEl.classList.remove('ert-hidden');
    }

    private hideEnginePanel(): void {
        if (!this.enginePanelEl) return;
        this.cancelEnginePanelHide();
        this.enginePanelEl.classList.add('ert-hidden');
        if (this.pendingGuardQuestion && !this.state.isRunning) {
            this.pendingGuardQuestion = undefined;
            this.refreshEnginePanel();
        }
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

    private refreshEnginePanel(): void {
        if (!this.enginePanelListEl) return;
        this.enginePanelListEl.empty();
        this.enginePanelRecommendedListEl?.empty();

        const clean = (value: string) => value.replace(/^models\//, '').trim();
        const getProviderModelId = (provider: EngineProvider): string => {
            if (provider === 'anthropic') return clean(this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929');
            if (provider === 'gemini') return clean(this.plugin.settings.geminiModelId || 'gemini-pro-latest');
            if (provider === 'local') return clean(this.plugin.settings.localModelId || 'local-model');
            return clean(this.plugin.settings.openaiModelId || 'gpt-5.2-chat-latest');
        };

        const activeProvider = (this.plugin.settings.defaultAiProvider || 'openai') as EngineProvider;
        const providers: EngineProvider[] = ['anthropic', 'gemini', 'openai', 'local'];
        const choices: EngineChoice[] = providers.map(provider => {
            const modelId = getProviderModelId(provider);
            const availability = this.getProviderAvailability(provider);
            return {
                provider,
                providerLabel: this.getInquiryProviderLabel(provider),
                modelId,
                modelLabel: getModelDisplayName(modelId),
                isActive: provider === activeProvider,
                enabled: availability.enabled,
                disabledReason: availability.reason
            };
        });

        if (this.enginePanelMetaEl) {
            const activeLabel = `${this.getActiveInquiryProviderLabel()} · ${this.getActiveInquiryModelLabel()}`;
            this.enginePanelMetaEl.setText(`Active: ${activeLabel}`);
        }

        const contextQuestion = this.getEngineContextQuestion();
        const tokenTier = contextQuestion ? this.getTokenTierForQuestion(contextQuestion) : 'normal';
        const showRecommendations = tokenTier !== 'normal';
        const recommendedChoices = showRecommendations ? this.pickRecommendedEngineChoices(choices) : [];
        const recommendedKeys = new Set(recommendedChoices.map(choice => `${choice.provider}::${choice.modelId}`));
        const showRecommendedSection = showRecommendations && recommendedChoices.length > 0;

        if (this.enginePanelRecommendedEl) {
            this.enginePanelRecommendedEl.classList.toggle('ert-hidden', !showRecommendedSection);
        }
        if (this.enginePanelAllLabelEl) {
            this.enginePanelAllLabelEl.classList.toggle('ert-hidden', !showRecommendedSection);
        }

        if (this.enginePanelGuardEl) {
            const showGuard = Boolean(this.pendingGuardQuestion) && tokenTier === 'red';
            this.enginePanelGuardEl.classList.toggle('ert-hidden', !showGuard);
        }

        this.syncEngineNextRunToggle(tokenTier);
        this.syncEngineDefaultButtonState();

        if (!choices.length) {
            this.enginePanelListEl.createDiv({ cls: 'ert-inquiry-engine-empty', text: 'No models configured yet.' });
            return;
        }

        if (showRecommendedSection && this.enginePanelRecommendedListEl) {
            this.renderEngineChoices(this.enginePanelRecommendedListEl, recommendedChoices, {
                tokenTier,
                recommendedKeys,
                layout: 'pill'
            });
        }

        this.renderEngineChoices(this.enginePanelListEl, choices, {
            tokenTier,
            recommendedKeys,
            layout: 'select'
        });
    }

    private async applyEngineChoice(choice: { provider: EngineProvider; modelId: string }): Promise<void> {
        this.plugin.settings.defaultAiProvider = choice.provider;
        if (choice.provider === 'anthropic') this.plugin.settings.anthropicModelId = choice.modelId;
        if (choice.provider === 'gemini') this.plugin.settings.geminiModelId = choice.modelId;
        if (choice.provider === 'openai') this.plugin.settings.openaiModelId = choice.modelId;
        if (choice.provider === 'local') this.plugin.settings.localModelId = choice.modelId;
        this.nextRunEngineOverride = undefined;
        await this.plugin.saveSettings();
        this.updateEngineBadge();
    }

    private toggleEngineNextRunOnly(): void {
        const next = !(this.engineNextRunOnly ?? false);
        this.engineNextRunOnly = next;
        this.engineNextRunOnlyTouched = true;
        if (this.enginePanelNextRunToggle) {
            this.enginePanelNextRunToggle.classList.toggle('is-active', next);
            this.enginePanelNextRunToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
        }
    }

    private syncEngineNextRunToggle(tokenTier: TokenTier): void {
        if (!this.engineNextRunOnlyTouched) {
            this.engineNextRunOnly = tokenTier === 'red';
        }
        if (this.enginePanelNextRunToggle) {
            const active = this.engineNextRunOnly ?? false;
            this.enginePanelNextRunToggle.classList.toggle('is-active', active);
            this.enginePanelNextRunToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    private syncEngineDefaultButtonState(): void {
        if (!this.enginePanelSetDefaultButton) return;
        const canCommit = Boolean(this.nextRunEngineOverride);
        this.enginePanelSetDefaultButton.classList.toggle('is-disabled', !canCommit);
        this.enginePanelSetDefaultButton.setAttribute('aria-disabled', canCommit ? 'false' : 'true');
    }

    private setNextRunEngineOverride(choice: EngineChoice): void {
        this.nextRunEngineOverride = {
            provider: choice.provider,
            providerLabel: choice.providerLabel,
            modelId: choice.modelId,
            modelLabel: choice.modelLabel
        };
        this.syncEngineDefaultButtonState();
    }

    private async commitEngineOverrideAsDefault(): Promise<void> {
        if (!this.nextRunEngineOverride) return;
        const { provider, modelId } = this.nextRunEngineOverride;
        await this.applyEngineChoice({ provider, modelId });
        this.syncEngineDefaultButtonState();
    }

    private async handleEngineChoiceClick(choice: EngineChoice): Promise<void> {
        if (!choice.enabled) return;
        if (this.engineNextRunOnly) {
            this.setNextRunEngineOverride(choice);
        } else {
            await this.applyEngineChoice({ provider: choice.provider, modelId: choice.modelId });
        }
        this.refreshEnginePanel();
        if (this.pendingGuardQuestion) {
            const pending = this.pendingGuardQuestion;
            this.pendingGuardQuestion = undefined;
            this.hideEnginePanel();
            await this.runInquiry(pending, { bypassTokenGuard: true });
        }
    }

    private async handleRunAnywayClick(): Promise<void> {
        if (!this.pendingGuardQuestion) return;
        const pending = this.pendingGuardQuestion;
        this.pendingGuardQuestion = undefined;
        this.hideEnginePanel();
        this.nextRunEngineOverride = undefined;
        this.syncEngineDefaultButtonState();
        await this.runInquiry(pending, { bypassTokenGuard: true, ignoreNextRunOverride: true });
    }

    private renderEngineChoices(
        listEl: HTMLDivElement,
        choices: EngineChoice[],
        options: { tokenTier: TokenTier; recommendedKeys: Set<string>; layout?: 'pill' | 'select' }
    ): void {
        const showTruncateWarning = options.tokenTier === 'red';
        const layout = options.layout ?? 'pill';
        choices.forEach(choice => {
            const key = `${choice.provider}::${choice.modelId}`;
            if (layout === 'select') {
                const item = listEl.createDiv({ cls: 'ert-inquiry-engine-item ert-inquiry-engine-item--select' });
                if (choice.isActive) item.classList.add('is-active');
                if (!choice.enabled) item.classList.add('is-disabled');
                const main = item.createDiv({ cls: 'ert-inquiry-engine-item-main' });
                main.createDiv({ cls: 'ert-inquiry-engine-item-title', text: `${choice.providerLabel} · ${choice.modelLabel}` });
                const metaParts = [choice.modelId];
                if (!choice.enabled && choice.disabledReason) {
                    metaParts.push(choice.disabledReason);
                } else if (showTruncateWarning && !options.recommendedKeys.has(key) && choice.enabled) {
                    metaParts.push('May truncate');
                }
                main.createDiv({ cls: 'ert-inquiry-engine-item-meta', text: metaParts.join(' · ') });

                const action = item.createDiv({ cls: 'ert-inquiry-engine-item-action' });
                const buttonLabel = !choice.enabled ? 'Unavailable' : choice.isActive ? 'Active' : 'Select';
                const selectButton = action.createEl('button', {
                    cls: 'ert-inquiry-engine-item-select',
                    text: buttonLabel,
                    attr: { type: 'button' }
                });
                if (choice.isActive) {
                    selectButton.classList.add('is-active');
                }
                if (!choice.enabled) {
                    selectButton.disabled = true;
                    selectButton.setAttribute('aria-disabled', 'true');
                }
                this.registerDomEvent(selectButton, 'click', (event: MouseEvent) => {
                    event.stopPropagation();
                    void this.handleEngineChoiceClick(choice);
                });
                this.registerDomEvent(item, 'click', (event: MouseEvent) => {
                    if ((event.target as HTMLElement).closest('.ert-inquiry-engine-item-select')) return;
                    void this.handleEngineChoiceClick(choice);
                });
                return;
            }

            const item = listEl.createEl('button', { cls: 'ert-inquiry-engine-item', attr: { type: 'button' } });
            if (choice.isActive) item.classList.add('is-active');
            if (!choice.enabled) item.classList.add('is-disabled');
            const textRow = item.createDiv({ cls: 'ert-inquiry-engine-item-row ert-inquiry-engine-item-row--text' });
            const main = textRow.createDiv({ cls: 'ert-inquiry-engine-item-main' });
            main.createDiv({ cls: 'ert-inquiry-engine-item-title', text: `${choice.providerLabel} · ${choice.modelLabel}` });
            main.createDiv({ cls: 'ert-inquiry-engine-item-meta', text: choice.modelId });
            const statuses: Array<{ label: string; tone?: 'active' | 'warning' }> = [];
            if (!choice.enabled && choice.disabledReason) {
                statuses.push({ label: choice.disabledReason });
            } else if (choice.isActive) {
                statuses.push({ label: 'Active', tone: 'active' });
            }
            if (showTruncateWarning && !options.recommendedKeys.has(key) && choice.enabled) {
                statuses.push({ label: 'May truncate', tone: 'warning' });
            }
            if (statuses.length) {
                const actionRow = item.createDiv({ cls: 'ert-inquiry-engine-item-row ert-inquiry-engine-item-row--actions' });
                const statusGroup = actionRow.createDiv({ cls: 'ert-inquiry-engine-item-statuses' });
                statuses.forEach(status => {
                    const statusEl = statusGroup.createDiv({ cls: 'ert-inquiry-engine-item-status', text: status.label });
                    if (status.tone) {
                        statusEl.classList.add(`is-${status.tone}`);
                    }
                });
            }
            this.registerDomEvent(item, 'click', (event: MouseEvent) => {
                event.stopPropagation();
                void this.handleEngineChoiceClick(choice);
            });
        });
    }

    private getEngineContextQuestion(): string | null {
        if (this.pendingGuardQuestion?.question) return this.pendingGuardQuestion.question;
        if (this.previewLast?.question) return this.previewLast.question;
        const activeQuestion = this.getQuestionTextById(this.state.activeQuestionId);
        return activeQuestion ?? null;
    }

    private pickRecommendedEngineChoices(choices: EngineChoice[]): EngineChoice[] {
        const enabled = choices.filter(choice => choice.enabled);
        if (!enabled.length) return [];
        const rank: EngineProvider[] = ['gemini', 'anthropic', 'openai', 'local'];
        const ranked = enabled.slice().sort((a, b) => rank.indexOf(a.provider) - rank.indexOf(b.provider));
        return ranked.slice(0, Math.min(2, ranked.length));
    }

    private showBriefingPanel(): void {
        if (!this.briefingPanelEl) return;
        this.cancelBriefingHide();
        this.refreshBriefingPanel();
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
        const blocked = this.isInquiryBlocked();
        if (!sessions.length) {
            this.briefingEmptyEl.classList.remove('ert-hidden');
            this.briefingFooterEl.classList.add('ert-hidden');
            return;
        }
        this.briefingEmptyEl.classList.add('ert-hidden');
        sessions.forEach(session => {
            const item = this.briefingListEl?.createDiv({ cls: 'ert-inquiry-briefing-item' });
            if (!item) return;
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
            const zoneLabel = this.resolveSessionZoneLabel(session);
            const lensLabel = this.resolveSessionLensLabel(session, zoneLabel);
            const header = `${zoneLabel} · ${lensLabel}`;
            main.createDiv({ cls: 'ert-inquiry-briefing-title-row', text: header });
            const metaText = `${this.formatSessionTime(session)} · ${this.formatSessionScope(session)}`;
            main.createDiv({ cls: 'ert-inquiry-briefing-meta', text: metaText });

            const actionRow = item.createDiv({ cls: 'ert-inquiry-briefing-row ert-inquiry-briefing-row--actions' });
            const status = this.resolveSessionStatus(session);
            const statusEl = actionRow.createDiv({
                cls: `ert-inquiry-briefing-status ert-inquiry-briefing-status--${status}`,
                text: status
            });
            statusEl.setAttribute('aria-label', `Session status: ${status}`);

            const pendingEditsApplied = !!session.pendingEditsApplied;
            const actionGroup = actionRow.createDiv({ cls: 'ert-inquiry-briefing-actions' });
            const updateBtn = actionGroup.createEl('button', {
                cls: 'ert-inquiry-briefing-update',
                attr: {
                    'aria-label': pendingEditsApplied ? 'Pending Edits updated' : 'Update Pending Edits'
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
        });

        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const activeStatus = activeSession ? this.resolveSessionStatus(activeSession) : null;
        const canSave = !!activeSession && activeStatus === 'unsaved';
        this.briefingSaveButton?.classList.toggle('ert-hidden', !canSave);
        this.briefingFooterEl.classList.remove('ert-hidden');
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

    private updateBriefingButtonState(): void {
        if (!this.artifactButton) return;
        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const status = activeSession ? this.resolveSessionStatus(activeSession) : null;
        this.artifactButton.classList.toggle('is-briefing-pulse', status === 'unsaved');
        this.artifactButton.classList.toggle('is-briefing-saved', status === 'saved');
        this.artifactButton.classList.toggle('is-briefing-error', status === 'error');
        const tooltip = status === 'unsaved'
            ? 'Briefing · Save latest brief'
            : 'Briefing · Recent inquiries';
        this.artifactButton.setAttribute('data-tooltip', this.balanceTooltipText(tooltip));
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
            this.notifyInteraction('Pending Edits already updated for this session.');
            return;
        }
        await this.writeInquiryPendingEdits(session, session.result, { notify: true });
    }

    private handleBriefingClearClick(): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait to clear sessions.');
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

    private async openBriefFromSession(session: InquirySession): Promise<void> {
        if (this.isInquiryBlocked()) return;
        if (!session.briefPath) return;
        const file = this.app.vault.getAbstractFileByPath(session.briefPath);
        if (file && file instanceof TFile) {
            await openOrRevealFile(this.app, file);
            return;
        }
        new Notice('Brief not found. It may have been moved or deleted.');
    }

    private createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
        return document.createElementNS(SVG_NS, tag);
    }

    private getInquiryAssetHref(fileName: string): string {
        const configDir = (this.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
        const pluginId = this.plugin.manifest.id;
        const assetPath = normalizePath(`${configDir}/plugins/${pluginId}/inquiry/assets/${fileName}`);
        const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };
        return adapter.getResourcePath ? adapter.getResourcePath(assetPath) : assetPath;
    }

    private createSvgGroup(parent: SVGElement, cls: string, x?: number, y?: number): SVGGElement {
        const group = this.createSvgElement('g');
        group.classList.add(...cls.split(' ').filter(Boolean));
        if (typeof x === 'number' || typeof y === 'number') {
            group.setAttribute('transform', `translate(${x ?? 0} ${y ?? 0})`);
        }
        parent.appendChild(group);
        return group;
    }

    private createSvgText(parent: SVGElement, cls: string, text: string, x: number, y: number): SVGTextElement {
        const textEl = this.createSvgElement('text');
        textEl.classList.add(...cls.split(' ').filter(Boolean));
        textEl.setAttribute('x', String(x));
        textEl.setAttribute('y', String(y));
        textEl.textContent = text;
        parent.appendChild(textEl);
        return textEl;
    }

    private clearSvgChildren(el: SVGElement): void {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
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
            'check-circle',
            'sigma',
            'x'
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
            const stop = this.createSvgElement('stop');
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
            const gradient = this.createSvgElement('radialGradient');
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

        const glassGradient = this.createSvgElement('radialGradient');
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
        const pillOutFilter = this.createSvgElement('filter');
        pillOutFilter.setAttribute('id', 'ert-inquiry-zone-pill-out');
        pillOutFilter.setAttribute('x', '-50%');
        pillOutFilter.setAttribute('y', '-50%');
        pillOutFilter.setAttribute('width', '200%');
        pillOutFilter.setAttribute('height', '200%');
        pillOutFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillOutLight = this.createSvgElement('feDropShadow');
        pillOutLight.setAttribute('dx', '-2');
        pillOutLight.setAttribute('dy', '-2');
        pillOutLight.setAttribute('stdDeviation', '1.6');
        pillOutLight.setAttribute('flood-color', '#ffffff');
        pillOutLight.setAttribute('flood-opacity', '0.28');
        const pillOutDark = this.createSvgElement('feDropShadow');
        pillOutDark.setAttribute('dx', '2');
        pillOutDark.setAttribute('dy', '2');
        pillOutDark.setAttribute('stdDeviation', '1.8');
        pillOutDark.setAttribute('flood-color', '#000000');
        pillOutDark.setAttribute('flood-opacity', '0.35');
        pillOutFilter.appendChild(pillOutLight);
        pillOutFilter.appendChild(pillOutDark);
        defs.appendChild(pillOutFilter);

        const pillInFilter = this.createSvgElement('filter');
        pillInFilter.setAttribute('id', 'ert-inquiry-zone-pill-in');
        pillInFilter.setAttribute('x', '-50%');
        pillInFilter.setAttribute('y', '-50%');
        pillInFilter.setAttribute('width', '200%');
        pillInFilter.setAttribute('height', '200%');
        pillInFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillInOffsetDark = this.createSvgElement('feOffset');
        pillInOffsetDark.setAttribute('in', 'SourceAlpha');
        pillInOffsetDark.setAttribute('dx', '1.6');
        pillInOffsetDark.setAttribute('dy', '1.6');
        pillInOffsetDark.setAttribute('result', 'pill-in-offset-dark');
        const pillInBlurDark = this.createSvgElement('feGaussianBlur');
        pillInBlurDark.setAttribute('in', 'pill-in-offset-dark');
        pillInBlurDark.setAttribute('stdDeviation', '1.2');
        pillInBlurDark.setAttribute('result', 'pill-in-blur-dark');
        const pillInCompositeDark = this.createSvgElement('feComposite');
        pillInCompositeDark.setAttribute('in', 'pill-in-blur-dark');
        pillInCompositeDark.setAttribute('in2', 'SourceAlpha');
        pillInCompositeDark.setAttribute('operator', 'arithmetic');
        pillInCompositeDark.setAttribute('k2', '-1');
        pillInCompositeDark.setAttribute('k3', '1');
        pillInCompositeDark.setAttribute('result', 'pill-in-inner-dark');
        const pillInFloodDark = this.createSvgElement('feFlood');
        pillInFloodDark.setAttribute('flood-color', '#000000');
        pillInFloodDark.setAttribute('flood-opacity', '0.35');
        pillInFloodDark.setAttribute('result', 'pill-in-flood-dark');
        const pillInShadowDark = this.createSvgElement('feComposite');
        pillInShadowDark.setAttribute('in', 'pill-in-flood-dark');
        pillInShadowDark.setAttribute('in2', 'pill-in-inner-dark');
        pillInShadowDark.setAttribute('operator', 'in');
        pillInShadowDark.setAttribute('result', 'pill-in-shadow-dark');

        const pillInOffsetLight = this.createSvgElement('feOffset');
        pillInOffsetLight.setAttribute('in', 'SourceAlpha');
        pillInOffsetLight.setAttribute('dx', '-1.6');
        pillInOffsetLight.setAttribute('dy', '-1.6');
        pillInOffsetLight.setAttribute('result', 'pill-in-offset-light');
        const pillInBlurLight = this.createSvgElement('feGaussianBlur');
        pillInBlurLight.setAttribute('in', 'pill-in-offset-light');
        pillInBlurLight.setAttribute('stdDeviation', '1.2');
        pillInBlurLight.setAttribute('result', 'pill-in-blur-light');
        const pillInCompositeLight = this.createSvgElement('feComposite');
        pillInCompositeLight.setAttribute('in', 'pill-in-blur-light');
        pillInCompositeLight.setAttribute('in2', 'SourceAlpha');
        pillInCompositeLight.setAttribute('operator', 'arithmetic');
        pillInCompositeLight.setAttribute('k2', '-1');
        pillInCompositeLight.setAttribute('k3', '1');
        pillInCompositeLight.setAttribute('result', 'pill-in-inner-light');
        const pillInFloodLight = this.createSvgElement('feFlood');
        pillInFloodLight.setAttribute('flood-color', '#ffffff');
        pillInFloodLight.setAttribute('flood-opacity', '0.22');
        pillInFloodLight.setAttribute('result', 'pill-in-flood-light');
        const pillInShadowLight = this.createSvgElement('feComposite');
        pillInShadowLight.setAttribute('in', 'pill-in-flood-light');
        pillInShadowLight.setAttribute('in2', 'pill-in-inner-light');
        pillInShadowLight.setAttribute('operator', 'in');
        pillInShadowLight.setAttribute('result', 'pill-in-shadow-light');

        const pillInMerge = this.createSvgElement('feMerge');
        const pillInMergeGraphic = this.createSvgElement('feMergeNode');
        pillInMergeGraphic.setAttribute('in', 'SourceGraphic');
        const pillInMergeDark = this.createSvgElement('feMergeNode');
        pillInMergeDark.setAttribute('in', 'pill-in-shadow-dark');
        const pillInMergeLight = this.createSvgElement('feMergeNode');
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
        const dotUpFilter = this.createSvgElement('filter');
        dotUpFilter.setAttribute('id', 'ert-inquiry-zone-dot-up');
        dotUpFilter.setAttribute('x', '-50%');
        dotUpFilter.setAttribute('y', '-50%');
        dotUpFilter.setAttribute('width', '200%');
        dotUpFilter.setAttribute('height', '200%');
        dotUpFilter.setAttribute('color-interpolation-filters', 'sRGB');

        const dotUpFlood = this.createSvgElement('feFlood');
        dotUpFlood.setAttribute('flood-opacity', '0');
        dotUpFlood.setAttribute('result', 'BackgroundImageFix');
        const dotUpAlphaDark = this.createSvgElement('feColorMatrix');
        dotUpAlphaDark.setAttribute('in', 'SourceAlpha');
        dotUpAlphaDark.setAttribute('type', 'matrix');
        dotUpAlphaDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaDark.setAttribute('result', 'hardAlpha');
        const dotUpOffsetDark = this.createSvgElement('feOffset');
        dotUpOffsetDark.setAttribute('dx', '2');
        dotUpOffsetDark.setAttribute('dy', '2');
        const dotUpBlurDark = this.createSvgElement('feGaussianBlur');
        dotUpBlurDark.setAttribute('stdDeviation', '2');
        const dotUpCompositeDark = this.createSvgElement('feComposite');
        dotUpCompositeDark.setAttribute('in2', 'hardAlpha');
        dotUpCompositeDark.setAttribute('operator', 'out');
        const dotUpColorDark = this.createSvgElement('feColorMatrix');
        dotUpColorDark.setAttribute('type', 'matrix');
        dotUpColorDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0');
        const dotUpBlendDark = this.createSvgElement('feBlend');
        dotUpBlendDark.setAttribute('mode', 'normal');
        dotUpBlendDark.setAttribute('in2', 'BackgroundImageFix');
        dotUpBlendDark.setAttribute('result', 'effect1_dropShadow');

        const dotUpAlphaLight = this.createSvgElement('feColorMatrix');
        dotUpAlphaLight.setAttribute('in', 'SourceAlpha');
        dotUpAlphaLight.setAttribute('type', 'matrix');
        dotUpAlphaLight.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaLight.setAttribute('result', 'hardAlpha');
        const dotUpOffsetLight = this.createSvgElement('feOffset');
        dotUpOffsetLight.setAttribute('dx', '-2');
        dotUpOffsetLight.setAttribute('dy', '-2');
        const dotUpBlurLight = this.createSvgElement('feGaussianBlur');
        dotUpBlurLight.setAttribute('stdDeviation', '3');
        const dotUpCompositeLight = this.createSvgElement('feComposite');
        dotUpCompositeLight.setAttribute('in2', 'hardAlpha');
        dotUpCompositeLight.setAttribute('operator', 'out');
        const dotUpColorLight = this.createSvgElement('feColorMatrix');
        dotUpColorLight.setAttribute('type', 'matrix');
        dotUpColorLight.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.11 0');
        const dotUpBlendLight = this.createSvgElement('feBlend');
        dotUpBlendLight.setAttribute('mode', 'normal');
        dotUpBlendLight.setAttribute('in2', 'effect1_dropShadow');
        dotUpBlendLight.setAttribute('result', 'effect2_dropShadow');
        const dotUpBlendShape = this.createSvgElement('feBlend');
        dotUpBlendShape.setAttribute('mode', 'normal');
        dotUpBlendShape.setAttribute('in', 'SourceGraphic');
        dotUpBlendShape.setAttribute('in2', 'effect2_dropShadow');
        dotUpBlendShape.setAttribute('result', 'shape');

        const dotUpAlphaInnerDark = this.createSvgElement('feColorMatrix');
        dotUpAlphaInnerDark.setAttribute('in', 'SourceAlpha');
        dotUpAlphaInnerDark.setAttribute('type', 'matrix');
        dotUpAlphaInnerDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaInnerDark.setAttribute('result', 'hardAlpha');
        const dotUpOffsetInnerDark = this.createSvgElement('feOffset');
        dotUpOffsetInnerDark.setAttribute('dx', '-2');
        dotUpOffsetInnerDark.setAttribute('dy', '-2');
        const dotUpBlurInnerDark = this.createSvgElement('feGaussianBlur');
        dotUpBlurInnerDark.setAttribute('stdDeviation', '1');
        const dotUpCompositeInnerDark = this.createSvgElement('feComposite');
        dotUpCompositeInnerDark.setAttribute('in2', 'hardAlpha');
        dotUpCompositeInnerDark.setAttribute('operator', 'arithmetic');
        dotUpCompositeInnerDark.setAttribute('k2', '-1');
        dotUpCompositeInnerDark.setAttribute('k3', '1');
        const dotUpColorInnerDark = this.createSvgElement('feColorMatrix');
        dotUpColorInnerDark.setAttribute('type', 'matrix');
        dotUpColorInnerDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.17 0');
        const dotUpBlendInnerDark = this.createSvgElement('feBlend');
        dotUpBlendInnerDark.setAttribute('mode', 'normal');
        dotUpBlendInnerDark.setAttribute('in2', 'shape');
        dotUpBlendInnerDark.setAttribute('result', 'effect3_innerShadow');

        const dotUpAlphaInnerLight = this.createSvgElement('feColorMatrix');
        dotUpAlphaInnerLight.setAttribute('in', 'SourceAlpha');
        dotUpAlphaInnerLight.setAttribute('type', 'matrix');
        dotUpAlphaInnerLight.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaInnerLight.setAttribute('result', 'hardAlpha');
        const dotUpOffsetInnerLight = this.createSvgElement('feOffset');
        dotUpOffsetInnerLight.setAttribute('dx', '2');
        dotUpOffsetInnerLight.setAttribute('dy', '2');
        const dotUpBlurInnerLight = this.createSvgElement('feGaussianBlur');
        dotUpBlurInnerLight.setAttribute('stdDeviation', '1');
        const dotUpCompositeInnerLight = this.createSvgElement('feComposite');
        dotUpCompositeInnerLight.setAttribute('in2', 'hardAlpha');
        dotUpCompositeInnerLight.setAttribute('operator', 'arithmetic');
        dotUpCompositeInnerLight.setAttribute('k2', '-1');
        dotUpCompositeInnerLight.setAttribute('k3', '1');
        const dotUpColorInnerLight = this.createSvgElement('feColorMatrix');
        dotUpColorInnerLight.setAttribute('type', 'matrix');
        dotUpColorInnerLight.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.17 0');
        const dotUpBlendInnerLight = this.createSvgElement('feBlend');
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
        const dotDownFilter = this.createSvgElement('filter');
        dotDownFilter.setAttribute('id', 'ert-inquiry-zone-dot-down');
        dotDownFilter.setAttribute('x', '-50%');
        dotDownFilter.setAttribute('y', '-50%');
        dotDownFilter.setAttribute('width', '200%');
        dotDownFilter.setAttribute('height', '200%');
        dotDownFilter.setAttribute('color-interpolation-filters', 'sRGB');

        const dotDownOffsetDark = this.createSvgElement('feOffset');
        dotDownOffsetDark.setAttribute('in', 'SourceAlpha');
        dotDownOffsetDark.setAttribute('dx', '3.2');
        dotDownOffsetDark.setAttribute('dy', '3.2');
        dotDownOffsetDark.setAttribute('result', 'dot-down-offset-dark');
        const dotDownBlurDark = this.createSvgElement('feGaussianBlur');
        dotDownBlurDark.setAttribute('in', 'dot-down-offset-dark');
        dotDownBlurDark.setAttribute('stdDeviation', '2.4');
        dotDownBlurDark.setAttribute('result', 'dot-down-blur-dark');
        const dotDownCompositeDark = this.createSvgElement('feComposite');
        dotDownCompositeDark.setAttribute('in', 'dot-down-blur-dark');
        dotDownCompositeDark.setAttribute('in2', 'SourceAlpha');
        dotDownCompositeDark.setAttribute('operator', 'arithmetic');
        dotDownCompositeDark.setAttribute('k2', '-1');
        dotDownCompositeDark.setAttribute('k3', '1');
        dotDownCompositeDark.setAttribute('result', 'dot-down-inner-dark');
        const dotDownFloodDark = this.createSvgElement('feFlood');
        dotDownFloodDark.setAttribute('flood-color', '#000000');
        dotDownFloodDark.setAttribute('flood-opacity', '0.35');
        dotDownFloodDark.setAttribute('result', 'dot-down-flood-dark');
        const dotDownShadowDark = this.createSvgElement('feComposite');
        dotDownShadowDark.setAttribute('in', 'dot-down-flood-dark');
        dotDownShadowDark.setAttribute('in2', 'dot-down-inner-dark');
        dotDownShadowDark.setAttribute('operator', 'in');
        dotDownShadowDark.setAttribute('result', 'dot-down-shadow-dark');

        const dotDownOffsetLight = this.createSvgElement('feOffset');
        dotDownOffsetLight.setAttribute('in', 'SourceAlpha');
        dotDownOffsetLight.setAttribute('dx', '-3.2');
        dotDownOffsetLight.setAttribute('dy', '-3.2');
        dotDownOffsetLight.setAttribute('result', 'dot-down-offset-light');
        const dotDownBlurLight = this.createSvgElement('feGaussianBlur');
        dotDownBlurLight.setAttribute('in', 'dot-down-offset-light');
        dotDownBlurLight.setAttribute('stdDeviation', '2.4');
        dotDownBlurLight.setAttribute('result', 'dot-down-blur-light');
        const dotDownCompositeLight = this.createSvgElement('feComposite');
        dotDownCompositeLight.setAttribute('in', 'dot-down-blur-light');
        dotDownCompositeLight.setAttribute('in2', 'SourceAlpha');
        dotDownCompositeLight.setAttribute('operator', 'arithmetic');
        dotDownCompositeLight.setAttribute('k2', '-1');
        dotDownCompositeLight.setAttribute('k3', '1');
        dotDownCompositeLight.setAttribute('result', 'dot-down-inner-light');
        const dotDownFloodLight = this.createSvgElement('feFlood');
        dotDownFloodLight.setAttribute('flood-color', '#ffffff');
        dotDownFloodLight.setAttribute('flood-opacity', '0.22');
        dotDownFloodLight.setAttribute('result', 'dot-down-flood-light');
        const dotDownShadowLight = this.createSvgElement('feComposite');
        dotDownShadowLight.setAttribute('in', 'dot-down-flood-light');
        dotDownShadowLight.setAttribute('in2', 'dot-down-inner-light');
        dotDownShadowLight.setAttribute('operator', 'in');
        dotDownShadowLight.setAttribute('result', 'dot-down-shadow-light');

        const dotDownMerge = this.createSvgElement('feMerge');
        const dotDownMergeGraphic = this.createSvgElement('feMergeNode');
        dotDownMergeGraphic.setAttribute('in', 'SourceGraphic');
        const dotDownMergeDark = this.createSvgElement('feMergeNode');
        dotDownMergeDark.setAttribute('in', 'dot-down-shadow-dark');
        const dotDownMergeLight = this.createSvgElement('feMergeNode');
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

        const backboneGradient = this.createSvgElement('linearGradient');
        backboneGradient.setAttribute('id', 'ert-inquiry-minimap-backbone-grad');
        backboneGradient.setAttribute('x1', '0%');
        backboneGradient.setAttribute('y1', '0%');
        backboneGradient.setAttribute('x2', '100%');
        backboneGradient.setAttribute('y2', '0%');
        const backboneGradientStops = [
            createStop('0%', '#ff9900'),
            createStop('50%', '#ffd36a'),
            createStop('100%', '#ff5e00')
        ];
        backboneGradientStops.forEach(stop => backboneGradient.appendChild(stop));
        this.minimapBackboneGradientStops = backboneGradientStops;
        defs.appendChild(backboneGradient);

        const backboneShine = this.createSvgElement('linearGradient');
        backboneShine.setAttribute('id', 'ert-inquiry-minimap-backbone-shine');
        backboneShine.setAttribute('x1', '0%');
        backboneShine.setAttribute('y1', '0%');
        backboneShine.setAttribute('x2', '100%');
        backboneShine.setAttribute('y2', '0%');
        const backboneShineStops = [
            createStop('0%', '#fff2cf', '0'),
            createStop('40%', '#fff7ea', '1'),
            createStop('60%', '#ffb34d', '0.9'),
            createStop('100%', '#fff2cf', '0')
        ];
        backboneShineStops.forEach(stop => backboneShine.appendChild(stop));
        this.minimapBackboneShineStops = backboneShineStops;
        defs.appendChild(backboneShine);

        if (!this.minimapBackboneClip) {
            const backboneClip = this.createSvgElement('clipPath');
            backboneClip.setAttribute('id', 'ert-inquiry-minimap-backbone-clip');
            backboneClip.setAttribute('clipPathUnits', 'userSpaceOnUse');
            const clipRect = this.createSvgElement('rect');
            backboneClip.appendChild(clipRect);
            defs.appendChild(backboneClip);
            this.minimapBackboneClip = backboneClip;
            this.minimapBackboneClipRect = clipRect;
        }
    }

    private createIconSymbol(defs: SVGDefsElement, iconName: string): string | null {
        const holder = document.createElement('span');
        setIcon(holder, iconName);
        const source = holder.querySelector('svg');
        if (!source) {
            if (iconName !== 'sigma') return null;
            const symbol = this.createSvgElement('symbol');
            const symbolId = `ert-icon-${iconName}`;
            symbol.setAttribute('id', symbolId);
            symbol.setAttribute('viewBox', '0 0 24 24');
            const text = this.createSvgElement('text');
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
        const symbol = this.createSvgElement('symbol');
        const symbolId = `ert-icon-${iconName}`;
        symbol.setAttribute('id', symbolId);
        symbol.setAttribute('viewBox', source.getAttribute('viewBox') || '0 0 24 24');
        Array.from(source.children).forEach(child => {
            if (child.tagName.toLowerCase() === 'title') return;
            symbol.appendChild(child.cloneNode(true));
        });
        defs.appendChild(symbol);
        return symbolId;
    }

    private createIconButton(
        parent: SVGElement,
        x: number,
        y: number,
        size: number,
        iconName: string,
        label: string,
        extraClass = ''
    ): SVGGElement {
        const group = this.createSvgGroup(parent, `ert-inquiry-icon-btn ${extraClass}`.trim(), x, y);
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', label);
        const rect = this.createSvgElement('rect');
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
        const use = this.createSvgElement('use');
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
                this.clearErrorStateForAction();
                if (this.state.isRunning) {
                    this.notifyInteraction('Inquiry running. Please wait.');
                    return;
                }
                this.setSelectedPrompt(zone, promptId);
                const prompt = this.getPromptOptions(zone)
                    .find(item => item.id === promptId);
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
        this.clearErrorStateForAction();
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
            const zoneEl = this.createSvgGroup(parent, `ert-inquiry-zone-pod ert-inquiry-zone--${zone.id}`, pos.x, pos.y);
            zoneEl.setAttribute('role', 'button');
            zoneEl.setAttribute('tabindex', '0');
            const bg = this.createSvgElement('rect');
            bg.classList.add('ert-inquiry-zone-pill');
            zoneEl.appendChild(bg);
            const glow = this.createSvgElement('rect');
            glow.classList.add('ert-inquiry-zone-pill-glow');
            zoneEl.appendChild(glow);

            const text = this.createSvgText(zoneEl, 'ert-inquiry-zone-pill-text', '', 0, 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('alignment-baseline', 'middle');

            this.zonePromptElements.set(zone.id, { group: zoneEl, bg, glow, text });

            this.registerDomEvent(zoneEl as unknown as HTMLElement, 'click', () => this.handlePromptClick(zone.id));
            this.registerDomEvent(zoneEl as unknown as HTMLElement, 'pointerenter', () => {
                if (this.isInquiryRunDisabled()) return;
                const prompt = this.getActivePrompt(zone.id);
                if (prompt) {
                    this.showPromptPreview(zone.id, this.state.mode, prompt.question);
                }
                this.setHoverText(this.buildZoneHoverText(zone.id));
            });
            this.registerDomEvent(zoneEl as unknown as HTMLElement, 'pointerleave', () => {
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
        const debugGroup = this.createSvgGroup(parent, 'ert-inquiry-debug');
        debugGroup.setAttribute('id', 'inq-debug');

        const rect = this.createSvgElement('rect');
        rect.classList.add('ert-inquiry-debug-frame');
        rect.setAttribute('x', String(VIEWBOX_MIN));
        rect.setAttribute('y', String(VIEWBOX_MIN));
        rect.setAttribute('width', String(VIEWBOX_SIZE));
        rect.setAttribute('height', String(VIEWBOX_SIZE));
        debugGroup.appendChild(rect);

        const xAxis = this.createSvgElement('line');
        xAxis.classList.add('ert-inquiry-debug-axis');
        xAxis.setAttribute('x1', String(VIEWBOX_MIN));
        xAxis.setAttribute('y1', '0');
        xAxis.setAttribute('x2', String(VIEWBOX_MAX));
        xAxis.setAttribute('y2', '0');
        debugGroup.appendChild(xAxis);

        const yAxis = this.createSvgElement('line');
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
                const xTick = this.createSvgElement('line');
                xTick.classList.add('ert-inquiry-debug-tick');
                xTick.setAttribute('x1', String(position));
                xTick.setAttribute('y1', String(-tickHalf));
                xTick.setAttribute('x2', String(position));
                xTick.setAttribute('y2', String(tickHalf));
                debugGroup.appendChild(xTick);

                const yTick = this.createSvgElement('line');
                yTick.classList.add('ert-inquiry-debug-tick');
                yTick.setAttribute('x1', String(-tickHalf));
                yTick.setAttribute('y1', String(position));
                yTick.setAttribute('x2', String(tickHalf));
                yTick.setAttribute('y2', String(position));
                debugGroup.appendChild(yTick);
            });
        });

        const label = this.createSvgText(debugGroup, 'ert-inquiry-debug-label', 'ORIGIN', 0, 0);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
    }

    private renderModeIcons(parent: SVGGElement): void {
        const iconOffsetY = -300;
        const iconSize = Math.round(VIEWBOX_SIZE * 0.25 * 0.7);
        const iconX = Math.round(-iconSize / 2);
        const viewBoxHalf = MODE_ICON_VIEWBOX / 2;
        const iconGroup = this.createSvgGroup(parent, 'ert-inquiry-mode-icons', 0, iconOffsetY);
        iconGroup.setAttribute('pointer-events', 'none');

        const createIcon = (cls: string, paths: string[], rotateDeg = 0): void => {
            const group = this.createSvgElement('svg');
            group.classList.add('ert-inquiry-mode-icon', cls);
            group.setAttribute('x', String(iconX));
            group.setAttribute('y', '0');
            group.setAttribute('width', String(iconSize));
            group.setAttribute('height', String(iconSize));
            group.setAttribute('viewBox', `${-viewBoxHalf} ${-viewBoxHalf} ${MODE_ICON_VIEWBOX} ${MODE_ICON_VIEWBOX}`);
            group.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            group.setAttribute('pointer-events', 'none');
            const transformGroup = this.createSvgElement('g');
            if (rotateDeg) {
                transformGroup.setAttribute('transform', `rotate(${rotateDeg})`);
            }
            const pathGroup = this.createSvgElement('g');
            pathGroup.setAttribute('transform', `translate(${-viewBoxHalf} ${-viewBoxHalf})`);
            paths.forEach(d => {
                const path = this.createSvgElement('path');
                path.setAttribute('d', d);
                pathGroup.appendChild(path);
            });
            transformGroup.appendChild(pathGroup);
            group.appendChild(transformGroup);
            iconGroup.appendChild(group);
        };

        createIcon('ert-inquiry-mode-icon--flow', FLOW_ICON_PATHS);
        createIcon('ert-inquiry-mode-icon--depth', DEPTH_ICON_PATHS, 90);
    }

    private renderWaveHeader(parent: SVGElement): void {
        const flowWidth = 2048;
        const flowOffsetY = 740;
        const targetWidth = VIEWBOX_SIZE * 0.5;
        const scale = targetWidth / flowWidth;
        const y = VIEWBOX_MIN + 50;
        const group = this.createSvgGroup(parent, 'ert-inquiry-wave-header');
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
            const path = this.createSvgElement('path');
            path.classList.add('ert-inquiry-wave-path');
            path.setAttribute('d', d);
            group.appendChild(path);
        });
    }


    private buildFindingsPanel(findingsGroup: SVGGElement, width: number, height: number): void {
        const bg = this.createSvgElement('rect');
        bg.classList.add('ert-inquiry-panel-bg');
        bg.setAttribute('width', String(width));
        bg.setAttribute('height', String(height));
        bg.setAttribute('rx', '22');
        bg.setAttribute('ry', '22');
        findingsGroup.appendChild(bg);

        this.createSvgText(findingsGroup, 'ert-inquiry-findings-title', 'Findings', 24, 36);
        this.detailsToggle = this.createIconButton(findingsGroup, width - 88, 14, 32, 'chevron-down', 'Toggle details', 'ert-inquiry-details-toggle');
        this.detailsIcon = this.detailsToggle.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerDomEvent(this.detailsToggle as unknown as HTMLElement, 'click', () => this.toggleDetails());

        this.detailsEl = this.createSvgGroup(findingsGroup, 'ert-inquiry-details ert-hidden', 24, 64);
        this.detailRows = [
            this.createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Corpus fingerprint: not available', 0, 0),
            this.createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Cache status: not available', 0, 20)
        ];

        this.summaryEl = this.createSvgText(findingsGroup, 'ert-inquiry-summary', 'No inquiry run yet.', 24, 120);
        this.verdictEl = this.createSvgText(findingsGroup, 'ert-inquiry-verdict', 'Run an inquiry to see verdicts.', 24, 144);

        this.findingsListEl = this.createSvgGroup(findingsGroup, 'ert-inquiry-findings-list', 24, 176);

        const previewY = height - 210;
        this.artifactPreviewEl = this.createSvgGroup(findingsGroup, 'ert-inquiry-report-preview ert-hidden', 24, previewY);
        this.artifactPreviewBg = this.createSvgElement('rect');
        this.artifactPreviewBg.classList.add('ert-inquiry-report-preview-bg');
        this.artifactPreviewBg.setAttribute('width', String(width - 48));
        this.artifactPreviewBg.setAttribute('height', '180');
        this.artifactPreviewBg.setAttribute('rx', '14');
        this.artifactPreviewBg.setAttribute('ry', '14');
        this.artifactPreviewEl.appendChild(this.artifactPreviewBg);
    }

    private refreshUI(): void {
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
        this.updateRunningState();
        this.updateBriefingButtonState();
        this.refreshBriefingPanel();
        this.updateGuidance();
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
        this.scopeToggleButton?.setAttribute('aria-label', this.state.scope === 'saga' ? 'Saga scope' : 'Book scope');
    }

    private updateModeToggle(): void {
        this.updateToggleButton(this.modeToggleButton, this.state.mode === 'depth');
        if (this.modeToggleIcon) {
            const icon = this.state.mode === 'depth' ? 'waves-arrow-down' : 'waves';
            this.setIconUse(this.modeToggleIcon, icon);
        }
        this.modeToggleButton?.setAttribute('aria-label', this.state.mode === 'depth' ? 'Depth mode' : 'Flow mode');
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
        const modelLabel = this.getActiveInquiryModelLabel();
        const providerLabel = this.getActiveInquiryProviderLabel();
        const tooltip = `AI Engine · ${providerLabel} · ${modelLabel}`;
        this.engineBadgeGroup.setAttribute('aria-label', tooltip);
        if (this.enginePanelMetaEl) {
            this.enginePanelMetaEl.setText(`Active: ${providerLabel} · ${modelLabel}`);
        }
        this.refreshEnginePanel();
    }

    private getActiveInquiryModelId(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        const clean = (value: string) => value.replace(/^models\//, '').trim();
        if (provider === 'anthropic') {
            return clean(this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929');
        }
        if (provider === 'gemini') {
            return clean(this.plugin.settings.geminiModelId || 'gemini-pro-latest');
        }
        if (provider === 'local') {
            return clean(this.plugin.settings.localModelId || 'local-model');
        }
        return clean(this.plugin.settings.openaiModelId || 'gpt-5.2-chat-latest');
    }

    private getActiveInquiryProviderLabel(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        const labels: Record<EngineProvider, string> = {
            anthropic: 'Anthropic',
            gemini: 'Gemini',
            openai: 'OpenAI',
            local: 'Local'
        };
        return labels[provider as EngineProvider] || 'OpenAI';
    }

    private getActiveInquiryModelLabel(): string {
        const modelId = this.getActiveInquiryModelId();
        return modelId ? getModelDisplayName(modelId.replace(/^models\//, '')) : 'Unknown model';
    }

    private resolveEngineSelectionForRun(ignoreOverride?: boolean): {
        provider: EngineProvider;
        modelId: string;
        modelLabel: string;
        nextRunOnly: boolean;
        usedOverride: boolean;
    } {
        if (!ignoreOverride && this.nextRunEngineOverride) {
            return {
                provider: this.nextRunEngineOverride.provider,
                modelId: this.nextRunEngineOverride.modelId,
                modelLabel: this.nextRunEngineOverride.modelLabel,
                nextRunOnly: true,
                usedOverride: true
            };
        }
        const provider = (this.plugin.settings.defaultAiProvider || 'openai') as EngineProvider;
        return {
            provider,
            modelId: this.getActiveInquiryModelId(),
            modelLabel: this.getActiveInquiryModelLabel(),
            nextRunOnly: false,
            usedOverride: false
        };
    }

    private getClassScopeConfig(raw?: string[]): { allowAll: boolean; allowed: Set<string> } {
        const list = (raw || []).map(entry => entry.trim().toLowerCase()).filter(Boolean);
        const allowAll = list.includes('/');
        const allowed = new Set(list.filter(entry => entry !== '/'));
        return { allowAll, allowed };
    }

    private openAiSettings(): void {
        if (this.plugin.settingsTab) {
            this.plugin.settingsTab.setActiveTab('core');
        }
        // SAFE: any type used for accessing Obsidian's internal settings API
        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById('radial-timeline');
        }
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
        const prior = this.lastFocusSceneByBookId.get(bookId);
        if (prior && scenes.some(scene => scene.id === prior)) {
            return prior;
        }
        return scenes[0]?.id;
    }

    private isSceneFile(file: TFile): boolean {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return false;
        const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const classValues = this.extractClassValues(normalized);
        return classValues.includes('scene');
    }

    private async refreshMinimapEmptyStates(items: InquiryCorpusItem[]): Promise<void> {
        const updateId = ++this.minimapEmptyUpdateId;
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
                const stats = await this.loadCorpusCcStats(scenePath);
                return stats.words;
            }

            const rootPath = (item as { rootPath?: string }).rootPath;
            if (rootPath) {
                const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
                if (rootFile && this.isTFile(rootFile)) {
                    const stats = await this.loadCorpusCcStats(rootPath);
                    return stats.words;
                }
                const scenePaths = getScenePathsForBook(rootPath);
                if (!scenePaths.length) return 0;
                const stats = await Promise.all(scenePaths.map(path => this.loadCorpusCcStats(path)));
                return stats.reduce((sum, stat) => sum + stat.words, 0);
            }

            const fallbackPaths = item.filePaths ?? [];
            if (!fallbackPaths.length) return 0;
            const stats = await Promise.all(fallbackPaths.map(path => this.loadCorpusCcStats(path)));
            return stats.reduce((sum, stat) => sum + stat.words, 0);
        }));

        if (updateId !== this.minimapEmptyUpdateId) return;

        wordCounts.forEach((wordCount, idx) => {
            const tick = this.minimapTicks[idx];
            if (!tick) return;
            tick.classList.toggle('is-empty', wordCount < emptyMax);
        });
    }

    private logInquirySvgDebug(): void {
        const svg = this.rootSvg;
        const viewBox = svg?.getAttribute('viewBox');
        const frame = svg?.querySelector('.ert-inquiry-svg-frame');
        const rings = svg?.querySelectorAll('.ert-inquiry-ring-progress')?.length || 0;
        console.info('[Inquiry] SVG debug', {
            hasSvg: !!svg,
            viewBox,
            hasFrame: !!frame,
            ringCount: rings
        });
    }

    private renderMinimapTicks(): void {
        if (!this.minimapTicksEl || !this.minimapLayout || !this.minimapBaseline) return;
        this.clearSvgChildren(this.minimapTicksEl);
        this.minimapTicks = [];
        this.minimapSweepTicks = [];

        const items = this.getCurrentItems();
        const count = items.length;
        const length = this.minimapLayout.length;
        const tickSize = 20;
        const tickWidth = Math.max(12, Math.round(tickSize * 0.7));
        const tickHeight = Math.max(tickWidth + 4, Math.round(tickWidth * 1.45));
        const tickGap = 4;
        const capWidth = 2;
        const capHeight = Math.max(30, tickHeight + 12);
        const capHalfWidth = Math.round(capWidth / 2);
        const capHalfHeight = Math.round(capHeight / 2);
        const edgeScenePadding = tickWidth;
        const tickInset = capWidth + (tickWidth / 2) + 4 + edgeScenePadding;
        const availableLength = Math.max(0, length - (tickInset * 2));
        const maxRowWidth = VIEWBOX_SIZE * 0.75;
        const minStep = tickWidth + tickGap;
        const isSaga = this.state.scope === 'saga';
        const needsWrap = count > 1 && ((availableLength / (count - 1)) < minStep || (count * minStep) > maxRowWidth);
        const rowCount = isSaga ? 1 : (needsWrap ? 2 : 1);
        const firstRowCount = rowCount === 2 ? Math.ceil(count / 2) : count;
        const secondRowCount = count - firstRowCount;
        const columnCount = rowCount === 2 ? firstRowCount : count;
        const rawColumnStep = columnCount > 1 ? (availableLength / (columnCount - 1)) : 0;
        const columnStep = columnCount > 1 ? Math.max(1, Math.floor(rawColumnStep)) : 0;
        const usedLength = columnStep * Math.max(0, columnCount - 1);
        const extraSpace = Math.max(0, availableLength - usedLength);
        const startOffset = Math.floor(extraSpace / 2);
        const verticalGap = 10;
        const baselineGap = verticalGap;
        const rowGap = verticalGap;
        const rowTopY = -(baselineGap + tickHeight + (rowCount === 2 ? (tickHeight + rowGap) : 0));
        const rowBottomY = -(baselineGap + tickHeight);

        const baselineStart = Math.round(this.minimapLayout.startX);
        const baselineEnd = Math.round(this.minimapLayout.startX + length);
        this.minimapBaseline.setAttribute('x1', String(baselineStart));
        this.minimapBaseline.setAttribute('y1', '0');
        this.minimapBaseline.setAttribute('x2', String(baselineEnd));
        this.minimapBaseline.setAttribute('y2', '0');
        if (this.minimapEndCapStart && this.minimapEndCapEnd) {
            this.minimapEndCapStart.setAttribute('x', String(baselineStart - capHalfWidth));
            this.minimapEndCapStart.setAttribute('y', String(-capHalfHeight));
            this.minimapEndCapStart.setAttribute('width', String(Math.round(capWidth)));
            this.minimapEndCapStart.setAttribute('height', String(Math.round(capHeight)));
            this.minimapEndCapEnd.setAttribute('x', String(baselineEnd - capHalfWidth));
            this.minimapEndCapEnd.setAttribute('y', String(-capHalfHeight));
            this.minimapEndCapEnd.setAttribute('width', String(Math.round(capWidth)));
            this.minimapEndCapEnd.setAttribute('height', String(Math.round(capHeight)));
        }
        this.minimapBottomOffset = capHalfHeight;
        this.minimapTicksEl.setAttribute('transform', `translate(${baselineStart} 0)`);
        this.renderMinimapBackbone(baselineStart, length);

        if (!count) {
            this.minimapBackboneGroup?.setAttribute('display', 'none');
            this.renderCorpusCcStrip();
            this.updateMinimapFocus();
            this.updatePreviewPanelPosition();
            return;
        }

        this.minimapBackboneGroup?.removeAttribute('display');
        const tickCorner = Math.max(2, Math.round(tickWidth * 0.18));
        const foldSize = Math.max(3, Math.round(tickWidth * 0.5));
        const tickLayouts: Array<{ x: number; y: number; width: number; height: number; rowIndex: number }> = [];

        for (let i = 0; i < count; i += 1) {
            const item = items[i];
            const rowIndex = rowCount === 2 && i >= firstRowCount ? 1 : 0;
            const colIndex = rowIndex === 0 ? i : (i - firstRowCount);
            const pos = columnCount > 1
                ? tickInset + startOffset + (columnStep * colIndex)
                : tickInset + startOffset + (availableLength / 2);
            const rowY = rowIndex === 0 ? rowTopY : rowBottomY;
            const x = Math.round(pos - (tickWidth / 2));
            const y = Math.round(rowY);
            const tick = this.createSvgGroup(this.minimapTicksEl, 'ert-inquiry-minimap-tick rt-tooltip-target', x, y);
            const base = this.createSvgElement('rect');
            base.classList.add('ert-inquiry-minimap-tick-base');
            base.setAttribute('x', '0');
            base.setAttribute('y', '0');
            base.setAttribute('width', String(tickWidth));
            base.setAttribute('height', String(tickHeight));
            base.setAttribute('rx', String(tickCorner));
            base.setAttribute('ry', String(tickCorner));
            const border = this.createSvgElement('rect');
            border.classList.add('ert-inquiry-minimap-tick-border');
            border.setAttribute('x', '0');
            border.setAttribute('y', '0');
            border.setAttribute('width', String(tickWidth));
            border.setAttribute('height', String(tickHeight));
            border.setAttribute('rx', String(tickCorner));
            border.setAttribute('ry', String(tickCorner));
            const fold = this.createSvgElement('path');
            fold.classList.add('ert-inquiry-minimap-tick-fold');
            fold.setAttribute('d', `M ${tickWidth - foldSize} 0 L ${tickWidth} 0 L ${tickWidth} ${foldSize} Z`);
            tick.appendChild(base);
            tick.appendChild(border);
            tick.appendChild(fold);
            const label = item.displayLabel;
            const fullLabel = this.getMinimapItemTitle(item) || label;
            tick.setAttribute('data-index', String(i + 1));
            tick.setAttribute('data-id', item.id);
            tick.setAttribute('data-label', label);
            tick.setAttribute('data-full-label', fullLabel);
            tick.setAttribute('data-tooltip', this.balanceTooltipText(fullLabel));
            tick.setAttribute('data-tooltip-placement', 'bottom');
            tick.setAttribute('data-tooltip-offset-y', '6');
            this.registerDomEvent(tick as unknown as HTMLElement, 'click', (event: MouseEvent) => {
                this.clearErrorStateForAction();
                if (this.state.isRunning) {
                    this.notifyInteraction('Inquiry running. Please wait.');
                    return;
                }
                if (this.state.scope === 'book') {
                    if (event.shiftKey) {
                        void this.openActiveBrief();
                        return;
                    }
                    void this.openSceneFromMinimap(item.id);
                    return;
                }
                this.drillIntoBook(item.id);
            });
            this.registerDomEvent(tick as unknown as HTMLElement, 'pointerenter', () => {
                if (this.state.isRunning) return;
                this.handleMinimapHover(label, fullLabel);
            });
            this.registerDomEvent(tick as unknown as HTMLElement, 'pointerleave', () => {
                this.clearHoverText();
                this.clearResultPreview();
            });
            this.minimapTicks.push(tick);
            tickLayouts.push({ x, y, width: tickWidth, height: tickHeight, rowIndex });
        }
        this.updatePreviewPanelPosition();

        this.buildMinimapSweepLayer(tickLayouts, tickWidth, length);
        void this.refreshMinimapEmptyStates(items);
        this.renderCorpusCcStrip();
        this.updateMinimapFocus();
    }

    private updatePreviewPanelPosition(): void {
        if (!this.previewGroup || !this.minimapGroup) return;
        const targetY = this.getPreviewPanelTargetY();
        if (!Number.isFinite(targetY)) return;
        this.previewGroup.setAttribute('transform', `translate(0 ${targetY})`);
        this.updateResultsFooterPosition(targetY);
    }

    private getPreviewPanelTargetY(): number {
        return MINIMAP_GROUP_Y
            + this.minimapBottomOffset
            + PREVIEW_PANEL_MINIMAP_GAP
            - PREVIEW_PANEL_PADDING_Y;
    }

    private renderMinimapBackbone(baselineStart: number, length: number): void {
        if (!this.minimapGroup) return;
        let backboneGroup = this.minimapBackboneGroup;
        if (!backboneGroup) {
            backboneGroup = this.createSvgGroup(this.minimapGroup, 'ert-inquiry-minimap-backbone');
            this.minimapBackboneGroup = backboneGroup;
            if (this.minimapTicksEl) {
                this.minimapGroup.insertBefore(backboneGroup, this.minimapTicksEl);
            }
        }

        const barHeight = 2;
        const barY = -1;
        const glowHeight = barHeight;
        const glowY = barY;
        const shineHeight = barHeight;
        const shineY = barY;
        this.minimapBackboneLayout = { startX: baselineStart, length, glowHeight, glowY, shineHeight, shineY };

        if (this.minimapBackboneClipRect) {
            this.minimapBackboneClipRect.setAttribute('x', baselineStart.toFixed(2));
            this.minimapBackboneClipRect.setAttribute('y', String(shineY));
            this.minimapBackboneClipRect.setAttribute('width', length.toFixed(2));
            this.minimapBackboneClipRect.setAttribute('height', String(shineHeight));
            this.minimapBackboneClipRect.setAttribute('rx', String(Math.round(shineHeight / 2)));
            this.minimapBackboneClipRect.setAttribute('ry', String(Math.round(shineHeight / 2)));
        }
        if (!backboneGroup.getAttribute('clip-path')) {
            backboneGroup.setAttribute('clip-path', 'url(#ert-inquiry-minimap-backbone-clip)');
        }

        let glow = this.minimapBackboneGlow;
        if (!glow) {
            glow = this.createSvgElement('rect');
            glow.classList.add('ert-inquiry-minimap-backbone-glow');
            backboneGroup.appendChild(glow);
            this.minimapBackboneGlow = glow;
        }

        let shine = this.minimapBackboneShine;
        if (!shine) {
            shine = this.createSvgElement('rect');
            shine.classList.add('ert-inquiry-minimap-backbone-shine');
            backboneGroup.appendChild(shine);
            this.minimapBackboneShine = shine;
        }

        glow.setAttribute('x', baselineStart.toFixed(2));
        glow.setAttribute('y', String(glowY));
        glow.setAttribute('width', length.toFixed(2));
        glow.setAttribute('height', String(glowHeight));
        glow.setAttribute('rx', String(Math.round(glowHeight / 2)));
        glow.setAttribute('ry', String(Math.round(glowHeight / 2)));

        shine.setAttribute('x', baselineStart.toFixed(2));
        shine.setAttribute('y', String(shineY));
        shine.setAttribute('width', length.toFixed(2));
        shine.setAttribute('height', String(shineHeight));
        shine.setAttribute('rx', String(Math.round(shineHeight / 2)));
        shine.setAttribute('ry', String(Math.round(shineHeight / 2)));
    }

    private buildMinimapSweepLayer(
        tickLayouts: Array<{ x: number; y: number; width: number; height: number; rowIndex: number }>,
        tickWidth: number,
        length: number
    ): void {
        if (!this.minimapTicksEl) return;
        this.minimapTicksEl.querySelector('.ert-inquiry-minimap-sweep')?.remove();
        const sweepGroup = this.createSvgGroup(this.minimapTicksEl, 'ert-inquiry-minimap-sweep');
        const inset = Math.max(3, Math.round(tickWidth * 0.28));
        tickLayouts.forEach(layout => {
            const inner = this.createSvgElement('rect');
            inner.classList.add('ert-inquiry-minimap-sweep-inner');
            inner.setAttribute('x', String(layout.x + inset));
            inner.setAttribute('y', String(layout.y + inset));
            inner.setAttribute('width', String(Math.max(4, layout.width - (inset * 2))));
            inner.setAttribute('height', String(Math.max(6, layout.height - (inset * 2))));
            inner.setAttribute('rx', '2');
            inner.setAttribute('ry', '2');
            inner.setAttribute('opacity', '0');
            sweepGroup.appendChild(inner);
            this.minimapSweepTicks.push({ rect: inner, centerX: layout.x + (layout.width / 2), rowIndex: layout.rowIndex });
        });
        this.minimapSweepLayout = {
            startX: -Math.max(tickWidth * 1.6, 36),
            endX: length + Math.max(tickWidth * 1.6, 36),
            bandWidth: Math.max(tickWidth * 1.6, 36)
        };
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
        const classes = Array.from(entriesByClass.entries())
            .map(([className, items]) => ({ className, items }))
            .sort((a, b) => (b.items.length - a.items.length) || a.className.localeCompare(b.className));

        if (!entries.length) {
            if (this.ccGroup) {
                this.ccGroup.classList.add('ert-hidden');
            }
            return;
        }

        if (!this.ccGroup) {
            this.ccGroup = this.createSvgGroup(this.rootSvg, 'ert-inquiry-cc');
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
            const classLayouts: Array<{ className: string; centerX: number; width: number }> = [];

            classes.forEach(group => {
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
                    className: group.className,
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

        if (!this.ccLabel) {
            this.ccLabel = this.createSvgText(this.ccGroup, 'ert-inquiry-cc-label', 'Corpus', 0, 0);
            this.ccLabel.setAttribute('text-anchor', 'middle');
            this.ccLabel.setAttribute('dominant-baseline', 'middle');
        }
        this.ccLabel.textContent = 'Corpus';
        this.ccLabel.setAttribute('x', String(Math.round((layout.rightBlockLeft + layout.rightBlockRight) / 2)));
        this.ccLabel.setAttribute('y', '0');

        if (!this.ccEmptyText) {
            this.ccEmptyText = this.createSvgText(this.ccGroup, 'ert-inquiry-cc-empty ert-hidden', 'No corpus data', 0, 0);
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
        const foldSize = Math.max(4, Math.round(layout.pageWidth * 0.5));

        const totalEntries = entries.length;
        while (this.ccSlots.length < totalEntries) {
            const group = this.createSvgGroup(this.ccGroup, 'ert-inquiry-cc-cell');
            const base = this.createSvgElement('rect');
            base.classList.add('ert-inquiry-cc-cell-base');
            const fill = this.createSvgElement('rect');
            fill.classList.add('ert-inquiry-cc-cell-fill');
            const border = this.createSvgElement('rect');
            border.classList.add('ert-inquiry-cc-cell-border');
            const icon = this.createSvgText(group, 'ert-inquiry-cc-cell-icon', '', 0, 0);
            icon.setAttribute('text-anchor', 'middle');
            icon.setAttribute('dominant-baseline', 'middle');
            const fold = this.createSvgElement('path');
            fold.classList.add('ert-inquiry-cc-cell-fold');
            group.appendChild(base);
            group.appendChild(fill);
            group.appendChild(border);
            group.appendChild(fold);
            group.appendChild(icon);
            this.registerDomEvent(group as unknown as HTMLElement, 'click', () => {
                if (this.state.isRunning) return;
                const filePath = group.getAttribute('data-file-path');
                if (!filePath) return;
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file && this.isTFile(file)) {
                    void openOrRevealFile(this.app, file);
                }
            });
            this.ccSlots.push({ group, base, fill, border, icon, fold });
        }

        this.ccSlots.forEach((slot, idx) => {
            if (idx >= totalEntries) {
                slot.group.classList.add('ert-hidden');
                return;
            }
            const placement = layout.placements[idx];
            slot.group.classList.remove('ert-hidden');
            slot.group.setAttribute('data-class', placement.entry.className);
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
            slot.fold.setAttribute('d', `M ${layout.pageWidth - foldSize} 0 L ${layout.pageWidth} 0 L ${layout.pageWidth} ${foldSize} Z`);
            slot.icon.setAttribute('x', String(Math.round(layout.pageWidth / 2)));
            slot.icon.setAttribute('y', String(Math.round(layout.pageHeight / 2)));
        });

        const titleTexts = this.ccClassLabels;
        while (titleTexts.length < layout.classLayouts.length) {
            const label = this.createSvgText(this.ccGroup, 'ert-inquiry-cc-class-label', '', 0, 0);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            titleTexts.push(label);
        }
        layout.classLayouts.forEach((group, idx) => {
            const labelEl = titleTexts[idx];
            const availableWidth = Math.max(4, group.width - layout.gap);
            labelEl.classList.remove('ert-hidden');
            const variants = this.getCorpusClassLabelVariants(group.className);
            labelEl.textContent = variants[0] ?? '';
            for (let i = 0; i < variants.length; i += 1) {
                labelEl.textContent = variants[i];
                if (labelEl.getComputedTextLength() <= availableWidth) break;
            }
            labelEl.setAttribute('x', String(group.centerX));
            labelEl.setAttribute('y', String(layout.titleY));
        });
        titleTexts.forEach((label, idx) => {
            if (idx < layout.classLayouts.length) return;
            label.classList.add('ert-hidden');
        });

        this.ccEntries = layout.layoutEntries;
        void this.updateCorpusCcData(layout.layoutEntries);
    }

    private getCorpusClassLabelVariants(className: string): string[] {
        const normalized = className.trim();
        if (!normalized) return ['Class', 'Cls', 'C'];
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

    private getCorpusCcEntries(): CorpusCcEntry[] {
        const manifest = this.buildCorpusManifest(this.state.activeQuestionId ?? 'cc-preview');
        return manifest.entries.map(entry => {
            const label = entry.path.split('/').pop() || entry.path;
            return {
                id: `${entry.class}:${entry.path}`,
                label,
                filePath: entry.path,
                className: entry.class
            };
        });
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
                return {
                    id: outline?.path || book.id,
                    label: book.displayLabel,
                    filePath: outline?.path || '',
                    className: 'outline'
                };
            }));
        }

        if (includeSagaOutlines) {
            const sagaOutline = sagaOutlines[0];
            entries.push({
                id: sagaOutline?.path || 'saga-outline',
                label: 'Saga',
                filePath: sagaOutline?.path || '',
                className: 'outline'
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

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            if (!inRoots(file.path)) return false;
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
        const stats = await Promise.all(entries.map(entry => this.loadCorpusCcStats(entry.filePath)));
        if (updateId !== this.ccUpdateId) return;
        stats.forEach((entryStats, idx) => {
            this.applyCorpusCcSlot(idx, entries[idx], entryStats);
        });
    }

    private applyCorpusCcSlot(
        index: number,
        entry: CorpusCcEntry,
        stats: { words: number; status?: 'todo' | 'working' | 'complete'; title?: string }
    ): void {
        const slot = this.ccSlots[index];
        if (!slot) return;
        const thresholds = this.getCorpusThresholds();
        const tier = this.getCorpusTier(stats.words, thresholds);
        const ratioBase = thresholds.substantiveMin > 0 ? (stats.words / thresholds.substantiveMin) : 0;
        const ratio = Math.min(Math.max(ratioBase, 0), 1);
        const pageHeight = this.ccLayout?.pageHeight ?? Math.round(CC_PAGE_BASE_SIZE * 1.45);
        const fillHeight = Math.round(pageHeight * ratio);
        slot.fill.setAttribute('height', String(fillHeight));
        slot.fill.setAttribute('y', String(pageHeight - fillHeight));

        slot.group.classList.remove(
            'is-tier-empty',
            'is-tier-bare',
            'is-tier-sketchy',
            'is-tier-medium',
            'is-tier-substantive',
            'is-status-todo',
            'is-status-working',
            'is-status-complete',
            'is-mismatch'
        );
        slot.group.classList.add(`is-tier-${tier}`);

        if (stats.status) {
            slot.group.classList.add(`is-status-${stats.status}`);
        }

        const statusIcon = this.getCorpusCcStatusIcon(stats.status);
        slot.icon.textContent = statusIcon;
        slot.icon.setAttribute('opacity', statusIcon ? '1' : '0');

        const highlightMismatch = this.plugin.settings.inquiryCorpusHighlightLowSubstanceComplete ?? true;
        const lowSubstance = stats.words < thresholds.sketchyMin;
        const isMismatch = highlightMismatch && stats.status === 'complete' && lowSubstance;
        if (isMismatch) {
            slot.group.classList.add('is-mismatch');
        }

        const tooltip = this.buildCorpusCcTooltip(entry, stats, thresholds, tier, isMismatch);
        slot.group.classList.add('rt-tooltip-target');
        slot.group.setAttribute('data-tooltip', tooltip);
        slot.group.setAttribute('data-tooltip-placement', 'left');
        slot.group.setAttribute('data-tooltip-offset-x', '10');
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
    ): 'empty' | 'bare' | 'sketchy' | 'medium' | 'substantive' {
        if (wordCount < thresholds.emptyMax) return 'empty';
        if (wordCount < thresholds.sketchyMin) return 'bare';
        if (wordCount < thresholds.mediumMin) return 'sketchy';
        if (wordCount < thresholds.substantiveMin) return 'medium';
        return 'substantive';
    }

    private async loadCorpusCcStats(
        filePath: string
    ): Promise<{ words: number; status?: 'todo' | 'working' | 'complete'; title?: string }> {
        if (!filePath) return { words: 0 };
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !this.isTFile(file)) return { words: 0 };
        const mtime = file.stat.mtime ?? 0;
        const status = this.getDocumentStatus(file);
        const title = this.getDocumentTitle(file);
        const cached = this.ccWordCache.get(filePath);
        if (cached && cached.mtime === mtime && cached.status === status && cached.title === title) {
            return { words: cached.words, status: cached.status, title: cached.title };
        }
        const content = await this.app.vault.cachedRead(file);
        const body = this.stripFrontmatter(content);
        const words = this.countWords(body);
        this.ccWordCache.set(filePath, { mtime, words, status, title });
        return { words, status, title };
    }

    private getDocumentStatus(file: TFile): 'todo' | 'working' | 'complete' | undefined {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return undefined;
        const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const raw = normalized['Status'];
        if (typeof raw !== 'string') return undefined;
        const value = raw.trim().toLowerCase();
        if (value === 'todo' || value === 'working' || value === 'complete') {
            return value;
        }
        return undefined;
    }

    private getCorpusCcStatusIcon(status?: 'todo' | 'working' | 'complete'): string {
        if (status === 'todo') return '☐';
        if (status === 'working') return '◐';
        if (status === 'complete') return '✓';
        return '';
    }

    private buildCorpusCcTooltip(
        entry: CorpusCcEntry,
        stats: { words: number; status?: 'todo' | 'working' | 'complete'; title?: string },
        thresholds: { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number },
        tier: 'empty' | 'bare' | 'sketchy' | 'medium' | 'substantive',
        isMismatch: boolean
    ): string {
        const tooltipTitle = stats.title || entry.label;
        const classInitial = entry.className?.trim().charAt(0).toLowerCase() || '?';
        const conditions: string[] = [];

        if (stats.status) {
            const statusLabel = `${stats.status.charAt(0).toUpperCase()}${stats.status.slice(1)}`;
            const statusIcon = this.getCorpusCcStatusIcon(stats.status);
            const statusBorderNote = stats.status === 'todo' ? ' (dashed border)' : '';
            const statusIconText = statusIcon ? ` ${statusIcon}` : '';
            conditions.push(`Status: ${statusLabel}${statusIconText}${statusBorderNote}`);
        }

        if (thresholds.substantiveMin > 0) {
            const fillPercent = Math.round((stats.words / thresholds.substantiveMin) * 100);
            conditions.push(`Fill: ${fillPercent}% of substantive (${stats.words} words)`);
        } else {
            conditions.push(`Fill: ${stats.words} words`);
        }

        const tierLabel = `${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
        conditions.push(`Tier: ${tierLabel}`);

        if (isMismatch) {
            conditions.push(`Alert: complete under ${thresholds.sketchyMin} words`);
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
        const matches = trimmed.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
        return matches ? matches.length : 0;
    }

    private parseRgbColor(value: string): RgbColor | null {
        const raw = value.trim();
        if (!raw) return null;
        if (raw.startsWith('#')) {
            const hex = raw.slice(1);
            if (hex.length === 3) {
                const r = Number.parseInt(hex[0] + hex[0], 16);
                const g = Number.parseInt(hex[1] + hex[1], 16);
                const b = Number.parseInt(hex[2] + hex[2], 16);
                return { r, g, b };
            }
            if (hex.length === 6) {
                const r = Number.parseInt(hex.slice(0, 2), 16);
                const g = Number.parseInt(hex.slice(2, 4), 16);
                const b = Number.parseInt(hex.slice(4, 6), 16);
                return { r, g, b };
            }
            return null;
        }
        const rgbMatch = raw.match(/rgb\(([^)]+)\)/i);
        const csv = (rgbMatch ? rgbMatch[1] : raw).split(',').map(part => part.trim());
        if (csv.length < 3) return null;
        const [r, g, b] = csv.map(part => Number.parseFloat(part));
        if ([r, g, b].some(v => Number.isNaN(v))) return null;
        return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    }

    private mixRgbColor(a: RgbColor, b: RgbColor, t: number): RgbColor {
        const clamped = Math.min(Math.max(t, 0), 1);
        return {
            r: Math.round(a.r + (b.r - a.r) * clamped),
            g: Math.round(a.g + (b.g - a.g) * clamped),
            b: Math.round(a.b + (b.b - a.b) * clamped)
        };
    }

    private toRgbString(color: RgbColor): string {
        return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }

    private getProAccentColor(): RgbColor {
        const root = document.documentElement;
        const styles = getComputedStyle(root);
        const rgbVar = styles.getPropertyValue('--rt-pro-color-rgb');
        const rgbFromVar = this.parseRgbColor(rgbVar);
        if (rgbFromVar) return rgbFromVar;
        const hexVar = styles.getPropertyValue('--rt-pro-color') || styles.getPropertyValue('--ert-pro-accent-color');
        return this.parseRgbColor(hexVar) ?? { r: 217, g: 70, b: 239 };
    }

    private getBackboneStartColors(): BackboneColors {
        return {
            gradient: [
                { r: 255, g: 153, b: 0 },
                { r: 255, g: 211, b: 106 },
                { r: 255, g: 94, b: 0 }
            ],
            shine: [
                { r: 255, g: 242, b: 207 },
                { r: 255, g: 247, b: 234 },
                { r: 255, g: 179, b: 77 },
                { r: 255, g: 242, b: 207 }
            ]
        };
    }

    private getBackboneTargetColors(isPro: boolean): BackboneColors {
        const base = isPro ? this.getProAccentColor() : { r: 34, g: 255, b: 120 };
        const bright = this.mixRgbColor(base, { r: 255, g: 255, b: 255 }, isPro ? 0.55 : 0.65);
        const deep = this.mixRgbColor(base, { r: 0, g: 0, b: 0 }, isPro ? 0.12 : 0.08);
        return {
            gradient: [base, bright, deep],
            shine: [
                this.mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.85),
                this.mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.95),
                this.mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.45),
                this.mixRgbColor(base, { r: 255, g: 255, b: 255 }, 0.85)
            ]
        };
    }

    private applyBackboneStopColors(gradientColors: RgbColor[], shineColors: RgbColor[]): void {
        gradientColors.forEach((color, idx) => {
            const stop = this.minimapBackboneGradientStops[idx];
            if (stop) stop.setAttribute('stop-color', this.toRgbString(color));
        });
        shineColors.forEach((color, idx) => {
            const stop = this.minimapBackboneShineStops[idx];
            if (stop) stop.setAttribute('stop-color', this.toRgbString(color));
        });
    }

    private applyBackboneColors(progress: number): void {
        if (!this.backboneStartColors || !this.backboneTargetColors) return;
        const gradientColors = this.backboneStartColors.gradient.map((color, idx) => {
            const target = this.backboneTargetColors?.gradient[idx] ?? color;
            return this.mixRgbColor(color, target, progress);
        });
        const shineColors = this.backboneStartColors.shine.map((color, idx) => {
            const target = this.backboneTargetColors?.shine[idx] ?? color;
            return this.mixRgbColor(color, target, progress);
        });
        this.applyBackboneStopColors(gradientColors, shineColors);
    }

    private applyBackboneOscillationColors(progress: number): void {
        if (!this.backboneOscillationColors) return;
        const { base, target } = this.backboneOscillationColors;
        const gradientColors = base.gradient.map((color, idx) => {
            const next = target.gradient[idx] ?? color;
            return this.mixRgbColor(color, next, progress);
        });
        const shineColors = base.shine.map((color, idx) => {
            const next = target.shine[idx] ?? color;
            return this.mixRgbColor(color, next, progress);
        });
        this.applyBackboneStopColors(gradientColors, shineColors);
    }

    private setBackboneFillProgress(progress: number, sweepProgress: number): void {
        if (!this.minimapBackboneLayout || !this.minimapBackboneGlow || !this.minimapBackboneShine) return;
        const clamped = Math.min(Math.max(progress, 0), 1);
        const length = this.minimapBackboneLayout.length;
        const filledWidth = length * clamped;
        const glowRadius = Math.min(this.minimapBackboneLayout.glowHeight / 2, Math.max(0, filledWidth / 2));
        this.minimapBackboneGlow.setAttribute('x', this.minimapBackboneLayout.startX.toFixed(2));
        this.minimapBackboneGlow.setAttribute('width', filledWidth.toFixed(2));
        this.minimapBackboneGlow.setAttribute('rx', String(Math.round(glowRadius)));
        this.minimapBackboneGlow.setAttribute('ry', String(Math.round(glowRadius)));

        const sweepWidthBase = Math.min(
            length,
            BACKBONE_SWEEP_MAX_WIDTH,
            Math.max(length * BACKBONE_SWEEP_WIDTH_RATIO, BACKBONE_SWEEP_MIN_WIDTH)
        );
        const sweepWidth = Math.min(filledWidth, sweepWidthBase);
        const sweepTravel = filledWidth + sweepWidth;
        const sweepOffset = (sweepTravel * Math.min(Math.max(sweepProgress, 0), 1)) - sweepWidth;
        const sweepX = this.minimapBackboneLayout.startX + sweepOffset;
        const shineRadius = Math.min(this.minimapBackboneLayout.shineHeight / 2, Math.max(0, sweepWidth / 2));
        this.minimapBackboneShine.setAttribute('x', sweepX.toFixed(2));
        this.minimapBackboneShine.setAttribute('width', sweepWidth.toFixed(2));
        this.minimapBackboneShine.setAttribute('rx', String(Math.round(shineRadius)));
        this.minimapBackboneShine.setAttribute('ry', String(Math.round(shineRadius)));
    }

    private updateBackbonePulse(elapsed: number): void {
        const fillProgress = Math.min(Math.max(elapsed / MIN_PROCESSING_MS, 0), 1);
        const sweepProgress = (elapsed % BACKBONE_SHINE_DURATION_MS) / BACKBONE_SHINE_DURATION_MS;
        this.setBackboneFillProgress(fillProgress, sweepProgress);
        if (elapsed < MIN_PROCESSING_MS || !this.backboneOscillationColors) {
            this.applyBackboneColors(fillProgress);
            return;
        }
        const phase = ((elapsed - MIN_PROCESSING_MS) / BACKBONE_OSCILLATION_MS) * Math.PI * 2 + this.backboneOscillationPhaseOffset;
        const oscillation = (Math.sin(phase) + 1) / 2;
        this.applyBackboneOscillationColors(oscillation);
    }

    private isTFile(file: TAbstractFile | null): file is TFile {
        return !!file && file instanceof TFile;
    }

    private updateMinimapFocus(): void {
        this.minimapTicks.forEach(tick => {
            tick.classList.remove('is-active');
        });
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
        if (result.aiStatus && result.aiStatus !== 'success') return true;
        return result.findings.some(finding => finding.kind === 'error');
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
        this.notifyInteraction('Inquiry already processed. Open Briefing to rehydrate.');
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
        this.resetPreviewRowLabels();
        this.setPreviewFooterText('Click a question to try again.');
        this.updatePromptPreview(zone, this.state.mode, 'Inquiry paused.', emptyRows, meta, { hideEmpty: true });
    }

    private updateMinimapHitStates(result: InquiryResult | null | undefined): void {
        if (!this.minimapTicks.length) return;
        const severityClasses = ['is-severity-low', 'is-severity-medium', 'is-severity-high'];
        if (this.state.isRunning || this.isErrorResult(result)) {
            this.minimapTicks.forEach(tick => {
                tick.classList.remove('is-hit');
                severityClasses.forEach(cls => tick.classList.remove(cls));
                const label = tick.getAttribute('data-label') || '';
                if (label) {
                    const fullLabel = tick.getAttribute('data-full-label') || label;
                    tick.setAttribute('data-tooltip', this.balanceTooltipText(fullLabel));
                }
            });
            return;
        }
        const hitMap = this.buildHitFindingMap(result);

        this.minimapTicks.forEach((tick, idx) => {
            const label = tick.getAttribute('data-label') || `T${idx + 1}`;
            const finding = hitMap.get(label);
            tick.classList.toggle('is-hit', !!finding);
            severityClasses.forEach(cls => tick.classList.remove(cls));
            const fullLabel = tick.getAttribute('data-full-label') || label;
            const tooltip = finding ? `${fullLabel} • ${finding.headline}` : fullLabel;
            tick.setAttribute('data-tooltip', this.balanceTooltipText(tooltip));
        });
    }

    private updateArtifactPreview(): void {
        // No-op while findings panel is removed.
    }

    private updateFooterStatus(): void {
        if (this.cacheStatusEl) {
            const cacheEnabled = this.plugin.settings.inquiryCacheEnabled ?? true;
            const cacheText = cacheEnabled ? (this.state.cacheStatus || 'none') : 'off';
            this.cacheStatusEl.textContent = `Cache: ${cacheText}`;
        }
        if (this.confidenceEl) {
            const confidence = this.state.activeResult?.verdict.assessmentConfidence || 'none';
            this.confidenceEl.textContent = `Assessment confidence: ${confidence}`;
        }
        if (this.apiStatusEl) {
            const status = this.apiStatusState.state;
            const reason = this.apiStatusState.reason;
            let text = 'API: idle';
            if (status === 'running') {
                text = 'API: running...';
            } else if (status === 'success') {
                text = 'API: success';
            } else if (status === 'error') {
                text = `API: error — ${reason || 'unknown'}`;
            }
            this.apiStatusEl.textContent = text;
        }
    }

    private setApiStatus(state: 'idle' | 'running' | 'success' | 'error', reason?: string): void {
        this.apiStatusState = { state, reason };
        this.updateFooterStatus();
    }

    private updateNavigationIcons(): void {
        if (!this.navPrevButton || !this.navNextButton) return;
        const isSaga = this.state.scope === 'saga';
        this.setIconUse(this.navPrevIcon, isSaga ? 'chevron-up' : 'chevron-left');
        this.setIconUse(this.navNextIcon, isSaga ? 'chevron-down' : 'chevron-right');
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
        } else {
            this.stopRunningAnimations();
            if (wasRunning) {
                this.startBackboneFadeOut();
            }
        }
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
        const stats = this.payloadStats ?? this.buildPayloadStats();
        return stats.sceneTotal;
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
        if (!this.rootSvg) return '#ff4d4d';
        const color = getComputedStyle(this.rootSvg).getPropertyValue('--ert-inquiry-alert').trim();
        return color || '#ff4d4d';
    }

    private updateGuidance(): void {
        const state = this.guidanceState;
        const runDisabled = this.isInquiryRunDisabled();
        const blocked = this.isInquiryBlocked();
        const lockout = this.isInquiryGuidanceLockout();

        if (this.rootSvg) {
            this.rootSvg.classList.toggle('is-inquiry-blocked', runDisabled);
            this.rootSvg.classList.toggle('is-run-locked', runDisabled);
            this.rootSvg.classList.toggle('is-no-scenes', state === 'no-scenes');
            this.rootSvg.classList.toggle('is-guidance-lockout', lockout);
        }
        this.contentEl.classList.toggle('is-inquiry-blocked', blocked);
        this.contentEl.classList.toggle('is-guidance-lockout', lockout);

        this.zonePromptElements.forEach(({ group }) => {
            group.setAttribute('aria-disabled', runDisabled ? 'true' : 'false');
            group.setAttribute('tabindex', runDisabled ? '-1' : '0');
        });

        this.setIconButtonDisabled(this.apiSimulationButton, runDisabled);
        this.setIconButtonDisabled(this.scopeToggleButton, lockout);
        this.setIconButtonDisabled(this.engineBadgeGroup, lockout);
        this.setIconButtonDisabled(this.artifactButton, lockout);
        this.setIconButtonDisabled(this.navPrevButton, lockout);
        this.setIconButtonDisabled(this.navNextButton, lockout);
        this.setIconButtonDisabled(this.detailsToggle, lockout);

        if (this.briefingSaveButton) {
            this.briefingSaveButton.disabled = blocked || lockout;
        }
        if (this.briefingClearButton) {
            this.briefingClearButton.disabled = lockout;
        }
        if (lockout) {
            this.hideBriefingPanel(true);
            this.hideEnginePanel();
        }

        this.updateGuidanceText(state);
        this.updateGuidanceHelpTooltip(state);
    }

    private updateGuidanceText(state: InquiryGuidanceState): void {
        if (!this.hoverTextEl) return;
        if (state === 'running') {
            this.hoverTextEl.classList.add('ert-hidden');
            this.hoverTextEl.classList.remove('is-guidance', 'is-guidance-alert', 'is-guidance-results');
            this.clearSvgChildren(this.hoverTextEl);
            return;
        }

        const isNoScenes = state === 'no-scenes';
        const isAlert = state === 'not-configured' || isNoScenes;
        if (!isAlert) {
            this.hoverTextEl.classList.add('ert-hidden');
            this.hoverTextEl.classList.remove('is-guidance', 'is-guidance-alert', 'is-guidance-results');
            this.clearSvgChildren(this.hoverTextEl);
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
        this.clearSvgChildren(hoverTextEl);
        const x = hoverTextEl.getAttribute('x') ?? '0';
        const primaryClass = options?.primaryClass;
        const primarySize = options?.primarySize;
        const primaryWeight = options?.primaryWeight;
        lines.forEach((line, index) => {
            const tspan = this.createSvgElement('tspan');
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
        const isAlert = state === 'not-configured' || state === 'no-scenes';
        const isResults = state === 'results';
        const tooltip = isAlert
            ? (state === 'not-configured' ? INQUIRY_HELP_CONFIG_TOOLTIP : INQUIRY_HELP_NO_SCENES_TOOLTIP)
            : (isResults ? INQUIRY_HELP_RESULTS_TOOLTIP : (hasSessions ? INQUIRY_HELP_TOOLTIP : INQUIRY_HELP_ONBOARDING_TOOLTIP));
        const balancedTooltip = this.balanceTooltipText(tooltip);

        this.helpToggleButton.removeAttribute('aria-pressed');
        this.helpToggleButton.classList.toggle('is-help-onboarding', !hasSessions && !isAlert && !isResults);
        this.helpToggleButton.classList.toggle('is-help-results', isResults);
        this.helpToggleButton.classList.toggle('is-guidance-alert', isAlert);
        addTooltipData(this.helpToggleButton, balancedTooltip, 'left');
        this.helpToggleButton.setAttribute('aria-label', tooltip);
    }

    private handleGuidanceHelpClick(): void {
        const state = this.resolveGuidanceState();
        this.guidanceState = state;
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

    private openInquirySettings(focus: 'sources' | 'class-scope' | 'scan-roots'): void {
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
            if (focus === 'sources') {
                this.scrollInquirySetting('class-scope');
                window.setTimeout(() => this.scrollInquirySetting('scan-roots'), 80);
                return;
            }
            this.scrollInquirySetting(focus);
        }, 160);
    }

    private scrollInquirySetting(target: 'class-scope' | 'scan-roots'): void {
        const el = document.querySelector(`[data-ert-role="inquiry-setting:${target}"]`);
        if (!(el instanceof HTMLElement)) return;
        el.scrollIntoView({ block: 'center' });
    }

    private startRunningAnimations(): void {
        if (this.runningAnimationFrame) return;
        this.runningAnimationStart = performance.now();
        const isPro = isProfessionalActive(this.plugin);
        this.cancelBackboneFadeOut();
        this.backboneStartColors = this.getBackboneStartColors();
        this.backboneTargetColors = this.getBackboneTargetColors(isPro);
        if (this.backboneStartColors && this.backboneTargetColors) {
            this.backboneOscillationColors = {
                base: this.backboneStartColors,
                target: this.backboneTargetColors
            };
        } else {
            this.backboneOscillationColors = undefined;
        }
        this.backboneOscillationPhaseOffset = Math.PI / 2;
        this.setBackboneFillProgress(0, 0);
        this.applyBackboneColors(0);
        const animate = (now: number) => {
            if (!this.state.isRunning) {
                this.stopRunningAnimations();
                return;
            }
            const elapsed = now - (this.runningAnimationStart ?? now);
            this.updateBackbonePulse(elapsed);
            this.updateSweep(elapsed);
            this.runningAnimationFrame = window.requestAnimationFrame(animate);
        };
        this.runningAnimationFrame = window.requestAnimationFrame(animate);
    }

    private stopRunningAnimations(): void {
        if (this.runningAnimationFrame) {
            window.cancelAnimationFrame(this.runningAnimationFrame);
            this.runningAnimationFrame = undefined;
        }
        this.runningAnimationStart = undefined;
        this.minimapSweepTicks.forEach(tick => tick.rect.setAttribute('opacity', '0'));
        this.backboneStartColors = undefined;
        this.backboneTargetColors = undefined;
        this.backboneOscillationColors = undefined;
        this.backboneOscillationPhaseOffset = 0;
    }

    private startBackboneFadeOut(): void {
        this.cancelBackboneFadeOut();
        if (!this.minimapBackboneGroup) return;
        this.minimapBackboneGroup.classList.add('is-fading-out');
        this.backboneFadeTimer = window.setTimeout(() => {
            this.minimapBackboneGroup?.classList.remove('is-fading-out');
            this.backboneFadeTimer = undefined;
        }, BACKBONE_FADE_OUT_MS);
    }

    private cancelBackboneFadeOut(): void {
        if (this.backboneFadeTimer) {
            window.clearTimeout(this.backboneFadeTimer);
            this.backboneFadeTimer = undefined;
        }
        this.minimapBackboneGroup?.classList.remove('is-fading-out');
    }

    private updateSweep(elapsed: number): void {
        if (!this.minimapSweepLayout || !this.minimapSweepTicks.length) return;
        const cycleIndex = Math.floor(elapsed / SWEEP_RANDOM_CYCLE_MS);
        if (cycleIndex !== this.sweepRandomCycle) {
            this.sweepRandomCycle = cycleIndex;
            const total = this.minimapSweepTicks.length;
            const count = Math.max(1, Math.floor(Math.random() * total) + 1);
            const indices = Array.from({ length: total }, (_, idx) => idx);
            for (let i = indices.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            this.sweepRandomActive = new Set(indices.slice(0, count));
        }

        const phase = (elapsed % SWEEP_RANDOM_CYCLE_MS) / SWEEP_RANDOM_CYCLE_MS;
        const pulse = Math.sin(Math.PI * phase);
        const intensity = 0.2 + (pulse * 0.8);
        this.minimapSweepTicks.forEach((tick, index) => {
            if (!this.sweepRandomActive.has(index)) {
                tick.rect.setAttribute('opacity', '0');
                return;
            }
            tick.rect.setAttribute('opacity', intensity.toFixed(2));
        });
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

    private handleGlyphClick(): void {
        if (this.isInquiryGuidanceLockout()) return;
        this.clearErrorStateForAction();
        if (this.state.scope === 'saga') {
            this.state.scope = 'book';
            this.refreshUI();
            return;
        }
        this.glyph?.root.classList.toggle('is-expanded');
    }

    private async handleQuestionClick(question: InquiryQuestion): Promise<void> {
        await this.runInquiry(question);
    }

    private async runInquiry(
        question: InquiryQuestion,
        options?: { bypassTokenGuard?: boolean; ignoreNextRunOverride?: boolean }
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

        const engineSelection = this.resolveEngineSelectionForRun(options?.ignoreNextRunOverride);
        const manifest = this.buildCorpusManifest(question.id, { modelId: engineSelection.modelId });
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: question.id,
            scope: this.state.scope,
            focusId
        });
        const cacheEnabled = this.plugin.settings.inquiryCacheEnabled ?? true;
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
        if (!cachedSession && cacheEnabled) {
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
            const tokenTier = this.getTokenTierForQuestion(question.question);
            if (tokenTier === 'red') {
                this.pendingGuardQuestion = question;
                this.showEnginePanel();
                return;
            }
        }

        this.clearActiveResultState();
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
        console.info('[Inquiry] API HIT');
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
                provider: engineSelection.provider,
                modelId: engineSelection.modelId,
                modelLabel: engineSelection.modelLabel
            }
        };
        try {
            // Lens selection is UI-only; do not vary question, evidence, or verdict structure by lens.
            // Each inquiry produces two compressed answers (flow + depth). Keep this dual-answer model intact.
            const runOutput = await this.runner.runWithTrace(runnerInput);
            result = runOutput.result;
            runTrace = runOutput.trace;
            console.info('[Inquiry] API OK');
        } catch (error) {
            console.info('[Inquiry] API FAIL');
            result = this.buildErrorFallback(question, focusLabel, manifest.fingerprint, error);
            const message = error instanceof Error ? error.message : String(error);
            runTrace = await this.buildFallbackTrace(runnerInput, `Runner exception: ${message}`);
        }
        const completedAt = new Date();
        result.submittedAt = submittedAt.toISOString();
        result.completedAt = completedAt.toISOString();
        result.roundTripMs = completedAt.getTime() - submittedAt.getTime();
        const tokenEstimate = runTrace?.tokenEstimate ?? this.getTokenEstimateForQuestion(question.question);
        result.tokenEstimateInput = tokenEstimate.inputTokens;
        result.tokenEstimateTier = this.getTokenTier(tokenEstimate.inputTokens);
        result.aiModelNextRunOnly = engineSelection.nextRunOnly;
        const rawResult = result;
        result = this.normalizeLegacyResult(result);
        const normalizationNotes = this.collectNormalizationNotes(rawResult, result);

        if (cacheEnabled && !this.isErrorResult(result)) {
            cacheStatus = 'fresh';
        } else if (!cacheEnabled) {
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
        await this.saveInquiryLog(result, traceForLog, {
            sessionKey: session.key,
            normalizationNotes
        });
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

        if (engineSelection.usedOverride) {
            this.nextRunEngineOverride = undefined;
            this.syncEngineDefaultButtonState();
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
        void this.writeInquiryPendingEdits(session, result);
    }

    public async runOmnibusPass(): Promise<void> {
        if (Platform.isMobile) {
            new Notice('Inquiry omnibus pass is available on desktop only.');
            return;
        }
        if (this.state.isRunning) {
            new Notice('Inquiry running. Please wait.');
            return;
        }

        this.refreshCorpus();
        this.guidanceState = this.resolveGuidanceState();
        if (this.isInquiryRunDisabled()) {
            const message = this.isInquiryBlocked()
                ? 'Inquiry is not configured yet.'
                : 'No scenes available for Inquiry.';
            new Notice(message);
            return;
        }

        const scope = await this.promptOmnibusScope();
        if (!scope) return;

        if (scope !== this.state.scope) {
            this.handleScopeChange(scope);
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

        const questions = this.getOmnibusQuestions();
        if (!questions.length) {
            new Notice('No enabled Inquiry questions found.');
            return;
        }

        let createIndex = false;
        if (questions.length > 1) {
            const choice = await this.promptOmnibusIndexChoice();
            if (choice === null) return;
            createIndex = choice;
        }

        const providerChoice = this.resolveOmnibusProviderChoice();
        if (!providerChoice) return;

        if (!providerChoice.useOmnibus) {
            const providerLabel = this.getInquiryProviderLabel(providerChoice.provider);
            const modelLabel = providerChoice.modelLabel;
            const reason = providerChoice.reason ? ` (${providerChoice.reason})` : '';
            new Notice(`Gemini not available${reason}. Running per-question pass with ${providerLabel} · ${modelLabel}.`);
            await this.runOmnibusSequential(questions, providerChoice, createIndex);
            return;
        }

        await this.runOmnibusCombined(questions, providerChoice, createIndex);
    }

    private async runOmnibusCombined(
        questions: InquiryQuestion[],
        providerChoice: OmnibusProviderChoice,
        createIndex: boolean
    ): Promise<void> {
        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const focusSceneId = this.state.scope === 'book' ? this.state.focusSceneId : undefined;
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const manifest = this.buildCorpusManifest('omnibus', { modelId: providerChoice.modelId });
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

        const briefPaths: string[] = [];
        let lastSession: InquirySession | null = null;
        let lastResult: InquiryResult | null = null;
        let traceForLogs: InquiryRunTrace | null = null;

        try {
            const runOutput = await this.runner.runOmnibusWithTrace(omnibusInput);
            traceForLogs = runOutput.trace;
            const completedAt = new Date();
            const questionsById = new Map(questions.map(question => [question.id, question]));

            for (let i = 0; i < runOutput.results.length; i += 1) {
                const result = runOutput.results[i];
                const question = questionsById.get(result.questionId) ?? questions[i];
                if (!question) continue;
                const questionManifest = this.buildCorpusManifest(question.id, { modelId: providerChoice.modelId });
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
                lastSession = persisted.session;
                lastResult = persisted.normalized;
                void this.writeInquiryPendingEdits(persisted.session, persisted.normalized);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Inquiry omnibus failed: ${message}`);
        } finally {
            if (createIndex && briefPaths.length > 1) {
                await this.saveOmnibusIndexNote(briefPaths, focusLabel);
            }
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
        createIndex: boolean
    ): Promise<void> {
        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const focusSceneId = this.state.scope === 'book' ? this.state.focusSceneId : undefined;
        const focusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const briefPaths: string[] = [];
        let lastSession: InquirySession | null = null;
        let lastResult: InquiryResult | null = null;

        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();

        try {
            for (const question of questions) {
                const manifest = this.buildCorpusManifest(question.id, { modelId: providerChoice.modelId });
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
                } catch (error) {
                    result = this.buildErrorFallback(question, focusLabel, manifest.fingerprint, error);
                    const message = error instanceof Error ? error.message : String(error);
                    trace = await this.buildFallbackTrace(runnerInput, `Runner exception: ${message}`);
                }
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
                lastSession = persisted.session;
                lastResult = persisted.normalized;
                void this.writeInquiryPendingEdits(persisted.session, persisted.normalized);
            }
        } finally {
            if (createIndex && briefPaths.length > 1) {
                await this.saveOmnibusIndexNote(briefPaths, focusLabel);
            }
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
        const tokenEstimate = options.trace?.tokenEstimate ?? this.getTokenEstimateForQuestion(options.question.question);
        const timedResult: InquiryResult = {
            ...options.result,
            questionId: options.result.questionId || options.question.id,
            questionZone: options.result.questionZone || options.question.zone,
            submittedAt: options.submittedAt.toISOString(),
            completedAt: options.completedAt.toISOString(),
            roundTripMs: options.completedAt.getTime() - options.submittedAt.getTime(),
            corpusFingerprint: options.manifest.fingerprint
        };
        if (typeof timedResult.tokenEstimateInput !== 'number') {
            timedResult.tokenEstimateInput = tokenEstimate.inputTokens;
        }
        if (!timedResult.tokenEstimateTier) {
            timedResult.tokenEstimateTier = this.getTokenTier(tokenEstimate.inputTokens);
        }
        if (typeof timedResult.aiModelNextRunOnly !== 'boolean') {
            timedResult.aiModelNextRunOnly = false;
        }

        const normalized = this.normalizeLegacyResult(timedResult);
        const normalizationNotes = this.collectNormalizationNotes(timedResult, normalized);
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

        const logPath = await this.saveInquiryLog(normalized, options.trace, {
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

    private async promptOmnibusScope(): Promise<InquiryScope | null> {
        const bookLabel = this.getFocusBookLabel();
        const choices: InquiryChoiceOption<InquiryScope>[] = [
            { label: `Book (${bookLabel})`, value: 'book' },
            { label: `Saga (${SIGMA_CHAR})`, value: 'saga' }
        ];
        return new Promise(resolve => {
            const modal = new InquiryChoiceModal(
                this.app,
                choices,
                value => resolve(value),
                () => resolve(null),
                'Select omnibus scope'
            );
            modal.open();
        });
    }

    private async promptOmnibusIndexChoice(): Promise<boolean | null> {
        const choices: InquiryChoiceOption<boolean>[] = [
            { label: 'Create omnibus index note', value: true },
            { label: 'Skip index note', value: false }
        ];
        return new Promise(resolve => {
            const modal = new InquiryChoiceModal(
                this.app,
                choices,
                value => resolve(value),
                () => resolve(null),
                'Create omnibus index note?'
            );
            modal.open();
        });
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

    private resolveOmnibusProviderChoice(): OmnibusProviderChoice | null {
        const geminiAvailability = this.getProviderAvailability('gemini');
        if (geminiAvailability.enabled) {
            const modelId = this.getInquiryModelIdForProvider('gemini');
            return {
                provider: 'gemini',
                modelId,
                modelLabel: this.getInquiryModelLabelForProvider('gemini'),
                useOmnibus: true
            };
        }

        const fallbackProvider = (this.plugin.settings.defaultAiProvider || 'openai') as EngineProvider;
        const fallbackAvailability = this.getProviderAvailability(fallbackProvider);
        if (!fallbackAvailability.enabled) {
            const providerLabel = this.getInquiryProviderLabel(fallbackProvider);
            const reason = fallbackAvailability.reason || 'Provider unavailable';
            new Notice(`Omnibus unavailable: ${providerLabel} ${reason}.`);
            return null;
        }

        return {
            provider: fallbackProvider,
            modelId: this.getInquiryModelIdForProvider(fallbackProvider),
            modelLabel: this.getInquiryModelLabelForProvider(fallbackProvider),
            useOmnibus: false,
            reason: geminiAvailability.reason || 'Gemini not configured'
        };
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
            return clean(this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929');
        }
        if (provider === 'gemini') {
            return clean(this.plugin.settings.geminiModelId || 'gemini-pro-latest');
        }
        if (provider === 'local') {
            return clean(this.plugin.settings.localModelId || 'local-model');
        }
        return clean(this.plugin.settings.openaiModelId || 'gpt-5.2-chat-latest');
    }

    private getInquiryModelLabelForProvider(provider: EngineProvider): string {
        const modelId = this.getInquiryModelIdForProvider(provider);
        return modelId ? getModelDisplayName(modelId.replace(/^models\//, '')) : 'Unknown model';
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
        return key?.trim() ? { enabled: true } : { enabled: false, reason: 'API key missing' };
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
            return {
                refId: legacy.refId,
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

    private async writeInquiryPendingEdits(
        session: InquirySession,
        result: InquiryResult,
        options?: { notify?: boolean }
    ): Promise<boolean> {
        if (session.pendingEditsApplied) return true;
        const enabled = this.plugin.settings.inquiryActionNotesEnabled ?? false;
        if (!enabled) {
            if (options?.notify) {
                this.notifyInteraction('Enable "Write Inquiry notes to Pending Edits" in Inquiry settings.');
            }
            return false;
        }
        if (session.status === 'simulated' || result.aiReason === 'simulated') {
            if (options?.notify) {
                this.notifyInteraction('Pending Edits writeback is disabled for simulated runs.');
            }
            return false;
        }

        const normalized = this.normalizeLegacyResult(result);
        if (this.isErrorResult(normalized)) return false;
        if (normalized.scope !== 'book') return false;
        if (!this.corpus?.scenes?.length) return false;

        const briefTitle = this.formatInquiryBriefTitle(normalized);
        const notesByScene = this.buildInquiryActionNotes(normalized, briefTitle);
        if (!notesByScene.size) return false;

        const defaultField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        const targetField = (this.plugin.settings.inquiryActionNotesTargetField ?? defaultField).trim() || 'Pending Edits';
        let wroteAny = false;
        let duplicateAny = false;

        for (const [path, notes] of notesByScene.entries()) {
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
        briefTitle: string
    ): Map<string, string[]> {
        const notesByScene = new Map<string, string[]>();
        if (!this.corpus?.scenes?.length) return notesByScene;
        const sceneByLabel = new Map<string, string>();
        const sceneById = new Map<string, string>();
        this.corpus.scenes.forEach(scene => {
            sceneByLabel.set(scene.displayLabel, scene.filePath);
            sceneById.set(scene.id, scene.filePath);
        });
        const minimumRank = this.getImpactRank('medium');

        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            if (this.getImpactRank(finding.impact) < minimumRank) return;
            const filePath = sceneByLabel.get(finding.refId) ?? sceneById.get(finding.refId);
            if (!filePath) return;
            if (notesByScene.has(filePath)) return;
            const note = this.formatInquiryActionNote(finding, briefTitle);
            notesByScene.set(filePath, [note]);
        });

        return notesByScene;
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
        const quoteWikiLink = (line: string): string => {
            const match = line.match(/\[\[[^\]]+\]\]/);
            if (!match || match.index === undefined) return line;
            const start = match.index;
            const end = start + match[0].length;
            const alreadyQuoted = (start > 0 && line[start - 1] === '"') && line[end] === '"';
            if (alreadyQuoted) return line;
            return `${line.slice(0, start)}"${match[0]}"${line.slice(end)}`;
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
            const inquiryIndices = lines.reduce<number[]>((acc, line, index) => {
                if (isInquiryLine(line)) acc.push(index);
                return acc;
            }, []);

            if (inquiryIndices.some(index => lines[index].includes(briefLinkNeedle))) {
                outcome = 'duplicate';
                return;
            }

            const shouldQuoteLink = lines.length === 0 && notes.length === 1 && !rawText.includes('\n') && !rawText.includes('\r');
            const nextNotes = shouldQuoteLink ? notes.map(note => quoteWikiLink(note)) : notes.slice();
            let nextLines = [...lines, ...nextNotes];

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
        return reason ? `${status} (${reason})` : status;
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

        const manifest = this.buildCorpusManifest(selectedPrompt.id);
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
                provider: this.plugin.settings.defaultAiProvider || 'openai',
                modelId: this.getActiveInquiryModelId(),
                modelLabel: this.getActiveInquiryModelLabel()
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
            const tokenEstimate = this.getTokenEstimateForQuestion(selectedPrompt.question);
            result.tokenEstimateInput = tokenEstimate.inputTokens;
            result.tokenEstimateTier = this.getTokenTier(tokenEstimate.inputTokens);
            result.aiModelNextRunOnly = false;
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
            await this.saveInquiryLog(result, trace, {
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

    private buildCorpusManifest(questionId: string, options?: { modelId?: string }): CorpusManifest {
        const rawSources = this.plugin.settings.inquirySources as Record<string, unknown> | undefined;
        if (rawSources && ('sceneFolders' in rawSources || 'bookOutlineFiles' in rawSources || 'sagaOutlineFile' in rawSources)) {
            return this.buildLegacyCorpusManifest(rawSources, questionId, options);
        }

        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const entries: CorpusManifest['entries'] = [];
        const now = Date.now();
        const modelIdOverride = options?.modelId;
        const classConfigMap = new Map(
            (sources.classes || []).map(config => [config.className, config])
        );
        const classScope = this.getClassScopeConfig(sources.classScope);
        const isClassActive = (config: InquiryClassConfig): boolean => {
            return config.enabled
                && (this.isModeActive(config.bookScope)
                    || this.isModeActive(config.sagaScope)
                    || this.isModeActive(config.referenceScope));
        };
        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? ((sources.resolvedScanRoots && sources.resolvedScanRoots.length)
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);
        const allowedClasses = (sources.classes || [])
            .filter(config => isClassActive(config))
            .filter(config => classScope.allowAll || classScope.allowed.has(config.className))
            .map(config => config.className);

        if (!classScope.allowAll && classScope.allowed.size === 0) {
            const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelIdOverride ?? this.getActiveInquiryModelId()}|`;
            return {
                entries,
                fingerprint: this.hashString(fingerprintRaw),
                generatedAt: now,
                resolvedRoots,
                allowedClasses,
                synopsisOnly: true,
                classCounts: {}
            };
        }
        const files = this.app.vault.getMarkdownFiles();

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        files.forEach(file => {
            if (!inRoots(file.path)) return;
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            if (!classValues.length) return;

            classValues.forEach(className => {
                if (!classScope.allowAll && !classScope.allowed.has(className)) return;
                const config = classConfigMap.get(className);
                if (!config || !config.enabled) return;
                if (!isClassActive(config)) return;
                if (className === 'outline') {
                    const outlineScope = this.getFrontmatterScope(frontmatter) ?? 'book';
                    const mode = outlineScope === 'saga' ? config.sagaScope : config.bookScope;
                    if (!this.isModeActive(mode)) return;
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        scope: outlineScope,
                        mode
                    });
                    return;
                }

                if (INQUIRY_REFERENCE_ONLY_CLASSES.has(className)) {
                    const mode = config.referenceScope;
                    if (!this.isModeActive(mode)) return;
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        mode
                    });
                    return;
                }

                const mode = this.state.scope === 'book' ? config.bookScope : config.sagaScope;
                if (!this.isModeActive(mode)) return;

                entries.push({
                    path: file.path,
                    mtime: file.stat.mtime ?? now,
                    class: className,
                    mode
                });
            });
        });

        const fingerprintSource = entries
            .map(entry => `${entry.path}:${entry.mtime}:${entry.mode ?? 'none'}`)
            .sort()
            .join('|');
        const modelId = modelIdOverride ?? this.getActiveInquiryModelId();
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {});
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
            const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelIdOverride ?? this.getActiveInquiryModelId()}|`;
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
                entries.push({
                    path,
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
            .map(entry => `${entry.path}:${entry.mtime}:${entry.mode ?? 'none'}`)
            .sort()
            .join('|');
        const modelId = modelIdOverride ?? this.getActiveInquiryModelId();
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
        if (className === 'scene') return 'summary';
        return 'full';
    }

    private normalizeMaterialMode(value: unknown, className: string): InquiryMaterialMode {
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'digest') return 'summary';
            if (normalized === 'none' || normalized === 'summary' || normalized === 'full') {
                return normalized as InquiryMaterialMode;
            }
        }
        if (typeof value === 'boolean') {
            return value ? this.getDefaultMaterialMode(className) : 'none';
        }
        return 'none';
    }

    private resolveContributionMode(config: InquiryClassConfig): InquiryMaterialMode {
        const modes: InquiryMaterialMode[] = [config.bookScope, config.sagaScope, config.referenceScope];
        return modes.reduce((best, mode) => {
            const rank = { none: 0, summary: 1, full: 2 };
            return rank[mode] > rank[best] ? mode : best;
        }, 'none' as InquiryMaterialMode);
    }

    private normalizeClassContribution(config: InquiryClassConfig): InquiryClassConfig {
        const isReference = INQUIRY_REFERENCE_ONLY_CLASSES.has(config.className);
        const contribution = this.resolveContributionMode(config);
        const bookActive = !isReference && config.bookScope !== 'none';
        const sagaActive = !isReference && config.sagaScope !== 'none';
        const referenceActive = isReference && config.referenceScope !== 'none';
        return {
            ...config,
            bookScope: isReference ? 'none' : (bookActive ? contribution : 'none'),
            sagaScope: isReference ? 'none' : (sagaActive ? contribution : 'none'),
            referenceScope: isReference ? (referenceActive ? contribution : 'none') : 'none'
        };
    }

    private normalizeEvidenceMode(mode?: InquiryMaterialMode): 'none' | 'summary' | 'full' {
        if (mode === 'full') return 'full';
        if (mode === 'summary') return 'summary';
        return 'none';
    }

    private isModeActive(mode?: InquiryMaterialMode): boolean {
        return this.normalizeEvidenceMode(mode) !== 'none';
    }

    private normalizeInquirySources(raw?: InquirySourcesSettings): InquirySourcesSettings {
        if (!raw) {
            return { scanRoots: [], classes: [], classCounts: {}, resolvedScanRoots: [] };
        }
        if ('sceneFolders' in raw || 'bookOutlineFiles' in raw || 'sagaOutlineFile' in raw) {
            return { scanRoots: [], classes: [], classCounts: {}, resolvedScanRoots: [] };
        }
        return {
            preset: raw.preset,
            scanRoots: raw.scanRoots && raw.scanRoots.length ? normalizeScanRootPatterns(raw.scanRoots) : [],
            classScope: raw.classScope ? raw.classScope.map(value => value.trim().toLowerCase()).filter(Boolean) : [],
            classes: (raw.classes || []).map(config => this.normalizeClassContribution({
                className: config.className.toLowerCase(),
                enabled: !!config.enabled,
                bookScope: this.normalizeMaterialMode(config.bookScope, config.className.toLowerCase()),
                sagaScope: this.normalizeMaterialMode(config.sagaScope, config.className.toLowerCase()),
                referenceScope: this.normalizeMaterialMode(
                    (config as InquiryClassConfig).referenceScope
                    ?? (INQUIRY_REFERENCE_ONLY_CLASSES.has(config.className.toLowerCase()) ? true : false),
                    config.className.toLowerCase()
                )
            })),
            classCounts: raw.classCounts || {},
            resolvedScanRoots: raw.resolvedScanRoots ? normalizeScanRootPatterns(raw.resolvedScanRoots) : [],
            lastScanAt: raw.lastScanAt
        };
    }

    private extractClassValues(frontmatter: Record<string, unknown>): string[] {
        const rawClass = frontmatter['Class'];
        const values = Array.isArray(rawClass) ? rawClass : rawClass ? [rawClass] : [];
        return values
            .map(value => (typeof value === 'string' ? value : String(value)).trim())
            .filter(Boolean)
            .map(value => value.toLowerCase());
    }

    private getFrontmatterScope(frontmatter: Record<string, unknown>): InquiryScope | undefined {
        const normalizedFrontmatter = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const keys = Object.keys(normalizedFrontmatter);
        const scopeKey = keys.find(key => key.toLowerCase() === 'scope');
        if (!scopeKey) return undefined;
        const value = normalizedFrontmatter[scopeKey];
        if (typeof value !== 'string') return undefined;
        const normalizedValue = value.trim().toLowerCase();
        if (normalizedValue === 'book' || normalizedValue === 'saga') {
            return normalizedValue as InquiryScope;
        }
        return undefined;
    }

    private hashString(value: string): string {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return `h${Math.abs(hash)}`;
    }

    private setFocusByIndex(index: number): void {
        const items = this.getCurrentItems();
        const item = items[index - 1];
        if (!item) return;
        if (this.state.scope === 'saga') {
            this.state.focusBookId = item.id;
            this.scheduleFocusPersist();
        } else {
            this.state.focusSceneId = item.id;
            if (this.state.focusBookId) {
                this.lastFocusSceneByBookId.set(this.state.focusBookId, item.id);
                this.scheduleFocusPersist();
            }
        }
        this.updateMinimapFocus();
        this.updateFocusGlyph();
    }

    private async openActiveBrief(): Promise<void> {
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
        await this.openBriefFromSession(session);
    }

    private async openSceneFromMinimap(sceneId: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(sceneId);
        if (file && this.isTFile(file)) {
            await openOrRevealFile(this.app, file);
            return;
        }
        new Notice('Scene file not found.');
    }

    private drillIntoBook(bookId: string): void {
        if (!bookId) return;
        this.state.focusBookId = bookId;
        this.scheduleFocusPersist();
        this.handleScopeChange('book');
    }

    private shiftFocus(delta: number): void {
        this.clearErrorStateForAction();
        const count = this.getCurrentItems().length;
        if (!count) return;
        const current = this.getFocusIndex();
        const next = Math.min(Math.max(current + delta, 1), count);
        this.setFocusByIndex(next);
    }

    private getFocusIndex(): number {
        const items = this.getCurrentItems();
        if (!items.length) return 1;
        const focusId = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusSceneId;
        const index = items.findIndex(item => item.id === focusId);
        return index >= 0 ? index + 1 : 1;
    }

    private getFocusBookLabel(): string {
        const books = this.corpus?.books ?? [];
        if (this.state.focusBookId) {
            const match = books.find(book => book.id === this.state.focusBookId);
            if (match) return match.displayLabel;
        }
        return books[0]?.displayLabel ?? 'B0';
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

    private handleMinimapHover(label: string, displayLabel?: string): void {
        const hoverLabel = displayLabel || label;
        const result = this.state.activeResult;
        if (!result || this.isErrorResult(result)) {
            this.setHoverText(this.buildMinimapHoverText(hoverLabel));
            return;
        }
        const finding = this.buildHitFindingMap(result).get(label);
        if (!finding) {
            this.setHoverText(this.buildMinimapHoverText(hoverLabel));
            return;
        }
        if (this.previewLocked || !this.previewGroup) {
            this.setHoverText(`${hoverLabel}: ${finding.headline}`);
            return;
        }
        this.showResultPreview(hoverLabel, finding, result);
    }

    private showResultPreview(label: string, finding: InquiryFinding, result: InquiryResult): void {
        if (!this.previewGroup || this.previewLocked) return;
        const zone = this.state.activeZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        const hero = finding.bullets?.[0]
            ? `${finding.headline} — ${finding.bullets[0]}`
            : finding.headline;
        const meta = `${label} · ${this.formatFindingKindLabel(finding.kind)}`;
        const rows = this.buildResultPreviewRows(finding, result, label);
        this.minimapResultPreviewActive = true;
        this.setHoverText(`${label}: ${finding.headline}`);
        this.previewGroup.classList.add('is-visible');
        this.updatePromptPreview(zone, this.state.mode, hero, rows, meta);
    }

    private clearResultPreview(): void {
        if (!this.minimapResultPreviewActive) return;
        this.minimapResultPreviewActive = false;
        if (this.previewLocked) return;
        this.hidePromptPreview(true);
    }

    private buildResultPreviewRows(
        finding: InquiryFinding,
        result: InquiryResult,
        label: string
    ): string[] {
        const scopeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
        return [
            `${label} hit`,
            `Impact ${finding.impact}`,
            `Confidence ${finding.assessmentConfidence}`,
            `Flow ${this.formatMetricDisplay(result.verdict.flow)}`,
            `Depth ${this.formatMetricDisplay(result.verdict.depth)}`,
            `${scopeLabel} ${result.focusId}`
        ];
    }

    private formatFindingKindLabel(kind: InquiryFinding['kind']): string {
        if (!kind) return 'Finding';
        return kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    private buildHitFindingMap(result: InquiryResult | null | undefined): Map<string, InquiryFinding> {
        const map = new Map<string, InquiryFinding>();
        if (!result) return map;
        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const existing = map.get(finding.refId);
            if (!existing || this.getImpactRank(finding.impact) > this.getImpactRank(existing.impact)) {
                map.set(finding.refId, finding);
            }
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
        this.previewLast = { zone, question };
        this.updatePromptPreview(zone, mode, question, undefined, undefined, { hideEmpty: true });
        this.previewGroup.classList.add('is-visible');
        void this.requestPayloadEstimate(question);
    }

    private async requestPayloadEstimate(questionText: string): Promise<void> {
        if (!questionText) return;
        const manifest = this.buildCorpusManifest('payload-preview');
        const requestedScope = this.state.scope;
        const requestedFocusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
        const currentStats = this.payloadStats
            && this.payloadStats.manifestFingerprint === manifest.fingerprint
            && this.payloadStats.scope === requestedScope
            && this.payloadStats.focusBookId === requestedFocusBookId
            ? this.payloadStats
            : this.buildPayloadStats();
        if (this.payloadStats !== currentStats) {
            this.payloadStats = currentStats;
        }
        if (currentStats.tokenEstimate && currentStats.tokenEstimateQuestion === questionText) {
            return;
        }

        const requestId = ++this.payloadEstimateRequestId;
        try {
            const trace = await this.runner.buildTrace({
                scope: requestedScope,
                focusLabel: this.getFocusLabel(),
                focusSceneId: requestedScope === 'book' ? this.state.focusSceneId : undefined,
                focusBookId: requestedFocusBookId,
                mode: this.state.mode,
                questionId: 'payload-preview',
                questionText,
                questionZone: this.previewLast?.zone ?? 'setup',
                corpus: manifest,
                rules: this.getEvidenceRules(),
                ai: {
                    provider: this.plugin.settings.defaultAiProvider || 'openai',
                    modelId: this.getActiveInquiryModelId(),
                    modelLabel: this.getActiveInquiryModelLabel()
                }
            });
            if (requestId !== this.payloadEstimateRequestId) return;
            const latestFocusBookId = this.state.focusBookId ?? this.corpus?.books?.[0]?.id;
            if (this.state.scope !== requestedScope) return;
            if (requestedScope === 'book' && latestFocusBookId !== requestedFocusBookId) return;
            const latestStats = this.payloadStats
                && this.payloadStats.manifestFingerprint === manifest.fingerprint
                && this.payloadStats.scope === requestedScope
                && this.payloadStats.focusBookId === requestedFocusBookId
                ? this.payloadStats
                : this.buildPayloadStats();
            if (latestStats.manifestFingerprint !== manifest.fingerprint) return;
            this.payloadStats = {
                ...latestStats,
                evidenceChars: trace.evidenceText.length,
                tokenEstimate: trace.tokenEstimate,
                tokenEstimateQuestion: questionText
            };
            if (this.previewLast?.question === questionText
                && this.previewGroup?.classList.contains('is-visible')
                && !this.previewLocked) {
                this.updatePromptPreview(this.previewLast.zone, this.state.mode, questionText, undefined, undefined, { hideEmpty: true });
            }
        } catch {
            // Ignore preview estimate failures; fallback estimates remain.
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
        const heroBaseWidth = this.minimapLayout?.length ?? (PREVIEW_PANEL_WIDTH - (PREVIEW_PANEL_PADDING_X * 2));
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
            const metaY = PREVIEW_PANEL_PADDING_Y + (heroLines * PREVIEW_HERO_LINE_HEIGHT) + PREVIEW_META_GAP;
            const metaText = metaOverride ?? `${zoneLabel} + ${modeLabel}`.toUpperCase();
            this.previewMeta.textContent = metaText;
            this.previewMeta.setAttribute('y', String(metaY));
        }

        const detailStartY = PREVIEW_PANEL_PADDING_Y
            + (heroLines * PREVIEW_HERO_LINE_HEIGHT)
            + PREVIEW_META_GAP
            + PREVIEW_META_LINE_HEIGHT
            + PREVIEW_DETAIL_GAP;
        const rows = rowsOverride ?? this.getPreviewPayloadRows(question);

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
        this.syncTokensPillState(question);
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
        const hero = this.buildResultsHeroText(result, mode);
        const meta = this.buildResultsMetaText(result, mode, zone);
        const chips = this.buildResultsChips(result, mode);
        this.setPreviewRowLabels(chips.labels);
        this.updatePromptPreview(zone, mode, hero, chips.values, meta, { hideEmpty: true });
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

    private buildResultsChips(result: InquiryResult, mode: InquiryMode): { labels: string[]; values: string[] } {
        const maxSlots = Math.min(RESULTS_MAX_CHIPS, this.previewRows.length || RESULTS_MAX_CHIPS);
        const items = this.getResultItems(result);
        const ordered = this.getOrderedFindings(result, mode);
        const selections: Array<{
            label: string;
            value: string;
            order: number;
            selectionIndex: number;
        }> = [];
        const seen = new Set<string>();

        for (const finding of ordered) {
            if (selections.length >= maxSlots) break;
            const label = this.resolveFindingChipLabel(finding, result, items);
            if (!label || seen.has(label)) continue;
            seen.add(label);
            selections.push({
                label,
                value: this.truncatePreviewValue(this.normalizeInquiryHeadline(finding.headline), 46),
                order: this.resolveFindingChipOrder(label, result, items),
                selectionIndex: selections.length
            });
        }

        if (!selections.length) {
            selections.push({
                label: '',
                value: RESULTS_EMPTY_TEXT,
                order: Number.POSITIVE_INFINITY,
                selectionIndex: 0
            });
        } else {
            selections.sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.selectionIndex - b.selectionIndex;
            });
        }

        const labels = selections.map(entry => entry.label);
        const values = selections.map(entry => entry.value);
        const targetLength = this.previewRows.length || labels.length;
        const paddedLabels = Array(targetLength).fill('');
        const paddedValues = Array(targetLength).fill('');
        labels.forEach((label, index) => {
            paddedLabels[index] = label;
            paddedValues[index] = values[index] ?? '';
        });
        return { labels: paddedLabels, values: paddedValues };
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

        const pathMatch = items.find(item => item.filePaths?.some(path => path === refId));
        if (pathMatch) return pathMatch.displayLabel;

        const scopePrefix = result.scope === 'saga' ? 'B' : 'S';
        const pattern = new RegExp(`^${scopePrefix}\\d+$`, 'i');
        if (pattern.test(refId)) {
            return refId.toUpperCase();
        }

        return null;
    }

    private resolveFindingChipOrder(
        label: string,
        result: InquiryResult,
        items: InquiryCorpusItem[]
    ): number {
        const lower = label.toLowerCase();
        const itemIndex = items.findIndex(item => item.displayLabel.toLowerCase() === lower);
        if (itemIndex >= 0) return itemIndex;

        const scopePrefix = result.scope === 'saga' ? 'B' : 'S';
        const match = new RegExp(`^${scopePrefix}(\\d+)$`, 'i').exec(label);
        if (match) {
            const numeric = Number(match[1]);
            if (Number.isFinite(numeric)) return numeric - 1;
        }

        return Number.POSITIVE_INFINITY;
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
        this.clearSvgChildren(textEl);
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

        this.clearSvgChildren(textEl);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            const tspan = this.createSvgElement('tspan');
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
            const gradient = this.createSvgElement('linearGradient');
            gradient.setAttribute('id', 'ert-inquiry-preview-shimmer-grad');
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%');
            gradient.setAttribute('y2', '0%');
            const stops = [
                { offset: '0%', opacity: '0' },
                { offset: '20%', opacity: '0.55' },
                { offset: '50%', opacity: '1' },
                { offset: '80%', opacity: '0.55' },
                { offset: '100%', opacity: '0' }
            ];
            stops.forEach(stopDef => {
                const stop = this.createSvgElement('stop');
                stop.setAttribute('offset', stopDef.offset);
                stop.setAttribute('stop-color', '#fff'); // White mask = reveal
                stop.setAttribute('stop-opacity', stopDef.opacity);
                gradient.appendChild(stop);
            });
            this.svgDefs.appendChild(gradient);
        }

        // Mask that contains the moving/animating rect
        const mask = this.createSvgElement('mask');
        mask.setAttribute('id', 'ert-inquiry-preview-shimmer-mask');
        mask.setAttribute('maskUnits', 'userSpaceOnUse');

        // The moving band
        const band = this.createSvgElement('rect');
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
        this.clearSvgChildren(this.previewShimmerGroup);
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
        const backboneBottom = this.minimapBackboneLayout
            ? this.minimapBackboneLayout.glowY + this.minimapBackboneLayout.glowHeight
            : 0;
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
        const rows = this.getPreviewPayloadRows(question.question);
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-locked');
        this.previewGroup.classList.remove('is-results');
        this.previewGroup.classList.remove('is-error');
        this.resetPreviewRowLabels();
        this.setPreviewFooterText('');
        this.updatePromptPreview(question.zone, this.state.mode, question.question, rows, undefined, { hideEmpty: true });
    }

    private unlockPromptPreview(): void {
        this.previewLocked = false;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        if (this.previewGroup) {
            this.previewGroup.classList.remove('is-locked', 'is-visible', 'is-results');
            this.previewGroup.classList.remove('is-error');
        }
        this.resetPreviewRowLabels();
        this.setPreviewFooterText('');
    }

    private layoutPreviewPills(startY: number, values: string[], options?: { hideEmpty?: boolean }): number {
        const items: Array<{ row: InquiryPreviewRow; width: number }> = [];
        this.previewRows.forEach((row, index) => {
            const value = values[index] ?? '';
            const isEmpty = !value.trim();
            if (options?.hideEmpty && isEmpty) {
                row.group.classList.add('ert-hidden');
                this.clearSvgChildren(row.text);
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
            const gap = this.computePillGap(totalWidth, row.length, maxRowWidth, rowIndex === 0);
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
        this.clearSvgChildren(row.text);
        const labelText = row.label?.trim() ?? '';
        if (labelText) {
            const label = this.createSvgElement('tspan');
            label.classList.add('ert-inquiry-preview-pill-label');
            label.textContent = value ? `${labelText} ` : labelText;
            row.text.appendChild(label);
        }
        if (!value) return;
        const detail = this.createSvgElement('tspan');
        detail.classList.add('ert-inquiry-preview-pill-value');
        detail.textContent = value;
        row.text.appendChild(detail);
    }

    private syncTokensPillState(questionText: string): void {
        if (!this.previewRows.length) return;
        this.previewRows.forEach(row => {
            row.group.classList.remove('is-token-amber', 'is-token-red');
            if (row.group.getAttribute('data-tooltip')) {
                row.group.removeAttribute('data-tooltip');
            }
            row.group.removeAttribute('data-tooltip-placement');
            row.group.classList.remove('rt-tooltip-target');
        });
        const tokensRow = this.previewRows.find(row => row.group.classList.contains('is-tokens-slot'));
        if (!tokensRow) return;
        const label = tokensRow.label?.trim().toUpperCase();
        if (label !== 'TOKENS') return;
        if (!questionText) return;
        const tier = this.getTokenTierForQuestion(questionText);
        if (tier === 'amber') {
            tokensRow.group.classList.add('is-token-amber');
        }
        if (tier === 'red') {
            tokensRow.group.classList.add('is-token-red');
            addTooltipData(tokensRow.group, this.balanceTooltipText(INQUIRY_TOKENS_RED_TOOLTIP), 'bottom');
        }
    }

    private pickPillSplit(widths: number[], maxWidth: number): number {
        const total = widths.length;
        let bestIndex = Math.ceil((total + 1) / 2);
        let bestScore = Number.POSITIVE_INFINITY;
        const computeRowWidth = (slice: number[], stretch: boolean): number => {
            if (!slice.length) return 0;
            const rowTotal = slice.reduce((sum, value) => sum + value, 0);
            const gap = this.computePillGap(rowTotal, slice.length, maxWidth, stretch);
            return rowTotal + gap * (slice.length - 1);
        };

        for (let i = 1; i < total; i += 1) {
            const row1Count = i;
            const row2Count = total - i;
            if (row1Count < row2Count) continue;

            const row1Width = computeRowWidth(widths.slice(0, i), true);
            const row2Width = computeRowWidth(widths.slice(i), false);
            if (row1Width <= row2Width) continue;

            const overflow = Math.max(0, row1Width - maxWidth) + Math.max(0, row2Width - maxWidth);
            const countDiff = row1Count - row2Count;
            const countPenalty = countDiff === 0 ? 300 : (countDiff === 1 ? 0 : 80 * (countDiff - 1));
            const score = Math.abs(row1Width - row2Width) + (overflow * 3) + countPenalty;
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    private computePillGap(totalWidth: number, count: number, maxWidth: number, stretch: boolean): number {
        if (count <= 1) return 0;
        const available = maxWidth - totalWidth;
        if (available <= 0) {
            const tightGap = available / (count - 1);
            return Math.max(PREVIEW_PILL_MIN_GAP_X, Math.min(PREVIEW_PILL_GAP_X, tightGap));
        }
        if (stretch) {
            return Math.max(PREVIEW_PILL_GAP_X, available / (count - 1));
        }
        return PREVIEW_PILL_GAP_X;
    }

    private setWrappedSvgText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        maxLines: number,
        lineHeight: number
    ): number {
        this.clearSvgChildren(textEl);
        const words = text.split(/\s+/).filter(Boolean);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            const tspan = this.createSvgElement('tspan');
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
        if (!this.previewLocked
            && this.previewGroup?.classList.contains('is-visible')
            && this.previewLast) {
            void this.requestPayloadEstimate(this.previewLast.question);
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
        const manifest = this.buildCorpusManifest('payload-preview');
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
            sagaOutlineCount: sagaOutlineStats.count,
            referenceCounts: referenceStats.counts,
            referenceByClass: referenceStats.byClass,
            evidenceChars,
            resolvedRoots: manifest.resolvedRoots,
            manifestFingerprint: manifest.fingerprint,
            tokenEstimate: priorStats?.tokenEstimate,
            tokenEstimateQuestion: priorStats?.tokenEstimateQuestion
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
            const synopsis = this.getEntrySynopsis(entry.path);
            if (synopsis) {
                synopsisAvailable += 1;
            }
            const mode = this.normalizeEvidenceMode(entry.mode);
            if (mode === 'summary') {
                if (!synopsis) return;
                synopsisUsed += 1;
                chars += synopsis.length;
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

    private collectEntryStats(entries: CorpusManifestEntry[]): { count: number; chars: number } {
        let count = 0;
        let chars = 0;
        entries.forEach(entry => {
            const size = this.getEntryContentLength(entry);
            if (!size) return;
            count += 1;
            chars += size;
        });
        return { count, chars };
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

    private getEntrySynopsis(path: string): string {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return '';
        const frontmatter = this.getNormalizedFrontmatter(file);
        if (!frontmatter) return '';
        return this.extractSynopsis(frontmatter);
    }

    private getEntryContentLength(entry: CorpusManifestEntry): number {
        const mode = this.normalizeEvidenceMode(entry.mode);
        if (mode === 'summary') {
            const synopsis = this.getEntrySynopsis(entry.path);
            return synopsis.length;
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

    private extractSynopsis(frontmatter: Record<string, unknown>): string {
        const raw = frontmatter['Synopsis'];
        if (Array.isArray(raw)) {
            return raw.map(value => String(value)).join('\n').trim();
        }
        if (typeof raw === 'string') return raw.trim();
        if (raw === null || raw === undefined) return '';
        return String(raw).trim();
    }

    private getPreviewPayloadRows(questionText: string): string[] {
        return [
            this.getPreviewScopeValue(),
            this.getPreviewScenesValue(),
            this.getPreviewOutlinesValue(),
            this.getPreviewReferencesValue(),
            this.getPreviewTokensValue(questionText),
            this.getPreviewRootsValue(),
            this.getPreviewClassesValue()
        ];
    }

    private getPreviewScopeValue(): string {
        if (this.state.scope === 'saga') return this.getFocusLabel();
        return `Book ${this.getFocusLabel()}`;
    }

    private getPreviewScenesValue(): string {
        const stats = this.getPayloadStats();
        return `total ${stats.sceneTotal} · synopsis ${stats.sceneSynopsisUsed}/${stats.sceneSynopsisAvailable} · full ${stats.sceneFullTextCount}`;
    }

    private getPreviewOutlinesValue(): string {
        const stats = this.getPayloadStats();
        return `book ${stats.bookOutlineCount} · saga ${stats.sagaOutlineCount}`;
    }

    private getPreviewReferencesValue(): string {
        const stats = this.getPayloadStats();
        if (!stats.referenceCounts.total) return 'none';
        const { character, place, power, other } = stats.referenceCounts;
        return `character ${character} · place ${place} · power ${power} · other ${other}`;
    }

    private getPreviewTokensValue(questionText: string): string {
        const estimate = this.getTokenEstimateForQuestion(questionText);
        return `~${this.formatTokenEstimate(estimate.inputTokens)} in · ~${this.formatTokenEstimate(estimate.outputTokens)} out · ~${this.formatTokenEstimate(estimate.totalTokens)} total`;
    }

    private getTokenEstimateForQuestion(questionText: string): InquiryRunTrace['tokenEstimate'] {
        const stats = this.getPayloadStats();
        if (stats.tokenEstimate && stats.tokenEstimateQuestion === questionText) {
            return stats.tokenEstimate;
        }
        const questionChars = questionText?.length ?? 0;
        const inputChars = stats.evidenceChars + questionChars + INQUIRY_PROMPT_OVERHEAD_CHARS;
        const inputTokens = this.estimateTokensFromChars(inputChars);
        const outputTokens = INQUIRY_MAX_OUTPUT_TOKENS;
        const totalTokens = inputTokens + outputTokens;
        return {
            inputTokens,
            outputTokens,
            totalTokens,
            inputChars
        };
    }

    private getTokenTier(inputTokens: number): TokenTier {
        if (inputTokens >= INQUIRY_INPUT_TOKENS_RED) return 'red';
        if (inputTokens >= INQUIRY_INPUT_TOKENS_AMBER) return 'amber';
        return 'normal';
    }

    private getTokenTierForQuestion(questionText: string): TokenTier {
        const estimate = this.getTokenEstimateForQuestion(questionText);
        return this.getTokenTier(estimate.inputTokens);
    }

    private getPreviewRootsValue(): string {
        const stats = this.getPayloadStats();
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        return this.formatRootsSummary(stats.resolvedRoots, sources.scanRoots ?? []);
    }

    private getPreviewClassesValue(): string {
        const stats = this.getPayloadStats();
        const classes: string[] = [];
        if (stats.sceneSynopsisUsed > 0 || stats.sceneFullTextCount > 0) {
            classes.push('scene');
        }
        if (stats.bookOutlineCount > 0 || stats.sagaOutlineCount > 0) {
            classes.push('outline');
        }
        const referenceClasses = Object.keys(stats.referenceByClass).filter(key => stats.referenceByClass[key] > 0);
        const orderedReferences = this.orderReferenceClasses(referenceClasses);
        classes.push(...orderedReferences);
        return classes.length ? classes.join(' · ') : 'None';
    }

    private orderReferenceClasses(referenceClasses: string[]): string[] {
        const priority = ['character', 'place', 'power'];
        const ordered = priority.filter(name => referenceClasses.includes(name));
        const others = referenceClasses.filter(name => !priority.includes(name)).sort();
        return [...ordered, ...others];
    }

    private estimateTokensFromChars(chars: number): number {
        if (!Number.isFinite(chars) || chars <= 0) return 0;
        return Math.max(1, Math.ceil(chars / INQUIRY_CHARS_PER_TOKEN));
    }

    private formatTokenEstimate(value: number): string {
        const safe = Number.isFinite(value) ? value : 0;
        if (safe >= 1000) {
            const rounded = Math.round(safe / 100) / 10;
            return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}k`;
        }
        return String(Math.round(safe));
    }

    private formatRootsSummary(resolvedRoots: string[], scanRoots: string[]): string {
        if (!resolvedRoots.length) {
            const hasVaultRoot = scanRoots.length === 0 || scanRoots.some(root => !root || root === '/');
            return hasVaultRoot ? '/ (entire vault · 1 root)' : 'No scan roots';
        }
        if (resolvedRoots.length === 1) {
            const root = resolvedRoots[0];
            if (!root) return '/ (entire vault · 1 root)';
            return `/${root} (1 root)`;
        }
        const root = resolvedRoots[0];
        const first = root ? `/${root}` : '/';
        return `${first} … (${resolvedRoots.length} roots)`;
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
            if (element.getAttribute('data-tooltip') === text || element.getAttribute('data-tooltip') === balancedText) {
                element.removeAttribute('data-tooltip');
            }
            element.removeAttribute('data-tooltip-placement');
            element.classList.remove('rt-tooltip-target');
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
                element: this.glyphHit,
                text: 'Toggle focus ring expansion.',
                placement: 'top'
            },
            {
                element: this.navPrevButton,
                text: 'Previous focus.',
                placement: 'top'
            },
            {
                element: this.navNextButton,
                text: 'Next focus.',
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
                    inputTokens: 0,
                    outputTokens: INQUIRY_MAX_OUTPUT_TOKENS,
                    totalTokens: INQUIRY_MAX_OUTPUT_TOKENS,
                    inputChars: 0
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
        options?: { sessionKey?: string; normalizationNotes?: string[]; silent?: boolean }
    ): Promise<string | null> {
        if (!this.plugin.settings.logApiInteractions) return null;
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
        const content = this.buildInquiryLogContent(result, trace, logTitle, options?.normalizationNotes);

        try {
            const file = await this.app.vault.create(filePath, content);
            if (options?.sessionKey) {
                this.sessionStore.updateSession(options.sessionKey, {
                    logPath: file.path
                });
            }
            return file.path;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                new Notice(`Unable to save inquiry log: ${message}`);
            }
            return null;
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

        if (brief.sceneNotes.length) {
            lines.push('', '## Per-Scene / Per-Moment Notes');
            brief.sceneNotes.forEach(note => {
                lines.push(`- ${note.label}: ${note.note}`);
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

    private buildInquirySceneNotes(result: InquiryResult): Array<{ label: string; note: string }> {
        if (result.scope !== 'book') return [];
        const items = this.getResultItems(result);
        const orderedFindings = this.getOrderedFindings(result, result.mode);
        const notes = new Map<string, string>();

        orderedFindings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const label = this.resolveFindingChipLabel(finding, result, items)
                ?? (finding.refId && /^s\d+$/i.test(finding.refId.trim()) ? finding.refId.trim().toUpperCase() : null);
            if (!label || notes.has(label)) return;
            const note = (finding.bullets?.find(entry => entry?.trim()) || finding.headline || '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!note) return;
            notes.set(label, note);
        });

        return Array.from(notes.entries()).map(([label, note]) => ({ label, note }));
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

    private buildInquiryLogContent(
        result: InquiryResult,
        trace: InquiryRunTrace,
        logTitle?: string,
        normalizationNotes?: string[]
    ): string {
        const title = logTitle ?? this.formatInquiryLogTitle(result);
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
        const tokenEstimateInput = typeof trace.tokenEstimate?.inputTokens === 'number'
            ? trace.tokenEstimate.inputTokens
            : (typeof result.tokenEstimateInput === 'number' ? result.tokenEstimateInput : null);
        const tokenTier = typeof tokenEstimateInput === 'number'
            ? this.getTokenTier(tokenEstimateInput)
            : (result.tokenEstimateTier || null);

        let status: AiLogStatus = 'success';
        if (result.aiReason === 'stub') {
            status = 'simulated';
        } else if (this.isErrorResult(result)) {
            status = 'error';
        }

        const tokenUsage = trace.usage
            ?? (trace.response?.responseData ? extractTokenUsage(aiProvider, trace.response.responseData) : null);
        const { sanitized: sanitizedPayload, redactedKeys } = sanitizeLogPayload(trace.requestPayload ?? null);
        const redactionNotes = redactedKeys.length
            ? [`Redacted request keys: ${redactedKeys.join(', ')}.`]
            : [];
        const sanitizationSteps = [...(trace.sanitizationNotes || []), ...redactionNotes].filter(Boolean);
        const schemaWarnings = [
            ...(trace.notes || []),
            ...(normalizationNotes || [])
        ].filter(Boolean);

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
        }, { jsonSpacing: 0 });

        const contextLines = [
            '## Inquiry Context',
            `- Artifact ID: ${artifactId}`,
            `- Run ID: ${result.runId || 'unknown'}`,
            `- Plugin version: ${this.plugin.manifest.version}`,
            `- Corpus fingerprint: ${result.corpusFingerprint || 'unknown'}`,
            `- Scope: ${result.scope || 'unknown'}`,
            `- Focus ID: ${result.focusId || 'unknown'}`,
            `- Mode: ${result.mode || 'unknown'}`,
            `- Question ID: ${result.questionId || 'unknown'}`,
            `- Question zone: ${result.questionZone || 'unknown'}`,
            `- AI provider: ${result.aiProvider || 'unknown'}`,
            `- AI model requested: ${result.aiModelRequested || 'unknown'}`,
            `- AI model resolved: ${result.aiModelResolved || 'unknown'}`,
            `- AI next-run override: ${typeof result.aiModelNextRunOnly === 'boolean' ? String(result.aiModelNextRunOnly) : 'unknown'}`,
            `- AI status: ${result.aiStatus || 'unknown'}`,
            `- AI reason: ${result.aiReason || 'none'}`,
            `- Submitted at (raw): ${result.submittedAt || 'unknown'}`,
            `- Returned at (raw): ${result.completedAt || 'unknown'}`,
            `- Round trip ms: ${typeof result.roundTripMs === 'number' ? String(result.roundTripMs) : 'unknown'}`,
            `- Token estimate input: ${typeof result.tokenEstimateInput === 'number' ? String(Math.round(result.tokenEstimateInput)) : 'unknown'}`,
            `- Token estimate tier: ${result.tokenEstimateTier || 'unknown'}`
        ];

        return `${logContent}\n\n${contextLines.join('\n')}\n`;
    }

    private formatInquiryLogTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Log — ${parts.join(' · ')} ${timestamp}`;
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
