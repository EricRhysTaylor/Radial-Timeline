/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import type RadialTimelinePlugin from './main';
import type { TimelineItem } from './types';
import type { HoverMetadataField } from './types/settings';
import { decodeHtmlEntities, parseSceneTitleComponents, splitIntoBalancedLines } from './utils/text';
import { getPublishStageStyle, splitSynopsisLines, decodeContentLines, isOverdueAndIncomplete } from './synopsis/SynopsisData';
import { createSynopsisContainer, createTextGroup, createText } from './synopsis/SynopsisView';
import { convertFromEarth, getActivePlanetaryProfile } from './utils/planetaryTime';
import { t } from './i18n';
import {
  SUBPLOT_OUTER_RADIUS_MAINPLOT,
  SUBPLOT_OUTER_RADIUS_STANDARD,
  SUBPLOT_OUTER_RADIUS_CHRONOLOGUE,
  SYNOPSIS_INSET
} from './renderer/layout/LayoutConstants';
import { adjustBeatLabelsAfterRender } from './renderer/dom/BeatLabelAdjuster';
import { sortScenes, isBeatNote, shouldDisplayMissingWhenWarning } from './utils/sceneHelpers';
import { parseWhenField } from './utils/date';
import { getReadabilityMultiplier, getReadabilityScale } from './utils/readability';
import { isAlienModeActive } from './view/interactions/ChronologueShiftController';
import { getIcon } from 'obsidian';

/**
 * Handles generating synopsis SVG/HTML blocks and positioning logic.
 * (This is the class you formerly had inside main.ts, unchanged.)
 */
export default class SynopsisManager {
  private plugin: RadialTimelinePlugin;

  /** Vertical offset for planetary time dashed border rect (higher = further up) */
  private static readonly PLANETARY_RECT_Y_OFFSET = 16;

  constructor(plugin: RadialTimelinePlugin) {
    this.plugin = plugin;
  }

  private getReadabilityScale(): number {
    return getReadabilityMultiplier(this.plugin.settings as any);
  }

  private parseHtmlSafely(html: string): DocumentFragment {
    // Use DOMParser to parse the HTML string
    const parser = new DOMParser();
    // Wrap with a root element to ensure proper parsing
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');

    // Extract the content from the wrapper div
    const container = doc.querySelector('div');
    const fragment = document.createDocumentFragment();

    if (container) {
      // Move all child nodes to our fragment
      while (container.firstChild) {
        fragment.appendChild(container.firstChild);
      }
    }

    return fragment;
  }

  /**
   * Format date from When field to friendly format for display
   * @param when Date object from scene.when
   * @returns Formatted date string (e.g., "Aug 1, 1812 @ 8AM" or "Apr 6, 1812 @ Noon" or "Apr 6, 1812 @ Midnight")
   */
  private formatDateForDisplay(when: Date | undefined): string {
    if (!when) {
      return '';
    }
    if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
      throw new Error('formatDateForDisplay requires a valid Date object');
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[when.getMonth()];
    const day = when.getDate();
    const year = when.getFullYear();
    const hours = when.getHours();
    const minutes = when.getMinutes();

    let dateStr = `${month} ${day}, ${year}`;

    if (hours === 0 && minutes === 0) {
      dateStr += ' @ Midnight';
    } else if (hours === 12 && minutes === 0) {
      dateStr += ' @ Noon';
    } else {
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 === 0 ? 12 : hours % 12;
      if (minutes === 0) {
        dateStr += ` @ ${displayHours}${period}`;
      } else {
        dateStr += ` @ ${displayHours}:${String(minutes).padStart(2, '0')}${period}`;
      }
    }

    return dateStr;
  }

  private buildPlanetaryLine(scene: TimelineItem): string | null {
    if (!scene.when) return null;
    const settings = this.plugin.settings as any;
    const profile = getActivePlanetaryProfile(settings);
    if (!profile) return null;
    const conversion = convertFromEarth(scene.when, profile);
    if (!conversion) return null;
    const label = (profile.label || 'LOCAL').toUpperCase();
    return `${label}: ${conversion.formatted}`;
  }

  /**
   * Add title content to a text element safely
   * @param titleContent The title content to add
   * @param titleTextElement The text element to add to
   * @param titleColor The color for the title
   * @param sceneNumber Optional scene number from frontmatter
   * @param sceneDate Optional scene date from frontmatter (should be pre-formatted)
   * @param sceneDuration Optional scene duration from frontmatter
   */
  /**
   * Add title content to the title text element
   * Returns a metadata text element if date/duration exist, otherwise null
   */
  private addTitleContent(titleContent: string, titleTextElement: SVGTextElement, titleColor: string, sceneNumber?: number | null, sceneDate?: string, sceneDuration?: string): SVGTextElement | null {
    if (titleContent.includes('<tspan')) {

      // For pre-formatted HTML with tspans, parse safely
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<svg><text>${titleContent}</text></svg>`, 'image/svg+xml');
      const textNode = doc.querySelector('text');

      if (!textNode) {
        const fallbackTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        fallbackTspan.setAttribute("fill", titleColor);
        fallbackTspan.appendChild(document.createTextNode(titleContent));
        titleTextElement.appendChild(fallbackTspan);
        return null;
      }

      Array.from(textNode.childNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'tspan') {
          const tspan = node as Element;
          const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");

          Array.from(tspan.attributes).forEach(attr => {
            svgTspan.setAttribute(attr.name, attr.value);
          });

          if (tspan instanceof HTMLElement || tspan instanceof SVGElement) {
            const style = (tspan as HTMLElement).getAttribute('style');
            if (style) {
              svgTspan.setAttribute('style', style);
            }
          }

          svgTspan.textContent = tspan.textContent;
          titleTextElement.appendChild(svgTspan);

        } else if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent) {
            titleTextElement.appendChild(document.createTextNode(node.textContent));
          }
        }
      });

      return null; // Pre-formatted content doesn't have separate metadata

    } else {
      // Non-search case: render title with date and duration
      const titleParts = parseSceneTitleComponents(titleContent, sceneNumber, sceneDate, sceneDuration);

      // Add scene number if it exists
      if (titleParts.sceneNumber) {
        const numTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        numTspan.classList.add('rt-scene-title-bold');
        numTspan.setAttribute("data-item-type", "title");
        numTspan.style.setProperty('--rt-dynamic-color', titleColor);
        numTspan.textContent = `${titleParts.sceneNumber} `;
        titleTextElement.appendChild(numTspan);
      }

      // Add main title
      const mainTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      mainTspan.classList.add('rt-scene-title-bold');
      mainTspan.setAttribute("data-item-type", "title");
      mainTspan.style.setProperty('--rt-dynamic-color', titleColor);
      mainTspan.textContent = titleParts.title;
      titleTextElement.appendChild(mainTspan);


      // Create separate date/time and duration element (Column 2 of title row)
      // This is the mini-block positioned to the right of the main scene title
      if (titleParts.date || titleParts.duration) {
        const metadataElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
        metadataElement.setAttribute("class", "rt-info-text rt-title-text-main rt-title-date-time");
        metadataElement.setAttribute("x", "0");
        metadataElement.setAttribute("y", "0"); // Same baseline as title, layout handled later
        metadataElement.setAttribute("text-anchor", "start");
        metadataElement.setAttribute("data-metadata-block", "true");
        metadataElement.setAttribute("data-column-gap", `8px`); // default gap in px

        // Row 1: Date/time (at baseline, same as title)
        if (titleParts.date) {
          const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          dateTspan.setAttribute('class', 'rt-date-text');
          dateTspan.setAttribute('data-item-type', 'date');
          dateTspan.setAttribute('data-column-role', 'date');
          dateTspan.setAttribute('dy', `-16px`); // Lift slightly so smaller text sits with title cap height
          dateTspan.textContent = titleParts.date;
          metadataElement.appendChild(dateTspan);
        }

        // Row 2: Duration (on new line, aligned with date start)
        if (titleParts.duration) {
          const durationTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          durationTspan.setAttribute('class', 'rt-duration-text');
          durationTspan.setAttribute('data-item-type', 'duration');
          durationTspan.setAttribute('data-column-role', 'duration');
          durationTspan.setAttribute('x', '0'); // Will be positioned in layout step
          durationTspan.setAttribute('dy', titleParts.date ? `16px` : '0'); // New line only if date exists
          durationTspan.textContent = titleParts.duration;
          metadataElement.appendChild(durationTspan);
        }

        return metadataElement;
      }
    }

    return null; // No metadata to add
  }


  /**
   * Create a DOM element for a scene synopsis with consistent formatting
   * @returns An SVG group element containing the formatted synopsis
   */
  generateElement(scene: TimelineItem, contentLines: string[], sceneId: string, subplotIndexResolver?: (name: string) => number): SVGGElement {
    const { stageClass, titleColor: defaultTitleColor } = getPublishStageStyle(scene["Publish Stage"], this.plugin.settings.publishStageColors);
    const fontScale = this.getReadabilityScale();
    
    // Determine beat-specific Gossamer stage color (latest Gossamer run), fallback to publish stage color
    const stageColors = this.plugin.settings.publishStageColors || { Zero: '#9370DB', Author: '#4169E1', House: '#228B22', Press: '#FF8C00' };
    let beatStageColor: string | null = null;
    if (scene.itemType === 'Beat' || scene.itemType === 'Plot') {
      const fm = scene.rawFrontmatter || {};
      for (let i = 30; i >= 1; i--) {
        const scoreKey = `Gossamer${i}`;
        const stageKey = `GossamerStage${i}`;
        if (fm[scoreKey] !== undefined && fm[scoreKey] !== null) {
          const stage = fm[stageKey];
          if (typeof stage === 'string') {
            beatStageColor = stageColors[stage as keyof typeof stageColors] || stageColors.Zero;
          }
          break;
        }
      }
    }
    const titleColor = beatStageColor || defaultTitleColor;

    const { synopsisEndIndex, metadataItems } = splitSynopsisLines(contentLines);

    // Process all content lines to decode any HTML entities
    const decodedContentLines = decodeContentLines(contentLines);

    // Deterministic subplot color from stylesheet variables
    const getSubplotColor = (subplot: string, sceneIdentifier: string): string => {
      const resolveCssVariable = (index: number): string => {
        const normalizedIndex = Math.max(0, index) % 15;
        const varName = `--rt-subplot-colors-${normalizedIndex}`;
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (!value) {
          throw new Error(`CSS variable ${varName} is not defined for subplot coloring.`);
        }
        return value;
      };

      const resolveIndex = (): number => {
        if (subplotIndexResolver) {
          const resolved = subplotIndexResolver(subplot);
          if (!Number.isFinite(resolved)) {
            throw new Error(`Subplot index resolver returned an invalid value for "${subplot}".`);
          }
          return resolved;
        }

        const sceneGroup = document.getElementById(sceneIdentifier)?.closest('.scene-group') as HTMLElement | null;
        if (!sceneGroup) {
          throw new Error(`Scene group not found for synopsis ${sceneIdentifier}.`);
        }
        const idxAttr = sceneGroup.getAttribute('data-subplot-color-index') || sceneGroup.getAttribute('data-subplot-index');
        if (!idxAttr) {
          throw new Error(`Scene group for ${sceneIdentifier} is missing data-subplot-index.`);
        }
        const parsed = parseInt(idxAttr, 10);
        if (Number.isNaN(parsed)) {
          throw new Error(`Invalid subplot index "${idxAttr}" for scene ${sceneIdentifier}.`);
        }
        return parsed;
      };

      const index = resolveIndex();
      return resolveCssVariable(index);
    };

    const styleSource = getComputedStyle(document.documentElement);
    const synopsisLineHeight = parseFloat(styleSource.getPropertyValue('--rt-synopsis-line-height'));
    const pulseLineHeightRaw = parseFloat(styleSource.getPropertyValue('--rt-pulse-line-height'));
    const metadataLineHeight = parseFloat(styleSource.getPropertyValue('--rt-synopsis-metadata-line-height'));
    const lineHeight = synopsisLineHeight * fontScale;
    const pulseLineHeight = pulseLineHeightRaw * fontScale;

    // Create the main container group
    const containerGroup = createSynopsisContainer(sceneId, scene.path);

    // Store publish stage color on synopsis for hover title color updates in Subplot mode
    containerGroup.setAttribute('data-stage-color', titleColor);

    // Create the synopsis text group
    const synopsisTextGroup = createTextGroup();
    containerGroup.appendChild(synopsisTextGroup);

    // Add the title at origin (0,0) - stage color moved to child tspans
    const titleContent = decodedContentLines[0];
    const titleTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
    titleTextElement.setAttribute("class", `rt-info-text rt-title-text-main`);
    titleTextElement.setAttribute("x", "0");
    titleTextElement.setAttribute("y", "0");

    // Format date from When field for display
    // For Beats (Plot items), only show date if NOT in Gossamer mode
    const currentMode = (this.plugin.settings as any).currentMode || 'narrative';
    const isGossamerMode = currentMode === 'gossamer';
    const isBackdrop = scene.itemType === 'Backdrop';
    const shouldShowDate = scene.when && !(scene.itemType === 'Plot' && isGossamerMode);

    let formattedDate: string | undefined;
    if (shouldShowDate && scene.when) {
      if (isAlienModeActive()) {
        const settings = this.plugin.settings as any;
        const profile = getActivePlanetaryProfile(settings);
        const conversion = profile ? convertFromEarth(scene.when, profile) : null;
        if (conversion) {
          // Use Alien Date Format
          formattedDate = conversion.formatted;
        } else {
          formattedDate = this.formatDateForDisplay(scene.when);
        }
      } else {
        formattedDate = this.formatDateForDisplay(scene.when);
      }
    }

    let duration = scene.Duration ? scene.Duration : undefined;
    if (isBackdrop && (scene as any).End) {
      const endDate = parseWhenField((scene as any).End);
      if (endDate) {
        duration = `to ${this.formatDateForDisplay(endDate)}`;
      } else {
        duration = `to ${(scene as any).End}`;
      }
    }

    const metadataElement = this.addTitleContent(titleContent, titleTextElement, titleColor, scene.number, formattedDate, duration);

    synopsisTextGroup.appendChild(titleTextElement);

    // Append metadata element; positioning handled during layout pass
    if (metadataElement) {
      synopsisTextGroup.appendChild(metadataElement);
    }

    // Insert special extra lines right after the title (Due/Revisions), then the regular synopsis lines
    let extraLineCount = 0;

    const appendInfoLine = (className: string, text: string) => {
      const y = (1 + extraLineCount) * metadataLineHeight;
      synopsisTextGroup.appendChild(createText(0, y, className, text));
      extraLineCount += 1;
    };

    const appendPlanetaryLine = (text: string) => {
      const y = (1 + extraLineCount) * metadataLineHeight;
      const indentX = 6; // indent text inward
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const textEl = createText(0, y, 'rt-info-text rt-title-text-secondary rt-planetary-time-text', text);
      // Force indent via dx attribute (more reliable than x for relative offset)
      textEl.setAttribute('dx', String(indentX));
      textEl.style.fill = titleColor; // Use scene publish stage color

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute('class', 'rt-planetary-outline');
      rect.style.stroke = titleColor; // Use scene publish stage color for border too

      // Compute approximate size immediately (getBBox fails when hidden)
      const charWidth = 7.5;
      const estWidth = text.length * charWidth + indentX;
      const estHeight = 15;
      const padX = 6;
      const padY = 2;

      // Border starts at x=0 like other text lines (parent group handles positioning)
      // Note: y position is overridden by positionRowColumns using PLANETARY_RECT_Y_OFFSET
      rect.setAttribute('x', '0');
      rect.setAttribute('y', String(y - SynopsisManager.PLANETARY_RECT_Y_OFFSET));
      rect.setAttribute('width', String(estWidth + padX));
      rect.setAttribute('height', String(estHeight + padY * 2));
      rect.setAttribute('rx', '6');
      rect.setAttribute('ry', '6');

      group.appendChild(rect);
      group.appendChild(textEl);
      synopsisTextGroup.appendChild(group);

      extraLineCount += 1;
    };

    const missingWhenMessage = this.buildMissingWhenMessage(scene);
    if (missingWhenMessage) {
      appendInfoLine('rt-info-text rt-title-text-secondary rt-missing-when-text', missingWhenMessage);
    }

    const planetaryLine = this.buildPlanetaryLine(scene);
    if (planetaryLine) {
      appendPlanetaryLine(planetaryLine);
    }

    // Compute Due/Overdue state (YYYY-MM-DD expected)
    const dueString = scene.due;
    if (dueString && isOverdueAndIncomplete(scene)) {
      appendInfoLine('rt-info-text rt-title-text-secondary rt-overdue-text', `Overdue: ${dueString}`);
    }

    // Revisions (Pending Edits) line if non-empty
    const pendingEdits = scene.pendingEdits && typeof scene.pendingEdits === 'string' ? scene.pendingEdits.trim() : '';
    if (pendingEdits) {
      // Wrap revisions text using same logic as synopsis
      const maxWidth = 500 * fontScale; // Match timeline synopsis width
      const lines = splitIntoBalancedLines(pendingEdits, maxWidth, fontScale);
      for (let i = 0; i < lines.length; i++) {
        const y = (1 + extraLineCount) * metadataLineHeight + (i * metadataLineHeight);
        const text = `${i === 0 ? 'Revisions: ' : ''}${lines[i]}`;
        synopsisTextGroup.appendChild(createText(0, y, 'rt-info-text rt-title-text-secondary rt-revisions-text', text));
      }
      extraLineCount += lines.length;
    }

    // Add synopsis lines with precise vertical spacing, offset by the number of extra lines
    for (let i = 1; i < synopsisEndIndex; i++) {
      const lineContent = decodedContentLines[i];

      // Check if this is a Gossamer score line (marked with <gossamer> tags) - check BEFORE decoding
      const isGossamerLine = contentLines[i].includes('<gossamer>') && contentLines[i].includes('</gossamer>');
      // Check if this is a Gossamer justification line (AI analysis feedback)
      const isGossamerJustificationLine = contentLines[i].includes('<gossamer-justification>') && contentLines[i].includes('</gossamer-justification>');
      // Check if this is a Gossamer pulse-format line (score + justification like pulse analysis)
      const isGossamerPulseLine = contentLines[i].includes('<gossamer-pulse>') && contentLines[i].includes('</gossamer-pulse>');
      // Check if this is a Gossamer pulse continuation line (wrapped text)
      const isGossamerPulseContLine = contentLines[i].includes('<gossamer-pulse-cont>') && contentLines[i].includes('</gossamer-pulse-cont>');
      // Check if this is a Gossamer spacer (gap before momentum line)
      const isGossamerSpacer = contentLines[i].includes('<gossamer-spacer>');

      const lineY = (i + extraLineCount) * lineHeight; // shift down by inserted lines
      const synopsisLineElement = document.createElementNS("http://www.w3.org/2000/svg", "text");

      if (isGossamerSpacer) {
        // Add a visual gap before Gossamer momentum line (like scenes have before pulse)
        // Create an invisible spacer element that adds vertical space
        synopsisLineElement.setAttribute("class", "rt-info-text rt-gossamer-spacer");
        synopsisLineElement.setAttribute("x", "0");
        synopsisLineElement.setAttribute("y", String(lineY));
        synopsisLineElement.setAttribute("font-size", "2px");
        synopsisLineElement.textContent = "\u00A0"; // Non-breaking space
        synopsisLineElement.classList.add('rt-invisible-spacer');
        // The lineY increment will create the gap for the next line
      } else if (isGossamerLine) {
        // Apply title styling for Gossamer lines
        synopsisLineElement.setAttribute("class", "rt-info-text rt-title-text-main rt-gossamer-score-line");
        synopsisLineElement.setAttribute("x", "0");
        synopsisLineElement.setAttribute("y", String(lineY));

        // Extract the content between the tags from the original line (before decoding)
        const gossamerContent = contentLines[i].replace(/<gossamer>/g, '').replace(/<\/gossamer>/g, '');
        
        // Create tspan for score (bold, colored)
        const gossamerTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        gossamerTspan.classList.add('rt-scene-title-bold');
        gossamerTspan.setAttribute("data-item-type", "title");
        gossamerTspan.style.setProperty('--rt-dynamic-color', titleColor);
        gossamerTspan.textContent = gossamerContent;
        synopsisLineElement.appendChild(gossamerTspan);
      } else if (isGossamerJustificationLine) {
        // Style Gossamer justification like pulse analysis (gray, uppercase, same line height)
        synopsisLineElement.setAttribute("class", "rt-info-text pulse-text rt-gossamer-justification-line");
        synopsisLineElement.setAttribute("x", "0");
        synopsisLineElement.setAttribute("y", String(lineY));

        // Extract the content between the tags (already uppercased in builder)
        const justificationContent = contentLines[i].replace(/<gossamer-justification>/g, '').replace(/<\/gossamer-justification>/g, '');
        synopsisLineElement.textContent = justificationContent;
      } else if (isGossamerPulseLine) {
        // Format: "80/100 — JUSTIFICATION" with beat-stage grade styling
        synopsisLineElement.setAttribute("class", "rt-info-text gossamer-grade");
        synopsisLineElement.setAttribute("x", "0");
        synopsisLineElement.setAttribute("y", String(lineY));
        if (beatStageColor) {
          synopsisLineElement.style.setProperty('--rt-gossamer-stage-color', beatStageColor);
        }

        // Extract content between tags
        const pulseContent = contentLines[i]
          .replace(/<gossamer-pulse[^>]*>/g, '')
          .replace(/<\/gossamer-pulse>/g, '');
        
        // Check for " — " separator (em dash)
        const dashIndex = pulseContent.indexOf(' — ');
        if (dashIndex !== -1) {
          const scorePart = pulseContent.substring(0, dashIndex);
          const justificationPart = pulseContent.substring(dashIndex + 3);
          
          // Score tspan (grade styling, beat-stage color)
          const scoreTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          scoreTspan.classList.add('gossamer-grade');
          scoreTspan.textContent = scorePart;
          synopsisLineElement.appendChild(scoreTspan);
          
          // Em dash + justification (same grade styling to keep line consistent)
          const justificationTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          justificationTspan.classList.add('gossamer-grade');
          justificationTspan.textContent = ' — ' + justificationPart;
          synopsisLineElement.appendChild(justificationTspan);
        } else {
          // Just the score (no justification)
          const scoreTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          scoreTspan.classList.add('gossamer-grade');
          scoreTspan.textContent = pulseContent;
          synopsisLineElement.appendChild(scoreTspan);
        }
      } else if (isGossamerPulseContLine) {
        // Continuation line for wrapped Gossamer justification (same grade styling)
        synopsisLineElement.setAttribute("class", "rt-info-text gossamer-grade");
        synopsisLineElement.setAttribute("x", "0");
        synopsisLineElement.setAttribute("y", String(lineY));
        if (beatStageColor) {
          synopsisLineElement.style.setProperty('--rt-gossamer-stage-color', beatStageColor);
        }
        
        // Extract content between tags
        const contContent = contentLines[i].replace(/<gossamer-pulse-cont>/g, '').replace(/<\/gossamer-pulse-cont>/g, '');
        synopsisLineElement.textContent = contContent;
      } else {
        // Regular synopsis line styling
        synopsisLineElement.setAttribute("class", "rt-info-text rt-title-text-secondary");
        synopsisLineElement.setAttribute("x", "0");
        synopsisLineElement.setAttribute("y", String(lineY));

        if (lineContent.includes('<tspan')) {
          this.processContentWithTspans(lineContent, synopsisLineElement);
        } else {
          synopsisLineElement.textContent = lineContent;
        }
      }

      synopsisTextGroup.appendChild(synopsisLineElement);
    }

    // Process metadata items with consistent vertical spacing
    // Also render if there are enabled hover metadata fields
    const hasEnabledHoverFields = (this.plugin.settings.hoverMetadataFields || []).some((f: HoverMetadataField) => f.enabled);
    if (metadataItems.length > 0 || hasEnabledHoverFields) {

      // Helper function to add a spacer element
      const addSpacer = (yPosition: number, height: number) => {
        const spacerElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
        spacerElement.setAttribute("class", "synopsis-spacer");
        spacerElement.setAttribute("x", "0");
        spacerElement.setAttribute("y", String(yPosition));
        // We need a measurable font-size so layout math can read bbox height; keep it tiny and invisible.
        spacerElement.setAttribute("font-size", "2px");
        spacerElement.textContent = "\u00A0"; // Non-breaking space
        spacerElement.classList.add('rt-invisible-spacer'); // Make it invisible
        synopsisTextGroup.appendChild(spacerElement);
        // Return value now adds 0 height, placing next block immediately after previous
        // Need to return the original yPosition so next block starts correctly relative to the last *content* block
        return yPosition; // Return the STARTING yPosition of the spacer
      };

      // --- Add Spacer IMMEDIATELY after Synopsis Text ---
      const synopsisBottomY = synopsisEndIndex * lineHeight;
      // Call addSpacer with height 0, and store the returned start position
      let currentMetadataY = addSpacer(synopsisBottomY, 0);

      const showTripletNeighbors = this.plugin.settings.showFullTripletAnalysis ?? true;

      // Process previousSceneAnalysis metadata if it exists and AI scene analysis is enabled
      if (this.plugin.settings.enableAiSceneAnalysis && showTripletNeighbors && scene["previousSceneAnalysis"]) {
        const beatsY = currentMetadataY;
        const beatsText = scene["previousSceneAnalysis"] || '';
        const linesAdded = this.formatBeatsText(beatsText, 'previousSceneAnalysis', synopsisTextGroup, beatsY, pulseLineHeight, 0); // Pass 'previousSceneAnalysis'
        currentMetadataY = beatsY + (linesAdded * pulseLineHeight);
        if (linesAdded > 0) {
          // Call addSpacer with height 0, update starting point for next block
          currentMetadataY = addSpacer(currentMetadataY, 0);
        }
      }

      // Process currentSceneAnalysis metadata if it exists and AI scene analysis is enabled
      if (this.plugin.settings.enableAiSceneAnalysis && scene["currentSceneAnalysis"]) {
        const beatsY = currentMetadataY;
        const beatsText = scene["currentSceneAnalysis"] || '';
        const linesAdded = this.formatBeatsText(beatsText, 'currentSceneAnalysis', synopsisTextGroup, beatsY, pulseLineHeight, 0); // Pass 'currentSceneAnalysis'
        currentMetadataY = beatsY + (linesAdded * pulseLineHeight);
        if (linesAdded > 0) {
          // Call addSpacer with height 0, update starting point for next block
          currentMetadataY = addSpacer(currentMetadataY, 0);
        }
      }

      // Process nextSceneAnalysis metadata if it exists and AI scene analysis is enabled
      if (this.plugin.settings.enableAiSceneAnalysis && showTripletNeighbors && scene["nextSceneAnalysis"]) {
        const beatsY = currentMetadataY;
        const beatsText = scene["nextSceneAnalysis"] || '';
        const linesAdded = this.formatBeatsText(beatsText, 'nextSceneAnalysis', synopsisTextGroup, beatsY, pulseLineHeight, 0); // Pass 'nextSceneAnalysis'
        currentMetadataY = beatsY + (linesAdded * pulseLineHeight);
        if (linesAdded > 0) {
          // Call addSpacer with height 0, update starting point for next block
          currentMetadataY = addSpacer(currentMetadataY, 0);
        }
      }

      // --- Custom Hover Metadata Fields ---
      const enabledHoverFields = (this.plugin.settings.hoverMetadataFields || []).filter((f: HoverMetadataField) => f.enabled);
      if (enabledHoverFields.length > 0) {
        const hoverMetaStartY = currentMetadataY;
        let hoverMetaLinesAdded = 0;

        enabledHoverFields.forEach((field: HoverMetadataField) => {
          // Check if the scene has this key in its raw frontmatter
          const sceneValue = scene.rawFrontmatter?.[field.key];
          
          // Skip if value is undefined, null, empty string, or empty array
          if (sceneValue === undefined || sceneValue === null) return;
          if (sceneValue === '') return;
          if (Array.isArray(sceneValue) && sceneValue.length === 0) return;
          
          const y = hoverMetaStartY + (hoverMetaLinesAdded * metadataLineHeight);
          
          // Format the value for display
          const formatValue = (val: unknown): string => {
            if (val === null || val === undefined) return '';
            
            // Handle arrays (e.g., Place: ["[[Earth]]", "[[Place/Diego]]"])
            if (Array.isArray(val)) {
              return val.map(item => formatValue(item)).join(', ');
            }
            
            let str = String(val);
            
            // Strip wiki link brackets: [[Link]] -> Link, [[Path/Name]] -> Name
            str = str.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (_match, link) => {
              // Get the display name (last part of path)
              const parts = link.split('/');
              return parts[parts.length - 1];
            });
            
            // Handle Date objects
            if (val instanceof Date && !isNaN(val.getTime())) {
              return this.formatDateForDisplay(val);
            }
            
            return str.trim();
          };
          
          const valueStr = formatValue(sceneValue);
          if (!valueStr) return; // Skip if formatted value is empty
          
          // Create a group for this hover metadata line
          const lineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
          lineGroup.setAttribute("class", "rt-hover-metadata-line");
          
          // Icon positioning
          const iconSize = 18 * fontScale;
          const iconGap = 6 * fontScale;
          const textX = iconSize + iconGap; // Offset for icon + gap
          
          // Get the Lucide icon SVG
          const iconSvg = getIcon(field.icon || 'align-vertical-space-around');
          if (iconSvg) {
            // Native SVG approach: Extract paths and transform
            const iconG = document.createElementNS("http://www.w3.org/2000/svg", "g");
            iconG.setAttribute("class", "rt-hover-metadata-icon-g");
            iconG.setAttribute("stroke", "currentColor");
            iconG.setAttribute("stroke-linecap", "round");
            iconG.setAttribute("stroke-linejoin", "round");
            iconG.setAttribute("fill", "none");
            
            // Calculate scale: Lucide icons are 24x24
            const scale = iconSize / 24;
            
            // Position: y is baseline, so we move up by iconSize (roughly) to align bottom
            // Fine-tuned: y - iconSize * 0.85 aligns the visual bottom of the icon with the text baseline
            const iconY = y - (iconSize * 0.85);

            iconG.setAttribute("transform", `translate(0, ${iconY}) scale(${scale})`);
            
            // Copy all child nodes (paths, circles, etc.) from the Lucide SVG
            Array.from(iconSvg.childNodes).forEach(node => {
              // Skip non-element nodes if any
              if (node.nodeType === 1) { // Element node
                const clone = node.cloneNode(true) as SVGElement;
                iconG.appendChild(clone);
              }
            });

            lineGroup.appendChild(iconG);
          }
          
          // Create the text element (key: value)
          const textEl = createText(textX, y, 'rt-info-text rt-title-text-secondary rt-hover-metadata-text', valueStr);
          textEl.setAttribute('data-hover-icon-size', String(iconSize));
          textEl.setAttribute('data-hover-icon-gap', String(iconGap));
          lineGroup.appendChild(textEl);
          
          synopsisTextGroup.appendChild(lineGroup);
          hoverMetaLinesAdded++;
        });

        if (hoverMetaLinesAdded > 0) {
          currentMetadataY = hoverMetaStartY + (hoverMetaLinesAdded * metadataLineHeight);
          currentMetadataY = addSpacer(currentMetadataY, 0);
        }
      }

      // --- Subplot rendering starts here, using the final currentMetadataY ---
      // currentMetadataY now holds the Y position *before* the last added spacer (if any)
      // or after the last content block if no spacer was added.
      const subplotStartY = currentMetadataY;

      // Process subplots if first metadata item exists
      const decodedMetadataItems = metadataItems.map(item => decodeHtmlEntities(item));

      if (decodedMetadataItems.length > 0 && decodedMetadataItems[0] && decodedMetadataItems[0].trim().length > 0) {
        const subplots = decodedMetadataItems[0].split(', ').filter((s: string) => s.trim().length > 0);

        if (subplots.length > 0) {
          const subplotTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
          subplotTextElement.setAttribute("class", "rt-info-text rt-metadata-text");
          subplotTextElement.setAttribute("x", "0");
          // Use the calculated subplotStartY
          subplotTextElement.setAttribute("y", String(subplotStartY));

          // Format each subplot with its own color
          subplots.forEach((subplot: string, j: number) => {
            const color = getSubplotColor(subplot.trim(), sceneId);
            const subplotText = subplot.trim();
            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan") as SVGTSpanElement;
            tspan.setAttribute("data-item-type", "subplot");
            tspan.style.setProperty('--rt-dynamic-color', color);
            tspan.textContent = subplotText;
            subplotTextElement.appendChild(tspan);
            if (j < subplots.length - 1) {
              const comma = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
              comma.setAttribute("fill", "var(--text-muted)");
              comma.textContent = ", ";
              subplotTextElement.appendChild(comma);
            }
          });

          synopsisTextGroup.appendChild(subplotTextElement);
        }
      }

      // Process character - second metadata item
      if (decodedMetadataItems.length > 1 && decodedMetadataItems[1] && decodedMetadataItems[1].trim().length > 0) {
        // Calculate character Y based on subplot position plus standard line height
        const characterY = subplotStartY + lineHeight;
        const characterList = decodedMetadataItems[1].split(', ').filter((c: string) => c.trim().length > 0);

        if (characterList.length > 0) {
          const CHARACTER_COLOR_DEFAULT = '#666666';
          const CHARACTER_COLOR_POV = '#000000';
          const characterTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
          characterTextElement.setAttribute("class", "rt-info-text rt-metadata-text");
          characterTextElement.setAttribute("x", "0");
          characterTextElement.setAttribute("y", String(characterY));

          // Format each character with its own color
          characterList.forEach((character: string, j: number) => {
            const trimmedChar = character.trim();
            let baselineRaised = false;

            const markerMatch = trimmedChar.match(/>pov(?:=([^<]+))<$/i);
            const povLabel = markerMatch ? (markerMatch[1]?.trim() || 'POV') : undefined;
            const cleanedText = markerMatch
              ? trimmedChar.replace(/\s*>pov(?:=[^<]+)?<\s*/i, '').trim()
              : trimmedChar;
            const color = povLabel ? CHARACTER_COLOR_POV : CHARACTER_COLOR_DEFAULT;

            if (cleanedText) {
              const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan") as SVGTSpanElement;
              tspan.setAttribute("data-item-type", "character");
              tspan.style.setProperty('--rt-dynamic-color', color);
              if (povLabel) {
                tspan.classList.add('rt-pov-character');
              }
              tspan.textContent = cleanedText;
              characterTextElement.appendChild(tspan);
            }

            if (povLabel) {
              const povTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan") as SVGTSpanElement;
              povTspan.setAttribute("class", "rt-pov-marker");
              povTspan.setAttribute("dy", "-8px");
              povTspan.style.setProperty('--rt-dynamic-color', color);
              povTspan.textContent = povLabel;
              characterTextElement.appendChild(povTspan);
              baselineRaised = true;
            }

            // Add comma after this character (if not the last one)
            if (j < characterList.length - 1) {
              const comma = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
              comma.setAttribute("fill", "var(--text-muted)");
              if (baselineRaised) {
                comma.setAttribute("dy", "8px");
              }
              comma.textContent = ", ";
              characterTextElement.appendChild(comma);
            } else if (baselineRaised) {
              const resetTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan") as SVGTSpanElement;
              resetTspan.setAttribute("dy", "8px");
              resetTspan.textContent = "";
              characterTextElement.appendChild(resetTspan);
            }
          });

          synopsisTextGroup.appendChild(characterTextElement);
        }
      }
    }

    return containerGroup;
  }

  /**
   * Generate SVG string from DOM element (temporary compatibility method)
   */
  generateHTML(scene: TimelineItem, contentLines: string[], sceneId: string): string {
    const element = this.generateElement(scene, contentLines, sceneId);
    const serializer = new XMLSerializer();
    return serializer.serializeToString(element);
  }

  /**
   * Update the position of a synopsis based on mouse position
   */
  updatePosition(synopsis: Element, event: MouseEvent, svg: SVGSVGElement, sceneId: string): void {
    if (!(synopsis instanceof SVGElement)) {
      throw new Error('Synopsis element must be an SVGElement.');
    }
    if (!svg) {
      throw new Error('SVG root is required to position synopsis content.');
    }

    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      throw new Error('Unable to compute screen CTM for timeline SVG.');
    }

    const svgP = pt.matrixTransform(ctm.inverse());
    const quadrant = this.getQuadrant(svgP.x, svgP.y);

    const currentMode = (this.plugin.settings as any).currentMode || 'narrative';
    const isChronologueMode = currentMode === 'chronologue';
    const isPublicationMode = currentMode === 'publication';
    const readabilityScale = getReadabilityScale(this.plugin.settings);

    const subplotOuterRadius = isChronologueMode
      ? SUBPLOT_OUTER_RADIUS_CHRONOLOGUE
      : isPublicationMode
        ? SUBPLOT_OUTER_RADIUS_MAINPLOT
        : SUBPLOT_OUTER_RADIUS_STANDARD[readabilityScale];

    const adjustedRadius = subplotOuterRadius - SYNOPSIS_INSET;

    synopsis.removeAttribute('style');
    synopsis.classList.remove('rt-synopsis-q1', 'rt-synopsis-q2', 'rt-synopsis-q3', 'rt-synopsis-q4');

    const position = this.getPositionForQuadrant(quadrant, adjustedRadius);
    synopsis.classList.add(`rt-synopsis-${position.quadrantClass}`);

    const y = position.y;
    if (Math.abs(y) >= adjustedRadius) {
      throw new Error(`Synopsis y-position ${y} exceeds radius ${adjustedRadius}`);
    }

    const diff = adjustedRadius * adjustedRadius - y * y;
    if (diff < 0) {
      throw new Error('Cannot compute synopsis x-position due to invalid radius difference.');
    }
    const baseX = Math.sqrt(diff);
    const x = position.isRightAligned ? baseX : -baseX;

    synopsis.setAttribute('transform', `translate(${x}, ${y})`);
    synopsis.classList.add('rt-visible');
    synopsis.setAttribute('opacity', '1');
    synopsis.setAttribute('pointer-events', 'all');

    this.positionTextElements(synopsis, position.isRightAligned, position.isTopHalf, adjustedRadius, sceneId);
  }

  /**
   * Determine which quadrant a point is in
   * SVG coordinate system: (0,0) is at center
   * Q1: Bottom-Right (+x, +y)
   * Q2: Bottom-Left (-x, +y)
   * Q3: Top-Left (-x, -y)
   * Q4: Top-Right (+x, -y)
   */
  private getQuadrant(x: number, y: number): string {

    // Define quadrants based on SVG coordinates
    if (x >= 0 && y >= 0) return "Q1";      // Bottom Right (+x, +y)
    else if (x < 0 && y >= 0) return "Q2";  // Bottom Left (-x, +y)
    else if (x < 0 && y < 0) return "Q3";   // Top Left (-x, -y)
    else return "Q4";                       // Top Right (+x, -y)
  }

  /**
   * Get position configuration for a specific quadrant
   */
  private getPositionForQuadrant(quadrant: string, outerRadius: number): {
    x: number,
    y: number,
    quadrantClass: string,
    isRightAligned: boolean,
    isTopHalf: boolean
  } {
    // Place synopsis in opposite quadrant from mouse position (same half)
    let result = {
      x: 0,
      y: 0,
      quadrantClass: "",
      isRightAligned: false,
      isTopHalf: false
    };

    // Fixed vertical positions
    const topHalfOffset = -550; // Fixed vertical position from center for top half
    const bottomHalfOffset = 120; // Updated value for bottom half (Q1, Q2)


    switch (quadrant) {
      case "Q1": // Mouse in Bottom Right -> Synopsis in Q2 (Bottom Left)
        result.x = 0;
        result.y = bottomHalfOffset; // Bottom half with updated value
        result.quadrantClass = "q2";
        result.isRightAligned = false; // Left aligned
        result.isTopHalf = false;
        break;

      case "Q2": // Mouse in Bottom Left -> Synopsis in Q1 (Bottom Right)
        result.x = 0;
        result.y = bottomHalfOffset; // Bottom half with updated value
        result.quadrantClass = "q1";
        result.isRightAligned = true; // Right aligned
        result.isTopHalf = false;
        break;

      case "Q3": // Mouse in Top Left -> Synopsis in Q4 (Top Right)
        result.x = 0;
        result.y = topHalfOffset; // Top half (unchanged)
        result.quadrantClass = "q4";
        result.isRightAligned = true; // Right aligned
        result.isTopHalf = true;
        break;

      case "Q4": // Mouse in Top Right -> Synopsis in Q3 (Top Left)
        result.x = 0;
        result.y = topHalfOffset; // Top half (unchanged)
        result.quadrantClass = "q3";
        result.isRightAligned = false; // Left aligned
        result.isTopHalf = true;
        break;
    }


    return result;
  }

  /**
   * Position text elements along an arc
   * 
   * TEXT POSITIONING ON THE RADIAL ARC:
   * Each row's X position is calculated using Pythagorean theorem to place it
   * exactly on the circle at that Y coordinate: circleX = sqrt(r² - y²)
   * 
   * This works identically for both top and bottom halves of the timeline.
   * The text-anchor property (start/end) determines which edge of the text
   * aligns with the calculated arc position.
   * 
   * MINIMAL INSET FOR TEXT OVERHANG:
   * SVG text extends above its baseline (ascenders, cap height). We measure
   * the actual rendered text height via getBBox() and use a fraction of it
   * as the inset. This automatically scales with:
   * - Font size (title vs body vs beats)
   * - Readability scale (normal vs large)
   * - Font metrics (different fonts/localizations)
   */
  private static readonly TEXT_HEIGHT_INSET_RATIO = 0.35;

  private positionTextElements(
    synopsis: Element,
    isRightAligned: boolean,
    isTopHalf: boolean,
    radius: number,
    sceneId: string
  ): void {
    // Find all text elements
    const textElements = Array.from(synopsis.querySelectorAll('text')) as SVGTextElement[];
    if (textElements.length === 0) return;

    const textAnchor = isRightAligned ? 'end' : 'start';
    textElements.forEach(textEl => {
      if (textEl.getAttribute('data-metadata-block') === 'true') {
        textEl.setAttribute('text-anchor', 'start');
      } else {
        textEl.setAttribute('text-anchor', textAnchor);
      }
    });

    // Get the synopsis text group
    const synopsisTextGroup = synopsis.querySelector('.rt-synopsis-text');
    if (!synopsisTextGroup) {
      return;
    }

    // Reset any previous transforms
    (synopsisTextGroup as SVGElement).removeAttribute('transform');

    const fontScale = this.getReadabilityScale();
    // Circle parameters scale with readability to avoid overlaps
    const titleLineHeight = 32 * fontScale; // Increased spacing for title/date line
    const synopsisLineHeight = 22 * fontScale; // Reduced spacing for synopsis text
    const scorePreGap = 46 * fontScale; // Manual gap before the Gossamer score line; adjust as needed
    const metadataSpacing = 14 * fontScale; // Default horizontal gap between title and metadata block

    // Get pulse line height from CSS for beats text
    const styleSource = getComputedStyle(document.documentElement);
    const pulseLineHeightRaw = parseFloat(styleSource.getPropertyValue('--rt-pulse-line-height'));
    const pulseLineHeight = pulseLineHeightRaw * fontScale;

    // Calculate starting y-position from synopsis position
    const synopsisTransform = (synopsis as SVGElement).getAttribute('transform') || '';
    const translateMatch = synopsisTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);

    if (!translateMatch || translateMatch.length < 3) {
      return;
    }

    const baseX = parseFloat(translateMatch[1]);
    const baseY = parseFloat(translateMatch[2]);

    // Separate text elements into rows (vertically stacked lines)
    const textRows: SVGTextElement[][] = [];

    // Build rows, grouping metadata blocks with their preceding title rows
    textElements.forEach((textEl) => {
      if (textEl.getAttribute('data-metadata-block') === 'true' && textRows.length > 0) {
        textRows[textRows.length - 1].push(textEl);
      } else {
        textRows.push([textEl]);
      }
    });

    // Position each row using Pythagorean theorem relative to circle center
    let yOffset = 0;

    textRows.forEach((rowElements, rowIndex) => {
      const primaryEl = rowElements[0] ?? null;

      // Track which line height is used for this row (needed for inset scaling)
      // Row 0 (title) uses titleLineHeight; others determined by content type
      let currentRowLineHeight = rowIndex === 0 ? titleLineHeight : synopsisLineHeight;

      // Calculate absolute position for this row with variable line heights
      if (rowIndex > 0) {
        const currentEl = rowElements[0];
        const isGossamerLine = currentEl.classList.contains('rt-gossamer-score-line');
        const isBeatsText = currentEl.classList.contains('pulse-text');
        const prevEl = textRows[rowIndex - 1][0];
        const isPrevLineSynopsis = prevEl.classList.contains('rt-title-text-secondary');
        const isPrevLineBeats = prevEl.classList.contains('pulse-text');

        if (rowIndex === 1) {
          // Always use title spacing right after the title line
          yOffset += titleLineHeight;
          currentRowLineHeight = titleLineHeight;
        } else if (isGossamerLine && isPrevLineSynopsis) {
          // Fixed manual gap before the Gossamer score line
          yOffset += scorePreGap;
          currentRowLineHeight = scorePreGap;
        } else if (isBeatsText || isPrevLineBeats) {
          // Use pulse line height for beats/analysis text
          yOffset += pulseLineHeight;
          currentRowLineHeight = pulseLineHeight;
        } else {
          // Default spacing between regular synopsis/metadata lines
          yOffset += synopsisLineHeight;
          currentRowLineHeight = synopsisLineHeight;
        }
      }

      let anchorY = baseY + yOffset;

      if (Math.abs(anchorY) >= radius) {
        // Clamp rows that extend beyond the circle; they'll hug the perimeter instead of crashing
        anchorY = Math.sign(anchorY) * (radius - 1);
      }

      const radiusDiff = radius * radius - anchorY * anchorY;
      if (radiusDiff < 0) {
        throw new Error(`Cannot resolve anchor for row ${rowIndex}; negative radius difference computed.`);
      }

      const circleX = Math.sqrt(radiusDiff);
      const direction = isRightAligned ? 1 : -1;

      // Top half only: inset based on font size to compensate for text above baseline
      // Bottom half needs no adjustment - the baseline alignment works correctly there
      // Title and first synopsis line need more inset; later rows need less
      let inset = 0;
      if (isTopHalf && primaryEl) {
        const style = window.getComputedStyle(primaryEl);
        const fontSize = parseFloat(style.fontSize) || 16;
        // Rows 0-1 (title, first synopsis) need more inset; others use base ratio
        const ratio = rowIndex <= 1 ? 0.5 : SynopsisManager.TEXT_HEIGHT_INSET_RATIO;
        inset = fontSize * ratio;
      }
      const rightQuadrantInset = isRightAligned ? 20 : 0;
      // Only apply extra inset on right side when the row carries a hover icon
      const hasHoverIcon = this.getHoverIconTotalOffset(primaryEl) > 0;
      const extraRightInset = isRightAligned && hasHoverIcon ? rightQuadrantInset : 0;
      const anchorAbsoluteX = (circleX - inset - extraRightInset) * direction;

      const anchorX = anchorAbsoluteX - baseX;

      const { primaryWidth, metadataWidth, gap } = this.measureRowLayout(rowElements, metadataSpacing, isRightAligned);
      // Only nudge rows with hover icons; other rows stay flush against the outer radius
      const textNudge = isRightAligned && hasHoverIcon ? -8 : 0;
      const roundedAnchorX = Math.round(anchorX + textNudge);
      const rowY = rowIndex === 0 ? 0 : yOffset;

      this.positionRowColumns(
        rowElements,
        roundedAnchorX,
        rowY,
        primaryWidth,
        metadataWidth,
        gap,
        isRightAligned
      );

    });

    // After positioning text, reposition hover metadata icons to match the row start
    this.updateHoverMetadataIcons(synopsis);
  }

  private measureRowLayout(rowElements: SVGTextElement[], defaultGap: number, isRightAligned: boolean): { primaryWidth: number; metadataWidth: number; gap: number } {
    if (rowElements.length === 0) {
      return { primaryWidth: 0, metadataWidth: 0, gap: defaultGap };
    }

    const iconOffset = isRightAligned ? 0 : this.getHoverIconTotalOffset(rowElements[0]);
    const primaryWidth = this.measureTextWidth(rowElements[0]) + iconOffset;
    let metadataWidth = 0;
    let gap = defaultGap;

    if (rowElements.length > 1) {
      const metadataEl = rowElements[1];
      metadataWidth = this.measureTextWidth(metadataEl);
      const gapAttr = metadataEl.getAttribute('data-column-gap');
      if (gapAttr) {
        const parsedGap = parseFloat(gapAttr);
        if (!Number.isNaN(parsedGap)) {
          gap = parsedGap;
        }
      }
    }

    return { primaryWidth, metadataWidth, gap };
  }

  private positionRowColumns(
    rowElements: SVGTextElement[],
    anchorX: number,
    yPosition: number,
    primaryWidth: number,
    metadataWidth: number,
    gap: number,
    isRightAligned: boolean
  ): void {
    if (rowElements.length === 0) {
      return;
    }

    const hasMetadata = rowElements.length > 1;

    if (isRightAligned) {
      const metadataRightEdge = anchorX - SYNOPSIS_INSET;
      const metadataLeftEdge = hasMetadata ? metadataRightEdge - metadataWidth : metadataRightEdge;
      const titleRightEdge = hasMetadata ? metadataLeftEdge - gap : metadataRightEdge;

      rowElements.forEach((textEl, index) => {
        const iconOffset = 0; // Icons render after text on right-aligned rows
        const targetX = index === 0 ? titleRightEdge - iconOffset : metadataLeftEdge;
        textEl.setAttribute('x', String(targetX));
        textEl.setAttribute('y', String(yPosition));

        // Update planetary outline rect if present
        const prev = textEl.previousElementSibling;
        if (prev && prev.tagName === 'rect' && prev.classList.contains('rt-planetary-outline')) {
          let currentWidth = parseFloat(prev.getAttribute('width') || '0');
          try {
            const len = textEl.getComputedTextLength();
            if (len > 0) {
              currentWidth = len + 12; // text len + indent(6) + pad(6)
              prev.setAttribute('width', String(currentWidth));
            }
          } catch (e) { /* ignore */ }

          prev.setAttribute('x', String(targetX - currentWidth));
          prev.setAttribute('y', String(yPosition - SynopsisManager.PLANETARY_RECT_Y_OFFSET));
          textEl.setAttribute('dx', '-6');
        }

        if (index !== 0) {
          textEl.setAttribute('text-anchor', 'start');
          this.alignMetadataTspans(textEl, metadataLeftEdge);
        }
      });
    } else {
      const rowLeftEdge = anchorX + SYNOPSIS_INSET;
      const metadataLeftEdge = hasMetadata ? rowLeftEdge + primaryWidth + gap : rowLeftEdge;

      rowElements.forEach((textEl, index) => {
        const iconOffset = index === 0 ? this.getHoverIconTotalOffset(textEl) : 0;
        const x = index === 0 ? rowLeftEdge + iconOffset : metadataLeftEdge;
        textEl.setAttribute('x', String(x));
        textEl.setAttribute('y', String(yPosition));

        // Update planetary outline rect if present
        const prev = textEl.previousElementSibling;
        if (prev && prev.tagName === 'rect' && prev.classList.contains('rt-planetary-outline')) {
          try {
            const len = textEl.getComputedTextLength();
            if (len > 0) {
              prev.setAttribute('width', String(len + 12));
            }
          } catch (e) { /* ignore */ }

          prev.setAttribute('x', String(x));
          prev.setAttribute('y', String(yPosition - SynopsisManager.PLANETARY_RECT_Y_OFFSET));
          textEl.setAttribute('dx', '6');
        }

        if (index !== 0) {
          this.alignMetadataTspans(textEl, metadataLeftEdge);
        }
      });
    }
  }

  private getHoverIconOffsets(textEl: SVGTextElement | null): { iconSize: number; iconGap: number; total: number } {
    if (!textEl) return { iconSize: 0, iconGap: 0, total: 0 };
    const iconSize = parseFloat(textEl.getAttribute('data-hover-icon-size') || '0') || 0;
    const iconGap = parseFloat(textEl.getAttribute('data-hover-icon-gap') || '0') || 0;
    return { iconSize, iconGap, total: iconSize + iconGap };
  }

  private getHoverIconTotalOffset(textEl: SVGTextElement | null): number {
    return this.getHoverIconOffsets(textEl).total;
  }

  private updateHoverMetadataIcons(synopsis: Element): void {
    const lines = Array.from(synopsis.querySelectorAll('.rt-hover-metadata-line')) as SVGGElement[];
    if (lines.length === 0) return;

    lines.forEach(line => {
      const textEl = line.querySelector('.rt-hover-metadata-text') as SVGTextElement | null;
      const iconG = line.querySelector('.rt-hover-metadata-icon-g') as SVGGElement | null;
      if (!textEl || !iconG) return;

      const { iconSize, iconGap, total } = this.getHoverIconOffsets(textEl);
      if (total <= 0) return;

      const textX = parseFloat(textEl.getAttribute('x') || '0');
      const textY = parseFloat(textEl.getAttribute('y') || '0');
      const anchor = textEl.getAttribute('text-anchor') || 'start';
      const textWidth = this.measureTextWidth(textEl);

      const isRightAligned = anchor === 'end';
      const textStartX = anchor === 'end' ? textX - textWidth : textX;
      // Nudge icons closer to their text and slightly upward for clearer rendering
      const baseHorizontalNudge = 4; // px
      const verticalNudge = 2; // px
      const iconX = Math.round(
        isRightAligned
          ? textX + iconGap - (baseHorizontalNudge + 0) + 2 // push outward (right) by 2px
          : textStartX - iconGap - iconSize + 2            // push outward (right) by 2px
      );
      const iconY = Math.round(textY - (iconSize * 0.85) - verticalNudge);
      const scale = iconSize / 24;

      iconG.setAttribute('transform', `translate(${iconX}, ${iconY}) scale(${scale})`);
      iconG.setAttribute('stroke-width', '2');
      iconG.setAttribute('stroke-linecap', 'round');
      iconG.setAttribute('stroke-linejoin', 'round');
      iconG.style.stroke = "";
      iconG.style.fill = "";
    });
  }

  private alignMetadataTspans(metadataText: SVGTextElement, columnX: number): void {
    const tspans = Array.from(metadataText.querySelectorAll('tspan')) as SVGTSpanElement[];
    tspans.forEach(tspan => {
      const role = tspan.getAttribute('data-column-role');
      if (role === 'date' || role === 'duration') {
        tspan.setAttribute('x', String(columnX));
      }
    });
  }

  private measureTextWidth(element: SVGTextElement): number {
    const box = element.getBBox();
    if (box && Number.isFinite(box.width)) {
      return Math.max(0, box.width);
    }

    const length = element.getComputedTextLength();
    if (Number.isFinite(length)) {
      return Math.max(0, length);
    }

    throw new Error('Unable to measure text width for synopsis element.');
  }

  /**
   * Process content with tspan elements and add to an SVG element
   * @param content The HTML content to process
   * @param parentElement The SVG element to append processed nodes to
   */
  private processContentWithTspans(content: string, parentElement: SVGElement): void {
    // First decode any HTML entities in the content
    let processedContent = content;

    // Check if the content contains HTML-encoded tspan elements
    if (content.includes('&lt;tspan') && !content.includes('<tspan')) {
      // Convert HTML entities to actual tags for proper parsing
      processedContent = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');


    }

    // Use DOMParser to parse the content safely
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${processedContent}</div>`, 'text/html');
    const container = doc.querySelector('div');

    if (!container) {
      throw new Error('Unable to create container for synopsis content.');
    }

    const nodes = Array.from(container.childNodes);
    if (nodes.length === 0) {
      throw new Error('Synopsis content produced no nodes to render.');
    }

    const appendTextSpan = (textValue: string): void => {
      if (!textValue.trim()) {
        return;
      }
      const svgTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      svgTspan.textContent = textValue;
      parentElement.appendChild(svgTspan);
    };

    nodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendTextSpan(node.textContent ?? '');
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tag = element.tagName.toLowerCase();
        if (tag !== 'tspan' && tag !== 'span') {
          throw new Error(`Unsupported element <${element.tagName}> in synopsis content.`);
        }

        const svgTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        Array.from(element.attributes).forEach(attr => {
          svgTspan.setAttribute(attr.name, attr.value);
        });
        svgTspan.textContent = element.textContent ?? '';
        parentElement.appendChild(svgTspan);
        return;
      }

      throw new Error('Unsupported node type found in synopsis content.');
    });

    if (!parentElement.hasChildNodes()) {
      throw new Error('Synopsis conversion produced no SVG tspans.');
    }
  }

  // Add this new method for splitting text into lines
  private splitTextIntoLines(text: string, maxWidth: number): string[] {
    // Handle null, undefined, or non-string input
    if (!text || typeof text !== 'string') {

      return [''];  // Return an array with a single empty string
    }

    // Trim the text to remove leading/trailing whitespace
    const trimmedText = text.trim();

    // Check if the trimmed text is empty
    if (!trimmedText) {

      return [''];  // Return an array with a single empty string for empty content
    }

    // Simple line splitting based on approximate character count
    const words = trimmedText.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    const maxCharsPerLine = 50; // Approximately 400px at 16px font size

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordWidth = word.length;

      if (currentLine.length + wordWidth + 1 > maxCharsPerLine && currentLine !== '') {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    // If we still end up with no lines, ensure we return something
    if (lines.length === 0) {

      return [trimmedText]; // Return the trimmed text as a single line
    }

    return lines;
  }

  /**
   * Formats and adds beat text lines to an SVG group.
   * @param beatsText The multi-line string containing beats for one section.
   * @param beatKey The key identifying the section ('previousSceneAnalysis', 'currentSceneAnalysis', 'nextSceneAnalysis').
   * @param parentGroup The SVG group element to append the text elements to.
   * @param baseY The starting Y coordinate for the first line.
   * @param lineHeight The vertical distance between lines.
   * @param spacerSize Size of the spacer to add after this beats section.
   */
  private formatBeatsText(beatsText: string, beatKey: 'previousSceneAnalysis' | 'currentSceneAnalysis' | 'nextSceneAnalysis', parentGroup: SVGElement, baseY: number, lineHeight: number, spacerSize: number = 0): number {
    // START: Restore line splitting logic
    if (!beatsText || typeof beatsText !== 'string' || beatsText === 'undefined' || beatsText === 'null') {
      return 0;
    }
    beatsText = beatsText.replace(/undefined|null/gi, '').trim();
    if (!beatsText) {
      return 0;
    }

    let lines: string[] = [];

    // Performance optimization: Check if already contains newlines (most common case for YAML)
    const hasNewlines = beatsText.includes('\n');

    if (hasNewlines) {
      // Fast path: already formatted with newlines, just split
      lines = beatsText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    } else {
      const trimmedText = beatsText.trim();
      if (trimmedText.startsWith('-')) {
        if (trimmedText.length > 1) { lines = [trimmedText]; }
      } else {
        // Split on commas that appear between beats (not within descriptions)
        // Pattern: split on ", " followed by text containing "+ /" or "- /" or "? /"
        const beatSeparatorPattern = /,\s*(?=[^,]*[\+\-\?]\s*\/)/g;
        const parts = trimmedText.split(beatSeparatorPattern);

        if (parts.length > 1) {
          lines = parts.map(item => `- ${item.trim()}`).filter(line => line.length > 2);
        } else {
          // If no pattern match, use original comma splitting as fallback
          lines = trimmedText.split(',').map(item => `- ${item.trim()}`).filter(line => line.length > 2);
        }
        if (lines.length === 0 && trimmedText.length > 0) {
          lines = [`- ${trimmedText}`];
        }
      }
    }
    // END: Restore line splitting logic



    // Add this after the line splitting logic but before the for loop
    // Around line 1275-1280, right after "// END: Restore line splitting logic"

    // Pre-process lines for wrapping for all beats sections.
    if (lines.length > 0) {
      const processedLines: string[] = [];

      for (const originalLine of lines) {
        if (!originalLine || !originalLine.trim()) continue;

        const line = originalLine.trim();
        let wasSplit = false;

        // 1. Check if the line should have grade styling.
        let isGradeLine = false;
        const prefixMatch = line.match(/^\s*(\[[A-Z][+-]?\]\s*)/);
        const numericGradeRegex = /^\s*-?\s*(\d+(\.\d+)?\s+[ABC])/i; // Simplified to find the grade pattern itself.
        if (prefixMatch || line.match(numericGradeRegex)) {
          isGradeLine = true;
        }




        // 2. Determine the correct splitter character and method.
        // IMPORTANT: If the beat already includes a title/comment separator (" / "),
        // do NOT split further on commas or periods — commas belong to the comment.
        // This prevents unwanted wrapping like "smoother, but decent continuation".
        let splitChar = '';
        const hasSlashSeparator = /\s\/\s/.test(line);
        if (!hasSlashSeparator) {
          if (isGradeLine) {
            // For grade lines (when not using slash), prefer splitting on ". " to avoid decimals, else comma.
            if (line.match(/\.\s/)) {
              splitChar = '.';
            } else if (line.includes(',')) {
              splitChar = ',';
            }
          } else {
            // Non-grade lines (no slash) may be legacy comma-separated items
            if (line.includes(',')) {
              splitChar = ',';
            }
          }
        }

        // 3. Perform the split and format the new lines.
        if (splitChar) {
          const parts = line.split(splitChar);
          if (parts.length > 1) {
            wasSplit = true;
            const wrapTag = isGradeLine ? '[GRADE]' : '[BODY]';

            // First part includes the split character.
            processedLines.push(parts[0] + splitChar);

            // Subsequent parts get the appropriate wrap tag.
            for (let i = 1; i < parts.length; i++) {
              const part = parts[i].trim();
              if (part) {
                // Add split character back except for the last part
                const text = (i < parts.length - 1) ? part + splitChar : part;
                processedLines.push(`${wrapTag} ${text}`);
              }
            }
          }
        }

        // 4. If no split occurred, add the original line back.
        if (!wasSplit) {
          processedLines.push(originalLine);
        }
      }

      // Replace original lines with the new processed lines.
      lines.splice(0, lines.length, ...processedLines);
    }

    let currentY = baseY;
    let lineCount = 0;

    // Process lines and render synopsis content

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line.startsWith('-')) { line = `- ${line}`; }
      let rawContent = line.substring(1).trim();
      if (!rawContent) continue;

      // --- Revised Splitting and Formatting Logic --- 
      let titleText = rawContent; // Default: whole line is title
      let commentText = '';     // Default: no comment
      let titleClass = 'pulse-text-neutral'; // Default class
      let commentClass = 'pulse-text'; // Default comment class
      let signDetected: string | null = null; // Store the detected sign (+, -, ?)
      let useSlashSeparator = false; // Flag to control adding " / "
      let detectedGrade: string | null = null; // Declare detectedGrade here

      // Check for body text wrapper from non-grade line splitting FIRST
      const bodyWrapMatch = rawContent.match(/^\[BODY\]\s*(.*)$/);
      const gradeWrapMatch = rawContent.match(/^\[GRADE\]\s*(.*)$/);

      if (gradeWrapMatch) {
        // This is a wrapped line from a grade line.
        titleText = gradeWrapMatch[1];
        rawContent = titleText;
        // Apply grade formatting to wrapped grade segments
        titleClass = 'pulse-text-grade';
        commentClass = 'pulse-text-grade';

        // Find the grade from the first line for border logic
        if (lines.length > 0) {
          const firstLineContent = lines[0].replace(/^-\s*/, '');
          const firstLineGradeMatch = firstLineContent.match(/^\s*\d+(\.\d+)?\s+([ABC])(?![A-Za-z0-9])/i);
          if (firstLineGradeMatch) {
            detectedGrade = firstLineGradeMatch[2].toUpperCase();
          }
        }
      } else if (bodyWrapMatch) {
        // This is a wrapped line from a regular line.
        titleText = bodyWrapMatch[1];
        rawContent = titleText;
        // Apply light gray body text formatting  
        titleClass = 'rt-info-text rt-title-text-secondary';
        commentClass = 'rt-info-text rt-title-text-secondary';
      } else {
        // Only do sign detection if this is NOT body text or grade text
        if (!bodyWrapMatch && !gradeWrapMatch) {
          // 1. Find the specific "Sign /" pattern
          const signSlashPattern = /^(.*?)\s*([-+?])\s*\/\s*(.*)$/;
          const match = rawContent.match(signSlashPattern);

          if (match) {
            // Pattern "Title Sign / Comment" found
            titleText = match[1].trim();    // Part before the sign
            signDetected = match[2];        // The actual sign (+, -, ?)
            commentText = match[3].trim(); // Part after the slash
            useSlashSeparator = true;     // We found the pattern, so use the slash
            // NOTE: Title sign is implicitly removed because titleText comes from group 1 (before the sign)
          } else {
            // Pattern not found. Check if there's a sign at the end for coloring, but don't split.
            const endSignMatch = rawContent.match(/\s*([-+?])$/);
            if (endSignMatch) {
              signDetected = endSignMatch[1];
              // Remove the sign from the title text for display
              titleText = rawContent.substring(0, endSignMatch.index).trim();
            }
            // No split needed, commentText remains empty, useSlashSeparator remains false
          }

          // 2. Determine Title CSS Class based on the detected sign
          if (signDetected === '+') {
            titleClass = 'pulse-text-positive';
          } else if (signDetected === '-') {
            titleClass = 'pulse-text-negative';
          } // Otherwise remains 'pulse-text-neutral'
        }
      }

      // Handle special case for currentSceneAnalysis grade detection (simple, content-based only)
      if (beatKey === 'currentSceneAnalysis' && !bodyWrapMatch && !gradeWrapMatch) {
        // Check if THIS specific line has a grade pattern
        const gradeMatch = titleText.match(/^\s*-?\s*(\d+(\.\d+)?\s+[ABC])/i);

        if (gradeMatch) {
          // This line itself has a grade - apply grade formatting
          const gradeLetterMatch = titleText.match(/\s+([ABC])/i);
          if (gradeLetterMatch && gradeLetterMatch[1]) {
            detectedGrade = gradeLetterMatch[1].toUpperCase();
          }
          titleClass = 'pulse-text-grade';
          commentClass = 'pulse-text-grade';
        }
      }

      // --- Create SVG Elements with forced wrap support ([BR]) --- 
      // Support user-forced line breaks using [br]/[BR] tokens inside title/comment (case-insensitive)
      const brRe = /\s*\[br\]\s*/i;
      const titleSegments = (titleText || '').split(brRe);
      const commentSegments = (useSlashSeparator && commentText) ? (commentText || '').split(brRe) : [];

      // First visual line: title seg 0 plus optional comment seg 0 with slash
      const makeLine = (titlePart: string | null, commentPart: string | null) => {
        const lineText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lineText.setAttribute("class", "pulse-text");
        lineText.setAttribute("x", "0");
        lineText.setAttribute("y", String(currentY));
        lineText.setAttribute("text-anchor", "start");

        if (titlePart !== null) {
          const tt = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          tt.setAttribute("class", titleClass);
          tt.textContent = titlePart;
          lineText.appendChild(tt);
        }
        if (commentPart !== null) {
          const ct = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          ct.setAttribute("class", commentClass);
          ct.textContent = (titlePart ? " / " : "") + commentPart;
          lineText.appendChild(ct);
        }

        parentGroup.appendChild(lineText);
        currentY += lineHeight;
        lineCount += 1;
      };

      makeLine(titleSegments[0] ?? '', commentSegments.length > 0 ? (commentSegments[0] ?? '') : null);

      // Additional lines from remaining title segments (each on its own line)
      for (let i = 1; i < titleSegments.length; i++) {
        makeLine(titleSegments[i], null);
      }

      // Additional lines from remaining comment segments (each on its own line)
      for (let i = 1; i < commentSegments.length; i++) {
        makeLine(commentSegments[i], null);
      }
    }

    // Removed grade border overlay; grade is now shown by coloring number text

    // Add spacer at the end of this section if needed
    if (spacerSize > 0) {
      const addSpacer = (yPosition: number, height: number) => {
        const spacer = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        spacer.setAttribute("class", "synopsis-spacer");
        spacer.setAttribute("x", "0");
        spacer.setAttribute("y", String(yPosition));
        spacer.setAttribute("width", "20");
        spacer.setAttribute("height", String(height));

        parentGroup.appendChild(spacer);
      };

      addSpacer(currentY, spacerSize);
      currentY += spacerSize;
    }

    return lineCount;
  }

  private buildMissingWhenMessage(scene: TimelineItem): string | null {
    if (!shouldDisplayMissingWhenWarning(scene)) return null;

    const neighbors = this.getNarrativeNeighbors(scene);
    const previousDate = this.getValidWhen(neighbors?.previous);
    const nextDate = this.getValidWhen(neighbors?.next);

    const suggestions: string[] = [];
    if (previousDate) {
      suggestions.push(`Prev ${this.formatDateForDisplay(previousDate)}`);
    }
    if (nextDate) {
      suggestions.push(`Next ${this.formatDateForDisplay(nextDate)}`);
    }

    if (suggestions.length === 0) {
      return 'Missing When date';
    }

    const suggestionText = suggestions.length === 1
      ? suggestions[0]
      : `${suggestions[0]} or ${suggestions[1]}`;

    return `Missing When date — Try ${suggestionText}`;
  }

  private getNarrativeNeighbors(scene: TimelineItem): { previous?: TimelineItem; next?: TimelineItem } | null {
    const dataset = this.plugin.lastSceneData;
    if (!Array.isArray(dataset) || dataset.length === 0) return null;

    const sceneEntries = dataset.filter(item => !isBeatNote(item));
    if (sceneEntries.length === 0) return null;

    const seenKeys = new Set<string>();
    const deduped: TimelineItem[] = [];
    sceneEntries.forEach(item => {
      const key = this.getSceneKey(item);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduped.push(item);
      }
    });

    const ordered = sortScenes(deduped, false);
    const targetKey = this.getSceneKey(scene);
    const index = ordered.findIndex(item => this.getSceneKey(item) === targetKey);
    if (index === -1) return null;

    return {
      previous: index > 0 ? ordered[index - 1] : undefined,
      next: index < ordered.length - 1 ? ordered[index + 1] : undefined
    };
  }

  private getSceneKey(item: TimelineItem): string {
    return item.path || `${item.title || ''}::${String(item.when ?? '')}`;
  }

  private getValidWhen(item?: TimelineItem): Date | null {
    if (!item) return null;
    if (!(item.when instanceof Date)) return null;
    return Number.isNaN(item.when.getTime()) ? null : item.when;
  }
}
