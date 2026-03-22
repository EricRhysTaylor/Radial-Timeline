import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDefaultAuthorProgressSettings, migrateAuthorProgressSettings } from '../src/authorProgress/authorProgressConfig';
import { resolveBookTitle, resolveProjectPath } from '../src/renderer/apr/aprHelpers';

describe('authorProgress contract', () => {
    it('migrates legacy social settings into canonical defaults and campaign overrides', () => {
        const migrated = migrateAuthorProgressSettings({
            enabled: true,
            defaultPublishTarget: 'note',
            bookTitle: 'Base Title',
            socialProjectPath: 'Projects/Base',
            dynamicEmbedPath: 'Radial Timeline/Social/base/apr-default-manual-medium.png',
            campaigns: [
                {
                    id: 'campaign-1',
                    name: 'Launch',
                    embedPath: 'Radial Timeline/Social/base/campaigns/apr-launch-auto-weekly-large-teaser.png',
                    projectPath: 'Projects/Launch',
                    bookTitle: 'Launch Title',
                    teaserReveal: { enabled: true, preset: 'fast' }
                }
            ],
            revealCampaign: { enabled: true, nextRevealAt: '2026-01-01' }
        });

        expect(migrated.enabled).toBe(true);
        expect(migrated.defaults.publishTarget).toBe('note');
        expect(migrated.defaults.bookTitleOverride).toBe('Base Title');
        expect(migrated.defaults.projectPathOverride).toBe('Projects/Base');
        expect((migrated.defaults as any).defaultPublishTarget).toBeUndefined();
        expect((migrated.defaults as any).dynamicEmbedPath).toBeUndefined();
        expect((migrated.defaults as any).socialProjectPath).toBeUndefined();
        expect(JSON.stringify(migrated)).not.toContain('revealCampaign');

        expect(migrated.campaigns).toHaveLength(1);
        expect(migrated.campaigns?.[0]).toMatchObject({
            id: 'campaign-1',
            name: 'Launch',
            exportPath: 'Radial Timeline/Social/base/campaigns/apr-launch-auto-weekly-large-teaser.png',
            projectPathOverride: 'Projects/Launch',
            bookTitleOverride: 'Launch Title'
        });
        expect((migrated.campaigns?.[0] as any).embedPath).toBeUndefined();
        expect((migrated.campaigns?.[0] as any).projectPath).toBeUndefined();
        expect((migrated.campaigns?.[0] as any).bookTitle).toBeUndefined();
    });

    it('applies base defaults and campaign overrides through one resolution path', () => {
        const settings = buildDefaultAuthorProgressSettings();
        settings.defaults.projectPathOverride = 'Projects/Base';
        settings.defaults.bookTitleOverride = 'Base Title';
        settings.campaigns = [
            {
                id: 'campaign-1',
                name: 'Launch',
                isActive: true,
                refreshThresholdDays: 7,
                exportPath: 'Radial Timeline/Social/base/campaigns/apr-launch-manual-medium.png',
                projectPathOverride: 'Projects/Launch',
                bookTitleOverride: 'Launch Title',
                teaserReveal: { enabled: true, preset: 'standard' }
            }
        ];

        expect(resolveProjectPath(settings, null, 'Source/Book')).toBe('Projects/Base');
        expect(resolveBookTitle(settings, null, 'Projects/Base')).toBe('Base Title');
        expect(resolveProjectPath(settings, settings.campaigns[0], 'Source/Book')).toBe('Projects/Launch');
        expect(resolveBookTitle(settings, settings.campaigns[0], 'Projects/Launch')).toBe('Launch Title');
    });

    it('uses canonical social contract names outside the migration seam', () => {
        const files = [
            'src/settings/SettingsTab.ts',
            'src/types/settings.ts',
            'src/authorProgress/authorProgressConfig.ts',
            'src/services/authorProgress/AuthorProgressPublishService.ts',
            'src/settings/sections/AuthorProgressSection.ts'
        ];

        const combined = files
            .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
            .join('\n');

        expect(combined.includes('APR_PATH')).toBe(false);
        expect(combined.includes('Author Progress Report')).toBe(false);
        expect(combined.includes('APR campaign management')).toBe(false);
        expect(combined.includes('APR modal')).toBe(false);
        expect(combined.includes('Share · Author Progress Report')).toBe(false);
        expect(combined.includes('preview of your Author Progress Report')).toBe(false);
        expect(combined.includes('Social campaign management and teaser controls')).toBe(true);
        expect(combined.includes("socialTab.createSpan({ text: 'Social'")).toBe(true);
        expect(combined.includes('Social / authorProgress settings')).toBe(true);
        expect(combined.includes('![Social](')).toBe(true);
        expect(combined.includes('social-default-manual-medium.png')).toBe(true);
    });
});
