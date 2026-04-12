import { Notice, setIcon } from 'obsidian';
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
    const panel = containerEl.createDiv({ cls: 'ert-pro-mode' });
    const toggleInputs: HTMLInputElement[] = [];
    const proModeLabel = 'Pro Mode';

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
    const collapsedButton = collapsed.createDiv({
        cls: 'ert-pro-mode__collapsed-button',
        attr: { role: 'button', tabindex: '0', 'aria-expanded': 'false' }
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
    const collapsedChevron = collapsedTitle.createSpan({ cls: 'ert-pro-mode__chevron' });
    setIcon(collapsedChevron, 'chevron-right');
    collapsedTitle.createSpan({ cls: 'ert-pro-mode__title-text', text: 'Pro Mode (Early Access)' });
    const collapsedToggle = createToggle(collapsedRow, 'Toggle Pro Mode');
    collapsedButton.createDiv({
        cls: 'ert-pro-mode__collapsed-subtext',
        text: 'Magenta sections are Pro features.'
    });

    const expanded = panel.createDiv({ cls: 'ert-pro-mode__expanded' });
    const expandedId = 'ert-pro-mode-expanded';
    expanded.id = expandedId;
    collapsedButton.setAttr('aria-controls', expandedId);
    const hero = expanded.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ert-pro-hero-card`
    });
    const watermark = hero.createSpan({ cls: 'ert-pro-hero-watermark', attr: { 'aria-hidden': 'true' } });
    setIcon(watermark, 'signature');
    const heroContent = hero.createDiv({ cls: `${ERT_CLASSES.STACK} ert-pro-hero-content` });

    const heroBadgeRow = heroContent.createDiv({ cls: 'ert-pro-hero-badgeRow' });
    const heroPill = heroBadgeRow.createSpan({
        cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO} ert-pro-pill`
    });
    const heroPillIcon = heroPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(heroPillIcon, 'signature');
    heroPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });

    heroContent.createEl('div', { cls: 'ert-kicker', text: 'EARLY ACCESS' });
    heroContent.createEl('h3', {
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: proModeLabel
    });
    const heroCopy = heroContent.createEl('p', { cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle ert-pro-hero-body` });
    heroCopy.appendText('Pro Mode expands Radial Timeline into a complete manuscript system—where writing, analysis, and publishing work together. Evaluate your story with deeper INQUIRY+ questions, track structure and momentum across scenes, and generate polished manuscripts with PANDOC PDF EXPORTS and custom LaTeX templates. Share progress through APR CAMPAIGNS, and explore WEBSITE EXCLUSIVES including ');
    heroCopy.createSpan({ cls: 'ert-mono-inline', text: 'Pride & Prejudice' });
    heroCopy.appendText(' and ');
    heroCopy.createSpan({ cls: 'ert-mono-inline', text: 'Sherlock Holmes' });
    heroCopy.appendText(' template vaults, Inquiry View Omnibus Briefings, and guided workflow demonstrations. Instead of stitching together tools, Pro brings everything into one system—so you can move faster, decide with confidence, and finish stronger.');

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


    const toggleExpanded = (expanded: boolean): void => {
        panel.toggleClass('is-expanded', expanded);
        collapsedButton.setAttr('aria-expanded', `${expanded}`);
        setIcon(collapsedChevron, expanded ? 'chevron-down' : 'chevron-right');
    };

    const handleToggleChange = async (value: boolean): Promise<void> => {
        await setProEnabled(value);
    };

    plugin.registerDomEvent(collapsedButton, 'click', () => {
        toggleExpanded(!panel.hasClass('is-expanded'));
    });
    plugin.registerDomEvent(collapsedButton, 'keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            toggleExpanded(!panel.hasClass('is-expanded'));
        }
    });

    plugin.registerDomEvent(collapsedToggle, 'change', async () => {
        await handleToggleChange(collapsedToggle.checked);
    });
    applyProState(entitlement.isProEnabled);
    toggleExpanded(false);

    return panel;
}
