/*
 * Gossamer Score Entry Modal - Manual entry of beat momentum scores
 */
import { Modal, App, ButtonComponent, Notice, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { Scene } from '../main';
import { normalizeBeatName } from '../utils/gossamer';
import { parseScoresFromClipboard } from '../GossamerCommands';
import { getPlotSystem, detectPlotSystemFromNotes } from '../utils/beatsSystems';

interface BeatScoreEntry {
  beatTitle: string; // Full title like "1 Opening Image" or "5 Theme Stated 5%"
  beatName: string; // Normalized name for matching
  currentScore?: number; // Gossamer1 if it exists
  history: number[]; // Gossamer2, Gossamer3, etc.
  newScore?: number; // User-entered score
  inputEl?: TextComponent;
  scoresToDelete: Set<number>; // Track which Gossamer fields to delete (1, 2, 3, etc.)
  scoreDisplayEl?: HTMLElement; // Reference to the scores display element
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

  // Helper to create Lucide circle-x SVG icon
  private createCircleXIcon(): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'm15 9-6 6');
    
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'm9 9 6 6');
    
    svg.appendChild(circle);
    svg.appendChild(path1);
    svg.appendChild(path2);
    
    return svg;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    
    // Set modal width using Obsidian's approach
    if (modalEl) {
      modalEl.style.width = '800px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
      modalEl.style.maxWidth = '90vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
    }
    
    contentEl.addClass('rt-gossamer-score-modal');

    // Detect plot system from notes or use settings
    const detectedSystem = detectPlotSystemFromNotes(this.plotBeats);
    const settingsSystem = this.plugin.settings.beatSystem || 'Save The Cat';
    const plotSystemTemplate = getPlotSystem(settingsSystem);
    
    // Validate beat count
    const actualCount = this.plotBeats.length;
    const expectedCount = plotSystemTemplate?.beatCount || 15;
    const countMismatch = actualCount !== expectedCount;

    // Title with plot system name
    const titleText = `Gossamer momentum scores — ${settingsSystem}`;
    const titleEl = contentEl.createEl('h2', { text: titleText });
    titleEl.addClass('rt-gossamer-score-title');

    // Show warning if count mismatch
    if (countMismatch) {
      const warningEl = contentEl.createEl('div', {
        text: `⚠️ Expected ${expectedCount} beats for ${settingsSystem}, but found ${actualCount} Beat notes. Check your vault.`
      });
      warningEl.addClass('rt-gossamer-warning');
    }

    // Header section with border
    const headerSection = contentEl.createDiv('rt-gossamer-score-header');
    
    // Subtitle
    const subtitleEl = headerSection.createEl('p', {
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

      // Score row - compact layout with all scores and input on one line
      const scoreRow = entryDiv.createDiv('rt-gossamer-score-row');
      
      // Display existing scores with delete buttons
      const existingScoresEl = scoreRow.createDiv('rt-gossamer-existing-scores-container');
      entry.scoreDisplayEl = existingScoresEl;
      
      const renderScores = () => {
        existingScoresEl.empty();
        
        // Count total scores to display
        const totalScores = (entry.currentScore !== undefined && !entry.scoresToDelete.has(1) ? 1 : 0) + 
                           entry.history.filter((_, idx) => !entry.scoresToDelete.has(idx + 2)).length;
        
        // Current score (Gossamer1)
        if (entry.currentScore !== undefined && !entry.scoresToDelete.has(1)) {
          const scoreContainer = existingScoresEl.createDiv();
          scoreContainer.addClass('rt-gossamer-score-item-container');
          
          // Icon column
          const iconColumn = scoreContainer.createDiv();
          iconColumn.addClass('rt-gossamer-icon-column');
          iconColumn.appendChild(this.createCircleXIcon());
          
          // Text column
          const textColumn = scoreContainer.createDiv();
          textColumn.addClass('rt-gossamer-text-column');
          textColumn.textContent = `G1:${entry.currentScore}`;
          
          // Click handler for the entire container
          scoreContainer.addEventListener('click', () => {
            entry.scoresToDelete.add(1);
            renderScores();
          });
        }
        
        // History scores (Gossamer2, Gossamer3, etc.)
        entry.history.forEach((score, idx) => {
          const gossamerNum = idx + 2;
          if (entry.scoresToDelete.has(gossamerNum)) return;
          
          const scoreContainer = existingScoresEl.createDiv();
          scoreContainer.addClass('rt-gossamer-score-item-container');
          
          // Icon column
          const iconColumn = scoreContainer.createDiv();
          iconColumn.addClass('rt-gossamer-icon-column');
          iconColumn.appendChild(this.createCircleXIcon());
          
          // Text column
          const textColumn = scoreContainer.createDiv();
          textColumn.addClass('rt-gossamer-text-column');
          textColumn.textContent = `G${gossamerNum}:${score}`;
          
          // Click handler for the entire container
          scoreContainer.addEventListener('click', () => {
            entry.scoresToDelete.add(gossamerNum);
            renderScores();
          });
        });
        
        // Add count indicator if there are many scores
        if (totalScores > 10) {
          const countSpan = existingScoresEl.createSpan({ 
            text: `(${totalScores} scores)`,
            cls: 'rt-gossamer-score-count'
          });
        }
      };
      
      renderScores();

      // New score input (to the right)
      const inputLabel = scoreRow.createSpan({ text: 'New Score: ' });
      inputLabel.addClass('rt-gossamer-input-label');

      entry.inputEl = new TextComponent(scoreRow);
      entry.inputEl.inputEl.addClass('rt-gossamer-score-input');
      entry.inputEl.setPlaceholder('0-100');

      // Validate on input
      entry.inputEl.onChange((value) => {
        const num = parseInt(value);
        if (!isNaN(num) && num >= 0 && num <= 100) {
          entry.newScore = num;
          entry.inputEl?.inputEl.removeClass('rt-input-error');
        } else if (value.trim().length > 0) {
          entry.inputEl?.inputEl.addClass('rt-input-error');
          entry.newScore = undefined;
        } else {
          entry.inputEl?.inputEl.removeClass('rt-input-error');
          entry.newScore = undefined;
        }
      });
    });


    // Buttons
    const buttonContainer = contentEl.createDiv('rt-gossamer-score-buttons');

    new ButtonComponent(buttonContainer)
      .setButtonText('Copy template for AI')
      .setTooltip('Copy beat names in AI-ready format')
      .onClick(async () => {
        await this.copyTemplateForAI();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText('Paste from clipboard')
      .onClick(async () => {
        await this.pasteFromClipboard();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText('Delete all scores')
      .setWarning()
      .onClick(async () => {
        await this.deleteAllScores();
      });

    // Right-side button group
    const rightButtons = buttonContainer.createDiv('rt-gossamer-score-buttons-right');

    new ButtonComponent(rightButtons)
      .setButtonText('Save scores')
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

      const cache = this.plugin.app.metadataCache.getFileCache(file as any);
      const fm = cache?.frontmatter;

      const entry: BeatScoreEntry = {
        beatTitle: beat.title,
        beatName: normalizeBeatName(beat.title),
        history: [],
        scoresToDelete: new Set<number>()
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
        for (let i = 2; i <= 30; i++) {
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
        // Use the full beat title for better matching when pasting back
        lines.push(`${entry.beatTitle}: `);
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
        new Notice('No scores found in clipboard. Expected format: "1: 15, 2: 25" or "Beat Name: 42"');
        return;
      }

      // Check if this is positional format (keys start with __position_)
      const isPositionalFormat = Array.from(parsedScores.keys())[0]?.startsWith('__position_');
      
      let matchCount = 0;
      
      if (isPositionalFormat) {
        // Positional format: map by index
        for (let i = 0; i < this.entries.length; i++) {
          const entry = this.entries[i];
          const position = i + 1; // 1-based position
          const score = parsedScores.get(`__position_${position}`);
          
          if (score !== undefined && entry.inputEl) {
            entry.inputEl.setValue(score.toString());
            entry.newScore = score;
            entry.inputEl.inputEl.removeClass('rt-input-error');
            matchCount++;
          }
        }
        
        // Validate we got all expected scores
        const expectedCount = this.entries.length;
        if (matchCount < expectedCount) {
          new Notice(`⚠️ Warning: Pasted ${matchCount} scores but expected ${expectedCount}. Some beats may be missing scores.`);
        } else {
          new Notice(`✓ Populated all ${matchCount} scores from clipboard.`);
        }
      } else {
        // Named format: match by beat name (case-insensitive)
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
      }
    } catch (error) {
      console.error('[Gossamer] Failed to paste from clipboard:', error);
      new Notice('Failed to read clipboard.');
    }
  }

  private async saveScores(): Promise<void> {
    const scores = new Map<string, number>();
    const deletions = new Map<string, Set<number>>(); // beatTitle -> Set of Gossamer numbers to delete
    const errors: string[] = [];

    // Collect scores and deletions
    for (const entry of this.entries) {
      if (entry.newScore !== undefined) {
        scores.set(entry.beatTitle, entry.newScore);
      } else if (entry.inputEl && entry.inputEl.getValue().trim().length > 0) {
        errors.push(`Invalid score for "${entry.beatTitle}"`);
      }
      
      // Track deletions
      if (entry.scoresToDelete.size > 0) {
        deletions.set(entry.beatTitle, entry.scoresToDelete);
      }
    }

    if (errors.length > 0) {
      new Notice(`Errors: ${errors.join(', ')}`);
      return;
    }

    if (scores.size === 0 && deletions.size === 0) {
      new Notice('No changes to save.');
      return;
    }

    // Save scores and handle deletions
    try {
      // Only save new scores if there are any
      if (scores.size > 0) {
        await this.plugin.saveGossamerScores(scores);
      }
      
      // Process deletions if there are any
      if (deletions.size > 0) {
        await this.processDeletions(deletions);
      }
      
      const changeCount = scores.size + deletions.size;
      new Notice(`Updated ${changeCount} beat(s).`);
      this.close();
    } catch (error) {
      console.error('[Gossamer] Failed to save scores:', error);
      new Notice('Failed to save scores. Check console for details.');
    }
  }
  
  private async processDeletions(deletions: Map<string, Set<number>>): Promise<void> {
    // Get files from source path (same as saveGossamerScores)
    const sourcePath = this.plugin.settings.sourcePath || '';
    const allFiles = this.plugin.app.vault.getMarkdownFiles();
    const files = sourcePath 
      ? allFiles.filter(f => f.path.startsWith(sourcePath))
      : allFiles;
    
    for (const [beatTitle, gossamerNums] of deletions) {
      // Find Plot note by title (same logic as saveGossamerScores)
      let file = null;
      for (const f of files) {
        if (f.basename === beatTitle || f.basename === beatTitle.replace(/^\d+\s+/, '')) {
          const cache = this.plugin.app.metadataCache.getFileCache(f);
          const fm = cache?.frontmatter;
          if (fm && (fm.Class === 'Beat' || fm.Class === 'Plot')) {
            file = f;
            break;
          }
        }
      }
      
      if (!file) {
        console.warn(`[Gossamer] No Beat note found for beat: ${beatTitle}`);
        continue;
      }
      
      try {
        await this.plugin.app.fileManager.processFrontMatter(file, (yaml) => {
          const fm = yaml as Record<string, any>;
          
          // Delete specified Gossamer fields
          for (const num of gossamerNums) {
            delete fm[`Gossamer${num}`];
          }
        });
      } catch (error) {
        console.error(`[Gossamer] Failed to delete scores for ${beatTitle}:`, error);
      }
    }
  }

  private async deleteAllScores(): Promise<void> {
    // First check if there are any scores to delete
    const sourcePath = this.plugin.settings.sourcePath || '';
    const allFiles = this.plugin.app.vault.getMarkdownFiles();
    const files = sourcePath 
      ? allFiles.filter(f => f.path.startsWith(sourcePath))
      : allFiles;
    
    let hasAnyScores = false;
    for (const file of files) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      
      if (fm && (fm.Class === 'Plot' || fm.class === 'Plot')) {
        // Check if this file has any Gossamer scores
        for (let i = 1; i <= 30; i++) {
          if (fm[`Gossamer${i}`] !== undefined) {
            hasAnyScores = true;
            break;
          }
        }
        if (hasAnyScores) break;
      }
    }
    
    // If no scores found, show alert and return
    if (!hasAnyScores) {
      new Notice('No Gossamer scores found to delete.');
      return;
    }
    
    // Show confirmation dialog with improved styling
    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText('Delete all Gossamer scores');
      
      const content = modal.contentEl.createDiv();
      content.addClass('rt-gossamer-confirm-content');
      
      // Warning message with proper styling
      const warningEl = content.createEl('div', {
        text: 'This will permanently delete ALL Gossamer scores (Gossamer1-30) from ALL Beat notes. This action cannot be undone.'
      });
      warningEl.addClass('rt-gossamer-confirm-warning');
      
      // Button container with proper Obsidian styling
      const buttonContainer = content.createDiv('rt-gossamer-confirm-buttons');
      
      new ButtonComponent(buttonContainer)
        .setButtonText('Delete all scores')
        .setWarning()
        .onClick(async () => {
          modal.close();
          resolve(true);
        });
        
      new ButtonComponent(buttonContainer)
        .setButtonText('Cancel')
        .onClick(() => {
          modal.close();
          resolve(false);
        });
        
      modal.open();
    });
    
    if (!confirmed) return;
    
    try {
      let deletedCount = 0;
      
      for (const file of files) {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        
        if (fm && (fm.Class === 'Plot' || fm.class === 'Plot')) {
          // Check if this file has any Gossamer scores
          let hasGossamerScores = false;
          for (let i = 1; i <= 30; i++) {
            if (fm[`Gossamer${i}`] !== undefined) {
              hasGossamerScores = true;
              break;
            }
          }
          
          if (hasGossamerScores) {
            await this.plugin.app.fileManager.processFrontMatter(file, (yaml) => {
              const frontmatter = yaml as Record<string, any>;
              
              // Delete all Gossamer fields (Gossamer1-30)
              for (let i = 1; i <= 30; i++) {
                delete frontmatter[`Gossamer${i}`];
              }
            });
            deletedCount++;
          }
        }
      }
      
              new Notice(`✓ Deleted all Gossamer scores from ${deletedCount} Beat note(s).`);
      this.close(); // Close the modal since all scores are cleared
      
    } catch (error) {
      console.error('[Gossamer] Failed to delete all scores:', error);
      new Notice('Failed to delete all scores. Check console for details.');
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

