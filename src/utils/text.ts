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

export interface SceneTitleParts { sceneNumber: string; title: string; date: string; }

export function parseSceneTitleComponents(titleText: string): SceneTitleParts {
  const result: SceneTitleParts = { sceneNumber: '', title: '', date: '' };
  if (!titleText) return result;
  const decodedText = decodeHtmlEntities(titleText);
  if (decodedText.includes('<tspan')) {
    result.title = decodedText;
    return result;
  }
  const dateMatch = decodedText.match(/\s{3,}(.+?)$/);
  if (dateMatch) {
    result.date = dateMatch[1].trim();
    const titlePart = decodedText.substring(0, dateMatch.index).trim();
    const titleMatch = titlePart.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (titleMatch) {
      result.sceneNumber = titleMatch[1];
      result.title = titleMatch[2];
    } else {
      result.title = titlePart;
    }
  } else {
    const titleMatch = decodedText.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (titleMatch) {
      result.sceneNumber = titleMatch[1];
      result.title = titleMatch[2];
    } else {
      result.title = decodedText;
    }
  }
  return result;
}

/**
 * Build SVG tspans for a scene title, optionally highlighting a search term.
 */
export function renderSceneTitleComponents(
  title: SceneTitleParts,
  fragment: DocumentFragment,
  searchTerm?: string,
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
    fragment.appendChild(num);
  }
  const main = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
  main.classList.add('rt-scene-title-bold');
  main.setAttribute("data-item-type", "title");
  if (titleColor) {
    (main as SVGTSpanElement).style.setProperty('--rt-dynamic-color', titleColor);
  }
  fragment.appendChild(main);
  if (searchTerm && title.title) {
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(title.title))) {
      if (m.index > last) main.appendChild(document.createTextNode(title.title.slice(last, m.index)));
      const hl = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      hl.setAttribute('class', 'rt-search-term');
      // No fill attribute; inherit from parent via --rt-title-color
      hl.textContent = m[0];
      main.appendChild(hl);
      last = m.index + m[0].length;
    }
    if (last < title.title.length) main.appendChild(document.createTextNode(title.title.slice(last)));
  } else {
    main.textContent = title.title;
  }
  if (title.date) {
    // Add spacing before date
    const spacer = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    spacer.textContent = '    ';
    fragment.appendChild(spacer);
    
    // Create date tspan with EXACT same pattern as characters
    const dateT = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    dateT.setAttribute('class', 'rt-date-text');
    dateT.setAttribute('data-item-type', 'date');
    dateT.setAttribute('dy', '-4px'); // Shift baseline up slightly
    
    // Use EXACT same pattern as characters: --rt-dynamic-color
    (dateT as SVGTSpanElement).style.setProperty('--rt-dynamic-color', '#888888');
    (dateT as SVGTSpanElement).style.setProperty('font-size', '22px'); // Inline style to ensure it applies
    
    // Apply search highlighting to date if searchTerm provided
    if (searchTerm && title.date) {
      const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(title.date))) {
        if (m.index > last) dateT.appendChild(document.createTextNode(title.date.slice(last, m.index)));
        const hl = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        hl.setAttribute('class', 'rt-search-term');
        // Don't set fill attribute - will inherit from parent's CSS custom property
        hl.textContent = m[0];
        dateT.appendChild(hl);
        last = m.index + m[0].length;
      }
      if (last < title.date.length) dateT.appendChild(document.createTextNode(title.date.slice(last)));
    } else {
      dateT.textContent = title.date;
    }
    
    fragment.appendChild(dateT);
  }
}

// --- Added simple numeric-title parser used by TimelineRenderer ---
export function parseSceneTitle(title: string): { number: string; text: string } {
  if (!title) return { number: '0', text: '' };
  const match = title.match(/^(\d+(?:\.\d+)?)\s+(.+)/);
  if (match) {
    const number = match[1];
    const rawText = match[2];
    return { number, text: escapeXml(rawText) };
  }
  return { number: '0', text: escapeXml(title) };
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
export function getScenePrefixNumber(title: string | undefined | null): string | null {
  if (!title) return null;
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