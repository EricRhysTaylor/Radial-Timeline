/*
 * One Spec, Three Echoes — contract alignment.
 *
 * For every bundled fiction layout, the same DesignedStyleSpec drives THREE
 * independent rendering paths:
 *
 *   1. Feature table       (getLayoutFeaturesFromSpec)
 *   2. Pictogram preview   (getPictogramRowsFromSpec)
 *   3. PDF assembler       (assembleManuscript + generateDesignedStyleTex)
 *
 * This test builds a single comprehensive synthetic manuscript fixture in
 * memory (parts, chapters, scenes-with-titles), then asserts that for each
 * spec all three paths describe the same thing.
 *
 * IMPORTANT — test is on the SEMANTIC contract, not on byte-equality. The
 * spec config drives intent; cosmetic copy on the feature row is allowed to
 * change so long as the meaningful tokens still appear. Tests must not pin
 * exact phrasing strings ("New page — centered scene number only") because
 * that overfits the test to the current copy and re-traps the agent into
 * fixing surface symptoms instead of the contract.
 */
import { describe, expect, it } from 'vitest';
import type { TFile, Vault } from 'obsidian';
import {
    BUNDLED_FICTION_IDS,
    BUNDLED_FICTION_SPECS,
    type BundledFictionId,
} from './bundledStyleSpecs';
import { generateDesignedStyleTex } from './designedStyle';
import {
    getLayoutFeaturesFromSpec,
    getPictogramRowsFromSpec,
} from './layoutVisuals';
import {
    assembleManuscript,
    type ManuscriptSceneHeadingMode,
    type SceneHeadingRenderMode,
} from '../utils/manuscript';

// ── Synthetic fixture ──────────────────────────────────────────────────
//
// Two acts × two chapters × two scenes — every scene has BOTH a numeric
// prefix AND a title (e.g. "3 The Garden"). The fixture exercises every
// structural axis a spec can enable.

interface SyntheticScene {
    file: TFile;
    body: string;
    /** Optional chapter marker emitted before this scene by the registrar layer. */
    chapterMarker?: { title: string };
    /** Optional Modern-Classic-style beat reference for act assignment. */
    beat?: string;
}

function makeFile(path: string, basename: string): TFile {
    return { path, basename } as TFile;
}

function buildSyntheticScenes(): SyntheticScene[] {
    return [
        // Act I → Chapter 1 → Scenes 1 + 2
        {
            file: makeFile('Scenes/1 Arrival.md', '1 Arrival'),
            body: '---\nClass: Scene\nBeat: Opening Image\n---\n\nFirst paragraph of scene one.',
            chapterMarker: { title: 'Boy with a Skull' },
            beat: 'Opening Image',
        },
        {
            file: makeFile('Scenes/2 The Garden.md', '2 The Garden'),
            body: '---\nClass: Scene\nBeat: Setup\n---\n\nSecond paragraph.',
            beat: 'Setup',
        },
        // Act I → Chapter 2 → Scenes 3 + 4
        {
            file: makeFile('Scenes/3 Confrontation.md', '3 Confrontation'),
            body: '---\nClass: Scene\nBeat: Midpoint\n---\n\nThird paragraph.',
            chapterMarker: { title: 'Everything of Possibility' },
            beat: 'Midpoint',
        },
        {
            file: makeFile('Scenes/4 Aftermath.md', '4 Aftermath'),
            body: '---\nClass: Scene\nBeat: All Is Lost\n---\n\nFourth paragraph.',
            beat: 'All Is Lost',
        },
        // Act II → Chapter 3 → Scenes 5 + 6
        {
            file: makeFile('Scenes/5 Departure.md', '5 Departure'),
            body: '---\nClass: Scene\nBeat: Break into 3\n---\n\nFifth paragraph.',
            chapterMarker: { title: 'New Horizons' },
            beat: 'Break into 3',
        },
        {
            file: makeFile('Scenes/6 Resolution.md', '6 Resolution'),
            body: '---\nClass: Scene\nBeat: Finale\n---\n\nSixth paragraph.',
            beat: 'Finale',
        },
    ];
}

function buildVault(scenes: SyntheticScene[]): Vault {
    const map: Record<string, string> = {};
    for (const s of scenes) map[s.file.path] = s.body;
    return {
        read: async (file: TFile) => map[file.path] || '',
    } as unknown as Vault;
}

function buildChapterMarkers(scenes: SyntheticScene[]): Record<string, Array<{
    sourcePath: string;
    sourceType: 'Scene';
    title: string;
    resolvedScenePath: string;
    resolvedTimelinePosition: number;
}>> {
    const markers: Record<string, Array<{
        sourcePath: string;
        sourceType: 'Scene';
        title: string;
        resolvedScenePath: string;
        resolvedTimelinePosition: number;
    }>> = {};
    let pos = 1;
    for (const s of scenes) {
        if (s.chapterMarker) {
            markers[s.file.path] = [{
                sourcePath: `Chapters/${s.chapterMarker.title}.md`,
                sourceType: 'Scene',
                title: s.chapterMarker.title,
                resolvedScenePath: s.file.path,
                resolvedTimelinePosition: pos,
            }];
        }
        pos += 1;
    }
    return markers;
}

// ── Per-spec assembly options derived from the spec ────────────────────
//
// Mirrors the runtime flow: when a layout has a DesignedStyleSpec, the
// spec's scene.headingMode is the floor, and dedicated-page openers force
// latex-section-starred. We don't reuse getManuscriptLayoutExportBehavior
// here so the test remains spec-driven (not coupled to per-id branches).

interface AssemblyContext {
    sceneHeadingMode: ManuscriptSceneHeadingMode;
    sceneHeadingRenderMode: SceneHeadingRenderMode;
    useModernClassicStructure: boolean;
    suppressChapterMarkers: boolean;
}

function assemblyContextForSpec(id: BundledFictionId): AssemblyContext {
    const spec = BUNDLED_FICTION_SPECS[id];
    const usesDedicatedOpener = spec.scene.opener === 'dedicated-page';
    const useModernClassicStructure = id === 'bundled-fiction-modern-classic';
    return {
        sceneHeadingMode: spec.scene.headingMode,
        sceneHeadingRenderMode: useModernClassicStructure
            ? 'markdown-h2'
            : (usesDedicatedOpener ? 'latex-section-starred' : 'markdown-h2'),
        useModernClassicStructure,
        suppressChapterMarkers: spec.chapters.mode === 'off' && !useModernClassicStructure,
    };
}

// ── Helpers ────────────────────────────────────────────────────────────

function findFeatureRow(rows: Array<{ label: string; value: string }>, label: string): { label: string; value: string } | undefined {
    return rows.find(r => r.label === label);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('one spec, three echoes — contract alignment', () => {
    it('every bundled fiction id has a spec', () => {
        for (const id of BUNDLED_FICTION_IDS) {
            expect(BUNDLED_FICTION_SPECS[id]).toBeDefined();
        }
    });

    it('Standard Manuscript: spec → feature/picto/assembler all describe scene-number on a new page', async () => {
        const id: BundledFictionId = 'bundled-fiction-classic-manuscript';
        const spec = BUNDLED_FICTION_SPECS[id];
        const ctx = assemblyContextForSpec(id);
        const scenes = buildSyntheticScenes();
        const vault = buildVault(scenes);
        const chapterMarkers = ctx.suppressChapterMarkers
            ? {}
            : buildChapterMarkers(scenes);

        const assembled = await assembleManuscript(
            scenes.map(s => s.file),
            vault, undefined, false, undefined, false, undefined, undefined,
            {
                sceneHeadingMode: ctx.sceneHeadingMode,
                sceneHeadingRenderMode: ctx.sceneHeadingRenderMode,
                chapterMarkersByScenePath: chapterMarkers,
            }
        );

        // Spec floor: scene.headingMode === 'scene-number'.
        expect(spec.scene.headingMode).toBe('scene-number');

        // Assembler invokes \rtSceneOpener for every scene (the contract surface).
        const openerCount = (assembled.text.match(/\\rtSceneOpener\{/g) || []).length;
        expect(openerCount).toBe(scenes.length);

        // Old assembler form must NOT regress.
        expect(assembled.text).not.toContain('\\section*{');

        // No \rtPart, no \rtChapter — spec says parts:off and chapters:off.
        expect(assembled.text).not.toMatch(/\\rtPart\{/);
        expect(assembled.text).not.toMatch(/\\rtChapter\{/);

        // Heading inside \rtSceneOpener{...} is JUST the scene number.
        // For each scene we passed in (numeric prefix 1..6), assert the
        // opener call wraps just that digit, not the title.
        for (let i = 1; i <= scenes.length; i++) {
            const re = new RegExp(`\\\\rtSceneOpener\\{${i}\\}`);
            expect(assembled.text).toMatch(re);
        }
        // Titles must NOT leak into the opener (e.g. "Arrival", "The Garden").
        expect(assembled.text).not.toMatch(/\\rtSceneOpener\{[^}]*Garden/);
        expect(assembled.text).not.toMatch(/\\rtSceneOpener\{[^}]*Arrival/);

        // Pictogram: scene right page has specialText that's a digit, body
        // lines render below the heading, and the heading anchors at the top
        // of the page (matches generator behavior — heading + body share a
        // page).
        const picto = getPictogramRowsFromSpec(spec);
        expect(picto.scene?.rightPage?.specialText).toMatch(/^\d+$/);
        expect(picto.scene?.rightPage?.bodyLines).toBeGreaterThanOrEqual(1);
        expect(picto.scene?.rightPage?.headingPosition).toBe('top');
        expect(picto.special).toEqual([]); // no PART, no CHAPTER spread

        // Feature row "Scenes" must mention BOTH "scene number" and "body" —
        // dedicated-page openers in Standard / Contemporary share the page
        // with body text, so the description must convey both axes.
        const features = getLayoutFeaturesFromSpec(spec);
        const scenesRow = findFeatureRow(features, 'Scenes');
        expect(scenesRow).toBeDefined();
        expect(scenesRow!.value.toLowerCase()).toMatch(/scene number/);
        expect(scenesRow!.value.toLowerCase()).toMatch(/body/);

        // The .tex must define \rtSceneOpener.
        const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });
        expect(tex).toContain('\\newcommand{\\rtSceneOpener}[1]');
    });

    it('Modern Classic: spec → feature/picto/assembler all describe parts + chapters + roman-rule scenes', async () => {
        const id: BundledFictionId = 'bundled-fiction-modern-classic';
        const spec = BUNDLED_FICTION_SPECS[id];
        const ctx = assemblyContextForSpec(id);
        const scenes = buildSyntheticScenes();
        const vault = buildVault(scenes);

        // Modern Classic uses the structure path. Beat → act mapping:
        //   Opening Image, Setup, Midpoint, All Is Lost → act 1
        //   Break into 3, Finale                        → act 2
        const beatDefinitions = [
            { name: 'Opening Image', actIndex: 1 },
            { name: 'Setup',         actIndex: 1 },
            { name: 'Midpoint',      actIndex: 1 },
            { name: 'All Is Lost',   actIndex: 1 },
            { name: 'Break into 3',  actIndex: 2 },
            { name: 'Finale',        actIndex: 2 },
        ];

        const assembled = await assembleManuscript(
            scenes.map(s => s.file),
            vault, undefined, false, undefined, false, undefined, undefined,
            {
                sceneHeadingMode: ctx.sceneHeadingMode,
                sceneHeadingRenderMode: ctx.sceneHeadingRenderMode,
                chapterMarkersByScenePath: buildChapterMarkers(scenes),
                modernClassicStructure: {
                    enabled: true,
                    beatDefinitions,
                    actEpigraphs: ['Quote one.', 'Quote two.'],
                    actEpigraphAttributions: ['Author A', 'Author B'],
                },
            }
        );

        // Two acts → exactly two \rtPart{...} calls.
        expect((assembled.text.match(/\\rtPart\{/g) || []).length).toBe(2);
        // Roman-numeral act labels (parts.mode === 'roman').
        expect(assembled.text).toContain('\\rtPart{I}');
        expect(assembled.text).toContain('\\rtPart{II}');
        // Three chapter markers in the fixture → three \rtChapter calls.
        expect((assembled.text.match(/\\rtChapter\{/g) || []).length).toBe(3);
        // Chapters carry their titles (numbered-titled mode).
        expect(assembled.text).toContain('Boy with a Skull');
        expect(assembled.text).toContain('New Horizons');
        // Scene separators: roman-with-rule path uses \rtSceneSep inline.
        expect(assembled.text).toContain('\\rtSceneSep');
        // Modern Classic does NOT use \rtSceneOpener (its opener is roman-with-rule, inline).
        expect(assembled.text).not.toContain('\\rtSceneOpener{');
        // Epigraphs threaded through \rtEpigraph.
        expect(assembled.text).toContain('\\rtEpigraph');

        // Pictogram: roman-rule scene + PART + CHAPTER spreads.
        const picto = getPictogramRowsFromSpec(spec);
        expect(picto.scene?.rightPage?.separatorText).toMatch(/^[ivxlcdm]+\.$/);
        const partSpread = picto.special.find(s => s.label === 'PART');
        expect(partSpread).toBeDefined();
        expect(partSpread!.rightPage?.specialText).toMatch(/^[IVX]+$/);
        const chapterSpread = picto.special.find(s => s.label === 'CHAPTER');
        expect(chapterSpread).toBeDefined();

        // Feature rows include Parts + Chapters + Scenes.
        const features = getLayoutFeaturesFromSpec(spec);
        expect(findFeatureRow(features, 'Parts')).toBeDefined();
        expect(findFeatureRow(features, 'Chapters')).toBeDefined();
        const scenesRow = findFeatureRow(features, 'Scenes');
        expect(scenesRow).toBeDefined();
        // "Roman" + "rule" tokens are the meaningful semantic markers.
        expect(scenesRow!.value.toLowerCase()).toMatch(/roman/);
        expect(scenesRow!.value.toLowerCase()).toMatch(/rule/);
    });

    it('Signature Literary: spec → three scene-mode pictogram spreads, no PART/CHAPTER, no \\rtChapter in assembler output', async () => {
        const id: BundledFictionId = 'bundled-fiction-signature-literary';
        const spec = BUNDLED_FICTION_SPECS[id];
        const ctx = assemblyContextForSpec(id);
        const scenes = buildSyntheticScenes();
        const vault = buildVault(scenes);
        // chapters.mode === 'off' → suppress markers (mirrors the export pipeline).
        const chapterMarkers = ctx.suppressChapterMarkers ? {} : buildChapterMarkers(scenes);

        const assembled = await assembleManuscript(
            scenes.map(s => s.file),
            vault, undefined, false, undefined, false, undefined, undefined,
            {
                sceneHeadingMode: ctx.sceneHeadingMode,
                sceneHeadingRenderMode: ctx.sceneHeadingRenderMode,
                chapterMarkersByScenePath: chapterMarkers,
            }
        );

        // Each scene → one \rtSceneOpener call. Signature's spec defines
        // \rtSceneOpener as a thin wrapper around \section*{} so titlesec
        // hooks fire and render the user-selected mode.
        expect((assembled.text.match(/\\rtSceneOpener\{/g) || []).length).toBe(scenes.length);
        // No PART, no CHAPTER pages.
        expect(assembled.text).not.toMatch(/\\rtPart\{/);
        expect(assembled.text).not.toMatch(/\\rtChapter\{/);

        // Pictogram: no top-row scene spread; three special-row spreads with sceneMode.
        const picto = getPictogramRowsFromSpec(spec);
        expect(picto.scene).toBeNull();
        const sceneModes = picto.special.map(s => s.sceneMode).filter(Boolean);
        expect(sceneModes).toEqual(['scene-number', 'scene-number-title', 'title-only']);
        expect(picto.special.find(s => s.label === 'PART')).toBeUndefined();
        expect(picto.special.find(s => s.label === 'CHAPTER')).toBeUndefined();

        // Feature rows: three scene-mode rows present.
        const features = getLayoutFeaturesFromSpec(spec);
        expect(findFeatureRow(features, 'Scene #')).toBeDefined();
        expect(findFeatureRow(features, 'Scene #+T')).toBeDefined();
        expect(findFeatureRow(features, 'Scene T')).toBeDefined();
        // No Parts row, no Chapters row.
        expect(findFeatureRow(features, 'Parts')).toBeUndefined();
        expect(findFeatureRow(features, 'Chapters')).toBeUndefined();

        // .tex defines \rtSceneOpener as a section-starred wrapper.
        const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });
        expect(tex).toContain('\\newcommand{\\rtSceneOpener}[1]');
    });

    it('Contemporary Literary: spec → numbered chapter pages + dedicated scene-opener pages', async () => {
        const id: BundledFictionId = 'bundled-fiction-contemporary-literary';
        const spec = BUNDLED_FICTION_SPECS[id];
        const ctx = assemblyContextForSpec(id);
        const scenes = buildSyntheticScenes();
        const vault = buildVault(scenes);

        const assembled = await assembleManuscript(
            scenes.map(s => s.file),
            vault, undefined, false, undefined, false, undefined, undefined,
            {
                sceneHeadingMode: ctx.sceneHeadingMode,
                sceneHeadingRenderMode: ctx.sceneHeadingRenderMode,
                chapterMarkersByScenePath: buildChapterMarkers(scenes),
            }
        );

        // Each scene → one \rtSceneOpener call.
        expect((assembled.text.match(/\\rtSceneOpener\{/g) || []).length).toBe(scenes.length);
        // No \rtPart (parts.mode === 'off').
        expect(assembled.text).not.toMatch(/\\rtPart\{/);
        // Three chapter markers in the fixture → three markdown chapter
        // headings reach Pandoc (Contemporary uses # heading for chapters).
        const h1Chapters = (assembled.text.match(/^# /gm) || []).length;
        expect(h1Chapters).toBe(3);

        // Heading inside the scene opener is just the scene number (spec floor).
        for (let i = 1; i <= scenes.length; i++) {
            const re = new RegExp(`\\\\rtSceneOpener\\{${i}\\}`);
            expect(assembled.text).toMatch(re);
        }

        // Pictogram: dedicated scene + numbered-only chapter page.
        const picto = getPictogramRowsFromSpec(spec);
        expect(picto.scene?.rightPage?.specialText).toMatch(/^\d+$/);
        const chapterSpread = picto.special.find(s => s.label === 'CHAPTER');
        expect(chapterSpread).toBeDefined();
        expect(chapterSpread!.rightPage?.bodyLines).toBe(0);

        // Feature rows: Chapters + Scenes both present, no Parts.
        const features = getLayoutFeaturesFromSpec(spec);
        expect(findFeatureRow(features, 'Parts')).toBeUndefined();
        expect(findFeatureRow(features, 'Chapters')).toBeDefined();
        const scenesRow = findFeatureRow(features, 'Scenes');
        expect(scenesRow).toBeDefined();
        expect(scenesRow!.value.toLowerCase()).toMatch(/scene number/);
        expect(scenesRow!.value.toLowerCase()).toMatch(/body/);
    });

    // Cross-cutting cohesion check: for every bundled spec, the digit shown
    // in the pictogram, the headingMode in the spec, and the heading content
    // emitted by the assembler all agree.
    for (const id of BUNDLED_FICTION_IDS) {
        it(`${id}: pictogram and assembler agree on the spec's headingMode`, async () => {
            const spec = BUNDLED_FICTION_SPECS[id];
            const ctx = assemblyContextForSpec(id);
            // Skip Modern Classic — its scene opener is inline, not a dedicated
            // page, so the contract surface is \rtSceneSep not \rtSceneOpener.
            if (spec.scene.opener !== 'dedicated-page') return;

            const scenes = buildSyntheticScenes();
            const vault = buildVault(scenes);
            const chapterMarkers = ctx.suppressChapterMarkers ? {} : buildChapterMarkers(scenes);

            const assembled = await assembleManuscript(
                scenes.map(s => s.file),
                vault, undefined, false, undefined, false, undefined, undefined,
                {
                    sceneHeadingMode: ctx.sceneHeadingMode,
                    sceneHeadingRenderMode: ctx.sceneHeadingRenderMode,
                    chapterMarkersByScenePath: chapterMarkers,
                }
            );

            // Heading mode floor reaches the assembler.
            // (Pictogram already asserted in per-spec tests above.)
            if (spec.scene.headingMode === 'scene-number') {
                // Every \rtSceneOpener{...} payload must be just digits.
                const matches = Array.from(assembled.text.matchAll(/\\rtSceneOpener\{([^}]+)\}/g));
                for (const m of matches) {
                    expect(m[1]).toMatch(/^\d+$/);
                }
            }
        });
    }
});
