import fs from 'fs';
import path from 'path';

const WIKI_DIR = 'wiki';
const SIDEBAR_FILE = path.join(WIKI_DIR, '_Sidebar.md');

// Define the desired order and hierarchy manually for better control.
const STRUCTURE = [
    { name: 'Home', link: 'Home' },
    {
        group: 'Getting Started',
        items: [
            { name: 'Core Workflows', link: 'Core-Workflows' },
            { name: 'How-to', link: 'How-to' },
            { name: 'View Modes', link: 'View-Modes' },
        ]
    },
    {
        group: 'Modes',
        items: [
            { name: 'Chronologue Mode', link: 'Chronologue-Mode' },
            { name: 'Gossamer Mode', link: 'Gossamer-Mode' },
            { name: 'Narrative Mode', link: 'Narrative-Mode' },
            { name: 'Publication Mode', link: 'Subplot-Mode' },
        ]
    },
    {
        group: 'Features & Tools',
        items: [
            { name: 'AI Analysis', link: 'AI-Analysis' },
            { name: 'Book Designer', link: 'Book-Designer' },
        ]
    },
    {
        group: 'Reference',
        items: [
            { name: 'Advanced YAML', link: 'Advanced-YAML' },
            { name: 'Commands', link: 'Commands' },
            { name: 'Settings', link: 'Settings' },
            { name: 'YAML Frontmatter', link: 'YAML-Frontmatter' },
        ]
    },
    {
        group: 'Support & Legal',
        items: [
            { name: 'Acknowledgments', link: 'Acknowledgments' },
            { name: 'FAQ', link: 'FAQ' },
            { name: 'License', link: 'License' },
            { name: 'Notice', link: 'Notice' },
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
