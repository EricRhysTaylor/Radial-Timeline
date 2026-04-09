import { App } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getExportPreset } from '../../renderer/apr/aprPresets';
import type { AuthorProgressCampaign, AuthorProgressDefaults, AprExportQuality } from '../../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, teaserLevelToRevealOptions } from '../../renderer/apr/AprConstants';
import { hasProFeatureAccess } from '../../settings/featureGate';
import { isBeatNote, isSceneItem } from '../../utils/sceneHelpers';
import { buildDefaultEmbedPath, normalizeAprExportFormat, type AprExportFormat } from '../../utils/aprPaths';
import { resolveBookTitle, resolveProjectPath } from '../../renderer/apr/aprHelpers';
import type { TimelineItem } from '../../types/timeline';
import { writeManagedOutput } from '../../utils/logVaultOps';

export interface AuthorProgressReportBuildResult {
    settings: AuthorProgressDefaults;
    svgString: string;
    width: number;
    height: number;
    exportPath: string;
    exportFormat: AprExportFormat;
}

export interface AuthorProgressCampaignBuildResult {
    settings: AuthorProgressDefaults;
    campaign: AuthorProgressCampaign;
    svgString: string;
    width: number;
    height: number;
    meta: {
        format: AprExportFormat;
        size: string;
        stage: string;
        percent: number;
    };
}

export class AuthorProgressRenderService {
    constructor(private plugin: RadialTimelinePlugin, private app: App) {}

    public calculateProgress(scenes: TimelineItem[]): number {
        const settings = this.plugin.settings.authorProgress?.defaults;
        if (settings?.aprProgressMode === 'date') {
            const dateProgress = this.calculateDateProgress(settings.aprProgressDateStart, settings.aprProgressDateTarget);
            if (dateProgress !== null) {
                return dateProgress;
            }
        }

        const estimate = this.plugin.calculateCompletionEstimate(scenes);
        if (!estimate || estimate.total === 0) {
            const sceneNotesOnly = scenes.filter(scene => !isBeatNote(scene));
            if (sceneNotesOnly.length === 0) return 0;
            const isCompleted = (status: TimelineItem['status']): boolean => {
                const val = Array.isArray(status) ? status[0] : status;
                const normalized = (val ?? '').toString().trim().toLowerCase();
                return normalized === 'complete' || normalized === 'completed' || normalized === 'done';
            };
            return sceneNotesOnly.every(scene => isCompleted(scene.status)) ? 100 : 0;
        }

        const completed = estimate.total - estimate.remaining;
        const percent = (completed / estimate.total) * 100;
        return Math.min(100, Math.max(0, Math.round(percent)));
    }

    public getDefaultExportFormat(settings: AuthorProgressDefaults): AprExportFormat {
        if (typeof settings.exportFormat === 'string' && settings.exportFormat.trim()) {
            return normalizeAprExportFormat(settings.exportFormat);
        }
        return this.pathFormat(settings.exportPath ?? '', 'png');
    }

    public getDefaultExportPath(settings: AuthorProgressDefaults): string {
        return settings.exportPath || buildDefaultEmbedPath({
            bookTitle: this.plugin.getActiveBookTitle(),
            updateFrequency: settings.updateFrequency,
            aprExportQuality: settings.aprExportQuality,
            exportFormat: this.getDefaultExportFormat(settings)
        });
    }

    public getCampaignExportFormat(campaign?: AuthorProgressCampaign): AprExportFormat {
        if (!campaign) return 'png';
        if (typeof campaign.exportFormat === 'string' && campaign.exportFormat.trim()) {
            return normalizeAprExportFormat(campaign.exportFormat);
        }
        return this.pathFormat(campaign.exportPath ?? '', 'png');
    }

    public async saveAprOutput(path: string, format: AprExportFormat, svgString: string, width: number, height: number): Promise<void> {
        await this.ensureFolder(path);
        if (format === 'svg') {
            const result = await writeManagedOutput(this.app, path, svgString, {
                operation: 'author-progress-svg',
                managedMarker: '<!-- Radial Timeline Managed Output: author-progress-svg -->',
                unmanagedOverwritePrompt: (file) => `Overwrite existing author progress SVG "${file.path}"? RT will archive the current SVG to a log snapshot first. Manual edits may be replaced.`
            });
            if (result.skipped) {
                throw new Error('Author progress SVG overwrite cancelled.');
            }
            return;
        }

        const png = await this.svgToPngBuffer(svgString, width, height);
        await this.app.vault.adapter.writeBinary(path, png);
    }

    public buildSnapshotPath(exportPath: string, fallbackBase = 'apr'): string {
        const trimmed = exportPath.trim();
        const lastSlash = trimmed.lastIndexOf('/');
        const folder = lastSlash >= 0 ? trimmed.slice(0, lastSlash) : '';
        const file = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
        const extMatch = file.match(/\.([a-z0-9]+)$/i);
        const ext = (extMatch?.[1] ?? 'png').toLowerCase();
        const base = extMatch ? file.slice(0, -(ext.length + 1)) : file;
        const safeBase = base.trim() || fallbackBase;
        const fileName = `${safeBase}-snapshot-${Date.now()}.${ext}`;
        return folder ? `${folder}/${fileName}` : fileName;
    }

    public async buildDefaultReport(): Promise<AuthorProgressReportBuildResult | null> {
        const authorProgress = this.plugin.settings.authorProgress;
        const settings = authorProgress?.defaults;
        if (!authorProgress || !settings) return null;

        const projectPath = resolveProjectPath(null, this.plugin.settings.books, this.plugin.settings.sourcePath);
        const scenes = await this.plugin.getSceneData({ sourcePath: projectPath });
        const scenesFiltered = scenes.filter(isSceneItem);
        const progressPercent = this.calculateProgress(scenesFiltered);
        const publishStageLabel = this.resolvePublishStageLabel(scenesFiltered);
        const showRtAttribution = hasProFeatureAccess(this.plugin)
            ? settings.aprShowRtAttribution !== false
            : true;

        const designSize = settings.aprSize || 'medium';
        const exportQuality: AprExportQuality = settings.aprExportQuality || 'standard';
        const isThumb = designSize === 'thumb';
        const bookTitle = resolveBookTitle(null, this.plugin.settings.books, this.plugin.getActiveBookTitle());

        const { svgString, width, height } = createAprSVG(scenesFiltered, {
            size: designSize,
            exportPreset: getExportPreset(designSize, exportQuality),
            progressPercent,
            bookTitle,
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showScenes: !isThumb,
            showSubplots: settings.showSubplots ?? true,
            showActs: settings.showActs ?? true,
            showStatusColors: settings.showStatus ?? true,
            showProgressPercent: isThumb ? false : (settings.showProgressPercent ?? true),
            showBranding: !isThumb,
            centerMark: 'none',
            stageColors: (this.plugin.settings as any).publishStageColors,
            actCount: this.plugin.settings.actCount || undefined,
            backgroundColor: settings.aprBackgroundColor,
            transparentCenter: settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            theme: settings.aprTheme || 'dark',
            spokeColor: settings.aprSpokeColorMode === 'custom' ? settings.aprSpokeColor
                : settings.aprSpokeColorMode === 'sync' ? settings.aprBackgroundColor
                : undefined,
            publishStageLabel,
            showRtAttribution,
            teaserRevealEnabled: false,
            bookTitleFontFamily: settings.aprBookTitleFontFamily,
            bookTitleFontWeight: settings.aprBookTitleFontWeight,
            bookTitleFontItalic: settings.aprBookTitleFontItalic,
            bookTitleFontSize: settings.aprBookTitleFontSize,
            authorNameFontFamily: settings.aprAuthorNameFontFamily,
            authorNameFontWeight: settings.aprAuthorNameFontWeight,
            authorNameFontItalic: settings.aprAuthorNameFontItalic,
            authorNameFontSize: settings.aprAuthorNameFontSize,
            percentNumberFontSize1Digit: settings.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: settings.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: settings.aprPercentNumberFontSize3Digit,
            rtBadgeFontFamily: settings.aprRtBadgeFontFamily,
            rtBadgeFontWeight: settings.aprRtBadgeFontWeight,
            rtBadgeFontItalic: settings.aprRtBadgeFontItalic,
            rtBadgeFontSize: settings.aprRtBadgeFontSize,
            portableSvg: true
        });

        return {
            settings,
            svgString,
            width,
            height,
            exportPath: this.getDefaultExportPath(settings),
            exportFormat: this.pathFormat(this.getDefaultExportPath(settings), this.getDefaultExportFormat(settings))
        };
    }

    public async buildCampaignReport(campaignId: string): Promise<AuthorProgressCampaignBuildResult | null> {
        const authorProgress = this.plugin.settings.authorProgress;
        const settings = authorProgress?.defaults;
        if (!authorProgress || !settings) return null;

        const campaign = authorProgress.campaigns?.find(c => c.id === campaignId);
        if (!campaign) return null;

        const books = this.plugin.settings.books;
        const projectPath = resolveProjectPath(campaign, books, this.plugin.settings.sourcePath);
        const scenes = await this.plugin.getSceneData({ sourcePath: projectPath });
        const scenesFiltered = scenes.filter(isSceneItem);
        const progressPercent = this.calculateProgress(scenesFiltered);
        const publishStageLabel = this.resolvePublishStageLabel(scenesFiltered);
        const showRtAttribution = hasProFeatureAccess(this.plugin)
            ? settings.aprShowRtAttribution !== false
            : true;

        const baseShowSubplots = settings.showSubplots ?? true;
        const baseShowActs = settings.showActs ?? true;
        const baseShowStatusColors = settings.showStatus ?? true;
        const baseShowProgressPercent = settings.showProgressPercent ?? true;

        let showScenes = true;
        let showSubplots = baseShowSubplots;
        let showActs = baseShowActs;
        let showStatusColors = baseShowStatusColors;
        let showStageColors = true;
        let grayCompletedScenes = false;
        let grayscaleScenes = false;
        let showProgressPercent = baseShowProgressPercent;
        let isTeaserBar = false;
        let debugStage = 'Standard';

        if (campaign.teaserReveal?.enabled) {
            const preset = campaign.teaserReveal.preset ?? 'standard';
            const thresholds = getTeaserThresholds(preset, campaign.teaserReveal.customThresholds);
            const revealLevel = getTeaserRevealLevel(
                progressPercent,
                thresholds,
                campaign.teaserReveal.disabledStages
            );
            debugStage = revealLevel;
            const revealOptions = teaserLevelToRevealOptions(revealLevel);
            isTeaserBar = revealLevel === 'bar';

            showScenes = revealOptions.showScenes;
            showSubplots = revealOptions.showSubplots;
            showActs = revealOptions.showActs;
            showStatusColors = revealOptions.showStatusColors;
            showStageColors = revealOptions.showStageColors;
            grayCompletedScenes = revealOptions.grayCompletedScenes;
            grayscaleScenes = revealOptions.grayscaleScenes;
        }

        const designSize = campaign.aprSize || settings.aprSize || 'medium';
        const exportQuality: AprExportQuality = campaign.aprExportQuality || settings.aprExportQuality || 'standard';
        const ringOnly = designSize === 'thumb' || isTeaserBar;
        const bookTitle = resolveBookTitle(campaign, books, this.plugin.getActiveBookTitle());

        const { svgString, width, height } = createAprSVG(scenesFiltered, {
            size: designSize,
            exportPreset: getExportPreset(designSize, exportQuality),
            progressPercent,
            bookTitle,
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showScenes: ringOnly ? false : showScenes,
            showSubplots,
            showActs,
            showStatusColors,
            showStageColors,
            grayCompletedScenes,
            grayscaleScenes,
            showProgressPercent: ringOnly ? false : showProgressPercent,
            showBranding: !ringOnly,
            centerMark: 'none',
            stageColors: this.plugin.settings.publishStageColors,
            actCount: this.plugin.settings.actCount || undefined,
            backgroundColor: campaign.customBackgroundColor ?? settings.aprBackgroundColor,
            transparentCenter: campaign.customTransparent ?? settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            theme: campaign.customTheme ?? settings.aprTheme ?? 'dark',
            spokeColor: settings.aprSpokeColorMode === 'custom' ? settings.aprSpokeColor
                : settings.aprSpokeColorMode === 'sync' ? (campaign.customBackgroundColor ?? settings.aprBackgroundColor)
                : undefined,
            publishStageLabel,
            showRtAttribution,
            teaserRevealEnabled: campaign.teaserReveal?.enabled ?? false,
            bookTitleFontFamily: settings.aprBookTitleFontFamily,
            bookTitleFontWeight: settings.aprBookTitleFontWeight,
            bookTitleFontItalic: settings.aprBookTitleFontItalic,
            bookTitleFontSize: settings.aprBookTitleFontSize,
            authorNameFontFamily: settings.aprAuthorNameFontFamily,
            authorNameFontWeight: settings.aprAuthorNameFontWeight,
            authorNameFontItalic: settings.aprAuthorNameFontItalic,
            authorNameFontSize: settings.aprAuthorNameFontSize,
            percentNumberFontSize1Digit: settings.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: settings.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: settings.aprPercentNumberFontSize3Digit,
            rtBadgeFontFamily: settings.aprRtBadgeFontFamily,
            rtBadgeFontWeight: settings.aprRtBadgeFontWeight,
            rtBadgeFontItalic: settings.aprRtBadgeFontItalic,
            rtBadgeFontSize: settings.aprRtBadgeFontSize,
            portableSvg: true
        });

        return {
            settings,
            campaign,
            svgString,
            width,
            height,
            meta: {
                format: this.getCampaignExportFormat(campaign),
                size: designSize,
                stage: debugStage,
                percent: progressPercent
            }
        };
    }

    private calculateDateProgress(start?: string, target?: string): number | null {
        if (!start || !target) return null;
        const parseIsoDate = (value: string): number | null => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
            const parsed = new Date(`${value}T00:00:00`);
            const time = parsed.getTime();
            return Number.isFinite(time) ? time : null;
        };
        const startMs = parseIsoDate(start);
        const targetMs = parseIsoDate(target);
        if (startMs === null || targetMs === null) return null;
        if (targetMs < startMs) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = today.getTime();

        if (targetMs === startMs) {
            return now >= targetMs ? 100 : 0;
        }
        if (now <= startMs) return 0;
        if (now >= targetMs) return 100;

        const percent = ((now - startMs) / (targetMs - startMs)) * 100;
        return Math.min(100, Math.max(0, Math.round(percent)));
    }

    private resolvePublishStageLabel(scenes: TimelineItem[]): string {
        return this.plugin.calculateCompletionEstimate(scenes)?.stage ?? 'Zero';
    }

    private pathFormat(path: string, fallback: AprExportFormat): AprExportFormat {
        const normalized = path.trim().toLowerCase();
        if (normalized.endsWith('.svg')) return 'svg';
        if (normalized.endsWith('.png')) return 'png';
        return fallback;
    }

    private writeUint32BE(target: Uint8Array, offset: number, value: number): void {
        target[offset] = (value >>> 24) & 0xff;
        target[offset + 1] = (value >>> 16) & 0xff;
        target[offset + 2] = (value >>> 8) & 0xff;
        target[offset + 3] = value & 0xff;
    }

    private readUint32BE(source: Uint8Array, offset: number): number {
        return (
            (source[offset] << 24) |
            (source[offset + 1] << 16) |
            (source[offset + 2] << 8) |
            source[offset + 3]
        ) >>> 0;
    }

    private crc32(bytes: Uint8Array): number {
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            crc ^= bytes[i];
            for (let bit = 0; bit < 8; bit++) {
                if ((crc & 1) === 1) {
                    crc = (crc >>> 1) ^ 0xedb88320;
                } else {
                    crc = crc >>> 1;
                }
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    private createPngPhysChunk(dpi: number): Uint8Array {
        const pixelsPerMeter = Math.max(1, Math.round(dpi * 39.37007874));
        const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]);
        const data = new Uint8Array(9);
        this.writeUint32BE(data, 0, pixelsPerMeter);
        this.writeUint32BE(data, 4, pixelsPerMeter);
        data[8] = 1;

        const crcInput = new Uint8Array(type.length + data.length);
        crcInput.set(type, 0);
        crcInput.set(data, type.length);
        const crc = this.crc32(crcInput);

        const chunk = new Uint8Array(4 + type.length + data.length + 4);
        this.writeUint32BE(chunk, 0, data.length);
        chunk.set(type, 4);
        chunk.set(data, 8);
        this.writeUint32BE(chunk, 8 + data.length, crc);
        return chunk;
    }

    private applyPngDensity(pngBuffer: ArrayBuffer, dpi: number): ArrayBuffer {
        const bytes = new Uint8Array(pngBuffer);
        const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        for (let i = 0; i < signature.length; i++) {
            if (bytes[i] !== signature[i]) return pngBuffer;
        }

        const parts: Uint8Array[] = [bytes.slice(0, 8)];
        const densityChunk = this.createPngPhysChunk(dpi);
        let offset = 8;
        let insertedDensity = false;

        while (offset + 12 <= bytes.length) {
            const length = this.readUint32BE(bytes, offset);
            const total = 12 + length;
            if (offset + total > bytes.length) return pngBuffer;

            const typeStart = offset + 4;
            const type = String.fromCharCode(
                bytes[typeStart],
                bytes[typeStart + 1],
                bytes[typeStart + 2],
                bytes[typeStart + 3]
            );
            const rawChunk = bytes.slice(offset, offset + total);

            if (type === 'IHDR') {
                parts.push(rawChunk);
                if (!insertedDensity) {
                    parts.push(densityChunk);
                    insertedDensity = true;
                }
            } else if (type === 'pHYs') {
                if (!insertedDensity) {
                    parts.push(densityChunk);
                    insertedDensity = true;
                }
            } else {
                parts.push(rawChunk);
            }

            offset += total;
            if (type === 'IEND') break;
        }

        if (offset < bytes.length) {
            parts.push(bytes.slice(offset));
        }

        const finalLength = parts.reduce((sum, part) => sum + part.length, 0);
        const output = new Uint8Array(finalLength);
        let cursor = 0;
        for (const part of parts) {
            output.set(part, cursor);
            cursor += part.length;
        }
        return output.buffer;
    }

    private async svgToPngBuffer(svgString: string, width: number, height: number): Promise<ArrayBuffer> {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            throw new Error('PNG export is unavailable in this environment.');
        }

        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to load SVG for PNG rendering.'));
                img.src = objectUrl;
            });

            const targetWidth = Math.max(1, Math.round(width));
            const targetHeight = Math.max(1, Math.round(height));
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not initialize canvas context.');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

            const pngBlob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((result) => resolve(result), 'image/png');
            });
            if (!pngBlob) {
                throw new Error('Canvas failed to produce PNG data.');
            }
            const rawPng = await pngBlob.arrayBuffer();
            return this.applyPngDensity(rawPng, 144);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    private async ensureFolder(filePath: string): Promise<void> {
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (folderPath) {
            const existing = this.app.vault.getAbstractFileByPath(folderPath);
            if (!existing) {
                await this.app.vault.createFolder(folderPath);
            }
        }
    }
}
