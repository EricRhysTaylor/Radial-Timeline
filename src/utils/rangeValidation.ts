/*
 * Range Validation Utilities for Gossamer Beats
 */

export interface RangeValidationResult {
  valid: boolean;
  missingRangeBeats: string[];
  totalBeats: number;
}

/**
 * Parse a Range field from beat note frontmatter
 * Examples: "0-20", "50", "71-90"
 * Returns { min, max } or null if invalid
 */
export function parseRange(rangeStr: string | undefined): { min: number; max: number } | null {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  
  const cleaned = rangeStr.trim();
  
  // Single number: "50" → { min: 50, max: 50 }
  if (/^\d+$/.test(cleaned)) {
    const value = parseInt(cleaned, 10);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      return { min: value, max: value };
    }
    return null;
  }
  
  // Range: "0-20" or "71-90"
  const match = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
  if (match) {
    const min = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);
    
    if (!isNaN(min) && !isNaN(max) && min >= 0 && max <= 100 && min <= max) {
      return { min, max };
    }
  }
  
  return null;
}

/**
 * Check if a score is within the ideal range
 */
export function isScoreInRange(score: number, range: { min: number; max: number }): boolean {
  return score >= range.min && score <= range.max;
}

/**
 * Validate that all beat notes have valid Range field
 * Filters by Beat Model if specified, but ignores title matching
 * Returns validation result with list of beats missing Range
 */
export function validateBeatRanges(
  scenes: Array<{ 
    itemType?: string; 
    title?: string; 
    Range?: string;
    "Beat Model"?: string;
  }>,
  selectedBeatSystem?: string
): RangeValidationResult {
  // Filter to beat notes only (support both 'Beat' and 'Plot' for legacy)
  let beatNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
  
  console.log('[Range Validation] Total beat notes found:', beatNotes.length);
  console.log('[Range Validation] Selected beat system:', selectedBeatSystem);
  
  // Filter by Beat Model
  if (selectedBeatSystem && selectedBeatSystem.trim() !== '') {
    if (selectedBeatSystem === 'Custom') {
      // For custom/Custom system: exclude beats that belong to built-in systems
      const builtInSystems = ['save the cat', 'savethecat', "hero's journey", 'herosjourney', 'story grid', 'storygrid'];
      beatNotes = beatNotes.filter(b => {
        const beatModel = b["Beat Model"];
        if (!beatModel) return true; // Include beats with no Beat Model
        const normalizedModel = beatModel.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
        return !builtInSystems.includes(normalizedModel);
      });
    } else {
      // For specific system (e.g., "Save The Cat"): only include beats matching that system
      const normalizedSelected = selectedBeatSystem.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
      console.log('[Range Validation] Normalized selected system:', normalizedSelected);
      
      beatNotes = beatNotes.filter(b => {
        const beatModel = b["Beat Model"];
        if (!beatModel) {
          console.log('[Range Validation] Beat has no Beat Model:', b.title);
          return false;
        }
        const normalizedModel = beatModel.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
        const matches = normalizedModel === normalizedSelected;
        if (!matches) {
          console.log('[Range Validation] Beat Model mismatch:', b.title, '- Model:', beatModel, '- Normalized:', normalizedModel);
        }
        return matches;
      });
    }
  }
  
  console.log('[Range Validation] Beats after filtering:', beatNotes.length);
  
  if (beatNotes.length === 0) {
    return {
      valid: true,
      missingRangeBeats: [],
      totalBeats: 0
    };
  }
  
  // Find beats without valid Range field
  const missingRangeBeats: string[] = [];
  
  for (const beat of beatNotes) {
    // Log all properties to see what's available
    if (missingRangeBeats.length === 0) {
      console.log('[Range Validation] Sample beat properties:', Object.keys(beat));
    }
    
    const range = parseRange(beat.Range);
    if (!range) {
      console.log('[Range Validation] Missing/invalid Range for:', beat.title, '- Range value:', beat.Range, '- All keys:', Object.keys(beat));
      // Strip leading number from title for cleaner display
      const beatName = (beat.title || 'Unknown Beat').replace(/^\d+\s+/, '');
      missingRangeBeats.push(beatName);
    }
  }
  
  console.log('[Range Validation] Beats missing valid Range:', missingRangeBeats.length);
  
  return {
    valid: missingRangeBeats.length === 0,
    missingRangeBeats,
    totalBeats: beatNotes.length
  };
}
