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

// Edit alert wording here (title/description). Settings notifications read from this list.
// Severity: info (blue), warning (orange), critical (red).
export const REFACTOR_ALERTS: RefactorAlert[] = [
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
        description: 'The "Subplot Mode" button has been renamed to "Publication" mode. Same great features, clearer name reflecting its use for publication-focused workflows.',
    },
    {
        id: 'change-type-pulse-update',
        severity: 'info',
        icon: 'info',
        title: 'YAML Type Change: Pending Edits & New Synopsis Update',
        description: '"Pending Edits" is no longer a boolean. It is now a string so it can act as both a yes/no flag and record the last AI API hit (timestamp and AI used). A new YAML field "Synopsis Update" works identically: string value with timestamp and AI used.',
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
