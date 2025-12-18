import https from 'https';
import fs from 'fs';
import path from 'path';

const MANIFEST_PATH = path.join(process.cwd(), 'manifest.json');
const VERSIONS_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json';

// ANSI colors for output
const COLORS = {
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

async function fetchLatestVersion() {
    return new Promise((resolve, reject) => {
        https.get(VERSIONS_URL, { headers: { 'User-Agent': 'RadialTimeline-VersionCheck' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    
                    // CASE 1: 'latestVersion' key (Present in your debug log)
                    if (json.latestVersion && typeof json.latestVersion === 'string') {
                        resolve(json.latestVersion);
                        return;
                    }

                    // CASE 2: 'latest' key
                    if (json.latest && typeof json.latest === 'string') {
                        resolve(json.latest);
                        return;
                    }

                    // CASE 3: 'versions' object map
                    const versionMap = (json.versions && typeof json.versions === 'object') ? json.versions : json;
                    
                    // CASE 4: Keys are version numbers
                    const versions = Object.keys(versionMap)
                        .filter(k => /^\d+\.\d+\.\d+/.test(k))
                        .sort((a, b) => {
                            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                        });
                    
                    if (versions.length > 0) {
                        resolve(versions[versions.length - 1]);
                    } else {
                        // Fallback: Dump keys for debugging if we can't find any version
                        console.warn(`[Debug] Could not find version keys. Available keys: ${Object.keys(json).join(', ')}`);
                        resolve('0.0.0');
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function check() {
    console.log(`${COLORS.cyan}🔍 Checking for Obsidian updates...${COLORS.reset}`);

    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const currentTarget = manifest.minAppVersion;
        const latestVersion = await fetchLatestVersion();

        console.log(`   Target (minAppVersion): ${currentTarget}`);
        console.log(`   Latest Obsidian Release: ${latestVersion}`);

        // Simple comparison
        if (latestVersion !== currentTarget) {
            console.log(`\n${COLORS.yellow}⚠️  NEW OBSIDIAN VERSION DETECTED: ${latestVersion}${COLORS.reset}`);
            console.log(`${COLORS.yellow}   There may be new API standards or features available.${COLORS.reset}`);
            console.log(`${COLORS.yellow}   Action: Ask AI to "Check for API changes in Obsidian v${latestVersion} and update code standards."${COLORS.reset}\n`);
        } else {
            console.log(`${COLORS.green}✅ Project is targeting the latest version.${COLORS.reset}\n`);
        }

    } catch (err) {
        console.warn(`${COLORS.yellow}⚠️  Could not fetch latest Obsidian version (offline?): ${err.message}${COLORS.reset}`);
    }
}

check();
