/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Professional License Settings Section
 */

import { App, Setting, setIcon, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { ERT_CLASSES } from '../../ui/classes';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PATH SCANNING
// ═══════════════════════════════════════════════════════════════════════════════

interface ScanResult {
    pandocPath: string | null;
    latexPath: string | null;
    latexEngine: string | null;
}

/**
 * Scan the system for Pandoc and LaTeX installations.
 * Uses `which` on macOS/Linux. Falls back gracefully on failure.
 */
async function scanSystemPaths(): Promise<ScanResult> {
    const { execFile } = await import('child_process');
    const result: ScanResult = { pandocPath: null, latexPath: null, latexEngine: null };

    const whichCmd = process.platform === 'win32' ? 'where' : 'which';

    // Scan for pandoc
    await new Promise<void>((resolve) => {
        execFile(whichCmd, ['pandoc'], { timeout: 5000 }, (error, stdout) => {
            if (!error && stdout && stdout.trim()) {
                result.pandocPath = stdout.trim().split('\n')[0];
            }
            resolve();
        });
    });

    // Scan for LaTeX engines (prefer xelatex > pdflatex > lualatex)
    for (const engine of ['xelatex', 'pdflatex', 'lualatex']) {
        if (result.latexPath) break;
        await new Promise<void>((resolve) => {
            execFile(whichCmd, [engine], { timeout: 5000 }, (error, stdout) => {
                if (!error && stdout && stdout.trim()) {
                    result.latexPath = stdout.trim().split('\n')[0];
                    result.latexEngine = engine;
                }
                resolve();
            });
        });
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAMPLE TEMPLATE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate sample scene files and LaTeX templates in the user's vault.
 * Skips files that already exist. Auto-configures template paths in settings.
 */
async function generateSampleTemplates(plugin: RadialTimelinePlugin): Promise<string[]> {
    const vault = plugin.app.vault;
    const baseFolder = plugin.settings.manuscriptOutputFolder || 'Radial Timeline/Export';
    const templatesFolder = normalizePath(`${baseFolder}/Templates`);

    // Ensure folders exist
    for (const folder of [baseFolder, templatesFolder]) {
        const normalized = normalizePath(folder);
        if (!vault.getAbstractFileByPath(normalized)) {
            await vault.createFolder(normalized);
        }
    }

    const createdFiles: string[] = [];

    // ── Sample Scene Files ──────────────────────────────────────────────────
    const sampleScenes: { name: string; content: string }[] = [
        {
            name: 'Sample Screenplay Scene.md',
            content: [
                '---',
                'Class: Scene',
                'Act: 1',
                'When: 2024-01-15',
                'Duration: 1 hour',
                'Synopsis: Jane meets detective Mike at a coffee shop to discuss the Henderson case.',
                'Subplot: Main Plot',
                'Character: JANE, MIKE',
                'POV: Jane',
                'Words:',
                'Runtime: 3:00',
                'Status: Working',
                '---',
                '',
                'INT. COFFEE SHOP - DAY',
                '',
                'A bustling downtown coffee shop. Morning rush hour. JANE (30s, determined) sits at a corner table with her laptop open.',
                '',
                'MIKE (40s, world-weary detective) enters, scans the room, spots her.',
                '',
                '                    MIKE',
                '          You Jane?',
                '',
                '                    JANE',
                '              (without looking up)',
                '          Depends who\'s asking.',
                '',
                'Mike slides into the seat across from her.',
                '',
                '                    MIKE',
                '          I\'m the guy with answers.',
                '',
                '                    JANE',
                '          Then you\'re exactly who I need.',
                '',
                'She closes the laptop, meets his eyes for the first time.',
                '',
                '                    JANE (CONT\'D)',
                '          Tell me about the Henderson case.',
                '',
                'Mike\'s expression darkens.',
                '',
                '                    MIKE',
                '          That\'s not a door you want to open.',
                '',
                '                    JANE',
                '              (leaning forward)',
                '          Try me.',
                '',
                'BEAT. Mike glances around, lowers his voice.',
                '',
                '                    MIKE',
                '          Alright. But not here.',
                '',
                'He stands, drops a business card on the table.',
                '',
                '                    MIKE (CONT\'D)',
                '          Warehouse district. Pier 9. Tomorrow',
                '          at midnight.',
                '',
                'He walks out. Jane picks up the card, studies it.',
                '',
                'FADE OUT.'
            ].join('\n')
        },
        {
            name: 'Sample Podcast Scene.md',
            content: [
                '---',
                'Class: Scene',
                'Act: 1',
                'When: 2024-01-15',
                'Duration: 1 hour',
                'Synopsis: Introduction and interview with Dr. Sarah Chen about AI and creativity.',
                'Subplot: Main Plot',
                'Character: HOST, GUEST',
                'POV:',
                'Words:',
                'Runtime: 8:00',
                'Status: Working',
                '---',
                '',
                '[SEGMENT: INTRODUCTION - 0:00]',
                '',
                'HOST: Welcome back to The Deep Dive, where we explore the stories behind the headlines. I\'m your host, Alex Rivera.',
                '',
                '[SFX: Theme music fades]',
                '',
                'HOST: Today we\'re talking about the rise of artificial intelligence in creative industries. With me is Dr. Sarah Chen, author of "The Algorithmic Muse."',
                '',
                'GUEST: Thanks for having me, Alex.',
                '',
                'HOST: So, Sarah, let\'s start with the big question everyone\'s asking — can AI really be creative?',
                '',
                'GUEST: That\'s the million-dollar question, isn\'t it? But I think we\'re asking it wrong.',
                '',
                'HOST: How so?',
                '',
                'GUEST: Instead of asking "can AI be creative," we should ask "what kind of creativity are we talking about?"',
                '',
                '[TIMING: 2:30]',
                '',
                '[SEGMENT: MAIN DISCUSSION - 2:30]',
                '',
                'HOST: Walk us through that distinction.',
                '',
                'GUEST: Well, there\'s creativity as originality — making something genuinely new. And then there\'s creativity as craft — executing an idea with skill. AI excels at the second, but the first? That\'s still very much a human domain.',
                '',
                'HOST: Give us an example.',
                '',
                'GUEST: An AI can generate a sonnet in seconds. Technically perfect. But ask it to capture the feeling of watching your child leave for college? That emotional truth — that\'s where humans still reign supreme.',
                '',
                '[TIMING: 5:00]',
                '',
                '[SEGMENT: CLOSING - 5:00]',
                '',
                'HOST: We\'re almost out of time, but I have to ask — what keeps you up at night about AI and creativity?',
                '',
                'GUEST: That we\'ll mistake efficiency for artistry. That we\'ll prioritize the quick over the meaningful.',
                '',
                'HOST: A perfect note to end on. Dr. Sarah Chen, thank you.',
                '',
                'GUEST: Thank you, Alex.',
                '',
                '[SFX: Theme music]',
                '',
                'HOST: That\'s it for this episode. Join us next week when we explore the ethics of synthetic media. Until then, keep diving deep.',
                '',
                '[END]'
            ].join('\n')
        },
        {
            name: 'Sample Novel Scene.md',
            content: [
                '---',
                'Class: Scene',
                'Act: 1',
                'When: 2024-01-15',
                'Duration: 1 hour',
                'Synopsis: Emma discovers a hidden key inside a hollowed-out book in the old library.',
                'Subplot: Main Plot',
                'Character: Emma, Thomas',
                'POV: Emma',
                'Words:',
                'Runtime:',
                'Status: Working',
                '---',
                '',
                'The late afternoon sun filtered through the dusty windows of the old library, casting long shadows across the wooden floors. Emma ran her fingers along the spine of a leather-bound volume, feeling the familiar comfort of aged paper and binding glue.',
                '',
                '"You know you can\'t stay here forever," Thomas said from the doorway.',
                '',
                'She didn\'t turn around. "Watch me."',
                '',
                'He walked closer, his footsteps echoing in the empty reading room. "The demolition crew arrives Monday. This place will be rubble by Wednesday."',
                '',
                '"Then I have until Monday." Emma pulled the book from the shelf, opened it to reveal hollowed-out pages. Inside: a small brass key.',
                '',
                'Thomas leaned over her shoulder. "What is that?"',
                '',
                '"The reason they want this building torn down." She held the key up to the light, watching it glint. "The reason my grandfather died."',
                '',
                '"Emma—"',
                '',
                '"Don\'t." She closed the book, tucked it under her arm. "Don\'t tell me to let it go. Don\'t tell me it\'s not worth it."',
                '',
                'Thomas studied her face: the determined set of her jaw, the fire in her eyes that had been absent for so long. He sighed.',
                '',
                '"What do you need me to do?"',
                '',
                'She smiled for the first time in weeks. "Help me find what this key opens."',
                '',
                'Outside, the shadows grew longer. Somewhere in the building, old floorboards creaked. Emma and Thomas didn\'t notice. They were already lost in the hunt, following a trail of clues that would lead them into the heart of a decades-old conspiracy.',
                '',
                'The library held its secrets close, but not for much longer.'
            ].join('\n')
        }
    ];

    // ── LaTeX Templates ─────────────────────────────────────────────────────
    const latexTemplates: { name: string; content: string }[] = [
        {
            name: 'screenplay_template.tex',
            content: [
                '% Pandoc LaTeX Template — Screenplay Format',
                '% US industry standard: Courier 12pt, specific margins',
                '\\documentclass[12pt,letterpaper]{article}',
                '',
                '\\usepackage[top=1in,bottom=1in,left=1.5in,right=1in]{geometry}',
                '\\usepackage{fontspec}',
                '\\usepackage{parskip}',
                '',
                '% Courier is the screenplay standard',
                '\\setmainfont{Courier New}[',
                '  BoldFont={Courier New Bold},',
                '  ItalicFont={Courier New Italic}',
                ']',
                '',
                '\\pagestyle{plain}',
                '\\setlength{\\parindent}{0pt}',
                '\\setlength{\\parskip}{12pt}',
                '',
                '% Disable hyphenation (screenplay convention)',
                '\\hyphenpenalty=10000',
                '\\exhyphenpenalty=10000',
                '',
                '\\begin{document}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        },
        {
            name: 'podcast_template.tex',
            content: [
                '% Pandoc LaTeX Template — Podcast Script Format',
                '% Clean sans-serif for audio production scripts',
                '\\documentclass[11pt,letterpaper]{article}',
                '',
                '\\usepackage[top=1in,bottom=1in,left=1in,right=1in]{geometry}',
                '\\usepackage{fontspec}',
                '\\usepackage{parskip}',
                '',
                '% Clean sans-serif for readability',
                '\\setmainfont{Helvetica Neue}[',
                '  BoldFont={Helvetica Neue Bold},',
                '  ItalicFont={Helvetica Neue Italic}',
                ']',
                '',
                '\\pagestyle{plain}',
                '\\setlength{\\parindent}{0pt}',
                '\\setlength{\\parskip}{8pt}',
                '',
                '\\begin{document}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        },
        {
            name: 'novel_template.tex',
            content: [
                '% Pandoc LaTeX Template — Novel Manuscript Format',
                '% Traditional publishing format: Times 12pt, double-spaced',
                '\\documentclass[12pt,letterpaper]{article}',
                '',
                '\\usepackage[top=1in,bottom=1in,left=1in,right=1in]{geometry}',
                '\\usepackage{fontspec}',
                '\\usepackage{setspace}',
                '',
                '% Times New Roman is the publishing standard',
                '\\setmainfont{Times New Roman}[',
                '  BoldFont={Times New Roman Bold},',
                '  ItalicFont={Times New Roman Italic}',
                ']',
                '',
                '% Double spacing (standard for manuscript submissions)',
                '\\doublespacing',
                '',
                '% First line indent',
                '\\setlength{\\parindent}{0.5in}',
                '\\setlength{\\parskip}{0pt}',
                '',
                '% Page numbers top right',
                '\\usepackage{fancyhdr}',
                '\\pagestyle{fancy}',
                '\\fancyhf{}',
                '\\fancyhead[R]{\\thepage}',
                '\\renewcommand{\\headrulewidth}{0pt}',
                '',
                '\\begin{document}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        }
    ];

    // Create all files (skip existing)
    for (const scene of sampleScenes) {
        const filePath = normalizePath(`${templatesFolder}/${scene.name}`);
        if (!vault.getAbstractFileByPath(filePath)) {
            await vault.create(filePath, scene.content);
            createdFiles.push(scene.name);
        }
    }

    for (const template of latexTemplates) {
        const filePath = normalizePath(`${templatesFolder}/${template.name}`);
        if (!vault.getAbstractFileByPath(filePath)) {
            await vault.create(filePath, template.content);
            createdFiles.push(template.name);
        }
    }

    // Auto-configure template paths in settings
    plugin.settings.pandocTemplates = {
        ...plugin.settings.pandocTemplates,
        screenplay: normalizePath(`${templatesFolder}/screenplay_template.tex`),
        podcast: normalizePath(`${templatesFolder}/podcast_template.tex`),
        novel: normalizePath(`${templatesFolder}/novel_template.tex`)
    };
    await plugin.saveSettings();

    return createdFiles;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN BETA CONFIGURATION
// Set to false when transitioning to paid licensing
// ═══════════════════════════════════════════════════════════════════════════════
const OPEN_BETA_ACTIVE = true;

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    renderHero?: (containerEl: HTMLElement) => void;
    onProToggle?: () => void;
}

/**
 * Check if a professional license key is valid
 */
export function isProfessionalLicenseValid(key: string | undefined): boolean {
    if (!key || key.trim().length === 0) {
        return false;
    }
    // TODO: Connect to license validation API when beta ends
    return key.trim().length >= 16;
}

/**
 * Check if the professional tier is active
 * During Open Beta, Pro features are enabled for everyone (unless dev toggle is off)
 */
export function isProfessionalActive(plugin: RadialTimelinePlugin): boolean {
    // Check dev toggle for testing (defaults to true if undefined)
    if (plugin.settings.devProActive === false) {
        return false;
    }

    // During Open Beta, everyone gets Pro access
    if (OPEN_BETA_ACTIVE) {
        return true;
    }
    return isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
}

/**
 * Check if we're in Open Beta mode
 */
export function isOpenBeta(): boolean {
    return OPEN_BETA_ACTIVE;
}

export function renderProfessionalSection({ plugin, containerEl, renderHero, onProToggle }: SectionParams): HTMLElement {
    const hasValidKey = isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
    const isActive = isProfessionalActive(plugin);

    // ─────────────────────────────────────────────────────────────────────────
    // ROOT CONTAINER (Pro Skin)
    // ─────────────────────────────────────────────────────────────────────────
    const section = containerEl.createDiv({ cls: ERT_CLASSES.STACK });

    // ─────────────────────────────────────────────────────────────────────────
    // HERO / HEADER
    // ─────────────────────────────────────────────────────────────────────────
    // Render external hero hook (if any)
    renderHero?.(section);

    // ─────────────────────────────────────────────────────────────────────────
    // HERO / HEADER (Legacy Layout Restored)
    // ─────────────────────────────────────────────────────────────────────────
    const hero = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}` });

    // Badge Row
    const badgeRow = hero.createDiv({ cls: ERT_CLASSES.INLINE });

    // Status Badge (Standardized Pill)
    const badge = badgeRow.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}` });

    const iconSpan = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(iconSpan, 'signature');

    badge.createSpan({
        cls: ERT_CLASSES.BADGE_PILL_TEXT,
        text: isActive ? 'PRO FEATURES ACTIVE' : 'PRO INACTIVE'
    });

    // Wiki Link Icon
    const wikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
        cls: 'ert-badgePill__rightIcon',
        attr: {
            'aria-label': 'Read more in the Wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(wikiLink, 'external-link');

    // Beta Badge
    if (OPEN_BETA_ACTIVE) {
        const betaBadge = badgeRow.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_NEUTRAL} ${ERT_CLASSES.BADGE_PILL_SM}`
        });
        betaBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'EARLY ACCESS BETA' });
    }

    // Toggle (Moved to Top Right)
    const toggleContainer = badgeRow.createDiv({ cls: `${ERT_CLASSES.SECTION_ACTIONS} ${ERT_CLASSES.CHIP}` });

    toggleContainer.createSpan({
        cls: `ert-toggle-label ${isActive ? ERT_CLASSES.IS_ACTIVE : ''}`,
        text: isActive ? 'Active' : 'Inactive'
    });

    const checkbox = toggleContainer.createEl('input', {
        type: 'checkbox',
        cls: 'ert-toggle-input'
    });
    checkbox.checked = plugin.settings.devProActive !== false;
    const rerender = () => {
        if (onProToggle) {
            onProToggle();
            return;
        }
        containerEl.empty();
        renderProfessionalSection({ app: plugin.app, plugin, containerEl, renderHero, onProToggle });
    };

    checkbox.onchange = async () => {
        plugin.settings.devProActive = checkbox.checked;
        await plugin.saveSettings();
        rerender();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CONTENT STACK
    // ─────────────────────────────────────────────────────────────────────────
    const addProRow = (setting: Setting) => setting;
    const lockPanel = (panel: HTMLElement) => {
        if (!isActive) {
            panel.addClass('ert-pro-locked');
        }
        return panel;
    };

    // Open Beta Banner
    if (OPEN_BETA_ACTIVE) {
        const betaPanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));

        const bannerHeader = betaPanel.createDiv({ cls: ERT_CLASSES.INLINE });
        const bannerIcon = bannerHeader.createSpan({ cls: 'ert-setting-heading-icon' });
        setIcon(bannerIcon, 'shell');
        bannerHeader.createEl('strong', { text: 'Thank you for supporting the future of Radial Timeline [RT].' });

        betaPanel.createEl('p', {
            cls: ERT_CLASSES.SECTION_DESC,
            text: 'Pro features are currently free during the Open Beta.'
        });

        const rewardBox = betaPanel.createDiv({ cls: [ERT_CLASSES.PREVIEW_FRAME, 'ert-previewFrame--flush'] });
        const p = rewardBox.createEl('p', { attr: { style: 'margin: 0; line-height: 1.5;' } });
        p.createEl('strong', { text: 'A new phase in development begins. ' });
        p.createSpan({ text: 'During this phase, bug fixes, stability, and workflow optimization are top priorities. Reproducible technical issues and clear usability problems are actively reviewed and addressed as part of iterative development. Your feedback helps shape what gets refined and improved next.' });

        const feedbackLink = betaPanel.createEl('a', {
            text: 'Share feedback →',
            href: 'https://radial-timeline.com/feedback',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    // License Key (Post-Beta)
    if (!OPEN_BETA_ACTIVE) {
        const licensePanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));
        const licenseSetting = addProRow(new Setting(licensePanel))
            .setName('License Key')
            .setDesc('Enter your Pro license key to unlock advanced features.')
            .addText(text => {
                text.setPlaceholder('XXXX-XXXX-XXXX-XXXX');
                text.setValue(plugin.settings.professionalLicenseKey || '');
                text.inputEl.addClass('ert-input--lg');
                text.inputEl.type = 'password';

                // Show/Hide Toggle
                const toggleVis = text.inputEl.parentElement?.createEl('button', {
                    cls: 'ert-clickable-icon clickable-icon', // SAFE: clickable-icon used for Obsidian icon button styling
                    attr: { type: 'button', 'aria-label': 'Show/hide license key' }
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
                    plugin.settings.professionalLicenseKey = value || undefined;
                    await plugin.saveSettings();
                    rerender();
                });
            });

        // "Get key" link
        const nameEl = licenseSetting.nameEl;
        nameEl.createEl('a', {
            text: ' Get key →',
            href: 'https://radial-timeline.com/signature',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PANDOC & EXPORT SETTINGS
    // ─────────────────────────────────────────────────────────────────────────
    const pandocPanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));
    const pandocHeading = addProRow(new Setting(pandocPanel))
        .setName('Export & Pandoc')
        .setDesc('Configure Pandoc binary paths and manuscript export templates for screenplay, podcast, and novel formats.')
        .setHeading();
    addHeadingIcon(pandocHeading, 'book-open-text');
    addWikiLink(pandocHeading, 'Settings#professional');
    applyErtHeaderLayout(pandocHeading);

    // Settings
    let pandocPathInputEl: HTMLInputElement | null = null;
    addProRow(new Setting(pandocPanel))
        .setName('Pandoc binary path')
        .setDesc('Optional: set a custom pandoc executable path. If blank, system PATH is used.')
        .addText(text => {
            text.inputEl.addClass('ert-input--xl');
            text.setPlaceholder('/usr/local/bin/pandoc');
            text.setValue(plugin.settings.pandocPath || '');
            pandocPathInputEl = text.inputEl;
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                const normalizedPath = value ? normalizePath(value) : '';
                plugin.settings.pandocPath = normalizedPath;
                await plugin.saveSettings();
            });
        });

    // Auto-detect Pandoc & LaTeX
    const scanSetting = addProRow(new Setting(pandocPanel))
        .setName('Auto-detect Pandoc & LaTeX')
        .setDesc('Scan your system for Pandoc and LaTeX installations.');
    scanSetting.addButton(button => {
        button.setButtonText('Scan');
        button.onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Scanning…');
            try {
                const scan = await scanSystemPaths();
                const msgs: string[] = [];

                if (scan.pandocPath) {
                    msgs.push(`✓ Pandoc found at ${scan.pandocPath}`);
                    // Auto-fill path if currently empty
                    if (!plugin.settings.pandocPath) {
                        plugin.settings.pandocPath = scan.pandocPath;
                        await plugin.saveSettings();
                        if (pandocPathInputEl) {
                            pandocPathInputEl.value = scan.pandocPath;
                            pandocPathInputEl.addClass('ert-setting-input-success');
                            window.setTimeout(() => pandocPathInputEl?.removeClass('ert-setting-input-success'), 1200);
                        }
                    }
                } else {
                    msgs.push('⚠ Pandoc not found — install from pandoc.org');
                }

                if (scan.latexPath) {
                    msgs.push(`✓ LaTeX found (${scan.latexEngine})`);
                } else {
                    msgs.push('⚠ LaTeX not found — needed for PDF export');
                }

                scanSetting.setDesc(msgs.join(' · '));
                new Notice(msgs.join('\n'));

                // Revert description after 8 seconds
                window.setTimeout(() => {
                    scanSetting.setDesc('Scan your system for Pandoc and LaTeX installations.');
                }, 8000);
            } catch (e) {
                const msg = (e as Error).message || String(e);
                scanSetting.setDesc(`Error scanning: ${msg}`);
                window.setTimeout(() => {
                    scanSetting.setDesc('Scan your system for Pandoc and LaTeX installations.');
                }, 5000);
            } finally {
                button.setDisabled(false);
                button.setButtonText('Scan');
            }
        });
    });

    addProRow(new Setting(pandocPanel))
        .setName('Enable fallback Pandoc')
        .setDesc('Attempt a secondary bundled/portable pandoc path if the primary is missing.')
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.pandocEnableFallback);
            toggle.onChange(async (value) => {
                plugin.settings.pandocEnableFallback = value;
                await plugin.saveSettings();
            });
        });

    addProRow(new Setting(pandocPanel))
        .setName('Fallback Pandoc path')
        .setDesc('Optional path to a portable/bundled pandoc binary.')
        .addText(text => {
            text.inputEl.addClass('ert-input--xl');
            text.setPlaceholder('/path/to/pandoc');
            text.setValue(plugin.settings.pandocFallbackPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                const normalizedPath = value ? normalizePath(value) : '';
                plugin.settings.pandocFallbackPath = normalizedPath;
                await plugin.saveSettings();
            });
        });

    // Templates Subsection
    const templateSubSection = pandocPanel.createDiv({
        cls: `${ERT_CLASSES.SECTION} ${ERT_CLASSES.SECTION_TIGHT}`
    });
    templateSubSection.createEl('h5', { text: 'Pandoc Templates (Optional)', cls: ERT_CLASSES.SECTION_TITLE });

    const templates = plugin.settings.pandocTemplates || {};

    const addTemplateSetting = (name: string, key: keyof typeof templates, placeholder: string) => {
        addProRow(new Setting(templateSubSection))
            .setName(name)
            .addText(text => {
                text.inputEl.addClass('ert-input--xl');
                text.setPlaceholder(placeholder);
                text.setValue(templates[key] || '');
                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    plugin.settings.pandocTemplates = {
                        ...plugin.settings.pandocTemplates,
                        [key]: text.getValue().trim()
                    };
                    await plugin.saveSettings();
                });
            });
    };

    addTemplateSetting('Screenplay', 'screenplay', 'vault/path/to/screenplay_template.tex');
    addTemplateSetting('Podcast Script', 'podcast', 'vault/path/to/podcast_template.tex');
    addTemplateSetting('Novel Manuscript', 'novel', 'vault/path/to/novel_template.tex');

    // Generate sample templates
    addProRow(new Setting(templateSubSection))
        .setName('Generate sample templates')
        .setDesc('Creates sample screenplay, podcast, and novel scene files plus LaTeX templates in your vault. Auto-configures template paths.')
        .addButton(button => {
            button.setButtonText('Generate Samples');
            button.setCta();
            button.onClick(async () => {
                button.setDisabled(true);
                button.setButtonText('Generating…');
                try {
                    const created = await generateSampleTemplates(plugin);
                    if (created.length > 0) {
                        new Notice(`Created ${created.length} sample files in Export/Templates. Template paths configured.`);
                    } else {
                        new Notice('All sample files already exist. Template paths updated.');
                    }
                    // Re-render to reflect updated template paths
                    rerender();
                } catch (e) {
                    const msg = (e as Error).message || String(e);
                    new Notice(`Error generating samples: ${msg}`);
                    button.setDisabled(false);
                    button.setButtonText('Generate Samples');
                }
            });
        });

    return section;
}
