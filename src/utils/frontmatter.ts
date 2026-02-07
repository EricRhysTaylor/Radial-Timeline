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
 * - pulse update/Pulse Update/PulseUpdate/Beats Update → Pulse Update
 * - publish stage/Publish Stage/PublishStage → Publish Stage
 * - scene number/Scene Number/SceneNumber → Scene Number
 * - etc.
 * 
 * @param fm - The raw frontmatter object
 * @param customMappings - Optional user-defined mappings (User Key -> Canonical Key)
 */
export function normalizeFrontmatterKeys(fm: Record<string, unknown>, customMappings?: Record<string, string>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  // Define canonical key names (proper case with spaces)
  const keyMappings: Record<string, string> = {
    'class': 'Class',
    'itemtype': 'itemType',
    'plotsystem': 'Plot System',
    'beatmodel': 'Beat Model',
    'beatsupdate': 'Pulse Update',
    'pulseupdate': 'Pulse Update',
    'publishstage': 'Publish Stage',
    'scenenumber': 'Scene Number',
    'subplot': 'Subplot',
    'character': 'Character',
    'location': 'Location',
    'act': 'Act',
    'date': 'Date',
    'status': 'Status',
    'synopsis': 'Synopsis',
    'summary': 'Summary',
    'summaryupdate': 'Summary Update',
    'end': 'End',
    'description': 'Description',
    'range': 'Range',
    'words': 'Words',
    'totaltime': 'Total Time',
    'supportfiles': 'Support Files',
    'due': 'Due',
    'pendingedits': 'Pending Edits',
    'iteration': 'Iteration',
    'iterations': 'Iteration', // Legacy plural form maps to singular
    'revision': 'Iteration', // Deprecated: "Revision" renamed to "Iteration"
    'pov': 'POV',
    'duration': 'Duration',
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
    'gossamer6': 'Gossamer6',
    'gossamer7': 'Gossamer7',
    'gossamer8': 'Gossamer8',
    'gossamer9': 'Gossamer9',
    'gossamer10': 'Gossamer10',
    'gossamer11': 'Gossamer11',
    'gossamer12': 'Gossamer12',
    'gossamer13': 'Gossamer13',
    'gossamer14': 'Gossamer14',
    'gossamer15': 'Gossamer15',
    'gossamer16': 'Gossamer16',
    'gossamer17': 'Gossamer17',
    'gossamer18': 'Gossamer18',
    'gossamer19': 'Gossamer19',
    'gossamer20': 'Gossamer20',
    'gossamer21': 'Gossamer21',
    'gossamer22': 'Gossamer22',
    'gossamer23': 'Gossamer23',
    'gossamer24': 'Gossamer24',
    'gossamer25': 'Gossamer25',
    'gossamer26': 'Gossamer26',
    'gossamer27': 'Gossamer27',
    'gossamer28': 'Gossamer28',
    'gossamer29': 'Gossamer29',
    'gossamer30': 'Gossamer30',
    '1beats': '1beats',
    '2beats': '2beats',
    '3beats': '3beats',
    'beats1': 'beats1',
    'beats2': 'beats2',
    'beats3': 'beats3',
    'beatslastupdated': 'Pulse Last Updated',
    'pulselastupdated': 'Pulse Last Updated',
    'when': 'When',
    'place': 'Place',
    'scope': 'Scope'
  };

  // Merge custom mappings
  if (customMappings) {
    for (const [userKey, canonicalKey] of Object.entries(customMappings)) {
      // Normalize to lowercase, remove spaces and special chars for lookup
      const normalizedKey = userKey.toLowerCase().replace(/[\s_-]/g, '');
      keyMappings[normalizedKey] = canonicalKey;
    }
  }

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
