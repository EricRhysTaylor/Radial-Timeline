/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { normalizePath } from 'obsidian';

/**
 * Sanitize a vault-relative source path using Obsidian's normalizePath.
 */
export function sanitizeSourcePath(sourcePath: string | undefined | null): string {
  const p = (sourcePath || '').trim();
  return p ? normalizePath(p) : '';
}

/**
 * Build the initial scene filename placed under the given (sanitized) source path.
 * Defaults to using "1 Test Scene.md" as the initial file name.
 */
export function buildInitialSceneFilename(sanitizedSourcePath: string, baseName: string = '1 Test Scene.md'): string {
  return `${sanitizedSourcePath ? sanitizedSourcePath + '/' : ''}${baseName}`;
}


