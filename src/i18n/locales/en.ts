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
            sceneOrdering: {
                name: string;
                desc: string;
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
                desc: 'Values you can use for `POV:` first, second, third, omni, objective, or a number such as two, four, count, or all to designate more than one character is carrying the global POV. If two, for example, then the first two characters in `Character:` YAML list will get a POV mark.',
            },
            modes: {
                off: 'Legacy (first listed character, "pov" superscript)',
                first: 'First-person voice (¹ marker on characters)',
                second: 'Second-person voice (You² label)',
                third: 'Third-person limited (³ marker on characters)',
                omni: 'Omni narrator (Omni³ label)',
                objective: 'Objective — camera-eye narrator (Narrator° label)',
            },
        },
        advanced: {
            heading: 'Advanced',
            autoExpand: {
                name: 'Auto-expand clipped scene titles',
                desc: 'When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.',
            },
            readability: {
                name: 'Readability size',
                desc: 'Choose a curated font sizing profile for timeline text. Large is tuned for low-res or low-vision viewing; Normal matches the current high-DPI layout.',
                normal: 'Normal',
                large: 'Large',
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
            sceneOrdering: {
                name: 'Scene ordering based on When date',
                desc: 'Coming someday maybe not sure yet: Sort scenes chronologically by When date instead of manuscript order for all modes.',
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
};
