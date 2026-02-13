/**
 * Shared normalization helpers for beat-related user inputs.
 * Keeps matching, filenames, and settings edits consistent.
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;
const HAS_ALNUM = /[A-Za-z0-9]/;

function normalizeInlineText(value: string): string {
  return (value || '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasBeatReadableText(value: string): boolean {
  return HAS_ALNUM.test(value);
}

export function normalizeBeatSetNameInput(value: string, fallback = 'Custom'): string {
  const normalized = normalizeInlineText(value);
  return normalized || fallback;
}

export function normalizeBeatNameInput(value: string, fallback = 'New Beat'): string {
  const normalized = normalizeInlineText(value);
  return normalized || fallback;
}

export function normalizeBeatFieldKeyInput(value: string): string {
  // YAML keys should not contain ":" because it breaks key serialization.
  return normalizeInlineText(value).replace(/:/g, ' - ').replace(/\s+/g, ' ').trim();
}

export function normalizeBeatFieldValueInput(value: string): string {
  return normalizeInlineText(value);
}

export function normalizeBeatFieldListValueInput(value: string): string[] {
  return (value || '')
    .split(',')
    .map(v => normalizeBeatFieldValueInput(v))
    .filter(Boolean);
}

export function sanitizeBeatFilenameSegment(value: string, fallback = 'Beat'): string {
  const normalized = normalizeInlineText(value)
    .replace(/[\\/:*?"<>|!.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-|-$/g, '')
    .trim();
  return normalized || fallback;
}

function normalizeForMatching(value: string): string {
  return normalizeInlineText(value)
    .replace(/[\/\\\-_‐‑‒–—―]+/g, ' ')
    .replace(/[^A-Za-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function toBeatMatchKey(value: string): string {
  const trimmed = normalizeInlineText(value);
  if (!trimmed) return '';
  const withoutAct = trimmed.replace(/^Act\s*\d+\s*:\s*/i, '');
  const withoutPrefix = withoutAct.replace(/^\d+(?:\.\d+)?\s*[.\-:)]?\s*/i, '');
  return normalizeForMatching(withoutPrefix);
}

export function toBeatModelMatchKey(value: string): string {
  return normalizeForMatching(value).replace(/\s+/g, '');
}

export function resolveSelectedBeatModel(
  selectedBeatSystem?: string,
  customBeatSystemName?: string
): string | undefined {
  const system = normalizeBeatSetNameInput(selectedBeatSystem ?? '', '');
  if (!system) return undefined;
  if (toBeatModelMatchKey(system) !== 'custom') return system;
  const custom = normalizeBeatSetNameInput(customBeatSystemName ?? '', '');
  return custom || 'Custom';
}
