import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI settings cache preview signals', () => {
    it('renders provider-cache preview pills and cache-ready certificate copy as active signals', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("/^Reuse\\s*·\\s*Provider cache$/i.test(label)")).toBe(true);
        expect(source.includes("extraCls: 'ert-ai-pill--active'")).toBe(true);
        expect(source.includes("extraPills.push({ text: 'Cache · Ready', extraCls: 'ert-ai-pill--active' });")).toBe(false);
        expect(source.includes("extraPills.push({ text: 'Cache · Warm hit', extraCls: 'ert-ai-pill--active' });")).toBe(false);
        // DOCTRINE: only payload-proven 'warm' may show success/TTL copy.
        // 'Cache ready …' (derived from an unproven cacheWindowExpiresAt) is
        // a fabrication and must not exist in the source.
        expect(source.includes('Warm cache confirmed for current corpus')).toBe(true);
        expect(source.includes('Cache ready for current corpus')).toBe(false);
        expect(source.includes('Cache ready on last Inquiry corpus')).toBe(false);
        expect(source.includes("cacheSession?.cacheReuseState === 'warm'")).toBe(true);
        // formatPreviewCacheObservedLabel template literal moved into aiSettingsPreview.ts.
        const previewSource = readFileSync(resolve(process.cwd(), 'src/settings/sections/aiSettingsPreview.ts'), 'utf8');
        expect(previewSource.includes('Observed cache hit ·')).toBe(true);
    });

    it('renders a distinct "Cache armed" branch when the cache was created (not reused) — matches the AI Engine popover', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        // Pin: the armed branch sits between warm-confirmed and the
        // default "completed" state. Triggered by providerCacheStatus
        // === 'created' (cache-manager truth, NOT inferred from payload
        // alone) with a still-open TTL.
        expect(source.includes("cacheSession?.providerCacheStatus === 'created'")).toBe(true);
        // Pin: the status text uses "Cache armed" wording (matches the
        // AI Engine popover) and includes the remaining-time label.
        expect(source.includes('Cache armed for next run on current corpus')).toBe(true);
        expect(source.includes('Cache armed on last Inquiry corpus')).toBe(true);
        // Pin: explicit "Cache armed" pill is appended so the chip row
        // mirrors the popover's chip.
        expect(source.includes("text: 'Cache armed'")).toBe(true);
        // Doctrine: the armed branch is NOT a fabrication — it's
        // gated on providerCacheStatus from the cache manager, not on
        // cacheWindowExpiresAt alone.
        expect(/Cache armed[\s\S]+?providerCacheStatus === 'created'|providerCacheStatus === 'created'[\s\S]+?Cache armed/.test(source)).toBe(true);
    });
});
