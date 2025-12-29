import { Setting, setIcon } from 'obsidian';

/**
 * Adds a wiki link icon to a setting's name element.
 * @param setting The Obsidian Setting object
 * @param wikiPage The name of the wiki page (e.g., "AI-Analysis.md" or "Advanced-YAML.md")
 */
export function addWikiLink(setting: Setting, wikiPage: string): void {
    addWikiLinkToElement(setting.nameEl, wikiPage);
}

/**
 * Adds a wiki link icon to any HTMLElement.
 * @param el The target HTMLElement (usually a header or label)
 * @param wikiPage The name of the wiki page
 */
export function addWikiLinkToElement(el: HTMLElement, wikiPage: string): void {
    if (!el) return;

    // Remove extension if present to make the URL cleaner, though GitHub handles .md
    // GitHub Wiki URLs usually don't have .md for the page view, just the name without extension.
    // e.g. https://github.com/user/repo/wiki/Page-Name
    const pageName = wikiPage.replace(/\.md$/, '');
    
    const link = el.createEl('a', {
        href: `https://github.com/EricRhysTaylor/radial-timeline/wiki/${pageName}`,
        cls: 'rt-wiki-link',
        attr: {
            'aria-label': 'Read more in the Wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });

    // Add the diagonal arrow icon
    setIcon(link, 'external-link');
    
    // Styling handled by .rt-wiki-link in src/styles/settings.css
}

