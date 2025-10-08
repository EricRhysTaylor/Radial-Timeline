/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
export function formatNumber(num: number): string {
  if (Math.abs(num) < 0.001) return '0';
  return num.toFixed(3).replace(/\.0+$/, '').replace(/\.$/, '');
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;))/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
} 