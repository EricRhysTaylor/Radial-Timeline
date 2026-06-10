#!/usr/bin/env node
// Injects @font-face rules (built from src/assets/embeddedFonts.ts) into
// release/styles.css between the __EMBEDDED_FONTS__ markers. Runs as the
// post-build step of a release build, locally or in the release workflow.

import { readFileSync, writeFileSync } from "fs";

function buildEmbeddedFontsCss() {
    const srcPath = 'src/assets/embeddedFonts.ts';
    let css = '';
    try {
        const ts = readFileSync(srcPath, 'utf8');
        const objMatch = ts.match(/EMBEDDED_FONTS\s*=\s*\{([\s\S]*?)\}\s*;/);
        if (!objMatch) return '';
        const body = objMatch[1];
        const familyRe = /(\w+)\s*:\s*\{([\s\S]*?)\}/g;
        let fm;
        while ((fm = familyRe.exec(body)) !== null) {
            const family = fm[1];
            const block = fm[2];
            const readVal = (key) => {
                const m = block.match(new RegExp(key + ":\\s*'([\\s\\S]*?)'"));
                return m && m[1] && m[1].trim().length > 0 ? m[1].trim() : null;
            };
            const normal = readVal('normal');
            const bold = readVal('bold');
            const italic = readVal('italic');
            const boldItalic = readVal('boldItalic');
            const addFace = (style, weight, b64) => {
                if (!b64) return;
                css += `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}` + "\n";
            };
            addFace('normal', 400, normal);
            addFace('normal', 700, bold);
            addFace('italic', 400, italic);
            addFace('italic', 700, boldItalic);
        }
    } catch {
        return '';
    }
    return css.trim();
}

export function injectEmbeddedFontsIntoReleaseCss() {
    const releaseCssPath = 'release/styles.css';
    const markerStart = '/* __EMBEDDED_FONTS_START__ */';
    const markerEnd = '/* __EMBEDDED_FONTS_END__ */';
    let css;
    try {
        css = readFileSync(releaseCssPath, 'utf8');
    } catch (e) {
        console.warn('⚠️  Could not read release/styles.css to inject fonts:', e.message);
        return;
    }
    const startIdx = css.indexOf(markerStart);
    const endIdx = css.indexOf(markerEnd);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        css = css.slice(0, startIdx) + css.slice(endIdx + markerEnd.length);
    }
    const faces = buildEmbeddedFontsCss();
    if (!faces) {
        writeFileSync(releaseCssPath, css);
        return;
    }
    const block = `\n${markerStart}\n${faces}\n${markerEnd}\n`;
    writeFileSync(releaseCssPath, css + block);
    console.log('✅ Injected embedded @font-face rules into release/styles.css');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    injectEmbeddedFontsIntoReleaseCss();
}
