#!/usr/bin/env node

/**
 * Fetch and Update Patreon Member Count from Patreon API
 * 
 * This script authenticates with Patreon, fetches your actual member count,
 * and updates patreonStats.json with the real data.
 * 
 * Setup:
 *   1. Get your Patreon Creator Access Token from:
 *      https://www.patreon.com/portal/registration/register-clients
 *   2. Set it as an environment variable:
 *      export PATREON_ACCESS_TOKEN="your_token_here"
 *   
 * Usage:
 *   npm run update-patreon
 *   or
 *   PATREON_ACCESS_TOKEN="your_token" npm run update-patreon
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PATREON_STATS_PATH = join(__dirname, 'src/data/patreonStats.json');

async function fetchFromPatreon(url, token) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Radial-Timeline-Stats-Updater'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function getPatreonMemberCount(accessToken) {
    console.log('🔐 Authenticating with Patreon API...');
    
    // First, get the campaign ID
    const identityUrl = 'https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields%5Buser%5D=full_name&fields%5Bmember%5D=patron_status';
    const identity = await fetchFromPatreon(identityUrl, accessToken);
    
    console.log('✅ Authenticated successfully');
    console.log(`👤 Account: ${identity.data?.attributes?.full_name || 'Unknown'}`);
    
    // Get campaigns
    const campaignsUrl = 'https://www.patreon.com/api/oauth2/v2/campaigns?include=tiers&fields%5Bcampaign%5D=patron_count';
    const campaigns = await fetchFromPatreon(campaignsUrl, accessToken);
    
    if (!campaigns.data || campaigns.data.length === 0) {
        throw new Error('No campaigns found. Make sure your access token has the correct permissions.');
    }
    
    const campaign = campaigns.data[0];
    const patronCount = campaign.attributes?.patron_count || 0;
    
    console.log(`\n📊 Campaign: ${campaign.id}`);
    console.log(`👥 Current patron count: ${patronCount}`);
    
    return patronCount;
}

async function updatePatreonStats() {
    const accessToken = process.env.PATREON_ACCESS_TOKEN;
    
    if (!accessToken) {
        console.error('❌ Error: PATREON_ACCESS_TOKEN environment variable not set');
        console.log('\n📖 Setup Instructions:');
        console.log('   1. Go to https://www.patreon.com/portal/registration/register-clients');
        console.log('   2. Create a new client (or use existing)');
        console.log('   3. Copy your Creator Access Token');
        console.log('   4. Set it as environment variable:');
        console.log('      export PATREON_ACCESS_TOKEN="your_token_here"');
        console.log('\n   Then run: npm run update-patreon');
        process.exit(1);
    }

    try {
        const memberCount = await getPatreonMemberCount(accessToken);
        
        const stats = {
            memberCount,
            lastUpdated: new Date().toISOString().split('T')[0],
            lastFetched: new Date().toISOString()
        };

        writeFileSync(PATREON_STATS_PATH, JSON.stringify(stats, null, 2) + '\n');
        
        console.log('\n✅ patreonStats.json updated successfully!');
        console.log(`👥 Member count: ${memberCount}`);
        console.log(`📅 Date: ${stats.lastUpdated}`);
        
    } catch (error) {
        console.error('\n❌ Error fetching from Patreon:', error.message);
        console.log('\n🔍 Troubleshooting:');
        console.log('   - Make sure your access token is valid');
        console.log('   - Check that you have a campaign on Patreon');
        console.log('   - Verify your token has campaign and identity scopes');
        process.exit(1);
    }
}

updatePatreonStats();

