#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

function runCommand(command, description, silent = false, allowFail = false) {
    if (!silent) console.log(`\n🔄 ${description}...`);
    try {
        const output = execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
        if (!silent) console.log(`✅ ${description} completed`);
        return output;
    } catch (error) {
        if (!allowFail) {
            console.error(`❌ Failed: ${description}`);
            console.error(error.message);
            process.exit(1);
        }
        if (!silent) console.warn(`⚠️  ${description} failed but continuing: ${error.message}`);
        return null;
    }
}

function updateManifestAndVersions(targetVersion) {
    // Keep manifest.json and versions.json in sync with package.json
    const manifestPath = 'src/manifest.json';
    const versionsPath = 'versions.json';
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const { minAppVersion } = manifest;
        manifest.version = targetVersion;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t'));

        const versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
        versions[targetVersion] = minAppVersion;
        writeFileSync(versionsPath, JSON.stringify(versions, null, '\t'));
        console.log(`✅ Synced manifest.json and versions.json to ${targetVersion}`);
    } catch (err) {
        console.error('❌ Failed to update manifest/versions:', err.message);
        process.exit(1);
    }
}

const EMBEDDED_RELEASE_NOTES_PATH = 'src/data/releaseNotesBundle.json';

function parseSemver(version) {
    if (!version) return null;
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;
    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10)
    };
}

function compareSemverDesc(a, b) {
    const parsedA = parseSemver(a);
    const parsedB = parseSemver(b);
    if (!parsedA && !parsedB) return 0;
    if (!parsedA) return 1;
    if (!parsedB) return -1;
    if (parsedA.major !== parsedB.major) return parsedB.major - parsedA.major;
    if (parsedA.minor !== parsedB.minor) return parsedB.minor - parsedA.minor;
    return parsedB.patch - parsedA.patch;
}

function fetchReleaseInfo(tag) {
    if (!tag) return null;
    try {
        const json = execSync(`gh release view ${tag} --json name,body,publishedAt,htmlUrl,url`, { encoding: 'utf8' });
        const data = JSON.parse(json);
        if (!data) return null;
        return {
            version: tag,
            title: data.name || `Radial Timeline ${tag}`,
            body: data.body || '',
            url: data.htmlUrl || data.url || `https://github.com/EricRhysTaylor/Radial-Timeline/releases/tag/${tag}`,
            publishedAt: data.publishedAt || new Date().toISOString()
        };
    } catch (error) {
        console.warn(`⚠️  Unable to fetch release ${tag}: ${error.message}`);
        return null;
    }
}

function fetchMajorPatchReleases(major, skipVersion) {
    try {
        const json = execSync(`gh api repos/EricRhysTaylor/Radial-Timeline/releases?per_page=100`, { encoding: 'utf8' });
        const releases = JSON.parse(json);
        if (!Array.isArray(releases)) return [];

        const patches = [];
        const seen = new Set();

        for (const rel of releases) {
            const rawTag = (rel.tag_name || rel.name || '').toString().trim();
            if (!rawTag) continue;
            const version = rawTag.replace(/^v/i, '');
            if (!version || version === skipVersion) continue;
            if (seen.has(version)) continue;
            const semver = parseSemver(version);
            if (!semver) continue;
            if (semver.major !== major) continue;
            if (semver.minor === 0 && semver.patch === 0) continue;
            seen.add(version);
            patches.push({
                version,
                title: rel.name || `Radial Timeline ${version}`,
                body: rel.body || '',
                url: rel.html_url || rel.url || `https://github.com/EricRhysTaylor/Radial-Timeline/releases/tag/${version}`,
                publishedAt: rel.published_at || rel.publishedAt || new Date().toISOString()
            });
        }

        patches.sort((a, b) => compareSemverDesc(a.version, b.version));
        return patches;
    } catch (error) {
        console.warn(`⚠️  Unable to fetch patch releases: ${error.message}`);
        return [];
    }
}

function readExistingReleaseBundle() {
    try {
        const raw = readFileSync(EMBEDDED_RELEASE_NOTES_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function updateBundleWithLocalEntry(version, body) {
    console.log(`\n🔄 Updating release notes bundle locally for ${version}...`);

    // Create new entry object
    // Note: We don't have the published URL or date yet, so we use placeholders/defaults
    // The sync-release-notes script can correct these later if needed, but for the build
    // we mostly care about the body content.
    const newEntry = {
        version: version,
        title: version,
        body: body,
        url: `https://github.com/EricRhysTaylor/Radial-Timeline/releases/tag/${version}`,
        publishedAt: new Date().toISOString()
    };

    let bundle = readExistingReleaseBundle();
    if (!bundle) {
        // Initialize new bundle if one doesn't exist
        bundle = { entries: [] };
    }

    // Ensure entries array exists (migrating from old format if needed)
    if (!bundle.entries) {
        bundle.entries = [];
        if (bundle.latest) bundle.entries.push(bundle.latest);
        if (bundle.patches) bundle.entries.push(...bundle.patches);
        if (bundle.major) bundle.entries.push(bundle.major);
    }

    // Remove any existing entry for this version (idempotency)
    bundle.entries = bundle.entries.filter(e => e.version !== version);

    // Add new entry at the top
    bundle.entries.unshift(newEntry);

    // Sort entries just in case (descending order)
    bundle.entries.sort((a, b) => compareSemverDesc(a.version, b.version));

    // Update legacy fields for backward compatibility or ease of read
    bundle.latest = bundle.entries[0];

    // Re-determine major version
    const semver = parseSemver(version);
    if (semver) {
        const majorVersionStr = `${semver.major}.0.0`;
        // Try to find the actual major release entry
        let majorEntry = bundle.entries.find(e => e.version === majorVersionStr);

        // If not found, fall back logic (mirrors sync-release-notes.mjs partly)
        if (!majorEntry) {
            // If we are currently releasing the X.0.0, use it
            if (version === majorVersionStr) {
                majorEntry = newEntry;
            } else {
                // Fallback to oldest or keep existing logic
                majorEntry = bundle.entries[bundle.entries.length - 1];
            }
        }
        bundle.major = majorEntry;
        bundle.majorVersion = majorEntry ? majorEntry.version : majorVersionStr;

        // Re-populate patches (all entries in this major version excluding the major x.0.0 itself)
        bundle.patches = bundle.entries.filter(e => {
            const s = parseSemver(e.version);
            return s && s.major === semver.major && e.version !== bundle.majorVersion;
        });
    }

    try {
        writeFileSync(EMBEDDED_RELEASE_NOTES_PATH, JSON.stringify(bundle, null, 2));
        console.log(`✅ Release notes bundle updated with ${version}`);
    } catch (err) {
        console.error(`⚠️  Failed to update release notes bundle: ${err.message}`);
    }
}

function getLastReleaseTag() {
    try {
        // First try to get the latest GitHub release (what's actually published)
        const ghOutput = execSync('gh release list --limit 1 --json tagName', { encoding: 'utf8' });
        const releases = JSON.parse(ghOutput);
        if (releases && releases.length > 0) {
            return releases[0].tagName;
        }
    } catch (error) {
        console.log('⚠️  Could not get GitHub releases, falling back to Git tags');
    }

    try {
        // Fallback to Git tags
        const output = execSync('git tag --sort=-version:refname | head -1', { encoding: 'utf8' });
        const tag = output.trim();
        return tag || null;
    } catch {
        return null;
    }
}

function tagExists(tag) {
    try {
        const out = execSync(`git tag -l "${tag}"`, { encoding: 'utf8' });
        return out.trim() === tag;
    } catch {
        return false;
    }
}

// Categorization rules
const CATEGORIES = [
    {
        title: "✨ New Features",
        keywords: [/feat/i, /add/i, /new/i, /implement/i, /create/i]
    },
    {
        title: "🐛 Bug Fixes",
        keywords: [/fix/i, /resolve/i, /bug/i, /patch/i, /correct/i, /repair/i]
    },
    {
        title: "⚡ Improvements",
        keywords: [/improve/i, /refactor/i, /perf/i, /optimiz/i, /tweak/i, /update/i, /styl/i, /polish/i, /better/i, /enlarge/i, /adjust/i, /refine/i]
    },
    {
        title: "📚 Documentation",
        keywords: [/doc/i, /readme/i, /wiki/i, /comment/i]
    },
    {
        title: "🔧 Maintenance",
        keywords: [/chore/i, /maint/i, /build/i, /ci/i, /bump/i, /upgrade/i, /script/i]
    }
];

function generateChangelog(fromTag, toRef = 'HEAD') {
    try {
        const range = fromTag ? `${fromTag}..${toRef}` : toRef;
        // Format: shortHash|fullHash|subject
        const logs = execSync(`git log ${range} --pretty=format:"%h|%H|%s" --no-merges`, { encoding: 'utf8' });

        if (!logs.trim()) {
            return "No changes since last release.";
        }

        const lines = logs.trim().split('\n');
        const categorized = {};
        const uncategorized = [];

        // Initialize categories
        CATEGORIES.forEach(cat => categorized[cat.title] = []);

        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length < 3) return;

            const shortHash = parts[0];
            const fullHash = parts[1];
            let rawMessage = parts.slice(2).join('|').trim();

            // Handle user's specific backup format: "[backup] timestamp — files — description — stats"
            // Example: [backup] ... — src(6) — Fixed bugs in triplet analysis. ... — 6 files ...
            let cleanMessages = [];

            if (rawMessage.startsWith('[backup]')) {
                // The backup format uses em-dashes (—) as separators.
                // However, git log output might sometimes look different depending on terminal,
                // but based on user info it is reliably em-dash " — ".

                // We split by standard " — " to get the main chunks.
                const segments = rawMessage.split(' — ');

                if (segments.length >= 3) {
                    // 0: [backup] timestamp
                    // 1: files summary e.g. "src(5)"
                    // 2..N-2: DESCRIPTION parts (might contain em-dashes?)
                    // N-1: files count e.g. "5 files" (sometimes missing or different)
                    // N: stats e.g. "+5/-12"

                    // The description is everything between index 2 and the stats part.
                    // Usually the last two segments are "X files" and "+X/-Y".
                    // Let's assume description starts at index 2.
                    // We need to identify where description ends.
                    // The "X files" segment usually matches /^\d+ files$/.
                    // The stats segment matches /^[+\-]\d+\/[+\-]\d+/.

                    let descParts = [];
                    // Start from index 2
                    for (let i = 2; i < segments.length; i++) {
                        const seg = segments[i].trim();
                        // Stop if we hit the stats trailer
                        if (/^\d+\s+files$/.test(seg) || /^[+\-]\d+\/[+\-]\d+/.test(seg)) {
                            // This looks like metadata, stop collecting description
                            break;
                        }
                        descParts.push(seg);
                    }

                    // Join back with em-dash if it was split (unlikely for description text but possible)
                    const fullDesc = descParts.join(' — ');

                    if (fullDesc && !fullDesc.includes('automatic backup after build')) {
                        // usage of ". " as splitter
                        cleanMessages = fullDesc.split('. ').map(s => s.trim()).filter(s => s.length > 2);
                    }
                } else {
                    // Fallback: try splitting by hyphen if em-dash wasn't found (maybe encoding issue?)
                    // But be careful not to split inside description
                    const hyphenSegments = rawMessage.split(' - ');
                    if (hyphenSegments.length >= 4 && rawMessage.includes('[backup]')) {
                        // Very rough fallback
                        const desc = hyphenSegments.slice(2, hyphenSegments.length - 2).join(' - ');
                        if (desc && !desc.includes('automatic backup after build')) {
                            cleanMessages = desc.split('. ').map(s => s.trim()).filter(s => s.length > 2);
                        }
                    } else if (!rawMessage.includes('automatic backup after build')) {
                        cleanMessages = [rawMessage];
                    }
                }
            } else {
                cleanMessages = [rawMessage];
            }

            cleanMessages.forEach(msg => {
                if (msg.endsWith('.')) msg = msg.slice(0, -1);

                // Enhance message with links
                let message = msg.replace(/#(\d+)/g, '[#$1](https://github.com/EricRhysTaylor/Radial-Timeline/issues/$1)');
                const hashLink = `([${shortHash}](https://github.com/EricRhysTaylor/Radial-Timeline/commit/${fullHash}))`;

                let assigned = false;
                for (const cat of CATEGORIES) {
                    if (cat.keywords.some(regex => regex.test(message))) {
                        categorized[cat.title].push(`- ${message} ${hashLink}`);
                        assigned = true;
                        break;
                    }
                }

                if (!assigned) {
                    // Filter out noise like "2 files"
                    if (!/^\d+\s+files$/.test(message) && !message.toLowerCase().includes('[backup]') && !/^[+\-]\d+/.test(message)) {
                        uncategorized.push(`- ${message} ${hashLink}`);
                    }
                }
            });
        });

        let changelog = "";

        CATEGORIES.forEach(cat => {
            if (categorized[cat.title].length > 0) {
                changelog += `### ${cat.title}\n${categorized[cat.title].join('\n')}\n\n`;
            }
        });

        if (uncategorized.length > 0) {
            changelog += `### 🛠 Other Changes\n${uncategorized.join('\n')}\n\n`;
        }

        return changelog.trim() || "No significant changes since last release.";
    } catch (error) {
        console.error(error);
        return "Could not generate changelog.";
    }
}

// Build @font-face rules from src/assets/embeddedFonts.ts and inject into release/styles.css
function buildEmbeddedFontsCss() {
    const srcPath = 'src/assets/embeddedFonts.ts';
    let css = '';
    try {
        const ts = readFileSync(srcPath, 'utf8');
        const objMatch = ts.match(/EMBEDDED_FONTS\s*=\s*\{([\s\S]*?)\}\s*;/);
        if (!objMatch) return '';
        const body = objMatch[1];
        const familyRe = /(\w+)\s*:\s*\{([\s\S]*?)\}/g;
        let fm;
        while ((fm = familyRe.exec(body)) !== null) {
            const family = fm[1];
            const block = fm[2];
            const readVal = (key) => {
                const m = block.match(new RegExp(key + ":\\s*'([\\s\\S]*?)'"));
                return m && m[1] && m[1].trim().length > 0 ? m[1].trim() : null;
            };
            const normal = readVal('normal');
            const bold = readVal('bold');
            const italic = readVal('italic');
            const boldItalic = readVal('boldItalic');
            const addFace = (style, weight, b64) => {
                if (!b64) return;
                css += `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}` + "\n";
            };
            addFace('normal', 400, normal);
            addFace('normal', 700, bold);
            addFace('italic', 400, italic);
            addFace('italic', 700, boldItalic);
        }
    } catch {
        return '';
    }
    return css.trim();
}

function injectEmbeddedFontsIntoReleaseCss() {
    const releaseCssPath = 'release/styles.css';
    const markerStart = '/* __EMBEDDED_FONTS_START__ */';
    const markerEnd = '/* __EMBEDDED_FONTS_END__ */';
    let css;
    try {
        css = readFileSync(releaseCssPath, 'utf8');
    } catch (e) {
        console.warn('⚠️  Could not read release/styles.css to inject fonts:', e.message);
        return;
    }
    // Remove previous injected block if present
    const startIdx = css.indexOf(markerStart);
    const endIdx = css.indexOf(markerEnd);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        css = css.slice(0, startIdx) + css.slice(endIdx + markerEnd.length);
    }
    const faces = buildEmbeddedFontsCss();
    if (!faces) {
        writeFileSync(releaseCssPath, css);
        return;
    }
    const block = `\n${markerStart}\n${faces}\n${markerEnd}\n`;
    writeFileSync(releaseCssPath, css + block);
    console.log('✅ Injected embedded @font-face rules into release/styles.css');
}

import { spawn } from 'child_process';
import { unlinkSync } from 'fs';

function editReleaseNotesLocally(initialContent) {
    return new Promise((resolve, reject) => {
        const tempFile = 'RELEASE_NOTES_EDIT.md';
        try {
            writeFileSync(tempFile, initialContent, 'utf8');
        } catch (e) {
            return reject(new Error(`Could not write temp file: ${e.message}`));
        }

        // Try to find a suitable editor
        // 1. VISUAL or EDITOR env var
        // 2. 'code -w' (VS Code, wait mode)
        // 3. 'nano'
        // 4. 'vi'
        let editor = process.env.VISUAL || process.env.EDITOR;
        let args = [];

        if (!editor) {
            // Default preference logic
            try {
                // Check if 'code' is available
                execSync('which code', { stdio: 'ignore' });
                editor = 'code';
                args = ['-w']; // Wait is crucial for VS Code
            } catch {
                try {
                    execSync('which nano', { stdio: 'ignore' });
                    editor = 'nano';
                } catch {
                    editor = 'vi';
                }
            }
        } else {
            // Split editor command if it has args (e.g. "code -w")
            const parts = editor.split(' ');
            editor = parts[0];
            args = parts.slice(1);
        }

        console.log(`Opening ${tempFile} with ${editor}...`);

        const child = spawn(editor, [...args, tempFile], {
            stdio: 'inherit'
        });

        child.on('error', (err) => {
            reject(new Error(`Failed to start editor ${editor}: ${err.message}`));
        });

        child.on('exit', (code) => {
            if (code === 0) {
                try {
                    const content = readFileSync(tempFile, 'utf8');
                    unlinkSync(tempFile);
                    resolve(content.trim());
                } catch (e) {
                    reject(new Error(`Failed to read back edited notes: ${e.message}`));
                }
            } else {
                reject(new Error(`Editor exited with code ${code}`));
            }
        });
    });
}

async function main() {
    console.log("🚀 Obsidian Plugin Release Process\n");

    // Enforce releasing from master only
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        if (branch !== 'master') {
            console.error(`❌ Releases must be cut from 'master'. Current branch: '${branch}'.`);
            console.error(`👉 Run:  git switch master && git pull  then re-run: npm run release`);
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Could not determine current git branch. Ensure you are on master.');
        process.exit(1);
    }

    // Ensure working tree on master is clean before we attempt a merge or build
    try {
        const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
        if (dirty) {
            console.error('❌ Your working tree on master has uncommitted changes.');
            console.error('👉 Commit or stash them, then run npm run release again.');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Could not verify working tree state.');
        process.exit(1);
    }

    // Local master is the source of truth - no need to sync with remote
    console.log("✅ Using local master as source of truth for release.");

    // Read current version
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const currentVersion = packageJson.version;

    console.log(`📦 Current version: ${currentVersion}`);

    // Get last release tag
    const lastTag = getLastReleaseTag();
    console.log(`🏷️  Last release tag: ${lastTag || 'None found'}`);

    // Get new version from user
    const newVersion = await question(`✨ Enter new version number: `);

    if (!newVersion) {
        console.log("❌ Invalid version. Exiting.");
        rl.close();
        return;
    }

    // Handle same version case
    if (newVersion === currentVersion) {
        console.log(`ℹ️  Re-releasing version ${currentVersion}`);
    }

    // Validate version format (basic semver check)
    if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
        console.log("❌ Version must be in format X.Y.Z (e.g., 2.1.1)");
        rl.close();
        return;
    }

    // Generate changelog
    console.log(`\n📝 Generating changelog since ${lastTag || 'beginning'}...`);
    const autoChangelog = generateChangelog(lastTag);

    console.log(`\n📋 Changes since last release:`);
    console.log(`${autoChangelog}`);

    // Ask if user wants to edit release notes
    const editOption = await question(`\n✏️  Release notes:
1. Publish now (Auto-generated)
2. Edit locally then Publish (Recommended)
3. Create draft on GitHub (Notes will be unedited in plugin)
Choose (1/2/3): `);

    let releaseNotes = `## What's Changed\n\n${autoChangelog}`;
    let createDraft = false;

    if (editOption === '2') {
        console.log(`\n📝 Opening system editor to edit release notes...`);
        try {
            releaseNotes = await editReleaseNotesLocally(releaseNotes);
            console.log(`✅ Release notes updated from editor.`);
            // Show preview of first few lines
            const preview = releaseNotes.split('\n').slice(0, 5).join('\n');
            console.log(`\n--- Preview ---\n${preview}\n...`);
        } catch (err) {
            console.error(`❌ Failed to edit locally: ${err.message}`);
            return;
        }
    } else if (editOption === '3') {
        createDraft = true;
        console.log(`⚠️  Warning: Edits made on GitHub will NOT be reflected in the plugin build.`);
    }

    /* Verification Summary */
    console.log(`\n📋 Release Summary:`);
    console.log(`   Current: ${currentVersion}`);
    console.log(`   New:     ${newVersion}`);
    if (editOption === '2') console.log(`   Notes:   Edited locally`);
    else if (editOption === '3') console.log(`   Notes:   Draft (Unedited in build)`);
    else console.log(`   Notes:   Auto-generated`);

    const confirm = await question(`\n❓ Proceed with release? (y/N): `);

    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        console.log("❌ Release cancelled.");
        rl.close();
        return;
    }

    rl.close();

    try {
        // Version bump and file sync
        if (newVersion !== currentVersion) {
            // Use npm to bump version and trigger package.json "version" script
            runCommand(`npm version ${newVersion} --no-git-tag-version`, "Bumping version and updating manifest/versions");
        } else {
            console.log(`ℹ️  Version unchanged, syncing manifest/versions only`);
            updateManifestAndVersions(newVersion);
        }

        // Update local release notes bundle automatically
        updateBundleWithLocalEntry(newVersion, releaseNotes);

        // Run build process
        runCommand("npm run build", "Building plugin");
        injectEmbeddedFontsIntoReleaseCss();

        // Check if there are changes to commit
        try {
            execSync('git diff --exit-code', { stdio: 'pipe' });
            console.log("ℹ️  No changes to commit");
        } catch {
            runCommand(`git add .`, "Staging changes");
            runCommand(`git commit -m "Release version ${newVersion}"`, "Committing changes");
        }

        // Tag creation
        if (tagExists(newVersion)) {
            console.log(`ℹ️  Tag ${newVersion} already exists, skipping tag creation`);
        } else {
            const tagRes = runCommand(`git tag ${newVersion}`, "Creating git tag", false, true);
            if (!tagRes) console.log(`ℹ️  Skipped creating tag ${newVersion}`);
        }

        runCommand("git push origin master", "Pushing changes");

        const pushTagRes = runCommand(`git push origin ${newVersion}`, "Pushing tag", false, true);
        if (!pushTagRes) console.log(`ℹ️  Tag ${newVersion} already pushed or skipped`);

        // Create GitHub release with release assets
        // Escape quotes in release notes for command line
        const escapedNotes = releaseNotes.replace(/"/g, '\\"').replace(/\n/g, '\\n');

        let releaseCommand;
        if (createDraft) {
            releaseCommand = `gh release create ${newVersion} ` +
                `release/main.js release/manifest.json release/styles.css ` +
                `--title "${newVersion}" ` +
                `--notes "${escapedNotes}" ` +
                `--draft`;
        } else {
            releaseCommand = `gh release create ${newVersion} ` +
                `release/main.js release/manifest.json release/styles.css ` +
                `--title "${newVersion}" ` +
                `--notes "${escapedNotes}" ` +
                `--latest`;
        }
        const createRes = runCommand(releaseCommand, createDraft ? "Creating draft GitHub release" : "Creating GitHub release", false, true);
        if (!createRes) {
            console.log(`ℹ️  Release ${newVersion} may already exist, updating instead`);
            const updateCommand = `gh release edit ${newVersion} ` +
                `--title "${newVersion}" ` +
                `--notes "${escapedNotes}" ` +
                (createDraft ? `--draft` : `--latest`);
            runCommand(updateCommand, "Updating GitHub release");
            runCommand(`gh release upload ${newVersion} release/main.js release/manifest.json release/styles.css --clobber`, "Updating release assets", false, true);
        }

        if (createDraft) {
            console.log(`\n🎉 Draft release ${newVersion} created successfully!`);
            console.log(`📝 Draft release: https://github.com/EricRhysTaylor/radial-timeline/releases/tag/${newVersion}`);
            console.log(`\n🌐 Opening draft release in browser for editing...`);
            console.log(`💡 Remember to publish the release when you're done editing!`);
            console.log(`💡 After publishing, run: npm run sync-release-notes (optional, for next dev cycle)`);

            try {
                // Open in browser via GitHub CLI (edit doesn't support --web; view does)
                runCommand(`gh release view ${newVersion} --web`, "Opening release in browser", true);
            } catch (error) {
                // Fallback: try OS open command on macOS
                try {
                    const url = `https://github.com/EricRhysTaylor/radial-timeline/releases/tag/${newVersion}`;
                    runCommand(`open ${url}`, "Opening release in browser", true);
                } catch (e2) {
                    console.log(`⚠️  Could not open browser automatically. You can edit the draft release at:`);
                    console.log(`   https://github.com/EricRhysTaylor/radial-timeline/releases/tag/${newVersion}`);
                }
            }
        } else {
            console.log(`\n🎉 Release ${newVersion} published successfully!`);
            console.log(`📦 GitHub release: https://github.com/EricRhysTaylor/radial-timeline/releases/tag/${newVersion}`);
            console.log(`\n✅ Release notes embedded in plugin match this release automatically.`);
        }

    } catch (error) {
        console.error(`❌ Release failed:`, error.message);
        process.exit(1);
    }
}

main();
