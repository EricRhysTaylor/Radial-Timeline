#!/usr/bin/env node

import { execSync } from "child_process";
import { writeFileSync } from "fs";

const BUNDLE_PATH = 'src/data/releaseNotesBundle.json';

function parseSemver(version) {
    const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;
    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10)
    };
}

function fetchRelease(tag) {
    try {
        const json = execSync(`gh release view ${tag} --json name,body,publishedAt,url`, { encoding: 'utf8' });
        const data = JSON.parse(json);
        return {
            version: tag,
            title: data.name || tag,
            body: data.body || '',
            url: data.url || `https://github.com/EricRhysTaylor/Radial-Timeline/releases/tag/${tag}`,
            publishedAt: data.publishedAt || new Date().toISOString()
        };
    } catch (error) {
        console.warn(`⚠️  Could not fetch release ${tag}: ${error.message}`);
        return null;
    }
}

function fetchAllReleases() {
    try {
        const output = execSync('gh release list --limit 50', { encoding: 'utf8' });
        const lines = output.trim().split('\n');
        const releases = [];
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length > 0) {
                const version = parts[0].trim().replace(/^v/i, '');
                releases.push(version);
            }
        }
        return releases;
    } catch (error) {
        console.error(`❌ Failed to list releases: ${error.message}`);
        return [];
    }
}

console.log('🔄 Syncing release notes from GitHub...\n');

// Get all releases
const allReleases = fetchAllReleases();
if (allReleases.length === 0) {
    console.error('❌ No releases found');
    process.exit(1);
}

// Latest should be first
const latestVersion = allReleases[0];
const semver = parseSemver(latestVersion);
if (!semver) {
    console.error(`❌ Invalid version format: ${latestVersion}`);
    process.exit(1);
}

console.log(`📦 Latest release: ${latestVersion}`);

// Fetch latest release details (this is always the "latest" entry)
const latest = fetchRelease(latestVersion);
if (!latest) {
    console.error('❌ Failed to fetch latest release');
    process.exit(1);
}

// Determine the major release tag (e.g., 4.1.0 for latest 4.1.x build)
let majorTag = `${semver.major}.${semver.minor}.0`;
let major = fetchRelease(majorTag);
if (!major) {
    console.warn(`⚠️  Major release ${majorTag} not found, falling back to ${semver.major}.0.0`);
    majorTag = `${semver.major}.0.0`;
    major = fetchRelease(majorTag);
}
if (!major) {
    console.warn(`⚠️  Major release ${majorTag} not found, using latest as major`);
    major = latest;
}
console.log(`🔍 Major release entry: ${major.version}`);

// Collect all patches in this major version (excluding X.0.0)
const patches = [];
const seen = new Set([major.version]);

for (const version of allReleases) {
    if (version === major.version) continue;
    const v = parseSemver(version);
    if (!v) continue;
    if (v.major !== semver.major) continue;
    if (v.minor === 0 && v.patch === 0) continue; // Skip X.0.0
    if (seen.has(version)) continue;
    
    const release = fetchRelease(version);
    if (release) {
        patches.push(release);
        seen.add(version);
    }
}

// Sort patches newest first
patches.sort((a, b) => {
    const aVer = parseSemver(a.version);
    const bVer = parseSemver(b.version);
    if (!aVer || !bVer) return 0;
    if (aVer.minor !== bVer.minor) return bVer.minor - aVer.minor;
    return bVer.patch - aVer.patch;
});

const bundle = {
    major,
    latest,
    patches: patches.length > 0 ? patches : undefined
};

try {
    writeFileSync(BUNDLE_PATH, JSON.stringify(bundle, null, 2));
    console.log(`\n✅ Release notes synced to ${BUNDLE_PATH}`);
    console.log(`   Major: ${major.version}`);
    console.log(`   Latest: ${latest.version}`);
    console.log(`   Patches: ${patches.length}`);
    console.log('\n💡 Now run: npm run build');
} catch (err) {
    console.error(`❌ Failed to write bundle: ${err.message}`);
    process.exit(1);
}
