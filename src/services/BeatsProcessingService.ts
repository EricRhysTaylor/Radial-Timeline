import type RadialTimelinePlugin from '../main';
import { SceneAnalysisProcessingModal } from '../modals/SceneAnalysisProcessingModal';
import { Notice, App, ButtonComponent, DropdownComponent, Modal } from 'obsidian';

export class BeatsProcessingService {
    constructor(private plugin: RadialTimelinePlugin) {}

    setActiveModal(modal: SceneAnalysisProcessingModal | null): void {
        (this.plugin as any).activeBeatsModal = modal;
    }

    showStatus(current: number, total: number): void {
        this.plugin.showBeatsStatusBar(current, total);
    }

    hideStatus(): void {
        this.plugin.hideBeatsStatusBar();
    }
}
