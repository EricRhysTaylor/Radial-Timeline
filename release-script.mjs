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

function getLastReleaseTag() {
    try {
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

function generateChangelog(fromTag, toRef = 'HEAD') {
    try {
        const range = fromTag ? `${fromTag}..${toRef}` : toRef;
        const commits = execSync(`git log ${range} --oneline --no-merges`, { encoding: 'utf8' });
        
        if (!commits.trim()) {
            return "No changes since last release.";
        }

        const lines = commits.trim().split('\n');
        let changelog = "";
        
        lines.forEach(line => {
            const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
            if (match) {
                const [, hash, message] = match;
                // Clean up the message and format it nicely
                let cleanMessage = message.trim();
                
                // If message is very long, truncate it sensibly
                if (cleanMessage.length > 80) {
                    const words = cleanMessage.split(' ');
                    let truncated = '';
                    for (const word of words) {
                        if ((truncated + ' ' + word).length > 80) break;
                        truncated += (truncated ? ' ' : '') + word;
                    }
                    cleanMessage = truncated + '...';
                }
                
                changelog += `- ${cleanMessage}\n`;
            }
        });
        
        return changelog.trim() || "No changes since last release.";
    } catch (error) {
        return "Could not generate changelog.";
    }
}


async function main() {
    console.log("🚀 Obsidian Plugin Release Process\n");

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

        // Run build process
        runCommand("npm run build", "Building plugin");

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
        }

    } catch (error) {
        console.error(`❌ Release failed:`, error.message);
        process.exit(1);
    }
}

main();
