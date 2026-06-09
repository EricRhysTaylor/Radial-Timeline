/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { normalizePath, setIcon, TFolder } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { BookDesignerModal } from '../modals/BookDesignerModal';
import { RT_LOGO_PATHS, RT_LOGO_VIEWBOX } from '../branding/rtLogo';
import { hasInquirySessionSidecarInVault } from '../inquiry/InquiryArtifactStore';
import {
    normalizeClassContribution,
    normalizeInquirySources
} from '../inquiry/services/InquiryCorpusService';
import { markBookManagerAutoloadHighlight } from '../settings/bookManagerAutoloadHighlight';
import type { BookProfile, InquiryClassConfig, InquirySourcesSettings } from '../types/settings';
import {
    DEFAULT_BOOK_TITLE,
    createBookId,
    deriveBookTitleFromSourcePath,
    getActiveBook,
    normalizeBookProfile
} from '../utils/books';

interface WelcomeScreenParams {
    container: HTMLElement;
    plugin: RadialTimelinePlugin;
    refreshTimeline: () => void;
}

const WELCOME_COPY = {
    intro: 'Radial Timeline turns long-form narratives into a single, navigable story map. Track scenes, subplots, characters, beats, and timelines across novels, sagas, memoirs, and other sustained fiction or nonfiction projects. Pick a starting point below.',
    cards: {
        website: {
            title: 'Visit the website',
            desc: 'Guides, walkthroughs, release notes, pricing, and the story behind Radial Timeline.',
            cta: 'Open Website'
        },
        sampleChecking: {
            title: 'Explore a sample vault',
            desc: 'Checking this vault for packaged Radial Timeline sample data before opening the download page.',
            cta: 'Checking vault...'
        },
        sampleGet: {
            title: 'Explore a sample vault',
            desc: 'Download a finished novel, Pride & Prejudice, fully mapped in the timeline with AI analysis already run. No API key needed to explore it.',
            cta: 'Get the sample vault'
        },
        sampleOpen: {
            title: 'Sample vault detected',
            desc: (name: string) => `This vault ships a ready-to-explore ${name}. Open it to drop straight into a finished story on the timeline.`,
            cta: 'Open the sample vault'
        },
        design: {
            title: 'Set Book Project',
            desc: 'Choose the manuscript folder that drives the timeline, exports, Inquiry scope, and Book Manager.',
            cta: 'Open Book Manager',
            secondary: '→ or open Book Designer'
        }
    },
    updateNote: 'Community features coming to RT and website later this year.'
} as const;

const WELCOME_URLS = {
    website: 'https://radialtimeline.com',
    sampleNewsletter: 'https://radialtimeline.com/resources/newsletter',
    wiki: 'https://github.com/EricRhysTaylor/radial-timeline/wiki',
    discussions: 'https://github.com/EricRhysTaylor/radial-timeline/discussions',
    issues: 'https://github.com/EricRhysTaylor/radial-timeline/issues',
    youtube: 'https://www.youtube.com/@RadialTimeline'
} as const;

const CARD_ICONS = {
    website: 'globe',
    sample: 'book-open',
    design: 'compass'
} as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

const openRadialTimelineSettings = (
    plugin: RadialTimelinePlugin,
    tab: 'core' | 'social' | 'inquiry' | 'publishing' | 'ai' | 'advanced' = 'core'
): void => {
    if (plugin.settingsTab) {
        plugin.settingsTab.setActiveTab(tab);
    }
    const setting = (plugin.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    if (!setting) return;
    setting.open();
    setting.openTabById('radial-timeline');
};

const appendWelcomeBackgroundLogo = (parent: HTMLElement): void => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttr('viewBox', `${RT_LOGO_VIEWBOX.x} ${RT_LOGO_VIEWBOX.y} ${RT_LOGO_VIEWBOX.width} ${RT_LOGO_VIEWBOX.height}`);
    svg.setAttr('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttr('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttr('id', 'rt-welcome-bg-logo-gradient');
    gradient.setAttr('x1', '0%');
    gradient.setAttr('y1', '0%');
    gradient.setAttr('x2', '0%');
    gradient.setAttr('y2', '100%');

    const start = document.createElementNS(SVG_NS, 'stop');
    start.setAttr('offset', '0%');
    start.setAttr('stop-color', '#ffffff');
    start.setAttr('stop-opacity', '0.01');

    const middle = document.createElementNS(SVG_NS, 'stop');
    middle.setAttr('offset', '50%');
    middle.setAttr('stop-color', '#ffffff');
    middle.setAttr('stop-opacity', '0.125');

    const end = document.createElementNS(SVG_NS, 'stop');
    end.setAttr('offset', '100%');
    end.setAttr('stop-color', '#ffffff');
    end.setAttr('stop-opacity', '0.01');

    gradient.append(start, middle, end);
    defs.append(gradient);
    svg.append(defs);

    RT_LOGO_PATHS.forEach((pathData) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttr('d', pathData);
        path.setAttr('fill', 'url(#rt-welcome-bg-logo-gradient)');
        svg.append(path);
    });

    parent.appendChild(svg);
};

interface CardRefs {
    root: HTMLElement;
    title: HTMLElement;
    desc: HTMLElement;
    cta: HTMLElement;
    /** Rebind the card's primary action — used after async sample-vault detection. */
    setActivate: (fn: () => void) => void;
}

interface CardSpec {
    hero?: boolean;
    icon: string;
    number: string;
    title: string;
    desc: string;
    ctaLabel: string;
    onActivate: () => void;
    secondaryLabel?: string;
    onSecondaryActivate?: () => void;
}

const buildCard = (parent: HTMLElement, plugin: RadialTimelinePlugin, spec: CardSpec): CardRefs => {
    const root = parent.createDiv({ cls: 'rt-welcome-card' });
    if (spec.hero) root.addClass('rt-welcome-card-hero');
    root.setAttr('role', 'button');
    root.setAttr('tabindex', '0');
    root.setAttr('data-card-number', spec.number);

    const bgIconEl = root.createDiv({ cls: 'rt-welcome-card-bg-icon' });
    setIcon(bgIconEl, spec.icon);

    const iconEl = root.createDiv({ cls: 'rt-welcome-card-icon' });
    setIcon(iconEl, spec.icon);

    const title = root.createDiv({ cls: 'rt-welcome-card-title', text: spec.title });
    const desc = root.createDiv({ cls: 'rt-welcome-card-desc' });
    desc.createDiv({ cls: 'rt-welcome-card-desc-text', text: spec.desc });
    if (spec.secondaryLabel && spec.onSecondaryActivate) {
        const secondaryRow = desc.createDiv({ cls: 'rt-welcome-card-secondary-row' });
        const secondary = secondaryRow.createEl('a', {
            cls: 'rt-welcome-card-secondary',
            href: '#',
            text: spec.secondaryLabel
        });
        plugin.registerDomEvent(secondary, 'click', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            spec.onSecondaryActivate?.();
        });
    }
    const cta = root.createDiv({ cls: 'rt-welcome-card-cta', text: spec.ctaLabel });

    // The whole card is the primary affordance; activate is rebindable so the
    // Sample Vault card can swap its action after async detection resolves.
    let activate = spec.onActivate;
    plugin.registerDomEvent(root, 'click', () => activate());
    plugin.registerDomEvent(root, 'keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            activate();
        }
    });

    return { root, title, desc, cta, setActivate: (fn) => { activate = fn; } };
};

interface SampleVaultConfig {
    displayName?: string;
    bookFolder?: string;
}

const SAMPLE_INQUIRY_CORE_CLASSES: InquiryClassConfig[] = [
    normalizeClassContribution({
        className: 'scene',
        enabled: true,
        bookScope: 'full',
        sagaScope: 'summary',
        referenceScope: 'excluded'
    }),
    normalizeClassContribution({
        className: 'outline',
        enabled: true,
        bookScope: 'full',
        sagaScope: 'full',
        referenceScope: 'excluded'
    })
];

const displayNameToBookTitle = (displayName: string | undefined, bookFolder: string | undefined): string => {
    const cleaned = (displayName || '').replace(/\s+Sample\s+Vault\s*$/i, '').trim();
    return cleaned || deriveBookTitleFromSourcePath(bookFolder) || DEFAULT_BOOK_TITLE;
};

/**
 * Reads a shipped sample vault's declarative manifest, if present. Discovery
 * follows docs/engineering/sample-vaults.md: scan markdown frontmatter for
 * `rt_sample_vault: true`. Returns the friendly name + book folder so the
 * Sample Vault card can open the right book. Absent manifest is a normal,
 * meaningful default (not every detected sample carries a config yet).
 */
const findSampleVaultConfig = (plugin: RadialTimelinePlugin): SampleVaultConfig | null => {
    const files = plugin.app.vault.getMarkdownFiles();
    for (const file of files) {
        const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm && fm.rt_sample_vault === true) {
            return {
                displayName: typeof fm.display_name === 'string' ? fm.display_name : undefined,
                bookFolder: typeof fm.book_folder === 'string' ? fm.book_folder : undefined
            };
        }
    }
    return null;
};

const inferBookFolderFromSceneNotes = (plugin: RadialTimelinePlugin): SampleVaultConfig | null => {
    const counts = new Map<string, number>();
    for (const file of plugin.app.vault.getMarkdownFiles()) {
        const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm || (fm.Class !== 'Scene' && fm.class !== 'Scene')) continue;
        const parts = normalizePath(file.path).split('/').filter(Boolean);
        if (parts.length < 2) continue;
        const root = parts[0];
        const abstract = plugin.app.vault.getAbstractFileByPath(root);
        if (!(abstract instanceof TFolder)) continue;
        counts.set(root, (counts.get(root) || 0) + 1);
    }

    let bestFolder = '';
    let bestCount = 0;
    counts.forEach((count, folder) => {
        if (count > bestCount || (count === bestCount && folder.localeCompare(bestFolder) < 0)) {
            bestFolder = folder;
            bestCount = count;
        }
    });

    if (!bestFolder || bestCount === 0) return null;
    return {
        displayName: deriveBookTitleFromSourcePath(bestFolder) || bestFolder,
        bookFolder: bestFolder
    };
};

const resolveSampleVaultConfig = (plugin: RadialTimelinePlugin): SampleVaultConfig | null => {
    return findSampleVaultConfig(plugin) || inferBookFolderFromSceneNotes(plugin);
};

const ensureSampleBookProject = async (
    plugin: RadialTimelinePlugin,
    config: SampleVaultConfig | null
): Promise<string | null> => {
    const books = plugin.settings.books || [];
    const bookFolder = config?.bookFolder?.trim();
    if (!bookFolder) return (getActiveBook(plugin.settings) ?? books[0])?.id ?? null;

    const normalizedBookFolder = normalizePath(bookFolder);
    const existing = books.find(b => normalizePath((b.sourceFolder || '').trim()) === normalizedBookFolder);
    if (existing) {
        return existing.id;
    }

    const profile = normalizeBookProfile({
        id: createBookId(),
        title: displayNameToBookTitle(config?.displayName, normalizedBookFolder),
        sourceFolder: normalizedBookFolder
    } as BookProfile);
    plugin.settings.books = [...books, profile];
    await plugin.saveSettings();
    return profile.id;
};

const mergeSampleInquirySources = (raw?: InquirySourcesSettings): InquirySourcesSettings => {
    const current = normalizeInquirySources(raw);
    const classScope = new Set(current.classScope || []);
    classScope.add('/');

    const classesByName = new Map((current.classes || []).map(config => [config.className, config]));
    for (const coreConfig of SAMPLE_INQUIRY_CORE_CLASSES) {
        const existing = classesByName.get(coreConfig.className);
        classesByName.set(
            coreConfig.className,
            existing
                ? normalizeClassContribution({
                    ...existing,
                    enabled: true,
                    bookScope: existing.bookScope === 'excluded' ? coreConfig.bookScope : existing.bookScope,
                    sagaScope: existing.sagaScope === 'excluded' ? coreConfig.sagaScope : existing.sagaScope,
                    referenceScope: 'excluded'
                })
                : coreConfig
        );
    }

    return {
        ...current,
        preset: current.preset || 'default',
        classScope: Array.from(classScope),
        classes: Array.from(classesByName.values()),
        lastScanAt: current.lastScanAt || new Date().toISOString()
    };
};

const ensureSampleInquirySources = async (plugin: RadialTimelinePlugin): Promise<void> => {
    const nextSources = mergeSampleInquirySources(plugin.settings.inquirySources);
    plugin.settings.inquirySources = nextSources;
    await plugin.saveSettings();
    plugin.getInquiryService().notifySourcesSettingsChanged();
};

/**
 * Opens the detected sample vault: select the book whose source folder matches
 * the manifest, registering it first if the vault shipped content but no book
 * is registered yet (fresh unzip + plugin install). If we can't determine a
 * target, deep-link the recipient into Book Manager. The full first-run import
 * state machine (markers, banners, Demo Mode) is documented in sample-vaults.md
 * and remains a separate effort.
 */
const openSampleVault = async (
    plugin: RadialTimelinePlugin,
    config: SampleVaultConfig | null,
    refreshTimeline: () => void
): Promise<void> => {
    const targetId = await ensureSampleBookProject(plugin, config);

    if (targetId) {
        await ensureSampleInquirySources(plugin);
        markBookManagerAutoloadHighlight(targetId);
        await plugin.setActiveBookId(targetId);
        refreshTimeline();
    } else {
        openRadialTimelineSettings(plugin, 'core');
    }
};

const openBookManagerFromWelcome = async (plugin: RadialTimelinePlugin): Promise<void> => {
    if (await hasInquirySessionSidecarInVault(plugin.app)) {
        const config = resolveSampleVaultConfig(plugin);
        const targetId = await ensureSampleBookProject(plugin, config);
        if (targetId) {
            await ensureSampleInquirySources(plugin);
            markBookManagerAutoloadHighlight(targetId);
            await plugin.setActiveBookId(targetId);
        }
    }
    openRadialTimelineSettings(plugin, 'core');
};

/**
 * The Inquiry sidecar (.radial-timeline/inquiry/sessions.json) is the clearest
 * signal that the vault already carries packaged Radial Timeline data. Check
 * for the file before showing the sample download/signup path; otherwise a
 * sample vault can look like it needs to be fetched again. Fire-and-forget;
 * mutating a detached container after the view closes is harmless.
 */
const hydrateSampleVaultCard = async (
    refs: CardRefs,
    plugin: RadialTimelinePlugin,
    refreshTimeline: () => void,
    onDetected: () => void
): Promise<void> => {
    const hasSidecar = await hasInquirySessionSidecarInVault(plugin.app);
    if (!hasSidecar) {
        refs.root.removeClass('rt-welcome-card-pending');
        refs.title.setText(WELCOME_COPY.cards.sampleGet.title);
        refs.desc.setText(WELCOME_COPY.cards.sampleGet.desc);
        refs.cta.setText(WELCOME_COPY.cards.sampleGet.cta);
        refs.setActivate(() => { window.open(WELCOME_URLS.sampleNewsletter, '_blank'); });
        return;
    }

    const config = resolveSampleVaultConfig(plugin);
    const name = displayNameToBookTitle(config?.displayName, config?.bookFolder).toLowerCase() === DEFAULT_BOOK_TITLE.toLowerCase()
        ? 'sample vault'
        : displayNameToBookTitle(config?.displayName, config?.bookFolder);

    refs.root.removeClass('rt-welcome-card-pending');
    refs.root.addClass('rt-welcome-card-detected');
    refs.title.setText(WELCOME_COPY.cards.sampleOpen.title);
    refs.desc.setText(WELCOME_COPY.cards.sampleOpen.desc(name));
    refs.cta.setText(WELCOME_COPY.cards.sampleOpen.cta);
    refs.setActivate(() => { void openSampleVault(plugin, config, refreshTimeline); });
    onDetected();
};

const applyWelcomeCardOrder = (
    ordered: Array<{ refs: CardRefs; number: string }>
): void => {
    ordered.forEach((entry, index) => {
        entry.refs.root.style.order = String(index + 1);
        entry.refs.root.setAttr('data-card-number', entry.number);
    });
};

export function renderWelcomeScreen({ container, plugin, refreshTimeline }: WelcomeScreenParams): void {
    container.addClass('rt-welcome-view');

    // Background RT logo - large and faint
    const bgIcon = container.createDiv({ cls: 'rt-welcome-bg-icon' });
    appendWelcomeBackgroundLogo(bgIcon);

    // Huge Welcome Title (custom styled block, not an H1)
    container.createDiv({ cls: 'rt-welcome-title', text: 'Welcome' });

    const body = container.createDiv({ cls: 'rt-welcome-body' });

    body.createEl('p', { cls: 'rt-welcome-paragraph', text: WELCOME_COPY.intro });

    // Three hero cards: Book Project · Sample Vault · Website.
    const cards = body.createDiv({ cls: 'rt-welcome-cards' });

    const designRefs = buildCard(cards, plugin, {
        number: '01',
        icon: CARD_ICONS.design,
        title: WELCOME_COPY.cards.design.title,
        desc: WELCOME_COPY.cards.design.desc,
        ctaLabel: WELCOME_COPY.cards.design.cta,
        onActivate: () => { void openBookManagerFromWelcome(plugin); },
        secondaryLabel: WELCOME_COPY.cards.design.secondary,
        onSecondaryActivate: () => { new BookDesignerModal(plugin.app, plugin).open(); }
    });

    const sampleRefs = buildCard(cards, plugin, {
        hero: true,
        number: '02',
        icon: CARD_ICONS.sample,
        title: WELCOME_COPY.cards.sampleChecking.title,
        desc: WELCOME_COPY.cards.sampleChecking.desc,
        ctaLabel: WELCOME_COPY.cards.sampleChecking.cta,
        onActivate: () => undefined
    });
    sampleRefs.root.addClass('rt-welcome-card-pending');

    const websiteRefs = buildCard(cards, plugin, {
        number: '03',
        icon: CARD_ICONS.website,
        title: WELCOME_COPY.cards.website.title,
        desc: WELCOME_COPY.cards.website.desc,
        ctaLabel: WELCOME_COPY.cards.website.cta,
        onActivate: () => { window.open(WELCOME_URLS.website, '_blank'); }
    });

    void hydrateSampleVaultCard(sampleRefs, plugin, refreshTimeline, () => {
        applyWelcomeCardOrder([
            { refs: sampleRefs, number: '01' },
            { refs: designRefs, number: '02' },
            { refs: websiteRefs, number: '03' }
        ]);
    });

    // Closing notes + odds and ends
    body.createEl('p', { cls: 'rt-welcome-paragraph rt-welcome-footnote', text: WELCOME_COPY.updateNote });

    // Backup Notice
    const backupNotice = body.createDiv({ cls: 'rt-welcome-backup-notice' });
    const iconContainer = backupNotice.createDiv({ cls: 'rt-welcome-backup-icon' });
    iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive-restore"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/></svg>`; // SAFE: innerHTML used for static trusted Lucide icon SVG (no user input)

    const backupText = backupNotice.createDiv({ cls: 'rt-welcome-backup-text' });
    const backupPara = backupText.createDiv();
    backupPara.createSpan({ text: 'Back up your Obsidian vault regularly to protect against data loss. Learn more at ' });
    backupPara.createEl('a', { text: 'Obsidian Backup Guide', href: 'https://help.obsidian.md/backup' });
    backupPara.createSpan({ text: '. Sync does not protect against all forms of data loss. Sync options include ' });
    backupPara.createEl('a', { text: 'Obsidian Sync', href: 'https://obsidian.md/sync' });
    backupPara.createSpan({ text: ' or ' });
    backupPara.createEl('a', { text: 'Obsidian Git', href: 'https://obsidian.md/plugins?id=obsidian-git' });

    const linksWrapper = body.createDiv({ cls: 'rt-welcome-links-wrapper' });
    const links = linksWrapper.createDiv({ cls: 'rt-welcome-links' });
    const makeLinkRow = (label: string, href: string) => {
        const row = links.createDiv({ cls: 'rt-welcome-link-row' });
        row.createEl('a', { href, text: label });
    };
    makeLinkRow('Wiki — full documentation', WELCOME_URLS.wiki);
    makeLinkRow('YouTube videos', WELCOME_URLS.youtube);
    makeLinkRow('Discussions', WELCOME_URLS.discussions);
    makeLinkRow('Bug reports / feature requests', WELCOME_URLS.issues);
}
