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

    let intro = `${prefix}About ${distPhrase} ${bearingPhrase}, stands ${poi.title}.`;

    let extract = poi.extract || poi.shortDescription || '';
    if (options.isConcise) {
      const match = extract.match(/^(.*?[.!?])(\s|$)/);
      extract = match ? match[1] : extract;
    } else {
      const sentences = extract.match(/[^.!?]+[.!?]+/g) || [extract];
      extract = sentences.slice(0, 2).join(' ');
    }

    return {
      text: `${intro} ${extract} ${closing}`,
      rate: p.rate,
      pitch: p.pitch
    };
  }
}
