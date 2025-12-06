import fs from 'fs';
import path from 'path';

const WIKI_DIR = 'wiki';
const SIDEBAR_FILE = path.join(WIKI_DIR, '_Sidebar.md');

// Define the desired order and hierarchy manually for better control, 
// or leave empty to auto-discover (auto-discovery is simple alphabetical in this basic script)
const STRUCTURE = [
    { name: 'Home', link: 'Home' },
    {
        group: 'User Guide',
        items: [
            { name: 'Core Workflows', link: 'Core-Workflows' },
            { name: 'Chronologue Mode', link: 'Chronologue-Mode' },
            { name: 'Gossamer Mode', link: 'Gossamer-Mode' },
            { name: 'AI Analysis', link: 'AI-Analysis' },
        ]
    },
    {
        group: 'Reference',
        items: [
            { name: 'View Modes', link: 'View-Modes' },
            { name: 'YAML Frontmatter', link: 'YAML-Frontmatter' },
            { name: 'Settings', link: 'Settings' },
        ]
    },
    {
        group: 'Technical & FAQ',
        items: [
            { name: 'Technical', link: 'Technical' },
        ]
    }
];

function generateSidebar() {
    let content = '';

    STRUCTURE.forEach(item => {
        if (item.group) {
            content += `*   **${item.group}**\n`;
            item.items.forEach(subItem => {
                content += `    *   [[${subItem.name}|${subItem.link}]]\n`;
            });
        } else {
            content += `*   [[${item.name}|${item.link}]]\n`;
        }
    });

    fs.writeFileSync(SIDEBAR_FILE, content);
    console.log(`Sidebar generated at ${SIDEBAR_FILE}`);
}

generateSidebar();
