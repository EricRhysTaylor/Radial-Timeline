import { App, normalizePath } from 'obsidian';
import type { InquirySession } from './sessionTypes';
import { parseSessionArtifact, serializeSessionsToArtifact } from './sessionArtifact';

/**
 * Vault-resident persistence for inquiry sessions — the single source of truth
 * for brief content. Lives under a hidden dotfolder so it ships with the vault
 * (like `.obsidian/`) but stays out of the Obsidian file explorer.
 *
 * Uses the low-level `vault.adapter` rather than the TFile API on purpose:
 * Obsidian's TFile layer does not track dot-prefixed paths.
 */
const INQUIRY_SIDECAR_DIR = '.radial-timeline/inquiry';
const INQUIRY_SIDECAR_PATH = `${INQUIRY_SIDECAR_DIR}/sessions.json`;

export async function readInquirySessionsFromVault(app: App): Promise<InquirySession[]> {
    const path = normalizePath(INQUIRY_SIDECAR_PATH);
    const adapter = app.vault.adapter;
    // SAFE: optional external input — the sidecar is absent on a fresh or
    // never-run vault, which is a meaningful empty default, not a failure.
    if (!(await adapter.exists(path))) return [];
    const raw = await adapter.read(path);
    const sessions = parseSessionArtifact(raw);
    if (sessions === null) {
        console.error(
            `[RadialTimeline] Inquiry sidecar at ${path} is corrupt or an unknown schema version; ignoring it.`
        );
        return [];
    }
    return sessions;
}

export async function writeInquirySessionsToVault(
    app: App,
    sessions: InquirySession[]
): Promise<void> {
    const adapter = app.vault.adapter;
    const dir = normalizePath(INQUIRY_SIDECAR_DIR);
    if (!(await adapter.exists(dir))) {
        await adapter.mkdir(dir);
    }
    const artifact = serializeSessionsToArtifact(sessions, Date.now());
    await adapter.write(normalizePath(INQUIRY_SIDECAR_PATH), JSON.stringify(artifact, null, 2));
}
