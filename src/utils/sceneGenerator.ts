/*
 * Utility for generating scene content from templates
 */

/**
 * Extracts YAML field names from a template string.
 * A field is identified by a line starting with "FieldName:" pattern.
 */
function extractFieldNames(template: string): Set<string> {
    const fields = new Set<string>();
    const lines = template.split('\n');
    for (const line of lines) {
        const match = line.match(/^([A-Za-z][A-Za-z0-9 _'-]*):/);
        if (match) {
            fields.add(match[1].trim());
        }
    }
    return fields;
}

/**
 * Filters advanced template to only include fields NOT present in base template.
 * This handles migration from legacy "complete" advanced templates to the new
 * "additional fields only" format.
 */
function filterAdvancedFields(advancedTemplate: string, baseFields: Set<string>): string {
    const lines = advancedTemplate.split('\n');
    const result: string[] = [];
    let skipUntilNextField = false;
    
    for (const line of lines) {
        const fieldMatch = line.match(/^([A-Za-z][A-Za-z0-9 _'-]*):/);
        
        if (fieldMatch) {
            const fieldName = fieldMatch[1].trim();
            if (baseFields.has(fieldName)) {
                // Skip this field and any continuation lines (like list items)
                skipUntilNextField = true;
                continue;
            } else {
                skipUntilNextField = false;
                result.push(line);
            }
        } else if (skipUntilNextField) {
            // Skip continuation lines (indented list items, placeholders)
            continue;
        } else {
            result.push(line);
        }
    }
    
    return result.join('\n');
}

/**
 * Merges the base template with advanced-only fields to create a complete advanced template.
 * This eliminates duplication by keeping base fields in one place and advanced additions separate.
 * 
 * Handles legacy migration: if the advanced template contains fields that are already in base,
 * those duplicates are automatically filtered out before merging.
 * 
 * @param baseTemplate The base YAML template with all required fields
 * @param advancedFields The advanced-only fields to merge in (or legacy complete template)
 * @returns A complete advanced template with all fields properly ordered
 */
export function mergeTemplates(baseTemplate: string, advancedFields: string): string {
    // Extract field names from base template
    const baseFields = extractFieldNames(baseTemplate);
    
    // Filter advanced template to remove any fields already in base (handles legacy migration)
    const filteredAdvanced = filterAdvancedFields(advancedFields, baseFields);
    
    const lines = baseTemplate.split('\n');
    const advancedLines = filteredAdvanced.split('\n');
    
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

