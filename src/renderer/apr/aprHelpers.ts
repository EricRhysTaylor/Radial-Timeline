import type { AuthorProgressSettings, AprCampaign } from '../../types/settings';
import type RadialTimelinePlugin from '../../main';
import { normalizePath, TFolder } from 'obsidian';

/**
 * Resolves the effective project path for a given target (Core Social or Campaign override)
 *
 * Inheritance order:
 * 1. Campaign override (campaign.projectPath)
 * 2. Core Social configuration (socialProjectPath)
 * 3. Fallback to main Source path for backward compatibility
 *
 * @param authorProgress - Core Social settings
 * @param campaign - Optional campaign with possible override
 * @param sourcePath - Main source path (fallback)
 * @returns The resolved project path
 */
export function resolveProjectPath(
    authorProgress: AuthorProgressSettings,
    campaign: AprCampaign | null,
    sourcePath: string
): string {
    // Campaign override takes priority
    if (campaign?.projectPath && campaign.projectPath.trim()) {
        return campaign.projectPath.trim();
    }

    // Use Core Social configuration
    if (authorProgress.socialProjectPath && authorProgress.socialProjectPath.trim()) {
        return authorProgress.socialProjectPath.trim();
    }

    // Fallback to main Source path for backward compatibility
    return sourcePath;
}

/**
 * Resolves the effective book title for a given target (Core Social or Campaign override)
 *
 * Inheritance order:
 * 1. Campaign override (campaign.bookTitle)
 * 2. Core Social configuration (socialBookTitle)
 * 3. Fallback to existing bookTitle
 * 4. Fallback to derived title from project path folder basename
 *
 * @param authorProgress - Core Social settings
 * @param campaign - Optional campaign with possible override
 * @param projectPath - The resolved project path (to derive title from)
 * @returns The resolved book title
 */
export function resolveBookTitle(
    authorProgress: AuthorProgressSettings,
    campaign: AprCampaign | null,
    projectPath: string
): string {
    // Campaign override takes priority
    if (campaign?.bookTitle && campaign.bookTitle.trim()) {
        return campaign.bookTitle.trim();
    }

    // Use Core Social configuration
    if (authorProgress.socialBookTitle && authorProgress.socialBookTitle.trim()) {
        return authorProgress.socialBookTitle.trim();
    }

    // Fallback to existing bookTitle
    if (authorProgress.bookTitle && authorProgress.bookTitle.trim()) {
        return authorProgress.bookTitle.trim();
    }

    // Fallback to derived title from folder basename
    return deriveBookTitleFromPath(projectPath);
}

/**
 * Derives a book title from a folder path by taking the last segment (basename)
 * and normalizing it for public-facing display.
 *
 * Normalization steps:
 * - Replace '-' and '_' with spaces
 * - Collapse multiple spaces into single space
 * - Strip common folder tokens (projects, books, drafts, manuscripts)
 * - Title Case
 * - Clamp to ~50 characters with ellipsis
 *
 * Examples:
 * - "Books/My-Novel/working-draft" -> "My Novel Working Draft"
 * - "Projects/songrise_2.0" -> "Songrise 2.0"
 * - "manuscripts/the-great-adventure-book-one" -> "The Great Adventure Book One"
 *
 * @param path - The folder path
 * @returns The derived, normalized title
 */
export function deriveBookTitleFromPath(path: string): string {
    if (!path || !path.trim()) {
        return 'Untitled';
    }

    const normalized = normalizePath(path.trim());
    const segments = normalized.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
        return 'Untitled';
    }

    let title = segments[segments.length - 1];

    // Replace '-' and '_' with spaces
    title = title.replace(/[-_]/g, ' ');

    // Collapse multiple spaces into single space
    title = title.replace(/\s+/g, ' ').trim();

    // Strip common folder tokens (case-insensitive)
    const tokensToRemove = /\b(projects?|books?|drafts?|manuscripts?|writing|work|wip)\b/gi;
    title = title.replace(tokensToRemove, ' ');

    // Collapse spaces again after token removal
    title = title.replace(/\s+/g, ' ').trim();

    // If title is now empty, return Untitled
    if (!title) {
        return 'Untitled';
    }

    // Title Case - capitalize first letter of each word
    title = title
        .split(' ')
        .map(word => {
            if (!word) return '';
            // Preserve numbers and special characters as-is
            if (/^[\d.]+$/.test(word)) return word;
            // Capitalize first letter, lowercase rest
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');

    // Clamp to ~50 characters with ellipsis
    const maxLength = 50;
    if (title.length > maxLength) {
        title = title.slice(0, maxLength - 1).trim() + '…';
    }

    return title;
}

/**
 * Validates that a project path exists and is a folder
 *
 * @param path - The path to validate
 * @param plugin - The plugin instance (for vault access)
 * @returns true if path is valid and points to an existing folder
 */
export async function validateProjectPath(
    path: string,
    plugin: RadialTimelinePlugin
): Promise<boolean> {
    if (!path || path.trim() === '') {
        return false;
    }

    const normalizedPath = normalizePath(path.trim());
    const file = plugin.app.vault.getAbstractFileByPath(normalizedPath);
    const isValid = file instanceof TFolder && file.path === normalizedPath;

    return isValid;
}

/**
 * Remembers a valid project path in the settings for autocomplete suggestions
 * De-duplicates and prioritizes recent entries (most recent first)
 *
 * @param path - The valid path to remember
 * @param plugin - The plugin instance
 */
export async function rememberProjectPath(
    path: string,
    plugin: RadialTimelinePlugin
): Promise<void> {
    const normalizedPath = normalizePath(path.trim());

    // Initialize validProjectPaths if it doesn't exist
    if (!plugin.settings.validProjectPaths) {
        plugin.settings.validProjectPaths = [];
    }

    let { validProjectPaths } = plugin.settings;

    // Remove existing entry if present (for de-duplication and re-prioritization)
    validProjectPaths = validProjectPaths.filter(p => p !== normalizedPath);

    // Add to front (most recent first)
    validProjectPaths.unshift(normalizedPath);

    // Keep last 10 entries (cap at 10)
    if (validProjectPaths.length > 10) {
        validProjectPaths = validProjectPaths.slice(0, 10);
    }

    plugin.settings.validProjectPaths = validProjectPaths;
    await plugin.saveSettings();
}

/**
 * Validates and remembers a project path (combines validation + persistence)
 *
 * @param path - The path to validate and remember
 * @param plugin - The plugin instance
 * @returns true if path is valid
 */
export async function validateAndRememberProjectPath(
    path: string,
    plugin: RadialTimelinePlugin
): Promise<boolean> {
    const isValid = await validateProjectPath(path, plugin);

    if (isValid) {
        await rememberProjectPath(path, plugin);
    }

    return isValid;
}
