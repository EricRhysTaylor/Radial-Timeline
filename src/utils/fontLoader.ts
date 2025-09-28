import { EMBEDDED_FONTS } from '../assets/embeddedFonts';

/**
 * Injects @font-face rules for any embedded base64 fonts present.
 * If no base64 is provided, nothing is injected and fallbacks apply.
 */
// No-op loader: avoid injecting <style> tags at runtime.
// Obsidian should manage CSS via styles.css only.
export function loadEmbeddedFonts(): void {
  return;
}
