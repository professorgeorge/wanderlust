/**
 * Wonder Pins Service
 * Enables travelers to drop personal roadside wonder pins
 * (scenic picnic spots, quiet river benches, country bakeries, local oral lore)
 * and export/import them as standard GeoJSON.
 */
export class PinsService {
  constructor(storageService) {
    this.storage = storageService;
    this.pins = [];
    this.narratedPinIds = new Set();
  }

  async loadPins() {
    this.pins = await this.storage.getAllWonderPins();
    return this.pins;
  }

  /**
   * Create a new Wonder Pin
   */
  async createPin({ title, note, category = 'vista', lat, lng, audioMemo = null }) {
    const pin = {
      id: `wonder-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      source: 'wonder_pin',
      title: title.trim() || 'Roadside Wonder',
      note: note.trim() || 'A personal discovery off the beaten path.',
      category: category, // 'vista', 'secret_stop', 'lore', 'food_craft'
      lat: Number(lat),
      lng: Number(lng),
      audioMemo: audioMemo,
      createdAt: new Date().toISOString()
    };

    await this.storage.saveWonderPin(pin);
    this.pins.unshift(pin);
    return pin;
  }

  async removePin(id) {
    await this.storage.deleteWonderPin(id);
    this.pins = this.pins.filter(p => p.id !== id);
    return true;
  }

  /**
   * Convert Wonder Pins to POI format for the map, feed, and voice narration
   */
  toPoi(pin) {
    const categoryIcons = {
      vista: '🌄',
      secret_stop: '✨',
      lore: '📜',
      food_craft: '🍞'
    };

    const categoryLabels = {
      vista: 'Scenic Overlook',
      secret_stop: 'Secret Stop',
      lore: 'Local Lore',
      food_craft: 'Roadside Food / Craft'
    };

    return {
      id: pin.id,
      source: 'wonder_pin',
      category: pin.category,
      title: `${categoryIcons[pin.category] || '✨'} ${pin.title}`,
      lat: pin.lat,
      lng: pin.lng,
      dist: 0,
      extract: pin.note,
      shortDescription: `Wonder Pin: ${categoryLabels[pin.category] || 'Custom Discovery'}`,
      thumbnail: null,
      pageUrl: `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`
    };
  }

  /**
   * Export all user pins as a standard GeoJSON FeatureCollection
   */
  exportToGeoJson() {
    const geojson = {
      type: 'FeatureCollection',
      name: 'The Wandering Layer — Roadside Wonder Pins',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      features: this.pins.map(pin => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pin.lng, pin.lat]
        },
        properties: {
          id: pin.id,
          title: pin.title,
          note: pin.note,
          category: pin.category,
          createdAt: pin.createdAt
        }
      }))
    };

    return JSON.stringify(geojson, null, 2);
  }

  /**
   * Import pins from a GeoJSON FeatureCollection string or object
   */
  async importFromGeoJson(geojsonInput) {
    try {
      const geojson = typeof geojsonInput === 'string' ? JSON.parse(geojsonInput) : geojsonInput;
      if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        throw new Error('Invalid GeoJSON FeatureCollection');
      }

      let importedCount = 0;
      for (const feat of geojson.features) {
        if (feat.geometry && feat.geometry.type === 'Point' && Array.isArray(feat.geometry.coordinates)) {
          const [lng, lat] = feat.geometry.coordinates;
          const props = feat.properties || {};
          
          await this.createPin({
            title: props.title || props.name || 'Imported Wonder',
            note: props.note || props.description || 'Discovered and shared by a fellow traveler.',
            category: props.category || 'vista',
            lat: lat,
            lng: lng
          });
          importedCount++;
        }
      }

      await this.loadPins();
      return { success: true, count: importedCount };
    } catch (err) {
      console.warn('GeoJSON import error:', err);
      return { success: false, error: err.message };
    }
  }
}
