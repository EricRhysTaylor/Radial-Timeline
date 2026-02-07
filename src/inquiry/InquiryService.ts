import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { INQUIRY_VIEW_TYPE } from './constants';
import { InquiryView } from './InquiryView';

export class InquiryService {
    constructor(private app: App, private plugin: RadialTimelinePlugin) {}

    getInquiryViews(): InquiryView[] {
        return this.app.workspace
            .getLeavesOfType(INQUIRY_VIEW_TYPE)
            .map(leaf => leaf.view as unknown)
            .filter((view): view is InquiryView => view instanceof InquiryView);
    }

    async activateView(): Promise<void> {
        if (!(this.plugin.settings.enableAiSceneAnalysis ?? true)) {
            new Notice('Inquiry requires AI features to be enabled. Turn on "Enable AI LLM features" in settings.');
            return;
        }

        const leaves = this.app.workspace.getLeavesOfType(INQUIRY_VIEW_TYPE);
        if (leaves.length > 0) {
            this.app.workspace.revealLeaf(leaves[0]);
            return;
        }

        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: INQUIRY_VIEW_TYPE,
            active: true
        });
        this.app.workspace.revealLeaf(leaf);
    }

    async runOmnibusPass(): Promise<void> {
        if (!(this.plugin.settings.enableAiSceneAnalysis ?? true)) {
            new Notice('Inquiry requires AI features to be enabled. Turn on "Enable AI LLM features" in settings.');
            return;
        }
        await this.activateView();
        const view = this.getInquiryViews()[0];
        if (!view) {
            new Notice('Unable to open Inquiry view for omnibus pass.');
            return;
        }
        await view.runOmnibusPass();
    }
}
