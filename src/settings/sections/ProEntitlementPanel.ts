import { Notice, Setting, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { ERT_CLASSES } from '../../ui/classes';
import { getProEntitlement } from '../proEntitlement';

interface ProEntitlementPanelParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    onEntitlementChanged?: () => void;
}

const TEMPORARY_BETA_KEY = '1234567890abcdef';
const TEMPORARY_BETA_KEY_EXPIRY = 'December 31, 2026';

export function renderProEntitlementPanel({
    app: _app,
    plugin,
    containerEl,
    onEntitlementChanged
}: ProEntitlementPanelParams): HTMLElement {
    const entitlement = getProEntitlement(plugin);
    const panel = containerEl.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK_TIGHT}` });

    const statusRow = panel.createDiv({ cls: 'ert-pro-status-inline' });
    const statusBadge = statusRow.createSpan({
        cls: `${ERT_CLASSES.BADGE_PILL} ${entitlement.isProActive ? ERT_CLASSES.BADGE_PILL_PRO : ERT_CLASSES.BADGE_PILL_NEUTRAL}`
    });
    const statusBadgeIcon = statusBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(statusBadgeIcon, 'signature');
    statusBadge.createSpan({
        cls: ERT_CLASSES.BADGE_PILL_TEXT,
        text: entitlement.isProActive ? 'PRO ACTIVE' : 'PRO OFF'
    });
    statusRow.createSpan({
        cls: 'ert-pro-status-label',
        text: entitlement.isProActive
            ? 'Pro features are unlocked for this vault.'
            : entitlement.hasProLicenseKey
                ? 'Pro key saved, but Pro is currently turned off for this vault.'
                : 'Enter a Pro key and turn Pro on to unlock Pro features.'
    });

    const enabledSetting = new Setting(panel)
        .setName('Enable Pro')
        .setDesc('Turn Pro features on or off for testing without removing the saved key.')
        .addToggle(toggle => {
            toggle
                .setValue(entitlement.isProEnabled)
                .onChange(async (value) => {
                    plugin.settings.proAccessEnabled = value;
                    await plugin.saveSettings();
                    onEntitlementChanged?.();
                });
        });
    enabledSetting.settingEl.addClass('ert-settingRow');

    const keySetting = new Setting(panel)
        .setName('Pro access key')
        .setDesc(`Enter your Pro access key to unlock Pro features. Temporary beta key: ${TEMPORARY_BETA_KEY} (expires ${TEMPORARY_BETA_KEY_EXPIRY}).`)
        .addText(text => {
            text.setPlaceholder('XXXX-XXXX-XXXX-XXXX');
            text.setValue(plugin.settings.proLicenseKey || '');
            text.inputEl.addClass('ert-input--lg');
            text.inputEl.type = 'password';

            const toggleVis = text.inputEl.parentElement?.createEl('button', {
                cls: 'ert-clickable-icon clickable-icon',
                attr: { type: 'button', 'aria-label': 'Show or hide Pro access key' }
            });
            if (toggleVis) {
                setIcon(toggleVis, 'eye');
                plugin.registerDomEvent(toggleVis, 'click', () => {
                    if (text.inputEl.type === 'password') {
                        text.inputEl.type = 'text';
                        setIcon(toggleVis, 'eye-off');
                    } else {
                        text.inputEl.type = 'password';
                        setIcon(toggleVis, 'eye');
                    }
                });
            }

            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                plugin.settings.proLicenseKey = value || undefined;
                await plugin.saveSettings();
                onEntitlementChanged?.();
            });
        })
        .addButton(button => {
            button.setButtonText('Copy beta key');
            button.onClick(async () => {
                try {
                    await navigator.clipboard.writeText(TEMPORARY_BETA_KEY);
                    new Notice('Temporary beta key copied to clipboard.');
                } catch {
                    new Notice(`Could not copy automatically. Use ${TEMPORARY_BETA_KEY}.`);
                }
            });
        });

    keySetting.nameEl.createEl('a', {
        text: ' Get Pro →',
        href: 'https://radial-timeline.com/signature',
        cls: 'ert-link-accent',
        attr: { target: '_blank', rel: 'noopener' }
    });

    return panel;
}
