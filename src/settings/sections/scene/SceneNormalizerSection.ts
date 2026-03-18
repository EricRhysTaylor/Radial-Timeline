import { App, ButtonComponent, Modal, Notice, TFile, normalizePath, setIcon, setTooltip, Setting as Settings } from 'obsidian';
import { ERT_CLASSES } from '../../../ui/classes';
import type RadialTimelinePlugin from '../../../main';
import { DEFAULT_SETTINGS } from '../../defaults';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../../wikiLink';
import { collectFilesForAuditWithScope, formatAuditReport, type NoteAuditEntry, type YamlAuditResult } from '../../../utils/yamlAudit';
import {
    previewDeleteFields,
    previewReorder,
    type DeleteResult,
    type ReorderResult,
} from '../../../utils/yamlManager';
import { buildScenePropertyDefinitions } from '../../../sceneProperties/scenePropertyAdapter';
import {
    analyzeScenes,
    deleteAdvancedSceneFields,
    deleteExtraSceneFields,
    ensureSceneIds,
    fixDuplicateSceneIds,
    insertMissingAdvancedFields,
    insertMissingCoreFields,
    reorderSceneFields,
} from '../../../sceneProperties/sceneNormalizer';
import type { SceneNormalizationAudit } from '../../../sceneProperties/types';
import { resolveSceneExpectedKeys, resolveScenePropertyPolicy } from '../../../sceneProperties/scenePropertyPolicy';
import { RESERVED_OBSIDIAN_KEYS } from '../../../utils/yamlTemplateNormalize';
import { formatSafetyIssues } from '../../../utils/yamlSafety';
import { openOrRevealFile } from '../../../utils/fileUtils';
import { getAdvancedMode, shouldEnableRemoveAdvanced } from '../../../scenes/core/scenePropertyState';

type DeletePreviewDetail = { fields: string[]; values: Record<string, unknown> };

function createBadge(container: HTMLElement, text: string): HTMLElement {
    const badge = container.createSpan({
        cls: ['ert-badgePill', 'ert-badgePill--sm', 'ert-badgePill--neutral']
    });
    badge.createSpan({ cls: 'ert-badgePill__text', text });
    return badge;
}

function setButtonDisabled(button: ButtonComponent | undefined, disabled: boolean, reason?: string): void {
    if (!button) return;
    button.setDisabled(disabled);
    if (reason) {
        setTooltip(button.buttonEl, reason);
    }
}

function setIconButtonDisabled(button: HTMLButtonElement | undefined, disabled: boolean, reason?: string): void {
    if (!button) return;
    button.disabled = disabled;
    if (reason) {
        setTooltip(button, reason);
    }
}

function toDisplayAuditResult(sceneAudit: SceneNormalizationAudit): YamlAuditResult {
    const notes: NoteAuditEntry[] = sceneAudit.notes.map((note) => ({
        file: note.file,
        missingFields: [...note.missingCoreKeys, ...note.missingAdvancedKeys],
        missingReferenceId: note.missingSceneId,
        duplicateReferenceId: note.duplicateSceneId,
        extraKeys: note.extraKeys,
        orderDrift: note.orderDrift,
        semanticWarnings: note.semanticWarnings,
        reason: note.reason,
        safetyResult: note.safetyResult,
    }));

    return {
        notes,
        unreadFiles: sceneAudit.unreadFiles,
        summary: {
            totalNotes: sceneAudit.summary.totalScenes,
            unreadNotes: sceneAudit.summary.unreadScenes,
            notesWithMissing: notes.filter((note) => note.missingFields.length > 0).length,
            notesMissingIds: sceneAudit.summary.scenesMissingIds,
            notesDuplicateIds: sceneAudit.summary.scenesDuplicateIds,
            notesWithExtra: sceneAudit.summary.scenesWithExtra,
            notesWithDrift: sceneAudit.summary.scenesWithDrift,
            notesWithWarnings: sceneAudit.summary.scenesWithWarnings,
            clean: sceneAudit.summary.clean,
            notesUnsafe: sceneAudit.summary.scenesUnsafe,
            notesSuspicious: sceneAudit.summary.scenesSuspicious,
        },
        safetyResults: sceneAudit.safetyResults,
    };
}

function isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

async function ensureVaultFolder(app: App, folderPath: string): Promise<string> {
    const normalized = normalizePath(folderPath.trim());
    if (!normalized) return '';
    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(current)) {
            try {
                await app.vault.createFolder(current);
            } catch {
                // Folder may already exist.
            }
        }
    }
    return normalized;
}

async function writeDeletionSnapshot(app: App, plugin: RadialTimelinePlugin, params: {
    operation: 'delete_extra' | 'delete_advanced';
    preview: Map<TFile, DeletePreviewDetail>;
    scopeSummary: string;
}): Promise<string | null> {
    const entries: Array<{
        path: string;
        basename: string;
        fields: Array<{ key: string; value: unknown }>;
    }> = [];

    for (const [file, detail] of params.preview.entries()) {
        const fields = detail.fields
            .filter((field) => !isEmptyValue(detail.values[field]))
            .map((field) => ({ key: field, value: detail.values[field] }));
        if (fields.length === 0) continue;
        entries.push({
            path: file.path,
            basename: file.basename,
            fields,
        });
    }

    if (entries.length === 0) return null;

    const baseFolder = normalizePath((plugin.settings.aiOutputFolder || DEFAULT_SETTINGS.aiOutputFolder || 'Radial Timeline/Logs').trim() || 'Radial Timeline/Logs');
    const snapshotFolder = await ensureVaultFolder(app, `${baseFolder}/YAML Safety/Deletion Snapshots`);
    if (!snapshotFolder) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-scene-${params.operation}.json`;
    const snapshotPath = normalizePath(`${snapshotFolder}/${filename}`);
    const payload = {
        version: 1,
        createdAt: new Date().toISOString(),
        noteType: 'Scene',
        operation: params.operation,
        scopeSummary: params.scopeSummary,
        filesWithValuedDeletes: entries.length,
        valuedFieldDeletes: entries.reduce((sum, entry) => sum + entry.fields.length, 0),
        entries,
    };

    await app.vault.create(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`);
    return snapshotPath;
}

export function renderSceneNormalizerSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    parentEl: HTMLElement;
}): void {
    const { app, plugin, parentEl } = params;

    let sceneAudit: SceneNormalizationAudit | null = null;
    let auditResult: YamlAuditResult | null = null;
    let auditScopeSummary = '';
    let hasCheckedScenes = false;
    let checkedSceneFiles: TFile[] = [];
    const buildMaintenanceDescription = (): string => {
        return 'Check scene notes for missing core properties, IDs, layout order, and optional advanced properties.';
    };
    const buildPolicyExplanation = (): { lead: string; detail: string } => {
        const advancedEnabled = getAdvancedMode(plugin.settings) === 'enabled';
        return advancedEnabled
            ? {
                lead: 'Core and Advanced properties are currently maintained in scene notes.',
                detail: 'Missing advanced fields will be reported and can be added automatically.'
            }
            : {
                lead: 'Core properties are currently maintained in scene notes.',
                detail: 'Advanced properties remain optional and can be removed with “Remove advanced properties”.'
            };
    };
    const buildPolicyBadge = (): string => (
        getAdvancedMode(plugin.settings) === 'enabled' ? 'Core + advanced' : 'Core only'
    );
    const buildUnusedFieldsTooltip = (): string => (
        (getAdvancedMode(plugin.settings) === 'enabled')
            ? 'Remove fields not defined in the current scene property rules.'
            : 'Remove unused non-advanced fields. Advanced fields are preserved.'
    );

    const headerRow = new Settings(parentEl)
        .setName('Scene note maintenance');
    headerRow.settingEl.addClass('ert-scene-properties-row', 'ert-scene-maintenance-row');
    addHeadingIcon(headerRow, 'shield-check');
    addWikiLink(headerRow, 'Settings#yaml-templates');
    applyErtHeaderLayout(headerRow);
    const maintenanceDescriptionEl = headerRow.descEl.createDiv({ cls: 'ert-scene-maintenance-desc' });
    const policyBadgeEl = createBadge(headerRow.controlEl, buildPolicyBadge());
    const panel = parentEl.createDiv({ cls: ['ert-panel', 'ert-stack', 'ert-scene-maintenance-panel', 'ert-settings-hidden'] });
    const policyBlock = panel.createDiv({ cls: ['ert-panel', 'ert-scene-maintenance-policy-block'] });
    const policyLeadEl = policyBlock.createDiv({ cls: 'ert-scene-maintenance-policy-lead' });
    const policyDetailEl = policyBlock.createDiv({ cls: 'ert-scene-maintenance-policy-detail' });
    const maintenanceSection = panel.createDiv({ cls: ['ert-stack', 'ert-scene-maintenance-section'] });
    maintenanceSection.createDiv({ cls: 'ert-scene-maintenance-group-label', text: 'Maintenance' });
    const maintenanceGroup = maintenanceSection.createDiv({ cls: ['ert-inline-actions', 'ert-scene-maintenance-actions'] });
    const maintenanceHelperEl = maintenanceSection.createDiv({ cls: 'ert-scene-maintenance-helper' });
    const cleanupSection = panel.createDiv({ cls: ['ert-stack', 'ert-scene-maintenance-section', 'ert-scene-maintenance-section--cleanup'] });
    cleanupSection.createDiv({ cls: 'ert-scene-maintenance-group-label', text: 'Cleanup' });
    const cleanupGroup = cleanupSection.createDiv({ cls: ['ert-inline-actions', 'ert-inline-actions--end', 'ert-scene-maintenance-actions', 'ert-scene-maintenance-actions--cleanup'] });
    const cleanupHelperEl = cleanupSection.createDiv({ cls: 'ert-scene-maintenance-helper' });
    const resultsSection = panel.createDiv({ cls: ['ert-stack', 'ert-scene-maintenance-section', 'ert-scene-maintenance-section--results', 'ert-settings-hidden'] });
    resultsSection.createDiv({ cls: 'ert-scene-maintenance-group-label', text: 'Scene status' });
    const resultsEl = resultsSection.createDiv({ cls: 'ert-audit-results-row' });
    const refreshResultsVisibility = () => {
        resultsSection.toggleClass('ert-settings-hidden', resultsEl.childElementCount === 0);
    };
    const refreshMaintenanceCopy = () => {
        maintenanceDescriptionEl.setText(buildMaintenanceDescription());
        const policy = buildPolicyExplanation();
        policyLeadEl.setText(policy.lead);
        policyDetailEl.setText(policy.detail);
        policyBadgeEl.querySelector('.ert-badgePill__text')?.replaceChildren(document.createTextNode(buildPolicyBadge()));
        setTooltip(policyBadgeEl, `${policy.lead} ${policy.detail}`);
        if (removeUnusedBtn) {
            setTooltip(removeUnusedBtn.buttonEl, buildUnusedFieldsTooltip());
        }
        updateButtons();
        if (auditResult && sceneAudit) renderResults();
    };
    parentEl.addEventListener('ert:scene-advanced-maintenance-changed', refreshMaintenanceCopy as EventListener);

    let checkBtn: ButtonComponent | undefined;
    checkBtn = new ButtonComponent(headerRow.controlEl)
        .setButtonText('Check Scenes')
        .setCta()
        .onClick(() => void runCheckScenes());
    checkBtn.setIcon('shield-check');

    let copyBtn: HTMLButtonElement | undefined;
    let addCoreBtn: ButtonComponent | undefined;
    let addAdvancedBtn: ButtonComponent | undefined;
    let addIdsBtn: ButtonComponent | undefined;
    let reorderBtn: ButtonComponent | undefined;
    let removeUnusedBtn: ButtonComponent | undefined;
    let removeAdvancedBtn: ButtonComponent | undefined;
    let fixDuplicateBtn: ButtonComponent | undefined;

    const updateButtons = () => {
        const summary = sceneAudit?.summary;
        const advancedMode = getAdvancedMode(plugin.settings);
        const advancedEnabled = advancedMode === 'enabled';
        const removableAdvanced = shouldEnableRemoveAdvanced({
            settings: plugin.settings,
            scenes: checkedSceneFiles
                .map((file) => app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined)
                .filter((frontmatter): frontmatter is Record<string, unknown> => !!frontmatter),
        });

        const disabledReasonBase = hasCheckedScenes
            ? undefined
            : 'Check Scenes to review what needs maintenance.';

        setIconButtonDisabled(copyBtn, !sceneAudit, sceneAudit ? undefined : 'Check Scenes to generate a status report.');
        setButtonDisabled(addCoreBtn, !summary || summary.scenesWithMissingCore === 0, disabledReasonBase || 'All scenes already contain core properties.');
        setButtonDisabled(
            addAdvancedBtn,
            !advancedEnabled || !summary || summary.scenesWithMissingAdvanced === 0,
            !advancedEnabled
                ? 'Advanced properties are disabled.'
                : (disabledReasonBase || 'All maintained advanced properties are already present.')
        );
        setButtonDisabled(addIdsBtn, !summary || summary.scenesMissingIds === 0, disabledReasonBase || 'All scenes already have IDs.');
        setButtonDisabled(reorderBtn, !summary || summary.scenesWithDrift === 0, disabledReasonBase || 'Scene property order already matches the current layout.');
        setButtonDisabled(removeUnusedBtn, !summary || summary.scenesWithExtra === 0, disabledReasonBase || buildUnusedFieldsTooltip());
        setButtonDisabled(
            removeAdvancedBtn,
            !removableAdvanced,
            advancedMode === 'enabled'
                ? 'Advanced properties are currently maintained, so removal is disabled.'
                : (disabledReasonBase || 'No scenes currently contain advanced properties to remove.')
        );
        setButtonDisabled(fixDuplicateBtn, !summary || summary.scenesDuplicateIds === 0, disabledReasonBase || 'No duplicate scene IDs were detected.');

        const maintenanceReasons: string[] = [];
        const cleanupReasons: string[] = [];
        if (!summary) {
            maintenanceReasons.push('Run Check Scenes to load scene status and available maintenance actions.');
            cleanupReasons.push('Cleanup actions unlock after scene status has been checked.');
        } else {
            if (summary.scenesWithMissingCore === 0) maintenanceReasons.push('All scenes already contain core properties.');
            if (!advancedEnabled) {
                maintenanceReasons.push('Advanced properties are disabled, so advanced fields are not added automatically.');
            } else if (summary.scenesWithMissingAdvanced === 0) {
                maintenanceReasons.push('No advanced properties are currently missing.');
            }
            if (summary.scenesMissingIds === 0) maintenanceReasons.push('All scenes already have IDs.');
            if (summary.scenesWithDrift === 0) maintenanceReasons.push('Scene property order already matches the current layout.');

            if (summary.scenesWithExtra === 0) cleanupReasons.push(advancedEnabled
                ? 'No unused fields were detected.'
                : 'No unused non-Advanced fields were detected. Advanced fields are preserved.');
            if (advancedMode === 'enabled') {
                cleanupReasons.push('Advanced properties are currently maintained, so removal is disabled.');
            } else if (!removableAdvanced) {
                cleanupReasons.push('No scenes currently contain removable advanced properties.');
            }
            if (summary.scenesDuplicateIds === 0) cleanupReasons.push('No duplicate scene IDs were detected.');
        }
        maintenanceHelperEl.setText(maintenanceReasons[0] ?? '');
        cleanupHelperEl.setText(cleanupReasons[0] ?? '');
        maintenanceHelperEl.toggleClass('ert-settings-hidden', maintenanceReasons.length === 0);
        cleanupHelperEl.toggleClass('ert-settings-hidden', cleanupReasons.length === 0);
    };

    const renderResults = () => {
        resultsEl.empty();
        if (!auditResult || !sceneAudit) {
            refreshResultsVisibility();
            return;
        }

        const summary = auditResult.summary;
        const advancedEnabled = getAdvancedMode(plugin.settings) === 'enabled';
        const healthLevel = (summary.notesUnsafe > 0)
            ? 'unsafe'
            : (summary.notesMissingIds > 0 || summary.notesDuplicateIds > 0)
                ? 'critical'
                : (sceneAudit.summary.scenesWithMissingCore > 0 || sceneAudit.summary.scenesWithMissingAdvanced > 0)
                    ? 'needs-attention'
                    : (summary.notesWithExtra > 0 || summary.notesWithDrift > 0 || summary.notesWithWarnings > 0 || summary.notesSuspicious > 0)
                        ? 'mixed'
                        : 'clean';
        const healthLabels: Record<string, string> = {
            clean: 'Clean',
            mixed: 'Some scenes need attention',
            'needs-attention': 'Needs attention',
            critical: 'Critical issues detected',
            unsafe: 'Unsafe notes detected',
        };
        const warningsOnly = healthLevel === 'mixed'
            && summary.notesWithWarnings > 0
            && summary.notesWithExtra === 0
            && summary.notesWithDrift === 0
            && summary.notesMissingIds === 0
            && summary.notesDuplicateIds === 0
            && sceneAudit.summary.scenesWithMissingCore === 0
            && sceneAudit.summary.scenesWithMissingAdvanced === 0
            && summary.notesSuspicious === 0
            && summary.notesUnsafe === 0;

        const headerEl = resultsEl.createDiv({ cls: 'ert-audit-result-header' });
        const statusEl = headerEl.createSpan({ cls: `ert-audit-health ert-audit-health--${healthLevel}` });
        statusEl.textContent = `Scene Status: ${warningsOnly ? 'Warnings to review' : healthLabels[healthLevel]}`;
        headerEl.createSpan({ text: ` · Scope: ${auditScopeSummary}`, cls: 'ert-audit-summary' });

        if (
            summary.clean === summary.totalNotes
            && summary.unreadNotes === 0
            && summary.notesWithWarnings === 0
            && summary.notesUnsafe === 0
            && summary.notesSuspicious === 0
            && summary.notesMissingIds === 0
            && summary.notesDuplicateIds === 0
        ) {
            resultsEl.createDiv({
                text: `All ${summary.totalNotes} scenes match the current scene property rules.`,
                cls: 'ert-audit-clean'
            });
            return;
        }

        const chips = [
            { label: 'Missing IDs', kind: 'critical', entries: auditResult.notes.filter((note) => note.missingReferenceId) },
            { label: 'Duplicate IDs', kind: 'duplicate', entries: auditResult.notes.filter((note) => !!note.duplicateReferenceId) },
            { label: 'Unsafe', kind: 'unsafe', entries: auditResult.notes.filter((note) => note.safetyResult?.status === 'dangerous') },
            { label: 'Needs review', kind: 'suspicious', entries: auditResult.notes.filter((note) => note.safetyResult?.status === 'suspicious') },
            { label: advancedEnabled ? 'Missing properties' : 'Missing core properties', kind: 'missing', entries: auditResult.notes.filter((note) => note.missingFields.length > 0) },
            { label: advancedEnabled ? 'Unused fields' : 'Unused fields (advanced not enforced)', kind: 'extra', entries: auditResult.notes.filter((note) => note.extraKeys.length > 0) },
            { label: 'Layout cleanup', kind: 'drift', entries: auditResult.notes.filter((note) => note.orderDrift) },
            { label: 'Warnings', kind: 'warning', entries: auditResult.notes.filter((note) => note.semanticWarnings.length > 0) },
        ] satisfies Array<{
            label: string;
            kind: 'critical' | 'duplicate' | 'missing' | 'extra' | 'drift' | 'warning' | 'unsafe' | 'suspicious';
            entries: NoteAuditEntry[];
        }>;
        const visibleChips = chips.filter((chip) => chip.entries.length > 0);

        let activeKind: string | null = visibleChips[0]?.kind ?? null;
        let page = 0;
        const chipsEl = resultsEl.createDiv({ cls: 'ert-audit-chips' });
        const detailsEl = resultsEl.createDiv({ cls: 'ert-audit-details' });

        const renderChips = () => {
            chipsEl.empty();
            visibleChips.forEach((chip) => {
                const styleKind = chip.kind === 'duplicate' ? 'critical' : chip.kind;
                const chipBtn = chipsEl.createEl('button', {
                    cls: `ert-chip ert-audit-chip ert-audit-chip--${styleKind}${activeKind === chip.kind ? ' is-active' : ''}`,
                    text: `${chip.entries.length} ${chip.label.toLowerCase()}`,
                    attr: { type: 'button' }
                });
                chipBtn.addEventListener('click', () => {
                    activeKind = activeKind === chip.kind ? null : chip.kind;
                    page = 0;
                    renderChips();
                    renderNoteList();
                });
            });
            if (summary.clean > 0) {
                chipsEl.createSpan({ text: `${summary.clean} clean`, cls: 'ert-chip ert-audit-chip ert-audit-chip--clean' });
            }
        };

        const renderNoteList = () => {
            detailsEl.empty();
            if (!activeKind) return;
            const activeChip = visibleChips.find((chip) => chip.kind === activeKind);
            if (!activeChip) return;

            const total = activeChip.entries.length;
            const pageSize = 5;
            const start = page * pageSize;
            const end = Math.min(start + pageSize, total);
            const pageEntries = activeChip.entries.slice(start, end);
            const pillsEl = detailsEl.createDiv({ cls: 'ert-audit-note-pills' });

            for (const entry of pageEntries) {
                let reason = entry.reason;
                if (activeChip.kind === 'extra') {
                    reason = entry.extraKeys.join(', ');
                } else if (activeChip.kind === 'drift') {
                    reason = 'Property order differs from the current scene layout';
                } else if (activeChip.kind === 'critical') {
                    reason = 'Missing scene ID';
                } else if (activeChip.kind === 'duplicate') {
                    reason = entry.duplicateReferenceId
                        ? `Duplicate scene ID: ${entry.duplicateReferenceId}`
                        : 'Duplicate scene ID';
                }

                const pillStyleKind = activeChip.kind === 'duplicate' ? 'critical' : activeChip.kind;
                const pillEl = pillsEl.createEl('button', {
                    cls: `ert-audit-note-pill ert-audit-note-pill--${pillStyleKind}`,
                    attr: { type: 'button' }
                });
                if (entry.safetyResult?.status === 'dangerous') {
                    const badge = pillEl.createSpan({ cls: 'ert-audit-safety-badge ert-audit-safety-badge--danger' });
                    badge.setText('!');
                    setTooltip(badge, formatSafetyIssues(entry.safetyResult));
                } else if (entry.safetyResult?.status === 'suspicious') {
                    const badge = pillEl.createSpan({ cls: 'ert-audit-safety-badge ert-audit-safety-badge--warning' });
                    badge.setText('?');
                    setTooltip(badge, formatSafetyIssues(entry.safetyResult));
                }
                pillEl.createSpan({ text: entry.file.basename, cls: 'ert-audit-note-pill-name' });
                pillEl.createSpan({ text: ` — ${reason}`, cls: 'ert-audit-note-pill-reason' });
                setTooltip(pillEl, `${entry.file.basename}: ${reason}`);
                pillEl.addEventListener('click', async () => {
                    await openOrRevealFile(app, entry.file, false);
                    new Notice(reason);
                });
            }

            const navEl = detailsEl.createDiv({ cls: 'ert-audit-pagination' });
            navEl.createSpan({ cls: 'ert-audit-pagination-label', text: `${start + 1}–${end} of ${total}` });
            if (page > 0) {
                const prevBtn = navEl.createEl('button', { text: '← Prev', cls: 'ert-audit-nav-btn', attr: { type: 'button' } });
                prevBtn.addEventListener('click', () => {
                    page -= 1;
                    renderNoteList();
                });
            }
            if (end < total) {
                const nextBtn = navEl.createEl('button', { text: `Next ${Math.min(pageSize, total - end)} →`, cls: 'ert-audit-nav-btn', attr: { type: 'button' } });
                nextBtn.addEventListener('click', () => {
                    page += 1;
                    renderNoteList();
                });
            }
        };

        renderChips();
        renderNoteList();
        refreshResultsVisibility();
    };

    const runCheckScenes = async () => {
        panel.classList.remove('ert-settings-hidden');
        hasCheckedScenes = true;
        updateButtons();
        const auditScope = collectFilesForAuditWithScope(app, 'Scene', plugin.settings);
        checkedSceneFiles = auditScope.files;
        auditScopeSummary = auditScope.scopeSummary;
        if (auditScope.reason) {
            resultsEl.empty();
            resultsEl.createDiv({ text: auditScope.reason, cls: 'ert-audit-clean' });
            refreshResultsVisibility();
            sceneAudit = null;
            auditResult = null;
            checkedSceneFiles = [];
            updateButtons();
            new Notice(auditScope.reason);
            return;
        }
        if (auditScope.files.length === 0) {
            resultsEl.empty();
            resultsEl.createDiv({ text: 'No scene notes found in the active book scope.', cls: 'ert-audit-clean' });
            refreshResultsVisibility();
            sceneAudit = null;
            auditResult = null;
            checkedSceneFiles = [];
            updateButtons();
            return;
        }

        sceneAudit = await analyzeScenes({
            app,
            settings: plugin.settings,
            files: auditScope.files,
            includeSafetyScan: true,
        });
        auditResult = toDisplayAuditResult(sceneAudit);
        updateButtons();
        renderResults();
    };

    copyBtn = cleanupGroup.createEl('button', {
        cls: [ERT_CLASSES.ICON_BTN],
        attr: { type: 'button', 'aria-label': 'Copy status report to clipboard' }
    });
    setIcon(copyBtn, 'clipboard-copy');
    setTooltip(copyBtn, 'Copy status report to clipboard');
    copyBtn.addEventListener('click', () => {
        if (!auditResult) return;
        const report = formatAuditReport(auditResult, 'Scene');
        navigator.clipboard.writeText(report).then(() => new Notice('Scene status report copied to clipboard.'));
    });

    addCoreBtn = new ButtonComponent(maintenanceGroup)
        .setButtonText('Add core properties')
        .onClick(async () => {
            if (!sceneAudit) return;
            const targetFiles = sceneAudit.notes.filter((note) => note.missingCoreKeys.length > 0).map((note) => note.file);
            if (targetFiles.length === 0) return;
            const result = await insertMissingCoreFields({ app, settings: plugin.settings, files: targetFiles, audit: sceneAudit });
            new Notice(result.updated > 0 ? `Updated ${result.updated} scene${result.updated !== 1 ? 's' : ''}.` : 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });

    addAdvancedBtn = new ButtonComponent(maintenanceGroup)
        .setButtonText('Add advanced properties')
        .onClick(async () => {
            if (!sceneAudit) return;
            const targetFiles = sceneAudit.notes.filter((note) => note.missingAdvancedKeys.length > 0).map((note) => note.file);
            if (targetFiles.length === 0) return;
            const result = await insertMissingAdvancedFields({ app, settings: plugin.settings, files: targetFiles, audit: sceneAudit });
            new Notice(result.updated > 0 ? `Updated ${result.updated} scene${result.updated !== 1 ? 's' : ''}.` : 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });

    addIdsBtn = new ButtonComponent(maintenanceGroup)
        .setButtonText('Add missing IDs')
        .onClick(async () => {
            if (!sceneAudit) return;
            const result = await ensureSceneIds({
                app,
                settings: plugin.settings,
                files: sceneAudit.notes.filter((note) => note.missingSceneId).map((note) => note.file),
            });
            new Notice(result.updated > 0 ? `Updated ${result.updated} scene${result.updated !== 1 ? 's' : ''}.` : 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });

    reorderBtn = new ButtonComponent(maintenanceGroup)
        .setButtonText('Reorder properties')
        .onClick(async () => {
            if (!sceneAudit || !auditResult) return;
            const notesWithDrift = sceneAudit.notes.filter((note) => note.orderDrift && note.safetyResult?.status !== 'dangerous');
            if (notesWithDrift.length === 0) return;

            const canonicalOrder = resolveSceneExpectedKeys(
                plugin.settings,
                buildScenePropertyDefinitions(plugin.settings),
                resolveScenePropertyPolicy(plugin.settings)
            ).canonicalOrder;
            const preview = previewReorder(app, notesWithDrift[0].file, canonicalOrder);

            const confirmed = await new Promise<boolean>((resolve) => {
                const modal = new Modal(app);
                modal.titleEl.setText('');
                modal.contentEl.empty();
                modal.modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
                modal.contentEl.addClass('ert-modal-container', 'ert-stack');
                const header = modal.contentEl.createDiv({ cls: 'ert-modal-header' });
                header.createSpan({ cls: 'ert-modal-badge', text: 'SCENE MAINTENANCE' });
                header.createDiv({ cls: 'ert-modal-title', text: 'Reorder properties' });
                header.createDiv({ cls: 'ert-modal-subtitle', text: `Reorder properties in ${notesWithDrift.length} scene${notesWithDrift.length !== 1 ? 's' : ''} to match the current scene layout.` });
                const body = modal.contentEl.createDiv({ cls: ['ert-panel', 'ert-panel--glass'] });
                body.createDiv({ text: `Scope: ${auditScopeSummary}`, cls: 'ert-modal-subtitle' });
                body.createDiv({ text: 'Only property order changes. All values stay exactly the same.' });
                if (preview) {
                    body.createDiv({ text: `Preview (${notesWithDrift[0].file.basename}):`, cls: 'ert-modal-subtitle' });
                    const beforeAfter = body.createDiv({ cls: 'ert-reorder-preview' });
                    const beforeCol = beforeAfter.createDiv({ cls: 'ert-reorder-preview-col' });
                    beforeCol.createDiv({ text: 'Before:', cls: 'ert-reorder-preview-label' });
                    const beforeList = beforeCol.createEl('ol');
                    preview.before.forEach((key) => beforeList.createEl('li', { text: key }));
                    const afterCol = beforeAfter.createDiv({ cls: 'ert-reorder-preview-col' });
                    afterCol.createDiv({ text: 'After:', cls: 'ert-reorder-preview-label' });
                    const afterList = afterCol.createEl('ol');
                    preview.after.forEach((key) => afterList.createEl('li', { text: key }));
                }
                const footer = modal.contentEl.createDiv({ cls: 'ert-modal-actions' });
                new ButtonComponent(footer).setButtonText('Reorder').setCta().onClick(() => { resolve(true); modal.close(); });
                new ButtonComponent(footer).setButtonText('Cancel').onClick(() => { resolve(false); modal.close(); });
                modal.onClose = () => resolve(false);
                modal.open();
            });
            if (!confirmed) return;

            const result: ReorderResult = await reorderSceneFields({
                app,
                settings: plugin.settings,
                files: notesWithDrift.map((note) => note.file),
                audit: sceneAudit,
            });
            new Notice(result.reordered > 0 ? `Reordered ${result.reordered} scene${result.reordered !== 1 ? 's' : ''}.` : 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });

    removeUnusedBtn = new ButtonComponent(cleanupGroup)
        .setButtonText('Remove Unused Fields')
        .setWarning()
        .onClick(async () => {
            if (!sceneAudit || !auditResult) return;
            const notesWithExtra = sceneAudit.notes.filter((note) => note.extraKeys.length > 0 && note.safetyResult?.status !== 'dangerous');
            if (notesWithExtra.length === 0) return;
            const targetFiles = notesWithExtra.map((note) => note.file);
            const fieldsToDelete = [...new Set(notesWithExtra.flatMap((note) => note.extraKeys))];
            const protectedKeys = new Set([
                ...buildScenePropertyDefinitions(plugin.settings).core.map((definition) => definition.key),
                ...buildScenePropertyDefinitions(plugin.settings).advanced.map((definition) => definition.key),
                ...RESERVED_OBSIDIAN_KEYS,
            ]);
            const preview = previewDeleteFields(app, targetFiles, fieldsToDelete, protectedKeys);
            let deletionSnapshotPath: string | null = null;
            for (const [, detail] of preview.entries()) {
                if (detail.fields.some((field) => !isEmptyValue(detail.values[field]))) {
                    deletionSnapshotPath = await writeDeletionSnapshot(app, plugin, {
                        operation: 'delete_extra',
                        preview,
                        scopeSummary: auditScopeSummary,
                    });
                    break;
                }
            }
            const result: DeleteResult = await deleteExtraSceneFields({
                app,
                settings: plugin.settings,
                files: targetFiles,
                audit: sceneAudit,
            });
            const parts = [];
            if (result.deleted > 0) parts.push(`Cleaned ${result.deleted} scene${result.deleted !== 1 ? 's' : ''}`);
            if (deletionSnapshotPath) parts.push(`Snapshot: ${deletionSnapshotPath}`);
            new Notice(parts.join(', ') || 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });
    setTooltip(removeUnusedBtn.buttonEl, buildUnusedFieldsTooltip());

    removeAdvancedBtn = new ButtonComponent(cleanupGroup)
        .setButtonText('Remove advanced properties')
        .setWarning()
        .onClick(async () => {
            if (!sceneAudit) return;
            const targetFiles = checkedSceneFiles.filter((file) => {
                const note = sceneAudit?.notes.find((entry) => entry.file.path === file.path);
                if (note?.safetyResult?.status === 'dangerous') return false;
                const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
                return !!frontmatter && shouldEnableRemoveAdvanced({
                    settings: plugin.settings,
                    scenes: [frontmatter],
                });
            });
            if (targetFiles.length === 0) return;
            const advancedKeys = buildScenePropertyDefinitions(plugin.settings).advanced.map((definition) => definition.key);
            const protectedKeys = new Set([
                ...buildScenePropertyDefinitions(plugin.settings).core.map((definition) => definition.key),
                ...RESERVED_OBSIDIAN_KEYS,
            ]);
            const preview = previewDeleteFields(app, targetFiles, advancedKeys, protectedKeys);
            let deletionSnapshotPath: string | null = null;
            for (const [, detail] of preview.entries()) {
                if (detail.fields.some((field) => !isEmptyValue(detail.values[field]))) {
                    deletionSnapshotPath = await writeDeletionSnapshot(app, plugin, {
                        operation: 'delete_advanced',
                        preview,
                        scopeSummary: auditScopeSummary,
                    });
                    break;
                }
            }
            const result = await deleteAdvancedSceneFields({
                app,
                settings: plugin.settings,
                files: targetFiles,
                audit: sceneAudit,
            });
            const parts = [];
            if (result.deleted > 0) parts.push(`Cleaned ${result.deleted} scene${result.deleted !== 1 ? 's' : ''}`);
            if (deletionSnapshotPath) parts.push(`Snapshot: ${deletionSnapshotPath}`);
            new Notice(parts.join(', ') || 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });

    fixDuplicateBtn = new ButtonComponent(cleanupGroup)
        .setButtonText('Fix Duplicate IDs')
        .setWarning()
        .onClick(async () => {
            if (!sceneAudit) return;
            const targetFiles = [...new Set(sceneAudit.notes.filter((note) => !!note.duplicateSceneId).map((note) => note.file))];
            if (targetFiles.length === 0) return;
            const result = await fixDuplicateSceneIds({
                app,
                settings: plugin.settings,
                files: targetFiles,
            });
            new Notice(result.updated > 0 ? `Updated ${result.updated} scene${result.updated !== 1 ? 's' : ''}.` : 'No changes made.');
            setTimeout(() => { void runCheckScenes(); }, 750);
        });

    refreshMaintenanceCopy();
    refreshResultsVisibility();
}
