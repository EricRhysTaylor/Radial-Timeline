import type { App } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { ERT_CLASSES } from '../../ui/classes';
import { isProActive } from '../proEntitlement';
import { renderProEntitlementPanel } from './ProEntitlementPanel';
import { renderProFeaturePanels } from './ProFeaturePanels';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    renderHero?: (containerEl: HTMLElement) => void;
    onProToggle?: () => void;
}

export { isProLicenseKeyValid } from '../proEntitlement';

export function renderProfessionalSection({
    app,
    plugin,
    containerEl,
    renderHero,
    onProToggle
}: SectionParams): HTMLElement {
    const section = containerEl.createDiv({ cls: ERT_CLASSES.STACK });
    renderHero?.(section);
    renderProEntitlementPanel({
        app,
        plugin,
        containerEl: section,
        onEntitlementChanged: onProToggle
    });
    renderProFeaturePanels({
        app,
        plugin,
        containerEl: section
    });
    return section;
}
