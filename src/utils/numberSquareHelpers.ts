/**
 * Helper function to escape XML/HTML special characters
 */
function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&#39;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

/**
 * Helper function to generate scene IDs for number squares
 */
export function makeSceneId(actIndex: number, ring: number, idx: number, isOuterAllScenes: boolean, isOuter: boolean): string {
    return isOuterAllScenes && isOuter
        ? `scene-path-${actIndex}-${ring}-outer-${idx}`
        : `scene-path-${actIndex}-${ring}-${idx}`;
}

/**
 * Helper function to generate number square DOM structure
 */
export function generateNumberSquareGroup(
    squareX: number, 
    squareY: number, 
    squareSize: { width: number; height: number }, 
    squareClasses: string, 
    sceneId: string, 
    number: string, 
    textClasses: string,
    grade?: string
): string {
    return `
        <g class="number-square-group" transform="translate(${squareX}, ${squareY})">
            <g class="number-square-orient">
                <rect 
                    x="-${squareSize.width/2}" 
                    y="-${squareSize.height/2}" 
                    width="${squareSize.width}" 
                    height="${squareSize.height}" 
                    class="${squareClasses}" 
                    data-scene-id="${escapeXml(sceneId)}"
                />
                <text 
                    x="0" 
                    y="0" 
                    text-anchor="middle" 
                    dominant-baseline="middle" 
                    class="${textClasses}"
                    data-scene-id="${escapeXml(sceneId)}"
                    dy="0.1em"
                >${number}</text>
                ${grade ? `
                <line 
                    x1="${-squareSize.width/2 + 2}" 
                    y1="${squareSize.height/2 - 2}" 
                    x2="${squareSize.width/2 - 2}" 
                    y2="${squareSize.height/2 - 2}" 
                    class="grade-border-line grade-${grade}" 
                    data-scene-id="${escapeXml(sceneId)}" 
                    stroke-width="2"
                />` : ''}
            </g>
        </g>
    `;
}
