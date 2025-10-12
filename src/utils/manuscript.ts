/*
 * Manuscript Assembly Utilities
 */
import type { TFile, Vault } from 'obsidian';

export interface SceneContent {
  title: string;
  bodyText: string;
  wordCount: number;
}

export interface AssembledManuscript {
  text: string;
  totalWords: number;
  totalScenes: number;
  scenes: SceneContent[];
}

/**
 * Strip YAML frontmatter from file content
 */
function stripYamlFrontmatter(content: string): string {
  // Remove YAML frontmatter between --- markers
  const yamlPattern = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  return content.replace(yamlPattern, '');
}

/**
 * Strip Obsidian comments (%% ... %%)
 */
function stripObsidianComments(content: string): string {
  // Remove single-line comments
  content = content.replace(/%%.*?%%/g, '');
  // Remove multi-line comments
  content = content.replace(/%%[\s\S]*?%%/g, '');
  return content;
}

/**
 * Extract clean body text from file content
 */
export function extractBodyText(content: string): string {
  let text = stripYamlFrontmatter(content);
  text = stripObsidianComments(text);
  return text.trim();
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  // Split on whitespace and filter out empty strings
  const words = text.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

/**
 * Estimate tokens from word count (rough approximation: 1 token ≈ 0.75 words)
 */
export function estimateTokens(wordCount: number): number {
  return Math.ceil(wordCount / 0.75);
}

/**
 * Assemble full manuscript from scene files
 * @param sceneFiles - Array of TFile objects in manuscript order
 * @param vault - Obsidian vault instance
 * @param progressCallback - Optional callback for progress updates
 */
export async function assembleManuscript(
  sceneFiles: TFile[],
  vault: Vault,
  progressCallback?: (sceneIndex: number, sceneTitle: string, totalScenes: number) => void
): Promise<AssembledManuscript> {
  const scenes: SceneContent[] = [];
  const textParts: string[] = [];
  let totalWords = 0;

  for (let i = 0; i < sceneFiles.length; i++) {
    const file = sceneFiles[i];
    const title = file.basename;

    // Call progress callback if provided
    if (progressCallback) {
      progressCallback(i + 1, title, sceneFiles.length);
    }

    try {
      const content = await vault.read(file);
      const bodyText = extractBodyText(content);
      const wordCount = countWords(bodyText);

      scenes.push({ title, bodyText, wordCount });
      totalWords += wordCount;

      // Format: === 44 Michi Updates Rel Newlan ===
      textParts.push(`=== ${title} ===\n\n${bodyText}\n\n`);
    } catch (error) {
      console.error(`Error reading scene file ${file.path}:`, error);
      // Add placeholder for failed scene
      textParts.push(`=== ${title} ===\n\n[Error reading scene]\n\n`);
    }
  }

  return {
    text: textParts.join(''),
    totalWords,
    totalScenes: sceneFiles.length,
    scenes
  };
}

