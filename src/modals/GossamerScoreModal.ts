/*
 * Gossamer Score Entry Modal - Manual entry of beat momentum scores
 */
import { Modal, App, ButtonComponent, Notice, TextComponent, TFile } from 'obsidian';
import { tooltip, tooltipForComponent } from '../utils/tooltip';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { normalizeBeatName, normalizeGossamerHistory } from '../utils/gossamer';
import { parseScoresFromClipboard } from '../GossamerCommands';
import { getPlotSystem } from '../utils/beatsSystems';

interface ScoreHistoryItem {
  index: number;
  value: number;
  justification?: string;
}

interface BeatScoreEntry {
  beatTitle: string; // Full title like "1 Opening Image" or "5 Theme Stated 5%"
  beatName: string; // Normalized name for matching
  currentScore?: number; // Latest score (highest Gossamer#)
  currentIndex?: number;
  currentJustification?: string;
  history: ScoreHistoryItem[]; // Older scores with their Gossamer numbers
  newScore?: number; // User-entered score
  inputEl?: TextComponent;
  scoresToDelete: Set<number>; // Track which Gossamer fields to delete (1, 2, 3, etc.)
  scoreDisplayEl?: HTMLElement; // Reference to the scores display element
  range?: string; // Ideal range from beat note (e.g., "0-20", "60-70")
  description?: string; // Beat purpose from YAML (legacy Description supported)
  beatPath?: string;
}

interface NormalizationIssue {
  beatTitle: string;
  missingSlots: number[];
  orphanJustifications: number[];
  hasRenumbering: boolean;
  changed: boolean;
}

export class GossamerScoreModal extends Modal {
  private plugin: RadialTimelinePlugin;
  private plotBeats: TimelineItem[];
  private entries: BeatScoreEntry[] = [];
  // Internal name retained for local state continuity; controls inclusion of Beat Purpose text.
  private includeBeatDescriptions = false;

  constructor(
    app: App,
    plugin: RadialTimelinePlugin,
    plotBeats: TimelineItem[]
  ) {
    super(app);
    this.plugin = plugin;
    this.plotBeats = plotBeats;
  }

  private analyzeNormalizationFrontmatter(frontmatter: Record<string, any>, beatTitle: string): NormalizationIssue {
    const maxHistory = 30;
    const missingSlots: number[] = [];
    const orphanJustifications: number[] = [];
    const indices: number[] = [];

    for (let i = 1; i <= maxHistory; i++) {
      const scoreKey = `Gossamer${i}`;
      const justKey = `Gossamer${i} Justification`;
      const rawScore = frontmatter[scoreKey];
      let numeric: number | undefined;

      if (typeof rawScore === 'number') {
        numeric = rawScore;
      } else if (typeof rawScore === 'string') {
        const parsed = parseInt(rawScore);
        if (!Number.isNaN(parsed)) numeric = parsed;
      }

      if (numeric !== undefined) {
        indices.push(i);
      } else if (typeof frontmatter[justKey] === 'string' && frontmatter[justKey].trim().length > 0) {
        orphanJustifications.push(i);
      }
    }

    let hasRenumbering = false;
    let expectedIndex = 1;
    for (const idx of indices) {
      if (idx !== expectedIndex) {
        hasRenumbering = true;
        while (expectedIndex < idx) {
          missingSlots.push(expectedIndex);
          expectedIndex++;
        }
      }
      expectedIndex = idx + 1;
    }

    const changed = hasRenumbering || orphanJustifications.length > 0;
    return { beatTitle, missingSlots, orphanJustifications, hasRenumbering, changed };
  }

  private async normalizeAllScores(): Promise<void> {
    const beatsToNormalize = this.plotBeats.filter(beat => beat.path);
    const normalizationIssues: NormalizationIssue[] = [];

    for (const beat of beatsToNormalize) {
      if (!beat.path) continue;
      const file = this.plugin.app.vault.getAbstractFileByPath(beat.path);
      if (!file || !(file instanceof TFile)) continue;

      const cache = this.plugin.app.metadataCache.getFileCache(file as any);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      const analysis = this.analyzeNormalizationFrontmatter(fm, beat.title || beat.path);
      if (analysis.changed) {
        normalizationIssues.push(analysis);
      }
    }

    const confirmMessage = normalizationIssues.length > 0
      ? `Will renumber and clean ${normalizationIssues.length} beat${normalizationIssues.length === 1 ? '' : 's'} with gaps or orphaned justifications. Back up your vault before running cleanup as a safety measure.`
      : 'No numbering gaps or orphaned Gossamer justifications were detected. Back up your vault before running cleanup.';

    new NormalizeConfirmationModal(
      this.app,
      confirmMessage,
      normalizationIssues,
      async () => {
        let changedCount = 0;

        for (const beat of beatsToNormalize) {
          if (!beat.path) continue;
          const file = this.plugin.app.vault.getAbstractFileByPath(beat.path);
          if (!file || !(file instanceof TFile)) continue;

          await this.plugin.app.fileManager.processFrontMatter(file, (yaml) => {
            const fm = yaml as Record<string, any>;
            const { normalized, changed } = normalizeGossamerHistory(fm);
            if (changed) {
              changedCount++;
              for (let i = 1; i <= 40; i++) {
                delete fm[`Gossamer${i}`];
                delete fm[`Gossamer${i} Justification`];
              }
              Object.assign(fm, normalized);
            }
          });
        }

        if (changedCount > 0) {
          new Notice(`Normalized Gossamer scores in ${changedCount} beat${changedCount === 1 ? '' : 's'}.`);
          this.close();
          const refreshed = new GossamerScoreModal(this.app, this.plugin, this.plotBeats);
          refreshed.open();
        } else {
          new Notice('No fragmented scores detected.');
        }
      }
    ).open();
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
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);

    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '15');
    line1.setAttribute('y1', '9');
    line1.setAttribute('x2', '9');
    line1.setAttribute('y2', '15');
    svg.appendChild(line1);

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '9');
    line2.setAttribute('y1', '9');
    line2.setAttribute('x2', '15');
    line2.setAttribute('y2', '15');
    svg.appendChild(line2);

    return svg;
  }


  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    // Set modal width using new generic system
    if (modalEl) {
      modalEl.style.width = '980px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
      modalEl.style.maxWidth = '98vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
      modalEl.style.maxHeight = '92vh'; // Prevent button clipping at bottom
      modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
    }

    contentEl.addClass('ert-modal-container', 'ert-stack', 'rt-gossamer-score-modal');

    // Use settings as source of truth for beat system
    const settingsSystem = this.plugin.settings.beatSystem || 'Save The Cat';
    
    // ... filtering logic ...

    // Filter beats based on settings (same logic as main.ts getSceneData)
    // Need to read Beat Model from metadata cache since it's not on Scene object
    const filteredBeats = this.plotBeats.filter(beat => {
      if (!beat.path) return false;

      const file = this.plugin.app.vault.getAbstractFileByPath(beat.path);
      if (!file) return false;

      const cache = this.plugin.app.metadataCache.getFileCache(file as any);
      const fm = cache?.frontmatter;
      const beatModel = fm?.["Beat Model"] as string | undefined;

      if (settingsSystem === 'Custom') {
        // For Custom, only show beats WITHOUT recognized Beat Models
        // OR beats that match the custom system name if defined
        const customName = this.plugin.settings.customBeatSystemName;
        if (customName && beatModel === customName) {
            return true;
        }

        const recognizedSystems = ['Save The Cat', 'Hero\'s Journey', 'Story Grid'];
        return !beatModel || !recognizedSystems.includes(beatModel);
      } else {
        // For specific systems, only show beats that match the selected system
        return beatModel === settingsSystem;
      }
    });

    // Use filtered beats for entry building
    this.plotBeats = filteredBeats;

    let plotSystemTemplate = getPlotSystem(settingsSystem);
    
    // Support Custom Dynamic System Template
    if (settingsSystem === 'Custom' && this.plugin.settings.customBeatSystemName && this.plugin.settings.customBeatSystemBeats?.length) {
        plotSystemTemplate = {
            name: this.plugin.settings.customBeatSystemName,
            // Persisted beats are objects ({ name, act }); template expects names
            beats: this.plugin.settings.customBeatSystemBeats.map(b => b.name),
            beatDetails: this.plugin.settings.customBeatSystemBeats.map(b => ({ name: b.name, description: '', range: '' })),
            beatCount: this.plugin.settings.customBeatSystemBeats.length
        };
    }

    // Validate beat count (only when template exists)
    const actualCount = filteredBeats.length;
    const countMismatch = plotSystemTemplate ? actualCount !== (plotSystemTemplate.beatCount || plotSystemTemplate.beats.length) : false;

    // Validate Range fields (filter by beat system but ignore title matching)
    // NOTE: Temporarily disabled - metadata cache not refreshing Range field
    // const rangeValidation = validateBeatRanges(filteredBeats, settingsSystem);

    // Title with plot system name rendered in hero card
    const headerEl = contentEl.createDiv({ cls: 'ert-modal-header' });
    headerEl.createSpan({ text: 'Gossamer momentum', cls: 'ert-modal-badge' });
    headerEl.createDiv({ text: `${settingsSystem} beat system`, cls: 'ert-modal-title' });
    const heroSubtitle = headerEl.createDiv({ cls: 'ert-modal-subtitle' });
    heroSubtitle.setText('Enter momentum scores (0-100) for each beat. Previous scores will be saved as history.');
    const heroMeta = headerEl.createDiv({ cls: 'ert-modal-meta' });
    heroMeta.createSpan({ text: `Beats detected: ${actualCount}`, cls: 'ert-modal-meta-item' });

    // Show warning if no beats match
    if (actualCount === 0) {
      const noBeatsWarning = contentEl.createEl('div', {
        text: settingsSystem === 'Custom'
          ? `⚠️ No custom story beats found. Create notes with "Class: Beat" without "Beat Model" field, or change beat system in Settings.`
          : `⚠️ No story beats found with "Beat Model: ${settingsSystem}". Check your beat notes have the correct Beat Model field, or change beat system in Settings.`
      });
      noBeatsWarning.addClass('rt-gossamer-warning');
    } else if (countMismatch && plotSystemTemplate) {
      const warningEl = contentEl.createEl('div', {
        text: `⚠️ Expected ${plotSystemTemplate.beatCount} beats for ${settingsSystem}, but found ${actualCount} story beats with matching Beat Model. Check your vault.`
      });
      warningEl.addClass('rt-gossamer-warning');
    }

    // Range validation warning disabled - metadata cache issue
    // if (!rangeValidation.valid && rangeValidation.missingRangeBeats.length > 0) {
    //   const rangeWarningEl = contentEl.createEl('div');
    //   rangeWarningEl.addClass('rt-gossamer-warning');
    //   
    //   const count = rangeValidation.missingRangeBeats.length;
    //   const beatList = rangeValidation.missingRangeBeats.slice(0, 3).join(', ');
    //   const more = count > 3 ? `, and ${count - 3} more` : '';
    //   
    //   rangeWarningEl.setText(
    //     `⚠️ ${count} beat${count > 1 ? 's' : ''} missing ideal Range (e.g., "0-20", "71-90"): ${beatList}${more}. ` +
    //     `Add "Range: 0-20" to beat note frontmatter. Scores outside ideal range will show thicker red y-axis spokes.`
    //   );
    // }

    // Scrollable list of beat scores
    const scoresContainer = contentEl.createDiv('rt-container');

    // Build entries from plot beats
    this.buildEntries();

    // Render each beat entry
    this.entries.forEach((entry, index) => {
      const entryDiv = scoresContainer.createDiv('rt-gossamer-score-entry');

      // First row: Beat title, justification, and new score input
      const firstRow = entryDiv.createDiv('rt-gossamer-score-row');

      // 1. Left side: Beat title with range
      const titleContainer = firstRow.createDiv('rt-gossamer-beat-title-container');
      const beatTitleEl = titleContainer.createEl('span', { text: entry.beatTitle });
      beatTitleEl.addClass('rt-gossamer-beat-title');

      if (entry.range) {
        const rangeEl = titleContainer.createEl('span', { text: ` (${entry.range})` });
        rangeEl.addClass('rt-gossamer-beat-range');
      }

      // 2. Middle: Latest justification (if any)
      const justificationContainer = firstRow.createDiv('rt-gossamer-justification-container');
      if (entry.currentJustification) {
        const currentNote = justificationContainer.createDiv('rt-gossamer-current-justification');
        currentNote.setText(`${entry.currentJustification}`);
      }

      // 3. Right side: New score input
      const inputContainer = firstRow.createDiv('rt-gossamer-input-container');
      const inputLabel = inputContainer.createSpan({ text: 'Enter score' });
      inputLabel.addClass('rt-gossamer-input-label');

      entry.inputEl = new TextComponent(inputContainer);
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

      // Second row: Existing scores with delete buttons
      const secondRow = entryDiv.createDiv('rt-gossamer-scores-history-row');
      const existingScoresEl = secondRow.createDiv('rt-gossamer-existing-scores-container');
      entry.scoreDisplayEl = existingScoresEl;

      const renderScores = () => {
        existingScoresEl.empty();

        const createScoreCard = (gossamerNum: number, score: number, justification?: string) => {
          const scoreContainer = existingScoresEl.createDiv();
          scoreContainer.addClass('rt-gossamer-score-item-container');
          scoreContainer.setAttribute('data-gossamer-num', gossamerNum.toString());

          // Header row: Icon + Label + Value (Centered)
          const headerRow = scoreContainer.createDiv('rt-gossamer-score-header');

          const iconColumn = headerRow.createDiv();
          iconColumn.addClass('rt-gossamer-icon-column');
          iconColumn.appendChild(this.createCircleXIcon());

          headerRow.createSpan({
            text: `G${gossamerNum}`,
            cls: 'rt-gossamer-score-label'
          });
          
          headerRow.createSpan({
            text: `${score}`,
            cls: 'rt-gossamer-score-value'
          });

          // Body row: Justification (Full width)
          if (justification) {
            const justEl = scoreContainer.createDiv({
              text: justification,
              cls: 'rt-gossamer-score-justification'
            });
            tooltip(justEl, justification, 'bottom');
          }

          scoreContainer.addEventListener('click', () => {
            entry.scoresToDelete.add(gossamerNum);
            renderScores();
          });
        };

        // Count total scores to display
        const totalScores =
          (entry.currentScore !== undefined &&
            entry.currentIndex !== undefined &&
            !entry.scoresToDelete.has(entry.currentIndex) ? 1 : 0) +
          entry.history.filter(item => !entry.scoresToDelete.has(item.index)).length;

        // Existing scores oldest → newest
        entry.history.forEach(item => {
          if (entry.scoresToDelete.has(item.index)) return;
          createScoreCard(item.index, item.value, item.justification);
        });

        if (entry.currentScore !== undefined &&
          entry.currentIndex !== undefined &&
          !entry.scoresToDelete.has(entry.currentIndex)) {
          createScoreCard(entry.currentIndex, entry.currentScore, entry.currentJustification);
        }

        // Add count indicator if there are many scores
        if (totalScores > 10) {
          const countSpan = existingScoresEl.createSpan({
            text: `(${totalScores} scores)`,
            cls: 'rt-gossamer-score-count'
          });
        }
      };

      renderScores();
    });


    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'rt-stack rt-stack-loose' });
    const topActions = buttonContainer.createDiv({ cls: 'rt-row rt-row-wrap' });
    const bottomActions = buttonContainer.createDiv({ cls: 'rt-row rt-row-wrap rt-row-end' });

    const pasteBtn = new ButtonComponent(topActions)
      .setButtonText('Paste scores')
      .onClick(async () => {
        await this.pasteFromClipboard();
      });

    const copyBtn = new ButtonComponent(topActions)
      .setButtonText('Copy template for AI')
      .setTooltip('Copy beat names in AI-ready format')
      .onClick(async () => {
        await this.copyTemplateForAI();
      });

    const toggleLabel = topActions.createEl('label', { cls: 'rt-gossamer-copy-toggle' });
    const toggleInput = toggleLabel.createEl('input', { type: 'checkbox' });
    toggleInput.checked = this.includeBeatDescriptions;
    toggleInput.addEventListener('change', () => {
      this.includeBeatDescriptions = toggleInput.checked;
    });
    toggleLabel.createSpan({ text: 'Include beat purposes when copying template' });

    const normalizeBtn = new ButtonComponent(bottomActions)
      .setButtonText('Normalize history')
      .setTooltip('Remove gaps and orphaned notes from Gossamer runs')
      .onClick(async () => {
        await this.normalizeAllScores();
      });

    const saveBtn = new ButtonComponent(bottomActions)
      .setButtonText('Save scores')
      .setCta()
      .onClick(async () => {
        await this.saveScores();
      });

    const deleteBtn = new ButtonComponent(bottomActions)
      .setButtonText('Delete scores')
      .setWarning()
      .onClick(async () => {
        await this.deleteAllScores();
      });

    const cancelBtn = new ButtonComponent(bottomActions)
      .setButtonText('Cancel')
      .onClick(() => {
        this.close();
      });

    // Tooltips with centered bubble arrow (bottom placement)
    tooltipForComponent(pasteBtn, 'Paste scores from clipboard', 'bottom');
    tooltipForComponent(copyBtn, 'Copy beat names for AI prompts', 'bottom');
    tooltip(toggleLabel, 'Include beat purposes when copying template', 'bottom');
    tooltipForComponent(normalizeBtn, 'Cleanup score history gaps', 'bottom');
    tooltipForComponent(saveBtn, 'Save new scores and deletions', 'bottom');
    tooltipForComponent(deleteBtn, 'Delete all scores for these beats', 'bottom');
    tooltipForComponent(cancelBtn, 'Close without saving', 'bottom');
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
        beatPath: beat.path,
        history: [],
        scoresToDelete: new Set<number>()
      };

      if (fm) {
        // Get Range field directly from metadata cache
        if (typeof fm.Range === 'string') {
          entry.range = fm.Range;
        }
        if (typeof fm.Purpose === 'string') {
          entry.description = fm.Purpose;
        } else if (typeof fm.Description === 'string') {
          entry.description = fm.Description;
        } else if (typeof fm.description === 'string') {
          entry.description = fm.description;
        }

        const scores: ScoreHistoryItem[] = [];
        let hasAnyScores = false;
        for (let i = 1; i <= 30; i++) {
          const key = `Gossamer${i}`;
          const value = fm[key];
          let numeric: number | undefined;
          if (typeof value === 'number') {
            numeric = value;
          } else if (typeof value === 'string') {
            const parsed = parseInt(value);
            if (!isNaN(parsed)) numeric = parsed;
          }

          if (numeric !== undefined) {
            hasAnyScores = true;
            const justificationKey = `Gossamer${i} Justification`;
            const justificationValue = fm[justificationKey];
            scores.push({ index: i, value: numeric });
            if (typeof justificationValue === 'string' && justificationValue.trim().length > 0) {
              scores[scores.length - 1].justification = justificationValue;
            }
          } else {
            const orphanJustKey = `Gossamer${i} Justification`;
            if (typeof fm[orphanJustKey] === 'string') {
              // Remove orphaned justification entries (handled during cleanup)
            }
          }
        }

        if (hasAnyScores && scores.length > 0) {
          const latest = scores[scores.length - 1];
          entry.currentScore = latest.value;
          entry.currentIndex = latest.index;
          entry.currentJustification = latest.justification;
          entry.history = scores.slice(0, -1);
        }
      }

      this.entries.push(entry);
    }
  }

  private async copyTemplateForAI(): Promise<void> {
    try {
      // Get beat system name for context
      const settingsSystem = this.plugin.settings.beatSystem || 'Save The Cat';

      const { name: contextTemplateName, prompt: contextPrompt } = this.getActiveAiContextInfo();

      // Build template with beat names and ideal ranges
      const lines: string[] = [];
      lines.push(`# Beat Momentum Scores (0-100) — ${settingsSystem}`);
      lines.push('');
      if (contextPrompt) {
        lines.push('## Role & Manuscript Context');
        if (contextTemplateName) {
          lines.push(`Template: ${contextTemplateName}`);
        }
        lines.push(contextPrompt.trim());
        lines.push('Consult the complete manuscript and knowledge base for this project before assigning momentum scores.');
        lines.push('');
      }
      if (this.entries.length === 0) {
        new Notice('No beats available to copy. Add Beat notes with the selected Beat Model first.');
        return;
      }

      lines.push('## Story Beats Template Guidance');
      lines.push(this.includeBeatDescriptions
        ? 'Purposes are pulled directly from each beat note\'s Purpose field (legacy Description supported).'
        : 'Update each beat note\'s Range and Purpose fields to customize this list. Toggle above to include purposes.');
      lines.push('');

      const missingRangeBeats: string[] = [];
      const missingPurposeBeats: string[] = [];

      this.entries.forEach((entry, index) => {
        const metadataParts: string[] = [];
        if (entry.range && entry.range.trim().length > 0) {
          metadataParts.push(`Ideal momentum: ${entry.range}`);
        } else {
          missingRangeBeats.push(entry.beatTitle);
        }
        const metadata = metadataParts.length > 0 ? ` (${metadataParts.join(' • ')})` : '';
        lines.push(`${index + 1}. ${entry.beatTitle}${metadata}`);
        if (this.includeBeatDescriptions) {
          if (entry.description && entry.description.trim().length > 0) {
            lines.push(`   ${entry.description.trim()}`);
          } else {
            missingPurposeBeats.push(entry.beatTitle);
          }
        }
        lines.push('');
      });
      lines.push('## Momentum Scale:');
      lines.push('- 0-20: Quiet, establishing, low tension');
      lines.push('- 21-40: Building, complications emerging');
      lines.push('- 41-60: Rising stakes, conflict developing');
      lines.push('- 61-80: High tension, major conflicts');
      lines.push('- 81-100: Peak tension, climactic moments');
      lines.push('');
      lines.push('## Consider for each beat:');
      lines.push('- Tension and conflict level');
      lines.push('- Stakes for protagonist');
      lines.push('- Emotional intensity');
      lines.push('- Pacing and urgency');
      lines.push('');
      lines.push('## Output Instructions:');
      lines.push('- Respond with the block titled "## Completed Momentum Scores" exactly as shown below.');
      lines.push('- Replace the blank after each colon with a single integer from 0-100 (no percentage signs or trailing commentary).');
      lines.push('- Keep the beat order identical so the response can be copied directly into the Obsidian modal.');
      lines.push('- Favor the ideal range when it fits the manuscript context, but you may go outside the range if justified by the story.');
      lines.push('');
      lines.push('## Completed Momentum Scores');
      lines.push('');

      for (const entry of this.entries) {
        // Include ideal range if available
        if (entry.range) {
          lines.push(`${entry.beatTitle} (ideal: ${entry.range}): `);
        } else {
          lines.push(`${entry.beatTitle}: `);
        }
      }

      lines.push('');
      lines.push('# Note: After filling in the numbers, return ONLY the "Completed Momentum Scores" block so it can be pasted back into Obsidian.');

      const template = lines.join('\n');
      await navigator.clipboard.writeText(template);

      new Notice('✓ Template copied! Paste into your AI and have it fill in the scores.');

      if (missingRangeBeats.length > 0) {
        this.showMetadataWarning('Range', missingRangeBeats);
      }
      if (this.includeBeatDescriptions && missingPurposeBeats.length > 0) {
        this.showMetadataWarning('Purpose', missingPurposeBeats);
      }
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
        continue;
      }

      try {
        await this.plugin.app.fileManager.processFrontMatter(file, (yaml) => {
          const fm = yaml as Record<string, any>;

          // Delete specified Gossamer fields
          for (const num of gossamerNums) {
            delete fm[`Gossamer${num}`];
            delete fm[`Gossamer${num} Justification`];
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

      if (fm && (fm.Class === 'Beat' || fm.class === 'Beat')) {
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
      const { modalEl, contentEl } = modal;
      modal.titleEl.setText('');
      contentEl.empty();
      
      modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
      contentEl.addClass('ert-modal-container', 'ert-stack', 'rt-gossamer-score-modal');

      const hero = contentEl.createDiv({ cls: 'ert-modal-header' });
      hero.createSpan({ text: 'Warning', cls: 'ert-modal-badge' });
      hero.createDiv({ text: 'Delete all Gossamer scores', cls: 'ert-modal-title' });
      hero.createDiv({ cls: 'ert-modal-subtitle', text: 'This action cannot be undone.' });

      const card = contentEl.createDiv({ cls: 'rt-glass-card' });

      // Warning message with proper styling
      const warningEl = card.createDiv({
        text: 'This will permanently delete ALL Gossamer scores (Gossamer1-30) and their justifications from ALL Beat notes.',
        cls: 'rt-gossamer-confirm-warning'
      });

      // Button container with proper styling
      const buttonContainer = contentEl.createDiv({ cls: 'rt-row rt-row-end' });

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

        if (fm && (fm.Class === 'Beat' || fm.class === 'Beat')) {
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

              // Delete all Gossamer fields (Gossamer1-30) and their justifications
              for (let i = 1; i <= 30; i++) {
                delete frontmatter[`Gossamer${i}`];
                delete frontmatter[`Gossamer${i} Justification`];
              }

              // Also delete the Last Updated field
              delete frontmatter['Gossamer Last Updated'];
            });
            deletedCount++;
          }
        }
      }

      new Notice(`✓ Deleted all Gossamer scores and justifications from ${deletedCount} Beat note(s).`);
      this.close(); // Close the modal since all scores are cleared

    } catch (error) {
      console.error('[Gossamer] Failed to delete all scores:', error);
      new Notice('Failed to delete all scores. Check console for details.');
    }
  }

  private showMetadataWarning(field: string, beats: string[]): void {
    const preview = beats.slice(0, 3).join(', ');
    const remainder = beats.length > 3 ? `, +${beats.length - 3} more` : '';
    new Notice(`Missing ${field} in Beat frontmatter for: ${preview}${remainder}. Update the beat notes to customize the AI template.`);
  }

  private getActiveAiContextInfo(): { name: string; prompt: string } {
    const templates = this.plugin.settings.aiContextTemplates || [];
    const activeId = this.plugin.settings.activeAiContextTemplateId;
    const active = templates.find(t => t.id === activeId) || templates[0];
    if (active) {
      return { name: active.name, prompt: active.prompt };
    }
    return {
      name: 'Generic Editor',
      prompt: 'Act as a developmental editor evaluating narrative momentum, emotional stakes, and pacing across the manuscript beats.'
    };
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class NormalizeConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly message: string,
    private readonly issues: NormalizationIssue[],
    private readonly onConfirm: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, modalEl, titleEl } = this;
    titleEl.setText('');
    contentEl.empty();

    if (modalEl) {
      modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
    }
    contentEl.addClass('ert-modal-container', 'ert-stack', 'rt-gossamer-score-modal');

    const hero = contentEl.createDiv({ cls: 'ert-modal-header' });
    hero.createSpan({ text: 'Warning', cls: 'ert-modal-badge' });
    hero.createDiv({ text: 'Normalize Gossamer history?', cls: 'ert-modal-title' });
    hero.createDiv({ cls: 'ert-modal-subtitle', text: 'This action cannot be undone.' });

    const card = contentEl.createDiv({ cls: 'rt-glass-card' });

    card.createDiv({ cls: 'rt-purge-message' }).setText(this.message);

    if (this.issues.length > 0) {
      const issuesEl = card.createDiv({ cls: 'rt-purge-issues' });
      issuesEl.createEl('h3', { text: 'Beats to normalize', cls: 'rt-purge-issues-title' });

      const listEl = issuesEl.createEl('ul', { cls: 'rt-purge-issues-list' });
      const preview = this.issues.slice(0, 6);

      preview.forEach(issue => {
        const item = listEl.createEl('li', { cls: 'rt-purge-issues-item' });
        item.createEl('strong', { text: issue.beatTitle });

        const details: string[] = [];

        if (issue.missingSlots.length > 0) {
          const gapLabel = issue.missingSlots.length === 1 ? 'Gap' : 'Gaps';
          const gapList = issue.missingSlots.map(slot => `G${slot}`).join(', ');
          details.push(`${gapLabel}: ${gapList}`);
        } else if (issue.hasRenumbering) {
          details.push('Out-of-order numbering');
        }

        if (issue.orphanJustifications.length > 0) {
          const orphanList = issue.orphanJustifications.map(slot => `G${slot}`).join(', ');
          details.push(`Orphaned justification${issue.orphanJustifications.length === 1 ? '' : 's'}: ${orphanList}`);
        }

        item.createSpan({ text: details.join(' • ') || 'Will compact numbering' });
      });

      if (this.issues.length > preview.length) {
        issuesEl.createDiv({
          cls: 'rt-purge-issues-footnote',
          text: `+${this.issues.length - preview.length} more beat${this.issues.length - preview.length === 1 ? '' : 's'} will be cleaned.`
        });
      }
    } else {
      card.createDiv({
        cls: 'rt-purge-message rt-purge-message-secondary',
        text: 'No gaps detected. Normalization will simply compact numbering and remove stray justification fields.'
      });
    }

    const warningEl = card.createDiv({ cls: 'rt-pulse-warning' });
    warningEl.createEl('strong', { text: 'Are you sure you want to proceed?' });

    const buttonRow = contentEl.createDiv({ cls: 'rt-row rt-row-end' });
    new ButtonComponent(buttonRow)
      .setButtonText('Normalize')
      .setWarning()
      .onClick(() => {
        this.close();
        this.onConfirm();
      });

    new ButtonComponent(buttonRow)
      .setButtonText('Cancel')
      .onClick(() => this.close());
  }
}
