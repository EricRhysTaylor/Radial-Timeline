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

function runCommand(command, description, silent = false) {
    if (!silent) console.log(`\n🔄 ${description}...`);
    try {
        const output = execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
        if (!silent) console.log(`✅ ${description} completed`);
        return output;
    } catch (error) {
        console.error(`❌ Failed: ${description}`);
        console.error(error.message);
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
                changelog += `- ${message}\n`;
            }
        });
        
        return changelog || "No changes since last release.";
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
1. Use auto-generated changelog (default)
2. Edit in browser before publishing
Choose (1/2): `);
    
    let releaseNotes = `Release version ${newVersion}\n\n${autoChangelog}`;
    let editInBrowser = false;
    
    if (editOption === '2') {
        editInBrowser = true;
        console.log(`📝 Release will be created with auto-generated notes, then opened in browser for editing`);
    }

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

    rl.close();

    try {
        // Update package.json version
        packageJson.version = newVersion;
        writeFileSync("package.json", JSON.stringify(packageJson, null, "\t"));
        console.log(`✅ Updated package.json to version ${newVersion}`);

        // Run npm version to update manifest.json and versions.json (only if version changed)
        if (newVersion !== currentVersion) {
            runCommand(`npm version ${newVersion} --no-git-tag-version`, "Updating version files");
        } else {
            console.log(`ℹ️  Version unchanged, skipping npm version command`);
            // Still need to update manifest.json and versions.json manually for same-version re-releases
            runCommand(`node version-bump.mjs`, "Updating manifest and versions files");
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
        try {
            runCommand(`git tag ${newVersion}`, "Creating git tag");
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log(`ℹ️  Tag ${newVersion} already exists, skipping tag creation`);
            } else {
                throw error;
            }
        }
        
        runCommand("git push origin master", "Pushing changes");
        
        try {
            runCommand(`git push origin ${newVersion}`, "Pushing tag");
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log(`ℹ️  Tag ${newVersion} already pushed, continuing`);
            } else {
                throw error;
            }
        }

        // Create GitHub release with release assets
        // Escape quotes in release notes for command line
        const escapedNotes = releaseNotes.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        
        try {
            const releaseCommand = `gh release create ${newVersion} ` +
                `release/main.js release/manifest.json release/styles.css ` +
                `--title "Release ${newVersion}" ` +
                `--notes "${escapedNotes}" ` +
                `--latest`;
            
            runCommand(releaseCommand, "Creating GitHub release");
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log(`ℹ️  Release ${newVersion} already exists, updating instead`);
                
                // Update existing release
                const updateCommand = `gh release edit ${newVersion} ` +
                    `--title "Release ${newVersion}" ` +
                    `--notes "${escapedNotes}" ` +
                    `--latest`;
                
                runCommand(updateCommand, "Updating GitHub release");
                
                // Upload assets separately
                runCommand(`gh release upload ${newVersion} release/main.js release/manifest.json release/styles.css --clobber`, "Updating release assets");
            } else {
                throw error;
            }
        }

        console.log(`\n🎉 Release ${newVersion} completed successfully!`);
        console.log(`📦 GitHub release: https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/releases/tag/${newVersion}`);
        
        // Open browser for editing if requested
        if (editInBrowser) {
            console.log(`\n🌐 Opening release in browser for editing...`);
            try {
                runCommand(`gh release edit ${newVersion} --web`, "Opening release editor in browser", true);
            } catch (error) {
                console.log(`⚠️  Could not open browser automatically. You can edit the release at:`);
                console.log(`   https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/releases/tag/${newVersion}`);
            }
        }

    } catch (error) {
        console.error(`❌ Release failed:`, error.message);
        process.exit(1);
    }
}

main();
