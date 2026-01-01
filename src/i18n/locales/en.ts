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
        };
        advanced: {
            heading: string;
            aiOutputFolder: {
                name: string;
                desc: string;
                placeholder: string;
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
        title: string;
        description: string;
        heroLoading: string;
        heroNarrativeMeta: string;
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
        actionCreate: string;
        actionCancel: string;
        emptyNotice: string;
        rangeEmpty: string;
        loadError: string;
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
            showTitle: {
                name: 'Show source path as title',
                desc: 'Display the source folder name as the title of your work. When off, displays "Work in Progress" instead.',
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
                desc: 'Values you can use for `POV:` first, second, third, omni, objective, or a number such as two, four, count, or all to designate more than one character is carrying the scene POV. If two, for example, then the first two characters in `Character:` YAML list will get a POV mark for scene synopsis.',
            },
            modes: {
                off: 'Legacy (first listed character, POV)',
                first: 'First-person voice (¹)',
                second: 'Second-person voice (You²)',
                third: 'Third-person limited (³)',
                omni: 'Omni narrator (Omni³)',
                objective: 'Objective — camera-eye narrator (Narrator°)',
            },
        },
        advanced: {
            heading: 'Advanced',
            aiOutputFolder: {
                name: 'Logs & generated files output folder',
                desc: 'Folder where AI logs and generated files (manuscripts, local LLM reports) are saved. Uses your vault folder structure.',
                placeholder: 'AI',
            },
            autoExpand: {
                name: 'Auto-expand clipped scene titles',
                desc: 'When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.',
            },
            readability: {
                name: 'Readability size',
                desc: 'Choose a curated font sizing profile for timeline text. Large is tuned for low-res or low-vision viewing; Normal works for standard and high-dpi layouts.',
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
            heading: 'AI LLM for scene analysis',
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
        workInProgress: 'Work in Progress',
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
        title: 'Manuscript generate',
        description: 'Use markdown-linked TOC for Obsidian-friendly navigation, or plain TOC for AI processing. All orderings support custom ranges with the draggable selector.',
        heroLoading: 'Loading scenes...',
        heroNarrativeMeta: 'Drag handles to select range',
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
        actionCreate: 'Manuscript generate',
        actionCancel: 'Cancel',
        emptyNotice: 'No scenes available to assemble.',
        rangeEmpty: 'Selected range is empty.',
        loadError: 'Failed to load scenes.',
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
