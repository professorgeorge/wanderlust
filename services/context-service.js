/**
 * Context & Ephemeral Moments Engine
 * Evaluates the traveler's current time of day, solar position, and surrounding environment
 * to highlight attractions that are uniquely rewarding *right now*.
 */
export class ContextService {
  constructor() {
    this.simulatedHour = null; // Can override for testing
  }

  /**
   * Determine current time phase (dawn, morning, midday, afternoon, golden_hour, dusk, night)
   */
  getTimePhase(lat, lng) {
    const now = new Date();
    const hour = this.simulatedHour !== null ? this.simulatedHour : now.getHours() + (now.getMinutes() / 60);

    if (hour >= 5.5 && hour < 8.5) {
      return {
        id: 'dawn_morning',
        label: 'Early Morning & Mist',
        icon: '🌄',
        theme: 'golden',
        description: 'Crisp air, valley mist, quiet temples, and waking nature reserves.'
      };
    } else if (hour >= 8.5 && hour < 11.5) {
      return {
        id: 'morning',
        label: 'Morning Expanse',
        icon: '☀️',
        theme: 'amber',
        description: 'Clear mountain visibility, active wildlife, and open road.'
      };
    } else if (hour >= 11.5 && hour < 15.5) {
      return {
        id: 'midday_heat',
        label: 'Midday Refuge',
        icon: '🌿',
        theme: 'emerald',
        description: 'Shaded canopy roads, cool cascading waterfalls, and quiet stone halls.'
      };
    } else if (hour >= 15.5 && hour < 17.5) {
      return {
        id: 'afternoon',
        label: 'Late Afternoon Lore',
        icon: '🏛️',
        theme: 'blue',
        description: 'Historic architecture, ancient bridges, and roadside tea stops.'
      };
    } else if (hour >= 17.5 && hour < 19.5) {
      return {
        id: 'golden_hour',
        label: 'Golden Hour & Twilight',
        icon: '✨',
        theme: 'gold',
        description: 'Raking amber light across ridges, river reflections, and dramatic overlooks.'
      };
    } else {
      return {
        id: 'night',
        label: 'Night & Stargazing',
        icon: '🌌',
        theme: 'indigo',
        description: 'Quiet dark-sky overlooks, illuminated historic landmarks, and cool breezes.'
      };
    }
  }

  /**
   * Score a POI for its contextual relevance right now
   * @param {Object} poi - POI object
   * @param {number} lat - Car latitude
   * @param {number} lng - Car longitude
   * @returns {Object|null} Context badge information if particularly attractive right now
   */
  evaluatePoiMoment(poi, lat, lng) {
    const phase = this.getTimePhase(lat, lng);
    const title = (poi.title || '').toLowerCase();
    const extract = (poi.extract || '').toLowerCase();
    const type = (poi.type || '').toLowerCase();

    // Check specific combinations
    if (phase.id === 'golden_hour') {
      if (type === 'viewpoint' || title.includes('viewpoint') || title.includes('peak') || title.includes('lake') || title.includes('overlook')) {
        return {
          badge: '✨ PRIME GOLDEN HOUR',
          note: 'Optimal sunlight alignment across the valley right now',
          priority: true
        };
      }
    } else if (phase.id === 'midday_heat') {
      if (type === 'waterfall' || title.includes('falls') || title.includes('waterfall') || title.includes('river') || extract.includes('canopy') || extract.includes('shade') || type === 'cave_entrance') {
        return {
          badge: '🌿 COOL MIDDAY RETREAT',
          note: 'A refreshing cool stop away from midday warmth',
          priority: true
        };
      }
    } else if (phase.id === 'dawn_morning') {
      if (type === 'viewpoint' || title.includes('mist') || title.includes('sanctuary') || title.includes('valley') || extract.includes('reserve') || title.includes('temple')) {
        return {
          badge: '🌄 MORNING MIST & SERENITY',
          note: 'Best experienced in the tranquil morning light',
          priority: true
        };
      }
    } else if (phase.id === 'afternoon') {
      if (poi.source === 'wikipedia' || type === 'castle' || type === 'monument' || title.includes('bridge') || title.includes('palace')) {
        return {
          badge: '🏛️ HISTORIC DETOUR',
          note: 'A rich footnote to explore before evening sets in',
          priority: false
        };
      }
    } else if (phase.id === 'night') {
      if (type === 'viewpoint' || title.includes('observatory') || title.includes('peak')) {
        return {
          badge: '🌌 NIGHT SKY OUTPOST',
          note: 'Elevated panorama away from highway glare',
          priority: true
        };
      }
    }

    return null;
  }
}
