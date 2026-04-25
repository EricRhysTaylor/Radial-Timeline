export const NONLINEAR_DEMO_DEFAULT_START_DATE = '2085-03-30';
export const NONLINEAR_DEMO_ACT_COUNT = 5;
export const NONLINEAR_DEMO_SCENE_COUNT = 20;

export type DemoSubplotKey = 'A' | 'B' | 'C';

export interface DemoSceneSpec {
    sceneNumber: number;
    act: number;
    title: string;
    when: string;
    durationMinutes: number;
    subplot: DemoSubplotKey;
    subplotLabel: string;
    characters: string[];
}

export interface DemoBeatAnchorSpec {
    beatName: string;
    sceneNumber: number;
}

export interface NonlinearDemoProjectPlan {
    startDate: string;
    cast: string[];
    subplotLegend: Array<{ key: DemoSubplotKey; label: string }>;
    scenes: DemoSceneSpec[];
    instructionNote: {
        filename: string;
        content: string;
    };
    builtinBeatSystemName: 'Save The Cat';
    builtinBeatAnchors: DemoBeatAnchorSpec[];
}

const DEMO_SUBPLOT_LEGEND: Array<{ key: DemoSubplotKey; label: string }> = [
    { key: 'A', label: 'Objective' },
    { key: 'B', label: 'Relationship' },
    { key: 'C', label: 'Hidden Pressure' },
];

const DEMO_CAST = ['Kael', 'Mira', 'Jonas', 'Ryn', 'Unit-7'];

const DEMO_SCENE_TITLES = [
    'After the Smoke',
    'Trust Me',
    'A Simple Assignment',
    'The Empty Seat',
    'Not the Whole Truth',
    'Too Late to Turn Back',
    'What She Missed',
    'Before Anyone Notices',
    'Terms of Repair',
    'The Version He Heard',
    'As If It Was Nothing',
    'The Unsent Copy',
    'No One Said Morning',
    'Where the Damage Starts',
    'Borrowed Light',
    "This Wasn't the First Time",
    'The Second Promise',
    'Until It Makes Sense',
    'What It Cost',
    'After',
] as const;

const DEMO_SUBPLOT_SEQUENCE: DemoSubplotKey[] = [
    'A', 'B', 'C', 'A',
    'C', 'B', 'A', 'B',
    'C', 'A', 'B', 'C',
    'A', 'C', 'B', 'A',
    'B', 'C', 'A', 'B',
];

const DEMO_CHARACTER_ASSIGNMENTS: string[][] = [
    ['Kael', 'Jonas'],
    ['Kael', 'Mira'],
    ['Kael', 'Unit-7'],
    ['Mira', 'Ryn'],
    ['Kael', 'Jonas'],
    ['Kael', 'Ryn'],
    ['Jonas', 'Mira'],
    ['Kael', 'Unit-7'],
    ['Mira', 'Ryn'],
    ['Kael', 'Jonas'],
    ['Kael', 'Unit-7'],
    ['Mira', 'Jonas'],
    ['Kael', 'Ryn'],
    ['Kael', 'Unit-7'],
    ['Jonas', 'Mira'],
    ['Kael', 'Ryn'],
    ['Kael', 'Mira'],
    ['Jonas', 'Unit-7'],
    ['Kael', 'Ryn'],
    ['Kael', 'Mira', 'Jonas'],
];

// Narrative scene -> chronological slot (1-based). This is intentional:
// scene 1 lands after scene 3, scene 5 lands before scene 4, etc.
const DEMO_CHRONOLOGY_SLOT_ORDER = [
    2, 3, 1, 5, 4,
    7, 9, 6, 10, 8,
    12, 11, 14, 13, 16,
    15, 17, 19, 18, 20,
];

const DEMO_SLOT_DURATIONS = [
    4, 8, 3, 7, 4,
    8, 5, 9, 4, 8,
    5, 9, 6, 10, 5,
    9, 4, 8, 3, 7,
];

const SAVE_THE_CAT_SCENE_NUMBERS = [
    1, 2, 2, 3, 4,
    5, 6, 9, 10, 14,
    16, 16, 17, 19, 20,
];

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    if ([4, 6, 9, 11].includes(month)) return 30;
    return 31;
}

export function isValidIsoDateOnly(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12) return false;
    return day >= 1 && day <= daysInMonth(year, month);
}

function addDaysIso(startDate: string, dayOffset: number): string {
    const [yearRaw, monthRaw, dayRaw] = startDate.split('-').map((part) => Number(part));
    const date = new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw + dayOffset));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildChronologySlots(startDate: string): Array<{ when: string; durationMinutes: number }> {
    return Array.from({ length: NONLINEAR_DEMO_SCENE_COUNT }, (_, index) => {
        const dayOffset = Math.floor(index / 2);
        const time = index % 2 === 0 ? '07:00' : '18:00';
        const when = `${addDaysIso(startDate, dayOffset)} ${time}`;
        return {
            when,
            durationMinutes: DEMO_SLOT_DURATIONS[index],
        };
    });
}

function buildAct(sceneNumber: number): number {
    return Math.floor((sceneNumber - 1) / 4) + 1;
}

function buildInstructionNote(): { filename: string; content: string } {
    return {
        filename: 'START HERE - Nonlinear Example.md',
        content: [
            '# Why this demo is "nonlinear"',
            '',
            'The 20 scenes are numbered 1–20 in the order a reader would encounter them — that is the **narrative** order.',
            '',
            'But the dates in each scene\'s `When` field are deliberately scrambled so events do not happen in scene-number order. For example, scene 1 happens *after* scene 3 in story-time, and scene 5 happens *before* scene 4. That is the **chronological** order.',
            '',
            'A linear story would show the same sequence either way. This one does not — that is the point.',
            '',
            '## See it for yourself',
            '',
            '1. Open the **Timeline** view. Scenes appear in narrative order (1, 2, 3, …).',
            '2. Switch to **Chronologue** view. Scenes re-arrange by their `When` date.',
            '3. Compare the two — the gaps and jumps are the nonlinear structure.',
            '',
            '## Thread legend',
            '',
            '- **A** — Objective',
            '- **B** — Relationship',
            '- **C** — Hidden Pressure',
            '',
            '## Save The Cat beats',
            '',
            'Beat anchors are placed on representative scenes so you can see how a beat system overlays a narrative. Open the Beat Workspace in Settings to inspect them.',
        ].join('\n'),
    };
}

export function buildNonlinearDemoProjectPlan(
    startDate = NONLINEAR_DEMO_DEFAULT_START_DATE
): NonlinearDemoProjectPlan {
    const normalizedStartDate = startDate.trim() || NONLINEAR_DEMO_DEFAULT_START_DATE;
    if (!isValidIsoDateOnly(normalizedStartDate)) {
        throw new Error(`Invalid demo start date: ${startDate}`);
    }

    const slots = buildChronologySlots(normalizedStartDate);
    const scenes = Array.from({ length: NONLINEAR_DEMO_SCENE_COUNT }, (_, index) => {
        const sceneNumber = index + 1;
        const slot = slots[DEMO_CHRONOLOGY_SLOT_ORDER[index] - 1];
        const subplot = DEMO_SUBPLOT_SEQUENCE[index];
        const subplotMeta = DEMO_SUBPLOT_LEGEND.find((entry) => entry.key === subplot) ?? DEMO_SUBPLOT_LEGEND[0];

        return {
            sceneNumber,
            act: buildAct(sceneNumber),
            title: DEMO_SCENE_TITLES[index],
            when: slot.when,
            durationMinutes: slot.durationMinutes,
            subplot,
            subplotLabel: subplotMeta.label,
            characters: [...DEMO_CHARACTER_ASSIGNMENTS[index]],
        };
    });

    return {
        startDate: normalizedStartDate,
        cast: [...DEMO_CAST],
        subplotLegend: DEMO_SUBPLOT_LEGEND.map((entry) => ({ ...entry })),
        scenes,
        instructionNote: buildInstructionNote(),
        builtinBeatSystemName: 'Save The Cat',
        builtinBeatAnchors: [
            'Opening Image',
            'Theme Stated',
            'Setup',
            'Catalyst',
            'Debate',
            'Break into Two',
            'B Story',
            'Fun and Games',
            'Midpoint',
            'Bad Guys Close In',
            'All Is Lost',
            'Dark Night of the Soul',
            'Break into Three',
            'Finale',
            'Final Image',
        ].map((beatName, index) => ({
            beatName,
            sceneNumber: SAVE_THE_CAT_SCENE_NUMBERS[index],
        })),
    };
}
