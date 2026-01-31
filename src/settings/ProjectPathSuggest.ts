/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { App, AbstractInputSuggest, TFolder, TextComponent, normalizePath, Notice } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { validateAndRememberProjectPath } from '../renderer/apr/aprHelpers';

/**
 * ProjectPathSuggest provides folder suggestions for the Social Project Path setting.
 * Similar to FolderSuggest but uses the Project Path validation and storage.
 */
export class ProjectPathSuggest extends AbstractInputSuggest<TFolder> {
  private plugin: RadialTimelinePlugin;
  private text: TextComponent;

  constructor(app: App, input: HTMLInputElement, plugin: RadialTimelinePlugin, text: TextComponent) {
    super(app, input);
    this.plugin = plugin;
    this.text = text;
  }

  getSuggestions(query: string): TFolder[] {
    const q = query?.toLowerCase() ?? '';
    // Prefer Vault.getAllFolders when available
    const folders = (this.app.vault as any).getAllFolders?.() as TFolder[] | undefined
      ?? this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
    if (!q) return folders;
    return folders.filter(f => f.path.toLowerCase().includes(q));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    const inputEl = this.text.inputEl;
    // Update the text field immediately for user feedback
    const normalized = normalizePath(folder.path);
    try { this.text.setValue(normalized); } catch {}
    if ((this as any).inputEl) {
      try { (this as any).inputEl.value = normalized; } catch {}
    }

    // Validate and remember using Project Path validation
    void validateAndRememberProjectPath(normalized, this.plugin).then(async (ok) => {
      if (ok) {
        // Save to authorProgress.socialProjectPath
        if (!this.plugin.settings.authorProgress) return;
        this.plugin.settings.authorProgress.socialProjectPath = normalized;
        await this.plugin.saveSettings();
        inputEl.removeClass('is-error');
        inputEl.addClass('is-success');
        window.setTimeout(() => inputEl.removeClass('is-success'), 1000);
      } else {
        // Invalid path - revert to last saved value
        const savedValue = this.plugin.settings.authorProgress?.socialProjectPath || '';
        this.text.setValue(savedValue);
        inputEl.addClass('is-error');
        window.setTimeout(() => inputEl.removeClass('is-error'), 2000);
        new Notice(`Invalid project path: "${normalized}" does not exist or is not a folder. Reverting to saved value.`);
      }
      // Close suggestions and focus input
      try { this.close(); } catch {}
      try { inputEl.focus(); } catch {}
    });
  }
}
