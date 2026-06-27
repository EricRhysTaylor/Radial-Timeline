import { App, Notice, Setting, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import {
    COMMUNITY_SHARE_FIELD_KEYS,
    normalizeCommunityShareSettings
} from '../../communityShare/communityShareSettings';
import {
    CommunityShareError,
    confirmCommunityShareActivation,
    deleteCommunityShareReport,
    disconnectCommunityShare,
    publishCommunityShareReport,
    revokeCommunityShareReport
} from '../../communityShare/communityShareClient';
import { buildCommunitySharePreview } from '../../communityShare/communitySharePreview';
import type {
    CommunityShareAudience,
    CommunityShareFieldKey,
    CommunityShareSettings,
    CommunityShareTier
} from '../../types/settings';
import { ERT_CLASSES } from '../../ui/classes';

export interface CommunityShareSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

const FIELD_COPY: Record<CommunityShareFieldKey, { label: string; desc: string; future?: boolean }> = {
    'project.title': {
        label: 'Project title',
        desc: 'The public title or alias chosen for the website project.'
    },
    'project.alias': {
        label: 'Project alias',
        desc: 'A shorter public label when you do not want to use the local book title.'
    },
    'project.description': {
        label: 'Project description',
        desc: 'The public description from the active book profile. Never manuscript text.'
    },
    'project.status': {
        label: 'Project status',
        desc: 'Drafting, revising, querying, publishing, or another author-facing stage.'
    },
    'project.genre': {
        label: 'Genre',
        desc: 'The broad genre chosen for this project.'
    },
    'project.custom_genre_label': {
        label: 'Custom genre note',
        desc: 'Optional custom text for projects that do not fit the tree.'
    },
    'activity.report_period': {
        label: 'Report period',
        desc: 'A coarse report-period label such as the last 7 days.'
    },
    'activity.writing_days': {
        label: 'Writing days',
        desc: 'Number of writing days in the report period.'
    },
    'activity.minutes_total': {
        label: 'Minutes this week',
        desc: 'Rounded active writing time only. No exact timestamps.'
    },
    'activity.words_added': {
        label: 'Words this week',
        desc: 'Aggregated writing-session words only. No scene paths or raw sessions.'
    },
    'activity.session_count': {
        label: 'Session count',
        desc: 'A bucketed count for the report period. Raw session rows stay local.'
    },
    'activity.mode_mix': {
        label: 'Mode mix',
        desc: 'Coarse percentage mix for drafting, revising, editing, and planning.'
    },
    'activity.scenes_completed_by_stage': {
        label: 'Completed scenes by stage',
        desc: 'Aggregate scene completions grouped by publish stage.'
    },
    'activity.stage_mix': {
        label: 'Stage mix',
        desc: 'Aggregate stage mix for public progress context.'
    },
    'activity.completed_scene_count': {
        label: 'Completed scene count',
        desc: 'Aggregate completed-scene total for the report period.'
    },
    'activity.revised_scene_count': {
        label: 'Revised scene count',
        desc: 'Aggregate revised-scene total for the report period.'
    },
    'activity.streak': {
        label: 'Streak',
        desc: 'A public-friendly streak label calculated from local sessions.'
    },
    'structure.real_scene_titles': {
        label: 'Real scene titles',
        desc: 'Sensitive structure field. Future only; excluded from launch.',
        future: true
    },
    'activity.exact_session_timestamps': {
        label: 'Exact session timestamps',
        desc: 'Sensitive timing field. Future only; excluded from launch.',
        future: true
    }
};

const AUDIENCE_LABELS: Record<CommunityShareAudience, string> = {
    private_draft: 'Private draft',
    public: 'Public',
    followers: 'Followers',
    trusted_authors: 'Trusted authors',
    private_link: 'Private link'
};

function getCommunitySettings(plugin: RadialTimelinePlugin): CommunityShareSettings {
    const normalized = normalizeCommunityShareSettings(plugin.settings.communityShare);
    if (JSON.stringify(plugin.settings.communityShare ?? null) !== JSON.stringify(normalized)) {
        plugin.settings.communityShare = normalized;
        void plugin.saveSettings();
    }
    return normalized;
}

function getActiveBook(plugin: RadialTimelinePlugin) {
    return plugin.settings.books.find(book => book.id === plugin.settings.activeBookId) ?? plugin.settings.books[0];
}

function formatStatus(settings: CommunityShareSettings): string {
    if (!settings.enabled) return 'Off';
    if (settings.connection.status === 'connected') return 'Connected';
    if (settings.connection.status === 'paused') return 'Paused';
    if (settings.connection.status === 'revoked') return 'Revoked';
    if (settings.connection.status === 'pending') return 'Pending';
    return 'Not connected';
}

function hasReadyPreview(settings: CommunityShareSettings): boolean {
    return settings.preview.status === 'ready' && Boolean(settings.preview.previewHash && settings.preview.payloadHash);
}

function getSelectedFieldLabels(settings: CommunityShareSettings): string[] {
    return COMMUNITY_SHARE_FIELD_KEYS
        .filter(key => settings.fieldPolicy[key])
        .map(key => FIELD_COPY[key].label);
}

export function renderCommunityShareSection({ plugin, containerEl }: CommunityShareSectionProps): void {
    const settings = getCommunitySettings(plugin);
    const activeBook = getActiveBook(plugin);
    const isConnected = settings.connection.status === 'connected';
    const selectedFields = getSelectedFieldLabels(settings);
    const hasPublishedReport = settings.publishHistory.some(entry => entry.action === 'publish' && entry.status === 'success' && Boolean(entry.publishId));

    const section = containerEl.createDiv({
        cls: `${ERT_CLASSES.ROOT} ${ERT_CLASSES.STACK}`
    });

    const save = async (next: Partial<CommunityShareSettings>) => {
        const invalidatesPreview = next.fieldPolicy !== undefined
            || next.audience !== undefined
            || next.tier !== undefined
            || next.manualPublishEnabled !== undefined;
        plugin.settings.communityShare = normalizeCommunityShareSettings({
            ...settings,
            ...next,
            fieldPolicy: next.fieldPolicy ?? settings.fieldPolicy,
            connection: next.connection ?? settings.connection,
            preview: next.preview ?? (invalidatesPreview
                ? {
                    ...settings.preview,
                    status: settings.preview.status === 'not_generated' ? 'not_generated' : 'stale',
                    previewHash: undefined,
                    payloadHash: undefined
                }
                : settings.preview)
        });
        await plugin.saveSettings();
        containerEl.empty();
        renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
    };

    const hero = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}` });
    const badgeRow = hero.createDiv({ cls: ERT_CLASSES.INLINE });
    const badge = badgeRow.createSpan({ cls: ERT_CLASSES.BADGE_PILL });
    setIcon(badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), settings.enabled ? 'shield-check' : 'shield');
    badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: `Community share - ${formatStatus(settings)}` });
    const wikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings-Community',
        cls: ERT_CLASSES.BADGE_PILL_WIKI,
        attr: {
            'aria-label': 'Read more in the wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(wikiLink, 'external-link');

    const titleRow = hero.createDiv({ cls: 'ert-hero-titleRow' });
    titleRow.createDiv({
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: 'Community share'
    });
    hero.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: 'Publish a progress report for fellow authors only after you connect this vault, select fields, review the complete preview, and press publish.'
    });

    const heroFeatures = hero.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    heroFeatures.createDiv({ text: 'Community highlights:', cls: 'ert-kicker' });
    const featuresList = heroFeatures.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'lock', text: 'Off by default. Nothing publishes from this vault until you opt in.' },
        { icon: 'eye', text: 'Complete preview is the hard gate before any report can leave the plugin.' },
        { icon: 'file-x', text: 'No manuscript text, scene paths, note paths, raw sessions, or exact public timestamps.' }
    ].forEach(item => {
        const li = featuresList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        setIcon(li.createSpan({ cls: 'ert-feature-icon' }), item.icon);
        li.createSpan({ text: item.text });
    });

    const activationCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
    activationCard.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'Activation and Connection' });
    activationCard.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'The website creates a one-time activation token. The plugin will confirm it, store only a local secret reference, and map this vault to one public project.'
    });

    new Setting(activationCard)
        .setName('Community share')
        .setDesc('Master opt-in for this vault. Turning this on still does not publish anything.')
        .addToggle(toggle => toggle
            .setValue(settings.enabled)
            .onChange(value => save({ enabled: value })));

    new Setting(activationCard)
        .setName('Connection status')
        .setDesc(settings.connection.publicSlug ? `Public slug: ${settings.connection.publicSlug}` : 'No website connection yet.');

    let tokenValue = '';
    let connectButton: import('obsidian').ButtonComponent | null = null;
    new Setting(activationCard)
        .setName('Activation token')
        .setDesc('Paste the one-time token created on the website. Confirmation publishes no progress data.')
        .addText(text => {
            text.setPlaceholder('One-time token from radialtimeline.com');
            text.onChange(value => {
                tokenValue = value.trim();
                connectButton?.setDisabled(tokenValue.length < 16);
            });
        })
        .addButton(button => {
            connectButton = button;
            button
                .setButtonText('Connect')
                .setDisabled(true)
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText('Connecting...');
                    try {
                        const result = await confirmCommunityShareActivation(plugin, tokenValue);
                        new Notice(`Community Share connected to ${result.project_title || 'your website project'}.`);
                        containerEl.empty();
                        renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
                    } catch (error) {
                        const message = error instanceof CommunityShareError
                            ? error.message
                            : 'Community activation failed. Generate a new token and try again.';
                        const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
                        plugin.settings.communityShare = normalizeCommunityShareSettings({
                            ...current,
                            lastError: message
                        });
                        void plugin.saveSettings();
                        new Notice(message);
                        button.setButtonText('Connect');
                        button.setDisabled(tokenValue.length < 16);
                    }
                });
        });

    if (settings.lastError) {
        activationCard.createDiv({ cls: ERT_CLASSES.FIELD_NOTE, text: settings.lastError });
    }

    const sharingCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
    sharingCard.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'Share Controls' });
    sharingCard.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Launch scope is public manual reports only. Future audiences stay visible here so the boundary is clear, but they are disabled.'
    });

    new Setting(sharingCard)
        .setName('Audience')
        .setDesc('Public is the only launched website audience. Private draft keeps work local.')
        .addDropdown(dropdown => {
            dropdown.addOption('private_draft', AUDIENCE_LABELS.private_draft);
            dropdown.addOption('public', AUDIENCE_LABELS.public);
            dropdown.addOption('followers', `${AUDIENCE_LABELS.followers} (future)`);
            dropdown.addOption('trusted_authors', `${AUDIENCE_LABELS.trusted_authors} (future)`);
            dropdown.addOption('private_link', `${AUDIENCE_LABELS.private_link} (future)`);
            dropdown.setValue(settings.audience);
            dropdown.selectEl.querySelector('option[value="followers"]')?.setAttr('disabled', 'disabled');
            dropdown.selectEl.querySelector('option[value="trusted_authors"]')?.setAttr('disabled', 'disabled');
            dropdown.selectEl.querySelector('option[value="private_link"]')?.setAttr('disabled', 'disabled');
            dropdown.onChange(value => save({ audience: value as CommunityShareAudience }));
        });

    new Setting(sharingCard)
        .setName('Report tier')
        .setDesc('Tier 0 shares nothing. Tiers 1-4 are launch-safe. Tier 5 is reserved for future richer reports.')
        .addDropdown(dropdown => {
            [
                [0, 'Tier 0 - Off'],
                [1, 'Tier 1 - Project shell'],
                [2, 'Tier 2 - Progress totals'],
                [3, 'Tier 3 - Weekly report'],
                [4, 'Tier 4 - Full public report'],
                [5, 'Tier 5 - Future']
            ].forEach(([value, label]) => dropdown.addOption(String(value), String(label)));
            dropdown.setValue(String(settings.tier));
            dropdown.selectEl.querySelector('option[value="5"]')?.setAttr('disabled', 'disabled');
            dropdown.onChange(value => save({ tier: Number(value) as CommunityShareTier }));
        });

    new Setting(sharingCard)
        .setName('Manual publish')
        .setDesc('Launch reports publish only when you press publish after reviewing the complete preview.')
        .addToggle(toggle => toggle
            .setValue(settings.manualPublishEnabled)
            .onChange(value => save({ manualPublishEnabled: value })));

    new Setting(sharingCard)
        .setName('Scheduled publishing')
        .setDesc('Future feature. Forced off in launch backend guardrails.')
        .addToggle(toggle => toggle
            .setValue(false)
            .setDisabled(true));

    const fieldsCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
    fieldsCard.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'Field Opt-ins' });
    fieldsCard.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Every field starts off. Toggle only the data you want in the public report.'
    });

    COMMUNITY_SHARE_FIELD_KEYS.forEach(key => {
        const copy = FIELD_COPY[key];
        new Setting(fieldsCard)
            .setName(copy.future ? `${copy.label} - future` : copy.label)
            .setDesc(copy.desc)
            .addToggle(toggle => toggle
                .setValue(settings.fieldPolicy[key])
                .setDisabled(copy.future === true)
                .onChange(value => save({
                    fieldPolicy: {
                        ...settings.fieldPolicy,
                        [key]: value
                    }
                })));
    });

    const previewCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
    previewCard.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'Complete Preview' });
    previewCard.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'This is the exact category checklist for the website report. The next slice will generate the signed preview hash from this state.'
    });
    const previewFrame = previewCard.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ${ERT_CLASSES.STACK} ert-previewFrame--flush` });
    previewFrame.createDiv({ cls: 'ert-previewFrame__title', text: activeBook?.publicLabel || activeBook?.title || 'No active project selected' });
    previewFrame.createDiv({ text: `Audience: ${AUDIENCE_LABELS[settings.audience]} - Tier ${settings.tier}` });
    previewFrame.createDiv({ text: `Project stage: ${activeBook?.projectStage || 'Not set'}` });
    previewFrame.createDiv({ text: `Genre: ${activeBook?.genre || 'Not set'}` });
    previewFrame.createDiv({ text: `Public description: ${activeBook?.publicDescription || 'Not set'}` });
    previewFrame.createDiv({ text: selectedFields.length ? `Included fields: ${selectedFields.join(', ')}` : 'Included fields: none selected' });
    previewFrame.createDiv({ text: 'Always excluded: manuscript text, scene/note/vault paths, raw sessions, exact public timestamps, secrets.' });
    previewFrame.createDiv({
        text: hasReadyPreview(settings)
            ? `Preview ready: ${settings.preview.generatedAt ?? 'time not recorded'}`
            : 'Preview not generated yet.'
    });
    if (settings.preview.summary) {
        previewFrame.createDiv({ text: settings.preview.summary });
    }
    if (settings.preview.previewHash) {
        previewFrame.createDiv({ text: `Preview hash: ${settings.preview.previewHash.slice(0, 12)}...` });
    }

    const canGeneratePreview = settings.enabled
        && isConnected
        && settings.audience === 'public'
        && settings.tier > 0
        && settings.tier < 5
        && selectedFields.length > 0;
    new Setting(previewCard)
        .setName('Generate preview')
        .setDesc(canGeneratePreview ? 'Builds the hash-checked preview from public fields only.' : 'Requires an active connection, public audience, launch tier, and at least one selected field.')
        .addButton(button => button
            .setButtonText('Generate complete preview')
            .setDisabled(!canGeneratePreview)
            .onClick(async () => {
                button.setDisabled(true);
                button.setButtonText('Generating...');
                try {
                    const preview = await buildCommunitySharePreview(plugin);
                    await save({
                        preview: {
                            status: 'ready',
                            generatedAt: new Date().toISOString(),
                            previewHash: preview.previewHash,
                            payloadHash: preview.payloadHash,
                            reportPeriod: 'weekly',
                            summary: preview.summary
                        },
                        lastError: undefined
                    });
                    new Notice('Complete preview generated. Review it before publishing.');
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Could not generate the Complete Preview.';
                    await save({
                        preview: {
                            ...settings.preview,
                            status: 'blocked'
                        },
                        lastError: message
                    });
                    new Notice(message);
                }
            }));

    const actionCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
    actionCard.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'Publish and Safety' });
    actionCard.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Publish stays locked until the website connection exists, manual publishing is enabled, and the Complete Preview hash is ready.'
    });
    const canPublish = settings.enabled
        && isConnected
        && settings.audience === 'public'
        && settings.tier > 0
        && settings.tier < 5
        && settings.manualPublishEnabled
        && hasReadyPreview(settings)
        && selectedFields.length > 0;

    new Setting(actionCard)
        .setName('Manual publish')
        .setDesc(canPublish ? 'Ready to publish.' : 'Locked by opt-in, connection, public audience, selected fields, and Complete Preview.')
        .addButton(button => button
            .setButtonText('Publish report')
            .setCta()
            .setDisabled(!canPublish)
            .onClick(async () => {
                button.setDisabled(true);
                button.setButtonText('Publishing...');
                try {
                    const result = await publishCommunityShareReport(plugin);
                    new Notice(`Community report published: ${result.public_slug}`);
                    containerEl.empty();
                    renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
                } catch (error) {
                    const message = error instanceof CommunityShareError
                        ? error.message
                        : 'Community publish failed. Review the Complete Preview and try again.';
                    const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
                    plugin.settings.communityShare = normalizeCommunityShareSettings({
                        ...current,
                        lastError: message
                    });
                    void plugin.saveSettings();
                    new Notice(message);
                    button.setButtonText('Publish report');
                    button.setDisabled(!canPublish);
                }
            }));

    new Setting(actionCard)
        .setName('Pause public report')
        .setDesc('Temporarily hides the public report without deleting local settings.')
        .addButton(button => button.setButtonText('Pause').setDisabled(true));

    new Setting(actionCard)
        .setName('Revoke public report')
        .setDesc('Removes the current public report while keeping your connection.')
        .addButton(button => button
            .setButtonText('Revoke')
            .setDisabled(!isConnected || !hasPublishedReport)
            .onClick(async () => {
                button.setDisabled(true);
                button.setButtonText('Revoking...');
                try {
                    await revokeCommunityShareReport(plugin);
                    new Notice('Community report revoked.');
                    containerEl.empty();
                    renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
                } catch (error) {
                    const message = error instanceof CommunityShareError ? error.message : 'Could not revoke the Community report.';
                    const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
                    plugin.settings.communityShare = normalizeCommunityShareSettings({ ...current, lastError: message });
                    void plugin.saveSettings();
                    new Notice(message);
                    button.setButtonText('Revoke');
                    button.setDisabled(!isConnected || !hasPublishedReport);
                }
            }));

    new Setting(actionCard)
        .setName('Delete shared report data')
        .setDesc('Deletes website payload JSON for the report. Metadata/tombstones remain for audit proof.')
        .addButton(button => button
            .setButtonText('Delete shared data')
            .setDisabled(!isConnected || !hasPublishedReport)
            .onClick(async () => {
                if (!window.confirm('Delete the shared Community report payload from the website? Local writing data stays in this vault.')) return;
                button.setDisabled(true);
                button.setButtonText('Deleting...');
                try {
                    await deleteCommunityShareReport(plugin);
                    new Notice('Shared community report data deleted.');
                    containerEl.empty();
                    renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
                } catch (error) {
                    const message = error instanceof CommunityShareError ? error.message : 'Could not delete shared Community report data.';
                    const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
                    plugin.settings.communityShare = normalizeCommunityShareSettings({ ...current, lastError: message });
                    void plugin.saveSettings();
                    new Notice(message);
                    button.setButtonText('Delete shared data');
                    button.setDisabled(!isConnected || !hasPublishedReport);
                }
            }));

    new Setting(actionCard)
        .setName('Disconnect plugin')
        .setDesc('Disconnects this vault from the website. Local writing data stays local.')
        .addButton(button => button
            .setButtonText('Disconnect')
            .setDisabled(!isConnected)
            .onClick(async () => {
                if (!window.confirm('Disconnect this vault from Community Share? This does not delete local writing data.')) return;
                button.setDisabled(true);
                button.setButtonText('Disconnecting...');
                try {
                    await disconnectCommunityShare(plugin);
                    new Notice('Community share disconnected.');
                    containerEl.empty();
                    renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
                } catch (error) {
                    const message = error instanceof CommunityShareError ? error.message : 'Could not disconnect Community Share.';
                    const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
                    plugin.settings.communityShare = normalizeCommunityShareSettings({ ...current, lastError: message });
                    void plugin.saveSettings();
                    new Notice(message);
                    button.setButtonText('Disconnect');
                    button.setDisabled(!isConnected);
                }
            }));
}
