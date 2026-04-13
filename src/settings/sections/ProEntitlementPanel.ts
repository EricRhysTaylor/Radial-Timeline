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

const RT_LOGO_PATHS = [
    'M604.11,1274.16l-131.83.12,36.57-162.23c12.42-55.12,57.45-94.1,114.42-94.09h122.98c10.22.01,20-1.99,28.72-6.65,14.3-7.63,20.82-22.45,19.24-38.15-2.34-23.35-20.29-34.12-42.51-35.41l-201.37-.06,29.2-125.03,185.04.12c69.83,3.45,127.94,44.91,151.99,110.3,18.56,53.7,7.91,111.98-27.6,156.25-17.24,21.5-39.41,37.45-64.95,49.11l71.96,144.34c.9,1.81,1.8,2.59-1.12,1.42l-142.07.04-64.96-128.49-53.36-.13-30.34,128.56Z',
    'M937.3,1274.25l17.69-77.78,60.02-258.56-45.47-.23c-9.55-54.08-42.3-98.13-90.97-124.96l425-.04-28.48,125.02-129.43.05-78.44,336.43-129.93.06Z'
] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildProHeroLogo(parent: HTMLElement): () => void {
    const wrap = parent.createDiv({ cls: 'ert-pro-hero-logoRow' });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttr('class', 'ert-pro-hero-logo');
    svg.setAttr('viewBox', '0 0 2048 2048');
    svg.setAttr('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttr('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttr('id', 'ert-pro-hero-logo-gradient');
    gradient.setAttr('x1', '0%');
    gradient.setAttr('y1', '0%');
    gradient.setAttr('x2', '100%');
    gradient.setAttr('y2', '100%');

    const start = document.createElementNS(SVG_NS, 'stop');
    start.setAttr('offset', '0%');
    start.setAttr('stop-color', '#d946ef');
    const end = document.createElementNS(SVG_NS, 'stop');
    end.setAttr('offset', '100%');
    end.setAttr('stop-color', '#8b5cf6');
    gradient.append(start, end);
    defs.append(gradient);
    svg.append(defs);

    RT_LOGO_PATHS.forEach((pathData) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttr('d', pathData);
        path.setAttr('fill', 'url(#ert-pro-hero-logo-gradient)');
        svg.append(path);
    });

    wrap.appendChild(svg);

    const fitLogoToBounds = (): void => {
        try {
            const box = svg.getBBox();
            if (!box.width || !box.height) return;
            const pad = Math.min(box.width, box.height) * 0.02;
            svg.setAttr('viewBox', `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
        } catch {
            // Ignore sizing failures; falls back to default viewBox.
        }
    };

    requestAnimationFrame(fitLogoToBounds);
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => fitLogoToBounds());
        observer.observe(svg);
    }
    return fitLogoToBounds;
}

export function renderProEntitlementPanel({
    app: _app,
    plugin,
    containerEl,
    onEntitlementChanged
}: ProEntitlementPanelParams): HTMLElement {
    const entitlement = getProEntitlement(plugin);
    const panel = containerEl.createDiv({ cls: 'ert-pro-mode' });
    const toggleInputs: HTMLInputElement[] = [];

    const createToggle = (parent: HTMLElement, ariaLabel: string): HTMLInputElement => {
        const toggleWrap = parent.createDiv({ cls: `${ERT_CLASSES.TOGGLE_ITEM} ert-pro-mode__toggle` });
        const toggleInput = toggleWrap.createEl('input', {
            cls: 'ert-toggle-input',
            attr: { type: 'checkbox', 'aria-label': ariaLabel }
        });
        toggleInputs.push(toggleInput);
        plugin.registerDomEvent(toggleInput, 'click', (evt) => evt.stopPropagation());
        plugin.registerDomEvent(toggleWrap, 'click', (evt) => evt.stopPropagation());
        return toggleInput;
    };

    const applyProState = (enabled: boolean): void => {
        toggleInputs.forEach((input) => {
            input.checked = enabled;
        });
        panel.toggleClass('is-pro-enabled', enabled);
        panel.toggleClass('is-pro-disabled', !enabled);
    };

    const setProEnabled = async (enabled: boolean): Promise<void> => {
        applyProState(enabled);
        plugin.settings.proAccessEnabled = enabled;
        await plugin.saveSettings();
        if (!enabled) {
            new Notice('Pro disabled — previewing Core mode');
        }
        onEntitlementChanged?.();
    };

    const collapsed = panel.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ert-pro-hero-card ert-pro-hero-card--collapsed ert-pro-mode__collapsed`
    });
    const collapsedWatermark = collapsed.createSpan({ cls: 'ert-pro-hero-watermark', attr: { 'aria-hidden': 'true' } });
    setIcon(collapsedWatermark, 'signature');
    const collapsedButton = collapsed.createDiv({
        cls: 'ert-pro-mode__collapsed-button'
    });
    const collapsedRow = collapsedButton.createDiv({ cls: 'ert-pro-mode__collapsed-row' });
    const collapsedLeft = collapsedRow.createDiv({ cls: 'ert-pro-mode__collapsed-left' });
    const collapsedPill = collapsedLeft.createSpan({
        cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO} ert-pro-pill`
    });
    const collapsedPillIcon = collapsedPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(collapsedPillIcon, 'signature');
    collapsedPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
    const collapsedTitle = collapsedLeft.createDiv({ cls: 'ert-pro-mode__collapsed-title' });
    collapsedTitle.createSpan({ cls: 'ert-pro-mode__title-text', text: 'Pro Signature (Early Access)' });
    const collapsedToggle = createToggle(collapsedRow, 'Toggle Pro Mode');

    // ── Pro access key input ───────────────────────────────────
    const keyContainer = collapsed.createDiv({ cls: 'ert-pro-key-container' });
    const keySetting = new Setting(keyContainer)
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
        text: ' Get Pro \u2192',
        href: 'https://radial-timeline.com/signature',
        cls: 'ert-link-accent',
        attr: { target: '_blank', rel: 'noopener' }
    });

    const heroContent = collapsed.createDiv({ cls: `${ERT_CLASSES.STACK} ert-pro-hero-content` });
    buildProHeroLogo(heroContent);
    const proNote = heroContent.createDiv({ cls: 'ert-pro-hero-notePill' });
    proNote.createSpan({ text: 'Pro workflows appear throughout RT in magenta.' });
    const heroCopy = heroContent.createEl('p', { cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle ert-pro-hero-body` });
    heroCopy.appendText('Pro Mode extends Radial Timeline with ');
    heroCopy.createEl('strong', { text: 'advanced workflows for authors who want more' });
    heroCopy.appendText('. Evaluate your story with deeper INQUIRY+ questions, track structure and momentum across scenes, and generate polished manuscripts with PANDOC PDF EXPORTS and custom LaTeX templates. Share progress through APR CAMPAIGNS, and explore WEBSITE EXCLUSIVES including ');
    heroCopy.createSpan({ cls: 'ert-mono-inline', text: 'Pride & Prejudice' });
    heroCopy.appendText(' and ');
    heroCopy.createSpan({ cls: 'ert-mono-inline', text: 'Sherlock Holmes' });
    heroCopy.appendText(' template vaults, Omnibus Inquiry briefings, and guided workflow demonstrations.');

    const featureStrip = heroContent.createDiv({ cls: 'ert-pro-hero-pillStrip' });
    const featureItems = [
        { icon: 'file-text', label: 'Publishing' },
        { icon: 'share-2', label: 'APR Campaigns' },
        { icon: 'waves', label: 'Inquiry+' },
        { icon: 'waypoints', label: 'Structure' },
        { icon: 'sparkles', label: 'Website Exclusives' }
    ];
    featureItems.forEach(({ icon, label }) => {
        const item = featureStrip.createDiv({ cls: 'ert-pro-hero-pill' });
        const iconEl = item.createSpan({ cls: 'ert-pro-hero-pill-icon' });
        setIcon(iconEl, icon);
        item.createSpan({ cls: 'ert-pro-hero-pill-label', text: label });
    });


    const handleToggleChange = async (value: boolean): Promise<void> => {
        await setProEnabled(value);
    };

    plugin.registerDomEvent(collapsedToggle, 'change', async () => {
        await handleToggleChange(collapsedToggle.checked);
    });
    applyProState(entitlement.isProEnabled);

    return panel;
}
