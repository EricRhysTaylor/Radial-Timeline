import { NUM_ACTS } from '../utils/constants';
import { formatNumber, escapeXml } from '../utils/svg';
import { dateToAngle } from '../utils/date';
import { parseSceneTitle } from '../utils/text';

// Temporary minimal type aliases to avoid external dependencies during refactor
type Scene = any;
type SceneNumberInfo = any;

const STATUS_COLORS = {
  Working: 'var(--color-working)',
  Todo: 'var(--color-todo)',
  Empty: 'var(--color-empty)',
  Due: 'var(--color-due)',
  Complete: 'var(--color-complete)',
};

interface PluginRendererFacade {
  settings: {
    publishStageColors: Record<string, string>;
    debug: boolean;
    targetCompletionDate?: string;
  };
  searchActive: boolean;
  searchResults: Set<string>;
  searchTerm: string;
  openScenePaths: Set<string>;
  desaturateColor(hex: string, amount: number): string;
  lightenColor(hex: string, percent: number): string;
  darkenColor(hex: string, percent: number): string;
  calculateCompletionEstimate(scenes: Scene[]): { date: Date; total: number; remaining: number; rate: number } | null;
  log<T>(message: string, data?: T): void;
  synopsisManager: { generateElement: (scene: Scene, contentLines: string[], sceneId: string) => SVGGElement };
  highlightSearchTerm(text: string): string;
  safeSvgText(text: string): string;
  latestStatusCounts?: Record<string, number>;
  splitIntoBalancedLines: (text: string, maxWidth: number) => string[];
}

export function createTimelineSVG(
  plugin: PluginRendererFacade,
  scenes: Scene[],
): { svgString: string; maxStageColor: string } {
    
        const sceneCount = scenes.length;
        const size = 1600;
        const margin = 30;
        const innerRadius = 200; // the first ring is 200px from the center
        const outerRadius = size / 2 - margin;
        const maxTextWidth = 500; // Define maxTextWidth for the synopsis text
    
        // --- Find Max Publish Stage --- START ---
        const stageOrder = ["Zero", "Author", "House", "Press"];
        let maxStageIndex = 0; // Default to Zero index
        scenes.forEach(scene => {
            const stage = scene["Publish Stage"] || "Zero";
            const currentIndex = stageOrder.indexOf(stage);
            if (currentIndex > maxStageIndex) {
                maxStageIndex = currentIndex;
            }
        });
        const maxStageName = stageOrder[maxStageIndex];
        // Add check before accessing settings potentially
        const maxStageColor =
        plugin.settings.publishStageColors[maxStageName as keyof typeof plugin.settings.publishStageColors] || plugin.settings.publishStageColors.Zero;
 
        // --- Find Max Publish Stage --- END ---

        // Create SVG root and expose the dominant publish-stage colour for CSS via a hidden <g> element
        let svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" 
                       xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg" 
                       preserveAspectRatio="xMidYMid meet">`;

        // Hidden config group consumed by the stylesheet (e.g. to tint buttons, etc.)
        svg += `<g id="timeline-config-data" data-max-stage-color="${maxStageColor}"></g>`;

        // Add debug coordinate display if debug mode is enabled
        if (plugin.settings.debug) {
            svg += `
                <g class="debug-info-container svg-interaction"><!-- SAFE: class-based SVG interaction -->
                    <rect class="debug-info-background" x="-790" y="-790" width="230" height="40" rx="5" ry="5" fill="rgba(255,255,255,0.9)" stroke="#333333" stroke-width="1" />
                    <text class="debug-info-text" id="mouse-coords-text" x="-780" y="-765" fill="#ff3300" font-size="20px" font-weight="bold" stroke="white" stroke-width="0.5px" paint-order="stroke">Mouse: X=0, Y=0</text>
                </g>
            `;
        }
        
        // Add search results indicator if search is active
        if (plugin.searchActive && plugin.searchResults.size > 0) {
            svg += `
                <g transform="translate(-${size/2 - 20}, -${size/2 - 30})">
                    <rect x="0" y="0" width="200" height="40" rx="5" ry="5" 
                          fill="#FFCC00" fill-opacity="0.6" stroke="#000000" stroke-width="1" />
                    <text x="10" y="25" fill="#000000" font-size="14px" font-weight="bold">
                        Found ${plugin.searchResults.size} scene${plugin.searchResults.size !== 1 ? 's' : ''}: "${plugin.searchTerm}"
                    </text>
                    <g transform="translate(185, 20)" class="clear-search-btn" data-action="clear-search">
                        <circle r="15" fill="#FFFFFF" fill-opacity="0.8" stroke="#000000" stroke-width="1" />
                        <path d="M-8,-8 L8,8 M-8,8 L8,-8" stroke="#000000" stroke-width="2" fill="none" />
                    </g>
                </g>
            `;
        }
        
        // Center the origin in the middle of the SVG
        svg += `<g transform="translate(${size / 2}, ${size / 2})">`;
        
        // Create defs for patterns and gradients
        svg += `<defs>`;

        // Create a map to store scene number information for the scene square and synopsis
        const sceneNumbersMap = new Map<string, SceneNumberInfo>();
    
        // Collect all unique subplots
        const allSubplotsSet = new Set<string>();
        scenes.forEach(scene => {
            allSubplotsSet.add(scene.subplot || "None");
        });
        const allSubplots = Array.from(allSubplotsSet);
    
        // Dynamically set NUM_RINGS based on the number of unique subplots
        const NUM_RINGS = allSubplots.length;
    
        // Ring colors are now handled by CSS variables and dynamic color logic
    
        // Group scenes by Act and Subplot
        const scenesByActAndSubplot: { [act: number]: { [subplot: string]: Scene[] } } = {};
    
        for (let act = 0; act < NUM_ACTS; act++) {
            scenesByActAndSubplot[act] = {};
        }
    
        scenes.forEach(scene => {
            const act = scene.actNumber !== undefined ? scene.actNumber - 1 : 0; // Subtract 1 for 0-based index, default to 0 if undefined
    
            // Ensure act is within valid range
            const validAct = (act >= 0 && act < NUM_ACTS) ? act : 0;
    
            const subplot = scene.subplot || 'Default';
    
            if (!scenesByActAndSubplot[validAct][subplot]) {
                scenesByActAndSubplot[validAct][subplot] = [];
            }
    
            scenesByActAndSubplot[validAct][subplot].push(scene);
        });
    
        // Define the months and their angles
        const months = Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * 2 * Math.PI - Math.PI / 2; // Adjust so January is at the top
            const name = new Date(2000, i).toLocaleString('en-US', { month: 'long' });
            const shortName = new Date(2000, i).toLocaleString('en-US', { month: 'short' }).slice(0, 3);
            return { name, shortName, angle };
        });
    
        // Calculate total available space
        const availableSpace = outerRadius - innerRadius;
    
        // Set the reduction factor for ring widths (if you want equal widths, set reductionFactor to 1)
        const reductionFactor = 1; // For equal ring widths
        const N = NUM_RINGS;
    
        // Calculate the sum of the geometric series (simplifies to N when reductionFactor is 1)
        const sumOfSeries = (reductionFactor === 1) ? N : (1 - Math.pow(reductionFactor, N)) / (1 - reductionFactor);
    
        // Calculate the initial ring width to fill the available space
        const initialRingWidth = availableSpace / sumOfSeries;
    
        // Calculate each ring's width
        const ringWidths = Array.from({ length: N }, (_, i) => initialRingWidth * Math.pow(reductionFactor, i));
    
        // Calculate the start radii for each ring
        const ringStartRadii = ringWidths.reduce((acc, width, i) => {
            const previousRadius = i === 0 ? innerRadius : acc[i - 1] + ringWidths[i - 1];
            acc.push(previousRadius);
            return acc;
        }, [] as number[]);
    
        // Months radius outer and inner
        const lineInnerRadius = ringStartRadii[0] - 20;
        const lineOuterRadius = ringStartRadii[N - 1] + ringWidths[N - 1] + 30;
    
        // **Include the `<style>` code here**
        svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg" preserveAspectRatio="xMidYMid meet">`;

        // Access the publishStageColors from settings
        const PUBLISH_STAGE_COLORS = plugin.settings.publishStageColors;

        // Begin defs act
        svg += `<defs>`;
        
        // Define patterns for Working and Todo states with Publish Stage colors
        svg += `${Object.entries(PUBLISH_STAGE_COLORS).map(([stage, color]) => {
            // Desaturate the stage color for the 'Working' and 'Todo' stroke to soften the plaid pattern
            const desaturatedColor = plugin.desaturateColor(color, 0.75); // 75 % desaturated
            return `
            <pattern id="plaidWorking${stage}" patternUnits="userSpaceOnUse" width="80" height="20" patternTransform="rotate(-20)">
                <rect width="80" height="20" fill="var(--color-working)" opacity="var(--color-plaid-opacity)"/>
                <path d="M 0 10 Q 2.5 -5, 5 10 Q 7.5 25, 10 10 Q 12.5 5, 15 10 Q 17.5 25, 20 10 Q 22.5 -5, 25 10 Q 27.5 25, 30 10 Q 32.5 5, 35 10 Q 37.5 25, 40 10 Q 42.5 -5, 45 10 Q 47.5 25, 50 10 Q 52.5 5, 55 10 Q 57.5 25, 60 10 Q 62.5 -5, 65 10 Q 67.5 25, 70 10 Q 72.5 5, 75 10 Q 77.5 25, 80 10" 
                    stroke="${color}" 
                    stroke-opacity="var(--color-plaid-stroke-opacity)" 
                    stroke-width="1.5" 
                    fill="none" />
            </pattern>
            
            <pattern id="plaidTodo${stage}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="var(--color-todo)" opacity="var(--color-plaid-opacity)"/>
                <line x1="0" y1="0" x2="0" y2="10" 
                    stroke="${desaturatedColor}" 
                    stroke-width="1" 
                    stroke-opacity="var(--color-plaid-stroke-opacity)"/>
                <line x1="0" y1="0" x2="10" y2="0" 
                    stroke="${desaturatedColor}" 
                    stroke-width="1" 
                    stroke-opacity="var(--color-plaid-stroke-opacity)"/>
            </pattern>
        `;}).join('')}`;
        
        // Define outer arc paths for months
        months.forEach(({ name, angle }, index) => {
            // Calculate angular offset for 9px at the label radius
            const outerlabelRadius = lineOuterRadius - 15; //the larger the number the closer to the center
            // Convert 5px to radians based on the circle's circumference
            const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * outerlabelRadius);
            
            // Make the month offset very small, similar to but positive (clockwise) for Acts
            const angleOffset = 0.01; // Half of previous value (0.02)
            const startAngle = angle + angleOffset;  // Small offset to move label clockwise
            const endAngle = startAngle + (Math.PI / 24); // Short arc length
  
            const pathId = `monthLabelPath-${index}`;

            svg += `
                <path id="${pathId}"
                    d="
                        M ${formatNumber(outerlabelRadius * Math.cos(startAngle))} ${formatNumber(outerlabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(outerlabelRadius)} ${formatNumber(outerlabelRadius)} 0 0 1 ${formatNumber(outerlabelRadius * Math.cos(endAngle))} ${formatNumber(outerlabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
            `;
        });

        // Close defs act
        svg += `</defs>`;

        // Get current month index (0-11)
        const currentMonthIndex = new Date().getMonth();

        //outer months Labels
        months.forEach(({ name }, index) => {
            const pathId = `monthLabelPath-${index}`;
            const isPastMonth = index < currentMonthIndex;
            svg += `
                <text class="month-label-outer" ${isPastMonth ? 'opacity="0.5"' : ''}>
                    <textPath href="#${pathId}" startOffset="0" text-anchor="start">
                        ${name}
                    </textPath>
                </text>
            `;
        });

        // First add the progress ring (RAINBOW YEAR PROGRESS)
        // Calculate year progress
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
        // TEMP TEST: Force full year display to see all colors
        // const yearProgress = 1; // TEMP TEST: Force 100% to display all segments

        // Create progress ring
        const progressRadius = lineInnerRadius + 15;
        const circumference = 2 * Math.PI * progressRadius;
        // const progressLength = circumference * yearProgress; // No longer needed for arc calc
        const currentYearStartAngle = -Math.PI / 2; // Start at 12 o'clock
        const currentYearEndAngle = currentYearStartAngle + (2 * Math.PI * yearProgress);

        // Define rainbow gradients for the segments
        svg += `<defs>
            <linearGradient id="linearColors1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#FF0000"></stop>
                <stop offset="100%" stop-color="#FF7F00"></stop>
            </linearGradient>
            <linearGradient id="linearColors2" x1="0.5" y1="0" x2="0.5" y2="1">
                <stop offset="0%" stop-color="#FF7F00"></stop>
                <stop offset="100%" stop-color="#FFFF00"></stop>
            </linearGradient>
            <linearGradient id="linearColors3" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FFFF00"></stop>
                <stop offset="100%" stop-color="#00FF00"></stop>
            </linearGradient>
            <linearGradient id="linearColors4" x1="1" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#00FF00"></stop>
                <stop offset="100%" stop-color="#0000FF"></stop>
            </linearGradient>
            <linearGradient id="linearColors5" x1="0.5" y1="1" x2="0.5" y2="0">
                <stop offset="0%" stop-color="#0000FF"></stop>
                <stop offset="100%" stop-color="#4B0082"></stop>
            </linearGradient>
            <linearGradient id="linearColors6" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="#4B0082"></stop>
                <stop offset="100%" stop-color="#8F00FF"></stop>
            </linearGradient>
        </defs>`;

        // Add the base purple circle (provides background for entire ring)
        svg += `
            <circle
                cx="0"
                cy="0"
                r="${progressRadius}"
                class="progress-ring-base"
            />
        `;

         // --- Draw Estimation Arc --- START ---
         const estimateResult = plugin.calculateCompletionEstimate(scenes);

         // --- TEMPORARY DEBUG OVERRIDE FOR QUADRANT TESTING --- START ---
         // Uncomment ONE of the following lines to force the estimated date for testing positioning.
         // Remember to remove or comment out this block when done testing!

         // --- Quadrant Midpoints ---
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 1, 15); // Feb 15 (Quadrant 4 - Top Right)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 4, 15); // May 15 (Quadrant 1 - Bottom Right)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 7, 15); // Aug 15 (Quadrant 2 - Bottom Left)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 10, 15); // Nov 15 (Quadrant 3 - Top Left)

         // --- Cardinal Directions ---
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 0, 1);  // Jan 1 (Top, -90 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 3, 1);  // Apr 1 (Right, 0 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 6, 1);  // Jul 1 (Bottom, 90 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 9, 1);  // Oct 1 (Left, 180 deg)
         // --- TEMPORARY DEBUG OVERRIDE FOR QUADRANT TESTING --- END ---

         // Only proceed if estimate calculation was successful
         if (estimateResult) {
             // Use estimateResult.date instead of estimatedCompletionDate
             const estimatedCompletionDate = estimateResult.date;

             const startAngle = -Math.PI/2; // 12 o'clock position

             if (plugin.settings.debug) {
                 plugin.log(`[Timeline Estimate] Calculating arc for date: ${estimatedCompletionDate.toISOString().split('T')[0]}`);
             }
             
             const estimatedYear = estimatedCompletionDate.getFullYear();
             const estimatedMonth = estimatedCompletionDate.getMonth();
             const estimatedDay = estimatedCompletionDate.getDate();
             
             const estimatedDaysInMonth = new Date(estimatedYear, estimatedMonth + 1, 0).getDate();
             const now = new Date(); // Need current time for diff calculations
             const yearsDiff = estimatedCompletionDate.getFullYear() - now.getFullYear();

             // Note: Red circles removed - year indicators now shown in date label instead
             
             if (yearsDiff > 0) {
                 // For multi-year estimates, the base circle already provides the full purple background
                 // No additional circle needed - year indicator in label shows multi-year status
             } else {
                 // For current year estimates, draw partial arc from January 1 to estimated date position
                 const estimatedYearPos = estimatedMonth/12 + estimatedDay/estimatedDaysInMonth/12;
                 const estimatedDateAngle = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;
                 
                 let arcAngleSpan = estimatedDateAngle - startAngle;
                 if (arcAngleSpan < 0) arcAngleSpan += 2 * Math.PI;
                 
                 svg += `
                     <path
                         d="
                             M ${progressRadius * Math.cos(startAngle)} ${progressRadius * Math.sin(startAngle)}
                             A ${progressRadius} ${progressRadius} 0 ${arcAngleSpan > Math.PI ? 1 : 0} 1 
                             ${progressRadius * Math.cos(estimatedDateAngle)} ${progressRadius * Math.sin(estimatedDateAngle)}
                         "
                         class="progress-ring-base"
                     />
                 `;
             }

         }
         // --- Draw Estimation Arc --- END ---

         
        // BEGIN add the month spokes group (existing code)
        svg += `<g class="month-spokes">`;

        // For each month, draw the inner spoke and labels
    
        // Then modify the inner month labels to curve along the inner arc
        months.forEach(({ name, angle }, monthIndex) => {
            const x1 = formatNumber((lineInnerRadius - 5) * Math.cos(angle));
            const y1 = formatNumber((lineInnerRadius - 5) * Math.sin(angle));
            const x2 = formatNumber(lineOuterRadius * Math.cos(angle));
            const y2 = formatNumber(lineOuterRadius * Math.sin(angle));

            // Check if this is an Act boundary (months 0, 4, or 8)
            const isActBoundary = [0, 4, 8].includes(monthIndex);
            // Check if this month has passed
            const isPastMonth = monthIndex < currentMonthIndex;

            // Draw the spoke line
            svg += `
                <line  
                    x1="${x1}"
                    y1="${y1}"
                    x2="${x2}"
                    y2="${y2}"
                    class="month-spoke-line${isActBoundary ? ' act-boundary' : ''}${isPastMonth ? ' past-month' : ''}"
                />`;

            // Create curved path for inner month labels
            const innerLabelRadius = lineInnerRadius;
            const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * innerLabelRadius);
            const startAngle = angle + pixelToRadian;
            const endAngle = angle + (Math.PI / 6);
            
            const innerPathId = `innerMonthPath-${name}`;
            
            svg += `
                <path id="${innerPathId}"
                    d="
                        M ${formatNumber(innerLabelRadius * Math.cos(startAngle))} ${formatNumber(innerLabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(innerLabelRadius)} ${formatNumber(innerLabelRadius)} 0 0 1 ${formatNumber(innerLabelRadius * Math.cos(endAngle))} ${formatNumber(innerLabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
                <text class="month-label" ${isPastMonth ? 'opacity="0.5"' : ''}>
                    <textPath href="#${innerPathId}" startOffset="0" text-anchor="start">
                        ${months[monthIndex].shortName}
                    </textPath>
                </text>
            `;
        });

        // Close the month spokes lines and text labels group
        svg += `</g>`;


        // Create six segments for the rainbow (Year Progress)
        const segmentCount = 6;
        const fullCircleAngle = 2 * Math.PI;
        const segmentAngle = fullCircleAngle / segmentCount;
        
        // Calculate how many complete segments to show based on year progress
        const completeSegments = Math.floor(yearProgress * segmentCount);
        
        // Calculate the partial segment angle (for the last visible segment)
        const partialSegmentAngle = (yearProgress * segmentCount - completeSegments) * segmentAngle;
        
        // Draw each segment that should be visible
        for (let i = 0; i < segmentCount; i++) {
            // Calculate this segment's start and end angles
            const segStart = currentYearStartAngle + (i * segmentAngle);
            let segEnd = segStart + segmentAngle;
            
            // If this is beyond what should be shown based on year progress, skip it
            if (i > completeSegments) continue;
            
            // If this is the last partial segment, adjust the end angle
            if (i === completeSegments && partialSegmentAngle > 0) {
                segEnd = segStart + partialSegmentAngle;
            }
            
            // Create the arc path for this segment
            svg += `
                <path
                    d="
                        M ${progressRadius * Math.cos(segStart)} ${progressRadius * Math.sin(segStart)}
                        A ${progressRadius} ${progressRadius} 0 ${(segEnd - segStart) > Math.PI ? 1 : 0} 1 
                        ${progressRadius * Math.cos(segEnd)} ${progressRadius * Math.sin(segEnd)}
                    "
                    class="progress-ring-fill"
                    stroke="url(#linearColors${i+1})"
                />
            `;
        }

        // Add tick mark and label for the estimated completion date if available
        // Use the same estimateResult check
        if (estimateResult) {
            const estimatedCompletionDate = estimateResult.date; // Get date again

            // Use estimateResult.date for calculations
            const estimatedMonth = estimatedCompletionDate.getMonth();
            const estimatedDay = estimatedCompletionDate.getDate();
            const estimatedDaysInMonth = new Date(estimatedCompletionDate.getFullYear(), estimatedMonth + 1, 0).getDate();
            const estimatedYearPos = estimatedMonth/12 + estimatedDay/estimatedDaysInMonth/12;
            const absoluteDatePos = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;

            // ... (calculate tick mark positions using absoluteDatePos) ...
            const tickOuterRadius = progressRadius + 5;
            const tickInnerRadius = progressRadius - 35;
            const tickOuterX = tickOuterRadius * Math.cos(absoluteDatePos);
            const tickOuterY = tickOuterRadius * Math.sin(absoluteDatePos);
            const tickInnerX = tickInnerRadius * Math.cos(absoluteDatePos);
            const tickInnerY = tickInnerRadius * Math.sin(absoluteDatePos);
            
            svg += `
                <line 
                    x1="${formatNumber(tickOuterX)}" 
                    y1="${formatNumber(tickOuterY)}" 
                    x2="${formatNumber(tickInnerX)}" 
                    y2="${formatNumber(tickInnerY)}" 
                    class="estimated-date-tick" 
                />
                <circle 
                    cx="${formatNumber(tickInnerX)}" 
                    cy="${formatNumber(tickInnerY)}" 
                    r="4" 
                    class="estimated-date-dot" 
                />
            `;

            // Use estimateResult.date for display format
            const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });
            
            // Add year indicator for completion estimates beyond current year
            const now = new Date();
            const yearsDiff = estimatedCompletionDate.getFullYear() - now.getFullYear();
            const yearIndicator = yearsDiff > 0 ? `[${yearsDiff + 1}] ` : '';
            const dateDisplay = `${yearIndicator}${dateFormatter.format(estimatedCompletionDate)}`;
            
            // --- Get stats string from estimateResult --- START ---
            const total = estimateResult.total;
            const remaining = estimateResult.remaining;
            const rate = estimateResult.rate; // Already rounded
            const statsDisplay = `${total}:${remaining}:${rate}`; // Compact format
            // --- Get stats string from estimateResult --- END ---

            // ... (calculate label positions using absoluteDatePos) ...
            const labelRadius = progressRadius - 45;
            const maxOffset = -18;
            const offsetX = maxOffset * Math.cos(absoluteDatePos);
            const maxYOffset = 5;
            const offsetY = -maxYOffset * Math.sin(absoluteDatePos);
            const labelX = formatNumber(labelRadius * Math.cos(absoluteDatePos) + offsetX);
            const labelY = formatNumber(labelRadius * Math.sin(absoluteDatePos) + offsetY);

            svg += `
                <text
                    x="${labelX}"
                    y="${labelY}"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="estimation-date-label"
                >
                    ${dateDisplay}
                </text>
            `;

            //   Replace dateDisplay above for complete stats ${dateDisplay} ${statsDisplay}
        }

        // --- START: Draw Target Completion Marker ---
        let targetDateAngle = -Math.PI / 2; // Default to 12 o'clock (top)

        if (plugin.settings.targetCompletionDate) {
            try {
                // Parse the date string, ensuring it's treated as local time
                const targetDate = new Date(plugin.settings.targetCompletionDate + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize today to the beginning of the day

                // Only use the date if it's valid and in the future
                if (!isNaN(targetDate.getTime()) && targetDate > today) {
                    targetDateAngle = dateToAngle(targetDate);
                    if (plugin.settings.debug) {
                        plugin.log(`[Timeline Target] Using target date: ${targetDate.toISOString().slice(0,10)}, Angle: ${targetDateAngle.toFixed(2)}`);
                    }
                } else {
                     if (plugin.settings.debug) {
                        plugin.log(`[Timeline Target] Target date ${plugin.settings.targetCompletionDate} is invalid or not in the future. Using default.`);
                     }
                }
            } catch (e) {
                if (plugin.settings.debug) {
                   plugin.log(`[Timeline Target] Error parsing target date ${plugin.settings.targetCompletionDate}. Using default. Error: ${e}`);
                }
                // Keep default angle if parsing fails
            }
        } else {
            if (plugin.settings.debug) {
                plugin.log(`[Timeline Target] No target date set. Using default 12 o'clock.`);
            }
            // Keep default angle if setting is not present
        }

        // Define radii and size (similar to estimation marker)
        // const targetTickRadius = progressRadius; // Position relative to the progress ring - REMOVED
        // const targetTickHalfLength = 8; // How far the tick extends in/out - REMOVED
        const targetTickOuterRadius = progressRadius + 5; // Match red tick outer radius
        const targetTickInnerRadius = progressRadius - 35; // Match red tick inner radius
        const targetMarkerSize = 8; // Size of the square marker

        // Draw the tick mark line
        svg += `
            <line
                x1="${formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle))}"
                y1="${formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle))}"
                x2="${formatNumber((targetTickInnerRadius+3) * Math.cos(targetDateAngle))}"
                y2="${formatNumber((targetTickInnerRadius+3) * Math.sin(targetDateAngle))}"
                class="target-date-tick"
            />
        `;

        // Draw the square marker centered on the INNER radius (to match red dot position)
        const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
        const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
        svg += `
            <rect
                x="${markerX}"
                y="${markerY}"
                width="${targetMarkerSize}"
                height="${targetMarkerSize}"
                class="target-date-marker"
            />
        `;
        // --- END: Draw Target Completion Marker ---

        // Create master subplot order before the act loop
        const masterSubplotOrder = (() => {
            // Create a combined set of all subplots from all acts
            const allSubplotsMap = new Map<string, number>();
            
            // Iterate through all acts to gather all subplots
            for (let actIndex = 0; actIndex < NUM_ACTS; actIndex++) {
                Object.entries(scenesByActAndSubplot[actIndex] || {}).forEach(([subplot, scenes]) => {
                    // Add scenes count to existing count or initialize
                    allSubplotsMap.set(subplot, (allSubplotsMap.get(subplot) || 0) + scenes.length);
                });
            }
            
            // Convert map to array of subplot objects
            const subplotCounts = Array.from(allSubplotsMap.entries()).map(([subplot, count]) => ({
                subplot,
                count
            }));

            // Sort subplots, but ensure "Main Plot" or empty subplot is first
            subplotCounts.sort((a, b) => {
                // If either subplot is "Main Plot" or empty, prioritize it
                if (a.subplot === "Main Plot" || !a.subplot) return -1;
                if (b.subplot === "Main Plot" || !b.subplot) return 1;
                // Otherwise, sort by count as before
                return b.count - a.count;
            });

            return subplotCounts.map(item => item.subplot);
        })();

        // Synopses at end to be above all other elements
        const synopsesElements: SVGGElement[] = [];
        
        // Create a Map to store grade information by sceneId (NEW)
        const sceneGrades = new Map<string, string>();
        
        scenes.forEach((scene) => {
            // Handle undefined subplot with a default "Main Plot"
            const subplot = scene.subplot || "Main Plot";
            const subplotIndex = masterSubplotOrder.indexOf(subplot);
            const ring = NUM_RINGS - 1 - subplotIndex;
            
            // Handle undefined actNumber with a default of 1
            const actNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            
            // Get the scenes for this act and subplot to determine correct index
            const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            const actIndex = sceneActNumber - 1;
            const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
            const sceneIndex = scenesInActAndSubplot.indexOf(scene);
            
            const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`; // Keep the old ID format
            
            // Extract grade from 2beats here, when we know it's available (NEW)
            if (scene["2beats"]) {
                try {
                    const firstLine2Beats = scene["2beats"].split('\n')[0]?.trim() || '';
                    // Updated regex to match "[Number] [GradeLetter] / [Comment]"
                    const gradeMatch = firstLine2Beats.match(/^(?:\d+(?:\.\d+)?\s+)?([ABC])(?![A-Za-z0-9])/i);                    if (gradeMatch && gradeMatch[1]) {
                        const grade = gradeMatch[1].toUpperCase();
                        // Store the grade in our Map
                        sceneGrades.set(sceneId, grade);
                    }
                } catch (e) {
                    plugin.log(`[ERROR][EarlyGradeExtract] Error extracting grade: ${e}`);
                }
            }
            
            // Skip content generation for placeholder scenes
            if (!scene.title) {
                return;
            }
            
            // Find all subplots this scene belongs to
            const allSceneSubplots = scenes
                .filter(s => s.path === scene.path)
                .map(s => s.subplot);

            // Reorder subplots to put the current ring's subplot first
            const orderedSubplots = [
                scene.subplot,
                ...allSceneSubplots.filter(s => s !== scene.subplot)
            ];
            
            // Prepare text content with modified format
            const contentLines = [
                // Format title and date on same line with spacing
                plugin.highlightSearchTerm(`${scene.title}   ${scene.when?.toLocaleDateString() || ''}`),
                // For Plot notes, use Description field; for Scene notes, use synopsis
                ...(scene.itemType === "Plot" && scene.Description
                    ? plugin
                        .splitIntoBalancedLines(scene.Description, maxTextWidth)
                        .map((lineStr: string) => plugin.highlightSearchTerm(lineStr))
                    : scene.synopsis
                    ? plugin
                        .splitIntoBalancedLines(scene.synopsis, maxTextWidth)
                        .map((lineStr: string) => plugin.highlightSearchTerm(lineStr))
                    : []),
                '\u00A0', // Separator
            ];
            
            // Only add subplots and characters for Scene notes, not Plot notes
            if (scene.itemType !== "Plot") {
                // --- Subplots --- 
                // Remove the loop generating subplotsHtml
                // Just push the raw subplot string (or empty string if none)
                const rawSubplots = orderedSubplots.join(', ');
                contentLines.push(rawSubplots);
                
                // --- Characters ---
                // Remove the loop generating charactersHtml
                // Just push the raw character string (or empty string if none)
                const rawCharacters = (scene.Character || []).join(', ');
                contentLines.push(rawCharacters);
            }
            
            // Filter out empty lines AFTER generating raw strings
            const filteredContentLines = contentLines.filter(line => line && line.trim() !== '\u00A0');
            
            // Generate the synopsis element using our new DOM-based method
            // This will now always receive raw text for subplots/characters
            const synopsisElement = plugin.synopsisManager.generateElement(scene, filteredContentLines, sceneId);
            synopsesElements.push(synopsisElement);
        });

        // Draw scenes and dummy scenes (existing code remains as is)
        for (let act = 0; act < NUM_ACTS; act++) {
            const totalRings = NUM_RINGS;
            const subplotCount = masterSubplotOrder.length;
            const ringsToUse = Math.min(subplotCount, totalRings);

            for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
                const ring = totalRings - ringOffset - 1; // Start from the outermost ring
                
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                
                const startAngle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((act + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                
                // Use the subplot from the master order instead of the current act's order
                const subplot = masterSubplotOrder[ringOffset];

                if (subplot) {
                    const currentScenes = scenesByActAndSubplot[act][subplot] || [];

                    if (currentScenes && currentScenes.length > 0) {
                        // Separate Plot notes and Scene notes for different sizing
                        const plotNotes = currentScenes.filter(scene => scene.itemType === "Plot");
                        const sceneNotes = currentScenes.filter(scene => scene.itemType !== "Plot");
                        
                        // Calculate 10px angular width for Plot notes using middle radius of ring
                        const middleRadius = (innerR + outerR) / 2;
                        const plotAngularWidth = 10 / middleRadius; // 10px converted to radians
                        
                        // Calculate remaining angular space after Plot notes
                        const totalAngularSpace = endAngle - startAngle;
                        const plotTotalAngularSpace = plotNotes.length * plotAngularWidth;
                        const remainingAngularSpace = totalAngularSpace - plotTotalAngularSpace;
                        
                        // Calculate angular size for Scene notes (divide remaining space)
                        const sceneAngularSize = sceneNotes.length > 0 ? remainingAngularSpace / sceneNotes.length : 0;
                        
                        // Create position mapping for all scenes in manuscript order
                        let currentAngle = startAngle;
                        const scenePositions = new Map();
                        
                        currentScenes.forEach((scene, idx) => {
                            if (scene.itemType === "Plot") {
                                scenePositions.set(idx, {
                                    startAngle: currentAngle,
                                    endAngle: currentAngle + plotAngularWidth,
                                    angularSize: plotAngularWidth
                                });
                                currentAngle += plotAngularWidth;
                            } else {
                                scenePositions.set(idx, {
                                    startAngle: currentAngle,
                                    endAngle: currentAngle + sceneAngularSize,
                                    angularSize: sceneAngularSize
                                });
                                currentAngle += sceneAngularSize;
                            }
                        });
            
                        currentScenes.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '');
                            const position = scenePositions.get(idx);
                            const sceneStartAngle = position.startAngle;
                            const sceneEndAngle = position.endAngle;
                            // Position text 2px from the top boundary of the cell
                            const textPathRadius = outerR - 25;
            
                            // Determine the color of a scene based on its status and due date
                            const color = (() => {
                                // Handle Plot notes with graduated shades from dark to light of the current max publish stage color
                                if (scene.itemType === "Plot") {
                                    // Use the max stage color as the base hue (already calculated above)
                                    const baseColor = maxStageColor;
                                    
                                    // Count total Plot notes to determine shade distribution
                                    const allPlotNotes = scenes.filter(s => s.itemType === "Plot");
                                    const totalPlots = allPlotNotes.length;
                                    
                                    if (totalPlots === 0) return baseColor;
                                    
                                    // Find this plot's index in the ordered list
                                    const plotIndex = allPlotNotes.findIndex(p => p.title === scene.title && p.actNumber === scene.actNumber);
                                    
                                    // Create a range from dark to light: -40% (dark) to +40% (light)
                                    const maxAdjustment = 40;
                                    const adjustmentRange = maxAdjustment * 2; // Total range: 80%
                                    
                                    // Calculate position: 0 = darkest, 1 = lightest
                                    const position = totalPlots > 1 ? plotIndex / (totalPlots - 1) : 0.5;
                                    
                                    // Map position to adjustment: -40% to +40%
                                    const adjustment = (position * adjustmentRange) - maxAdjustment;
                                    
                                    // Apply darkening or lightening based on adjustment value
                                    if (adjustment < 0) {
                                        // Darken the color
                                        return plugin.darkenColor(baseColor, Math.abs(adjustment));
                                    } else {
                                        // Lighten the color
                                        return plugin.lightenColor(baseColor, adjustment);
                                    }
                                }
                                
                                const statusList = Array.isArray(scene.status) ? scene.status : [scene.status];
                                const normalizedStatus = statusList[0]?.toString().trim().toLowerCase() || '';
                                
                                // Get the publish stage for pattern selection
                                const publishStage = scene["Publish Stage"] || 'Zero';
                                
                                // If status is empty/undefined/null, treat it as "Todo" with plaid pattern
                                if (!normalizedStatus || normalizedStatus === '') {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                if (normalizedStatus === "complete") {
                                    // For completed scenes, use Publish Stage color with full opacity
                                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                                    // Do not apply any modifications to the color to ensure it matches the legend
                                    return stageColor;
                                }
                                
                                // Check due date before checking working/todo
                                if (scene.due) {
                                    const originalDueString = scene.due;
                                    const parts = originalDueString.split('-').map(Number);

                                    // Ensure we have valid parts before proceeding
                                    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                        const dueYear = parts[0];
                                        const dueMonth = parts[1] - 1; // Convert 1-based month
                                        const dueDay = parts[2];
                                        
                                        const today = new Date();
                                        const todayYear = today.getFullYear();
                                        const todayMonth = today.getMonth();
                                        const todayDay = today.getDate();
                                        
                                        // Compare dates by parts - overdue only if date is strictly before today
                                        let isOverdue = false;
                                        if (dueYear < todayYear) {
                                            isOverdue = true;
                                        } else if (dueYear === todayYear) {
                                            if (dueMonth < todayMonth) {
                                                isOverdue = true;
                                            } else if (dueMonth === todayMonth) {
                                                if (dueDay < todayDay) {
                                                    isOverdue = true;
                                                }
                                                // Same day is NOT overdue
                                            }
                                        }
                                
                                        
                                        if (isOverdue) {
                                            return STATUS_COLORS.Due; // Return Due color if overdue
                                        }
                                    } else {
                                        // Handle invalid date format
                                        if (plugin.settings.debug) {
                                            console.warn(`WARN: Invalid date format for scene color: ${originalDueString}`);
                                        }
                                    }
                                }
                                
                                // If not overdue (or no due date), check for working/todo status
                                if (normalizedStatus === "working") {
                                    return `url(#plaidWorking${publishStage})`;
                                }
                                if (normalizedStatus === "todo") {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                // Fallback to other status colors or Todo
                                return STATUS_COLORS[statusList[0] as keyof typeof STATUS_COLORS] || STATUS_COLORS.Todo;
                            })();
            
                        
                            // Construct the arc path for the scene
                            const arcPath = `
                                M ${formatNumber(innerR * Math.cos(sceneStartAngle))} ${formatNumber(innerR * Math.sin(sceneStartAngle))}
                                L ${formatNumber(outerR * Math.cos(sceneStartAngle))} ${formatNumber(outerR * Math.sin(sceneStartAngle))}
                                A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(sceneEndAngle))} ${formatNumber(outerR * Math.sin(sceneEndAngle))}
                                L ${formatNumber(innerR * Math.cos(sceneEndAngle))} ${formatNumber(innerR * Math.sin(sceneEndAngle))}
                                A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(sceneStartAngle))} ${formatNumber(innerR * Math.sin(sceneStartAngle))}
                            `;
            
                            const sceneId = `scene-path-${act}-${ring}-${idx}`;
            
                            // Apply appropriate CSS classes based on open status and search match
                            let sceneClasses = "scene-path";
                            if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += " scene-is-open";
                            // Don't add search-result class to scene paths anymore
            
                            // In createTimelineSVG method, replace the font size calculation with a fixed size:
                            const fontSize = 18; // Fixed font size for all rings
                            const dyOffset = -1;
            
                            svg += `
                            <g class="scene-group" data-path="${scene.path ? encodeURIComponent(scene.path) : ''}" id="scene-group-${act}-${ring}-${idx}">
                                <path id="${sceneId}"
                                      d="${arcPath}" 
                                      fill="${color}" 
                                      stroke="white" 
                                      stroke-width="1" 
                                      class="${sceneClasses}"/>

                                <!-- Scene title path (using only the text part) - Skip for Plot notes -->
                                ${scene.itemType !== "Plot" ? `
                                <path id="textPath-${act}-${ring}-${idx}" 
                                      d="M ${formatNumber(textPathRadius * Math.cos(sceneStartAngle + 0.02))} ${formatNumber(textPathRadius * Math.sin(sceneStartAngle + 0.02))} 
                                         A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 0 1 ${formatNumber(textPathRadius * Math.cos(sceneEndAngle))} ${formatNumber(textPathRadius * Math.sin(sceneEndAngle))}" 
                                      fill="none"/>
                                <text class="scene-title scene-title-${fontSize <= 10 ? 'small' : (fontSize <= 12 ? 'medium' : 'large')}${scene.path && plugin.openScenePaths.has(scene.path) ? ' scene-is-open' : ''}" dy="${dyOffset}" data-scene-id="${sceneId}">
                                    <textPath href="#textPath-${act}-${ring}-${idx}" startOffset="4">
                                        ${text}
                                    </textPath>
                                </text>` : ''}
                            </g>`;
                        });
                        
                        // Fill any remaining angular space with gray void cells
                        const totalUsedSpace = plotNotes.length * plotAngularWidth + sceneNotes.length * sceneAngularSize;
                        const remainingVoidSpace = totalAngularSpace - totalUsedSpace;
                        
                        if (remainingVoidSpace > 0.001) { // Small threshold to avoid floating point errors
                            const voidStartAngle = startAngle + totalUsedSpace;
                            const voidEndAngle = endAngle;
                            
                            // Create void cell to fill remaining space
                            const voidArcPath = `
                                M ${formatNumber(innerR * Math.cos(voidStartAngle))} ${formatNumber(innerR * Math.sin(voidStartAngle))}
                                L ${formatNumber(outerR * Math.cos(voidStartAngle))} ${formatNumber(outerR * Math.sin(voidStartAngle))}
                                A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(voidEndAngle))} ${formatNumber(outerR * Math.sin(voidEndAngle))}
                                L ${formatNumber(innerR * Math.cos(voidEndAngle))} ${formatNumber(innerR * Math.sin(voidEndAngle))}
                                A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(voidStartAngle))} ${formatNumber(innerR * Math.sin(voidStartAngle))}
                            `;
                            
                            svg += `<path d="${voidArcPath}" class="void-cell"/>`;
                        }
                    } else {
                        // Empty subplot ring - but Plot notes should still appear here
                        // Get Plot notes that should appear in this subplot
                        const plotNotesInSubplot = scenes.filter(s => s.itemType === "Plot" && s.subplot === subplot);
                        
                        if (plotNotesInSubplot.length > 0) {
                            // Calculate space for Plot notes in empty ring
                            const middleRadius = (innerR + outerR) / 2;
                            const plotAngularWidth = 10 / middleRadius;
                            const totalPlotSpace = plotNotesInSubplot.length * plotAngularWidth;
                            const remainingSpace = (endAngle - startAngle) - totalPlotSpace;
                            
                            // Position Plot notes
                            let currentAngle = startAngle;
                            plotNotesInSubplot.forEach((plotNote, idx) => {
                                const plotStartAngle = currentAngle;
                                const plotEndAngle = currentAngle + plotAngularWidth;
                                
                                // Get Plot note color (reuse the color logic)
                                const allPlotNotes = scenes.filter(s => s.itemType === "Plot");
                                const plotIndex = allPlotNotes.findIndex(p => p.title === plotNote.title && p.actNumber === plotNote.actNumber);
                                const totalPlots = allPlotNotes.length;
                                const maxAdjustment = 40;
                                const adjustmentRange = maxAdjustment * 2;
                                const position = totalPlots > 1 ? plotIndex / (totalPlots - 1) : 0.5;
                                const adjustment = (position * adjustmentRange) - maxAdjustment;
                                
                                const plotColor = adjustment < 0 
                                    ? plugin.darkenColor(maxStageColor, Math.abs(adjustment))
                                    : plugin.lightenColor(maxStageColor, adjustment);
                                
                                const plotArcPath = `
                                    M ${formatNumber(innerR * Math.cos(plotStartAngle))} ${formatNumber(innerR * Math.sin(plotStartAngle))}
                                    L ${formatNumber(outerR * Math.cos(plotStartAngle))} ${formatNumber(outerR * Math.sin(plotStartAngle))}
                                    A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(plotEndAngle))} ${formatNumber(outerR * Math.sin(plotEndAngle))}
                                    L ${formatNumber(innerR * Math.cos(plotEndAngle))} ${formatNumber(innerR * Math.sin(plotEndAngle))}
                                    A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(plotStartAngle))} ${formatNumber(innerR * Math.sin(plotStartAngle))}
                                `;
                                
                                const sceneId = `scene-path-${act}-${ring}-${idx}`;
                                svg += `
                                <g class="scene-group" data-path="${plotNote.path ? encodeURIComponent(plotNote.path) : ''}" id="scene-group-${act}-${ring}-${idx}">
                                    <path id="${sceneId}"
                                          d="${plotArcPath}" 
                                          fill="${plotColor}" 
                                          stroke="white" 
                                          stroke-width="1" 
                                          class="scene-path"/>
                                </g>`;
                                
                                currentAngle += plotAngularWidth;
                            });
                            
                            // Fill remaining space with void cell
                            if (remainingSpace > 0.001) {
                                const voidArcPath = `
                                    M ${formatNumber(innerR * Math.cos(currentAngle))} ${formatNumber(innerR * Math.sin(currentAngle))}
                                    L ${formatNumber(outerR * Math.cos(currentAngle))} ${formatNumber(outerR * Math.sin(currentAngle))}
                                    A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
                                    L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
                                    A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(currentAngle))} ${formatNumber(innerR * Math.sin(currentAngle))}
                                `;
                                
                                svg += `<path d="${voidArcPath}" class="void-cell"/>`;
                            }
                        } else {
                            // Completely empty ring - fill with single void cell
                            const voidArcPath = `
                                M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                                L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
                                A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
                                L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
                                A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                            `;
                            
                            svg += `<path d="${voidArcPath}" class="void-cell"/>`;
                        }
                    }
                } else {
                    // Empty subplot code
                    const arcPath = `
                        M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                        L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
                        A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
                        L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                        A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                    `;
                    svg += `<path d="${arcPath}" class="void-cell"/>`;
                }
            }
        }

        // After all scenes are drawn, add just the act borders (vertical lines only)
        for (let act = 0; act < NUM_ACTS; act++) {
            const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
            
            // Draw only the vertical line (y-axis spoke) for each act boundary
            svg += `<line 
                x1="${formatNumber(innerRadius * Math.cos(angle))}" 
                y1="${formatNumber(innerRadius * Math.sin(angle))}"
                x2="${formatNumber(outerRadius * Math.cos(angle))}" 
                y2="${formatNumber(outerRadius * Math.sin(angle))}"
                class="act-border"
            />`;
        }

        // Calculate the actual outermost outerRadius (first ring's outer edge)
        const actualOuterRadius = ringStartRadii[NUM_RINGS - 1] + ringWidths[NUM_RINGS - 1];
       
        // Remove the old act code and replace it with this new version:
        for (let act = 0; act < NUM_ACTS; act++) {
            // Calculate angle for each act's starting position
            const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
            
            // Position labels slightly to the left of the vertical borders
            const actLabelRadius = actualOuterRadius + 14;
            const angleOffset = -0.085; // Positive offset moves text clockwise
            
            // Calculate start and end angles for the curved path
            const startAngle = angle + angleOffset;
            const endAngle = startAngle + (Math.PI / 12); // Reduced arc length
            
            const actPathId = `actPath-${act}`;
            
            // Create the curved path for act label
            svg += `
                <path id="${actPathId}"
                    d="
                        M ${formatNumber(actLabelRadius * Math.cos(startAngle))} ${formatNumber(actLabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(actLabelRadius)} ${formatNumber(actLabelRadius)} 0 0 1 ${formatNumber(actLabelRadius * Math.cos(endAngle))} ${formatNumber(actLabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
                <text class="act-label" fill="${maxStageColor}"> <!-- Use overall maxStageColor -->
                    <textPath href="#${actPathId}" startOffset="0" text-anchor="start">
                        ACT ${act + 1}
                    </textPath>
                </text>
            `;
        }

        // Add color key with decorative elements
        const keyX = size/2 - 200; // Position from right edge
        const keyY = -size/2 + 50; // Position from top
        const swatchSize = 20;
        const textOffset = 30;
        const lineHeight = 26; // Reduced for tighter spacing

        // Calculate the number of scenes for each status using a Set to track unique scenes
        const processedScenes = new Set<string>(); // Track scenes by their path
        const statusCounts = scenes.reduce((acc, scene) => {
            // Skip if we've already processed this scene
            if (scene.path && processedScenes.has(scene.path)) {
                return acc;
            }
            
            // Mark scene as processed
            if (scene.path) {
                processedScenes.add(scene.path);
            }
            
            const normalizedStatus = scene.status?.toString().trim().toLowerCase() || '';
            
            // If status is empty/undefined/null, count it as "Todo"
            if (!normalizedStatus || normalizedStatus === '') {
                acc["Todo"] = (acc["Todo"] || 0) + 1;
                return acc;
            }
            
            if (normalizedStatus === "complete") {
                // For completed scenes, count by Publish Stage
                const publishStage = scene["Publish Stage"] || 'Zero';
                // Use the publishStage directly with type safety
                const validStage = publishStage as keyof typeof PUBLISH_STAGE_COLORS;
                acc[validStage] = (acc[validStage] || 0) + 1;
            } else if (scene.due) {
                 // Parse date directly from string components
                const originalDueString = scene.due;
                const parts = originalDueString.split('-').map(Number);

                // Ensure we have valid parts before proceeding
                if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                    const dueYear = parts[0];
                    const dueMonth = parts[1] - 1; // Convert 1-based month
                    const dueDay = parts[2];
                    
                    // Get today's date parts
                    const today = new Date();
                    const todayYear = today.getFullYear();
                    const todayMonth = today.getMonth();
                    const todayDay = today.getDate();
                    
                    // Compare dates by parts - overdue only if date is strictly before today
                    let isOverdue = false;
                    if (dueYear < todayYear) {
                        isOverdue = true;
                    } else if (dueYear === todayYear) {
                        if (dueMonth < todayMonth) {
                            isOverdue = true;
                        } else if (dueMonth === todayMonth) {
                            if (dueDay < todayDay) {
                                isOverdue = true;
                            }
                            // Same day is NOT overdue
                        }
                    }
                    
                    if (isOverdue) {
                        // Non-complete scenes that are past due date are counted as Due
                        acc["Due"] = (acc["Due"] || 0) + 1;
                    } else {
                        // For files due today or in the future, count them by their status
                        let statusKey = "Todo"; // Default to Todo
                        if (scene.status) {
                            if (Array.isArray(scene.status) && scene.status.length > 0) {
                                statusKey = String(scene.status[0]);
                            } else if (typeof scene.status === 'string') {
                                statusKey = scene.status;
                            }
                        }
                        acc[statusKey] = (acc[statusKey] || 0) + 1;
                    }
                } else {
                    // Handle invalid date format
                    if (plugin.settings.debug) {
                        console.warn(`WARN: Invalid date format in status count: ${originalDueString}`);
                    }
                    // Count scenes with invalid due dates by status
                    let statusKey = "Todo"; 
                    if (scene.status) {
                        if (Array.isArray(scene.status) && scene.status.length > 0) {
                            statusKey = String(scene.status[0]);
                        } else if (typeof scene.status === 'string') {
                            statusKey = scene.status;
                        }
                    }
                    acc[statusKey] = (acc[statusKey] || 0) + 1;
                }
            } else {
                // All other scenes (no due date) are counted by their status
                let statusKey = "Todo"; // Default to Todo
                if (scene.status) {
                    if (Array.isArray(scene.status) && scene.status.length > 0) {
                        statusKey = String(scene.status[0]);
                    } else if (typeof scene.status === 'string') {
                        statusKey = scene.status;
                    }
                }
                acc[statusKey] = (acc[statusKey] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        // Save status counts for completion estimate
        plugin.latestStatusCounts = statusCounts;

        // Add center color key
        const centerRadius = innerRadius * 0.7; // Slightly smaller than innerRadius
        const centerKeySize = 20; // Size of color swatches
        const centerLineHeight = 35;

        // Separate stage colors and status colors
        const stageColorEntries = Object.entries(PUBLISH_STAGE_COLORS);
        const statusColorEntries = Object.entries(STATUS_COLORS)
            .filter(([status]) => status !== 'Empty' && status !== 'Complete');

        // Calculate heights for alignment
        const maxEntries = Math.max(stageColorEntries.length, statusColorEntries.length);
        const totalHeight = maxEntries * centerLineHeight;
        const startY = -totalHeight / 2 + centerLineHeight / 2;

        svg += `
            <g class="color-key-center">
            <!-- Stage colors column (left) ZERO AUTHOR HOUSE PUBLISH -->
                ${stageColorEntries.map(([stage, color], index) => {
                    const yPos = startY + (index * centerLineHeight);
                    return `
                        <g transform="translate(-25, ${yPos})">
                            <!-- Stage label with right justification -->
                            <text 
                                x="-10" 
                                y="0" 
                                dominant-baseline="middle" 
                                text-anchor="end"
                                class="center-key-text"
                            ><tspan>${stage.toUpperCase()}</tspan><tspan dx="0.0em" class="status-count" dy="-7" baseline-shift="super">${statusCounts[stage] || 0}</tspan></text>
                            
                            <!-- Color SWATCH to the right of text -->
                            <rect 
                                x="-3" 
                                y="-13" 
                                width="25" 
                                height="25" 
                                fill="${color}"
                            />
                        </g>
                    `;
                }).join('')}

                <!-- Status colors column (right) -->
                ${statusColorEntries.map(([status, color], index) => {
                    const yPos = startY + (index * centerLineHeight);
                    
                    // Check if this has a special pattern (Working, Todo, or Complete)
                    const hasSpecialPattern = status === 'Working' || status === 'Todo';
                    let fillValue;
                    
                    if (hasSpecialPattern) {
                        fillValue = `url(#plaid${status}Zero)`;
                    } else {
                        fillValue = color;
                    }
                    
                    return `
                        <g transform="translate(25, ${yPos})">
                            <!-- Color SWATCH first (left) -->
                            <rect 
                                x="-20" 
                                y="-13" 
                                width="25" 
                                height="25" 
                                fill="${fillValue}"
                            />
                            
                            <!-- Status label with left justification LEGEND WORKING TODO DUE -->
                            <text 
                                x="10" 
                                y="0" 
                                dominant-baseline="middle" 
                                text-anchor="start"
                                class="center-key-text"
                            ><tspan class="status-count" dy="-7" baseline-shift="super" dx="-0.15em">${statusCounts[status] || 0}</tspan><tspan dy="7">${status.toUpperCase()}</tspan></text>
                        </g>
                    `;
                }).join('')}
            </g>
        `;

        // First, add the background layer with subplot labels
        // --- START: Subplot Label Generation ---
        // Wrap subplot labels in a background layer for proper z-index
        svg += `<g class="background-layer">`;
        
        // Only show subplot labels in Act 3 (top position)
        const act = 3; // Act 3 is at the top (12 o'clock)
        const totalRings = NUM_RINGS;
        const subplotCount = masterSubplotOrder.length;
        const ringsToUse = Math.min(subplotCount, totalRings);
        
        for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
            const ring = totalRings - ringOffset - 1; // Start from the outermost ring
            const subplot = masterSubplotOrder[ringOffset];
            
            // Skip empty subplots
            if (!subplot) continue;
            
            const innerR = ringStartRadii[ring];
            const outerR = innerR + ringWidths[ring];
            
            // Create a unique ID for the label path
            const labelPathId = `subplot-label-path-${ring}`;
            const labelRadius = (innerR + outerR) / 2; // Center of the ring
            
            // Calculate available height for text (y-axis distance)
            const availableHeight = ringWidths[ring];
            
            // Calculate dynamic font size based on available height
            // Use 95% of available height to fill more space
            const fontSize = Math.floor(availableHeight * 0.95);
            
            // Define arc to END at 270 degrees (12 o'clock) for right justification start
            // Use 90 degrees for the arc length to span Act 3
            const arcLength = Math.PI / 2; // 90 degrees span
            const endAngle = -Math.PI / 2; // End at 12 o'clock position
            const startAngle = endAngle - arcLength; // Start 90 degrees earlier (180 deg)
            
            // Calculate the actual length of the arc path in pixels
            const arcPixelLength = labelRadius * arcLength; 
            
            // Ensure subplot text is properly escaped
            const safeSubplotText = plugin.safeSvgText(subplot.toUpperCase());
            
            // Create the path for the label - Add data-font-size attribute instead of inline style
            svg += `
                <g class="subplot-label-group" data-font-size="${fontSize}">
                    <path id="${labelPathId}"
                        d="M ${formatNumber(labelRadius * Math.cos(startAngle))} ${formatNumber(labelRadius * Math.sin(startAngle))}
                        A ${formatNumber(labelRadius)} ${formatNumber(labelRadius)} 0 0 1 
                        ${formatNumber(labelRadius * Math.cos(endAngle))} ${formatNumber(labelRadius * Math.sin(endAngle))}"
                        class="subplot-ring-label-path"
                    />
                    <text class="subplot-label-text">
                        <textPath href="#${labelPathId}" startOffset="100%" text-anchor="end"
                                textLength="${arcPixelLength}" lengthAdjust="spacingAndGlyphs">
                            ${safeSubplotText}
                        </textPath>
                    </text>
                </g>
            `;
        }
        
        // Close the background layer group
        svg += `</g>`;
        // --- END: Subplot Label Generation ---

        // Add number squares after background layer but before synopses
        svg += `<g class="number-squares">`;
        scenes.forEach((scene) => {
            // Skip number squares for Plot notes
            if (scene.itemType === "Plot") {
                return;
            }
            
            const { number } = parseSceneTitle(scene.title || '');
            if (number) {
                const subplot = scene.subplot || "Main Plot";
                const subplotIndex = masterSubplotOrder.indexOf(subplot);
                const ring = NUM_RINGS - 1 - subplotIndex;
                
                // Get the scenes for this act and subplot to determine correct index
                const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
                const actIndex = sceneActNumber - 1;
                const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
                const sceneIndex = scenesInActAndSubplot.indexOf(scene);
                
                const startAngle = (actIndex * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((actIndex + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                
                // Use the same positioning logic as scene rendering
                const plotNotes = scenesInActAndSubplot.filter(s => s.itemType === "Plot");
                const sceneNotes = scenesInActAndSubplot.filter(s => s.itemType !== "Plot");
                
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                const middleRadius = (innerR + outerR) / 2;
                const plotAngularWidth = 10 / middleRadius;
                
                const totalAngularSpace = endAngle - startAngle;
                const plotTotalAngularSpace = plotNotes.length * plotAngularWidth;
                const remainingAngularSpace = totalAngularSpace - plotTotalAngularSpace;
                const sceneAngularSize = sceneNotes.length > 0 ? remainingAngularSpace / sceneNotes.length : 0;
                
                // Calculate this scene's position
                let currentAngle = startAngle;
                let sceneStartAngle = startAngle;
                
                for (let i = 0; i < sceneIndex; i++) {
                    const sceneAtIndex = scenesInActAndSubplot[i];
                    if (sceneAtIndex.itemType === "Plot") {
                        currentAngle += plotAngularWidth;
                    } else {
                        currentAngle += sceneAngularSize;
                    }
                }
                sceneStartAngle = currentAngle;
                
                const textPathRadius = (ringStartRadii[ring] + (ringStartRadii[ring] + ringWidths[ring])) / 2;
                
                // Reuse the existing square size calculation
                const getSquareSize = (num: string): { width: number, height: number } => {
                    const height = 18;
                    if (num.includes('.')) {
                        return {
                            width: num.length <= 3 ? 24 :
                                    num.length <= 4 ? 32 :
                                    36,
                            height: height
                        };
                    } else {
                        return {
                            width: num.length === 1 ? 20 :
                                    num.length === 2 ? 24 :
                                    28,
                            height: height
                        };
                    }
                };

                const squareSize = getSquareSize(number);
                const squareX = textPathRadius * Math.cos(sceneStartAngle) + 2;
                const squareY = textPathRadius * Math.sin(sceneStartAngle) + 2;
          
                // Store scene number information for square and synopsis
                const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
                sceneNumbersMap.set(sceneId, {
                    number,
                    x: squareX,
                    y: squareY,
                    width: squareSize.width,
                    height: squareSize.height
                });

                // Determine colors based on Edits metadata
                const hasEdits = scene.pendingEdits && scene.pendingEdits.trim() !== '';

                // Check if scene is open or a search result
                const isSceneOpen = scene.path && plugin.openScenePaths.has(scene.path);
                const isSearchMatch = plugin.searchActive && scene.path && plugin.searchResults.has(scene.path);

                // Declare base classes first
                let squareClasses = "number-square";
                if (isSceneOpen) squareClasses += " scene-is-open";
                if (isSearchMatch) squareClasses += " search-result";

                // Get grade from our Map instead of trying to extract it again
                const grade = sceneGrades.get(sceneId);
                if (grade) {
                    // Log grade information when in debug mode
                    if (plugin.settings.debug) {
                        plugin.log(`[GradeDebug] Found grade ${grade} for scene ${sceneId}`);
                    }
                }
                
                // Add the main group for the square and text
                svg += `
                    <g transform="translate(${squareX}, ${squareY})">
                        <rect 
                            x="-${squareSize.width/2}" 
                            y="-${squareSize.height/2}" 
                            width="${squareSize.width}" 
                            height="${squareSize.height}" 
                            fill="white"
                            class="${squareClasses}${hasEdits ? ' has-edits' : ''}" 
                            data-scene-id="${escapeXml(sceneId)}"
                        />
                        <text 
                            x="0" 
                            y="0" 
                            text-anchor="middle" 
                            dominant-baseline="middle" 
                            class="number-text${isSceneOpen ? ' scene-is-open' : ''}${isSearchMatch ? ' search-result' : ''}${hasEdits ? ' has-edits' : ''}"
                            data-scene-id="${escapeXml(sceneId)}"
                            dy="0.1em"
                            fill="black"
                        >${number}</text>
                    </g>
                `;

                // Add the grade line separately if a grade exists
                if (grade) {
                    const lineOffset = 2; // Offset from the edge of the rect
                    const lineX1 = squareX - squareSize.width / 2;
                    const lineY1 = squareY + squareSize.height / 2 + lineOffset;
                    const lineX2 = squareX + squareSize.width / 2;
                    const lineY2 = lineY1; // Horizontal line

                    // Log positioning data when in debug mode
                    if (plugin.settings.debug) {
                        plugin.log(`[GradeDebug] Adding grade line for ${sceneId} at position: x1=${lineX1}, y1=${lineY1}, x2=${lineX2}, y2=${lineY2}`);
                    }

                    svg += `
                        <line 
                            x1="${lineX1}" y1="${lineY1}" 
                            x2="${lineX2}" y2="${lineY2}" 
                            class="grade-border-line grade-${grade}" 
                            data-scene-id="${escapeXml(sceneId)}" 
                            stroke-width="2"
                        />
                    `;
                }
            }
        });
        svg += `</g>`;
        
        // Create container for all synopses
        const synopsesContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        synopsesContainer.setAttribute("class", "synopses-container");

        // Add all synopsis elements to the container
        synopsesElements.forEach(element => {
            synopsesContainer.appendChild(element);
        });

        // Serialize the synopses container to SVG string
        const serializer = new XMLSerializer();
        const synopsesHTML = serializer.serializeToString(synopsesContainer);

        // Then add the synopses on top
        svg += synopsesHTML;

        // Add JavaScript to handle synopsis visibility
        const scriptSection = `
        <script><![CDATA[
            document.querySelectorAll('.scene-group').forEach(sceneGroup => {
                const scenePathElement = sceneGroup.querySelector('.scene-path');
                if (!scenePathElement) return; // Skip if no path element found

                const sceneId = scenePathElement.id;
                const synopsis = document.querySelector(\`.scene-info[data-for-scene="\${sceneId}"]\`);
                const gradeLine = document.querySelector(\`.grade-border-line[data-scene-id="\${sceneId}"]\`); // Find the grade line

                sceneGroup.addEventListener('mouseenter', () => {
                    if (synopsis) {
                        synopsis.classList.add('visible');
                    }
                });

                sceneGroup.addEventListener('mouseleave', () => {
                    if (synopsis) {
                        synopsis.classList.remove('visible');
                    }
                    if (gradeLine) { // Check if grade line exists
                        gradeLine.classList.add('non-selected'); // Add non-selected on mouse out
                    }
                });
            });
        ]]></script>`;

        // Add debug coordinate display
        if (plugin.settings.debug) {
            svg += `
                <g class="debug-info-container svg-interaction"><!-- SAFE: class-based SVG interaction -->
                    <rect class="debug-info-background" x="-790" y="-790" width="230" height="40" rx="5" ry="5" fill="rgba(255,255,255,0.9)" stroke="#333333" stroke-width="1" />
                    <text class="debug-info-text" id="mouse-coords-text" x="-780" y="-765" fill="#ff3300" font-size="20px" font-weight="bold" stroke="white" stroke-width="0.5px" paint-order="stroke">Mouse: X=0, Y=0</text>
                </g>
                <script><![CDATA[
                    (function() {
                        // Wait for DOM to be ready
                        window.addEventListener('DOMContentLoaded', function() {
                            console.log("Setting up mouse coordinate tracking");
                            
                            // Get SVG element and coordinate text
                            const svg = document.querySelector('.manuscript-timeline-svg');
                            const coordText = document.getElementById('mouse-coords-text');
                            
                            if (!svg || !coordText) {
                                console.error("Couldn't find SVG or coordinate text element");
                                return;
                            }
                            
                            // Add mousemove handler to the main SVG element
                            svg.addEventListener('mousemove', function(e) {
                                try {
                                    const pt = svg.createSVGPoint();
                                    pt.x = e.clientX;
                                    pt.y = e.clientY;
                                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                                    coordText.textContent = 'Mouse: X=' + Math.round(svgP.x) + ', Y=' + Math.round(svgP.y);
                                } catch (err) {
                                    console.error("Error calculating coordinates:", err);
                                }
                            });
                            
                            // Also log coordinates on click
                            svg.addEventListener('click', function(e) {
                                try {
                                    const pt = svg.createSVGPoint();
                                    pt.x = e.clientX;
                                    pt.y = e.clientY;
                                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                                    console.log('Clicked at:', Math.round(svgP.x), Math.round(svgP.y));
                                } catch (err) {
                                    console.error("Error calculating coordinates:", err);
                                }
                            });
                            
                            console.log("Mouse coordinate tracking initialized");
                        });
                    })();
                ]]></script>
            `;
        }

        // If not in debug mode, close SVG normally
        svg += `${scriptSection}</svg>`;

        const generatedSvgString = svg; // Assuming svg holds the final string

        // Find the max stage color (assuming maxStageColor variable exists here)
        // const maxStageColor = ... // Needs to be defined/calculated earlier

        // Return both the string and the color
        return { svgString: generatedSvgString, maxStageColor: maxStageColor };
    }