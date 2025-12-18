import https from 'https';

const url = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json';

https.get(url, { headers: { 'User-Agent': 'Debug-Script' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Keys:', Object.keys(json));
            // Print first few keys to see format
            console.log('Sample keys:', Object.keys(json).slice(0, 5));
        } catch (e) {
            console.error('Error parsing JSON:', e);
        }
    });
}).on('error', (e) => console.error('Error fetching:', e));
