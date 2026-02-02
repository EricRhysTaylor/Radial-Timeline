#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
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
    // Keep manifest files and versions.json in sync with package.json
    const manifestPath = 'src/manifest.json';
    const rootManifestPath = 'manifest.json';
    const versionsPath = 'versions.json';
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const { minAppVersion } = manifest;
        manifest.version = targetVersion;
        // Write both the source and root manifests so Obsidian's updater sees the bump
        writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t'));
        writeFileSync(rootManifestPath, JSON.stringify(manifest, null, '\t'));

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
        // Only fetch minimal info to check existence and draft status
        const json = execSync(`gh release view ${tag} --json name,isDraft,tagName`, { encoding: 'utf8' });
        return JSON.parse(json);
    } catch (error) {
        return null; // Release doesn't exist
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

    const newEntry = {
        version: version,
        title: version,
        body: body,
        url: `https://github.com/EricRhysTaylor/Radial-Timeline/releases/tag/${version}`,
        publishedAt: new Date().toISOString()
    };

    let bundle = readExistingReleaseBundle();
    if (!bundle) {
        bundle = { entries: [] };
    }

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
    bundle.entries.sort((a, b) => compareSemverDesc(a.version, b.version));

    // Update legacy fields
    bundle.latest = bundle.entries[0];

    const semver = parseSemver(version);
    if (semver) {
        const majorVersionStr = `${semver.major}.0.0`;
        let majorEntry = bundle.entries.find(e => e.version === majorVersionStr);

        if (!majorEntry) {
            if (version === majorVersionStr) {
                majorEntry = newEntry;
            } else {
                majorEntry = bundle.entries[bundle.entries.length - 1];
            }
        }
        bundle.major = majorEntry;
        bundle.majorVersion = majorEntry ? majorEntry.version : majorVersionStr;
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
        const ghOutput = execSync('gh release list --limit 1 --json tagName', { encoding: 'utf8' });
        const releases = JSON.parse(ghOutput);
        if (releases && releases.length > 0) {
            return releases[0].tagName;
        }
    } catch (error) {
        // console.log('⚠️  Could not get GitHub releases, falling back to Git tags');
    }

    try {
        const output = execSync('git tag --sort=-version:refname | head -1', { encoding: 'utf8' });
        return output.trim() || null;
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
        title: "New Features",
        keywords: [/feat/i, /add/i, /new/i, /implement/i, /create/i]
    },
    {
        title: "Bug Fixes",
        keywords: [/fix/i, /resolve/i, /bug/i, /patch/i, /correct/i, /repair/i]
    },
    {
        title: "Improvements",
        keywords: [/improve/i, /refactor/i, /perf/i, /optimiz/i, /tweak/i, /update/i, /styl/i, /polish/i, /better/i, /enlarge/i, /adjust/i, /refine/i]
    },
    {
        title: "Documentation",
        keywords: [/doc/i, /readme/i, /wiki/i, /comment/i]
    },
    {
        title: "Maintenance",
        keywords: [/chore/i, /maint/i, /build/i, /ci/i, /bump/i, /upgrade/i, /script/i]
    }
];

function generateChangelog(fromTag, toRef = 'HEAD') {
    try {
        const range = fromTag ? `${fromTag}..${toRef}` : toRef;
        const logs = execSync(`git log ${range} --pretty=format:"%h|%H|%s" --no-merges`, { encoding: 'utf8' });

        if (!logs.trim()) {
            return "No changes since last release.";
        }

        const lines = logs.trim().split('\n');
        const categorized = {};
        const uncategorized = [];

        CATEGORIES.forEach(cat => categorized[cat.title] = []);

        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length < 3) return;

            const shortHash = parts[0];
            const fullHash = parts[1];
            let rawMessage = parts.slice(2).join('|').trim();
            let cleanMessages = [];

            if (rawMessage.startsWith('[backup]')) {
                const segments = rawMessage.split(' — ');
                if (segments.length >= 3) {
                    let descParts = [];
                    for (let i = 2; i < segments.length; i++) {
                        const seg = segments[i].trim();
                        if (/^\d+\s+files$/.test(seg) || /^[+\-]\d+\/[+\-]\d+/.test(seg)) break;
                        descParts.push(seg);
                    }
                    const fullDesc = descParts.join(' — ');
                    if (fullDesc && !fullDesc.includes('automatic backup after build')) {
                        cleanMessages = fullDesc.split('. ').map(s => s.trim()).filter(s => s.length > 2);
                    }
                } else {
                    const hyphenSegments = rawMessage.split(' - ');
                    if (hyphenSegments.length >= 4 && rawMessage.includes('[backup]')) {
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
            changelog += `### Other Changes\n${uncategorized.join('\n')}\n\n`;
        }

        return changelog.trim() || "No significant changes since last release.";
    } catch (error) {
        console.error(error);
        return "Could not generate changelog.";
    }
}

// Build @font-face rules
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

async function performBuildAndUpload(version, isDraft = false) {
    // 0. Verify manifest version matches target version (Critical for Obsidian detection)
    const manifestPath = 'src/manifest.json';
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.version !== version) {
            console.log(`\n⚠️  Manifest version mismatch: Found ${manifest.version}, expected ${version}`);
            console.log(`🔄 Syncing manifest.json and versions.json to ${version}...`);
            updateManifestAndVersions(version);
        }
    } catch (e) {
        console.warn(`⚠️  Could not verify manifest version: ${e.message}`);
    }

    // 1. Sync release notes from GitHub to ensure local bundle is current
    console.log('\n🔄 Syncing release notes from GitHub...');
    try {
        execSync('npm run sync-release-notes', { stdio: 'inherit' });
    } catch (e) {
        console.error('❌ Failed to sync release notes. Aborting build.');
        return;
    }

    // 2. Commit the synced notes (otherwise git status is dirty)
    try {
        runCommand('git add src/data/releaseNotesBundle.json', 'Staging synced release notes');
        // We only commit if there are changes
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        if (status.includes('src/data/releaseNotesBundle.json')) {
            runCommand(`git commit -m "docs: sync release notes for ${version}"`, 'Committing release notes');
            
            // OPTIONAL: Move tag to this new commit so the tag includes the notes
            // This is "history rewriting" but ensures the tag is "perfect"
            console.log(`\n📍 Updating tag ${version} to include release notes...`);
            runCommand(`git tag -f ${version}`, `Moving tag ${version} to HEAD`);
            runCommand(`git push origin ${version} --force`, `Pushing tag ${version}`);
        }
    } catch (e) {
        console.warn('⚠️  Could not commit synced notes or move tag. Proceeding anyway.');
    }

    // 3. Verify (build + checks)
    runCommand("npm run verify", "Verifying release (build + checks)");
    injectEmbeddedFontsIntoReleaseCss();

    // 4. Upload Assets
    console.log(`\n📤 Uploading assets to release ${version}...`);
    const assets = "release/main.js release/manifest.json release/styles.css";
    runCommand(`gh release upload ${version} ${assets} --clobber`, "Uploading assets", false, true);

    // 5. Publish (if it was a draft)
    if (isDraft) {
        const confirm = await question(`\n❓ Draft release ${version} is ready. Publish it now? (y/N): `);
        if (confirm.toLowerCase() === 'y') {
            const notesFile = '.release-notes-temp.md'; // Use temp file logic if we were editing description, but here we just toggle status
            // We assume description is already correct on GitHub
            runCommand(`gh release edit ${version} --draft=false --latest`, "Publishing release");
            console.log(`\n🎉 Release ${version} published successfully!`);
            console.log(`📦 https://github.com/EricRhysTaylor/radial-timeline/releases/tag/${version}`);
        } else {
            console.log(`\n✅ Assets uploaded. Release ${version} remains a draft.`);
        }
    } else {
        console.log(`\n✅ Assets updated for existing release ${version}.`);
    }
}

async function main() {
    console.log("🚀 Obsidian Plugin Release Process\n");

    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        if (branch !== 'master') {
            console.error(`❌ Releases must be cut from 'master'. Current: '${branch}'`);
            process.exit(1);
        }
    } catch (e) { /* ignore */ }

    // Read current version
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const currentVersion = packageJson.version;
    console.log(`📦 Current local version: ${currentVersion}`);

    // Check if there is already a release/draft for this version
    const existingRelease = fetchReleaseInfo(currentVersion);
    
    if (existingRelease) {
        if (existingRelease.isDraft) {
            console.log(`\n⚠️  Found existing DRAFT release for ${currentVersion} on GitHub.`);
            console.log(`   This means you probably edited the notes and are ready to finish.`);
            const choice = await question(`\n❓ Finish release ${currentVersion}? (Sync notes -> Build -> Upload -> Publish) (y/N): `);
            if (choice.toLowerCase() === 'y') {
                await performBuildAndUpload(currentVersion, true);
                rl.close();
                return;
            }
        } else {
            console.log(`\n⚠️  Found existing PUBLISHED release for ${currentVersion} on GitHub.`);
            const choice = await question(`\n❓ Repair/Update assets for ${currentVersion}? (Sync notes -> Build -> Upload) (y/N): `);
            if (choice.toLowerCase() === 'y') {
                await performBuildAndUpload(currentVersion, false);
                rl.close();
                return;
            }
        }
    }

    // --- NEW RELEASE FLOW ---
    
    const lastTag = getLastReleaseTag();
    console.log(`🏷️  Last release tag: ${lastTag || 'None found'}`);

    // Get new version from user
    const newVersion = await question(`✨ Enter new version number: `);

    if (!newVersion) {
        console.log("❌ Invalid version.");
        rl.close();
        return;
    }

    if (newVersion === currentVersion) {
        console.log("ℹ️  Version matches current. Use the repair options above if needed.");
        rl.close();
        return;
    }

    // Generate changelog
    console.log(`\n📝 Generating changelog...`);
    const autoChangelog = generateChangelog(lastTag);
    
    // Create Draft Release Logic
    console.log(`\n⚙️  Step 1: Creating Draft Release`);
    
    // 1. Bump version locally
    runCommand(`npm version ${newVersion} --no-git-tag-version`, "Bumping version");
    
    // 2. Update bundle with preliminary auto-notes (so we have something)
    updateBundleWithLocalEntry(newVersion, `## What's Changed\n\n${autoChangelog}`);

    // 3. Commit bump
    runCommand(`git add .`, "Staging version bump");
    runCommand(`git commit -m "Release version ${newVersion}"`, "Committing version bump");
    
    // 4. Create Draft on GitHub (Text Only)
    // We create the tag now so we can attach the release to it
    runCommand(`git tag ${newVersion}`, `Creating tag ${newVersion}`);
    runCommand(`git push origin master`, "Pushing code");
    runCommand(`git push origin ${newVersion}`, "Pushing tag");

    const notesFile = '.release-notes-temp.md';
    writeFileSync(notesFile, `## What's Changed\n\n${autoChangelog}`);

    const cmd = `gh release create ${newVersion} --title "${newVersion}" --notes-file "${notesFile}" --draft`;
    runCommand(cmd, "Creating Draft Release on GitHub");
    
    unlinkSync(notesFile);

    console.log(`\n🎉 Draft Release Created!`);
    console.log(`👉 Action Required:`);
    console.log(`   1. Browser is opening... Edit the release notes on GitHub.`);
    console.log(`   2. Add your wiki links, fix typos, make it perfect.`);
    console.log(`   3. SAVE the draft (Do NOT publish yet).`);
    console.log(`   4. Return here and run: npm run release`);
    console.log(`      (It will detect the draft and run the 'Finish' steps)`);

    try {
        runCommand(`gh release view ${newVersion} --web`, "Opening GitHub", true);
    } catch (e) {
        console.log(`   Link: https://github.com/EricRhysTaylor/Radial-Timeline/releases/tag/${newVersion}`);
    }

    rl.close();
}

main();
