/*
 * Utility for generating scene content from templates
 */

/**
 * Merges the base template with advanced-only fields to create a complete advanced template.
 * This eliminates duplication by keeping base fields in one place and advanced additions separate.
 * 
 * @param baseTemplate The base YAML template with all required fields
 * @param advancedFields The advanced-only fields to merge in
 * @returns A complete advanced template with all fields properly ordered
 */
export function mergeTemplates(baseTemplate: string, advancedFields: string): string {
    const lines = baseTemplate.split('\n');
    const advancedLines = advancedFields.split('\n');
    
    // Parse advanced fields into sections
    // Place goes after POV, everything else goes after Pending Edits (before Words)
    const placeLines: string[] = [];
    const otherAdvancedLines: string[] = [];
    
    let inPlaceSection = false;
    for (const line of advancedLines) {
        if (line.startsWith('Place:')) {
            inPlaceSection = true;
            placeLines.push(line);
        } else if (inPlaceSection && (line.startsWith('{{PlaceList}}') || line.startsWith('  -'))) {
            placeLines.push(line);
        } else if (line.trim()) {
            inPlaceSection = false;
            otherAdvancedLines.push(line);
        }
    }
    
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Replace Subplot inline with list format
        if (line.match(/^Subplot:\s*{{Subplot}}/)) {
            result.push('Subplot:');
            result.push('{{SubplotList}}');
            continue;
        }
        
        // Replace Character inline with list format
        if (line.match(/^Character:\s*{{Character}}/)) {
            result.push('Character:');
            result.push('{{CharacterList}}');
            continue;
        }
        
        result.push(line);
        
        // Insert Place after POV
        if (line.startsWith('POV:')) {
            result.push(...placeLines);
        }
        
        // Insert other advanced fields after Pending Edits but before Words
        if (line.startsWith('Pending Edits:')) {
            result.push(...otherAdvancedLines);
        }
    }
    
    return result.join('\n');
}

export interface SceneCreationData {
    act: number;
    when: string;
    sceneNumber: number;
    subplots: string[];
    character: string;
    place: string;
    characterList?: string[];
    placeList?: string[];
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

    // {{Subplot}} - inline YAML (string for 1, array for >1)
    const yamlEscapeDoubleQuoted = (value: string) =>
        value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const yamlInlineArray = (values: string[]) =>
        `[${values.map(v => `"${yamlEscapeDoubleQuoted(v)}"`).join(', ')}]`;
    const subplotInline =
        data.subplots.length <= 1 ? (data.subplots[0] ?? '') : yamlInlineArray(data.subplots);
    content = content.replace(/{{Subplot}}/g, subplotInline);

    // {{SubplotList}} - YAML array format
    // Indent with 2 spaces for nested list
    const subplotListString = data.subplots.map(s => `  - "${s}"`).join('\n');
    content = content.replace(/{{SubplotList}}/g, subplotListString);

    // {{Character}}
    content = content.replace(/{{Character}}/g, data.character);

    // {{Place}}
    content = content.replace(/{{Place}}/g, data.place);

    // {{CharacterList}} - YAML array format (list)
    const characterListString = (data.characterList && data.characterList.length > 0
        ? data.characterList
        : [data.character].filter(Boolean)
    ).map(c => `  - "${c}"`).join('\n');
    content = content.replace(/{{CharacterList}}/g, characterListString);

    // {{PlaceList}} - YAML array format (list)
    const placeListString = (data.placeList && data.placeList.length > 0
        ? data.placeList
        : [data.place].filter(Boolean)
    ).map(p => `  - "${p}"`).join('\n');
    content = content.replace(/{{PlaceList}}/g, placeListString);

    return content;
}

