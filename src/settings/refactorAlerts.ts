/*
 * Radial Timeline Plugin for Obsidian — Refactor Alerts System
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Centralized definitions for refactor alerts and field migrations.
 * Used by:
 * - Settings Core alert row
 * - Advanced YAML Editor inline migration UI
 * - Version Indicator in timeline view
 */

import type { RadialTimelineSettings } from '../types';

// ============================================================================
// Types
// ============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface FieldMigration {
    alertId: string;           // Links to parent RefactorAlert
    oldKey: string;            // e.g., "Revision"
    newKey: string;            // e.g., "Iteration"
    tooltip: string;           // Explanation shown on hover
}

export interface RefactorAlert {
    id: string;
    severity: AlertSeverity;
    icon: string;              // Lucide icon name
    title: string;
    description: string;
    migrations?: FieldMigration[];  // Field migrations associated with this alert
}

// ============================================================================
// Alert Definitions
// ============================================================================

// Base template fields - these should NOT appear in the advanced template
// Used to detect and clean up legacy "complete" advanced templates
export const BASE_TEMPLATE_FIELDS = [
    'Class', 'Act', 'When', 'Duration', 'Synopsis', 'Summary', 'Pending Edits',
    'Subplot', 'Character', 'POV', 'Words', 'Runtime', 'Publish Stage',
    'Status', 'Due', 'Summary Update', 'Pulse Update'
];

// Edit alert wording here (title/description). Settings notifications read from this list.
// Severity: info (blue), warning (orange), critical (red).
export const REFACTOR_ALERTS: RefactorAlert[] = [
    {
        id: 'base-advanced-template-separation-v7',
        severity: 'info',
        icon: 'file-check',
        title: 'Template Structure Updated',
        description: 'Base and advanced YAML templates are now cleanly separated. The base template defines core fields; the advanced template adds optional fields. Commands and Book Designer now merge these automatically. Your templates have been updated to the latest structure.',
    },
    {
        id: 'yaml-revision-to-iteration-v6',
        severity: 'warning',
        icon: 'alert-triangle',
        title: 'YAML Template Update Required',
        description: 'The "Revision" field has been renamed to "Iteration". Update your Advanced YAML template. Existing notes with "Revision:" will continue to work.',
        migrations: [
            {
                alertId: 'yaml-revision-to-iteration-v6',
                oldKey: 'Revision',
                newKey: 'Iteration',
                tooltip: 'Renaming YAML field "Revision" to "Iteration" to avoid confusion and improve codebase stability.',
            }
        ]
    },
    {
        id: 'subplot-to-publication-mode-rename',
        severity: 'info',
        icon: 'info',
        title: 'Mode Renamed',
        description: 'The "Subplot Mode" button (SUBP) has been renamed to "Publication" (PUBL). Same great features, clearer name reflecting its use for publication-focused workflows.',
    },
    {
        id: 'change-type-pulse-update',
        severity: 'info',
        icon: 'info',
        title: 'YAML Type Change: Pending Edits & Summary Update',
        description: '"Pending Edits" is no longer a boolean. It is now a string so it can act as both a yes/no flag and record the last AI API hit (timestamp and AI used). The YAML field "Summary Update" (formerly "Synopsis Update") works identically: string value with timestamp and AI used.',
    },
    {
        id: 'radial-timeline-folder-structure',
        severity: 'info',
        icon: 'folder-plus',
        title: 'New Radial Timeline Folder',
        description: 'A new Radial Timeline folder has been created in your Obsidian vault to organize files under the updated structure, including AI API logs, Inquiry Briefs, Social APR SVGs and campaigns, and other related assets.',
    }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all field migrations from all alerts
 */
export function getAllFieldMigrations(): FieldMigration[] {
    return REFACTOR_ALERTS.flatMap(a => a.migrations ?? []);
}

/**
 * Check if a specific alert has any pending migrations in the user's template
 */
function alertHasPendingMigrations(alert: RefactorAlert, template: string): boolean {
    if (!alert.migrations?.length) return false;
    return alert.migrations.some(m => template.includes(`${m.oldKey}:`));
}

/**
 * Check for remapper conflicts - user has a mapping TO the old key
 */
function hasRemapperConflict(
    migration: FieldMigration,
    remappings: Record<string, string>
): boolean {
    return Object.values(remappings).includes(migration.oldKey);
}

/**
 * Check if the advanced template contains legacy base fields that should be removed.
 * Returns the list of base fields found in the template.
 */
export function getLegacyBaseFieldsInAdvanced(advancedTemplate: string): string[] {
    const found: string[] = [];
    for (const field of BASE_TEMPLATE_FIELDS) {
        // Match field at start of line followed by colon
        const regex = new RegExp(`^${field}:`, 'm');
        if (regex.test(advancedTemplate)) {
            found.push(field);
        }
    }
    return found;
}

/**
 * Check if advanced template needs cleanup (has legacy base fields)
 */
export function advancedTemplateNeedsCleanup(advancedTemplate: string): boolean {
    return getLegacyBaseFieldsInAdvanced(advancedTemplate).length > 0;
}

/**
 * Remove legacy base fields from an advanced template.
 * This handles the migration from "complete" advanced templates to "extra fields only".
 */
export function cleanupAdvancedTemplate(advancedTemplate: string): string {
    const lines = advancedTemplate.split('\n');
    const result: string[] = [];
    let skipUntilNextField = false;
    
    for (const line of lines) {
        // Check if this line starts a field
        const fieldMatch = line.match(/^([A-Za-z][A-Za-z0-9 _'-]*):/);
        
        if (fieldMatch) {
            const fieldName = fieldMatch[1].trim();
            if (BASE_TEMPLATE_FIELDS.includes(fieldName)) {
                // Skip this base field and any continuation lines
                skipUntilNextField = true;
                continue;
            } else {
                // This is an advanced-only field, keep it
                skipUntilNextField = false;
                result.push(line);
            }
        } else if (skipUntilNextField) {
            // Skip continuation lines (indented list items, placeholders)
            continue;
        } else if (line.trim()) {
            // Keep non-empty lines that aren't being skipped
            result.push(line);
        }
    }
    
    return result.join('\n').trim();
}

/**
 * Get active refactor alerts that need user attention
 * Filters out dismissed alerts and alerts with no pending migrations (for migration alerts)
 * Info alerts without migrations are shown until dismissed
 */
export function getActiveRefactorAlerts(settings: RadialTimelineSettings): RefactorAlert[] {
    const dismissed = settings.dismissedAlerts ?? [];
    const remappings = settings.frontmatterMappings ?? {};
    const template = settings.sceneYamlTemplates?.advanced ?? '';

    return REFACTOR_ALERTS.filter(alert => {
        // Skip if already dismissed
        if (dismissed.includes(alert.id)) return false;

        // For alerts with migrations, skip if no pending migrations in template
        if (alert.migrations?.length) {
            if (!alertHasPendingMigrations(alert, template)) return false;

            // Check for remapper conflicts (log warning but still show alert)
            for (const migration of alert.migrations) {
                if (hasRemapperConflict(migration, remappings)) {
                    console.warn(
                        `[RefactorAlerts] Remapper conflict detected: user has mapping to "${migration.oldKey}". ` +
                        `Consider updating the remapper after migrating.`
                    );
                }
            }
        }
        // Info alerts without migrations are always shown until dismissed

        return true;
    });
}

/**
 * Get active field migrations for the Advanced YAML Editor
 */
export function getActiveMigrations(settings: RadialTimelineSettings): FieldMigration[] {
    const dismissed = settings.dismissedAlerts ?? [];
    return getAllFieldMigrations().filter(m => !dismissed.includes(m.alertId));
}

/**
 * Check if any active alerts exist (for Version Indicator)
 */
export function hasActiveAlerts(settings: RadialTimelineSettings): boolean {
    return getActiveRefactorAlerts(settings).length > 0;
}

/**
 * Get all notifications for history view (including dismissed ones)
 * Returns alerts sorted by severity (critical first, then warning, then info)
 */
export function getAllNotificationsForHistory(settings: RadialTimelineSettings): RefactorAlert[] {
    const dismissed = settings.dismissedAlerts ?? [];
    const template = settings.sceneYamlTemplates?.advanced ?? '';

    // Filter alerts that have been dismissed OR have no pending migrations
    // (i.e., they've been processed or were non-migration notices)
    return REFACTOR_ALERTS.filter(alert => {
        // For alerts with migrations, only show in history if dismissed or migrations complete
        if (alert.migrations?.length) {
            return dismissed.includes(alert.id) || !alertHasPendingMigrations(alert, template);
        }
        // For info notices without migrations, show in history if dismissed
        return dismissed.includes(alert.id);
    }).sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
    });
}

/**
 * Check if an alert has been dismissed/viewed
 */
export function isAlertDismissed(alertId: string, settings: RadialTimelineSettings): boolean {
    return (settings.dismissedAlerts ?? []).includes(alertId);
}

/**
 * Perform all migrations for a specific alert in the template
 * Returns the updated template string
 */
export function applyAlertMigrations(alert: RefactorAlert, template: string): string {
    let updated = template;
    for (const migration of alert.migrations ?? []) {
        // Replace key name (preserving any trailing content like comments)
        const regex = new RegExp(`^(${migration.oldKey}:)`, 'gm');
        updated = updated.replace(regex, `${migration.newKey}:`);
    }
    return updated;
}

/**
 * Check if all migrations for an alert are complete
 */
export function areAlertMigrationsComplete(alert: RefactorAlert, template: string): boolean {
    if (!alert.migrations?.length) return true;
    return !alert.migrations.some(m => template.includes(`${m.oldKey}:`));
}

/**
 * Maximum number of notifications to keep in history
 */
const MAX_HISTORY_SIZE = 10;

/**
 * Dismiss an alert and auto-purge old alerts if history exceeds MAX_HISTORY_SIZE.
 * Older alerts (at the start of the array) are removed first.
 */
export function dismissAlert(alertId: string, settings: RadialTimelineSettings): void {
    if (!settings.dismissedAlerts) {
        settings.dismissedAlerts = [];
    }
    
    // Don't add duplicates
    if (settings.dismissedAlerts.includes(alertId)) {
        return;
    }
    
    settings.dismissedAlerts.push(alertId);
    
    // Auto-purge oldest if over limit
    while (settings.dismissedAlerts.length > MAX_HISTORY_SIZE) {
        settings.dismissedAlerts.shift(); // Remove oldest (first in array)
    }
}
