/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { App, AbstractInputSuggest, TFolder, TextComponent, normalizePath, Notice } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { validateAndRememberProjectPath } from '../renderer/apr/aprHelpers';

interface ProjectPathSuggestOptions {
  onValidPath?: (normalized: string) => Promise<void> | void;
  onInvalidPath?: (normalized: string) => void;
  getSavedValue?: () => string;
  successClass?: string;
  errorClass?: string;
}

/**
 * ProjectPathSuggest provides folder suggestions for the Social Project Path setting.
 * Similar to FolderSuggest but uses the Project Path validation and storage.
 */
export class ProjectPathSuggest extends AbstractInputSuggest<TFolder> {
  private plugin: RadialTimelinePlugin;
  private text: TextComponent;
  private options?: ProjectPathSuggestOptions;

  constructor(
    app: App,
    input: HTMLInputElement,
    plugin: RadialTimelinePlugin,
    text: TextComponent,
    options?: ProjectPathSuggestOptions
  ) {
    super(app, input);
    this.plugin = plugin;
    this.text = text;
    this.options = options;
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

    const successClass = this.options?.successClass ?? 'is-success';
    const errorClass = this.options?.errorClass ?? 'is-error';

    // Validate and remember using Project Path validation
    void validateAndRememberProjectPath(normalized, this.plugin).then(async (ok) => {
      if (ok) {
        if (this.options?.onValidPath) {
          await this.options.onValidPath(normalized);
        } else {
          // Save to authorProgress.socialProjectPath
          if (!this.plugin.settings.authorProgress) return;
          this.plugin.settings.authorProgress.socialProjectPath = normalized;
          await this.plugin.saveSettings();
        }
        inputEl.removeClass(errorClass);
        inputEl.addClass(successClass);
        window.setTimeout(() => inputEl.removeClass(successClass), 1000);
      } else {
        // Invalid path - revert to last saved value
        const savedValue = this.options?.getSavedValue?.()
          ?? this.plugin.settings.authorProgress?.socialProjectPath
          ?? '';
        this.text.setValue(savedValue);
        inputEl.addClass(errorClass);
        window.setTimeout(() => inputEl.removeClass(errorClass), 2000);
        if (this.options?.onInvalidPath) {
          this.options.onInvalidPath(normalized);
        } else {
          new Notice(`Invalid project path: "${normalized}" does not exist or is not a folder. Reverting to saved value.`);
        }
      }
      // Close suggestions and focus input
      try { this.close(); } catch {}
      try { inputEl.focus(); } catch {}
    });
  }
}
