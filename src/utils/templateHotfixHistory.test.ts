import { describe, expect, it } from 'vitest';
import { TFile, TFolder, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { HotfixHistoryEntry, RadialTimelineSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import {
    HOTFIX_ID_LEGACY_SIGNATURE_SPACING,
    HOTFIX_ID_SCENE_OPENER_MACRO,
    HOTFIX_ID_SYMMETRIC_MARGINS,
    acknowledgeHotfixHistory,
    ensureBundledLayoutInstalledForExport,
    getBundledPandocLayouts,
    recordHotfixEvent,
} from './pandocBundledLayouts';
import {
    TEMPLATE_HOTFIX_ALERT_ID,
    getActiveRefactorAlerts,
    getTemplateHotfixAlert,
} from '../settings/refactorAlerts';

function createPluginForLayout(layoutId: string): {
    plugin: RadialTimelinePlugin;
    layout: ReturnType<typeof getBundledPandocLayouts>[number];
    saveSettingsCalls: { count: number };
} {
    const layout = getBundledPandocLayouts().find(item => item.id === layoutId);
    if (!layout) throw new Error(`Missing bundled layout: ${layoutId}`);

    const files = new Map<string, { file: TFile; content: string }>();
    const folders = new Set<string>();

    const vault = {
        getAbstractFileByPath: (input: string) => {
            const key = normalizePath(input);
            const entry = files.get(key);
            if (entry) return entry.file;
            if (folders.has(key)) return new TFolder(key);
            return null;
        },
        createFolder: async (input: string) => {
            const key = normalizePath(input);
            folders.add(key);
            return new TFolder(key);
        },
        create: async (input: string, content: string) => {
            const key = normalizePath(input);
            const file = new TFile(key);
            files.set(key, { file, content });
            return file;
        },
        read: async (file: TFile) => {
            const key = normalizePath(file.path);
            return files.get(key)?.content || '';
        },
        modify: async (file: TFile, content: string) => {
            const key = normalizePath(file.path);
            const existing = files.get(key);
            if (existing) {
                existing.content = content;
            } else {
                files.set(key, { file, content });
            }
        }
    } as unknown as RadialTimelinePlugin['app']['vault'];

    const settings: RadialTimelineSettings = {
        ...DEFAULT_SETTINGS,
        pandocFolder: 'Radial Timeline/Pandoc',
        pandocLayouts: [layout],
        templateHotfixHistory: [],
    };

    const saveSettingsCalls = { count: 0 };
    const plugin = {
        settings,
        app: { vault },
        saveSettings: async () => { saveSettingsCalls.count += 1; },
    } as unknown as RadialTimelinePlugin;

    return { plugin, layout, saveSettingsCalls };
}

describe('recordHotfixEvent', () => {
    it('appends a new entry when (layoutId, hotfixId) is missing', () => {
        const next = recordHotfixEvent([], 'bundled-fiction-signature-literary', HOTFIX_ID_LEGACY_SIGNATURE_SPACING, 100);
        expect(next).toHaveLength(1);
        expect(next[0]).toEqual({
            layoutId: 'bundled-fiction-signature-literary',
            hotfixId: HOTFIX_ID_LEGACY_SIGNATURE_SPACING,
            appliedAt: 100,
            acknowledged: false,
        });
    });

    it('dedupes by (layoutId, hotfixId): same pair recorded twice yields one entry', () => {
        let history: HotfixHistoryEntry[] = [];
        history = recordHotfixEvent(history, 'bundled-fiction-classic-manuscript', HOTFIX_ID_SCENE_OPENER_MACRO, 100);
        history = recordHotfixEvent(history, 'bundled-fiction-classic-manuscript', HOTFIX_ID_SCENE_OPENER_MACRO, 200);
        expect(history).toHaveLength(1);
        expect(history[0].appliedAt).toBe(100);
    });

    it('treats different layoutIds with the same hotfixId as distinct entries', () => {
        let history: HotfixHistoryEntry[] = [];
        history = recordHotfixEvent(history, 'bundled-fiction-signature-literary', HOTFIX_ID_SYMMETRIC_MARGINS, 100);
        history = recordHotfixEvent(history, 'bundled-fiction-modern-classic', HOTFIX_ID_SYMMETRIC_MARGINS, 110);
        expect(history).toHaveLength(2);
    });

    it('does not flip an acknowledged entry back to unacknowledged when re-recorded', () => {
        let history: HotfixHistoryEntry[] = [
            { layoutId: 'bundled-fiction-signature-literary', hotfixId: HOTFIX_ID_LEGACY_SIGNATURE_SPACING, appliedAt: 1, acknowledged: true },
        ];
        history = recordHotfixEvent(history, 'bundled-fiction-signature-literary', HOTFIX_ID_LEGACY_SIGNATURE_SPACING, 200);
        expect(history).toHaveLength(1);
        expect(history[0].acknowledged).toBe(true);
    });
});

describe('acknowledgeHotfixHistory', () => {
    it('marks every unacknowledged entry as acknowledged', () => {
        const history: HotfixHistoryEntry[] = [
            { layoutId: 'a', hotfixId: 'x', appliedAt: 1, acknowledged: false },
            { layoutId: 'b', hotfixId: 'y', appliedAt: 2, acknowledged: true },
            { layoutId: 'c', hotfixId: 'z', appliedAt: 3, acknowledged: false },
        ];
        const next = acknowledgeHotfixHistory(history);
        expect(next.every(entry => entry.acknowledged)).toBe(true);
        // Original is not mutated
        expect(history.filter(e => !e.acknowledged)).toHaveLength(2);
    });

    it('returns an empty array when given undefined', () => {
        expect(acknowledgeHotfixHistory(undefined)).toEqual([]);
    });
});

describe('getTemplateHotfixAlert / getActiveRefactorAlerts', () => {
    function makeSettings(history: HotfixHistoryEntry[]): RadialTimelineSettings {
        return { ...DEFAULT_SETTINGS, templateHotfixHistory: history };
    }

    it('returns null when there are no unacknowledged history entries', () => {
        expect(getTemplateHotfixAlert(makeSettings([]))).toBeNull();
        expect(getTemplateHotfixAlert(makeSettings([
            { layoutId: 'a', hotfixId: 'x', appliedAt: 1, acknowledged: true },
        ]))).toBeNull();
    });

    it('returns a synthetic info-severity alert when at least one entry is unacknowledged', () => {
        const alert = getTemplateHotfixAlert(makeSettings([
            { layoutId: 'bundled-fiction-classic-manuscript', hotfixId: HOTFIX_ID_SCENE_OPENER_MACRO, appliedAt: 1, acknowledged: false },
        ]));
        expect(alert).not.toBeNull();
        expect(alert!.id).toBe(TEMPLATE_HOTFIX_ALERT_ID);
        expect(alert!.severity).toBe('info');
        expect(alert!.title).toBe('PDF Templates Updated');
    });

    it('appends the synthetic alert to getActiveRefactorAlerts when unacknowledged entries exist', () => {
        const settings = makeSettings([
            { layoutId: 'bundled-fiction-signature-literary', hotfixId: HOTFIX_ID_LEGACY_SIGNATURE_SPACING, appliedAt: 1, acknowledged: false },
        ]);
        const active = getActiveRefactorAlerts(settings);
        const ids = active.map(a => a.id);
        expect(ids).toContain(TEMPLATE_HOTFIX_ALERT_ID);
    });

    it('does not include the synthetic alert once all entries are acknowledged', () => {
        const settings = makeSettings([
            { layoutId: 'bundled-fiction-signature-literary', hotfixId: HOTFIX_ID_LEGACY_SIGNATURE_SPACING, appliedAt: 1, acknowledged: true },
        ]);
        const active = getActiveRefactorAlerts(settings);
        expect(active.map(a => a.id)).not.toContain(TEMPLATE_HOTFIX_ALERT_ID);
    });
});

describe('ensureBundledLayoutInstalledForExport hotfix wiring', () => {
    it('appends a history entry when a normalize* hotfix runs and persists via saveSettings', async () => {
        const { plugin, layout, saveSettingsCalls } = createPluginForLayout('bundled-fiction-signature-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
            '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
        ].join('\n');
        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        await ensureBundledLayoutInstalledForExport(plugin, layout);

        const history = plugin.settings.templateHotfixHistory ?? [];
        const ids = history.map(entry => entry.hotfixId);
        expect(ids).toContain(HOTFIX_ID_LEGACY_SIGNATURE_SPACING);
        expect(history.every(entry => entry.layoutId === layout.id)).toBe(true);
        expect(history.every(entry => entry.acknowledged === false)).toBe(true);
        expect(saveSettingsCalls.count).toBeGreaterThan(0);
    });

    it('does not append a duplicate entry when the same hotfix would record twice', async () => {
        const { plugin, layout } = createPluginForLayout('bundled-fiction-signature-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
            '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
        ].join('\n');
        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        // Pre-seed the entry as acknowledged. Re-running the orchestrator must NOT
        // re-add or flip the acknowledged flag.
        plugin.settings.templateHotfixHistory = [
            { layoutId: layout.id, hotfixId: HOTFIX_ID_LEGACY_SIGNATURE_SPACING, appliedAt: 1, acknowledged: true },
        ];

        await ensureBundledLayoutInstalledForExport(plugin, layout);

        const history = plugin.settings.templateHotfixHistory ?? [];
        const matching = history.filter(entry => entry.hotfixId === HOTFIX_ID_LEGACY_SIGNATURE_SPACING && entry.layoutId === layout.id);
        expect(matching).toHaveLength(1);
        expect(matching[0].acknowledged).toBe(true);

        // Synthetic alert must not surface because the only matching entry is acknowledged.
        // (Other layout-margin hotfixes might still add NEW unacknowledged entries on this same
        // run, so we only assert about the acknowledged spacing entry above, not the alert state.)
    });

    it('does not record any history when no hotfix fires (clean install)', async () => {
        const { plugin, layout } = createPluginForLayout('bundled-fiction-signature-literary');
        // No legacy file present — install path runs but no normalize* on existing content.
        await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(plugin.settings.templateHotfixHistory ?? []).toEqual([]);
    });
});
