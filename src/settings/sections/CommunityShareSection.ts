import { App, Notice, Setting, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import {
    COMMUNITY_SHARE_FIELD_KEYS,
    normalizeCommunityShareSettings
} from '../../communityShare/communityShareSettings';
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
    projectShell: {
        label: 'Project shell',
        desc: 'Public book label, genre labels, status label, and public description.'
    },
    genre: {
        label: 'Genre',
        desc: 'The broad genre chosen for this project.'
    },
    subgenre: {
        label: 'Subgenre',
        desc: 'A narrower classification when available.'
    },
    customGenre: {
        label: 'Custom genre note',
        desc: 'Optional custom text for projects that do not fit the tree.'
    },
    projectStage: {
        label: 'Project stage',
        desc: 'Drafting, revising, querying, publishing, or another author-facing stage.'
    },
    publicDescription: {
        label: 'Public description',
        desc: 'The description from the active book profile. Never manuscript text.'
    },
    progressPercent: {
        label: 'Progress percent',
        desc: 'A rounded project progress signal from your existing RT progress model.'
    },
    weeklyWords: {
        label: 'Words this week',
        desc: 'Aggregated writing-session words only. No scene paths or raw sessions.'
    },
    weeklyMinutes: {
        label: 'Minutes this week',
        desc: 'Aggregated active writing time only. No exact timestamps.'
    },
    streak: {
        label: 'Streak',
        desc: 'A public-friendly streak label calculated from local sessions.'
    },
    sessionCount: {
        label: 'Session count',
        desc: 'Aggregated count for the report period. Raw session rows stay local.'
    },
    aprCard: {
        label: 'APR card',
        desc: 'A public Author Progress Report visual generated from opted-in fields.'
    },
    workingNow: {
        label: 'Working Now',
        desc: 'Presence and radial timeline activity. Future only; excluded from launch.',
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

    const section = containerEl.createDiv({
        cls: `${ERT_CLASSES.ROOT} ${ERT_CLASSES.STACK} ${ERT_CLASSES.DENSITY_COMPACT}`
    });

    const save = async (next: Partial<CommunityShareSettings>) => {
        plugin.settings.communityShare = normalizeCommunityShareSettings({
            ...settings,
            ...next,
            fieldPolicy: next.fieldPolicy ?? settings.fieldPolicy,
            connection: next.connection ?? settings.connection,
            preview: next.preview ?? settings.preview
        });
        await plugin.saveSettings();
        containerEl.empty();
        renderCommunityShareSection({ app: plugin.app, plugin, containerEl });
    };

    const hero = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}` });
    const badge = hero.createDiv({ cls: ERT_CLASSES.BADGE_PILL });
    setIcon(badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), settings.enabled ? 'shield-check' : 'shield');
    badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: `Community Share - ${formatStatus(settings)}` });
    hero.createEl('h3', {
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: 'Community Share'
    });
    hero.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: 'Publish an author-to-author progress report only after you connect this vault, select fields, review the Complete Preview, and press Publish.'
    });
    const heroFeatures = hero.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'lock', text: 'Off by default. Nothing publishes from this vault until you opt in.' },
        { icon: 'eye', text: 'Complete Preview is the hard gate before any report can leave the plugin.' },
        { icon: 'file-x', text: 'No manuscript text, scene paths, note paths, raw sessions, or exact public timestamps.' }
    ].forEach(item => {
        const row = heroFeatures.createEl('li', { cls: ERT_CLASSES.INLINE });
        setIcon(row.createSpan({ cls: 'ert-feature-icon' }), item.icon);
        row.createSpan({ text: item.text });
    });

    const activationCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
    activationCard.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'Activation and Connection' });
    activationCard.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'The website creates a one-time activation token. The plugin will confirm it, store only a local secret reference, and map this vault to one public project.'
    });

    new Setting(activationCard)
        .setName('Community Share')
        .setDesc('Master opt-in for this vault. Turning this on still does not publish anything.')
        .addToggle(toggle => toggle
            .setValue(settings.enabled)
            .onChange(value => save({ enabled: value })));

    new Setting(activationCard)
        .setName('Connection status')
        .setDesc(settings.connection.publicSlug ? `Public slug: ${settings.connection.publicSlug}` : 'No website connection yet.');

    new Setting(activationCard)
        .setName('Activation token')
        .setDesc('Paste-and-confirm comes next. This screen is ready for the backend connection flow.')
        .addText(text => {
            text.setPlaceholder('One-time token from radialtimeline.com');
            text.setDisabled(true);
        })
        .addButton(button => button
            .setButtonText('Connect')
            .setDisabled(true)
            .onClick(() => new Notice('Community activation wiring is the next implementation slice.')));

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
        .setDesc('Launch reports publish only when you press Publish after reviewing the Complete Preview.')
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

    new Setting(previewCard)
        .setName('Generate preview')
        .setDesc('Will build the hash-checked preview before publishing. Disabled until the network slice lands.')
        .addButton(button => button
            .setButtonText('Generate Complete Preview')
            .setDisabled(true));

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
            .setButtonText('Publish Report')
            .setCta()
            .setDisabled(!canPublish)
            .onClick(() => new Notice('Community publish wiring is the next implementation slice.')));

    new Setting(actionCard)
        .setName('Pause public report')
        .setDesc('Temporarily hides the public report without deleting local settings.')
        .addButton(button => button.setButtonText('Pause').setDisabled(!isConnected));

    new Setting(actionCard)
        .setName('Revoke public report')
        .setDesc('Removes the current public report while keeping your connection.')
        .addButton(button => button.setButtonText('Revoke').setDisabled(!isConnected));

    new Setting(actionCard)
        .setName('Delete shared report data')
        .setDesc('Deletes website payload JSON for the report. Metadata/tombstones remain for audit proof.')
        .addButton(button => button.setButtonText('Delete Shared Data').setDisabled(!isConnected));

    new Setting(actionCard)
        .setName('Disconnect plugin')
        .setDesc('Disconnects this vault from the website. Local writing data stays local.')
        .addButton(button => button.setButtonText('Disconnect').setDisabled(!isConnected));
}
