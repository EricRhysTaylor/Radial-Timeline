/*
 * Shared timeline data types
 */

export interface TimelineItem {
    title?: string;
    date: string;
    path?: string;
    subplot?: string;
    act?: string;
    pov?: string;
    location?: string;
    number?: number;
    synopsis?: string;
    when?: Date;
    actNumber?: number;
    Character?: string[];
    status?: string | string[];
    "Publish Stage"?: string;
    due?: string;
    pendingEdits?: string;
    Duration?: string;
    "previousSceneAnalysis"?: string;
    "currentSceneAnalysis"?: string;
    "nextSceneAnalysis"?: string;
    "Pulse Update"?: boolean | string;
    "Pulse Last Updated"?: string;
    "Beats Update"?: boolean | string; // legacy compatibility
    itemType?: "Scene" | "Plot" | "Beat" | "Backdrop";
    Description?: string;
    "Beat Model"?: string;
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
    End?: string;
}
