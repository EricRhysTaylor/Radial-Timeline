/*
 * Shared timeline data types
 */

/**
 * Central metadata for a book/manuscript.
 * Exactly one BookMeta note per manuscript.
 * Parsed from a note with Class: BookMeta.
 * Ignored by Timeline — used only during export.
 */
export interface BookMeta {
    /** Book title */
    title?: string;
    /** Author name */
    author?: string;
    /** Copyright and rights info */
    rights?: {
        copyright_holder?: string;
        year?: number;
    };
    /** Book identifiers */
    identifiers?: {
        isbn_paperback?: string;
    };
    /** Publisher info */
    publisher?: {
        name?: string;
    };
    /** Path to the BookMeta note in the vault */
    sourcePath?: string;
}

/**
 * Metadata extracted from matter note YAML.
 * Uses flat fields such as `Role`, `UseBookMeta`, and `BodyMode`.
 */
export interface MatterMeta {
    /** front or back */
    side?: string;
    /** Semantic role: copyright, title-page, dedication, etc. */
    role?: string;
    /** Whether this matter note should pull data from BookMeta */
    usesBookMeta?: boolean;
    /** Matter body handling mode for semantic renderers. */
    bodyMode?: 'latex' | 'plain' | 'auto';
    /** @deprecated Matter ordering now uses filename prefixes only (0.* / 200.*). */
    order?: number;
}

export interface TimelineItem {
    title?: string;
    date: string;
    path?: string;
    sceneId?: string;
    subplot?: string;
    act?: string;
    pov?: string;
    place?: string;
    number?: number;
    /**
     * Scene narrative unit fields:
     * - Synopsis: concise present-tense snapshot (word-capped).
     * - Summary: extended scene write-up (emotion/subtext/outcome allowed).
     */
    synopsis?: string;
    Summary?: string;
    when?: Date;
    actNumber?: number;
    Character?: string[];
    status?: string | string[];
    "Publish Stage"?: string;
    due?: string;
    pendingEdits?: string;
    Duration?: string;
    Runtime?: string;
    RuntimeProfile?: string;
    "previousSceneAnalysis"?: string;
    "currentSceneAnalysis"?: string;
    "nextSceneAnalysis"?: string;
    "Pulse Update"?: boolean | string;
    "Pulse Last Updated"?: string;
    "Beats Update"?: boolean | string; // legacy compatibility
    itemType?: "Scene" | "Plot" | "Beat" | "Backdrop" | "Frontmatter" | "Backmatter" | "BookMeta";
    /** Beat structural function ("Why this beat exists"). Preferred key: Purpose. */
    Purpose?: string;
    /** @deprecated Legacy beat field. Read for compatibility; new writes should use Purpose. */
    Description?: string;
    /** Backdrop world-layer context. Preferred key: Context. */
    Context?: string;
    "Beat Model"?: string;
    "Beat Id"?: string;
    /** Beat note is missing required Beat Model frontmatter value. */
    missingBeatModel?: boolean;
    Range?: string;
    "Suggest Placement"?: string;
    missingWhen?: boolean;
    Gossamer1?: number;
    Gossamer2?: number;
    Gossamer3?: number;
    Gossamer4?: number;
    Gossamer5?: number;
    Gossamer6?: number;
    Gossamer7?: number;
    Gossamer8?: number;
    Gossamer9?: number;
    Gossamer10?: number;
    Gossamer11?: number;
    Gossamer12?: number;
    Gossamer13?: number;
    Gossamer14?: number;
    Gossamer15?: number;
    Gossamer16?: number;
    Gossamer17?: number;
    Gossamer18?: number;
    Gossamer19?: number;
    Gossamer20?: number;
    Gossamer21?: number;
    Gossamer22?: number;
    Gossamer23?: number;
    Gossamer24?: number;
    Gossamer25?: number;
    Gossamer26?: number;
    Gossamer27?: number;
    Gossamer28?: number;
    Gossamer29?: number;
    Gossamer30?: number;
    // Gossamer Stage fields - tracks which publish stage each run was created during
    GossamerStage1?: string;
    GossamerStage2?: string;
    GossamerStage3?: string;
    GossamerStage4?: string;
    GossamerStage5?: string;
    GossamerStage6?: string;
    GossamerStage7?: string;
    GossamerStage8?: string;
    GossamerStage9?: string;
    GossamerStage10?: string;
    GossamerStage11?: string;
    GossamerStage12?: string;
    GossamerStage13?: string;
    GossamerStage14?: string;
    GossamerStage15?: string;
    GossamerStage16?: string;
    GossamerStage17?: string;
    GossamerStage18?: string;
    GossamerStage19?: string;
    GossamerStage20?: string;
    GossamerStage21?: string;
    GossamerStage22?: string;
    GossamerStage23?: string;
    GossamerStage24?: string;
    GossamerStage25?: string;
    GossamerStage26?: string;
    GossamerStage27?: string;
    GossamerStage28?: string;
    GossamerStage29?: string;
    GossamerStage30?: string;
    End?: string;
    /** Parsed matter metadata for semantic front/back notes */
    matterMeta?: MatterMeta;
    /** Raw frontmatter data for custom field access */
    rawFrontmatter?: Record<string, unknown>;
}
