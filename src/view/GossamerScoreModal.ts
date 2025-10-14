/*
 * Gossamer Score Entry Modal - Manual entry of beat momentum scores
 */
import { Modal, App, ButtonComponent, Notice, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { Scene } from '../main';
import { normalizeBeatName } from '../utils/gossamer';
import { parseScoresFromClipboard } from '../GossamerCommands';

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

  constructor(
    app: App,
    plugin: RadialTimelinePlugin,
    plotBeats: Scene[]
  ) {
    super(app);
    this.plugin = plugin;
    this.plotBeats = plotBeats;
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

    // Info about format
    const formatInfo = contentEl.createDiv('rt-gossamer-score-format-info');
    formatInfo.setText('💡 Tip: Use "Copy Template for AI" to get beat names formatted for LLMs. They should return scores like "Beat Name: 42"');

    // Buttons
    const buttonContainer = contentEl.createDiv('rt-gossamer-score-buttons');

    new ButtonComponent(buttonContainer)
      .setButtonText('Copy Template for AI')
      .setTooltip('Copy beat names in AI-ready format')
      .onClick(async () => {
        await this.copyTemplateForAI();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText('Paste from Clipboard')
      .onClick(async () => {
        await this.pasteFromClipboard();
      });

    // Right-side button group
    const rightButtons = buttonContainer.createDiv('rt-gossamer-score-buttons-right');

    new ButtonComponent(rightButtons)
      .setButtonText('Save Scores')
      .setCta()
      .onClick(async () => {
        await this.saveScores();
      });

    new ButtonComponent(rightButtons)
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
        // Get current score (handle both string and number)
        if (typeof fm.Gossamer1 === 'number') {
          entry.currentScore = fm.Gossamer1;
        } else if (typeof fm.Gossamer1 === 'string') {
          const parsed = parseInt(fm.Gossamer1);
          if (!isNaN(parsed)) {
            entry.currentScore = parsed;
          }
        }

        // Get history (handle both string and number)
        for (let i = 2; i <= 5; i++) {
          const key = `Gossamer${i}`;
          if (typeof fm[key] === 'number') {
            entry.history.push(fm[key]);
          } else if (typeof fm[key] === 'string') {
            const parsed = parseInt(fm[key]);
            if (!isNaN(parsed)) {
              entry.history.push(parsed);
            }
          }
        }
      }

      this.entries.push(entry);
    }
  }

  private async copyTemplateForAI(): Promise<void> {
    try {
      // Build template with beat names for AI to fill in
      const lines: string[] = [];
      lines.push('# Beat Momentum Scores (0-100)');
      lines.push('# Fill in scores for each beat based on the story progression:');
      lines.push('');
      
      for (const entry of this.entries) {
        // Use the clean beat name without the number prefix
        lines.push(`${entry.beatName}: `);
      }
      
      lines.push('');
      lines.push('# Note: Scores should be 0-100. Leave blank if unsure.');
      
      const template = lines.join('\n');
      await navigator.clipboard.writeText(template);
      
      new Notice('✓ Template copied! Paste into your AI and have it fill in the scores.');
    } catch (error) {
      console.error('[Gossamer] Failed to copy template:', error);
      new Notice('Failed to copy template to clipboard.');
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const clipboard = await navigator.clipboard.readText();
      const parsedScores = parseScoresFromClipboard(clipboard);
      
      if (parsedScores.size === 0) {
        new Notice('No scores found in clipboard. Expected format: "Beat Name: 42"');
        return;
      }

      // Populate input fields with parsed scores (case-insensitive matching)
      let matchCount = 0;
      for (const entry of this.entries) {
        const normalized = normalizeBeatName(entry.beatName);
        
        // Try exact match first
        let score = parsedScores.get(normalized);
        
        // If no exact match, try case-insensitive search
        if (score === undefined) {
          const normalizedLower = normalized.toLowerCase();
          for (const [key, value] of parsedScores.entries()) {
            if (key.toLowerCase() === normalizedLower) {
              score = value;
              break;
            }
          }
        }
        
        if (score !== undefined && entry.inputEl) {
          entry.inputEl.setValue(score.toString());
          entry.newScore = score;
          entry.inputEl.inputEl.removeClass('rt-input-error');
          matchCount++;
        }
      }

      new Notice(`Populated ${matchCount} scores from clipboard.`);
    } catch (error) {
      console.error('[Gossamer] Failed to paste from clipboard:', error);
      new Notice('Failed to read clipboard.');
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

