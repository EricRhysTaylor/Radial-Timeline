/*
 * Gossamer Score Entry Modal - Manual entry of beat momentum scores
 */
import { Modal, App, ButtonComponent, Notice, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { Scene } from '../main';
import { normalizeBeatName } from '../utils/gossamer';

interface BeatScoreEntry {
  beatTitle: string; // Full title like "1 Opening Image" or "5 Theme Stated 5%"
  beatName: string; // Normalized name for matching
  currentScore?: number; // Gossamer1 if it exists
  history: number[]; // Gossamer2, Gossamer3, etc.
  newScore?: number; // User-entered score
  inputEl?: TextComponent;
}

export class GossamerScoreModal extends Modal {
  private plugin: RadialTimelinePlugin;
  private plotBeats: Scene[];
  private entries: BeatScoreEntry[] = [];
  private parsedScores?: Map<string, number>; // Optional pre-filled scores from clipboard

  constructor(
    app: App,
    plugin: RadialTimelinePlugin,
    plotBeats: Scene[],
    parsedScores?: Map<string, number>
  ) {
    super(app);
    this.plugin = plugin;
    this.plotBeats = plotBeats;
    this.parsedScores = parsedScores;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('rt-gossamer-score-modal');

    // Title
    const titleEl = contentEl.createEl('h2', { text: 'Gossamer Momentum Scores' });
    titleEl.addClass('rt-gossamer-score-title');

    // Subtitle
    const subtitleEl = contentEl.createEl('p', {
      text: 'Enter momentum scores (0-100) for each beat. Previous scores will be saved as history.'
    });
    subtitleEl.addClass('rt-gossamer-score-subtitle');

    // Scores container
    const scoresContainer = contentEl.createDiv('rt-gossamer-scores-container');

    // Build entries from plot beats
    this.buildEntries();

    // Render each beat entry
    this.entries.forEach((entry, index) => {
      const entryDiv = scoresContainer.createDiv('rt-gossamer-score-entry');

      // Beat title (full title with position prefix)
      const beatTitleEl = entryDiv.createEl('div', { text: entry.beatTitle });
      beatTitleEl.addClass('rt-gossamer-beat-title');

      // Current score display
      if (entry.currentScore !== undefined) {
        const currentEl = entryDiv.createEl('div', {
          text: `Current: ${entry.currentScore}`
        });
        currentEl.addClass('rt-gossamer-current-score');
      }

      // History display (if exists)
      if (entry.history.length > 0) {
        const historyText = entry.history.join(' → ');
        const historyEl = entryDiv.createEl('div', {
          text: `Previous: ${historyText}`
        });
        historyEl.addClass('rt-gossamer-score-history');
      }

      // Input row
      const inputRow = entryDiv.createDiv('rt-gossamer-input-row');
      
      const inputLabel = inputRow.createSpan({ text: 'New Score: ' });
      inputLabel.addClass('rt-gossamer-input-label');

      entry.inputEl = new TextComponent(inputRow);
      entry.inputEl.inputEl.addClass('rt-gossamer-score-input');
      entry.inputEl.setPlaceholder('0-100');
      
      // Pre-fill if we have parsed scores
      if (this.parsedScores) {
        const normalized = normalizeBeatName(entry.beatName);
        const parsedScore = this.parsedScores.get(normalized);
        if (parsedScore !== undefined) {
          entry.inputEl.setValue(parsedScore.toString());
          entry.newScore = parsedScore;
        }
      }

      // Validate on input
      entry.inputEl.onChange((value) => {
        const num = parseInt(value);
        if (!isNaN(num) && num >= 0 && num <= 100) {
          entry.newScore = num;
          entry.inputEl.inputEl.removeClass('rt-input-error');
        } else if (value.trim().length > 0) {
          entry.inputEl.inputEl.addClass('rt-input-error');
          entry.newScore = undefined;
        } else {
          entry.inputEl.inputEl.removeClass('rt-input-error');
          entry.newScore = undefined;
        }
      });

      const rangeNote = inputRow.createSpan({ text: ' (0-100)' });
      rangeNote.addClass('rt-gossamer-range-note');
    });

    // Buttons
    const buttonContainer = contentEl.createDiv('rt-gossamer-score-buttons');

    new ButtonComponent(buttonContainer)
      .setButtonText('Save Scores')
      .setCta()
      .onClick(async () => {
        await this.saveScores();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => {
        this.close();
      });
  }

  private buildEntries(): void {
    // Sort plot beats by numeric prefix
    const sortedBeats = [...this.plotBeats].sort((a, b) => {
      const aMatch = (a.title || '').match(/^(\d+(?:\.\d+)?)/);
      const bMatch = (b.title || '').match(/^(\d+(?:\.\d+)?)/);
      const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
      const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
      return aNum - bNum;
    });

    for (const beat of sortedBeats) {
      if (!beat.title || !beat.path) continue;

      // Get metadata from cache
      const file = this.plugin.app.vault.getAbstractFileByPath(beat.path);
      if (!file) continue;

      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;

      const entry: BeatScoreEntry = {
        beatTitle: beat.title,
        beatName: normalizeBeatName(beat.title),
        history: []
      };

      if (fm) {
        // Get current score
        if (typeof fm.Gossamer1 === 'number') {
          entry.currentScore = fm.Gossamer1;
        }

        // Get history
        for (let i = 2; i <= 5; i++) {
          const key = `Gossamer${i}`;
          if (typeof fm[key] === 'number') {
            entry.history.push(fm[key]);
          }
        }
      }

      this.entries.push(entry);
    }
  }

  private async saveScores(): Promise<void> {
    const scores = new Map<string, number>();
    const errors: string[] = [];

    // Collect scores
    for (const entry of this.entries) {
      if (entry.newScore !== undefined) {
        scores.set(entry.beatTitle, entry.newScore);
      } else if (entry.inputEl?.getValue().trim().length > 0) {
        errors.push(`Invalid score for "${entry.beatTitle}"`);
      }
    }

    if (errors.length > 0) {
      new Notice(`Errors: ${errors.join(', ')}`);
      return;
    }

    if (scores.size === 0) {
      new Notice('No scores entered.');
      return;
    }

    // Save scores
    try {
      await this.plugin.saveGossamerScores(scores);
      new Notice(`Updated ${scores.size} beat scores.`);
      this.close();
    } catch (error) {
      console.error('[Gossamer] Failed to save scores:', error);
      new Notice('Failed to save scores. Check console for details.');
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

