import type { MatterMeta } from '../types';

export type MatterSide = 'front' | 'back';
export type MatterBodyMode = 'latex' | 'plain' | 'auto';
export type MatterClass = 'frontmatter' | 'backmatter';

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getFieldValue(source: Record<string, unknown> | undefined, aliases: string[]): unknown {
  if (!source) return undefined;
  const aliasSet = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(source)) {
    if (aliasSet.has(normalizeKey(key))) {
      return value;
    }
  }
  return undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized.length) return undefined;
    if (normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === '0' || normalized === 'off') return false;
  }
  return undefined;
}

function parseOrder(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function normalizeMatterBodyMode(value: unknown): MatterBodyMode {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'latex') return 'latex';
    if (normalized === 'plain') return 'plain';
  }
  return 'auto';
}

export function normalizeMatterClassValue(value: unknown): MatterClass | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'frontmatter' || normalized === 'front') return 'frontmatter';
  if (normalized === 'backmatter' || normalized === 'back') return 'backmatter';
  return null;
}

export function isMatterClassValue(value: unknown): boolean {
  return normalizeMatterClassValue(value) !== null;
}

/**
 * Parse matter metadata from frontmatter.
 *
 * Accepted classes:
 * - `Frontmatter`
 * - `Backmatter`
 */
export function parseMatterMetaFromFrontmatter(
  frontmatter: Record<string, unknown> | undefined
): MatterMeta | null {
  if (!frontmatter) return null;

  const classRaw = getFieldValue(frontmatter, ['Class']);
  const classValue = normalizeMatterClassValue(classRaw);
  if (!classValue) return null;

  const rawRole = getFieldValue(frontmatter, ['Role']);
  const rawUseBookMeta = getFieldValue(frontmatter, ['UseBookMeta', 'UsesBookMeta']);
  const rawBodyMode = getFieldValue(frontmatter, ['BodyMode', 'MatterBodyMode', 'Mode']);
  const rawOrder = getFieldValue(frontmatter, ['Order', 'MatterOrder']);

  const side: MatterSide = classValue === 'backmatter' ? 'back' : 'front';

  const meta: MatterMeta = {
    side,
    bodyMode: normalizeMatterBodyMode(rawBodyMode),
  };

  const role = asNonEmptyString(rawRole);
  if (role) meta.role = role;

  const usesBookMeta = parseOptionalBoolean(rawUseBookMeta);
  if (usesBookMeta !== undefined) meta.usesBookMeta = usesBookMeta;

  const order = parseOrder(rawOrder);
  if (order !== undefined) meta.order = order;

  return meta;
}
