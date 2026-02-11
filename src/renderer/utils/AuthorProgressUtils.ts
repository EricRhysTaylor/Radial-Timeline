import { TimelineItem } from '../../types';

/**
 * Anonymize timeline data for public sharing.
 * Removes sensitive text content while preserving structure.
 */
export function anonymizeTimeline(scenes: TimelineItem[]): TimelineItem[] {
    return scenes.map(scene => {
        const clean: TimelineItem = { ...scene };
        // Remove sensitive text
        delete clean.title;
        delete clean.synopsis;
        delete clean.Summary;
        delete clean.Purpose;
        delete clean.Context;
        delete clean.Description;
        delete clean.Character;
        delete clean.place;
        delete clean.pendingEdits;
        delete clean.rawFrontmatter;
        
        // Remove pulse data
        Object.keys(clean).forEach(key => {
            if (key.startsWith('Gossamer')) delete (clean as any)[key];
        });
        
        // Ensure minimal title for renderer stability
        clean.title = `Scene ${scene.number || ''}`;
        
        return clean;
    });
}

export function getAuthorProgressSealSVG(size: number): string {
    // A simple vector seal/badge to place in the corner
    const sealContent = `
        <g class="apr-seal" transform="translate(${size/2 - 140}, ${size/2 - 140})" opacity="0.8">
            <circle r="40" cx="60" cy="60" fill="none" stroke="currentColor" stroke-width="1" />
            <text x="60" y="55" text-anchor="middle" font-family="sans-serif" font-size="8" fill="currentColor">RADIAL TIMELINE</text>
            <text x="60" y="70" text-anchor="middle" font-family="sans-serif" font-size="8" fill="currentColor">PROGRESS</text>
            <path d="M 60 25 L 60 35 M 60 85 L 60 95 M 25 60 L 35 60 M 85 60 L 95 60" stroke="currentColor" stroke-width="1" />
        </g>
    `;
    return sealContent;
}

export function getKickstarterEmbed(url: string): string {
    return `<object type="image/svg+xml" data="${url}" width="100%">
  <img src="${url.replace('.svg', '.png')}" alt="Author Progress Report" />
</object>
<p><em><small>Live progress via Radial Timeline</small></em></p>`;
}

export function getPatreonEmbed(url: string): string {
    return `![Author Progress](${url})
*Live progress snapshot powered by Radial Timeline*`;
}
