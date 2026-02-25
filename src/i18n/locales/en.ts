/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * English translations (source of truth)
 * 
 * All keys MUST be defined here. Other locales can provide partial translations
 * and will fall back to English for missing keys.
 * 
 * Naming conventions:
 * - Use dot notation for hierarchy: settings.general.sourcePath.name
 * - 'name' = setting title, 'desc' = setting description
 * - 'heading' = section headings
 * - Use {{variable}} for dynamic content
 */

// Define the shape of translations (allows any string value)
export interface TranslationKeys {
    settings: {
        general: {
            sourcePath: {
                name: string;
                desc: string;
                placeholder: string;
            };
            /** @deprecated Kept for structural compat; not rendered in UI. */
            showTitle: {
                name: string;
                desc: string;
            };
        };
        pov: {
            heading: string;
            global: {
                name: string;
                desc: string;
            };
            yamlOverrides: {
                name: string;
                desc: string;
            };
            modes: {
                off: string;
                first: string;
                second: string;
                third: string;
                omni: string;
                objective: string;
            };
            preview: {
                heading: string;
                examples: {
                    sceneFirst: string;
                    sceneThird: string;
                    sceneSecond: string;
                    sceneOmni: string;
                    sceneObjective: string;
                    countTwoThird: string;
                    countThreeThird: string;
                    countFourThird: string;
                    countTwoFirstNumeric: string;
                    countAllFirst: string;
                };
            };
        };
        configuration: {
            heading: string;
            aiOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
            };
            manuscriptOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
            };
            outlineOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
            };
            synopsisMaxLines: {
                name: string;
                desc: string;
                placeholder: string;
                error: string;
            };
            rippleRename: {
                name: string;
                desc: string;
            };
            autoExpand: {
                name: string;
                desc: string;
            };
            readability: {
                name: string;
                desc: string;
                normal: string;
                large: string;
            };
            showEstimate: {
                name: string;
                desc: string;
            };
            debounce: {
                name: string;
                desc: string;
                placeholder: string;
                error: string;
            };
            resetSubplotColors: {
                name: string;
                desc: string;
                button: string;
                clearedNotice: string;
                nothingToReset: string;
            };
        };
        ai: {
            heading: string;
            enable: {
                name: string;
                desc: string;
            };
        };
        publication: {
            heading: string;
        };
        chronologue: {
            heading: string;
        };
        storyBeats: {
            heading: string;
        };
        colors: {
            heading: string;
        };
    };
    timeline: {
        acts: {
            act1: string;
            act2: string;
            act3: string;
        };
        /** @deprecated Kept for structural compat; use DEFAULT_BOOK_TITLE instead. */
        workInProgress: string;
    };
    common: {
        yes: string;
        no: string;
        cancel: string;
        save: string;
        reset: string;
        enable: string;
        disable: string;
        loading: string;
        error: string;
        success: string;
    };
    notices: {
        settingsSaved: string;
        invalidInput: string;
    };
    manuscriptModal: {
        badge: string;
        title: string;
        description: string;
        heroLoading: string;
        heroNarrativeMeta: string;
        exportHeading: string;
        exportTypeManuscript: string;
        exportTypeOutline: string;
        proBadge: string;
        proRequired: string;
        proEnabled: string;
        manuscriptPresetHeading: string;
        presetScreenplay: string;
        presetPodcast: string;
        presetNovel: string;
        presetNovelDesc: string;
        presetScreenplayDesc: string;
        presetPodcastDesc: string;
        outlineBeatSheetDesc: string;
        outlineEpisodeRundownDesc: string;
        outlineShootingScheduleDesc: string;
        outlineIndexCardsDesc: string;
        formatMarkdown: string;
        formatPdf: string;
        formatCsv: string;
        formatJson: string;
        outlinePresetHeading: string;
        outlineBeatSheet: string;
        outlineEpisodeRundown: string;
        outlineShootingSchedule: string;
        outlineIndexCardsCsv: string;
        outlineIndexCardsJson: string;
        tocHeading: string;
        tocPlain: string;
        tocMarkdown: string;
        tocNone: string;
        tocNote: string;
        orderHeading: string;
        orderNarrative: string;
        orderReverseNarrative: string;
        orderChronological: string;
        orderReverseChronological: string;
        orderNote: string;
        rangeHeading: string;
        rangeFirst: string;
        rangeLast: string;
        rangeAllLabel: string;
        rangeSingleLabel: string;
        rangeSelectedLabel: string;
        rangeCountLabel: string;
        rangeStatus: string;
        rangeLoading: string;
        rangeDecimalWarning: string;
        actionCreate: string;
        actionCancel: string;
        emptyNotice: string;
        templateNotConfigured: string;
        templateNotFound: string;
        templateFound: string;
        configureInSettings: string;
        rangeEmpty: string;
        loadError: string;
        wordCountHeading: string;
        wordCountToggle: string;
        wordCountNote: string;
        includeSynopsis: string;
        includeSynopsisNote: string;
    };
    planetary: {
        heading: string;
        enable: { name: string; desc: string; };
        active: { name: string; desc: string; };
        actions: { add: string; delete: string; };
        fields: {
            profileName: string;
            hoursPerDay: string;
            daysPerWeek: string;
            daysPerYear: string;
            epochOffset: string;
            epochLabel: string;
            monthNames: string;
            weekdayNames: string;
        };
        preview: {
            heading: string;
            invalid: string;
            empty: string;
        };
        modal: {
            title: string;
            activeProfile: string;
            datetimeLabel: string;
            datetimeDesc: string;
            now: string;
            convert: string;
            noProfile: string;
            disabled: string;
            invalid: string;
        };
        synopsis: { prefix: string; };
        tooltip: { altHint: string; };
    };
}

// ═══════════════════════════════════════════════════════════════════
// ENGLISH TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════
export const en: TranslationKeys = {
    settings: {
        general: {
            sourcePath: {
                name: 'Source path',
                desc: 'Specify the root folder containing your manuscript scene files.',
                placeholder: 'Example: Manuscript/Scenes',
            },
            /** @deprecated Legacy toggle — book title is now set via Book Profiles. */
            showTitle: {
                name: 'Legacy: source path title (deprecated)',
                desc: 'This setting is no longer used. Book title is managed via Book Profiles in General settings.',
            },
        },
        pov: {
            heading: 'Point of view',
            global: {
                name: 'Global POV',
                desc: 'Choose a default mode to apply. Scene level POV will override this global setting.',
            },
            yamlOverrides: {
                name: 'Scene level YAML overrides',
                desc: 'In scene frontmatter, you can use `POV:` first, second, third, omni, objective, or a number such as two, four, count, or all to designate more than one character is carrying the scene POV. Count values mark the first N names in `Character:` and use the Global POV mode to choose the marker.',
            },
            modes: {
                off: 'Legacy (first listed character, POV)',
                first: 'First-person voice (¹)',
                second: 'Second-person voice (You²)',
                third: 'Third-person limited (³)',
                omni: 'Omni narrator (Omni³)',
                objective: 'Objective — camera-eye narrator (Narrator°)',
            },
            preview: {
                heading: 'POV Examples',
                examples: {
                    sceneFirst: 'Scene YAML: POV: first | Character: [Alice]',
                    sceneThird: 'Scene YAML: POV: third | Character: [Bob]',
                    sceneSecond: 'Scene YAML: POV: second | Character: [Alice, Bob]',
                    sceneOmni: 'Scene YAML: POV: omni | Character: [Alice, Bob]',
                    sceneObjective: 'Scene YAML: POV: objective | Character: [Alice, Bob]',
                    countTwoThird: 'Global setting: POV = third | Scene YAML: POV: two | Character: [Alice, Bob]',
                    countThreeThird: 'Global setting: POV = third | Scene YAML: POV: three | Character: [Alice, Bob, Charlie]',
                    countFourThird: 'Global setting: POV = third | Scene YAML: POV: four | Character: [Alice, Bob, Charlie, Diana]',
                    countTwoFirstNumeric: 'Global setting: POV = first | Scene YAML: POV: 2 | Character: [Alice, Bob]',
                    countAllFirst: 'Global setting: POV = first | Scene YAML: POV: all | Character: [Alice, Bob, Charlie]',
                },
            },
        },
        configuration: {
            heading: 'Configuration',
            aiOutputFolder: {
                name: 'Logs & generated files output folder',
                desc: 'Folder where AI logs and local LLM reports are saved. Default: Radial Timeline/Logs.',
                placeholder: 'Radial Timeline/Logs',
            },
            manuscriptOutputFolder: {
                name: 'Export folder',
                desc: 'Folder where manuscript, outline, and cue card exports (Markdown, PDF, beat sheets, index cards) are saved. Default: Radial Timeline/Export.',
                placeholder: 'Radial Timeline/Export',
            },
            outlineOutputFolder: {
                name: 'Outline export folder (legacy)',
                desc: 'Legacy setting. Outline exports now use the shared Export folder. Default: Radial Timeline/Export.',
                placeholder: 'Radial Timeline/Export',
            },
            synopsisMaxLines: {
                name: 'Synopsis max words',
                desc: 'Maximum words for generated Synopsis. Hover display is synced automatically from this value.',
                placeholder: '30',
                error: 'Please enter a valid number between 10 and 300.',
            },
            rippleRename: {
                name: 'Manuscript ripple rename: normalize numeric prefixes after drag reorder.',
                desc: 'Renames scene and active-beat filenames only. Scenes stay integer (1, 2, 3). Beats become decimal minors (1.01, 1.02).',
            },
            autoExpand: {
                name: 'Auto-expand clipped scene titles',
                desc: 'When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.',
            },
            readability: {
                name: 'Readability size',
                desc: 'Choose a curated font sizing profile for select timeline text. Large may be helpful for low-res screens; Normal is recommended for standard and high-dpi displays.',
                normal: 'Normal',
                large: 'Large',
            },
            showEstimate: {
                name: 'Show estimated completion date',
                desc: 'Display a tick mark and label on the timeline for the estimated completion date. Tip: When you complete a scene, in addition to setting the Status to Complete, also set the Due date to the same day the scene was completed to improve the estimate.',
            },
            debounce: {
                name: 'Metadata refresh debounce (ms)',
                desc: 'Delay before refreshing the timeline after YAML frontmatter changes. Increase if your vault is large and updates feel too frequent.',
                placeholder: 'e.g., 10000',
                error: 'Please enter a non-negative number.',
            },
            resetSubplotColors: {
                name: 'Reset subplot color dominance',
                desc: 'Clear all saved subplot color dominance preferences for scenes that appear in multiple subplots. This resets to the default ordering (outermost to innermost rings based on subplot scene population).',
                button: 'Reset to default',
                clearedNotice: 'Cleared saved colors for {{count}} multi-subplot scene(s).',
                nothingToReset: 'No subplot dominance preferences to reset.',
            },
        },
        ai: {
            heading: 'AI LLM configuration',
            enable: {
                name: 'Enable AI LLM features',
                desc: 'Show command palette options and UI scene analysis colors and hover synopsis. When off, these visuals are hidden, but metadata remains unchanged.',
            },
        },
        publication: {
            heading: 'Publication & Progress',
        },
        chronologue: {
            heading: 'Chronologue Mode',
        },
        storyBeats: {
            heading: 'Story Beats & Gossamer',
        },
        colors: {
            heading: 'Colors',
        },
    },
    timeline: {
        acts: {
            act1: 'ACT I',
            act2: 'ACT II',
            act3: 'ACT III',
        },
        /** @deprecated No longer used — book title comes from Book Profiles. */
        workInProgress: 'Untitled Manuscript',
    },
    common: {
        yes: 'Yes',
        no: 'No',
        cancel: 'Cancel',
        save: 'Save',
        reset: 'Reset',
        enable: 'Enable',
        disable: 'Disable',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
    },
    notices: {
        settingsSaved: 'Settings saved.',
        invalidInput: 'Invalid input.',
    },
    manuscriptModal: {
        badge: 'Export',
        title: 'Manuscript export',
        description: 'Choose export presets for manuscripts or outlines. Use markdown-linked TOC for Obsidian-friendly navigation, or plain TOC for AI processing. PDF layouts are configured in Settings → Pro → Export Layouts.',
        heroLoading: 'Loading scenes...',
        heroNarrativeMeta: 'Drag handles to select range',
        exportHeading: 'Export type',
        exportTypeManuscript: 'Manuscript',
        exportTypeOutline: 'Outline',
        proBadge: 'Pro',
        proRequired: 'Pro export required for this option.',
        proEnabled: 'Pro export enabled (beta).',
        manuscriptPresetHeading: 'Manuscript preset',
        presetScreenplay: 'Screenplay (Pandoc template)',
        presetPodcast: 'Podcast script (Pandoc template)',
        presetNovel: 'Novel manuscript',
        presetNovelDesc: 'Traditional book manuscript format for prose scenes. Best for editing, sharing, and publishing drafts.',
        presetScreenplayDesc: 'Screenplay-style output for scenes already written with slug lines and dialogue blocks. PDF rendering uses a Pandoc layout.',
        presetPodcastDesc: 'Podcast script output with segment and speaker cues. PDF rendering uses a Pandoc layout.',
        outlineBeatSheetDesc: 'Save-the-Cat style beat list from scene metadata. Best for structure planning.',
        outlineEpisodeRundownDesc: 'Episode-style scene rundown with timing details. Best for production planning.',
        outlineShootingScheduleDesc: 'Production table with scene, location, timing, and subplot columns. Best for shoot scheduling.',
        outlineIndexCardsDesc: 'Structured scene data for CSV or JSON workflows. Best for external tools and automation.',
        formatMarkdown: 'Markdown',
        formatPdf: 'PDF',
        formatCsv: 'CSV',
        formatJson: 'JSON',
        outlinePresetHeading: 'Outline preset',
        outlineBeatSheet: 'Beat sheet',
        outlineEpisodeRundown: 'Episode rundown',
        outlineShootingSchedule: 'Shooting schedule list',
        outlineIndexCardsCsv: 'Index cards (CSV)',
        outlineIndexCardsJson: 'Index cards (JSON)',
        tocHeading: 'Table of contents',
        tocMarkdown: 'Markdown links (default)',
        tocPlain: 'Plain text',
        tocNone: 'No TOC',
        tocNote: 'Exactly one TOC format will be used. Markdown adds clickable scene anchors.',
        orderHeading: 'Scene ordering',
        orderNarrative: 'Narrative',
        orderReverseNarrative: 'Reverse',
        orderChronological: 'Chronological',
        orderReverseChronological: 'Reverse chrono',
        orderNote: 'Chronological follows When dates. Reverse options invert the ordering.',
        rangeHeading: 'Scene range',
        rangeFirst: 'First scene',
        rangeLast: 'Last scene',
        rangeAllLabel: 'All scenes',
        rangeSingleLabel: 'Single scene',
        rangeSelectedLabel: 'Scenes {{start}}–{{end}}',
        rangeCountLabel: '{{count}} scenes selected',
        rangeStatus: 'Scenes {{start}} – {{end}} of {{total}} ({{count}} selected)',
        rangeLoading: 'Fetching scenes…',
        rangeDecimalWarning: 'Some scene filenames use decimal prefixes. Canonical scene numbering is integer-only; use drag + Ripple Rename to normalize.',
        actionCreate: 'Manuscript generate',
        actionCancel: 'Cancel',
        emptyNotice: 'No scenes available to assemble.',
        templateNotConfigured: '⚠️ Template not configured. PDF will use Pandoc defaults (may not match screenplay/podcast format).',
        templateNotFound: '⚠️ Template file not found: {{path}}. Export may fail or use defaults.',
        templateFound: '✅ Template configured: {{path}}',
        configureInSettings: 'Configure in Settings → Pro',
        rangeEmpty: 'Selected range is empty.',
        loadError: 'Failed to load scenes.',
        wordCountHeading: 'Update metadata',
        wordCountToggle: 'Update Words in scene YAML',
        wordCountNote: 'Updates the Words field in each scene\'s frontmatter with accurate counts (excludes YAML and comments).',
        includeSynopsis: 'Include scene synopsis',
        includeSynopsisNote: 'Adds the Synopsis field from each scene\'s frontmatter to the outline.',
    },
    planetary: {
        heading: 'Planetary calendar system',
        enable: {
            name: 'Enable planetary conversions',
            desc: 'Turns on the converter modal, Chronologue Alt/Option tooltip, and synopsis line for the active profile.',
        },
        active: {
            name: 'Active profile',
            desc: 'Pick which planet or setting profile is used for conversions.',
        },
        actions: {
            add: 'Add profile',
            delete: 'Delete profile',
        },
        fields: {
            profileName: 'Profile name',
            hoursPerDay: 'Hours per day',
            daysPerWeek: 'Days per week',
            daysPerYear: 'Days per year',
            epochOffset: 'Epoch offset (Earth days)',
            epochLabel: 'Epoch label (optional)',
            monthNames: 'Month names (comma separated)',
            weekdayNames: 'Weekday names (comma separated)',
        },
        preview: {
            heading: 'Quick preview (Earth → local)',
            invalid: 'Enter valid values to see a conversion preview.',
            empty: 'Add a profile to start configuring planetary time.',
        },
        modal: {
            title: 'Planetary time converter',
            activeProfile: 'Active profile',
            datetimeLabel: 'Earth date & time',
            datetimeDesc: 'Pick a local date and time to convert.',
            now: 'Now',
            convert: 'Convert',
            noProfile: 'Add a planetary profile in Settings first.',
            disabled: 'Enable planetary conversions in settings to use this tool.',
            invalid: 'Enter a valid ISO datetime.',
        },
        synopsis: { prefix: 'Local: ' },
        tooltip: { altHint: 'Hold Alt/Option to show local time.' },
    },
};
