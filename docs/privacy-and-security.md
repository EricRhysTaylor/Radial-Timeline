# Privacy and Security

Radial Timeline is a **desktop-only** Obsidian plugin. It is not intended for Obsidian Mobile.

## Core posture

- No telemetry or analytics SDKs are shipped with the plugin.
- Vault data stays local unless you explicitly use a feature that requires an external request.
- API keys are stored with Obsidian `secretStorage` when available, with compatibility fallback only where Obsidian does not expose it.

## AI features

- AI is optional.
- The **AI Off** toggle is the primary kill switch for AI-assisted features.
- When AI is off, normal plugin use should not dispatch manuscript content to AI providers.
- Remote model metadata, provider snapshot, and pricing refresh behavior is additionally governed by privacy/network settings in the AI panel.

## Desktop integration (Pandoc export)

The publishing pipeline shells out to programs already installed on the
user's machine. The exact contract:

- Shell execution happens only to invoke Pandoc (and its LaTeX engine) when
  the user runs a manuscript export, and to probe for those binaries with
  `which`/`where` during setup. Nothing is downloaded or executed otherwise.
- Subprocesses receive a minimal allowlisted environment (PATH, home, temp,
  locale, and TeX cache variables) built by `buildMinimalSubprocessEnv` in
  `src/utils/exportFormats.ts` — never the full `process.env`, so credentials
  present in the host session cannot leak to child processes.
- The only environment variable the plugin reads directly is `PATH`. Install
  locations on Windows are derived from `os.homedir()`, not from identity
  variables like `USERPROFILE` or `LOCALAPPDATA`.
- Files outside the vault are read or written only to save exports where the
  user chooses and to locate the Pandoc executable.

## External services and network access

Today, external requests may occur only in clearly scoped areas:

- Optional AI provider requests to supported providers.
- Optional model-registry / provider-snapshot / pricing refreshes for AI metadata.
- Optional version/update checks.

These paths are intended to be explicit, bounded, and documented.

## Social Connections

Social Connections is planned for the future website launch. It is not the current default behavior.

Before launch, the plugin should document:

- What data is sent.
- When it is sent.
- Whether the feature is opt-in.
- How to disable it completely.

The target posture is that Social Connections remains an explicit user choice, not a silent background integration.
