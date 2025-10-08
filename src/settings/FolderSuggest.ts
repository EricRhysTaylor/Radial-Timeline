/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { App, AbstractInputSuggest, TFolder, TextComponent, normalizePath } from 'obsidian';
import RadialTimelinePlugin from '../main';

/**
 * FolderSuggest encapsulates folder suggestions for the source path setting.
 * It uses Vault.getAllFolders when available (minAppVersion 1.6.6),
 * falling back to getAllLoadedFiles for older app versions.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
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

    // Validate and remember; only save the setting once on success
    void this.plugin.validateAndRememberPath(normalized).then(async (ok) => {
      if (ok) {
        // SAFE: normalized is from normalizePath() above
        this.plugin.settings.sourcePath = normalized;
        await this.plugin.saveSettings();
        inputEl.removeClass('setting-input-error');
        inputEl.addClass('setting-input-success');
        window.setTimeout(() => inputEl.removeClass('setting-input-success'), 1000);
      } else {
        inputEl.addClass('setting-input-error');
        window.setTimeout(() => inputEl.removeClass('setting-input-error'), 2000);
      }
      // Close suggestions and focus input
      try { this.close(); } catch {}
      try { inputEl.focus(); } catch {}
    });
  }
}


