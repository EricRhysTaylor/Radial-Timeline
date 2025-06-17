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
  const container = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
  fragment.appendChild(container);
  if (title.sceneNumber) {
    const num = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    num.setAttribute('font-weight', 'bold');
    if (titleColor) num.setAttribute('fill', titleColor);
    num.textContent = `${title.sceneNumber} `;
    container.appendChild(num);
  }
  const main = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
  main.setAttribute('font-weight', 'bold');
  if (titleColor) main.setAttribute('fill', titleColor);
  container.appendChild(main);
  if (searchTerm && title.title) {
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(title.title))) {
      if (m.index > last) main.appendChild(document.createTextNode(title.title.slice(last, m.index)));
      const hl = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      hl.setAttribute('class', 'search-term');
      if (titleColor) hl.setAttribute('fill', titleColor);
      hl.textContent = m[0];
      main.appendChild(hl);
      last = m.index + m[0].length;
    }
    if (last < title.title.length) main.appendChild(document.createTextNode(title.title.slice(last)));
  } else {
    main.textContent = title.title;
  }
  if (title.date) {
    fragment.appendChild(document.createTextNode('    '));
    const dateT = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    dateT.setAttribute('class', 'date-text');
    if (titleColor) dateT.setAttribute('fill', titleColor);
    dateT.textContent = title.date;
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