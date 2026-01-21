import { App, Component, MarkdownRenderer } from 'obsidian';

declare const EMBEDDED_README_CONTENT: string;

export function renderReadmeSection(params: {
    app: App;
    containerEl: HTMLElement;
    setComponentRef: (component: Component | null) => void;
}): void {
    const { app, containerEl, setComponentRef } = params;

    containerEl.createEl('hr', { cls: 'ert-settings-separator' });
    const readmeContainer = containerEl.createDiv({ cls: 'rt-manuscript-readme-container' });
    const readmeMarkdown = typeof EMBEDDED_README_CONTENT !== 'undefined'
        ? EMBEDDED_README_CONTENT
        : 'README content could not be loaded. Please ensure the plugin was built correctly or view the README.md file directly.';

    const ytThumbRe = /!\[[^\]]*\]\((https?:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]+)\/[^)]+)\)/gi;
    const externalImgRe = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi;
    const safeReadme = readmeMarkdown
        .replace(ytThumbRe, (_m, _url, vid) => `[Watch on YouTube](https://youtu.be/${vid})`)
        .replace(externalImgRe, (_m, alt, url) => `[${alt || 'Open link'}](${url})`);

    const component = new Component();
    setComponentRef(component);
    MarkdownRenderer.render(
        app,
        safeReadme,
        readmeContainer,
        '',
        component
    );
}

