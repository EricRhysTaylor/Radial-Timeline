/*
 * Utility for generating scene content from templates
 */

export interface SceneCreationData {
    act: number;
    when: string;
    sceneNumber: number;
    subplots: string[];
    character: string;
    place: string;
}

/**
 * Generates the content of a scene note by replacing placeholders in the template.
 * @param template The template string with {{Placeholders}}
 * @param data Data to populate the template
 * @returns The final note content
 */
export function generateSceneContent(template: string, data: SceneCreationData): string {
    let content = template;

    // Helper to escape characters for YAML if needed, though strictly we might just paste
    // For now, simple string replacement

    // {{Act}}
    content = content.replace(/{{Act}}/g, data.act.toString());

    // {{When}}
    content = content.replace(/{{When}}/g, data.when);

    // {{SceneNumber}}
    content = content.replace(/{{SceneNumber}}/g, data.sceneNumber.toString());

    // {{Subplot}} - inline comma separated
    const subplotString = data.subplots.join(', ');
    content = content.replace(/{{Subplot}}/g, subplotString);

    // {{SubplotList}} - YAML array format
    // Indent with 2 spaces for nested list
    const subplotListString = data.subplots.map(s => `  - "${s}"`).join('\n');
    content = content.replace(/{{SubplotList}}/g, subplotListString);

    // {{Character}}
    content = content.replace(/{{Character}}/g, data.character);

    // {{Place}}
    content = content.replace(/{{Place}}/g, data.place);

    return content;
}

