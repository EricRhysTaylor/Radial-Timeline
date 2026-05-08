import { describe, expect, it } from 'vitest';
import * as fs from 'fs'; // SAFE: test-only fixture setup for the font resolver.
import * as os from 'os'; // SAFE: test-only temp directory resolution.
import * as path from 'path'; // SAFE: test-only fixture path setup.
import { buildFontspecBlock, vaultDirHasFont, FONT_REGISTRY } from './fontResolver';

describe('buildFontspecBlock — vault → system resolution', () => {
    it('emits a Path-based \\setmainfont when the vault has all required font files', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-resolver-vault-'));
        const dir = path.join(root, 'sorts-mill-goudy');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Regular.ttf'), '');
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Italic.ttf'), '');
        try {
            const block = buildFontspecBlock({ fontKey: 'sorts-mill-goudy', vaultFontDir: root });
            expect(block).toContain('\\setmainfont{Sorts Mill Goudy}[');
            expect(block).toContain(`Path = ${root}/sorts-mill-goudy/`);
            expect(block).toContain('UprightFont = SortsMillGoudy-Regular.ttf');
            expect(block).toContain('ItalicFont = SortsMillGoudy-Italic.ttf');
            expect(block).toContain('AutoFakeBold = 2.5');
            expect(block).toContain('AutoFakeSlant = 0.2');
            expect(block).not.toContain('\\PackageError');
            expect(block).not.toContain('\\IfFontExistsTF');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('emits a plain \\setmainfont when no vaultFontDir is supplied', () => {
        const block = buildFontspecBlock({ fontKey: 'sorts-mill-goudy' });
        expect(block).toBe('\\setmainfont{Sorts Mill Goudy}');
    });

    it('emits a plain \\setmainfont when vaultFontDir is supplied but the font subdirectory is empty', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-resolver-empty-'));
        try {
            const block = buildFontspecBlock({ fontKey: 'latin-modern', vaultFontDir: root });
            expect(block).toBe('\\setmainfont{Latin Modern Roman}');
            expect(block).not.toContain('Path =');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('appends a \\headerfont declaration when letterSpacing > 0 (vault path)', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-resolver-ls-vault-'));
        const dir = path.join(root, 'sorts-mill-goudy');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Regular.ttf'), '');
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Italic.ttf'), '');
        try {
            const block = buildFontspecBlock({
                fontKey: 'sorts-mill-goudy',
                vaultFontDir: root,
                letterSpacing: 15,
            });
            expect(block).toContain('\\newfontface\\headerfont{Sorts Mill Goudy}[');
            expect(block).toContain('LetterSpace = 15.0');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('appends a \\headerfont declaration when letterSpacing > 0 (system path)', () => {
        const block = buildFontspecBlock({ fontKey: 'sorts-mill-goudy', letterSpacing: 15 });
        expect(block).toContain('\\setmainfont{Sorts Mill Goudy}');
        expect(block).toContain('\\newfontface\\headerfont{Sorts Mill Goudy}[LetterSpace=15.0]');
    });

    it('throws on unknown font keys (no silent default)', () => {
        expect(() => buildFontspecBlock({ fontKey: 'not-a-real-font' as never }))
            .toThrow(/Unknown font key/);
    });

    it('emits no \\PackageError or \\IfFontExistsTF blocks under any path', () => {
        for (const fontKey of Object.keys(FONT_REGISTRY)) {
            const block = buildFontspecBlock({ fontKey });
            expect(block).not.toContain('\\PackageError');
            expect(block).not.toContain('\\IfFontExistsTF');
        }
    });
});

describe('vaultDirHasFont — file presence check', () => {
    it('returns false when the slug subdirectory does not exist', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-vdhf-missing-'));
        try {
            expect(vaultDirHasFont(root, FONT_REGISTRY['sorts-mill-goudy'].files)).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns false when the slug exists but a required file is missing', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-vdhf-partial-'));
        const dir = path.join(root, 'sorts-mill-goudy');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Regular.ttf'), '');
        // Italic is missing.
        try {
            expect(vaultDirHasFont(root, FONT_REGISTRY['sorts-mill-goudy'].files)).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns true when every required file exists', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-vdhf-ok-'));
        const dir = path.join(root, 'sorts-mill-goudy');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Regular.ttf'), '');
        fs.writeFileSync(path.join(dir, 'SortsMillGoudy-Italic.ttf'), '');
        try {
            expect(vaultDirHasFont(root, FONT_REGISTRY['sorts-mill-goudy'].files)).toBe(true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns false for system-only fonts (no upright filename in registry)', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-vdhf-systemonly-'));
        try {
            // eb-garamond, crimson, system-serif, system-sans have no bundled files.
            expect(vaultDirHasFont(root, FONT_REGISTRY['eb-garamond'].files)).toBe(false);
            expect(vaultDirHasFont(root, FONT_REGISTRY['system-serif'].files)).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
