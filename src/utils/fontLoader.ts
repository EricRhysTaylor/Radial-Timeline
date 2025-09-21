import { EMBEDDED_FONTS } from '../assets/embeddedFonts';

/**
 * Injects @font-face rules for any embedded base64 fonts present.
 * If no base64 is provided, nothing is injected and fallbacks apply.
 */
export function loadEmbeddedFonts(): void {
  try {
    const rules: string[] = [];
    const makeFace = (
      family: string,
      weight: 400 | 700,
      style: 'normal' | 'italic',
      b64: string
    ) => (
      `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url(data:font/woff2;base64,${b64}) format('woff2'); }`
    );

    Object.entries(EMBEDDED_FONTS).forEach(([family, variants]) => {
      const normal = variants.normal?.trim();
      const bold = variants.bold?.trim();
      const italic = variants.italic?.trim();
      const boldItalic = variants.boldItalic?.trim();
      if (normal) {
        rules.push(makeFace(family, 400, 'normal', normal));
      }
      if (bold) {
        rules.push(makeFace(family, 700, 'normal', bold));
      }
      if (italic) {
        rules.push(makeFace(family, 400, 'italic', italic));
      }
      if (boldItalic) {
        rules.push(makeFace(family, 700, 'italic', boldItalic));
      }
    });

    if (rules.length === 0) return; // nothing to inject

    const id = 'rt-embedded-fonts';
    let styleTag = document.getElementById(id) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = id;
      styleTag.type = 'text/css';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = rules.join('\n');
  } catch (e) {
    // Fail silently; fallbacks will be used
    const isDev = typeof process !== 'undefined' && typeof process.env !== 'undefined' && process.env.NODE_ENV === 'development';
    if (isDev) {
      // Only log in development to avoid noise for users
      console.warn('RadialTimeline: failed to load embedded fonts', e);
    }
  }
}
