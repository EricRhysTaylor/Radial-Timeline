import { Setting, setIcon } from 'obsidian';
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

export function renderProEntitlementPanel({
    app: _app,
    plugin,
    containerEl,
    onEntitlementChanged
}: ProEntitlementPanelParams): HTMLElement {
    const entitlement = getProEntitlement(plugin);
    const panel = containerEl.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK_TIGHT}` });

    if (entitlement.isProActive) {
        const activeRow = panel.createDiv({ cls: 'ert-pro-status-inline' });
        const activeBadge = activeRow.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}`
        });
        const activeBadgeIcon = activeBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(activeBadgeIcon, 'signature');
        activeBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO ACTIVE' });
        activeRow.createSpan({
            cls: 'ert-pro-status-label',
            text: 'Pro features are unlocked for this vault.'
        });
        return panel;
    }

    const keySetting = new Setting(panel)
        .setName('Pro access key')
        .setDesc('Enter your Pro access key to unlock Pro features.')
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
        });

    keySetting.nameEl.createEl('a', {
        text: ' Get Pro →',
        href: 'https://radial-timeline.com/signature',
        cls: 'ert-link-accent',
        attr: { target: '_blank', rel: 'noopener' }
    });

    return panel;
}
