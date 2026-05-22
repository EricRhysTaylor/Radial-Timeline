/*
 * Radial Timeline Plugin for Obsidian — Bug Report Helpers
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, Platform } from 'obsidian';

export const BUG_REPORT_REPO = 'EricRhysTaylor/Radial-Timeline';

export type BugReportSource = 'rt' | 'inquiry';

export interface BugReportEnv {
    pluginVersion: string;
    obsidianVersion: string;
    platform: string;
    source: BugReportSource;
}

export interface BugReportPayload {
    description: string;
    errorText: string;
    env: BugReportEnv;
    hasScreenshot: boolean;
}

export function gatherEnv(app: App, pluginVersion: string, source: BugReportSource): BugReportEnv {
    const appWithVersion = app as App & { appVersion?: string };
    const obsidianVersion = appWithVersion.appVersion ?? 'unknown';
    const platformName = Platform.isMobile
        ? (Platform.isIosApp ? 'iOS' : Platform.isAndroidApp ? 'Android' : 'Mobile')
        : (Platform.isMacOS ? 'macOS' : Platform.isWin ? 'Windows' : Platform.isLinux ? 'Linux' : 'Desktop');
    return {
        pluginVersion,
        obsidianVersion,
        platform: platformName,
        source,
    };
}

/**
 * Capture a single frame of the Obsidian window using the browser screen-capture API.
 * Returns a PNG Blob. Resolves to null if the user cancels the picker or capture is unavailable.
 */
export async function captureScreenshot(): Promise<Blob | null> {
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
    };
    if (typeof mediaDevices?.getDisplayMedia !== 'function') {
        return null;
    }
    let stream: MediaStream | null = null;
    try {
        stream = await mediaDevices.getDisplayMedia({
            video: { displaySurface: 'window' } as MediaTrackConstraints,
            audio: false,
        });
    } catch {
        return null;
    }
    try {
        const track = stream.getVideoTracks()[0];
        if (!track) return null;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        // Give the first frame a tick to render.
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, width, height);
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        return blob;
    } finally {
        stream?.getTracks().forEach((t) => t.stop());
    }
}

/**
 * Write a PNG blob to the system clipboard so the user can paste it into GitHub's issue form.
 * Returns true on success.
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
    const clipboard = navigator.clipboard as Clipboard & {
        write?: (data: ClipboardItem[]) => Promise<void>;
    };
    if (typeof clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined') {
        return false;
    }
    try {
        await clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return true;
    } catch {
        return false;
    }
}

function formatIssueBody(payload: BugReportPayload): string {
    const lines: string[] = [];
    lines.push('### Description');
    lines.push(payload.description.trim() || '_(none provided)_');
    lines.push('');
    if (payload.errorText.trim()) {
        lines.push('### Error / Log');
        lines.push('```');
        lines.push(payload.errorText.trim());
        lines.push('```');
        lines.push('');
    }
    lines.push('### Screenshot');
    if (payload.hasScreenshot) {
        lines.push('_Screenshot is on your clipboard — paste it here with ⌘V / Ctrl+V._');
    } else {
        lines.push('_(none)_');
    }
    lines.push('');
    lines.push('### Environment');
    lines.push(`- Plugin version: ${payload.env.pluginVersion}`);
    lines.push(`- Obsidian version: ${payload.env.obsidianVersion}`);
    lines.push(`- Platform: ${payload.env.platform}`);
    lines.push(`- Reported from: ${payload.env.source === 'rt' ? 'Radial Timeline view' : 'Inquiry view'}`);
    return lines.join('\n');
}

export function buildIssueUrl(payload: BugReportPayload): string {
    const title = payload.description.trim().split('\n')[0].slice(0, 80) || 'Bug report';
    const params = new URLSearchParams({
        title: `[Bug]: ${title}`,
        body: formatIssueBody(payload),
        labels: 'bug',
    });
    return `https://github.com/${BUG_REPORT_REPO}/issues/new?${params.toString()}`;
}
