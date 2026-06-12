/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Multi-window document enumeration.
 *
 * Obsidian can host views in popout windows, each with its own Document.
 * Services that bind to a document (CSS variables, document-level listeners,
 * MutationObservers) must cover every open window — not just the one that
 * happened to be active at plugin load. This module is the single source of
 * truth for "every document the workspace renders into".
 */

import type { Plugin, Workspace } from 'obsidian';

/** The main window's document plus every open popout window's document. */
export function getOpenDocuments(workspace: Workspace): Document[] {
    const docs = new Set<Document>([workspace.rootSplit.doc]);
    workspace.iterateAllLeaves((leaf) => docs.add(leaf.view.containerEl.ownerDocument));
    return [...docs];
}

/**
 * Run `bind` once per open document — now, and again for each popout window
 * opened later. For one-shot per-document setup (listeners, observers); the
 * window-open subscription is cleaned up by the plugin lifecycle.
 */
export function bindToAllDocuments(plugin: Plugin, bind: (doc: Document) => void): void {
    getOpenDocuments(plugin.app.workspace).forEach(bind);
    plugin.registerEvent(plugin.app.workspace.on('window-open', (win) => bind(win.doc)));
}
