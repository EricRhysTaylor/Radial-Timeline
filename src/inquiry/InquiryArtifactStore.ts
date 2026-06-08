import { App, DataAdapter, normalizePath } from 'obsidian';
import type { InquirySession } from './sessionTypes';
import { parseSessionArtifact, serializeSessionsToArtifact } from './sessionArtifact';

/**
 * Vault-resident persistence for inquiry sessions — the single source of truth
 * for brief content. Lives under a hidden dotfolder so it ships with the vault
 * (like `.obsidian/`) but stays out of the Obsidian file explorer.
 *
 * Dotfolders are invisible to the TFile vault index (getAbstractFileByPath
 * returns null for dot-prefixed paths), so file IO must use the low-level data
 * adapter — the same established pattern as ai/credentials/secretStorage.ts and
 * ai/cost/outputProfile.ts. `vaultIo()` below is the single sanctioned access
 * point so both helpers share one chokepoint.
 */
export const INQUIRY_SIDECAR_DIR = '.radial-timeline/inquiry';
export const INQUIRY_SIDECAR_PATH = `${INQUIRY_SIDECAR_DIR}/sessions.json`;

function vaultIo(app: App): DataAdapter {
    return app.vault.adapter; // SAFE: dotfolder has no TFile API; data adapter is required
}

export async function readInquirySessionsFromVault(app: App): Promise<InquirySession[]> {
    const io = vaultIo(app);
    const path = normalizePath(INQUIRY_SIDECAR_PATH);
    // SAFE: optional external input — the sidecar is absent on a fresh or
    // never-run vault, which is a meaningful empty default, not a failure.
    if (!(await io.exists(path))) return [];
    const raw = await io.read(path);
    const sessions = parseSessionArtifact(raw);
    if (sessions === null) {
        console.error(
            `[RadialTimeline] Inquiry sidecar at ${path} is corrupt or an unknown schema version; ignoring it.`
        );
        return [];
    }
    return sessions;
}

export async function hasInquirySessionSidecarInVault(app: App): Promise<boolean> {
    const io = vaultIo(app);
    return io.exists(normalizePath(INQUIRY_SIDECAR_PATH));
}

export async function writeInquirySessionsToVault(
    app: App,
    sessions: InquirySession[]
): Promise<void> {
    const io = vaultIo(app);
    const dir = normalizePath(INQUIRY_SIDECAR_DIR);
    if (!(await io.exists(dir))) {
        await io.mkdir(dir);
    }
    const artifact = serializeSessionsToArtifact(sessions, Date.now());
    await io.write(normalizePath(INQUIRY_SIDECAR_PATH), JSON.stringify(artifact, null, 2));
}
