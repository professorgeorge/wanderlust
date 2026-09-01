/**
 * Companion Personas Service
 * Provides customizable narrative lenses and voice modulations
 * for the passenger-seat storyteller.
 */
export const PERSONAS = {
  wanderer: {
    id: 'wanderer',
    name: 'The Contemplative Wanderer',
    tagline: 'Poetic, curious, and reflective of the landscape beyond the directions.',
    icon: '✨',
    rate: 0.95,
    pitch: 0.95,
    prefixPhrases: [
      'Look beyond the road: ',
      'A quiet footnote in the countryside: ',
      'There is more to this place than the destination: ',
      'A passing wonder to your side: '
    ],
    closingPhrases: [
      'Take a moment to take it in.',
      'The journey exists in the places between.',
      'Worth remembering as the miles slip past.'
    ]
  },
  folklorist: {
    id: 'folklorist',
    name: 'The Local Folklorist',
    tagline: 'Myths, oral history, legends, and community flavor.',
    icon: '📜',
    rate: 1.0,
    pitch: 1.05,
    prefixPhrases: [
      'Around these parts, the old stories tell of ',
      'Local lore speaks of a curious spot: ',
      'Every bend has a tale: ',
      'Whispered by generations of travelers: '
    ],
    closingPhrases: [
      'A story woven into the road itself.',
      'Ask any elder in the next village.',
      'One of those roadside secrets that outlives time.'
    ]
  },
  naturalist: {
    id: 'naturalist',
    name: 'The Naturalist & Geologist',
    tagline: 'River basins, mountain folds, canopy ecology, and wildlife.',
    icon: '🌿',
    rate: 1.02,
    pitch: 1.0,
    prefixPhrases: [
      'Observing the natural ecology here: ',
      'The geology of this corridor reveals ',
      'Carved by rivers and mountain weather: ',
      'A living landscape just off your path: '
    ],
    closingPhrases: [
      'Notice how the vegetation shifts with the elevation.',
      'A sanctuary formed over millions of seasons.',
      'Keep an eye on the treeline as you pass.'
    ]
  },
  historian: {
    id: 'historian',
    name: 'The Highway Historian',
    tagline: 'Colonial engineering, ancient trade routes, treaties, and monuments.',
    icon: '🏛️',
    rate: 1.0,
    pitch: 0.98,
    prefixPhrases: [
      'Historical archives record that ',
      'An engineering and cultural landmark: ',
      'Traces of past eras linger here: ',
      'Along this historic transport corridor: '
    ],
    closingPhrases: [
      'A silent witness to the history of this region.',
      'Built in an era when travel was measured in days, not hours.',
      'Marked on older maps long before the highway was paved.'
    ]
  }
};

/**
 * Robust natural language sentence segmenter & text cleaner.
 * Properly handles honorifics, titles, abbreviations, decimal numbers,
 * initials, citation brackets, and units without cutting off mid-sentence.
 *
 * @param {string} rawText - Input raw text or POI extract
 * @param {number} maxSentences - Target number of complete sentences (e.g. 1 for concise, 2-3 for rich)
 * @returns {string} Fully formed, complete sentence(s) with proper punctuation.
 */
export function cleanAndSplitSentences(rawText, maxSentences = 2) {
  if (!rawText || typeof rawText !== 'string') return '';

  // 1. Clean Wikipedia citations like [1], [2], [citation needed], [note 1], etc.
  let text = rawText
    .replace(/\[\s*(?:\d+|citation needed|note \d+|edit)\s*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // 2. Protect common abbreviations from erroneous sentence breaks
  const abbreviations = [
    // Honorifics / Titles
    'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Sr', 'Jr', 'Gen', 'Gov', 'Sen', 'Rep', 'Capt', 'Lt', 'Col', 'Maj', 'Rev', 'Fr', 'St', 'Mt', 'Ft',
    // Geographic / Measurement / Infrastructure
    'Rd', 'Ave', 'Blvd', 'Hwy', 'Ln', 'Ct', 'Pl', 'Sq', 'sq', 'mi', 'km', 'ft', 'in', 'm', 'ac', 'yd', 'oz', 'lb', 'lbs', 'dept',
    // Latin / Dates / Common abbreviations
    'c', 'ca', 'approx', 'est', 'e.g', 'i.e', 'vs', 'etc', 'viz', 'al', 'op', 'cit', 'a.m', 'p.m', 'am', 'pm', 'no', 'vol', 'p', 'pp', 'co', 'inc', 'corp', 'ltd',
    // States & Regions
    'U.S', 'U.S.A', 'U.K', 'E.U', 'N.Y', 'C.A', 'D.C', 'Fla', 'Tex', 'Wash', 'Calif'
  ];

  const protectedTokens = new Map();
  let tokenIdx = 0;

  // Protect decimal numbers (e.g. 3.5 miles, 14.2 km)
  text = text.replace(/(\b\d+)\.(\d+\b)/g, (match, p1, p2) => {
    const token = `__DECIMAL_${tokenIdx++}__`;
    protectedTokens.set(token, `${p1}.${p2}`);
    return token;
  });

  // Protect single initial letters with period (e.g. John F. Kennedy)
  text = text.replace(/(^|\s)([A-Z])\.(\s|$)/g, (match, before, letter, after) => {
    const token = `__INIT_${tokenIdx++}__`;
    protectedTokens.set(token, `${letter}.`);
    return `${before}${token}${after}`;
  });

  // Protect multi-dot abbreviations (e.g. U.S.A., e.g., i.e., a.m., p.m.)
  text = text.replace(/\b([a-zA-Z])\.([a-zA-Z])\.([a-zA-Z])?\./gi, (match) => {
    const token = `__ABBR_${tokenIdx++}__`;
    protectedTokens.set(token, match);
    return token;
  });
  text = text.replace(/\b([a-zA-Z])\.([a-zA-Z])\./gi, (match) => {
    const token = `__ABBR_${tokenIdx++}__`;
    protectedTokens.set(token, match);
    return token;
  });

  // Protect single-dot known abbreviations
  abbreviations.forEach(abbr => {
    const regex = new RegExp(`\\b(${abbr})\\.(\\s+|$)`, 'gi');
    text = text.replace(regex, (match, p1, space) => {
      const token = `__ABBR_${tokenIdx++}__`;
      protectedTokens.set(token, `${p1}.`);
      return `${token}${space}`;
    });
  });

  // 3. Sentence segmentation
  let sentences = [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
      sentences = Array.from(segmenter.segment(text))
        .map(s => s.segment.trim())
        .filter(s => s.length > 0);
    } catch (e) {
      sentences = [];
    }
  }

  // Fallback regex if Intl.Segmenter is unavailable
  if (!sentences || sentences.length === 0) {
    const rawMatches = text.match(/[^.!?]+(?:[.!?]+["'”’]?|$)/g);
    sentences = (rawMatches || [text]).map(s => s.trim()).filter(s => s.length > 0);
  }

  // 4. Restore protected tokens in each sentence
  sentences = sentences.map(sentence => {
    let restored = sentence;
    protectedTokens.forEach((original, token) => {
      restored = restored.replaceAll(token, original);
    });
    return restored.trim();
  }).filter(Boolean);

  // 5. Merge accidental fragments (e.g. lower-case continuation)
  const mergedSentences = [];
  for (let i = 0; i < sentences.length; i++) {
    const curr = sentences[i];
    if (mergedSentences.length > 0 && /^[a-z0-9,;:]/.test(curr)) {
      mergedSentences[mergedSentences.length - 1] += ` ${curr}`;
    } else {
      mergedSentences.push(curr);
    }
  }

  // 6. Select the desired number of complete sentences
  let selected = mergedSentences;
  if (maxSentences === 'all' || maxSentences === 'comprehensive' || (typeof maxSentences === 'number' && maxSentences >= 50)) {
    selected = mergedSentences;
  } else {
    const count = Math.max(1, typeof maxSentences === 'number' ? maxSentences : 2);
    selected = mergedSentences.slice(0, count);
  }

  let result = selected.join(' ').trim();

  // 7. Ensure clean terminal punctuation at the very end
  if (result && !/[.!?]["'”’]?$/.test(result)) {
    result += '.';
  }

  return result;
}

export class PersonaService {
  constructor(initialPersonaId = 'wanderer') {
    this.currentPersona = PERSONAS[initialPersonaId] || PERSONAS.wanderer;
  }

  setPersona(id) {
    if (PERSONAS[id]) {
      this.currentPersona = PERSONAS[id];
      return this.currentPersona;
    }
    return null;
  }

  /**
   * Format text for spoken narration according to current persona
   */
  formatSpeech(poi, options = {}) {
    const p = this.currentPersona;
    const prefix = p.prefixPhrases[Math.floor(Math.random() * p.prefixPhrases.length)];
    const closing = p.closingPhrases[Math.floor(Math.random() * p.closingPhrases.length)];

    const bearingPhrase = options.relativeBearing ? `${options.relativeBearing}` : 'ahead';
    
    let distPhrase = '';
    if (options.unitSystem === 'imperial') {
      if (poi.dist < 400) {
        const feet = Math.round(poi.dist * 3.28084);
        distPhrase = `${feet} feet`;
      } else {
        const miles = (poi.dist * 0.000621371).toFixed(1);
        distPhrase = `${miles} miles`;
      }
    } else {
      const distanceKm = (poi.dist / 1000).toFixed(1);
      distPhrase = poi.dist < 1000 ? `${poi.dist} meters` : `${distanceKm} kilometers`;
    }

    const intro = `${prefix}About ${distPhrase} ${bearingPhrase}, stands ${poi.title}.`;
    
    // Resolve narration depth
    const depth = options.narrationDepth || (options.isConcise ? 'concise' : 'rich');
    let maxSentences = 3;
    if (depth === 'comprehensive' || depth === 'full') {
      maxSentences = 'all';
    } else if (depth === 'concise') {
      maxSentences = 1;
    } else {
      maxSentences = options.maxSentences || 3;
    }

    const rawBody = poi.extract || poi.shortDescription || '';
    const extract = cleanAndSplitSentences(rawBody, maxSentences);

    return {
      text: `${intro} ${extract} ${closing}`.replace(/\s+/g, ' ').trim(),
      rate: p.rate,
      pitch: p.pitch
    };
  }
}

