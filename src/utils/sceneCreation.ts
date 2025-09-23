/**
 * Sanitize a vault-relative source path by trimming whitespace and removing
 * any leading or trailing slashes.
 */
export function sanitizeSourcePath(sourcePath: string | undefined | null): string {
  let p = (sourcePath || '').trim();
  if (p.startsWith('/')) p = p.slice(1);
  if (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Build the initial scene filename placed under the given (sanitized) source path.
 * Defaults to using "1 Test Scene.md" as the initial file name.
 */
export function buildInitialSceneFilename(sanitizedSourcePath: string, baseName: string = '1 Test Scene.md'): string {
  return `${sanitizedSourcePath ? sanitizedSourcePath + '/' : ''}${baseName}`;
}


