/*
 * Beat Set Note Creation
 *
 * NOTE: Legacy "template" terminology retained as deprecated aliases
 * at the bottom of this file for backward compatibility.
 * Scheduled for removal after v5.2.
 */
import { Vault, TFile, normalizePath } from 'obsidian';
import { PLOT_SYSTEMS, PLOT_SYSTEM_NAMES, PRO_BEAT_SETS, PlotSystemPreset, PlotBeatInfo } from './beatsSystems';
import { mergeTemplates } from './sceneGenerator';
import type { BeatSystemConfig, RadialTimelineSettings } from '../types/settings';
import { normalizeBeatSetNameInput, sanitizeBeatFilenameSegment, toBeatModelMatchKey } from './beatsInputNormalize';

/** Legacy beat base template — canonical beat fields only (Gossamer fields are injected dynamically). */
const LEGACY_BEAT_BASE = `Class: Beat
Act: {{Act}}
Purpose: {{Purpose}}
Beat Model: {{BeatModel}}
Range: {{Range}}`;

// ─── Per-system Beat Config Resolvers ────────────────────────────────

/** Empty config used as safe default when no config exists for a system. */
const EMPTY_BEAT_CONFIG: BeatSystemConfig = { beatYamlAdvanced: '', beatHoverMetadataFields: [] };
const DISALLOWED_BEAT_WRITE_FIELDS = new Set(['Description']);
let warnedMissingBeatModelResolution = false;

/** Normalize a Beat Model string for case-insensitive matching. */
function normalizeModelKey(s: string): string {
  return toBeatModelMatchKey(s);
}

/**
 * Resolve the BeatSystemConfig for the currently active system in settings.
 * Used by: settings UI editor, note generation (getMergedBeatYaml).
 * Optional systemKey overrides the active system (for editor previews).
 */
export function getBeatConfigForSystem(
  settings: RadialTimelineSettings,
  systemKey?: string
): BeatSystemConfig {
  const system = (systemKey ?? settings.beatSystem ?? 'Save The Cat').trim();
  const isCustomScoped = system === 'Custom' || system.startsWith('custom:');
  const key = system === 'Custom'
    ? `custom:${settings.activeCustomBeatSystemId ?? 'default'}`
    : system;
  // Primary: per-system config map
  if (settings.beatSystemConfigs?.[key]) return settings.beatSystemConfigs[key];
  // Custom systems must read only from per-set config slots.
  if (isCustomScoped) return EMPTY_BEAT_CONFIG;
  // Legacy fallback: global fields (pre-migration vaults)
  return {
    beatYamlAdvanced: settings.beatYamlTemplates?.advanced ?? '',
    beatHoverMetadataFields: settings.beatHoverMetadataFields ?? [],
  };
}

/**
 * Ensure a BeatSystemConfig slot exists for the given system; create if missing.
 * Used by the Fields editor when persisting edits.
 */
export function ensureBeatConfigForSystem(
  settings: RadialTimelineSettings,
  systemKey?: string
): BeatSystemConfig {
  const system = (systemKey ?? settings.beatSystem ?? 'Save The Cat').trim();
  const key = system === 'Custom'
    ? `custom:${settings.activeCustomBeatSystemId ?? 'default'}`
    : system;
  if (!settings.beatSystemConfigs) settings.beatSystemConfigs = {};
  if (!settings.beatSystemConfigs[key]) {
    if (system === 'Custom' || system.startsWith('custom:')) {
      settings.beatSystemConfigs[key] = { beatYamlAdvanced: '', beatHoverMetadataFields: [] };
    } else {
      settings.beatSystemConfigs[key] = {
        beatYamlAdvanced: settings.beatYamlTemplates?.advanced ?? '',
        beatHoverMetadataFields: [...(settings.beatHoverMetadataFields ?? [])],
      };
    }
  }
  return settings.beatSystemConfigs[key];
}

/**
 * Resolve the BeatSystemConfig for a specific beat note by its Beat Model frontmatter value.
 * Used by: SynopsisManager (hover), SearchService (indexing).
 * Falls back through: exact built-in match → active custom → saved custom name match → empty.
 */
export function getBeatConfigForItem(
  settings: RadialTimelineSettings,
  beatModel: string | undefined
): BeatSystemConfig {
  const configs = settings.beatSystemConfigs;
  const beatModelValue = (beatModel ?? '').trim();
  const normalized = normalizeModelKey(beatModelValue);
  if (!normalized) {
    if (process.env.NODE_ENV !== 'production' && !warnedMissingBeatModelResolution) {
      warnedMissingBeatModelResolution = true;
      console.warn('[BeatHover] Attempted beat hover config resolution with missing Beat Model.');
    }
    return EMPTY_BEAT_CONFIG;
  }
  const isBuiltinModel = PLOT_SYSTEM_NAMES.some(name => normalizeModelKey(name) === normalized);

  if (!configs) {
    // Custom beat models do not fall back to legacy globals.
    if (!isBuiltinModel) return EMPTY_BEAT_CONFIG;
    // Legacy fallback: built-ins only (pre-migration vaults)
    return {
      beatYamlAdvanced: settings.beatYamlTemplates?.advanced ?? '',
      beatHoverMetadataFields: settings.beatHoverMetadataFields ?? [],
    };
  }

  // 1. Direct built-in match (exact key)
  if (configs[beatModelValue]) return configs[beatModelValue];

  // 2. Case-insensitive built-in match
  for (const builtinName of PLOT_SYSTEM_NAMES) {
    if (normalizeModelKey(builtinName) === normalized && configs[builtinName]) {
      return configs[builtinName];
    }
  }

  // 3. Active custom system (Beat Model stores the custom system name, not the key)
  const activeCustomKey = `custom:${settings.activeCustomBeatSystemId ?? 'default'}`;
  if (configs[activeCustomKey]) {
    // Check if the custom system name matches the Beat Model
    const customName = normalizeBeatSetNameInput(settings.customBeatSystemName ?? '', 'Custom');
    if (normalizeModelKey(customName) === normalized) {
      return configs[activeCustomKey];
    }
  }

  // 4. Search all saved custom systems by name match
  const saved = settings.savedBeatSystems?.find(
    s => normalizeModelKey(s.name) === normalized
  );
  if (saved) {
    const savedKey = `custom:${saved.id}`;
    if (configs[savedKey]) return configs[savedKey];
  }

  // 5. Starter custom systems by name (maps to custom:<starter-id>)
  const starter = PRO_BEAT_SETS.find(
    s => normalizeModelKey(s.name) === normalized
  );
  if (starter) {
    const starterKey = `custom:${starter.id}`;
    if (configs[starterKey]) return configs[starterKey];
  }

  // 6. Legacy fallback: built-ins only (custom systems stay slot-scoped)
  if (isBuiltinModel) {
    return {
      beatYamlAdvanced: settings.beatYamlTemplates?.advanced ?? '',
      beatHoverMetadataFields: settings.beatHoverMetadataFields ?? [],
    };
  }

  return EMPTY_BEAT_CONFIG;
}

/**
 * Convert beatInfo.range to Range field value (0-100 scale).
 */
function getRangeValue(beatInfo: PlotBeatInfo): string {
  if (beatInfo.range) {
    return beatInfo.range;
  }
  return '';
}

/**
 * Build the note body (description + optional placement). Shared by both paths.
 */
function buildBeatBody(beatInfo: PlotBeatInfo): string {
  const bodyParts: string[] = [];
  if (beatInfo.description) bodyParts.push(beatInfo.description);
  if (beatInfo.placement) {
    bodyParts.push('');
    bodyParts.push(`**Manuscript Position:** ${beatInfo.placement}`);
  }
  return bodyParts.length > 0 ? '\n' + bodyParts.join('\n') + '\n' : '';
}

/**
 * Returns the merged beat YAML string (base + properties).
 * Reads properties YAML from the active system's config slot (per-system).
 * Falls back to legacy globals for pre-migration vaults.
 */
export function getMergedBeatYaml(settings: RadialTimelineSettings): string {
  const configuredBase = settings.beatYamlTemplates?.base ?? LEGACY_BEAT_BASE;
  const base = configuredBase.replace(/^Description:/gm, 'Purpose:');
  const config = getBeatConfigForSystem(settings);
  const advanced = sanitizeBeatAdvancedForWrite(config.beatYamlAdvanced);
  if (!advanced.trim()) return base;
  return mergeTemplates(base, advanced);
}

function sanitizeBeatAdvancedForWrite(advancedTemplate: string): string {
  const lines = (advancedTemplate || '').split('\n');
  const result: string[] = [];
  let skipUntilNextField = false;

  for (const line of lines) {
    const fieldMatch = line.match(/^([A-Za-z][A-Za-z0-9 _'-]*):/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].trim();
      if (DISALLOWED_BEAT_WRITE_FIELDS.has(fieldName)) {
        skipUntilNextField = true;
        continue;
      }
      skipUntilNextField = false;
      result.push(line);
      continue;
    }
    if (skipUntilNextField) continue;
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Generate Beat note content with frontmatter and body.
 * When a template string is provided, uses {{Placeholder}} substitution.
 * When omitted, produces the exact legacy hardcoded output for backward compatibility.
 */
function generatePlotNoteContent(
  beatInfo: PlotBeatInfo,
  act: number,
  beatSystem: string,
  template?: string
): string {
  const yamlEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const purpose = beatInfo.description ? `"${yamlEscape(beatInfo.description)}"` : '""';
  const rangeValue = getRangeValue(beatInfo);

  if (template) {
    // Template-based generation using {{Placeholder}} substitution
    let content = template;
    content = content.replace(/{{Act}}/g, act.toString());
    // Support both placeholder names for backwards compatibility.
    content = content.replace(/{{Purpose}}/g, purpose);
    content = content.replace(/{{Description}}/g, purpose);
    content = content.replace(/{{BeatModel}}/g, beatSystem);
    content = content.replace(/{{Range}}/g, rangeValue);

    return `---\n${content}\n---\n` + buildBeatBody(beatInfo);
  }

  // Legacy hardcoded output (backward compatibility)
  const frontmatter = [
    '---',
    'Class: Beat',
    `Act: ${act}`,
    `Purpose: ${purpose}`,
    `Beat Model: ${beatSystem}`,
    rangeValue ? `Range: ${rangeValue}` : 'Range:',
    '---',
    ''
  ].join('\n');

  return frontmatter + buildBeatBody(beatInfo);
}

/**
 * Determine Act number based on beat position
 * Roughly: first third = Act 1, middle third = Act 2, final third = Act 3
 */
function getBeatAct(beatIndex: number, totalBeats: number): number {
  const position = beatIndex / totalBeats;
  if (position < 0.33) return 1;
  if (position < 0.67) return 2;
  return 3;
}

/**
 * Spread N beats evenly across M scene positions, returning the chosen scene numbers.
 * - 0 beats: returns []
 * - 1 beat: picks the first scene number
 * - N beats, N <= M: picks evenly spaced scene numbers using index interpolation
 * - N > M: assigns scenes first, then interpolates extras between last scene and max+1
 * - fallback (no scene data): sequential from 1
 */
export function spreadBeatsAcrossScenes(
  beatCount: number,
  sceneNumbers: number[]
): number[] {
  if (beatCount === 0) return [];
  const M = sceneNumbers.length;
  if (M === 0) {
    // Fallback: sequential from 1
    return Array.from({ length: beatCount }, (_, i) => i + 1);
  }
  if (beatCount === 1) return [sceneNumbers[0]];
  if (beatCount <= M) {
    // Pick evenly spaced indices across the scene array
    return Array.from({ length: beatCount }, (_, i) => {
      const idx = Math.round(i * (M - 1) / (beatCount - 1));
      return sceneNumbers[idx];
    });
  }
  // More beats than scenes: assign scenes first, then interpolate extras
  const result = [...sceneNumbers];
  const lastScene = sceneNumbers[M - 1];
  const extra = beatCount - M;
  for (let i = 1; i <= extra; i++) {
    result.push(lastScene + i);
  }
  return result;
}

/**
 * Create beat set notes for a given beat system.
 */
export async function createBeatNotesFromSet(
  vault: Vault,
  beatSystemName: string,
  sourcePath: string,
  customSystem?: PlotSystemPreset,
  options?: { actSceneNumbers?: Map<number, number[]>; beatTemplate?: string }
): Promise<{ created: number; skipped: number; errors: string[]; createdPaths: string[] }> {
  let beatSystem = PLOT_SYSTEMS[beatSystemName];
  
  if (beatSystemName === 'Custom' && customSystem) {
    beatSystem = customSystem;
  }
  
  if (!beatSystem) {
    throw new Error(`Unknown beat system: ${beatSystemName}`);
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdPaths: string[] = [];

  // Normalize source path
  const targetFolder = sourcePath.trim() ? normalizePath(sourcePath.trim()) : '';

  // Ensure folder exists
  if (targetFolder) {
    const folder = vault.getAbstractFileByPath(targetFolder);
    if (!folder) {
      try {
        await vault.createFolder(targetFolder);
      } catch (e) {
        // Folder might already exist
      }
    }
  }

  const stripActPrefix = (name: string): string => {
    const m = name.match(/^Act\s*\d+\s*:\s*(.+)$/i);
    return m ? m[1].trim() : name.trim();
  };

  // Use the custom system name (if provided) for Beat Model frontmatter instead of generic "Custom"
  const beatModelName = normalizeBeatSetNameInput(beatSystem.name || beatSystemName, beatSystemName || 'Custom');
  if (!beatModelName.trim()) {
    const message = `[BeatTemplates] Missing Beat Model while creating beats for "${beatSystemName}".`;
    console.warn(message);
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(message);
    }
  }

  // Pre-compute beat numbers per act using scene-aligned spread
  const actSceneNumbers = options?.actSceneNumbers;
  const beatsByAct = new Map<number, number[]>(); // act -> beat indices
  for (let i = 0; i < beatSystem.beats.length; i++) {
    const beatInfo = beatSystem.beatDetails[i];
    const act = beatInfo.act ? beatInfo.act : getBeatAct(i, beatSystem.beats.length);
    const list = beatsByAct.get(act) ?? [];
    list.push(i);
    beatsByAct.set(act, list);
  }

  const beatNumberByIndex = new Array<number>(beatSystem.beats.length);
  let nextFallbackNumber = 1;
  const sortedActs = [...beatsByAct.keys()].sort((a, b) => a - b);
  sortedActs.forEach((actNum) => {
    const indices = beatsByAct.get(actNum) ?? [];
    const sceneNums = actSceneNumbers?.get(actNum) ?? [];
    if (sceneNums.length > 0) {
      const spread = spreadBeatsAcrossScenes(indices.length, sceneNums);
      indices.forEach((beatIdx, i) => {
        beatNumberByIndex[beatIdx] = spread[i];
      });
      const spreadMax = Math.max(...spread);
      if (Number.isFinite(spreadMax)) {
        nextFallbackNumber = Math.max(nextFallbackNumber, spreadMax + 1);
      }
      return;
    }

    // No scene range for this act: keep numbering globally monotonic.
    indices.forEach((beatIdx, i) => {
      beatNumberByIndex[beatIdx] = nextFallbackNumber + i;
    });
    nextFallbackNumber += indices.length;
  });
  // Final safety fallback for any undefined index.
  beatNumberByIndex.forEach((val, idx) => {
    if (val === undefined) beatNumberByIndex[idx] = idx + 1;
  });

  for (let i = 0; i < beatSystem.beats.length; i++) {
    const beatName = beatSystem.beats[i];
    const beatInfo = beatSystem.beatDetails[i];
    // Use explicit act if available, otherwise calculate
    const act = beatInfo.act ? beatInfo.act : getBeatAct(i, beatSystem.beats.length);
    const beatNumber = beatNumberByIndex[i];
    
    // Use canonical title without "Act X:" prefix for filename
    const displayName = stripActPrefix(beatName);
    const safeBeatName = sanitizeBeatFilenameSegment(displayName);
    const filename = `${beatNumber} ${safeBeatName}.md`;
    const filePath = targetFolder ? `${targetFolder}/${filename}` : filename;
    const normalizedPath = normalizePath(filePath);

    // Check if file already exists
    const existingFile = vault.getAbstractFileByPath(normalizedPath);
    if (existingFile) {
      skipped++;
      continue;
    }

    // Generate full note content with frontmatter and body
    const content = generatePlotNoteContent(beatInfo, act, beatModelName, options?.beatTemplate);
    const beatModelMatch = content.match(/^Beat Model\s*:\s*(.+)$/m);
    const hasBeatModel = !!beatModelMatch && beatModelMatch[1].trim().length > 0;
    if (!hasBeatModel) {
      const message = `[BeatTemplates] Generated beat note without Beat Model: ${filename}`;
      console.warn(message);
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(message);
      }
    }

    try {
      await vault.create(normalizedPath, content);
      created++;
      createdPaths.push(normalizedPath);
    } catch (error) {
      errors.push(`Failed to create "${filename}": ${error}`);
    }
  }

  return { created, skipped, errors, createdPaths };
}

// ─── Deprecated aliases (remove after v5.2) ─────────────────────────

/** @deprecated Use getMergedBeatYaml */
export const getMergedBeatYamlTemplate = getMergedBeatYaml;

/** @deprecated Use createBeatNotesFromSet */
export const createBeatTemplateNotes = createBeatNotesFromSet;
