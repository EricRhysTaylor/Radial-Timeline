import { Menu, Notice, TFile, type App } from 'obsidian';
import { normalizeStatus } from '../../utils/text';
import { applySceneInsertionPlan, planSceneInsertion } from '../../services/SceneInsertService';
import { resolveSelectedBeatModelFromSettings } from '../../utils/beatSystemState';
import { openOrRevealFile } from '../../utils/fileUtils';
import type { RadialTimelineSettings, TimelineItem } from '../../types';
import { AddSceneConfirmModal } from '../../modals/AddSceneConfirmModal';

type SceneContextMenuView = {
    plugin: {
        app: App;
        settings: RadialTimelineSettings;
        getSceneData?: () => Promise<TimelineItem[]>;
        refreshTimelineIfNeeded?: (file: TFile | null, delayMs?: number) => void;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    refreshTimeline?: () => void;
};

type TimelineStatusOption = {
    label: string;
    value: 'Todo' | 'Working' | 'Complete';
    normalized: 'Todo' | 'Working' | 'Completed';
    icon: string;
};

type PublishStageOption = {
    label: string;
    value: 'Zero' | 'Author' | 'House' | 'Press';
    icon: string;
};

const SCENE_CONTEXT_SELECTOR = '.rt-scene-group[data-item-type="Scene"], .rt-scene-group[data-item-type="Backdrop"]';

const STATUS_OPTIONS: TimelineStatusOption[] = [
    { label: 'Todo', value: 'Todo', normalized: 'Todo', icon: 'circle' },
    { label: 'Working', value: 'Working', normalized: 'Working', icon: 'loader' },
    { label: 'Complete', value: 'Complete', normalized: 'Completed', icon: 'check-circle-2' },
];

const PUBLISH_STAGE_OPTIONS: PublishStageOption[] = [
    { label: 'Zero', value: 'Zero', icon: 'circle-dashed' },
    { label: 'Author', value: 'Author', icon: 'pen-line' },
    { label: 'House', value: 'House', icon: 'home' },
    { label: 'Press', value: 'Press', icon: 'newspaper' },
];

function getLocalDateString(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeScalar(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.length > 0 ? normalizeScalar(value[0]) : '';
    return String(value).trim();
}

function getEncodedScenePath(group: Element): string | null {
    const encodedPath = group.getAttribute('data-path');
    if (!encodedPath) return null;
    try {
        return decodeURIComponent(encodedPath);
    } catch {
        return encodedPath;
    }
}

function getSceneFile(view: SceneContextMenuView, group: Element): TFile | null {
    const filePath = getEncodedScenePath(group);
    if (!filePath) return null;

    const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
    return file instanceof TFile ? file : null;
}

function refreshTimelineView(view: SceneContextMenuView, file: TFile): void {
    if (typeof view.plugin.refreshTimelineIfNeeded === 'function') {
        view.plugin.refreshTimelineIfNeeded(file, 100);
        return;
    }
    if (typeof view.refreshTimeline === 'function') {
        view.refreshTimeline();
    }
}

async function updateSceneFrontmatter(
    view: SceneContextMenuView,
    file: TFile,
    update: (frontmatter: Record<string, unknown>) => void,
    successMessage: string
): Promise<void> {
    try {
        await view.plugin.app.fileManager.processFrontMatter(file, update);
        refreshTimelineView(view, file);
        new Notice(successMessage);
    } catch (error) {
        console.error('[SceneContextMenu] Failed to update scene frontmatter:', error);
        new Notice(`Could not update ${file.basename}. Review the note frontmatter and try again.`, 7000);
    }
}

function menuTitle(label: string, active: boolean): string {
    return active ? `${label}  ✓` : label;
}

function resolvePrimarySubplotFromGroup(group: Element): string | undefined {
    const subplotIndex = group.getAttribute('data-subplot-index');
    const svg = group instanceof SVGElement ? group.ownerSVGElement : null;
    if (!svg || subplotIndex === null) return undefined;
    const label = svg.querySelector(`.rt-subplot-ring-label-text[data-subplot-index="${subplotIndex}"]`);
    return label?.getAttribute('data-subplot-name') ?? undefined;
}

async function addSceneAfterAnchor(view: SceneContextMenuView, group: Element, file: TFile): Promise<void> {
    if (typeof view.plugin.getSceneData !== 'function') {
        new Notice('Could not add scene because timeline scene data is unavailable.', 5000);
        return;
    }

    try {
        const plan = await planSceneInsertion({
            app: view.plugin.app,
            settings: view.plugin.settings,
            anchorFile: file,
            primarySubplot: resolvePrimarySubplotFromGroup(group),
            getSceneData: view.plugin.getSceneData.bind(view.plugin),
            beatModel: resolveSelectedBeatModelFromSettings(view.plugin.settings)
        });
        const confirmed = await new AddSceneConfirmModal(view.plugin.app, plan).waitForConfirm();
        if (!confirmed) return;
        const result = await applySceneInsertionPlan(view.plugin.app, plan);
        const finalFile = view.plugin.app.vault.getAbstractFileByPath(result.finalPath);
        if (finalFile instanceof TFile) {
            refreshTimelineView(view, finalFile);
            await openOrRevealFile(view.plugin.app as any, finalFile, false);
        } else {
            refreshTimelineView(view, file);
        }
        const rippleText = result.usedRippleRename ? ` Ripple renamed ${result.renameCount} file(s).` : '';
        new Notice(`Added scene after ${file.basename}.${rippleText}`, 3500);
    } catch (error) {
        console.error('[SceneContextMenu] Failed to add scene:', error);
        new Notice(`Could not add a scene after ${file.basename}. Review the console for details.`, 7000);
    }
}

function showSceneContextMenu(view: SceneContextMenuView, group: Element, event: MouseEvent): void {
    const file = getSceneFile(view, group);
    if (!file) {
        new Notice('Could not find the scene note for this timeline segment.', 5000);
        return;
    }

    const cache = view.plugin.app.metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
    const currentStatus = normalizeStatus(frontmatter.Status);
    const currentStage = normalizeScalar(frontmatter['Publish Stage']) || 'Zero';
    const pulseFlag = normalizeScalar(frontmatter['Pulse Update']);
    const pulseAlreadyFlagged = /^(yes|true|1)$/i.test(pulseFlag);

    const menu = new Menu();
    const itemType = group.getAttribute('data-item-type');

    if (itemType === 'Scene') {
        menu.addItem(item => {
            item.setIcon('file-plus-2');
            item.setTitle('Add scene');
            item.onClick(() => {
                void addSceneAfterAnchor(view, group, file);
            });
        });
        menu.addSeparator();
    }

    STATUS_OPTIONS.forEach(option => {
        menu.addItem(item => {
            item.setIcon(option.icon);
            item.setTitle(menuTitle(option.label, currentStatus === option.normalized));
            item.onClick(() => {
                void updateSceneFrontmatter(
                    view,
                    file,
                    (fm) => {
                        fm.Status = option.value;
                        if (option.value === 'Complete') {
                            fm.Due = getLocalDateString();
                        }
                    },
                    option.value === 'Complete'
                        ? `Marked ${file.basename} complete and set Due to today.`
                        : `Set ${file.basename} status to ${option.label}.`
                );
            });
        });
    });

    menu.addSeparator();

    PUBLISH_STAGE_OPTIONS.forEach(option => {
        menu.addItem(item => {
            item.setIcon(option.icon);
            item.setTitle(menuTitle(option.label, currentStage.toLowerCase() === option.value.toLowerCase()));
            item.onClick(() => {
                void updateSceneFrontmatter(
                    view,
                    file,
                    (fm) => {
                        fm['Publish Stage'] = option.value;
                    },
                    `Set ${file.basename} publish stage to ${option.label}.`
                );
            });
        });
    });

    menu.addSeparator();

    menu.addItem(item => {
        item.setIcon('sparkles');
        item.setTitle(menuTitle('Flag Triplet Pulse', pulseAlreadyFlagged));
        item.onClick(() => {
            void updateSceneFrontmatter(
                view,
                file,
                (fm) => {
                    fm['Pulse Update'] = 'Yes';
                },
                `Flagged ${file.basename} for triplet pulse.`
            );
        });
    });

    menu.showAtMouseEvent(event);
}

export function setupSceneContextMenu(view: SceneContextMenuView, svg: SVGSVGElement): void {
    view.registerDomEvent(svg as unknown as HTMLElement, 'contextmenu', (event: Event) => {
        const mouseEvent = event as MouseEvent;
        const group = (mouseEvent.target as Element | null)?.closest(SCENE_CONTEXT_SELECTOR);
        if (!group) return;

        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
        showSceneContextMenu(view, group, mouseEvent);
    });
}
