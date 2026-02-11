/*
 * Beat Template Note Creation
 */
import { Vault, TFile, normalizePath } from 'obsidian';
import { PLOT_SYSTEMS, PLOT_SYSTEM_NAMES, PlotSystemTemplate, PlotBeatInfo } from './beatsSystems';
import { mergeTemplates } from './sceneGenerator';
import type { BeatSystemConfig, RadialTimelineSettings } from '../types/settings';

/** Legacy beat base template — canonical beat fields only (Gossamer fields are injected dynamically). */
const LEGACY_BEAT_BASE = `Class: Beat
Act: {{Act}}
Purpose: {{Purpose}}
Beat Model: {{BeatModel}}
Range: {{Range}}`;

// ─── Per-system Beat Config Resolvers ────────────────────────────────

/** Empty config used as safe default when no config exists for a system. */
const EMPTY_BEAT_CONFIG: BeatSystemConfig = { beatYamlAdvanced: '', beatHoverMetadataFields: [] };
const DISALLOWED_BEAT_WRITE_FIELDS = new Set(['Description', 'When']);

/** Normalize a Beat Model string for case-insensitive matching. */
function normalizeModelKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Resolve the BeatSystemConfig for the currently active system in settings.
 * Used by: settings UI editor, note generation (getMergedBeatYamlTemplate).
 * Optional systemKey overrides the active system (for editor previews).
 */
export function getBeatConfigForSystem(
  settings: RadialTimelineSettings,
  systemKey?: string
): BeatSystemConfig {
  const system = systemKey ?? settings.beatSystem ?? 'Save The Cat';
  const key = system === 'Custom'
    ? `custom:${settings.activeCustomBeatSystemId ?? 'default'}`
    : system;
  // Primary: per-system config map
  if (settings.beatSystemConfigs?.[key]) return settings.beatSystemConfigs[key];
  // Legacy fallback: global fields (pre-migration vaults)
  return {
    beatYamlAdvanced: settings.beatYamlTemplates?.advanced ?? '',
    beatHoverMetadataFields: settings.beatHoverMetadataFields ?? [],
  };
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
  if (!configs) {
    // Legacy fallback: no migration yet, return global fields
    return {
      beatYamlAdvanced: settings.beatYamlTemplates?.advanced ?? '',
      beatHoverMetadataFields: settings.beatHoverMetadataFields ?? [],
    };
  }
  if (!beatModel) return EMPTY_BEAT_CONFIG;

  // 1. Direct built-in match (exact key)
  if (configs[beatModel]) return configs[beatModel];

  // 2. Case-insensitive built-in match
  const normalized = normalizeModelKey(beatModel);
  for (const builtinName of PLOT_SYSTEM_NAMES) {
    if (normalizeModelKey(builtinName) === normalized && configs[builtinName]) {
      return configs[builtinName];
    }
  }

  // 3. Active custom system (Beat Model stores the custom system name, not the key)
  const activeCustomKey = `custom:${settings.activeCustomBeatSystemId ?? 'default'}`;
  if (configs[activeCustomKey]) {
    // Check if the custom system name matches the Beat Model
    const customName = settings.customBeatSystemName ?? 'Custom';
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

  // 5. Fallback: if active custom is a catch-all for unrecognized Beat Models
  if (configs[activeCustomKey]) return configs[activeCustomKey];

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
 * Returns the merged beat YAML template string (base + advanced).
 * Reads advanced YAML from the active system's config slot (per-system).
 * Falls back to legacy globals for pre-migration vaults.
 */
export function getMergedBeatYamlTemplate(settings: RadialTimelineSettings): string {
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
 * Create Beat template notes for a given beat system
 */
export async function createBeatTemplateNotes(
  vault: Vault,
  beatSystemName: string,
  sourcePath: string,
  customSystem?: PlotSystemTemplate,
  options?: { actStartNumbers?: Map<number, number>; beatTemplate?: string }
): Promise<{ created: number; skipped: number; errors: string[] }> {
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

  const sanitize = (s: string) =>
    s.replace(/[\\/:*?"<>|!.]+/g, '-').replace(/-+/g, '-').replace(/\s+/g, ' ').replace(/^-|-$/g, '').trim();

  // Use the custom system name (if provided) for Beat Model frontmatter instead of generic "Custom"
  const beatModelName = beatSystem.name || beatSystemName;

  const actStartNumbers = options?.actStartNumbers;
  const useActAlignedNumbers = !!actStartNumbers && actStartNumbers.size > 0;
  const actCounters = new Map<number, number>();

  const resolveBeatNumber = (act: number, fallback: number): number => {
    if (!useActAlignedNumbers) return fallback;
    if (actStartNumbers?.has(act)) {
      const start = actStartNumbers.get(act);
      if (start !== undefined) {
        const next = actCounters.get(act) ?? start;
        actCounters.set(act, next + 1);
        return next;
      }
    }
    if (act === 1) {
      const next = actCounters.get(act) ?? 1;
      actCounters.set(act, next + 1);
      return next;
    }
    return fallback;
  };

  for (let i = 0; i < beatSystem.beats.length; i++) {
    const beatName = beatSystem.beats[i];
    const beatInfo = beatSystem.beatDetails[i];
    // Use explicit act if available, otherwise calculate
    const act = beatInfo.act ? beatInfo.act : getBeatAct(i, beatSystem.beats.length);
    const beatNumber = resolveBeatNumber(act, i + 1);
    
    // Use canonical title without "Act X:" prefix for filename
    const displayName = stripActPrefix(beatName);
    const safeBeatName = sanitize(displayName);
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

    try {
      await vault.create(normalizedPath, content);
      created++;
    } catch (error) {
      errors.push(`Failed to create "${filename}": ${error}`);
    }
  }

  return { created, skipped, errors };
}
