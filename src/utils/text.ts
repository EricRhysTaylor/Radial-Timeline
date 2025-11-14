/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { escapeRegExp } from './regex';
import { escapeXml } from './svg';

// Decode basic HTML entities. If string already contains <tspan> markup we leave it untouched so SVG formatting is preserved.
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  if (text.includes('<tspan') || text.includes('&lt;tspan')) return text;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<!DOCTYPE html><body><span>${text}</span></body>`, 'text/html');
    const span = doc.querySelector('span');
    return span?.textContent ?? '';
  } catch {
    const span = document.createElement('span');
    span.textContent = text;
    return span.textContent ?? '';
  }
}

export interface SceneTitleParts { sceneNumber: string; title: string; date: string; duration: string; }

export function parseSceneTitleComponents(titleText: string, sceneNumber?: number | null, date?: string, duration?: string): SceneTitleParts {
  const result: SceneTitleParts = { sceneNumber: '', title: '', date: '', duration: '' };
  if (!titleText) return result;
  
  // Use frontmatter data if available
  if (sceneNumber !== null && sceneNumber !== undefined) {
    result.sceneNumber = String(sceneNumber);
  }
  if (date) {
    result.date = date;
  }
  if (duration) {
    result.duration = duration;
  }
  
  const decodedText = decodeHtmlEntities(titleText);
  if (decodedText.includes('<tspan')) {
    result.title = decodedText;
    return result;
  }
  
  // If we don't have frontmatter data, fall back to regex parsing
  if (result.sceneNumber === '' || result.date === '') {
    const dateMatch = decodedText.match(/\s{3,}(.+?)$/);
    if (dateMatch && result.date === '') {
      result.date = dateMatch[1].trim();
      const titlePart = decodedText.substring(0, dateMatch.index).trim();
      const titleMatch = titlePart.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (titleMatch) {
        if (result.sceneNumber === '') result.sceneNumber = titleMatch[1];
        result.title = titleMatch[2];
      } else {
        result.title = titlePart;
      }
    } else {
      const titleMatch = decodedText.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (titleMatch) {
        if (result.sceneNumber === '') result.sceneNumber = titleMatch[1];
        result.title = titleMatch[2];
      } else {
        result.title = decodedText;
      }
    }
  } else {
    // We have frontmatter data, just clean the title
    result.title = decodedText.replace(/^\d+(?:\.\d+)?\s+/, '').replace(/\s{3,}(.+?)$/, '').trim();
  }
  
  return result;
}

/**
 * Renders just the main title part of the scene title.
 * @param title - The title text.
 * @param searchTerm - The search term for highlighting.
 * @returns A DocumentFragment containing the title tspan.
 */
export function renderSceneTitleFragment(
  title: string,
  searchTerm: string
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const main = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
  main.setAttribute('class', 'rt-scene-title-bold');
  main.setAttribute('data-item-type', 'title');

  if (searchTerm && title) {
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(title))) {
      if (m.index > last) main.appendChild(document.createTextNode(title.slice(last, m.index)));
      const hl = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      hl.setAttribute('class', 'rt-search-term');
      // No fill attribute; inherit from parent via --rt-dynamic-color
      hl.textContent = m[0];
      main.appendChild(hl);
      last = m.index + m[0].length;
    }
    if (last < title.length) main.appendChild(document.createTextNode(title.slice(last)));
  } else {
    main.textContent = title;
  }

  fragment.appendChild(main);
  return fragment;
}

/**
 * Renders the metadata part (date, duration) of the scene title.
 * This part will be in its own <text> element.
 * @param date - The formatted date string.
 * @param duration - The formatted duration string.
 * @param searchTerm - The search term for highlighting.
 * @returns A DocumentFragment containing the metadata tspans.
 */
export function renderSceneMetadataFragment(
  date: string | undefined,
  duration: string | undefined,
  searchTerm: string
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  if (date) {
    const dateT = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    dateT.setAttribute('class', 'rt-date-text');
    dateT.setAttribute('data-item-type', 'date');
    dateT.setAttribute('dy', '-8px');
    (dateT as SVGTSpanElement).style.setProperty('--rt-dynamic-color', '#888888');
    (dateT as SVGTSpanElement).style.setProperty('font-size', '14px');

    if (searchTerm) {
      const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(date))) {
        if (m.index > last) dateT.appendChild(document.createTextNode(date.slice(last, m.index)));
        const hl = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        hl.setAttribute('class', 'rt-search-term');
        // Don't set fill attribute - will inherit from parent's CSS custom property
        hl.textContent = m[0];
        dateT.appendChild(hl);
        last = m.index + m[0].length;
      }
      if (last < date.length) dateT.appendChild(document.createTextNode(date.slice(last)));
    } else {
      dateT.textContent = date;
    }
    fragment.appendChild(dateT);

    if (duration) {
      const durationT = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      durationT.setAttribute('class', 'rt-duration-text');
      durationT.setAttribute('data-item-type', 'duration');
      durationT.setAttribute('x', '0'); // x=0 is correct now, relative to new <text> element
      durationT.setAttribute('dy', '16px');
      (durationT as SVGTSpanElement).style.setProperty('--rt-dynamic-color', '#888888');
      (durationT as SVGTSpanElement).style.setProperty('font-size', '14px');
      durationT.textContent = duration;
      fragment.appendChild(durationT);

      const resetAfterDuration = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      resetAfterDuration.setAttribute('x', '0');
      resetAfterDuration.setAttribute('dy', '8px');
      resetAfterDuration.textContent = '';
      fragment.appendChild(resetAfterDuration);
    } else {
      const resetAfterDate = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      resetAfterDate.setAttribute('dy', '8px');
      resetAfterDate.textContent = '';
      fragment.appendChild(resetAfterDate);
    }
  }

  return fragment;
}


/**
 * @deprecated Use renderSceneTitleFragment and renderSceneMetadataFragment instead.
 * This function is kept for reference during refactoring and will be removed.
 */
export function renderSceneTitleComponents(
  title: SceneTitleParts,
  searchTerm: string,
  titleColor?: string
): void {
  // Don't use a container tspan - add elements directly to fragment as siblings
  // This prevents the date from inheriting title styles
  if (title.sceneNumber) {
    const num = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    num.classList.add('rt-scene-title-bold');
    num.setAttribute("data-item-type", "title");
    if (titleColor) {
      (num as SVGTSpanElement).style.setProperty('--rt-dynamic-color', titleColor);
    }
    num.textContent = `${title.sceneNumber} `;
    // The fragment is now handled by renderSceneTitleFragment
  }
  // The fragment is now handled by renderSceneTitleFragment
  if (title.date) {
    // Add spacing before date
    const spacer = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    spacer.textContent = '    ';
    // The fragment is now handled by renderSceneMetadataFragment
  }
}

/**
 * Splits arbitrary text into roughly balanced lines that fit typical SVG label widths.
 * Preserves <tspan> markup by falling back to the original string.
 */
export function splitIntoBalancedLines(text: string, maxWidth: number): string[] {
  if (!text) return [''];

  if (text.includes('<tspan')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><text>${text}</text></svg>`, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return [text];
    const textElement = doc.querySelector('text');
    if (!textElement) return [text];
    const plainText = textElement.textContent || '';
    const plainLines = splitPlainTextIntoLines(plainText, maxWidth);
    return plainLines.length <= 1 ? [text] : [text];
  }

  return splitPlainTextIntoLines(text, maxWidth);
}

function splitPlainTextIntoLines(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;
  const approxCharWidth = 8;
  const maxCharsPerLine = Math.max(10, Math.round((maxWidth || 400) / approxCharWidth)) || 50;

  for (const word of words) {
    const wordWidth = word.length;
    if (currentWidth + wordWidth > maxCharsPerLine && currentLine !== '') {
      lines.push(currentLine.trim());
      currentLine = word;
      currentWidth = wordWidth;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
      currentWidth += wordWidth + (currentLine ? 1 : 0);
    }
  }

  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

// --- Scene title parser that prefers frontmatter data over regex parsing ---
export function parseSceneTitle(title: string, sceneNumber?: number | null): { number: string; text: string } {
  if (!title) return { number: '0', text: '' };
  
  // Use frontmatter sceneNumber if available
  if (sceneNumber !== null && sceneNumber !== undefined) {
    const cleanTitle = title.replace(/^\d+(?:\.\d+)?\s+/, ''); // Remove leading number if present
    return { number: String(sceneNumber), text: escapeXml(cleanTitle) };
  }
  
  // Fallback to regex parsing for legacy data
  const match = title.match(/^(\d+(?:\.\d+)?)\s+(.+)/);
  if (match) {
    const number = match[1];
    const text = match[2];
    return { number, text: escapeXml(text) };
  }
  
  // If no number is found, use the whole title
  return { number: '', text: escapeXml(title) };
}

export type NormalizedStatus = 'Todo' | 'Working' | 'Due' | 'Completed';

export function normalizeStatus(raw: unknown): NormalizedStatus | null {
  if (raw == null) return 'Todo';
  const v = Array.isArray(raw) ? String(raw[0] ?? '').trim().toLowerCase() : String(raw).trim().toLowerCase();
  if (!v) return 'Todo';
  if (v === 'complete' || v === 'done' || v === 'completed') return 'Completed';
  if (v === 'working' || v === 'in progress' || v === 'progress') return 'Working';
  if (v === 'todo' || v === 'to do' || v === 'tbd') return 'Todo';
  return null; // let caller decide Due based on date, or default
}

// Unified helpers for scene prefix numbers and number-square sizing
export function getScenePrefixNumber(title: string | undefined | null, sceneNumber?: number | null): string | null {
  if (!title) return null;
  
  // Use frontmatter sceneNumber if available
  if (sceneNumber !== null && sceneNumber !== undefined) {
    return String(sceneNumber);
  }
  
  // Fallback to regex parsing for legacy data
  const decoded = decodeHtmlEntities(title);
  // Titles are of the form: "12.3 Title here" or "12 Title here" (no dates)
  const m = decoded.match(/^(\d+(?:\.\d+)?)\s+.+/);
  return m ? m[1] : null;
}

export function getNumberSquareSize(num: string): { width: number; height: number } {
  const height = 18;
  if (num.includes('.')) {
    return {
      width: num.length <= 3 ? 24 :
             num.length <= 4 ? 32 :
             36,
      height
    };
  }
  return {
    width: num.length === 1 ? 20 :
           num.length === 2 ? 24 :
           28,
    height
  };
}

/**
 * Remove Obsidian comment blocks (%%...%%) from text.
 * Handles both single-line and multi-line comments.
 */
export function stripObsidianComments(text: string): string {
  if (!text) return text;
  // Remove all %%...%% blocks (non-greedy match, multi-line aware)
  return text.replace(/%%[\s\S]*?%%/g, '').trim();
}

/**
 * Strip Obsidian wiki link syntax [[...]] from text.
 * Handles both simple [[Link]] and aliased [[Link|Alias]] formats.
 * @param text - Text that may contain wiki links
 * @returns Text with wiki link brackets removed (just the link target or alias)
 */
export function stripWikiLinks(text: string): string {
  if (!text) return text;
  // Replace [[Link|Alias]] with Alias, and [[Link]] with Link
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) => alias || link).trim();
}
