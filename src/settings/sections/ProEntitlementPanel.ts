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

    const collapsed = panel.createDiv({ cls: 'ert-pro-mode__collapsed' });
    const collapsedButton = collapsed.createDiv({
        cls: 'ert-pro-mode__collapsed-button',
        attr: { role: 'button', tabindex: '0', 'aria-expanded': 'false' }
    });
    const collapsedRow = collapsedButton.createDiv({ cls: 'ert-pro-mode__collapsed-row' });
    const collapsedTitle = collapsedRow.createDiv({ cls: 'ert-pro-mode__collapsed-title' });
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

    heroContent.createEl('div', { cls: 'ert-kicker', text: 'EARLY ACCESS' });
    heroContent.createEl('h3', {
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: proModeLabel
    });
    heroContent.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle ert-pro-hero-body`,
        text: 'Pro Mode expands Radial Timeline into a complete manuscript system—where writing, analysis, and publishing work together. You can evaluate your story with deeper Inquiry questions, track momentum and structure across scenes, and generate polished manuscripts using advanced Pandoc PDF exports with custom LaTeX templates. On the sharing side, Pro introduces Social APR campaigns to present your progress clearly without spoilers. Instead of stitching together tools and workflows, Pro brings everything into one system—so you can move faster, make better decisions, and finish stronger.'
    });

    const featureStrip = heroContent.createDiv({ cls: 'ert-pro-hero-strip' });
    const featureItems = [
        { icon: 'file-text', label: 'Publishing — Pandoc PDF + LaTeX templates' },
        { icon: 'share-2', label: 'APR Campaigns — shareable progress systems' },
        { icon: 'waves', label: 'Inquiry+ — expanded question sets' },
        { icon: 'waypoints', label: 'Structure — advanced beat systems' },
        { icon: 'sparkles', label: 'Showcase — examples & website resources' }
    ];
    featureItems.forEach(({ icon, label }) => {
        const item = featureStrip.createDiv({ cls: 'ert-pro-hero-feature' });
        const iconEl = item.createSpan({ cls: 'ert-pro-hero-feature-icon' });
        setIcon(iconEl, icon);
        item.createSpan({ cls: 'ert-pro-hero-feature-label', text: label });
    });

    const valueSection = heroContent.createDiv({ cls: 'ert-pro-hero-value' });
    valueSection.createEl('h5', { text: 'Designed to remove friction', cls: 'ert-kicker' });
    const valueList = valueSection.createEl('ul', { cls: 'ert-pro-hero-list' });
    [
        'Export clean manuscripts without manual formatting',
        'See structural issues across scenes instantly',
        'Evaluate story momentum visually',
        'Share progress clearly without spoilers'
    ].forEach((item) => valueList.createEl('li', { text: item }));

    const controlRow = heroContent.createDiv({ cls: 'ert-pro-hero-control' });
    controlRow.createSpan({ cls: 'ert-pro-hero-control-label', text: proModeLabel });
    const controlToggle = createToggle(controlRow, 'Toggle Pro Mode');
    heroContent.createDiv({
        cls: ERT_CLASSES.FIELD_NOTE,
        text: 'Turn off to preview Core mode'
    });

    const detailsSection = heroContent.createDiv({ cls: 'ert-pro-hero-details' });
    detailsSection.createEl('h5', { text: "What's included", cls: 'ert-kicker' });
    const detailsList = detailsSection.createEl('ul', { cls: 'ert-pro-hero-list' });
    [
        'Inquiry View — cross-scene diagnostics',
        'Gossamer — momentum tracking',
        'Beat System Designer — custom frameworks',
        'Publishing — advanced templates and exports',
        'Author Progress Report — shareable visuals'
    ].forEach((item) => detailsList.createEl('li', { text: item }));
    detailsSection.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-pro-hero-details-note`,
        text: 'Pro will become a subscription that unlocks advanced tools across Radial Timeline. During Early Access, everything remains available.'
    });

    heroContent.createDiv({
        cls: 'ert-pro-hero-final',
        text: 'Pro is where the system comes together.'
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
    plugin.registerDomEvent(controlToggle, 'change', async () => {
        await handleToggleChange(controlToggle.checked);
    });

    applyProState(entitlement.isProEnabled);
    toggleExpanded(false);

    return panel;
}
