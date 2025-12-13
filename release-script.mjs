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

function updateEmbeddedReleaseNotesFromGitHub(version) {
    console.log(`\n🔄 Fetching published release notes from GitHub for ${version}...`);

    const semver = parseSemver(version);
    if (!semver) {
        console.error(`❌ Invalid version format: ${version}`);
        return;
    }

    // Fetch the latest published release (should be the one we just created)
    const latest = fetchReleaseInfo(version);
    if (!latest) {
        console.error(`⚠️  Could not fetch release ${version} from GitHub. Release notes bundle not updated.`);
        return;
    }

    // Fetch the major release (e.g., 3.0.0)
    const majorTag = `${semver.major}.0.0`;
    let major = fetchReleaseInfo(majorTag);

    // If major release doesn't exist, use the existing one from bundle or fall back to latest
    if (!major) {
        const existing = readExistingReleaseBundle();
        if (existing && existing.major) {
            major = existing.major;
        } else {
            major = latest;
        }
    }

    // Fetch all patch releases in this major version (excluding the major release itself)
    const patches = fetchMajorPatchReleases(semver.major, majorTag);

    const bundle = {
        major,
        latest,
        patches: patches.length > 0 ? patches : undefined
    };

    try {
        writeFileSync(EMBEDDED_RELEASE_NOTES_PATH, JSON.stringify(bundle, null, 2));
        console.log(`✅ Embedded release notes updated from published GitHub release ${version}`);
    } catch (err) {
        console.error(`⚠️  Failed to update embedded release notes: ${err.message}`);
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
        keywords: [/^feat/i, /^add/i, /^new/i, /^implement/i, /^create/i]
    },
    {
        title: "🐛 Bug Fixes",
        keywords: [/^fix/i, /^resolve/i, /^bug/i, /^patch/i, /^correct/i, /^repair/i]
    },
    {
        title: "⚡ Improvements",
        keywords: [/^improve/i, /^refactor/i, /^perf/i, /^optimiz/i, /^tweak/i, /^update/i, /^styl/i, /^polish/i, /^better/i, /^enlarge/i, /^adjust/i]
    },
    {
        title: "📚 Documentation",
        keywords: [/^doc/i, /^readme/i, /^wiki/i, /^comment/i]
    },
    {
        title: "🔧 Maintenance",
        keywords: [/^chore/i, /^maint/i, /^build/i, /^ci/i, /^bump/i, /^upgrade/i, /^script/i]
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
                // Try to extract the description part between the em dashes
                const segments = rawMessage.split(/\s+[—–-]\s+/);
                if (segments.length >= 3) {
                    // usually the 3rd segment is the description
                    const desc = segments[2];
                    if (desc && !desc.includes('automatic backup after build')) {
                        // The description might be multiple sentences. Split them!
                        cleanMessages = desc.split('. ').map(s => s.trim()).filter(s => s.length > 2);
                    }
                } else {
                    if (!rawMessage.includes('automatic backup after build')) {
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
                    if (!/^\d+ files$/.test(message) && !message.toLowerCase().includes('[backup]')) {
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
1. Publish now with auto-generated changelog
2. Create draft release for editing in browser
Choose (1/2): `);

    let releaseNotes = `## What's Changed\n\n${autoChangelog}`;
    let createDraft = false;

    if (editOption === '2') {
        createDraft = true;
        console.log(`📝 Will create draft release for editing in browser`);

        console.log(`\n📋 Draft Release Summary:`);
        console.log(`   Current: ${currentVersion}`);
        console.log(`   New:     ${newVersion}`);
        console.log(`   Changes: ${lastTag ? `Since ${lastTag}` : 'Initial release'}`);

        const confirm = await question(`\n❓ Create draft release? (y/N): `);

        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log("❌ Draft creation cancelled.");
            rl.close();
            return;
        }
    } else {
        console.log(`\n📋 Release Summary:`);
        console.log(`   Current: ${currentVersion}`);
        console.log(`   New:     ${newVersion}`);
        console.log(`   Changes: ${lastTag ? `Since ${lastTag}` : 'Initial release'}`);

        const confirm = await question(`\n❓ Proceed with release? (y/N): `);

        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log("❌ Release cancelled.");
            rl.close();
            return;
        }
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

        // Run build process (without release notes first)
        runCommand("npm run build", "Building plugin");
        // Inject embedded fonts into release CSS (base64 in @font-face, no runtime <style> tags)
        injectEmbeddedFontsIntoReleaseCss();

        // Check if there are changes to commit
        try {
            execSync('git diff --exit-code', { stdio: 'pipe' });
            console.log("ℹ️  No changes to commit");
        } catch {
            // There are changes, commit them
            runCommand(`git add .`, "Staging changes");
            runCommand(`git commit -m "Release version ${newVersion}"`, "Committing changes");
        }

        // Create and push tag (handle existing tags)
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
            console.log(`💡 After publishing, run: npm run sync-release-notes && npm run build`);
            console.log(`   Then upload the updated main.js to the release`);

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
            console.log(`\n💡 To update release notes in plugin, run:`);
            console.log(`   npm run sync-release-notes && npm run build`);
            console.log(`   Then upload the updated main.js to the release`);
        }

    } catch (error) {
        console.error(`❌ Release failed:`, error.message);
        process.exit(1);
    }
}

main();
