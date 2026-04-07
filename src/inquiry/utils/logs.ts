import { App, TFolder } from 'obsidian';
import {
    ensureContentLogsRoot,
    ensureLogsRoot,
    resolveContentLogsRoot,
    resolveLogsRoot
} from '../../ai/log';

export function resolveInquiryLogFolder(): string {
    return resolveLogsRoot();
}

export function resolveInquiryContentLogFolder(): string {
    return resolveContentLogsRoot();
}

export async function ensureInquiryLogFolder(app: App): Promise<TFolder | null> {
    return ensureLogsRoot(app.vault);
}

export async function ensureInquiryContentLogFolder(app: App): Promise<TFolder | null> {
    return ensureContentLogsRoot(app.vault);
}

export function resolvePulseContentLogFolder(): string {
    return resolveContentLogsRoot();
}

export async function ensurePulseContentLogFolder(app: App): Promise<TFolder | null> {
    return ensureContentLogsRoot(app.vault);
}
