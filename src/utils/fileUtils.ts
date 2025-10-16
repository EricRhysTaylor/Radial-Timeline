/*
 * File utilities for opening and managing files
 * 
 * Uses Obsidian's recommended workspace.openLinkText() method which:
 * - Automatically checks if file is already open
 * - Reveals existing tab if found
 * - Opens in new tab if not found
 * - Handles PaneType configuration properly
 */

import { App, TFile, MarkdownView } from 'obsidian';

/**
 * Opens a file in the workspace using Obsidian's recommended approach.
 * Uses workspace.openLinkText() which automatically handles duplicate tab prevention.
 * 
 * @param app - The Obsidian App instance
 * @param file - The file to open
 * @param newLeaf - Whether to open in a new leaf. Default false (reuse existing tab).
 * @returns Promise that resolves when the file is opened/revealed
 */
export async function openOrRevealFile(app: App, file: TFile, newLeaf: boolean = false): Promise<void> {
  // Check if file is already open
  const leaves = app.workspace.getLeavesOfType('markdown');
  const existingLeaf = leaves.find(leaf => {
    const view = leaf.view;
    return view instanceof MarkdownView && view.file?.path === file.path;
  });
  
  if (existingLeaf) {
    app.workspace.setActiveLeaf(existingLeaf);
    return;
  }
  
  // Use Obsidian's openLinkText which handles duplicate tab prevention automatically
  // Pass the file path as linktext and sourcePath (can be empty string for absolute paths)
  await app.workspace.openLinkText(file.path, '', newLeaf);
}

/**
 * Opens a file by path using Obsidian's recommended approach.
 * 
 * @param app - The Obsidian App instance
 * @param filePath - The path to the file to open
 * @param newLeaf - Whether to open in a new leaf. Default false (reuse existing tab).
 * @returns Promise that resolves when the file is opened/revealed
 */
export async function openOrRevealFileByPath(app: App, filePath: string, newLeaf: boolean = false): Promise<void> {
  const file = app.vault.getAbstractFileByPath(filePath);
  
  if (!(file instanceof TFile)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  await openOrRevealFile(app, file, newLeaf);
}

