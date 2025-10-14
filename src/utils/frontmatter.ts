/*
 * Frontmatter utilities - case-insensitive key handling
 */

/**
 * Normalize frontmatter keys to canonical case-insensitive format.
 * This allows users to write keys in any case (e.g., "class", "Class", "CLASS")
 * and the code will find them under the canonical name.
 * 
 * Canonical key mappings:
 * - class/CLASS/Class → Class
 * - beat model/Beat Model/BEAT MODEL/BeatModel → Beat Model
 * - beats update/Beats Update/BeatsUpdate → Beats Update
 * - publish stage/Publish Stage/PublishStage → Publish Stage
 * - scene number/Scene Number/SceneNumber → Scene Number
 * - etc.
 */
export function normalizeFrontmatterKeys(fm: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  // Define canonical key names (proper case with spaces)
  const keyMappings: Record<string, string> = {
    'class': 'Class',
    'itemtype': 'itemType',
    'beatmodel': 'Beat Model',
    'beatsupdate': 'Beats Update',
    'publishstage': 'Publish Stage',
    'scenenumber': 'Scene Number',
    'subplot': 'Subplot',
    'character': 'Character',
    'location': 'Location',
    'act': 'Act',
    'date': 'Date',
    'status': 'Status',
    'synopsis': 'Synopsis',
    'description': 'Description',
    'words': 'Words',
    'totaltime': 'Total Time',
    'book': 'Book',
    'supportfiles': 'Support Files',
    'due': 'Due',
    'pendingedits': 'Pending Edits',
    'revision': 'Revision',
    'pov': 'POV',
    'type': 'Type',
    'shift': 'Shift',
    'questions': 'Questions',
    'readeremotion': 'Reader Emotion',
    'internal': 'Internal',
    'gossamer1': 'Gossamer1',
    'gossamer2': 'Gossamer2',
    'gossamer3': 'Gossamer3',
    'gossamer4': 'Gossamer4',
    'gossamer5': 'Gossamer5',
    '1beats': '1beats',
    '2beats': '2beats',
    '3beats': '3beats',
    'beats1': 'beats1',
    'beats2': 'beats2',
    'beats3': 'beats3',
    'beatslastupdated': 'Beats Last Updated',
  };
  
  // Process each key in the original frontmatter
  for (const [key, value] of Object.entries(fm)) {
    // Normalize to lowercase, remove spaces and special chars for lookup
    const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
    
    // Find canonical name or keep original if not in mapping
    const canonicalKey = keyMappings[normalizedKey] || key;
    
    // If canonical key already exists, prefer the first occurrence
    if (!(canonicalKey in normalized)) {
      normalized[canonicalKey] = value;
    }
  }
  
  return normalized;
}

