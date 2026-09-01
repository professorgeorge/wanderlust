/* Wanderlust Unified Engine v25 */

// --- services/storage-service.js ---
/**
 * Storage Service
 * Robust client-side IndexedDB wrapper for persistent offline POIs,
 * user wonder pins, trip journals, and cached route corridors.
 * 100% free, runs locally in the user's browser with zero cloud dependencies.
 */
class StorageService {
  constructor() {
    this.dbName = 'TheWanderingLayerDB';
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      console.warn('IndexedDB not supported or running in non-window environment; falling back to memory/localStorage.');
      return null;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store for pre-cached offline POIs
        if (!db.objectStoreNames.contains('offline_pois')) {
          const poiStore = db.createObjectStore('offline_pois', { keyPath: 'id' });
          poiStore.createIndex('corridorId', 'corridorId', { unique: false });
          poiStore.createIndex('source', 'source', { unique: false });
        }

        // Store for user-created Wonder Pins
        if (!db.objectStoreNames.contains('wonder_pins')) {
          const pinStore = db.createObjectStore('wonder_pins', { keyPath: 'id' });
          pinStore.createIndex('createdAt', 'createdAt', { unique: false });
          pinStore.createIndex('category', 'category', { unique: false });
        }

        // Store for road trip journals
        if (!db.objectStoreNames.contains('journals')) {
          const journalStore = db.createObjectStore('journals', { keyPath: 'id' });
          journalStore.createIndex('startTime', 'startTime', { unique: false });
        }

        // Store for saved routes
        if (!db.objectStoreNames.contains('routes')) {
          db.createObjectStore('routes', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        resolve(null);
      };
    });
  }

  // --- Offline POI Management ---

  async saveOfflinePois(corridorId, pois) {
    await this.initPromise;
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db.transaction(['offline_pois'], 'readwrite');
      const store = tx.objectStore('offline_pois');

      pois.forEach(poi => {
        store.put({
          ...poi,
          corridorId: corridorId,
          cachedAt: Date.now()
        });
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async getOfflinePois(corridorId = null) {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['offline_pois'], 'readonly');
      const store = tx.objectStore('offline_pois');

      if (corridorId) {
        const index = store.index('corridorId');
        const req = index.getAll(corridorId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      }
    });
  }

  // --- User Wonder Pins ---

  async saveWonderPin(pin) {
    await this.initPromise;
    if (!this.db) {
      const existing = JSON.parse(localStorage.getItem('wonder_pins') || '[]');
      existing.push(pin);
      localStorage.setItem('wonder_pins', JSON.stringify(existing));
      return pin;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['wonder_pins'], 'readwrite');
      const store = tx.objectStore('wonder_pins');
      store.put(pin);
      tx.oncomplete = () => resolve(pin);
      tx.onerror = () => resolve(null);
    });
  }

  async getAllWonderPins() {
    await this.initPromise;
    if (!this.db) {
      return JSON.parse(localStorage.getItem('wonder_pins') || '[]');
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['wonder_pins'], 'readonly');
      const store = tx.objectStore('wonder_pins');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async deleteWonderPin(id) {
    await this.initPromise;
    if (!this.db) {
      const existing = JSON.parse(localStorage.getItem('wonder_pins') || '[]');
      const filtered = existing.filter(p => p.id !== id);
      localStorage.setItem('wonder_pins', JSON.stringify(filtered));
      return true;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['wonder_pins'], 'readwrite');
      const store = tx.objectStore('wonder_pins');
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  // --- Journals ---

  async saveJournal(journalData) {
    await this.initPromise;
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db.transaction(['journals'], 'readwrite');
      const store = tx.objectStore('journals');
      store.put(journalData);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async getJournals() {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['journals'], 'readonly');
      const store = tx.objectStore('journals');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  // --- Full Backup & Cross-Device Restore ---

  async exportFullBackup(settings = {}) {
    await this.initPromise;
    const pins = await this.getAllWonderPins();
    const journals = await this.getJournals();
    const routes = await this.getAllSavedRoutes();

    return {
      app: 'The Wandering Layer',
      version: 2.0,
      exportedAt: new Date().toISOString(),
      settings: settings,
      wonderPins: pins,
      journals: journals,
      routes: routes
    };
  }

  async getAllSavedRoutes() {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['routes'], 'readonly');
      const store = tx.objectStore('routes');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async importFullBackup(backupData) {
    await this.initPromise;
    if (!backupData || typeof backupData !== 'object') {
      return { success: false, error: 'Invalid backup file format' };
    }

    let pinsCount = 0;
    let journalsCount = 0;
    let routesCount = 0;

    // 1. Restore Wonder Pins
    if (Array.isArray(backupData.wonderPins)) {
      for (const pin of backupData.wonderPins) {
        if (pin && pin.id) {
          await this.saveWonderPin(pin);
          pinsCount++;
        }
      }
    }

    // 2. Restore Journals
    if (Array.isArray(backupData.journals)) {
      for (const j of backupData.journals) {
        if (j && j.id) {
          await this.saveJournal(j);
          journalsCount++;
        }
      }
    }

    // 3. Restore Routes
    if (Array.isArray(backupData.routes)) {
      for (const r of backupData.routes) {
        if (r && r.id) {
          await this.saveRoute(r);
          routesCount++;
        }
      }
    }

    return {
      success: true,
      pinsCount,
      journalsCount,
      routesCount,
      settings: backupData.settings || null
    };
  }
}



// --- services/pins-service.js ---
/**
 * Wonder Pins Service
 * Enables travelers to drop personal roadside wonder pins
 * (scenic picnic spots, quiet river benches, country bakeries, local oral lore)
 * and export/import them as standard GeoJSON.
 */
class PinsService {
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

  isNarrated(id) {
    if (!id) return false;
    return this.narratedPinIds.has(String(id));
  }

  markAsNarrated(id) {
    if (!id) return;
    this.narratedPinIds.add(String(id));
  }

  resetNarrated() {
    this.narratedPinIds.clear();
  }
}


// --- services/wiki-service.js ---
/**
 * Wikipedia & Wikivoyage Service
 * Queries nearby geocoded articles and travel guide footnotes
 * using public MediaWiki GeoSearch & REST APIs.
 * 100% Free, no API key required, CORS-friendly (origin=*).
 */
class WikiService {
  constructor(storageService = null, initialLang = 'en') {
    this.storage = storageService;
    this.lang = initialLang;
    this.cache = new Map(); // Cache summaries by title
    this.narratedPages = new Set(); // Prevent re-narrating the same landmark
  }

  setLanguage(langCode) {
    this.lang = langCode || 'en';
    this.cache.clear();
  }

  /**
   * Search for Wikipedia and Wikivoyage articles near a coordinate
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radiusMeters - Search radius in meters (max 10000)
   * @param {number} limit - Maximum number of results (default: 8)
   * @returns {Promise<Array>} Array of POI objects
   */
  async findNearby(lat, lng, radiusMeters = 3000, limit = 8) {
    const clampedRadius = Math.min(Math.max(radiusMeters, 500), 10000);

    const [wikiResults, voyageResults] = await Promise.allSettled([
      this.fetchWikipediaGeo(lat, lng, clampedRadius, limit),
      this.fetchWikivoyageGeo(lat, lng, clampedRadius, Math.max(2, Math.floor(limit / 3)))
    ]);

    const combined = [];
    if (wikiResults.status === 'fulfilled') combined.push(...wikiResults.value);
    if (voyageResults.status === 'fulfilled') combined.push(...voyageResults.value);

    // Deduplicate by title similarity
    const unique = [];
    const seenTitles = new Set();

    combined.forEach(item => {
      const cleanTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seenTitles.has(cleanTitle)) {
        seenTitles.add(cleanTitle);
        unique.push(item);
      }
    });

    unique.sort((a, b) => a.dist - b.dist);
    return unique;
  }

  /**
   * Fast single-shot geosearch without page summary overhead
   * Used for high-speed corridor evaluation & scenic scoring
   */
  async quickGeoQuery(lat, lng, radius = 5000, limit = 5) {
    try {
      const url = `https://${this.lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`;
      const res = await fetch(url, {
        headers: { 'Api-User-Agent': 'TheWanderingLayer/2.0 (Road Trip Audio Companion)' }
      });
      if (!res.ok) return { count: 0, titles: [] };
      const data = await res.json();
      const items = data?.query?.geosearch || [];
      return {
        count: items.length,
        titles: items.map(i => i.title)
      };
    } catch (e) {
      return { count: 0, titles: [] };
    }
  }

  async fetchWikipediaGeo(lat, lng, radius, limit) {
    const url = `https://${this.lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`;

    try {
      const res = await fetch(url, {
        headers: { 'Api-User-Agent': 'Wanderlust/2.0 (Road Trip Audio Companion)' }
      });
      if (!res.ok) throw new Error(`Wiki API returned ${res.status}`);
      const data = await res.json();

      if (!data?.query?.geosearch) return [];

      const candidateItems = data.query.geosearch.filter(item => !this.isNarrated(item.pageid) && !this.isNarrated(`wiki-${item.pageid}`)).slice(0, limit || 3);
      
      const summaryPromises = candidateItems.map(async (item) => {
        try {
          const summary = await this.getPageSummary(item.title);
          return {
            id: `wiki-${item.pageid}`,
            source: 'wikipedia',
            title: item.title,
            lat: item.lat,
            lng: item.lon,
            dist: item.dist,
            extract: summary?.extract || 'A notable roadside discovery.',
            shortDescription: summary?.description || 'Historic or cultural landmark',
            thumbnail: summary?.thumbnail?.source || null,
            pageUrl: `https://${this.lang}.wikipedia.org/?curid=${item.pageid}`
          };
        } catch (e) {
          return null;
        }
      });

      const results = await Promise.all(summaryPromises);
      return results.filter(Boolean);
    } catch (err) {
      console.warn('Wikipedia fetch error:', err);
      return [];
    }
  }

  async fetchWikivoyageGeo(lat, lng, radius, limit) {
    const url = `https://${this.lang}.wikivoyage.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`;

    try {
      const res = await fetch(url, {
        headers: { 'Api-User-Agent': 'Wanderlust/2.0 (Road Trip Audio Companion)' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data?.query?.geosearch) return [];

      const candidateItems = data.query.geosearch.filter(item => !this.isNarrated(item.pageid) && !this.isNarrated(`voyage-${item.pageid}`));

      const summaryPromises = candidateItems.map(async (item) => {
        try {
          const summary = await this.getWikivoyageSummary(item.title);
          return {
            id: `voyage-${item.pageid}`,
            source: 'wikivoyage',
            title: item.title,
            lat: item.lat,
            lng: item.lon,
            dist: item.dist,
            extract: summary?.extract || 'Travel guide spotlight.',
            shortDescription: summary?.description || 'Travel guide recommendation',
            thumbnail: summary?.thumbnail?.source || null,
            pageUrl: `https://${this.lang}.wikivoyage.org/?curid=${item.pageid}`
          };
        } catch (e) {
          return null;
        }
      });

      const results = await Promise.all(summaryPromises);
      return results.filter(Boolean);
    } catch (err) {
      console.warn('Wikivoyage fetch error:', err);
      return [];
    }
  }

  async getPageSummary(title) {
    if (this.cache.has(`${this.lang}_${title}`)) {
      return this.cache.get(`${this.lang}_${title}`);
    }

    try {
      const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
      const url = `https://${this.lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
      const res = await fetch(url, { headers: { 'Api-User-Agent': 'TheWanderingLayer/1.0 (Road Trip Audio Companion)' } });
      if (!res.ok) return null;
      const data = await res.json();
      this.cache.set(`${this.lang}_${title}`, data);
      return data;
    } catch (e) {
      console.warn(`Could not get summary for ${title}:`, e);
      return null;
    }
  }

  async getWikivoyageSummary(title) {
    const key = `voyage_${this.lang}_${title}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
      const url = `https://${this.lang}.wikivoyage.org/api/rest_v1/page/summary/${encodedTitle}`;
      const res = await fetch(url, { headers: { 'Api-User-Agent': 'TheWanderingLayer/1.0 (Road Trip Audio Companion)' } });
      if (!res.ok) return null;
      const data = await res.json();
      this.cache.set(key, data);
      return data;
    } catch (e) {
      return null;
    }
  }

  isNarrated(pageidOrId) {
    if (!pageidOrId) return false;
    const strId = String(pageidOrId);
    if (this.narratedPages.has(strId)) return true;
    const rawNum = strId.replace(/^(wiki|voyage)-/, '');
    return this.narratedPages.has(rawNum) ||
           this.narratedPages.has(Number(rawNum)) ||
           this.narratedPages.has(`wiki-${rawNum}`) ||
           this.narratedPages.has(`voyage-${rawNum}`);
  }

  markAsNarrated(pageidOrId) {
    if (!pageidOrId) return;
    const strId = String(pageidOrId);
    this.narratedPages.add(strId);
    const rawNum = strId.replace(/^(wiki|voyage)-/, '');
    if (rawNum) {
      this.narratedPages.add(rawNum);
      const num = Number(rawNum);
      if (!isNaN(num)) this.narratedPages.add(num);
      this.narratedPages.add(`wiki-${rawNum}`);
      this.narratedPages.add(`voyage-${rawNum}`);
    }
  }

  resetNarrated() {
    this.narratedPages.clear();
  }
}


// --- services/osm-service.js ---
/**
 * OpenStreetMap (Overpass API) Service
 * Queries natural viewpoints, waterfalls, peaks, caves, hot springs, and historical ruins.
 * Features automated mirror failover across public Overpass servers.
 * 100% Free public open data.
 */
class OsmService {
  constructor() {
    this.narratedNodes = new Set();
    this.overpassMirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];
    this.currentMirrorIndex = 0;
    this.lastQueryTime = 0;
  }

  /**
   * Search for viewpoints, waterfalls, caves, and heritage spots within radius
   */
  async findNearby(lat, lng, radiusMeters = 3000) {
    const now = Date.now();
    if (now - this.lastQueryTime < 1500) {
      // Light throttle between rapid consecutive anchor calls
      await new Promise(r => setTimeout(r, 400));
    }
    this.lastQueryTime = Date.now();

    const radius = Math.min(Math.max(radiusMeters, 500), 5000);
    const query = `
      [out:json][timeout:8];
      (
        node["amenity"="marketplace"](around:${radius},${lat},${lng});
        node["shop"="farm"](around:${radius},${lat},${lng});
        node["shop"="bakery"](around:${radius},${lat},${lng});
        node["amenity"="cafe"](around:${radius},${lat},${lng});
        node["tourism"="picnic_site"](around:${radius},${lat},${lng});
        node["tourism"="viewpoint"](around:${radius},${lat},${lng});
        node["natural"="waterfall"](around:${radius},${lat},${lng});
        node["natural"="peak"](around:${radius},${lat},${lng});
        node["natural"="cave_entrance"](around:${radius},${lat},${lng});
        node["natural"="spring"](around:${radius},${lat},${lng});
        node["historic"="monument"](around:${radius},${lat},${lng});
        node["historic"="castle"](around:${radius},${lat},${lng});
        node["historic"="archaeological_site"](around:${radius},${lat},${lng});
        node["historic"="ruins"](around:${radius},${lat},${lng});
        node["historic"="wayside_shrine"](around:${radius},${lat},${lng});
        node["tourism"="artwork"](around:${radius},${lat},${lng});
      );
      out body 8;
    `;

    // Try primary and fallback mirrors
    for (let attempt = 0; attempt < this.overpassMirrors.length; attempt++) {
      const mirrorUrl = this.overpassMirrors[(this.currentMirrorIndex + attempt) % this.overpassMirrors.length];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);

        const res = await fetch(mirrorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'TheWanderingLayer/2.0 (OpenStreetMap Roadside Explorer)'
          },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Mirror ${mirrorUrl} returned ${res.status}`);
        }

        const data = await res.json();
        if (!data?.elements) return [];

        this.currentMirrorIndex = (this.currentMirrorIndex + attempt) % this.overpassMirrors.length;

        const results = [];
        for (const el of data.elements) {
          if (!el.tags) continue;
          if (this.isNarrated(el.id) || this.isNarrated(`osm-${el.id}`)) continue;

          const type = el.tags.amenity || el.tags.shop || el.tags.tourism || el.tags.natural || el.tags.historic || 'scenic';
          const name = el.tags.name || `Scenic ${type.replace(/_/g, ' ')}`;
          const dist = this.calculateDistance(lat, lng, el.lat, el.lon);

          let desc = el.tags.description || '';
          if (!desc) {
            if (type === 'marketplace') desc = 'A vibrant local marketplace for regional produce, artisanal crafts, and fresh goods.';
            else if (type === 'farm') desc = 'A local roadside farm stand offering fresh seasonal harvest and farm produce.';
            else if (type === 'bakery') desc = 'An artisanal roadside bakery with fresh breads, pastries, and treats.';
            else if (type === 'cafe') desc = 'A cozy roadside cafe and refreshments stop.';
            else if (type === 'picnic_site') desc = 'A scenic outdoor picnic area to pause, refresh, and take in the view.';
            else if (type === 'viewpoint') desc = 'A scenic lookout point with panoramic views of the surrounding landscape.';
            else if (type === 'waterfall') desc = 'A natural waterfall or cascading mountain stream.';
            else if (type === 'peak') desc = `A mountain summit${el.tags.ele ? ` (elevation ${el.tags.ele}m)` : ''}.`;
            else if (type === 'cave_entrance') desc = 'A natural cave entrance and geological feature.';
            else if (type === 'spring') desc = 'A natural freshwater spring bubbling from the earth.';
            else if (type === 'castle') desc = 'A historic fortress or castle ruins.';
            else if (type === 'archaeological_site') desc = 'An ancient archaeological excavation and heritage site.';
            else if (type === 'ruins') desc = 'Historic stone ruins from centuries past.';
            else if (type === 'wayside_shrine') desc = 'A traditional wayside shrine or historic travelers marker.';
            else desc = 'A notable geographic or historic roadside landmark.';
          }

          results.push({
            id: `osm-${el.id}`,
            source: 'osm',
            title: name,
            lat: el.lat,
            lng: el.lon,
            dist: Math.round(dist),
            type: type,
            extract: desc,
            shortDescription: `OpenStreetMap ${type.toUpperCase().replace(/_/g, ' ')}`,
            thumbnail: null,
            pageUrl: `https://www.openstreetmap.org/node/${el.id}`
          });
        }

        results.sort((a, b) => a.dist - b.dist);
        return results;
      } catch (err) {
        console.warn(`Overpass mirror fail (${mirrorUrl}):`, err.message);
      }
    }

    return [];
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  isNarrated(id) {
    if (!id) return false;
    const strId = String(id);
    if (this.narratedNodes.has(strId)) return true;
    const rawId = strId.replace(/^osm-/, '');
    return this.narratedNodes.has(rawId) ||
           this.narratedNodes.has(Number(rawId)) ||
           this.narratedNodes.has(`osm-${rawId}`);
  }

  markAsNarrated(id) {
    if (!id) return;
    const strId = String(id);
    this.narratedNodes.add(strId);
    const rawId = strId.replace(/^osm-/, '');
    if (rawId) {
      this.narratedNodes.add(rawId);
      const num = Number(rawId);
      if (!isNaN(num)) this.narratedNodes.add(num);
      this.narratedNodes.add(`osm-${rawId}`);
    }
  }

  resetNarrated() {
    this.narratedNodes.clear();
  }
}


// --- services/voice.js ---
/**
/**
 * Robust natural language sentence segmenter & text cleaner.
 * Properly handles honorifics, titles, abbreviations, decimal numbers,
 * initials, citation brackets, and units without cutting off mid-sentence.
 */
function cleanAndSplitSentences(rawText, maxSentences = 2) {
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
  const count = Math.max(1, maxSentences || 2);
  const selected = mergedSentences.slice(0, count);
  let result = selected.join(' ').trim();

  // 7. Ensure clean terminal punctuation at the very end
  if (result && !/[.!?]["'”’]?$/.test(result)) {
    result += '.';
  }

  return result;
}

/**
 * Voice & Audio Service
 * Uses Web Speech API (SpeechSynthesis) + Web Audio API for pre-announcement chimes.
 * Features keep-alive heartbeats to prevent mobile OS speech timeouts.
 * 100% Client-side, free, and works offline.
 */
class VoiceService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioCtx = null;
    this.isMuted = false;
    this.isSpeaking = false;
    this.selectedVoice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.lastSpokenTime = 0;
    this.cooldownSeconds = 180; // 3 minutes cooldown between auto-narrations
    this.onStateChange = null;
    this.speechHeartbeatTimer = null;
    this.currentPoi = null;
    this.lastPoi = null;
    this.activeUtterance = null; // Retain reference to active utterance to prevent browser GC truncation

    this.initVoices();
  }

  initVoices() {
    if (!this.synth) return;
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      this.selectedVoice = voices.find(v => (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Premium')))) ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0] || null;
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Unlock AudioContext on initial user touch/click (required by mobile iOS/Android)
   */
  unlockAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Play a gentle harmonic 2-tone chime before narration
   */
  async playChime() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Note 2: B5 (987.77 Hz) - harmonic fifth
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.15);
      gain2.gain.setValueAtTime(0.001, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.1, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.75);

      // Wait for chime to complete before speech starts
      await new Promise(res => setTimeout(res, 550));
    } catch (e) {
      console.warn('Chime audio error:', e);
    }
  }

  /**
   * Update MediaSession metadata for Car Bluetooth / Lock Screen
   */
  updateMediaSession(poi) {
    if ('mediaSession' in navigator && poi) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: poi.title || 'Roadside Story',
          artist: 'The Wandering Layer',
          album: poi.shortDescription || 'Audio Companion',
          artwork: [
            { src: poi.thumbnail || 'https://raw.githubusercontent.com/feathericons/feather/master/icons/compass.svg', sizes: '512x512', type: 'image/svg+xml' }
          ]
        });
      } catch (e) {
        console.warn('MediaSession metadata error:', e);
      }
    }
  }

  /**
   * Narrate a landmark discovery
   */
  async narrate(poi, options = {}) {
    if (this.isMuted || !this.synth) return false;

    const now = Date.now();
    const isManual = options.force === true;

    // Cooldown check for automatic triggers (e.g. 30s to 180s)
    if (!isManual && (now - this.lastSpokenTime) < (this.cooldownSeconds * 1000)) {
      return false;
    }

    if (isManual && this.isSpeaking) {
      this.stop();
    }

    if (this.isSpeaking) return false;

    this.currentPoi = poi;
    this.unlockAudio();
    await this.playChime();

    // Check if stopped/skipped during chime
    if (this.currentPoi !== poi) return false;

    let fullSpeech = '';
    let speechRate = this.rate;
    let speechPitch = this.pitch;

    if (options.personaService) {
      const formatted = options.personaService.formatSpeech(poi, options);
      fullSpeech = formatted.text;
      speechRate = formatted.rate * this.rate;
      speechPitch = formatted.pitch * this.pitch;
    } else {
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

      const intro = `Coming up ${bearingPhrase}, about ${distPhrase}: ${poi.title}.`;
      const maxSentences = options.isConcise ? 1 : (options.maxSentences || 2);
      const rawBody = poi.extract || poi.shortDescription || '';
      const storyBody = cleanAndSplitSentences(rawBody, maxSentences);
      fullSpeech = `${intro} ${storyBody}`.replace(/\s+/g, ' ').trim();
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(fullSpeech);
      this.activeUtterance = utterance; // Prevent browser GC from terminating in-flight speech

      if (this.selectedVoice) utterance.voice = this.selectedVoice;
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;

      const cleanup = () => {
        if (this.speechHeartbeatTimer) {
          clearInterval(this.speechHeartbeatTimer);
          this.speechHeartbeatTimer = null;
        }
        this.activeUtterance = null;
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.lastSpokenTime = Date.now();
        this.updateMediaSession(poi);
        if (this.onStateChange) {
          this.onStateChange({ isSpeaking: true, poi, lastPoi: this.lastPoi, wasSkipped: false });
        }

        // Mobile speech keepalive safety
        this.speechHeartbeatTimer = setInterval(() => {
          if (this.synth && this.synth.speaking && !this.synth.paused) {
            // Keep speech alive without disruptive stutter
            this.synth.resume();
          }
        }, 8000);
      };

      utterance.onend = () => {
        cleanup();
        this.isSpeaking = false;
        this.lastPoi = poi;
        this.currentPoi = null;
        if (this.onStateChange) {
          this.onStateChange({ isSpeaking: false, poi: null, lastPoi: this.lastPoi, wasSkipped: false });
        }
        resolve(true);
      };

      utterance.onerror = (err) => {
        cleanup();
        if (err.error !== 'canceled' && err.error !== 'interrupted') {
          console.warn('SpeechSynthesis error:', err);
        }
        this.isSpeaking = false;
        this.lastPoi = poi;
        this.currentPoi = null;
        if (this.onStateChange) {
          this.onStateChange({ isSpeaking: false, poi: null, lastPoi: this.lastPoi, wasSkipped: false });
        }
        resolve(false);
      };

      this.synth.speak(utterance);
    });
  }

  /**
   * 1-Tap Skip: Immediately cancel current narration and record as skipped
   */
  skip() {
    const skippedPoi = this.currentPoi;
    if (this.synth) {
      this.synth.cancel();
    }
    this.activeUtterance = null;
    if (this.speechHeartbeatTimer) {
      clearInterval(this.speechHeartbeatTimer);
      this.speechHeartbeatTimer = null;
    }
    this.isSpeaking = false;
    if (skippedPoi) {
      this.lastPoi = skippedPoi;
    }
    this.currentPoi = null;
    this.lastSpokenTime = Date.now() - (this.cooldownSeconds * 1000) + 5000; // Brief 5s pause before next

    if (this.onStateChange) {
      this.onStateChange({
        isSpeaking: false,
        poi: null,
        lastPoi: this.lastPoi,
        wasSkipped: true,
        skippedPoi: skippedPoi
      });
    }
    return skippedPoi;
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.activeUtterance = null;
    if (this.speechHeartbeatTimer) {
      clearInterval(this.speechHeartbeatTimer);
      this.speechHeartbeatTimer = null;
    }
    this.isSpeaking = false;
    this.currentPoi = null;
    if (this.onStateChange) {
      this.onStateChange({ isSpeaking: false, poi: null, lastPoi: this.lastPoi, wasSkipped: false });
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stop();
    return this.isMuted;
  }
}


// --- services/gps.js ---
/**
 * GPS & Route Simulation Service
 * Handles live browser Geolocation, speed-adaptive lookahead horizons,
 * forward heading cone filtering, and built-in Scenic Driving Routes for simulation.
 */
class GpsService {
  constructor() {
    this.watchId = null;
    this.currentPosition = null;
    this.previousPosition = null;
    this.heading = 0; // degrees (0 = North, 90 = East, 180 = South, 270 = West)
    this.speed = 0; // km/h
    this.isSimulating = false;
    this.simTimer = null;
    this.simIndex = 0;
    this.simSpeedMultiplier = 3; // default 3x speed for demo
    this.simRoutePoints = [];
    this.onLocationUpdate = null;
    this.lastGpsTimestamp = 0;
    this.watchdogTimer = null;
  }

  /**
   * Start tracking live hardware GPS
   */
  startLiveTracking() {
    this.stopSimulation();
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return false;
    }

    this.bindWatcher();
    this.startWatchdog();
    return true;
  }

  bindWatcher() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;
        this.lastGpsTimestamp = Date.now();
        this.updatePosition(latitude, longitude, heading, speed, false);
      },
      (err) => {
        console.warn('Geolocation watch notice:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000
      }
    );
  }

  startWatchdog() {
    this.stopWatchdog();
    // Hardware GPS keep-alive: if mobile OS deprioritizes watchPosition during screen lock / background,
    // trigger a direct single-shot position query to revive hardware chip.
    this.watchdogTimer = setInterval(() => {
      if (this.watchId !== null && navigator.geolocation) {
        const elapsed = Date.now() - this.lastGpsTimestamp;
        if (elapsed > 12000) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude, heading, speed } = pos.coords;
              this.lastGpsTimestamp = Date.now();
              this.updatePosition(latitude, longitude, heading, speed, false);
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
          );
        }
      }
    }, 10000);
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Instant GPS re-sync called immediately when app returns to foreground / phone unlocked
   */
  resyncLocation() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, heading, speed } = pos.coords;
          this.lastGpsTimestamp = Date.now();
          this.updatePosition(latitude, longitude, heading, speed, false);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
    }
  }

  stopLiveTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.stopWatchdog();
  }

  /**
   * Start simulated driving along any custom route polyline / waypoints
   * @param {Array} routeLatLngs - Array of [lat, lng] or {lat, lng} points
   */
  startSimulation(routeLatLngs) {
    this.stopLiveTracking();
    this.stopSimulation();

    if (!routeLatLngs || routeLatLngs.length < 2) {
      console.warn('Simulation requires at least 2 coordinate points');
      return false;
    }

    // Standardize input points to {lat, lng}
    const waypoints = routeLatLngs.map(pt => {
      if (Array.isArray(pt)) return { lat: pt[0], lng: pt[1] };
      return { lat: pt.lat, lng: pt.lng };
    });

    this.simRoutePoints = waypoints;
    this.isSimulating = true;
    this.simIndex = 0;

    // Generate interpolated points between polyline vertices for smooth vehicular motion
    const interpolatedRoute = this.generateSmoothRoute(waypoints);
    let currentStep = 0;

    // Trigger first position update immediately
    if (interpolatedRoute.length > 0) {
      const firstPt = interpolatedRoute[0];
      const secondPt = interpolatedRoute[1] || firstPt;
      const initialHeading = this.calculateBearing(firstPt.lat, firstPt.lng, secondPt.lat, secondPt.lng);
      this.updatePosition(firstPt.lat, firstPt.lng, initialHeading, 70, true);
    }

    this.simTimer = setInterval(() => {
      if (currentStep >= interpolatedRoute.length) {
        currentStep = 0; // Loop or continuous cruising
      }

      const pt = interpolatedRoute[currentStep];
      const nextPt = interpolatedRoute[(currentStep + 1) % interpolatedRoute.length];
      const calculatedHeading = this.calculateBearing(pt.lat, pt.lng, nextPt.lat, nextPt.lng);

      // Realistic cruising speed of ~75 km/h (47 mph)
      this.updatePosition(pt.lat, pt.lng, calculatedHeading, 75, true);
      currentStep++;
    }, Math.max(500 / this.simSpeedMultiplier, 100));

    return true;
  }

  /**
   * Interpolate between polyline points for ultra-smooth GPS motion
   */
  generateSmoothRoute(waypoints, maxStepMeters = 80) {
    if (!waypoints || waypoints.length === 0) return [];
    if (waypoints.length === 1) return [waypoints[0]];

    const smooth = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      
      const distDeg = Math.hypot(p2.lat - p1.lat, p2.lng - p1.lng);
      const steps = Math.max(1, Math.min(20, Math.round(distDeg * 400)));

      for (let s = 0; s < steps; s++) {
        const ratio = s / steps;
        smooth.push({
          lat: p1.lat + (p2.lat - p1.lat) * ratio,
          lng: p1.lng + (p2.lng - p1.lng) * ratio
        });
      }
    }
    smooth.push(waypoints[waypoints.length - 1]);
    return smooth;
  }

  stopSimulation() {
    this.isSimulating = false;
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  setSpeedMultiplier(mult) {
    this.simSpeedMultiplier = Math.max(1, mult);
    if (this.isSimulating && this.simRoutePoints.length > 0) {
      this.startSimulation(this.simRoutePoints);
    }
  }

  updatePosition(lat, lng, heading = null, speed = 0, isSimulated = false) {
    if (this.currentPosition) {
      this.previousPosition = { ...this.currentPosition };
    }

    let resolvedHeading = heading;
    if (resolvedHeading === null || isNaN(resolvedHeading)) {
      if (this.previousPosition) {
        resolvedHeading = this.calculateBearing(
          this.previousPosition.lat,
          this.previousPosition.lng,
          lat,
          lng
        );
      } else {
        resolvedHeading = 0;
      }
    }

    this.heading = resolvedHeading;
    this.speed = speed ? Math.round(speed * 3.6) : (isSimulated ? 65 : 0); // km/h

    // Calculate speed-adaptive lookahead distance (meters)
    // When driving 100 km/h, look ahead ~2,000m; when slow (20 km/h), look ahead 300m
    const lookaheadMeters = Math.max(300, Math.min(3500, (this.speed / 100) * 2500));
    const lookaheadCoords = this.projectCoordinates(lat, lng, this.heading, lookaheadMeters);

    this.currentPosition = {
      lat,
      lng,
      heading: this.heading,
      speed: this.speed,
      lookaheadLat: lookaheadCoords.lat,
      lookaheadLng: lookaheadCoords.lng,
      lookaheadMeters: lookaheadMeters,
      isSimulated,
      timestamp: Date.now()
    };

    if (this.onLocationUpdate) {
      this.onLocationUpdate(this.currentPosition);
    }
  }

  /**
   * Check if a POI is within the vehicle's forward viewing cone (e.g. ±60°)
   * Prevents alerting for landmarks already passed or on unreachable rear roads
   */
  isInForwardCone(poiLat, poiLng, maxAngleDegrees = 65) {
    if (!this.currentPosition) return true;
    
    // If vehicle is virtually stationary (< 10 km/h), allow 360 degree discovery
    if (this.speed < 10) return true;

    const poiBearing = this.calculateBearing(
      this.currentPosition.lat,
      this.currentPosition.lng,
      poiLat,
      poiLng
    );

    let angleDiff = Math.abs((poiBearing - this.heading + 180) % 360 - 180);
    return angleDiff <= maxAngleDegrees;
  }

  /**
   * Determine whether a POI is on the Driver's Left, Right, or Ahead
   */
  getRelativeDirection(poiLat, poiLng) {
    if (!this.currentPosition) return 'ahead';
    const poiBearing = this.calculateBearing(
      this.currentPosition.lat,
      this.currentPosition.lng,
      poiLat,
      poiLng
    );

    let diff = (poiBearing - this.heading + 360) % 360;
    if (diff > 180) diff -= 360; // range -180 to +180

    if (Math.abs(diff) < 25) return 'straight ahead';
    if (diff >= 25 && diff <= 120) return 'on your right';
    if (diff <= -25 && diff >= -120) return 'on your left';
    return 'behind you';
  }

  /**
   * Project a coordinate given a start point, bearing, and distance in meters
   */
  projectCoordinates(lat, lng, bearingDeg, distanceMeters) {
    const R = 6371e3; // Earth's radius in meters
    const d = distanceMeters / R;
    const brng = bearingDeg * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lng * Math.PI / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
      lat: lat2 * 180 / Math.PI,
      lng: lon2 * 180 / Math.PI
    };
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLambda = toRad(lon2 - lon1);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    return (toDeg(theta) + 360) % 360;
  }
}


// --- services/context-service.js ---
/**
 * Context & Ephemeral Moments Engine
 * Evaluates the traveler's current time of day, solar position, and surrounding environment
 * to highlight attractions that are uniquely rewarding *right now*.
 */
class ContextService {
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
        theme: 'slate',
        description: 'Quiet dark-sky overlooks, illuminated historic landmarks, and cool breezes.'
      };
    }
  }

  /**
   * Score a POI for its contextual relevance right now (solar time + live weather)
   * @param {Object} poi - POI object
   * @param {number} lat - Car latitude
   * @param {number} lng - Car longitude
   * @param {Object|null} weather - Live weather object
   * @returns {Object|null} Context badge information if particularly attractive right now
   */
  evaluatePoiMoment(poi, lat, lng, weather = null) {
    const phase = this.getTimePhase(lat, lng);
    const title = (poi.title || '').toLowerCase();
    const extract = (poi.extract || '').toLowerCase();
    const type = (poi.type || '').toLowerCase();

    // 1. Weather-driven contextual moments
    if (weather) {
      if (weather.severity === 'fog' && (type === 'viewpoint' || title.includes('bridge') || title.includes('forest') || title.includes('mountain'))) {
        return {
          badge: '🌫️ MISTY ATMOSPHERIC SPOT',
          note: 'Ethereal fog and cloud cover envelop this landmark right now',
          priority: true
        };
      }
      if ((weather.severity === 'rain_light' || weather.severity === 'rain_mod') && (title.includes('bakery') || title.includes('tea') || title.includes('museum') || title.includes('temple') || title.includes('church'))) {
        return {
          badge: '🌧️ RAINY DAY COZY RETREAT',
          note: 'Sheltered indoor discovery out of the wet road conditions',
          priority: true
        };
      }
      if (weather.severity === 'clear' && phase.id === 'golden_hour' && (type === 'viewpoint' || title.includes('overlook') || title.includes('bluff') || title.includes('peak') || title.includes('beach'))) {
        return {
          badge: '✨ PERFECT SUNSET CLARITY',
          note: 'Pristine clear skies with optimal golden sunlight alignment',
          priority: true
        };
      }
    }

    // 2. Solar time-of-day moments
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
          badge: '🌄 SERENE MORNING VIEW',
          note: 'Tranquil lighting and peaceful morning atmosphere',
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
      if (title.includes('observatory') || title.includes('bridge') || title.includes('fort') || title.includes('monument') || extract.includes('stargazing')) {
        return {
          badge: '🌌 NIGHTTIME ATMOSPHERE',
          note: 'Illuminated structures or quiet dark-sky stargazing',
          priority: false
        };
      }
    }

    return null;
  }
}


// --- services/detour-budget.js ---
/**
 * Detour Budget Service
 * Calculates the realistic detour time penalty (driving diversion + exploration dwell)
 * against the traveler's available "wandering slack".
 * Supports dynamic budget depletion as stops are visited.
 */
class DetourBudgetService {
  constructor(initialBudgetMinutes = 20) {
    this.initialBudgetMinutes = initialBudgetMinutes;
    this.budgetMinutes = initialBudgetMinutes;
    this.spentMinutes = 0;
    this.filterOnlyWithinBudget = false;
  }

  setBudget(minutes) {
    this.initialBudgetMinutes = Math.max(0, Number(minutes));
    this.budgetMinutes = Math.max(0, this.initialBudgetMinutes - this.spentMinutes);
  }

  /**
   * Deduct time spent at a visited stop from the slack budget
   */
  deductTime(minutes) {
    this.spentMinutes += Math.max(0, Number(minutes));
    this.budgetMinutes = Math.max(0, this.initialBudgetMinutes - this.spentMinutes);
    return this.budgetMinutes;
  }

  resetSpent() {
    this.spentMinutes = 0;
    this.budgetMinutes = this.initialBudgetMinutes;
  }

  /**
   * Estimate total time cost for a detour in minutes
   * @param {number} straightLineDistMeters - Distance from main route to POI
   * @returns {Object} { totalMinutes, driveMinutes, dwellMinutes, fitsBudget }
   */
  estimateDetourCost(straightLineDistMeters) {
    // Country / mountain roads typically have a curvature factor of ~1.35x
    const oneWayKm = (straightLineDistMeters * 1.35) / 1000;
    const roundTripKm = oneWayKm * 2;

    // Average side-road driving speed ~35 km/h
    const driveMinutes = Math.round((roundTripKm / 35) * 60);

    // Dwell time: brief stop to look, photograph, or absorb (minimum 5 mins)
    const dwellMinutes = straightLineDistMeters > 2000 ? 10 : 5;

    const totalMinutes = driveMinutes + dwellMinutes;
    const fitsBudget = totalMinutes <= this.budgetMinutes;

    return {
      totalMinutes,
      driveMinutes,
      dwellMinutes,
      fitsBudget,
      remainingSlack: this.budgetMinutes - totalMinutes
    };
  }

  /**
   * Format a badge or label for the UI
   */
  formatDetourBadge(straightLineDistMeters) {
    const cost = this.estimateDetourCost(straightLineDistMeters);
    if (cost.fitsBudget) {
      return {
        label: `⏱️ +${cost.totalMinutes}m Detour`,
        fits: true,
        desc: `Fits your ${this.budgetMinutes}m remaining budget (+${cost.driveMinutes}m drive, ${cost.dwellMinutes}m stop)`
      };
    } else {
      return {
        label: `⏳ +${cost.totalMinutes}m Detour`,
        fits: false,
        desc: `Exceeds remaining ${this.budgetMinutes}m budget by ${cost.totalMinutes - this.budgetMinutes}m`
      };
    }
  }
}


// --- services/heartbeat.js ---
/**
 * Silent Audio Heartbeat & MediaSession Service
 * Uses HTML5 Audio silent loop + MediaSession + Web Audio API to prevent
 * mobile OS (iOS Safari & Android Chrome) from throttling background GPS
 * and disconnecting WebSocket/network when the screen locks or when switching apps.
 */
class HeartbeatService {
  constructor() {
    this.audioElement = null;
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isActive = false;
  }

  /**
   * Create an inaudible HTML5 audio loop with valid silent PCM WAV data
   */
  getSilentAudio() {
    if (!this.audioElement && typeof Audio !== 'undefined') {
      // 1-second silent WAV base64
      const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      this.audioElement = new Audio(silentWav);
      this.audioElement.loop = true;
      this.audioElement.volume = 0.001; // Inaudible
    }
    return this.audioElement;
  }

  /**
   * Start the inaudible background audio loop on user interaction
   */
  async start() {
    if (this.isActive) return;

    try {
      // 1. Start HTML5 Audio element loop (critical for iOS Safari & Android Chrome background execution priority)
      const audio = this.getSilentAudio();
      if (audio) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('HTML5 Audio silent keepalive notice:', err.message);
          });
        }
      }

      // 2. Also initialize Web Audio API sub-audible oscillator as dual-layer fallback
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        if (!this.audioCtx) {
          this.audioCtx = new AudioContext();
        }
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }

        this.oscillator = this.audioCtx.createOscillator();
        this.gainNode = this.audioCtx.createGain();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.setValueAtTime(30, this.audioCtx.currentTime); // 30Hz sub-bass
        this.gainNode.gain.setValueAtTime(0.0001, this.audioCtx.currentTime); // Inaudible

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        this.oscillator.start();
      }

      this.isActive = true;
      this.setupMediaSession();
      console.log('Background GPS audio heartbeat activated.');
    } catch (e) {
      console.warn('Heartbeat initialization warning:', e);
    }
  }

  setupMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Wanderlust GPS Companion',
          artist: 'The Map Beyond The Directions',
          album: 'Road Trip Audio Companion',
          artwork: [
            { src: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/compass.svg', sizes: '512x512', type: 'image/svg+xml' }
          ]
        });

        // Handle lockscreen & bluetooth steering wheel buttons
        navigator.mediaSession.setActionHandler('play', () => this.start());
        navigator.mediaSession.setActionHandler('pause', () => {
          if (window.app && typeof window.app.skipCurrentStory === 'function') {
            window.app.skipCurrentStory();
          }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (window.app && typeof window.app.skipCurrentStory === 'function') {
            window.app.skipCurrentStory();
          }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (window.app && typeof window.app.replayLastStory === 'function') {
            window.app.replayLastStory();
          }
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          if (window.app && typeof window.app.skipCurrentStory === 'function') {
            window.app.skipCurrentStory();
          }
        });
      } catch (e) {
        console.warn('MediaSession handler registration notice:', e);
      }
    }
  }

  stop() {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (e) {}
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) {}
      this.oscillator = null;
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch (e) {}
    }
    this.isActive = false;
  }
}


// --- services/wake-lock.js ---
/**
 * Screen Wake Lock Service
 * Uses the W3C Screen Wake Lock API (navigator.wakeLock) to keep the display
 * lit and awake when driving in the foreground (like Google Maps/Waze).
 * Automatically re-acquires lock upon app visibility recovery.
 * 100% Client-side.
 */
class WakeLockService {
  constructor() {
    this.wakeLockSentinel = null;
    this.isEnabled = true; // Default to true for in-car road trip navigation
    this.onStateChange = null;
    this.isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    this.setupVisibilityListener();
  }

  setupVisibilityListener() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.isEnabled) {
        // Re-acquire wake lock when app returns to foreground
        await this.request();
      }
    });
  }

  /**
   * Request screen wake lock
   */
  async request() {
    if (!this.isSupported || !this.isEnabled) return false;

    // If already active and not released, return true
    if (this.wakeLockSentinel && !this.wakeLockSentinel.released) {
      return true;
    }

    try {
      this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener('release', () => {
        if (this.onStateChange) {
          this.onStateChange(this.isActive());
        }
      });
      if (this.onStateChange) {
        this.onStateChange(true);
      }
      console.log('Screen Wake Lock acquired: display will remain lit.');
      return true;
    } catch (err) {
      console.warn('Screen Wake Lock request notice:', err.message);
      if (this.onStateChange) {
        this.onStateChange(false);
      }
      return false;
    }
  }

  /**
   * Release screen wake lock
   */
  async release() {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (e) {}
      this.wakeLockSentinel = null;
    }
    if (this.onStateChange) {
      this.onStateChange(false);
    }
  }

  /**
   * Toggle user preference for keeping screen awake
   */
  async toggleEnabled(enabled = null) {
    this.isEnabled = (enabled !== null) ? Boolean(enabled) : !this.isEnabled;
    if (this.isEnabled) {
      await this.request();
    } else {
      await this.release();
    }
    return this.isEnabled;
  }

  isActive() {
    return Boolean(this.wakeLockSentinel && !this.wakeLockSentinel.released);
  }
}


// --- services/journal-service.js ---
/**
 * Serendipity Scrapbook & Auto-Journal Service
 * Records landmarks, vistas, and footnotes passed along the route
 * and persists illustrated road trip journals into IndexedDB.
 */
class JournalService {
  constructor(storageService = null) {
    this.storage = storageService;
    this.startTime = null;
    this.endTime = null;
    this.totalDistanceCoveredMeters = 0;
    this.lastPosition = null;
    this.entries = [];
    this.loggedIds = new Set();
  }

  startSession() {
    this.startTime = new Date();
    this.endTime = null;
    this.totalDistanceCoveredMeters = 0;
    this.lastPosition = null;
    this.entries = [];
    this.loggedIds.clear();
  }

  updateDistance(lat, lng) {
    if (this.lastPosition) {
      const d = this.calcDist(this.lastPosition.lat, this.lastPosition.lng, lat, lng);
      if (d > 5 && d < 1000) {
        this.totalDistanceCoveredMeters += d;
      }
    }
    this.lastPosition = { lat, lng };
  }

  logEncounter(poi, wasNarrated = false) {
    if (this.loggedIds.has(poi.id)) {
      if (wasNarrated) {
        const existing = this.entries.find(e => e.id === poi.id);
        if (existing) existing.wasNarrated = true;
      }
      return;
    }

    this.loggedIds.add(poi.id);
    const entry = {
      ...poi,
      loggedAt: new Date(),
      wasNarrated: wasNarrated
    };
    this.entries.push(entry);

    this.persistCurrentSession();
  }

  async persistCurrentSession() {
    if (!this.storage || this.entries.length === 0) return;
    const stats = this.getSummaryStats();
    const journalRecord = {
      id: `journal-${this.startTime ? this.startTime.getTime() : Date.now()}`,
      startTime: this.startTime ? this.startTime.toISOString() : new Date().toISOString(),
      stats: stats,
      entries: this.entries.map(e => ({
        ...e,
        loggedAt: e.loggedAt instanceof Date ? e.loggedAt.toISOString() : e.loggedAt
      }))
    };
    await this.storage.saveJournal(journalRecord);
  }

  getSummaryStats(unitSystem = 'metric') {
    const elapsedMinutes = this.startTime ? Math.round((new Date() - this.startTime) / 60000) : 0;
    const distanceKm = (this.totalDistanceCoveredMeters / 1000).toFixed(1);
    const distanceMiles = (this.totalDistanceCoveredMeters * 0.000621371).toFixed(1);
    const natureCount = this.entries.filter(e => e.source === 'osm' || (e.extract || '').toLowerCase().includes('waterfall') || (e.title || '').toLowerCase().includes('falls')).length;
    const historyCount = this.entries.length - natureCount;

    return {
      startTime: this.startTime,
      elapsedMinutes,
      distanceKm,
      distanceMiles,
      displayDistance: unitSystem === 'imperial' ? `${distanceMiles} mi` : `${distanceKm} km`,
      totalDiscoveries: this.entries.length,
      narratedCount: this.entries.filter(e => e.wasNarrated).length,
      natureCount,
      historyCount
    };
  }

  exportToMarkdown(unitSystem = 'metric') {
    const stats = this.getSummaryStats(unitSystem);
    const dateStr = this.startTime ? this.startTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Today';
    const distStr = unitSystem === 'imperial' ? `~${stats.distanceMiles} miles` : `~${stats.distanceKm} km`;

    let md = `# The Wandering Layer — Journey Scrapbook\n`;
    md += `*${dateStr}*\n\n`;
    md += `> "A map tells me there is a lake beyond the road I am taking... The question is whether, once the directions are set, we will still make the effort to look at the map."\n\n`;
    md += `### Journey Summary\n`;
    md += `- **Road Distance Scanned:** ${distStr}\n`;
    md += `- **Travel Duration:** ${stats.elapsedMinutes} minutes\n`;
    md += `- **Total Roadside Discoveries:** ${stats.totalDiscoveries} landmarks (${stats.natureCount} nature vistas, ${stats.historyCount} historic & cultural footnotes)\n`;
    md += `- **Stories Whispered:** ${stats.narratedCount}\n\n`;
    md += `---\n\n`;
    md += `### Roadside Timeline\n\n`;

    this.entries.forEach((entry, idx) => {
      const loggedTime = entry.loggedAt instanceof Date ? entry.loggedAt : new Date(entry.loggedAt);
      const timeStr = loggedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      md += `#### ${idx + 1}. ${entry.title} (${timeStr})\n`;
      if (entry.thumbnail) {
        md += `![${entry.title}](${entry.thumbnail})\n\n`;
      }
      md += `${entry.extract}\n\n`;
      md += `- **Type:** ${entry.source === 'wikipedia' ? 'Cultural & Historic Footnote' : (entry.source === 'wonder_pin' ? 'User Wonder Pin' : 'Natural Wonder')}\n`;
      md += `- **Coordinates:** \`${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}\` ([View in Google Maps](https://www.google.com/maps/dir/?api=1&destination=${entry.lat},${entry.lng}))\n\n`;
    });

    return md;
  }

  calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}


// --- services/personas.js ---
/**
 * Companion Personas Service
 * Provides customizable narrative lenses and voice modulations
 * for the passenger-seat storyteller.
 */
const PERSONAS = {
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

class PersonaService {
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
    const maxSentences = options.isConcise ? 1 : (options.maxSentences || 2);
    const rawBody = poi.extract || poi.shortDescription || '';
    const extract = cleanAndSplitSentences(rawBody, maxSentences);

    return {
      text: `${intro} ${extract} ${closing}`.replace(/\s+/g, ' ').trim(),
      rate: p.rate,
      pitch: p.pitch
    };
  }
}


// --- services/weather-service.js ---
/**
 * Weather Service — The Wandering Layer
 * Real-time atmospheric conditions & predictive en-route weather forecasts.
 * Powered by Open-Meteo High-Resolution Global Weather API.
 * 100% Free forever ($0.00), zero API keys, privacy-first.
 */

class WeatherService {
  constructor() {
    this.lastWeatherFetch = null;
    this.currentWeather = null;
    this.lastCoords = null;
    this.cacheExpiryMs = 10 * 60 * 1000; // 10 minutes cache
    this.activeHazards = [];
  }

  /**
   * Convert WMO Weather Interpretation Code to human label & icon
   * Standard WMO Code Table 4677
   */
  getWmoDetails(code, isDay = 1) {
    const table = {
      0: { label: isDay ? 'Clear Sky' : 'Clear Night', icon: isDay ? '☀️' : '🌙', severity: 'clear' },
      1: { label: 'Mainly Clear', icon: isDay ? '🌤️' : '🌤️', severity: 'clear' },
      2: { label: 'Partly Cloudy', icon: '⛅', severity: 'cloudy' },
      3: { label: 'Overcast', icon: '☁️', severity: 'cloudy' },
      45: { label: 'Foggy', icon: '🌫️', severity: 'fog' },
      48: { label: 'Depositing Rime Fog', icon: '🌫️', severity: 'fog' },
      51: { label: 'Light Drizzle', icon: '🌦️', severity: 'rain_light' },
      53: { label: 'Moderate Drizzle', icon: '🌦️', severity: 'rain_light' },
      55: { label: 'Dense Drizzle', icon: '🌧️', severity: 'rain_mod' },
      56: { label: 'Light Freezing Drizzle', icon: '🌨️', severity: 'freezing' },
      57: { label: 'Dense Freezing Drizzle', icon: '🌨️', severity: 'freezing' },
      61: { label: 'Slight Rain', icon: '🌧️', severity: 'rain_light' },
      63: { label: 'Moderate Rain', icon: '🌧️', severity: 'rain_mod' },
      65: { label: 'Heavy Rain', icon: '🌧️', severity: 'rain_heavy' },
      66: { label: 'Light Freezing Rain', icon: '🌨️', severity: 'freezing' },
      67: { label: 'Heavy Freezing Rain', icon: '🌨️', severity: 'freezing' },
      71: { label: 'Slight Snow Fall', icon: '❄️', severity: 'snow' },
      73: { label: 'Moderate Snow Fall', icon: '❄️', severity: 'snow' },
      75: { label: 'Heavy Snow Fall', icon: '❄️', severity: 'snow' },
      77: { label: 'Snow Grains', icon: '❄️', severity: 'snow' },
      80: { label: 'Slight Rain Showers', icon: '🌦️', severity: 'rain_light' },
      81: { label: 'Moderate Rain Showers', icon: '🌧️', severity: 'rain_mod' },
      82: { label: 'Violent Rain Showers', icon: '⛈️', severity: 'rain_heavy' },
      85: { label: 'Slight Snow Showers', icon: '🌨️', severity: 'snow' },
      86: { label: 'Heavy Snow Showers', icon: '🌨️', severity: 'snow' },
      95: { label: 'Thunderstorm', icon: '⛈️', severity: 'storm' },
      96: { label: 'Thunderstorm with Slight Hail', icon: '⛈️', severity: 'storm' },
      99: { label: 'Thunderstorm with Heavy Hail', icon: '⛈️', severity: 'storm' }
    };

    return table[code] || { label: 'Fair Weather', icon: isDay ? '☀️' : '🌙', severity: 'clear' };
  }

  /**
   * Fetch current real-time weather at coordinates
   */
  async getCurrentWeather(lat, lng, unitSystem = 'imperial') {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

    // Return cached if within 10 minutes and within 5km
    const now = Date.now();
    if (this.currentWeather && this.lastCoords &&
        (now - this.lastWeatherFetch < this.cacheExpiryMs) &&
        this.calcDistMeters(lat, lng, this.lastCoords.lat, this.lastCoords.lng) < 5000) {
      return this.currentWeather;
    }

    const tempUnit = unitSystem === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = unitSystem === 'imperial' ? 'mph' : 'kmh';
    const precipUnit = unitSystem === 'imperial' ? 'inch' : 'mm';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,visibility&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&precipitation_unit=${precipUnit}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();

      const curr = data.current;
      if (!curr) return null;

      const wmo = this.getWmoDetails(curr.weather_code, curr.is_day);
      const tempSymbol = unitSystem === 'imperial' ? '°F' : '°C';
      const speedSymbol = unitSystem === 'imperial' ? 'mph' : 'km/h';

      const weatherObj = {
        temp: Math.round(curr.temperature_2m),
        feelsLike: Math.round(curr.apparent_temperature),
        tempDisplay: `${Math.round(curr.temperature_2m)}${tempSymbol}`,
        feelsLikeDisplay: `${Math.round(curr.apparent_temperature)}${tempSymbol}`,
        wmoCode: curr.weather_code,
        condition: wmo.label,
        icon: wmo.icon,
        severity: wmo.severity,
        isDay: curr.is_day === 1,
        windSpeed: Math.round(curr.wind_speed_10m),
        windGusts: Math.round(curr.wind_gusts_10m || curr.wind_speed_10m),
        windDisplay: `${Math.round(curr.wind_speed_10m)} ${speedSymbol}`,
        visibilityMeters: curr.visibility || 10000,
        precipitation: curr.precipitation || 0,
        rain: curr.rain || 0,
        hazards: this.evaluateHazards(curr, wmo, unitSystem),
        timestamp: Date.now()
      };

      this.currentWeather = weatherObj;
      this.lastCoords = { lat, lng };
      this.lastWeatherFetch = now;
      return weatherObj;
    } catch (e) {
      console.warn('Weather fetch error:', e);
      return null;
    }
  }

  /**
   * Predictive Route Weather Forecasting
   * Samples 3–4 checkpoints along the route and computes weather at estimated time of arrival (ETA)
   */
  async getRouteWeatherForecast(routeLatLngs, totalDurationMinutes, unitSystem = 'imperial') {
    if (!routeLatLngs || routeLatLngs.length < 2) return [];

    const tempUnit = unitSystem === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = unitSystem === 'imperial' ? 'mph' : 'kmh';
    const precipUnit = unitSystem === 'imperial' ? 'inch' : 'mm';
    const tempSymbol = unitSystem === 'imperial' ? '°F' : '°C';

    // 4 Checkpoints: Start (0%), Corridor Mid 1 (33%), Corridor Mid 2 (66%), Destination (100%)
    const checkpoints = [
      { label: 'Departure', ratio: 0.05, etaMinutes: 0 },
      { label: 'Mid-Route (1/3)', ratio: 0.35, etaMinutes: Math.round(totalDurationMinutes * 0.35) },
      { label: 'Mid-Route (2/3)', ratio: 0.70, etaMinutes: Math.round(totalDurationMinutes * 0.70) },
      { label: 'Arrival', ratio: 0.98, etaMinutes: totalDurationMinutes }
    ];

    const currentHourIndex = new Date().getHours();

    const fetchPromises = checkpoints.map(async (cp) => {
      const idx = Math.floor(cp.ratio * (routeLatLngs.length - 1));
      const pt = routeLatLngs[idx];
      if (!pt) return null;

      const etaHoursAhead = Math.max(0, Math.round(cp.etaMinutes / 60));
      const targetHourIndex = Math.min(23, currentHourIndex + etaHoursAhead);

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt[0].toFixed(4)}&longitude=${pt[1].toFixed(4)}&current=temperature_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,visibility&hourly=temperature_2m,precipitation_probability,weather_code,visibility&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&precipitation_unit=${precipUnit}&forecast_hours=12`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const data = await res.json();

        let temp = Math.round(data.current?.temperature_2m || 70);
        let code = data.current?.weather_code || 0;
        let precipProb = 0;
        let vis = data.current?.visibility || 10000;

        if (data.hourly && data.hourly.temperature_2m && data.hourly.temperature_2m[targetHourIndex] !== undefined) {
          temp = Math.round(data.hourly.temperature_2m[targetHourIndex]);
          code = data.hourly.weather_code ? data.hourly.weather_code[targetHourIndex] : code;
          precipProb = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[targetHourIndex] : 0;
          vis = data.hourly.visibility ? data.hourly.visibility[targetHourIndex] : vis;
        }

        const isDayTime = (currentHourIndex + etaHoursAhead >= 6 && currentHourIndex + etaHoursAhead <= 20) ? 1 : 0;
        const wmo = this.getWmoDetails(code, isDayTime);

        let hazardNote = null;
        if (vis < 1500) hazardNote = '🌫️ Mountain Fog / Low Visibility';
        else if (wmo.severity === 'storm' || precipProb > 65) hazardNote = '⛈️ Heavy Rain / Storm Chance';
        else if (wmo.severity === 'snow') hazardNote = '❄️ Snowfall Expected';
        else if (temp <= (unitSystem === 'imperial' ? 32 : 0)) hazardNote = '🧊 Freezing Conditions';

        return {
          label: cp.label,
          etaMinutes: cp.etaMinutes,
          etaDisplay: cp.etaMinutes === 0 ? 'Now' : `+${cp.etaMinutes}m ETA`,
          lat: pt[0],
          lng: pt[1],
          temp: temp,
          tempDisplay: `${temp}${tempSymbol}`,
          condition: wmo.label,
          icon: wmo.icon,
          precipProb: precipProb,
          hazardNote: hazardNote
        };
      } catch (e) {
        return null;
      }
    });

    const results = await Promise.allSettled(fetchPromises);
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
  }

  /**
   * Predictive weather at a specific coordinate and specific ETA/arrival time
   * Crucial for open-air roadside markets, farm stalls, and scenic viewpoints
   */
  async getPointForecastAtTime(lat, lng, etaMinutes = 0, departureDate = new Date(), unitSystem = 'imperial') {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

    const tempUnit = unitSystem === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = unitSystem === 'imperial' ? 'mph' : 'kmh';
    const precipUnit = unitSystem === 'imperial' ? 'inch' : 'mm';
    const tempSymbol = unitSystem === 'imperial' ? '°F' : '°C';

    const arrivalDate = new Date(departureDate.getTime() + (etaMinutes * 60 * 1000));
    const arrivalHour = arrivalDate.getHours();
    const arrivalTimeFormatted = arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,visibility&hourly=temperature_2m,precipitation_probability,weather_code,visibility&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&precipitation_unit=${precipUnit}&forecast_hours=24`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();

      let temp = Math.round(data.current?.temperature_2m || 70);
      let code = data.current?.weather_code || 0;
      let precipProb = 0;
      let vis = data.current?.visibility || 10000;

      if (data.hourly && data.hourly.temperature_2m && data.hourly.temperature_2m[arrivalHour] !== undefined) {
        temp = Math.round(data.hourly.temperature_2m[arrivalHour]);
        code = data.hourly.weather_code ? data.hourly.weather_code[arrivalHour] : code;
        precipProb = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[arrivalHour] : 0;
        vis = data.hourly.visibility ? data.hourly.visibility[arrivalHour] : vis;
      }

      const isDayTime = (arrivalHour >= 6 && arrivalHour <= 20) ? 1 : 0;
      const wmo = this.getWmoDetails(code, isDayTime);

      let suitabilityNote = 'Pleasant conditions for visiting';
      let isAdverse = false;
      if (wmo.severity === 'storm' || precipProb > 60) {
        suitabilityNote = '🌧️ Rain or storm likely at arrival time';
        isAdverse = true;
      } else if (vis < 1500) {
        suitabilityNote = '🌫️ Low visibility / mountain fog';
      } else if (temp >= (unitSystem === 'imperial' ? 88 : 31)) {
        suitabilityNote = '☀️ Warm & sunny weather';
      } else if (temp <= (unitSystem === 'imperial' ? 38 : 3)) {
        suitabilityNote = '❄️ Chilly weather, dress warmly';
      }

      return {
        lat,
        lng,
        temp,
        tempDisplay: `${temp}${tempSymbol}`,
        condition: wmo.label,
        icon: wmo.icon,
        precipProb,
        arrivalTimeFormatted,
        etaMinutes,
        suitabilityNote,
        isAdverse
      };
    } catch (e) {
      console.warn('Point weather error:', e);
      return null;
    }
  }

  /**
   * Evaluate active driving hazards
   */
  evaluateHazards(curr, wmo, unitSystem) {
    const hazards = [];
    const isImperial = unitSystem === 'imperial';

    // 1. Fog / Low Visibility
    if (curr.visibility && curr.visibility < 1200) {
      hazards.push({
        type: 'fog',
        icon: '🌫️',
        level: 'warning',
        title: 'Dense Fog Warning',
        text: 'Visibility reduced under 1.2 km. Maintain safe driving distance.'
      });
    }

    // 2. Heavy Rain / Thunderstorms
    if (wmo.severity === 'storm' || (curr.rain && curr.rain > 3)) {
      hazards.push({
        type: 'storm',
        icon: '⛈️',
        level: 'danger',
        title: 'Severe Rain & Thunderstorm',
        text: 'Wet road surfaces and reduced tire traction along this stretch.'
      });
    }

    // 3. High Winds
    const windSpeed = curr.wind_speed_10m || 0;
    const windGusts = curr.wind_gusts_10m || windSpeed;
    const highWindThreshold = isImperial ? 28 : 45;
    if (windGusts > highWindThreshold) {
      hazards.push({
        type: 'wind',
        icon: '💨',
        level: 'warning',
        title: 'High Crosswinds',
        text: `Gusts up to ${Math.round(windGusts)} ${isImperial ? 'mph' : 'km/h'}. Exercise caution on bridges and open bluffs.`
      });
    }

    // 4. Freezing Temps
    const temp = curr.temperature_2m;
    const freezeLimit = isImperial ? 32 : 0;
    if (temp <= freezeLimit && (curr.precipitation > 0 || wmo.severity === 'snow' || wmo.severity === 'freezing')) {
      hazards.push({
        type: 'ice',
        icon: '❄️',
        level: 'danger',
        title: 'Freezing / Black Ice Risk',
        text: 'Sub-freezing road temperatures with moisture.'
      });
    }

    return hazards;
  }

  calcDistMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}


// --- services/route-service.js ---
/**
 * Route & Corridor Service
 * Powered by Open Source Routing Machine (OSRM) and Photon by Komoot.
 * Features Topological Waypoint Sequencing for natural Google Maps routing
 * and Corridor Pre-Caching for offline mountain road trips.
 * 100% Free, zero API keys.
 */
class RouteService {
  constructor(wikiService, osmService = null, storageService = null, weatherService = null) {
    this.wiki = wikiService;
    this.osm = osmService;
    this.storage = storageService;
    this.weather = weatherService;
    this.currentRoute = null;
    this.selectedWaypoints = [];
  }

  /**
   * Search for autocomplete suggestions as user types
   */
  async searchSuggestions(query) {
    if (!query || query.trim().length < 2) return [];

    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query.trim())}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Photon error ${res.status}`);
      const data = await res.json();

      if (!data?.features) return [];

      return data.features.map(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates; // [lon, lat]

        const title = props.name || props.city || props.street || query;
        const subtitleParts = [
          props.city !== title ? props.city : null,
          props.district,
          props.state,
          props.country
        ].filter(Boolean);

        return {
          title: title,
          subtitle: subtitleParts.join(', '),
          lat: coords[1],
          lng: coords[0]
        };
      });
    } catch (e) {
      console.warn('Photon search error:', e);
      return [];
    }
  }

  /**
   * Reverse geocode a coordinate to a place name
   */
  async reverseGeocode(lat, lng) {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const city = data.city || data.locality || data.principalSubdivision || 'My Location';
        const region = data.principalSubdivision && data.principalSubdivision !== city ? data.principalSubdivision : (data.countryName || '');
        return region ? `${city}, ${region}` : city;
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
    return `Current Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
  }

  /**
   * Resolve a query string to coordinates with multi-tier failover
   */
  async geocode(query) {
    if (!query) return null;
    query = query.trim().replace(/^📍\s*/, '');

    // 1. Coordinate string directly (e.g. "37.77, -122.41")
    const coordMatch = query.match(/^([-+]?\d+(\.\d+)?),\s*([-+]?\d+(\.\d+)?)$/);
    if (coordMatch) {
      return {
        name: query,
        lat: parseFloat(coordMatch[1]),
        lng: parseFloat(coordMatch[3])
      };
    }

    // 2. Primary Geocoder: Photon (Komoot)
    try {
      const suggestions = await this.searchSuggestions(query);
      if (suggestions && suggestions.length > 0) {
        return {
          name: suggestions[0].title,
          fullName: `${suggestions[0].title}, ${suggestions[0].subtitle}`,
          lat: suggestions[0].lat,
          lng: suggestions[0].lng
        };
      }
    } catch (e) {
      console.warn('Photon geocoding error:', e);
    }

    // 3. Fallback Geocoder: Open-Meteo High-Speed Global Search
    try {
      const meteoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
      const res = await fetch(meteoUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const r = data.results[0];
          return {
            name: r.name,
            fullName: `${r.name}, ${r.admin1 || ''} ${r.country || ''}`.trim(),
            lat: r.latitude,
            lng: r.longitude
          };
        }
      }
    } catch (e) {
      console.warn('Open-Meteo geocoding error:', e);
    }

    // 4. Fallback Geocoder: OpenStreetMap Nominatim
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
      const res = await fetch(nomUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          return {
            name: data[0].display_name.split(',')[0],
            fullName: data[0].display_name,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          };
        }
      }
    } catch (e) {
      console.warn('Nominatim geocoding error:', e);
    }

    return null;
  }

  /**
   * Reverse geocode coordinates to human-readable city/region name
   */
  async reverseGeocode(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return 'Current Location';

    // 1. BigDataCloud high-speed client-side reverse geocoding
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const city = data.city || data.locality || data.principalSubdivision || data.countryName;
        if (city) {
          const state = data.principalSubdivisionCode ? data.principalSubdivisionCode.split('-').pop() : (data.principalSubdivision || '');
          return state && state !== city ? `${city}, ${state}` : city;
        }
      }
    } catch (e) {
      console.warn('BigDataCloud reverse geocode error:', e);
    }

    // 2. OpenStreetMap Nominatim fallback
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`;
      const res = await fetch(nomUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.county;
          const state = data.address.state || data.address.country;
          if (city) return state ? `${city}, ${state}` : city;
        }
        if (data && data.display_name) return data.display_name.split(',')[0];
      }
    } catch (e) {
      console.warn('Nominatim reverse geocode error:', e);
    }

    return `Location (${Number(lat).toFixed(3)}, ${Number(lng).toFixed(3)})`;
  }

  /**
   * Calculate single reliable driving route between two points
   */
  async calculateRoute(start, end) {
    if (!start || !end || isNaN(start.lat) || isNaN(start.lng) || isNaN(end.lat) || isNaN(end.lng)) {
      console.warn('Invalid route coordinates:', start, end);
      return null;
    }

    const endpoints = [
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`,
      `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
    ];

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const r = data.routes[0];
          const latLngs = r.geometry.coordinates.map(coord => [coord[1], coord[0]]);
          const curvature = this.calculateCurvature(latLngs);

          const route = {
            id: `route-${start.name}-${end.name}`.replace(/[^a-zA-Z0-9]/g, '_'),
            start,
            end,
            distanceMeters: r.distance,
            distanceKm: (r.distance / 1000).toFixed(1),
            distanceMiles: (r.distance * 0.000621371).toFixed(1),
            durationSeconds: r.duration,
            durationMinutes: Math.max(1, Math.round(r.duration / 60)),
            latLngs: latLngs,
            rawGeoJson: r.geometry,
            curvatureRatio: curvature.curvatureRatio,
            comfortScore: curvature.comfortScore,
            comfortLabel: curvature.comfortLabel,
            legs: r.legs || []
          };

          this.currentRoute = route;
          return route;
        }
      } catch (e) {
        console.warn(`Route mirror failed (${url}):`, e);
      }
    }

    // Failover: Generate smooth local driving route corridor
    const fallback = this.generateFallbackRoute(start, end);
    this.currentRoute = fallback;
    return fallback;
  }

  async calculateAlternativeRoutes(start, end) {
    const route = await this.calculateRoute(start, end);
    return route ? [route] : [];
  }

  calculateCurvature(latLngs) {
    if (!latLngs || latLngs.length < 3) {
      return { curvatureRatio: 20, comfortScore: 95, comfortLabel: 'Smooth Wide Highway' };
    }

    let totalAngleChange = 0;
    let totalDistMeters = 0;

    for (let i = 1; i < latLngs.length - 1; i++) {
      const p0 = latLngs[i - 1];
      const p1 = latLngs[i];
      const p2 = latLngs[i + 1];

      const b1 = this.calcBearing(p0[0], p0[1], p1[0], p1[1]);
      const b2 = this.calcBearing(p1[0], p1[1], p2[0], p2[1]);
      const diff = Math.abs((b2 - b1 + 180) % 360 - 180);

      if (diff > 12) {
        totalAngleChange += diff;
      }
      totalDistMeters += this.calcDist(p0[0], p0[1], p1[0], p1[1]);
    }

    const distKm = Math.max(1, totalDistMeters / 1000);
    const curvatureRatio = Math.round(totalAngleChange / distKm);

    let comfortScore = Math.max(55, Math.min(98, Math.round(100 - (curvatureRatio * 0.35))));
    let comfortLabel = 'Smooth Straight Highway (Relaxed)';

    if (curvatureRatio > 100) {
      comfortLabel = 'Spirited Curves & Hills (Engaging)';
      comfortScore = Math.max(60, comfortScore);
    } else if (curvatureRatio > 50) {
      comfortLabel = 'Gentle Curves & Open Road';
    }

    return { curvatureRatio, comfortScore, comfortLabel };
  }

  /**
   * Generate realistic local fallback route geometry if remote routing servers fail/timeout
   */
  generateFallbackRoute(start, end) {
    const lat1 = start.lat;
    const lon1 = start.lng;
    const lat2 = end.lat;
    const lon2 = end.lng;

    const directDistMeters = this.calcDist(lat1, lon1, lat2, lon2);
    const roadDistMeters = directDistMeters * 1.25;
    const roadDistKm = roadDistMeters / 1000;
    const durationMinutes = Math.max(5, Math.round((roadDistKm / 75) * 60));

    const steps = 60;
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const perpFactor = Math.sin(f * Math.PI) * 0.035;
      const lat = lat1 + (lat2 - lat1) * f + (lon2 - lon1) * perpFactor;
      const lon = lon1 + (lon2 - lon1) * f - (lat2 - lat1) * perpFactor;
      coords.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
    }

    const curvature = this.calculateCurvature(coords);

    return {
      id: `route-${start.name}-${end.name}`.replace(/[^a-zA-Z0-9]/g, '_'),
      start,
      end,
      distanceMeters: roadDistMeters,
      distanceKm: roadDistKm.toFixed(1),
      distanceMiles: (roadDistMeters * 0.000621371).toFixed(1),
      durationSeconds: durationMinutes * 60,
      durationMinutes: durationMinutes,
      latLngs: coords,
      rawGeoJson: { type: 'LineString', coordinates: coords.map(c => [c[1], c[0]]) },
      curvatureRatio: curvature.curvatureRatio,
      comfortScore: curvature.comfortScore,
      comfortLabel: curvature.comfortLabel,
      legs: []
    };
  }

  /**
   * Generate realistic local fallback route geometries if all remote routing servers fail/timeout
   */
  generateFallbackRoutes(start, end) {
    const lat1 = start.lat;
    const lon1 = start.lng;
    const lat2 = end.lat;
    const lon2 = end.lng;

    const directDistMeters = this.calcDist(lat1, lon1, lat2, lon2);
    const roadDistMeters = directDistMeters * 1.28; // standard highway distance multiplier
    const roadDistKm = roadDistMeters / 1000;
    const durationMinutes = Math.max(5, Math.round((roadDistKm / 75) * 60));

    // Route 1: Direct Highway Path (smooth spline with gentle highway deviation)
    const steps = 60;
    const coords1 = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const perpFactor = Math.sin(f * Math.PI) * 0.04;
      const lat = lat1 + (lat2 - lat1) * f + (lon2 - lon1) * perpFactor;
      const lon = lon1 + (lon2 - lon1) * f - (lat2 - lat1) * perpFactor;
      coords1.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
    }

    // Route 2: Scenic Mountain/Countryside Arc (Alternate corridor with more curvature)
    const coords2 = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const perpFactor = -Math.sin(f * Math.PI) * 0.08;
      const lat = lat1 + (lat2 - lat1) * f + (lon2 - lon1) * perpFactor;
      const lon = lon1 + (lon2 - lon1) * f - (lat2 - lat1) * perpFactor;
      coords2.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
    }

    return [
      {
        index: 0,
        id: `route-${start.name}-${end.name}-0`.replace(/[^a-zA-Z0-9]/g, '_'),
        start,
        end,
        distanceMeters: roadDistMeters,
        distanceKm: roadDistKm.toFixed(1),
        distanceMiles: (roadDistMeters * 0.000621371).toFixed(1),
        durationSeconds: durationMinutes * 60,
        durationMinutes: durationMinutes,
        latLngs: coords1,
        rawGeoJson: { type: 'LineString', coordinates: coords1.map(c => [c[1], c[0]]) },
        legs: []
      },
      {
        index: 1,
        id: `route-${start.name}-${end.name}-1`.replace(/[^a-zA-Z0-9]/g, '_'),
        start,
        end,
        distanceMeters: roadDistMeters * 1.12,
        distanceKm: (roadDistKm * 1.12).toFixed(1),
        distanceMiles: (roadDistMeters * 1.12 * 0.000621371).toFixed(1),
        durationSeconds: Math.round(durationMinutes * 1.18 * 60),
        durationMinutes: Math.round(durationMinutes * 1.18),
        latLngs: coords2,
        rawGeoJson: { type: 'LineString', coordinates: coords2.map(c => [c[1], c[0]]) },
        legs: []
      }
    ];
  }

  calcBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLambda = toRad(lon2 - lon1);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    return (toDeg(theta) + 360) % 360;
  }

  sequenceWaypointsTopologically(waypoints, latLngs = null) {
    return this.sequenceWaypoints(waypoints, latLngs);
  }

  /**
   * Semantically classify POI into one of 4 major road trip categories:
   * 'nature' | 'history' | 'food' | 'gems'
   */
  classifyCategory(poi) {
    if (!poi) return { key: 'gems', label: 'Travel Gems & Lore', icon: '🧭' };

    const type = (poi.type || '').toLowerCase();
    const cat = (poi.category || '').toLowerCase();
    const text = `${poi.title || ''} ${poi.extract || ''} ${poi.shortDescription || ''}`.toLowerCase();

    // 1. Food & Drink / Bakeries / Markets / Wineries / Farms
    if (
      cat === 'food_craft' ||
      ['bakery', 'cafe', 'marketplace', 'farm', 'restaurant', 'winery', 'brewery', 'pub', 'ice_cream', 'deli'].includes(type) ||
      /\b(bakery|cafe|coffee|roastery|brewery|winery|vineyard|orchard|farm|market|produce|cheese|cider|chocolat|eatery|tasting)\b/i.test(text)
    ) {
      return { key: 'food', label: 'Food & Bakeries', icon: '🍞' };
    }

    // 2. Nature & Scenic / Views / Waterfalls / Mountains
    if (
      cat === 'vista' ||
      ['waterfall', 'viewpoint', 'peak', 'natural', 'spring', 'cave_entrance', 'picnic_site'].includes(type) ||
      /\b(waterfall|falls|viewpoint|overlook|scenic|mountain|peak|summit|ridge|canyon|gorge|lake|river|creek|beach|cove|park|preserve|reserve|forest|trail|cave|spring|valley)\b/i.test(text)
    ) {
      return { key: 'nature', label: 'Nature & Scenic', icon: '🌲' };
    }

    // 3. History & Heritage / Castles / Monuments / Ruins / Museums
    if (
      cat === 'lore' ||
      ['historic', 'castle', 'ruins', 'archaeological_site', 'monument', 'wayside_shrine', 'memorial', 'battlefield'].includes(type) ||
      /\b(historic|history|castle|ruin|fort|fortress|monument|memorial|museum|heritage|archaeolog|battle|ancient|century|shrine|cathedral|church|chapel|temple|mission|mansion|landmark)\b/i.test(text)
    ) {
      return { key: 'history', label: 'History & Heritage', icon: '🏛️' };
    }

    // 4. Default: Travel Gems & Lore
    return { key: 'gems', label: 'Travel Gems & Lore', icon: '🧭' };
  }

  /**
   * Fast corridor discovery along polyline with predictive arrival-time weather
   * Queries Wikipedia, Wikivoyage, OSM (markets, viewpoints, farm stands, castles, ruins),
   * and samples continuously every 15-25 km across the entire driving journey.
   */
  async discoverCorridorWaypoints(corridorRadiusMeters = 5000, departureDate = new Date(), unitSystem = 'imperial') {
    if (!this.currentRoute || !this.currentRoute.latLngs) return [];

    const latLngs = this.currentRoute.latLngs;
    if (latLngs.length < 2) return [];

    // Calculate total polyline distance
    const totalDistMeters = this.currentRoute.distanceMeters || this.calcTotalPolylineDistance(latLngs);
    
    // Dynamically sample scan anchors every 18-25 km along the route
    const stepMeters = Math.max(12000, Math.min(28000, totalDistMeters / 18));
    const sampledPoints = this.samplePolylineByDistance(latLngs, stepMeters);

    const allDiscovered = new Map();

    const fetchPromises = sampledPoints.map(async (pt) => {
      const [wikiRes, osmRes] = await Promise.allSettled([
        this.wiki ? this.wiki.findNearby(pt[0], pt[1], Math.max(corridorRadiusMeters, 5000), 8) : Promise.resolve([]),
        this.osm ? this.osm.findNearby(pt[0], pt[1], Math.max(corridorRadiusMeters, 5000)) : Promise.resolve([])
      ]);
      const wikiPois = wikiRes.status === 'fulfilled' ? wikiRes.value : [];
      const osmPois = osmRes.status === 'fulfilled' ? osmRes.value : [];
      return [...wikiPois, ...osmPois];
    });

    const batches = await Promise.allSettled(fetchPromises);
    batches.forEach(result => {
      const pois = result.status === 'fulfilled' ? result.value : [];

      pois.forEach(poi => {
        if (!allDiscovered.has(poi.id)) {
          const { minDistance, projectionDistance } = this.calculateRouteProjection(poi.lat, poi.lng, latLngs);

          // Only keep POIs within 6.5 km corridor of the actual driving route
          if (minDistance > 6500) return;

          const roundTripDetourKm = (minDistance * 1.35 * 2) / 1000;
          const detourDriveMinutes = Math.round((roundTripDetourKm / 35) * 60);
          const dwellMinutes = minDistance > 2000 ? 10 : 5;

          const routeDist = this.currentRoute.distanceMeters || totalDistMeters || 1;
          const fraction = Math.min(1, Math.max(0, projectionDistance / routeDist));
          const etaMinutes = Math.round(fraction * (this.currentRoute.durationMinutes || 0));

          const catInfo = this.classifyCategory(poi);
          poi.categoryKey = catInfo.key;
          poi.categoryLabel = catInfo.label;
          poi.categoryIcon = catInfo.icon;

          poi.distanceFromRouteMeters = Math.round(minDistance);
          poi.projectionDistanceMeters = projectionDistance;
          poi.detourMinutes = detourDriveMinutes + dwellMinutes;
          poi.etaMinutes = etaMinutes;
          poi.detourType = this.classifyDetourType(minDistance);
          poi.sunsetMatch = this.checkSunsetMatch(poi, departureDate);

          allDiscovered.set(poi.id, poi);
        }
      });
    });

    // Also include user wonder pins that lie along this corridor
    if (this.storage) {
      try {
        const userPins = await this.storage.getAllWonderPins();
        userPins.forEach(pin => {
          const { minDistance, projectionDistance } = this.calculateRouteProjection(pin.lat, pin.lng, latLngs);
          if (minDistance <= 6500) {
            const fraction = Math.min(1, Math.max(0, projectionDistance / (totalDistMeters || 1)));
            const etaMinutes = Math.round(fraction * (this.currentRoute.durationMinutes || 0));
            const catInfo = this.classifyCategory(pin);
            const detourType = this.classifyDetourType(minDistance);
            const sunsetMatch = this.checkSunsetMatch({ ...pin, categoryKey: catInfo.key, etaMinutes }, departureDate);

            allDiscovered.set(pin.id, {
              id: pin.id,
              source: 'wonder_pin',
              title: pin.title,
              extract: pin.note,
              shortDescription: 'Your Wonder Pin',
              lat: pin.lat,
              lng: pin.lng,
              categoryKey: catInfo.key,
              categoryLabel: catInfo.label,
              categoryIcon: '✨',
              distanceFromRouteMeters: Math.round(minDistance),
              projectionDistanceMeters: projectionDistance,
              detourMinutes: Math.round(((minDistance * 2.7) / 35000) * 60) + 5,
              etaMinutes: etaMinutes,
              detourType: detourType,
              sunsetMatch: sunsetMatch
            });
          }
        });
      } catch (e) {}
    }

    let sortedList = Array.from(allDiscovered.values());
    sortedList.sort((a, b) => a.projectionDistanceMeters - b.projectionDistanceMeters);

    // Balanced Distribution:
    // Prevent start/end cities (< 5% of route) from swamping the list.
    const startZoneMeters = Math.min(6000, totalDistMeters * 0.05);
    const endZoneMeters = totalDistMeters - Math.min(6000, totalDistMeters * 0.05);

    let startCount = 0;
    let endCount = 0;
    const balancedList = [];

    for (const poi of sortedList) {
      const proj = poi.projectionDistanceMeters;
      if (proj <= startZoneMeters) {
        if (startCount < 3) {
          balancedList.push(poi);
          startCount++;
        }
      } else if (proj >= endZoneMeters) {
        if (endCount < 3) {
          balancedList.push(poi);
          endCount++;
        }
      } else {
        // En-route roadside wonder on the highway: ALWAYS include
        balancedList.push(poi);
      }
    }

    // Weather Enrichment at Specific Place & Specific Arrival Time (ETA)
    if (this.weather && balancedList.length > 0) {
      const weatherPromises = balancedList.slice(0, 40).map(async (poi) => {
        try {
          const w = await this.weather.getPointForecastAtTime(
            poi.lat,
            poi.lng,
            poi.etaMinutes,
            departureDate,
            unitSystem
          );
          poi.weather = w;
        } catch (e) {
          console.warn('Corridor stop weather enrichment note:', e);
        }
      });
      await Promise.allSettled(weatherPromises);
    }

    return balancedList;
  }

  calcTotalPolylineDistance(latLngs) {
    let total = 0;
    for (let i = 0; i < latLngs.length - 1; i++) {
      total += this.calcDist(latLngs[i][0], latLngs[i][1], latLngs[i + 1][0], latLngs[i + 1][1]);
    }
    return total;
  }

  samplePolylineByDistance(latLngs, stepMeters = 20000) {
    if (!latLngs || latLngs.length === 0) return [];
    if (latLngs.length === 1) return [latLngs[0]];

    const samples = [latLngs[0]];
    let accumulated = 0;

    for (let i = 0; i < latLngs.length - 1; i++) {
      const p1 = latLngs[i];
      const p2 = latLngs[i + 1];
      const segDist = this.calcDist(p1[0], p1[1], p2[0], p2[1]);
      accumulated += segDist;

      if (accumulated >= stepMeters) {
        samples.push(p2);
        accumulated = 0;
      }
    }

    const lastPt = latLngs[latLngs.length - 1];
    if (samples[samples.length - 1] !== lastPt) {
      samples.push(lastPt);
    }

    return samples;
  }

  /**
   * Classify accessibility: Drive-by (0m detour) vs Quick pull-over vs Scenic detour
   */
  classifyDetourType(distanceMeters) {
    if (distanceMeters <= 650) {
      return {
        type: 'drive_by',
        label: '🚗 Highway Drive-By (0m Detour)',
        shortLabel: '🚗 Highway Audible',
        cssClass: 'badge-drive-by'
      };
    }
    if (distanceMeters <= 2000) {
      return {
        type: 'quick_stop',
        label: '🅿️ Quick Pull-Over (3-5m)',
        shortLabel: '🅿️ Quick Pull-Over',
        cssClass: 'badge-quick-stop'
      };
    }
    return {
      type: 'scenic_detour',
      label: '🏞️ Scenic Detour (8-15m)',
      shortLabel: '🏞️ Scenic Detour',
      cssClass: 'badge-scenic-detour'
    };
  }

  /**
   * Calculate local sunset time using solar declination approximation
   */
  calculateSunsetTime(lat, lng, date = new Date()) {
    try {
      const localDate = new Date(date.getTime() + (lng / 15) * 3600 * 1000);
      const startOfYear = new Date(Date.UTC(localDate.getUTCFullYear(), 0, 0));
      const dayOfYear = Math.floor((localDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));
      
      const latRad = lat * (Math.PI / 180);
      const decRad = declination * (Math.PI / 180);
      const cosHourAngle = -Math.tan(latRad) * Math.tan(decRad);
      
      if (cosHourAngle > 1 || cosHourAngle < -1) return null;
      
      const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI);
      const sunsetSolarUtcHours = 12 + (hourAngle / 15) - (lng / 15);
      
      const baseDateUtc = new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0));
      const sunsetUtcMs = baseDateUtc.getTime() + (sunsetSolarUtcHours * 3600 * 1000);
      return new Date(sunsetUtcMs);
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if a scenic waypoint coincides with golden hour / sunset based on arrival ETA
   */
  checkSunsetMatch(poi, departureDate = new Date()) {
    if (!poi || !poi.lat || !poi.lng || typeof poi.etaMinutes !== 'number') return null;

    const isScenic = poi.categoryKey === 'nature' || 
                     ['vista', 'viewpoint', 'peak', 'waterfall', 'beach', 'lake', 'canyon', 'natural'].includes((poi.type || '').toLowerCase()) ||
                     /\b(viewpoint|lookout|overlook|scenic|vista|peak|summit|canyon|lake|ocean|beach|ridge|sunset|sunrise)\b/i.test(`${poi.title || ''} ${poi.extract || ''}`);

    if (!isScenic) return null;

    const arrivalTime = new Date(departureDate.getTime() + (poi.etaMinutes * 60 * 1000));
    const sunsetTime = this.calculateSunsetTime(poi.lat, poi.lng, arrivalTime);
    if (!sunsetTime) return null;

    const diffMins = (arrivalTime.getTime() - sunsetTime.getTime()) / (60 * 1000);

    // Golden Hour window: between 40 minutes before sunset and 15 minutes after sunset
    if (diffMins >= -40 && diffMins <= 15) {
      const timeStr = arrivalTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return {
        isMatch: true,
        label: `🌅 Golden Hour / Sunset Lookout (~${timeStr} ETA)`,
        shortLabel: `🌅 Sunset Lookout (~${timeStr})`,
        sunsetTimeStr: timeStr
      };
    }

    return null;
  }

  /**
   * Generate 1-Click Shareable Trip Itinerary URL
   */
  generateTripShareUrl(start, end, waypoints = [], departureOffsetMins = 0) {
    const origin = (typeof window !== 'undefined' && window.location) ? (window.location.origin + window.location.pathname) : 'https://professorgeorge.github.io/wanderlust/';
    const params = new URLSearchParams();

    if (start) {
      params.set('origin', start.name || `${start.lat},${start.lng}`);
      if (start.lat && start.lng) {
        params.set('olat', Number(start.lat).toFixed(4));
        params.set('olng', Number(start.lng).toFixed(4));
      }
    }

    if (end) {
      params.set('dest', end.name || `${end.lat},${end.lng}`);
      if (end.lat && end.lng) {
        params.set('dlat', Number(end.lat).toFixed(4));
        params.set('dlng', Number(end.lng).toFixed(4));
      }
    }

    if (departureOffsetMins > 0) {
      params.set('dep', departureOffsetMins);
    }

    if (waypoints && waypoints.length > 0) {
      const stopIds = waypoints.map(w => w.id || `${Number(w.lat).toFixed(4)},${Number(w.lng).toFixed(4)}`).join(',');
      params.set('stops', stopIds);
    }

    return `${origin}?${params.toString()}`;
  }

  /**
   * Pre-cache all corridor POIs into IndexedDB for offline mountain driving
   */
  async preCacheCorridor(route, onProgress = null) {
    if (!this.storage || !route?.latLngs) return { success: false, count: 0 };

    const latLngs = route.latLngs;
    const sampledPoints = this.samplePolyline(latLngs, 5000); // dense sample every 5km for offline
    const totalSamples = sampledPoints.length;
    const allPois = new Map();

    for (let i = 0; i < totalSamples; i++) {
      const pt = sampledPoints[i];
      if (onProgress) onProgress(i + 1, totalSamples, `Scanning mile ${Math.round((i / totalSamples) * route.distanceKm)} km...`);

      try {
        const [wikiPois, osmPois] = await Promise.all([
          this.wiki.findNearby(pt[0], pt[1], 4000, 5),
          this.osm ? this.osm.findNearby(pt[0], pt[1], 4000) : []
        ]);

        [...wikiPois, ...osmPois].forEach(p => {
          if (!allPois.has(p.id)) allPois.set(p.id, p);
        });
      } catch (e) {
        console.warn('Pre-cache batch error:', e);
      }
    }

    const poisArray = Array.from(allPois.values());
    await this.storage.saveOfflinePois(route.id, poisArray);

    return { success: true, count: poisArray.length };
  }

  /**
   * Topologically sequence waypoints monotonically along route
   */
  sequenceWaypoints(waypoints, latLngs = null) {
    const routeLines = latLngs || this.currentRoute?.latLngs;
    if (!routeLines || waypoints.length <= 1) return waypoints;

    return [...waypoints].sort((a, b) => {
      const projA = a.projectionDistanceMeters !== undefined ? a.projectionDistanceMeters : this.calculateRouteProjection(a.lat, a.lng, routeLines).projectionDistance;
      const projB = b.projectionDistanceMeters !== undefined ? b.projectionDistanceMeters : this.calculateRouteProjection(b.lat, b.lng, routeLines).projectionDistance;
      return projA - projB;
    });
  }

  /**
   * Generate Multi-Stop Google Maps navigation hyperlink with topological sequencing
   */
  generateGoogleMapsUrl(start, end, waypoints = []) {
    const origin = `${start.lat},${start.lng}`;
    const destination = `${end.lat},${end.lng}`;

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;

    if (waypoints && waypoints.length > 0) {
      const sortedWaypoints = this.sequenceWaypoints(waypoints);
      const waypointsStr = sortedWaypoints
        .slice(0, 9)
        .map(w => `${w.lat},${w.lng}`)
        .join('|');
      url += `&waypoints=${encodeURIComponent(waypointsStr)}`;
    }

    return url;
  }

  generateAppleMapsUrl(start, end, waypoints = []) {
    if (!start || !end) return '';
    const startCoord = `${start.lat},${start.lng}`;
    const endCoord = `${end.lat},${end.lng}`;

    if (waypoints.length === 0) {
      return `https://maps.apple.com/?saddr=${startCoord}&daddr=${endCoord}&dirflg=d`;
    }

    const sortedWaypoints = this.sequenceWaypointsTopologically(waypoints, this.currentRoute?.latLngs || []);
    const viaCoords = sortedWaypoints.map(w => `${w.lat},${w.lng}`).join('+to:');
    return `https://maps.apple.com/?saddr=${startCoord}&daddr=${viaCoords}+to:${endCoord}&dirflg=d`;
  }

  generateWazeUrl(end) {
    if (!end) return '';
    return `https://waze.com/ul?ll=${end.lat},${end.lng}&navigate=yes`;
  }

  /**
   * Calculate total trip duration including selected intermediate waypoints
   */
  calculateTripWithWaypoints(selectedWaypoints) {
    if (!this.currentRoute) return { totalMinutes: 0, addedMinutes: 0, waypointCount: 0 };
    const baseMinutes = this.currentRoute.durationMinutes;
    const addedMinutes = selectedWaypoints.reduce((acc, wp) => acc + (wp.detourMinutes || 5), 0);
    return {
      baseMinutes,
      addedMinutes,
      totalMinutes: baseMinutes + addedMinutes,
      waypointCount: selectedWaypoints.length
    };
  }

  samplePolyline(latLngs, minSpacingMeters = 8000) {
    const samples = [];
    let lastSampled = latLngs[0];
    samples.push(lastSampled);

    for (let i = 1; i < latLngs.length - 1; i++) {
      const pt = latLngs[i];
      const dist = this.calcDist(lastSampled[0], lastSampled[1], pt[0], pt[1]);
      if (dist >= minSpacingMeters) {
        samples.push(pt);
        lastSampled = pt;
      }
    }
    samples.push(latLngs[latLngs.length - 1]);
    return samples;
  }

  calculateRouteProjection(lat, lng, latLngs) {
    let minDist = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < latLngs.length; i++) {
      const d = this.calcDist(lat, lng, latLngs[i][0], latLngs[i][1]);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    }

    // Calculate cumulative path distance up to closestIndex
    let cumulativeDist = 0;
    for (let i = 0; i < closestIndex; i++) {
      cumulativeDist += this.calcDist(latLngs[i][0], latLngs[i][1], latLngs[i + 1][0], latLngs[i + 1][1]);
    }

    return { minDistance: minDist, projectionDistance: cumulativeDist };
  }

  /**
   * Export route and waypoints as standard GPX XML
   */
  exportToGpx(start, end, waypoints = [], polyline = []) {
    const timeStr = new Date().toISOString();
    const sortedWaypoints = this.sequenceWaypoints(waypoints, polyline);

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="The Wandering Layer (https://github.com)" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    gpx += `  <metadata>\n`;
    gpx += `    <name>${start.name} to ${end.name} (Scenic Itinerary)</name>\n`;
    gpx += `    <time>${timeStr}</time>\n`;
    gpx += `  </metadata>\n\n`;

    gpx += `  <wpt lat="${start.lat}" lon="${start.lng}"><name>Start: ${start.name}</name></wpt>\n`;

    sortedWaypoints.forEach((wp, i) => {
      gpx += `  <wpt lat="${wp.lat}" lon="${wp.lng}">\n`;
      gpx += `    <name>Stop ${i + 1}: ${wp.title}</name>\n`;
      gpx += `    <desc>${(wp.extract || '').replace(/[<&>]/g, '')}</desc>\n`;
      gpx += `  </wpt>\n`;
    });

    gpx += `  <wpt lat="${end.lat}" lon="${end.lng}"><name>Destination: ${end.name}</name></wpt>\n\n`;

    if (polyline && polyline.length > 0) {
      gpx += `  <trk>\n`;
      gpx += `    <name>${start.name} to ${end.name} Route</name>\n`;
      gpx += `    <trkseg>\n`;
      polyline.forEach(pt => {
        gpx += `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>\n`;
      });
      gpx += `    </trkseg>\n`;
      gpx += `  </trk>\n`;
    }

    gpx += `</gpx>`;
    return gpx;
  }

  /**
   * Split long-distance routes into daily legs (e.g. ~5 hours/day and max 8-9 stops/leg)
   */
  splitRouteIntoDailyLegs(route, selectedWaypoints = [], targetHoursPerLeg = 5, unitSystem = 'metric') {
    if (!route || !route.latLngs || route.latLngs.length < 2) return [];

    const sortedWaypoints = this.sequenceWaypoints(selectedWaypoints, route.latLngs);
    const targetMinutesPerLeg = targetHoursPerLeg * 60;
    const totalDriveMinutes = route.durationMinutes;
    const totalDetourMinutes = sortedWaypoints.reduce((sum, wp) => sum + (wp.detourMinutes || 5), 0);
    const totalTripMinutes = totalDriveMinutes + totalDetourMinutes;

    // Determine number of legs needed (by driving time and by 9-stop Google Maps cap)
    const legsByTime = Math.max(1, Math.ceil(totalTripMinutes / targetMinutesPerLeg));
    const legsByWaypoints = Math.max(1, Math.ceil(sortedWaypoints.length / 8)); // 8 stops max per leg to leave room for endpoints
    const totalLegsCount = Math.max(legsByTime, legsByWaypoints);

    if (totalLegsCount <= 1 && totalTripMinutes < 330 && sortedWaypoints.length <= 9) {
      // Single-day trip fits cleanly in 1 leg
      return [{
        dayNumber: 1,
        title: `Day 1: ${route.start.name} to ${route.end.name}`,
        start: route.start,
        end: route.end,
        waypoints: sortedWaypoints,
        durationMinutes: totalTripMinutes,
        driveOnlyMinutes: route.durationMinutes,
        distanceKm: route.distanceKm,
        distanceMiles: route.distanceMiles,
        latLngs: route.latLngs,
        googleMapsUrl: this.generateGoogleMapsUrl(route.start, route.end, sortedWaypoints),
        appleMapsUrl: this.generateAppleMapsUrl(route.start, route.end, sortedWaypoints)
      }];
    }

    // Segment polyline vertices and waypoints proportionally
    const polyline = route.latLngs;
    const totalPolyPoints = polyline.length;
    const legs = [];

    // Calculate cumulative distances along polyline
    const cumDistances = [0];
    for (let i = 0; i < totalPolyPoints - 1; i++) {
      const d = this.calcDist(polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1]);
      cumDistances.push(cumDistances[i] + d);
    }
    const totalMeters = cumDistances[cumDistances.length - 1] || 1;

    // Assign projection fraction to each waypoint
    sortedWaypoints.forEach(wp => {
      const proj = this.calculateRouteProjection(wp.lat, wp.lng, polyline);
      wp._routeFraction = proj.projectionDistance / totalMeters;
    });

    let lastEndPt = route.start;
    let lastPolyIdx = 0;

    for (let day = 1; day <= totalLegsCount; day++) {
      const startFraction = (day - 1) / totalLegsCount;
      const endFraction = day / totalLegsCount;

      const isLastDay = day === totalLegsCount;

      // Polyline segment for this day
      const targetEndDist = endFraction * totalMeters;
      let legEndPolyIdx = totalPolyPoints - 1;
      if (!isLastDay) {
        legEndPolyIdx = cumDistances.findIndex(d => d >= targetEndDist);
        if (legEndPolyIdx === -1 || legEndPolyIdx <= lastPolyIdx) {
          legEndPolyIdx = Math.min(totalPolyPoints - 1, Math.round(endFraction * totalPolyPoints));
        }
      }

      const legPoly = polyline.slice(lastPolyIdx, legEndPolyIdx + 1);
      const legStart = lastEndPt;

      // Waypoints falling into this segment (max 8 per leg)
      let legWaypoints = sortedWaypoints.filter(wp => {
        if (isLastDay) {
          return wp._routeFraction >= startFraction;
        }
        return wp._routeFraction >= startFraction && wp._routeFraction < endFraction;
      });

      // Cap at 8 waypoints per leg so Google Maps never exceeds 9 intermediate stops
      if (legWaypoints.length > 8) {
        legWaypoints = legWaypoints.slice(0, 8);
      }

      // Determine end point for this day leg
      let legEnd = null;
      if (isLastDay) {
        legEnd = route.end;
      } else {
        const lastWp = legWaypoints[legWaypoints.length - 1];
        const endCoord = polyline[legEndPolyIdx] || polyline[polyline.length - 1];
        const cleanName = lastWp ? lastWp.title.replace(/^[^a-zA-Z0-9]+/, '').slice(0, 22) : `Midway Point`;
        legEnd = {
          name: `${cleanName} (Day ${day} Overnight)`,
          lat: endCoord[0],
          lng: endCoord[1]
        };
      }

      const legDistanceMeters = (cumDistances[legEndPolyIdx] || totalMeters) - (cumDistances[lastPolyIdx] || 0);
      const legDistKm = Math.round(legDistanceMeters / 1000);
      const legDistMiles = Math.round(legDistanceMeters * 0.000621371);
      const legDriveMins = Math.round((legDistanceMeters / totalMeters) * totalDriveMinutes);
      const legDetourMins = legWaypoints.reduce((sum, wp) => sum + (wp.detourMinutes || 5), 0);
      const legTotalMins = legDriveMins + legDetourMins;

      legs.push({
        dayNumber: day,
        title: `Day ${day}: ${legStart.name} → ${legEnd.name}`,
        start: legStart,
        end: legEnd,
        waypoints: legWaypoints,
        durationMinutes: legTotalMins,
        driveOnlyMinutes: legDriveMins,
        distanceKm: legDistKm,
        distanceMiles: legDistMiles,
        latLngs: legPoly.length >= 2 ? legPoly : polyline,
        googleMapsUrl: this.generateGoogleMapsUrl(legStart, legEnd, legWaypoints),
        appleMapsUrl: this.generateAppleMapsUrl(legStart, legEnd, legWaypoints)
      });

      lastEndPt = legEnd;
      lastPolyIdx = legEndPolyIdx;
    }

    return legs;
  }

  calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}


// --- Main Application Layer ---
class WanderingLayerApp {
  constructor() {
    this.storage = new StorageService();
    this.pinsService = new PinsService(this.storage);
    this.weather = new WeatherService();

    // Global Audience: Unit System & Language Preferences
    const savedUnits = localStorage.getItem('unit_system');
    const isImperialLocale = navigator.language && (navigator.language.includes('US') || navigator.language.includes('GB') || navigator.language.includes('LR') || navigator.language.includes('MM'));
    this.unitSystem = savedUnits || (isImperialLocale ? 'imperial' : 'metric');

    const savedLang = localStorage.getItem('knowledge_lang');
    const detectedLang = navigator.language ? navigator.language.split('-')[0].toLowerCase() : 'en';
    const supportedLangs = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'hi', 'zh', 'ml', 'ar'];
    this.knowledgeLang = savedLang || (supportedLangs.includes(detectedLang) ? detectedLang : 'en');

    this.wiki = new WikiService(this.storage, this.knowledgeLang);
    this.osm = new OsmService();
    this.voice = new VoiceService();
    this.gps = new GpsService();
    this.context = new ContextService();
    this.budget = new DetourBudgetService(20);
    this.heartbeat = new HeartbeatService();
    this.journal = new JournalService(this.storage);
    this.personas = new PersonaService('wanderer');
    this.routeService = new RouteService(this.wiki, this.osm, this.storage, this.weather);
    this.wakeLock = new WakeLockService();

    const savedWakeLock = localStorage.getItem('keep_screen_awake');
    if (savedWakeLock !== null) {
      this.wakeLock.isEnabled = (savedWakeLock === 'true');
    }
    this.wakeLock.onStateChange = (isActive) => this.updateWakeLockUI(isActive);

    this.map = null;
    this.carMarker = null;
    this.radiusCircle = null;
    this.poiMarkers = new Map();
    this.pinMarkers = new Map();
    this.routePolyline = null;
    this.alternativePolylines = [];
    this.activeRouteIndex = 0;
    this.selectedWaypoints = [];
    this.selectedOrigin = null;
    this.selectedDest = null;

    this.isTracking = false;
    this.currentPois = [];
    this.searchRadius = 3000; // base meters
    this.isConcise = false;
    this.useForwardConeFilter = true;
    this.isHudMode = false;
    this.lastScanCoords = null;
    this.activePoiForOled = null;

    // Single Announcement & Replay Tracking
    this.narratedPoiIds = new Set();
    this.skippedPoiIds = new Set();
    this.lastNarratedPoi = null;

    // Category Filtering State
    this.activeFeedCategory = 'all';
    this.activeCorridorCategory = 'all';
    this.rawCorridorPois = [];

    // PWA Install State
    this.deferredInstallPrompt = null;

    // Initialize components defensively so no single phase blocks the others
    try { this.initServiceWorker(); } catch (e) { console.warn('SW init error:', e); }
    try { this.initPwaInstallPrompt(); } catch (e) { console.warn('PWA prompt init error:', e); }
    try { this.bindEvents(); } catch (e) { console.error('BindEvents error:', e); }
    try { this.initMap(); } catch (e) { console.error('Map init error:', e); }
    try { this.loadInitialData(); } catch (e) { console.warn('Initial data load error:', e); }
    try { this.initAutocomplete(); } catch (e) { console.warn('Autocomplete init error:', e); }
    try { this.initVoiceState(); } catch (e) { console.warn('Voice state init error:', e); }
    try { this.initAutoLocation(); } catch (e) { console.warn('AutoLocation init error:', e); }
    try { this.checkSharedUrlParams(); } catch (e) { console.warn('Shared URL params check error:', e); }
  }

  updateWakeLockUI(isActive) {
    const wakeBtn = document.getElementById('wake-lock-btn');
    const wakeLabel = document.getElementById('wake-lock-label');
    const wakeToggle = document.getElementById('wake-lock-toggle');
    const hudWakeBadge = document.getElementById('hud-wake-badge');
    const oledWakeBtn = document.getElementById('oled-wake-lock-btn');

    if (wakeBtn) {
      wakeBtn.classList.toggle('wake-lock-active', Boolean(isActive));
    }
    if (wakeLabel) {
      wakeLabel.textContent = isActive ? 'Screen Lit' : 'Screen Auto';
    }
    if (wakeToggle) {
      wakeToggle.checked = this.wakeLock.isEnabled;
    }
    if (hudWakeBadge) {
      hudWakeBadge.style.display = isActive ? 'inline-flex' : 'none';
    }
    if (oledWakeBtn) {
      oledWakeBtn.textContent = isActive ? '🔆 SCREEN LIT: ON' : '💤 SCREEN LIT: OFF';
      oledWakeBtn.style.color = isActive ? '#fbbf24' : 'var(--text-muted)';
      oledWakeBtn.style.borderColor = isActive ? '#f59e0b' : 'var(--border)';
      oledWakeBtn.style.background = isActive ? 'rgba(245, 158, 11, 0.12)' : 'transparent';
    }
  }

  async toggleWakeLock(forceVal = null) {
    const newState = await this.wakeLock.toggleEnabled(forceVal);
    localStorage.setItem('keep_screen_awake', String(newState));
    this.updateWakeLockUI(this.wakeLock.isActive());
    return newState;
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update();
      }).catch(err => {
        console.warn('Service worker registration non-fatal notice:', err);
      });
    }
  }

  initPwaInstallPrompt() {
    const installBtn = document.getElementById('install-pwa-btn');
    const pwaBanner = document.getElementById('pwa-install-banner');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // If already running in standalone PWA app mode, hide install promotional prompts
    if (isStandalone) {
      if (installBtn) installBtn.style.display = 'none';
      if (pwaBanner) pwaBanner.style.display = 'none';
      return;
    }

    // Check if user recently dismissed the banner (within 3 days)
    const lastDismissed = localStorage.getItem('wanderlust_pwa_dismissed');
    const recentlyDismissed = lastDismissed && (Date.now() - parseInt(lastDismissed, 10) < 3 * 24 * 60 * 60 * 1000);

    // Show header install button in standard browser window
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
    }

    // Auto-prompt bottom banner after gentle delay for discoverability
    if (!recentlyDismissed && pwaBanner) {
      setTimeout(() => {
        const stillStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (!stillStandalone && pwaBanner) {
          pwaBanner.style.display = 'flex';
        }
      }, 1500);
    }

    // 1. Listen for Android / Chrome / Edge native beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (installBtn) installBtn.style.display = 'inline-flex';
      if (!recentlyDismissed && pwaBanner) {
        pwaBanner.style.display = 'flex';
      }
    });

    // 2. Track successful PWA install
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      if (installBtn) installBtn.style.display = 'none';
      if (pwaBanner) pwaBanner.style.display = 'none';
      this.showToast('✓ Wanderlust installed! You can launch it anytime from your Home Screen.');
    });
  }

  async triggerPwaInstall() {
    const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && !window.MSStream;
    const pwaBanner = document.getElementById('pwa-install-banner');
    const installBtn = document.getElementById('install-pwa-btn');

    if (this.deferredInstallPrompt) {
      // Chromium / Android / Edge native prompt flow
      this.deferredInstallPrompt.prompt();
      const { outcome } = await this.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        if (pwaBanner) pwaBanner.style.display = 'none';
        if (installBtn) installBtn.style.display = 'none';
      }
      this.deferredInstallPrompt = null;
    } else if (isIos) {
      // iPhone / iPad Safari visual guide modal
      const iosModal = document.getElementById('ios-install-modal');
      if (iosModal) iosModal.classList.add('active');
    } else {
      // Desktop browser or browser without active beforeinstallprompt
      const helpModal = document.getElementById('help-modal');
      if (helpModal) {
        helpModal.classList.add('active');
      } else {
        alert('To install Wanderlust, tap your browser menu (⋮) and choose "Install App" or "Add to Home screen".');
      }
    }
  }

  dismissPwaBanner() {
    const pwaBanner = document.getElementById('pwa-install-banner');
    if (pwaBanner) {
      pwaBanner.style.display = 'none';
    }
    try {
      localStorage.setItem('wanderlust_pwa_dismissed', Date.now().toString());
    } catch (e) {}
  }

  showToast(message, duration = 3500) {
    const existing = document.querySelector('.app-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  async loadInitialData() {
    await this.pinsService.loadPins();
    this.renderPinMarkers();

    // Sync settings selectors
    const unitSelect = document.getElementById('unit-system-select');
    if (unitSelect) unitSelect.value = this.unitSystem;

    const langSelect = document.getElementById('knowledge-lang-select');
    if (langSelect) langSelect.value = this.knowledgeLang;

    this.updateRadiusSliderLabel();
  }

  getLastKnownLocation() {
    try {
      const saved = localStorage.getItem('last_known_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          // Purge legacy development placeholder (Neriyamangalam, India) if cached
          if (Math.abs(parsed.lat - 10.0542) < 0.05 && Math.abs(parsed.lng - 76.7865) < 0.05) {
            localStorage.removeItem('last_known_location');
            return null;
          }
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  saveLastKnownLocation(lat, lng) {
    try {
      // Don't save old legacy placeholder
      if (Math.abs(lat - 10.0542) < 0.05 && Math.abs(lng - 76.7865) < 0.05) return;
      localStorage.setItem('last_known_location', JSON.stringify({
        lat,
        lng,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  initMap() {
    if (typeof L === 'undefined') {
      console.warn('Leaflet library loading... deferring map init.');
      setTimeout(() => this.initMap(), 300);
      return;
    }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    const lastKnown = this.getLastKnownLocation();
    // Default to US center or last known location
    const initialLat = lastKnown ? lastKnown.lat : (this.unitSystem === 'imperial' ? 37.7749 : 48.8566);
    const initialLng = lastKnown ? lastKnown.lng : (this.unitSystem === 'imperial' ? -122.4194 : 2.3522);
    const initialZoom = lastKnown ? 13 : 11;

    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([initialLat, initialLng], initialZoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    const carIcon = L.divIcon({
      className: 'car-marker-container',
      html: `
        <div id="car-dot" style="
          width: 22px; height: 22px;
          background: #58a6ff;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 14px rgba(88, 166, 255, 0.8);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.3s ease;
        ">
          <div style="width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 7px solid #fff; margin-bottom: 2px;"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    this.carMarker = L.marker([initialLat, initialLng], { icon: carIcon }).addTo(this.map);

    this.radiusCircle = L.circle([initialLat, initialLng], {
      radius: this.searchRadius,
      color: '#58a6ff',
      weight: 1,
      fillColor: '#58a6ff',
      fillOpacity: 0.05,
      dashArray: '4, 8'
    }).addTo(this.map);

    this.updateContextHUD(initialLat, initialLng);

    if (lastKnown) {
      this.gps.updatePosition(lastKnown.lat, lastKnown.lng, null, 0, false);
      this.scanLandscape(lastKnown.lat, lastKnown.lng);
    }
  }

  async initAutoLocation() {
    let locationResolved = false;

    const applyLocation = (lat, lng, zoom = 13, source = 'gps') => {
      if (locationResolved && source === 'ip') return;
      locationResolved = true;
      if (source === 'gps') {
        this.saveLastKnownLocation(lat, lng);
      }
      if (this.carMarker) this.carMarker.setLatLng([lat, lng]);
      if (this.radiusCircle) this.radiusCircle.setLatLng([lat, lng]);
      if (this.map) this.map.setView([lat, lng], zoom);
      this.gps.updatePosition(lat, lng, null, 0, false);
      this.updateContextHUD(lat, lng);
      this.scanLandscape(lat, lng);
    };

    // 1. Hardware GPS (High Accuracy)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyLocation(pos.coords.latitude, pos.coords.longitude, 13, 'gps');
        },
        (err) => {
          console.log('Hardware GPS waiting/unavailable:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }

    // 2. Instant IP Geolocation fallback (only if no last known location is available)
    const lastKnown = this.getLastKnownLocation();
    if (!lastKnown) {
      try {
        const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
        if (res.ok) {
          const data = await res.json();
          if (data.latitude && data.longitude && !locationResolved) {
            applyLocation(data.latitude, data.longitude, 12, 'ip');
          }
        }
      } catch (e) {
        console.warn('IP geolocation notice:', e);
      }
    }
  }

  // --- Units Conversion Helpers ---

  formatSpeed(speedKmh) {
    if (this.unitSystem === 'imperial') {
      const mph = Math.round(speedKmh * 0.621371);
      return { val: mph, unit: 'mph', oledUnit: 'MPH' };
    }
    return { val: speedKmh, unit: 'km/h', oledUnit: 'KM / H' };
  }

  formatDistance(meters) {
    if (this.unitSystem === 'imperial') {
      if (meters < 400) {
        return `${Math.round(meters * 3.28084)} ft`;
      }
      return `${(meters * 0.000621371).toFixed(1)} mi`;
    }
    if (meters < 1000) {
      return `${meters} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  formatRadius(meters) {
    if (this.unitSystem === 'imperial') {
      return `${(meters * 0.000621371).toFixed(1)} mi`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  updateRadiusSliderLabel() {
    const radiusLabel = document.getElementById('radius-val');
    if (radiusLabel) {
      radiusLabel.textContent = this.formatRadius(this.searchRadius);
    }
  }

  bindEvents() {
    this.gps.onLocationUpdate = (pos) => this.handleLocationUpdate(pos);

    // Global Document Event Delegation for 100% Reliable Clicks
    document.addEventListener('click', (e) => {
      // 1. Plan Route Buttons (Header, Feed, Sidebar)
      const planBtn = e.target.closest('#route-btn, #sidebar-plan-route-btn, #feed-plan-route-btn, .btn-plan-route, .btn-plan-sidebar');
      if (planBtn) {
        e.preventDefault();
        const routeModal = document.getElementById('route-modal');
        if (routeModal) routeModal.classList.add('active');
        return;
      }

      // 2. Scrapbook Modal Button
      const scrapbookBtn = e.target.closest('#scrapbook-btn');
      if (scrapbookBtn) {
        e.preventDefault();
        this.openScrapbook();
        return;
      }

      // 3. Settings Modal Button
      const settingsBtn = e.target.closest('#settings-btn');
      if (settingsBtn) {
        e.preventDefault();
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.classList.add('active');
        return;
      }

      // 4. Wonder Pin Modal Buttons
      const dropPinBtn = e.target.closest('#drop-pin-btn, #oled-pin-btn');
      if (dropPinBtn) {
        e.preventDefault();
        this.openWonderPinModal();
        return;
      }

      // 5. HUD Mode Toggle Button
      const hudBtn = e.target.closest('#hud-mode-btn');
      if (hudBtn) {
        e.preventDefault();
        this.isHudMode = true;
        const drivingHudView = document.getElementById('driving-hud-view');
        if (drivingHudView) drivingHudView.style.display = 'flex';
        if (this.currentPois.length > 0) this.updateOledDisplay(this.currentPois[0]);
        return;
      }

      // 6. Close Modal Buttons
      const closeBtn = e.target.closest('.close-btn, #close-route-btn, #close-scrapbook-btn, #close-settings-btn, #close-pin-btn, #cancel-pin-btn');
      if (closeBtn) {
        e.preventDefault();
        const modal = closeBtn.closest('.modal');
        if (modal) modal.classList.remove('active');
        return;
      }

      // 7. Detour Links (Ensure mobile and PWA standalone reliability)
      const detourLink = e.target.closest('.btn-detour, .popup-detour-btn, .pin-detour-btn, .oled-action-btn.detour');
      if (detourLink && detourLink.tagName === 'A') {
        const href = detourLink.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
          if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            e.preventDefault();
            window.open(href, '_blank');
          }
        }
      }
    });

    this.voice.onStateChange = ({ isSpeaking, poi, lastPoi, wasSkipped }) => {
      const banner = document.getElementById('speaking-banner');
      const activeView = document.getElementById('speaking-active-view');
      const replayView = document.getElementById('speaking-replay-view');
      const bannerText = document.getElementById('speaking-text');
      const replayTitleText = document.getElementById('replay-title-text');

      if (isSpeaking && poi) {
        if (banner) {
          banner.style.display = 'flex';
          banner.classList.add('active');
          banner.classList.remove('replay-ready');
        }
        if (activeView) activeView.style.display = 'flex';
        if (replayView) replayView.style.display = 'none';
        if (bannerText) bannerText.textContent = `Whispering: ${poi.title}`;

        this.highlightCard(poi.id, true);
        this.activePoiForOled = poi;
        this.updateOledDisplay(poi);
        this.renderFeed();
      } else {
        const fallbackLast = this.lastNarratedPoi || lastPoi;
        if (fallbackLast && banner) {
          banner.style.display = 'flex';
          banner.classList.remove('active');
          banner.classList.add('replay-ready');
          if (activeView) activeView.style.display = 'none';
          if (replayView) replayView.style.display = 'flex';
          if (replayTitleText) {
            replayTitleText.textContent = `${wasSkipped ? 'Skipped' : 'Last Story'}: ${fallbackLast.title}`;
          }
        } else if (banner) {
          banner.style.display = 'none';
          banner.classList.remove('active', 'replay-ready');
        }
        this.highlightCard(null, false);
        if (this.activePoiForOled) {
          this.updateOledDisplay(this.activePoiForOled);
        }
        this.renderFeed();
      }
    };

    // Speaking Banner Action Buttons
    document.getElementById('banner-skip-btn')?.addEventListener('click', () => {
      this.skipCurrentStory();
    });

    document.getElementById('banner-replay-btn')?.addEventListener('click', () => {
      this.replayLastStory();
    });

    document.getElementById('banner-dismiss-btn')?.addEventListener('click', () => {
      const banner = document.getElementById('speaking-banner');
      if (banner) {
        banner.style.display = 'none';
        banner.classList.remove('replay-ready', 'active');
      }
    });

    // Screen Wake Lock Toggle Buttons (Header, HUD, Settings)
    document.getElementById('wake-lock-btn')?.addEventListener('click', () => {
      this.toggleWakeLock();
    });

    document.getElementById('oled-wake-lock-btn')?.addEventListener('click', () => {
      this.toggleWakeLock();
    });

    document.getElementById('wake-lock-toggle')?.addEventListener('change', (e) => {
      this.toggleWakeLock(e.target.checked);
    });

    // App Visibility & Lifecycle Recovery: Re-acquire Wake Lock and Resync Stalled GPS
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        if (this.wakeLock.isEnabled && (this.isTracking || this.isHudMode || this.gps.isSimulating)) {
          await this.wakeLock.request();
        }
        this.gps.resyncLocation();
        this.voice.unlockAudio();
        if (this.isTracking && this.gps.currentPosition) {
          this.updateContextHUD(this.gps.currentPosition.lat, this.gps.currentPosition.lng);
        }
      }
    });

    window.addEventListener('focus', () => {
      this.gps.resyncLocation();
      if (this.wakeLock.isEnabled && (this.isTracking || this.isHudMode || this.gps.isSimulating)) {
        this.wakeLock.request();
      }
    });

    // Live GPS Start/Stop button
    const startBtn = document.getElementById('start-journey-btn');
    startBtn.addEventListener('click', () => {
      this.voice.unlockAudio();
      this.heartbeat.start();

      if (!this.isTracking) {
        this.journal.startSession();
        if (this.wakeLock.isEnabled) {
          this.wakeLock.request();
        }
        const started = this.gps.startLiveTracking();
        if (started) {
          this.isTracking = true;
          startBtn.classList.add('tracking');
          startBtn.innerHTML = `<span>End Journey</span>`;
          document.getElementById('hud-status').textContent = 'Live Tracking';
        }
      } else {
        this.gps.stopLiveTracking();
        this.gps.stopSimulation();
        this.heartbeat.stop();
        if (!this.isHudMode) {
          this.wakeLock.release();
        }
        this.isTracking = false;
        startBtn.classList.remove('tracking');
        startBtn.innerHTML = `<span>Start Journey (Live GPS)</span>`;
        document.getElementById('hud-status').textContent = 'Standby';

        if (this.journal.entries.length > 0) {
          this.openScrapbook();
        }
      }
    });

    // Mute button
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.addEventListener('click', () => {
      const isMuted = this.voice.toggleMute();
      document.getElementById('mute-label').textContent = isMuted ? 'Muted' : 'Audio On';
      muteBtn.classList.toggle('active', isMuted);
    });

    // Minimal OLED Driving HUD Mode
    const hudModeBtn = document.getElementById('hud-mode-btn');
    const drivingHudView = document.getElementById('driving-hud-view');
    const exitHudBtn = document.getElementById('exit-hud-btn');

    hudModeBtn.addEventListener('click', () => {
      this.isHudMode = true;
      drivingHudView.style.display = 'flex';
      if (this.wakeLock.isEnabled) {
        this.wakeLock.request();
      }
      if (this.currentPois.length > 0) {
        this.updateOledDisplay(this.currentPois[0]);
      }
    });

    exitHudBtn.addEventListener('click', () => {
      this.isHudMode = false;
      drivingHudView.style.display = 'none';
      if (!this.isTracking) {
        this.wakeLock.release();
      }
    });

    document.getElementById('oled-speak-btn')?.addEventListener('click', () => {
      if (this.activePoiForOled) {
        this.replayPoi(this.activePoiForOled);
      }
    });

    document.getElementById('oled-skip-btn')?.addEventListener('click', () => {
      this.skipCurrentStory();
    });

    document.getElementById('oled-replay-btn')?.addEventListener('click', () => {
      if (this.activePoiForOled) {
        this.replayPoi(this.activePoiForOled);
      } else if (this.lastNarratedPoi) {
        this.replayPoi(this.lastNarratedPoi);
      }
    });

    document.getElementById('oled-pin-btn')?.addEventListener('click', () => {
      this.openWonderPinModal();
    });

    // Wonder Pin Modal & Actions
    const dropPinBtn = document.getElementById('drop-pin-btn');
    const pinModal = document.getElementById('pin-modal');
    const closePinBtn = document.getElementById('close-pin-btn');

    dropPinBtn.addEventListener('click', () => this.openWonderPinModal());
    closePinBtn.addEventListener('click', () => pinModal.classList.remove('active'));

    document.getElementById('save-pin-btn').addEventListener('click', async () => {
      const title = document.getElementById('pin-title-input').value;
      const note = document.getElementById('pin-note-input').value;
      const category = document.getElementById('pin-category-select').value;
      const markerPos = this.carMarker ? this.carMarker.getLatLng() : { lat: 37.7749, lng: -122.4194 };
      const pos = this.gps.currentPosition || { lat: markerPos.lat, lng: markerPos.lng };

      await this.pinsService.createPin({
        title,
        note,
        category,
        lat: pos.lat,
        lng: pos.lng
      });

      document.getElementById('pin-title-input').value = '';
      document.getElementById('pin-note-input').value = '';
      pinModal.classList.remove('active');

      this.renderPinMarkers();
      if (this.lastScanCoords) {
        this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
      }
    });

    document.getElementById('export-pins-geojson-btn').addEventListener('click', () => {
      const geojsonStr = this.pinsService.exportToGeoJson();
      const blob = new Blob([geojsonStr], { type: 'application/geo+json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my_wonder_pins_${new Date().toISOString().slice(0, 10)}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    document.getElementById('import-pins-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const res = await this.pinsService.importFromGeoJson(evt.target.result);
        if (res.success) {
          alert(`Successfully imported ${res.count} wonder pins!`);
          this.renderPinMarkers();
          if (this.lastScanCoords) {
            this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
          }
        } else {
          alert(`Import failed: ${res.error}`);
        }
      };
      reader.readAsText(file);
    });

    // Scrapbook Modal
    const scrapbookBtn = document.getElementById('scrapbook-btn');
    const scrapbookModal = document.getElementById('scrapbook-modal');
    const closeScrapbookBtn = document.getElementById('close-scrapbook-btn');
    scrapbookBtn.addEventListener('click', () => this.openScrapbook());
    closeScrapbookBtn.addEventListener('click', () => scrapbookModal.classList.remove('active'));

    document.getElementById('export-journal-btn').addEventListener('click', () => {
      this.exportJournalMarkdown();
    });

    // PWA Installation Buttons & Banners
    const installHeaderBtn = document.getElementById('install-pwa-btn');
    if (installHeaderBtn) {
      installHeaderBtn.addEventListener('click', () => this.triggerPwaInstall());
    }

    const pwaBannerInstallBtn = document.getElementById('pwa-banner-install-btn');
    if (pwaBannerInstallBtn) {
      pwaBannerInstallBtn.addEventListener('click', () => this.triggerPwaInstall());
    }

    const pwaBannerDismissBtn = document.getElementById('pwa-banner-dismiss-btn');
    if (pwaBannerDismissBtn) {
      pwaBannerDismissBtn.addEventListener('click', () => this.dismissPwaBanner());
    }

    const closeIosBtn = document.getElementById('close-ios-install-btn');
    const iosDoneBtn = document.getElementById('ios-install-done-btn');
    const iosModal = document.getElementById('ios-install-modal');
    if (closeIosBtn && iosModal) {
      closeIosBtn.addEventListener('click', () => iosModal.classList.remove('active'));
    }
    if (iosDoneBtn && iosModal) {
      iosDoneBtn.addEventListener('click', () => iosModal.classList.remove('active'));
    }

    // Route Builder Modal
    const routeModal = document.getElementById('route-modal');
    const closeRouteBtn = document.getElementById('close-route-btn');
    const openRouteModal = () => routeModal.classList.add('active');

    ['route-btn', 'sidebar-plan-route-btn', 'feed-plan-route-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openRouteModal);
    });

    closeRouteBtn.addEventListener('click', () => routeModal.classList.remove('active'));

    document.getElementById('route-my-loc-btn').addEventListener('click', () => {
      this.locateUserForRoute(document.getElementById('route-origin-input'), document.getElementById('route-my-loc-btn'), document.getElementById('route-status'));
    });

    document.getElementById('route-scan-btn').addEventListener('click', () => this.handleRouteScan());
    document.getElementById('route-departure-select')?.addEventListener('change', () => {
      if (this.routeService.currentRoute) {
        this.handleRouteScan();
      }
    });
    document.getElementById('daily-target-hours-select')?.addEventListener('change', () => {
      if (this.routeService.currentRoute) {
        this.updateRouteSummary(this.routeService.currentRoute);
      }
    });

    // Discovery Feed Category Chips
    document.querySelectorAll('#feed-category-bar .feed-cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#feed-category-bar .feed-cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFeedCategory = chip.dataset.cat || 'all';
        this.renderFeed();
        this.evaluateAutomaticNarration(this.currentPois);
      });
    });

    // Corridor Category Filter Pills
    document.querySelectorAll('#corridor-cat-pills .cat-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#corridor-cat-pills .cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeCorridorCategory = pill.dataset.cat || 'all';
        this.renderCorridorList();
      });
    });

    // Corridor Bulk Select / Deselect Visible
    document.getElementById('corridor-select-visible-btn')?.addEventListener('click', () => {
      const visible = this.getFilteredCorridorPois();
      visible.forEach(poi => {
        if (!this.selectedWaypoints.some(w => w.id === poi.id)) {
          this.selectedWaypoints.push(poi);
        }
      });
      this.renderCorridorList();
      if (this.routeService.currentRoute) {
        this.updateRouteSummary(this.routeService.currentRoute);
      }
    });

    document.getElementById('corridor-deselect-visible-btn')?.addEventListener('click', () => {
      const visibleIds = new Set(this.getFilteredCorridorPois().map(p => p.id));
      this.selectedWaypoints = this.selectedWaypoints.filter(w => !visibleIds.has(w.id));
      this.renderCorridorList();
      if (this.routeService.currentRoute) {
        this.updateRouteSummary(this.routeService.currentRoute);
      }
    });

    document.getElementById('launch-gmaps-link')?.addEventListener('click', (e) => {
      const href = e.currentTarget.getAttribute('href');
      if (!href || href === '#' || href === '') {
        e.preventDefault();
        alert('Please map a route with Origin and Destination first to generate your Google Maps directions.');
      }
    });

    document.getElementById('launch-apple-link')?.addEventListener('click', (e) => {
      const href = e.currentTarget.getAttribute('href');
      if (!href || href === '#' || href === '') {
        e.preventDefault();
        alert('Please map a route with Origin and Destination first to generate your Apple Maps directions.');
      }
    });

    document.getElementById('route-share-link-btn')?.addEventListener('click', async () => {
      if (!this.routeService.currentRoute) return;
      const departureOffsetMins = Number(document.getElementById('route-departure-select')?.value || 0);
      const originName = document.getElementById('route-origin-input').value.trim().replace(/^📍\s*/, '');
      const destName = document.getElementById('route-dest-input').value.trim();

      const shareUrl = this.routeService.generateTripShareUrl(
        this.selectedOrigin || { name: originName, lat: this.routeService.currentRoute.start?.lat, lng: this.routeService.currentRoute.start?.lng },
        this.selectedDest || { name: destName, lat: this.routeService.currentRoute.end?.lat, lng: this.routeService.currentRoute.end?.lng },
        this.selectedWaypoints,
        departureOffsetMins
      );

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          const tempInput = document.createElement('input');
          tempInput.value = shareUrl;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
        }
        this.showToast('🔗 Trip share link copied to clipboard! Share with friends.');
      } catch (e) {
        prompt('Copy your custom road trip link:', shareUrl);
      }
    });

    document.getElementById('export-gpx-btn').addEventListener('click', () => this.exportRouteGpx());
    document.getElementById('cache-route-offline-btn').addEventListener('click', () => this.handleOfflinePreCache());

    // 1-Tap Simulation of Planned Route
    document.getElementById('route-simulate-btn').addEventListener('click', () => {
      if (!this.routeService.currentRoute?.latLngs) return;
      this.voice.unlockAudio();
      this.heartbeat.start();
      this.journal.startSession();

      this.gps.startSimulation(this.routeService.currentRoute.latLngs);
      this.isTracking = true;
      routeModal.classList.remove('active');
      document.getElementById('hud-status').textContent = 'Simulating Route';
      startBtn.classList.add('tracking');
      startBtn.innerHTML = `<span>Stop Simulation</span>`;
    });

    // HUD Detour Slack Slider
    const hudBudgetSlider = document.getElementById('hud-budget-slider');
    hudBudgetSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      document.getElementById('hud-budget-val').textContent = `${val}m`;
      this.budget.setBudget(val);
      this.renderFeed();
    });

    // Simulation Speed Multiplier (in Settings Modal)
    document.getElementById('sim-speed-slider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('sim-speed-val').textContent = `${val}x (Cruising Speed)`;
      this.gps.setSpeedMultiplier(Number(val));
    });

    // Settings Modal
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));

    // Units System Selection
    const unitSystemSelect = document.getElementById('unit-system-select');
    if (unitSystemSelect) {
      unitSystemSelect.addEventListener('change', (e) => {
        this.unitSystem = e.target.value;
        localStorage.setItem('unit_system', this.unitSystem);
        this.updateRadiusSliderLabel();
        if (this.gps.currentPosition) {
          const sp = this.formatSpeed(this.gps.currentPosition.speed);
          document.getElementById('hud-speed').textContent = sp.val;
          const unitSpan = document.querySelector('.speed-unit');
          if (unitSpan) unitSpan.textContent = sp.unit;
        }
        this.renderFeed();
        this.renderMarkers();
      });
    }

    // Knowledge Language Selection
    const knowledgeLangSelect = document.getElementById('knowledge-lang-select');
    if (knowledgeLangSelect) {
      knowledgeLangSelect.addEventListener('change', (e) => {
        this.knowledgeLang = e.target.value;
        localStorage.setItem('knowledge_lang', this.knowledgeLang);
        this.wiki.setLanguage(this.knowledgeLang);
        this.initVoiceState();
        if (this.lastScanCoords) {
          this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
        }
      });
    }

    document.getElementById('forward-cone-toggle').addEventListener('change', (e) => {
      this.useForwardConeFilter = e.target.checked;
      this.renderFeed();
      this.renderMarkers();
    });

    // Persona Selector
    const personaSelect = document.getElementById('persona-select');
    personaSelect.addEventListener('change', (e) => {
      const p = this.personas.setPersona(e.target.value);
      if (p) {
        document.getElementById('persona-desc').textContent = p.tagline;
      }
    });

    // Ephemeral Time Phase Simulator Override
    const timePhaseSelect = document.getElementById('time-phase-select');
    timePhaseSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      this.context.simulatedHour = val === 'auto' ? null : Number(val);
      if (this.lastScanCoords) {
        this.updateContextHUD(this.lastScanCoords.lat, this.lastScanCoords.lng);
      }
      this.renderFeed();
    });

    // Budget Filter Toggle
    const budgetFilterToggle = document.getElementById('budget-filter-toggle');
    budgetFilterToggle.addEventListener('change', (e) => {
      this.budget.filterOnlyWithinBudget = e.target.checked;
      this.renderFeed();
      this.renderMarkers();
    });

    document.getElementById('radius-slider').addEventListener('input', (e) => {
      this.searchRadius = Number(e.target.value);
      this.updateRadiusSliderLabel();
      if (this.radiusCircle) this.radiusCircle.setRadius(this.searchRadius);
    });

    document.getElementById('cooldown-slider').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.voice.cooldownSeconds = val;
      document.getElementById('cooldown-val').textContent = `${Math.round(val / 60)} mins`;
    });

    document.getElementById('narration-depth').addEventListener('change', (e) => {
      this.isConcise = (e.target.value === 'concise');
    });

    // Full Backup Export
    document.getElementById('export-full-backup-btn').addEventListener('click', async () => {
      const currentSettings = {
        unitSystem: this.unitSystem,
        knowledgeLang: this.knowledgeLang,
        useForwardConeFilter: this.useForwardConeFilter,
        persona: this.personas.currentKey,
        budgetMinutes: this.budget.budgetMinutes,
        filterOnlyWithinBudget: this.budget.filterOnlyWithinBudget,
        searchRadius: this.searchRadius,
        cooldownSeconds: this.voice.cooldownSeconds,
        isConcise: this.isConcise,
        keepScreenAwake: this.wakeLock.isEnabled,
        lastKnownLocation: this.getLastKnownLocation()
      };

      const backupData = await this.storage.exportFullBackup(currentSettings);
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wandering_layer_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const statusMsg = document.getElementById('backup-status-msg');
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#3fb950';
        statusMsg.textContent = `✓ Backup exported: ${backupData.wonderPins.length} wonder pins, ${backupData.journals.length} journals, and settings.`;
      }
    });

    // Full Backup Restore
    document.getElementById('import-backup-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const statusMsg = document.getElementById('backup-status-msg');
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          const res = await this.storage.importFullBackup(parsed);

          if (res.success) {
            if (res.settings) {
              if (res.settings.unitSystem) {
                this.unitSystem = res.settings.unitSystem;
                localStorage.setItem('unit_system', this.unitSystem);
                const uSel = document.getElementById('unit-system-select');
                if (uSel) uSel.value = this.unitSystem;
              }
              if (res.settings.knowledgeLang) {
                this.knowledgeLang = res.settings.knowledgeLang;
                localStorage.setItem('knowledge_lang', this.knowledgeLang);
                this.wiki.setLanguage(this.knowledgeLang);
                const lSel = document.getElementById('knowledge-lang-select');
                if (lSel) lSel.value = this.knowledgeLang;
              }
              if (res.settings.persona) {
                this.personas.setPersona(res.settings.persona);
                const pSel = document.getElementById('persona-select');
                if (pSel) pSel.value = res.settings.persona;
              }
              if (typeof res.settings.budgetMinutes === 'number') {
                this.budget.setBudget(res.settings.budgetMinutes);
                const bSlider = document.getElementById('hud-budget-slider');
                if (bSlider) bSlider.value = res.settings.budgetMinutes;
                const bVal = document.getElementById('hud-budget-val');
                if (bVal) bVal.textContent = `${res.settings.budgetMinutes}m`;
              }
              if (typeof res.settings.searchRadius === 'number') {
                this.searchRadius = res.settings.searchRadius;
                const rSlider = document.getElementById('radius-slider');
                if (rSlider) rSlider.value = res.settings.searchRadius;
                this.updateRadiusSliderLabel();
              }
              if (typeof res.settings.cooldownSeconds === 'number') {
                this.voice.cooldownSeconds = res.settings.cooldownSeconds;
                const cSlider = document.getElementById('cooldown-slider');
                if (cSlider) cSlider.value = res.settings.cooldownSeconds;
              }
              if (typeof res.settings.isConcise === 'boolean') {
                this.isConcise = res.settings.isConcise;
                const nDepth = document.getElementById('narration-depth');
                if (nDepth) nDepth.value = this.isConcise ? 'concise' : 'rich';
              }
              if (typeof res.settings.useForwardConeFilter === 'boolean') {
                this.useForwardConeFilter = res.settings.useForwardConeFilter;
                const fToggle = document.getElementById('forward-cone-toggle');
                if (fToggle) fToggle.checked = this.useForwardConeFilter;
              }
              if (typeof res.settings.keepScreenAwake === 'boolean') {
                this.wakeLock.isEnabled = res.settings.keepScreenAwake;
                localStorage.setItem('keep_screen_awake', String(this.wakeLock.isEnabled));
                this.updateWakeLockUI(this.wakeLock.isActive());
              }
              if (res.settings.lastKnownLocation) {
                this.saveLastKnownLocation(res.settings.lastKnownLocation.lat, res.settings.lastKnownLocation.lng);
              }
            }

            await this.pinsService.loadPins();
            this.renderPinMarkers();

            if (statusMsg) {
              statusMsg.style.display = 'block';
              statusMsg.style.color = '#3fb950';
              statusMsg.textContent = `✓ Restored successfully: ${res.pinsCount} wonder pins, ${res.journalsCount} travel journals, and your preferences!`;
            }

            if (this.lastScanCoords) {
              this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
            }
          } else {
            if (statusMsg) {
              statusMsg.style.display = 'block';
              statusMsg.style.color = '#f85149';
              statusMsg.textContent = `⚠️ Restore failed: ${res.error || 'Invalid file format'}`;
            }
          }
        } catch (err) {
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.color = '#f85149';
            statusMsg.textContent = `⚠️ Error reading backup file: ${err.message}`;
          }
        }
      };
      reader.readAsText(file);
    });
  }

  initVoiceState() {
    const select = document.getElementById('voice-select');
    if (!select) return;
    setTimeout(() => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      if (!voices || voices.length === 0) return;
      select.innerHTML = '';
      
      const langPrefix = this.knowledgeLang || 'en';
      const matchingVoices = voices.filter(v => v.lang && v.lang.startsWith(langPrefix));
      const otherVoices = voices.filter(v => v.lang && !v.lang.startsWith(langPrefix));

      [...matchingVoices, ...otherVoices].forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        select.appendChild(opt);
      });

      if (matchingVoices.length > 0) {
        this.voice.selectedVoice = matchingVoices[0];
        select.value = matchingVoices[0].name;
      }

      select.addEventListener('change', () => {
        this.voice.selectedVoice = voices.find(v => v.name === select.value);
      });
    }, 400);
  }

  skipCurrentStory() {
    const skipped = this.voice.skip();
    if (skipped) {
      this.skippedPoiIds.add(skipped.id);
      this.narratedPoiIds.add(skipped.id);
      this.wiki.markAsNarrated(skipped.id);
      this.osm.markAsNarrated(skipped.id);
      this.pinsService.markAsNarrated(skipped.id);
      this.lastNarratedPoi = skipped;
    } else if (this.voice.currentPoi) {
      const p = this.voice.currentPoi;
      this.skippedPoiIds.add(p.id);
      this.narratedPoiIds.add(p.id);
      this.lastNarratedPoi = p;
    }
    this.voice.stop();
    this.renderFeed();
    if (this.activePoiForOled) {
      this.updateOledDisplay(this.activePoiForOled);
    }
  }

  replayLastStory() {
    if (!this.lastNarratedPoi) return;
    this.replayPoi(this.lastNarratedPoi);
  }

  replayPoi(poi) {
    if (!poi) return;
    this.voice.unlockAudio();
    this.lastNarratedPoi = poi;
    const relDir = poi.relativeBearing || this.gps.getRelativeDirection(poi.lat, poi.lng);
    this.voice.narrate(poi, {
      force: true,
      isConcise: this.isConcise,
      unitSystem: this.unitSystem,
      relativeBearing: relDir,
      personaService: this.personas
    }).then(didNarrate => {
      if (didNarrate) {
        this.narratedPoiIds.add(poi.id);
        this.wiki.markAsNarrated(poi.id);
        this.osm.markAsNarrated(poi.id);
        this.pinsService.markAsNarrated(poi.id);
        this.journal.logEncounter(poi, true);
        this.renderFeed();
      }
    });
  }

  openWonderPinModal() {
    document.getElementById('pin-modal').classList.add('active');
  }

  async updateContextHUD(lat, lng) {
    const phase = this.context.getTimePhase(lat, lng);
    const iconEl = document.getElementById('hud-moment-icon');
    const textEl = document.getElementById('hud-moment-text');
    if (iconEl) iconEl.textContent = phase.icon;
    if (textEl) textEl.textContent = phase.label;

    const oledMoment = document.getElementById('hud-mode-moment');
    if (oledMoment) oledMoment.textContent = `${phase.icon} ${phase.label.toUpperCase()}`;

    // Real-Time Atmospheric Weather
    try {
      const weather = await this.weather.getCurrentWeather(lat, lng, this.unitSystem);
      if (weather) {
        const wIcon = document.getElementById('hud-weather-icon');
        const wTemp = document.getElementById('hud-weather-temp');
        if (wIcon) wIcon.textContent = weather.icon;
        if (wTemp) wTemp.textContent = weather.tempDisplay;

        const oledWeather = document.getElementById('oled-weather-badge');
        if (oledWeather) {
          oledWeather.textContent = `${weather.icon} ${weather.tempDisplay} ${weather.condition.toUpperCase()}`;
        }
      }
    } catch (e) {
      console.warn('Weather HUD update notice:', e);
    }
  }

  async handleLocationUpdate(pos) {
    const { lat, lng, heading, speed, lookaheadLat, lookaheadLng, lookaheadMeters } = pos;

    this.saveLastKnownLocation(lat, lng);
    this.journal.updateDistance(lat, lng);

    const formattedSpeed = this.formatSpeed(speed);
    document.getElementById('hud-speed').textContent = formattedSpeed.val;
    const unitSpan = document.querySelector('.speed-unit');
    if (unitSpan) unitSpan.textContent = formattedSpeed.unit;

    const oledSpeed = document.getElementById('oled-speed');
    if (oledSpeed) oledSpeed.textContent = formattedSpeed.val;
    const oledUnit = document.querySelector('.oled-speed-lbl');
    if (oledUnit) oledUnit.textContent = formattedSpeed.oledUnit;

    const headingEl = document.getElementById('hud-heading');
    if (headingEl && heading !== null) {
      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const index = Math.round((((heading % 360) + 360) % 360) / 22.5) % 16;
      headingEl.textContent = `🧭 ${directions[index]}`;
    }

    this.updateContextHUD(lat, lng);
    
    this.carMarker.setLatLng([lat, lng]);

    // Speed-adaptive horizon radius scaling
    const speedRatio = Math.max(1, speed / 40);
    const dynamicRadius = Math.min(8000, Math.round(this.searchRadius * speedRatio));
    this.radiusCircle.setLatLng([lat, lng]);
    this.radiusCircle.setRadius(dynamicRadius);

    this.map.panTo([lat, lng], { animate: true, duration: 0.5 });

    const dot = document.getElementById('car-dot');
    if (dot && heading !== null) {
      dot.style.transform = `rotate(${heading}deg)`;
    }

    const scanThresholdMeters = speed > 70 ? 1200 : (speed > 40 ? 800 : 500);
    const shouldScan = !this.lastScanCoords ||
      this.calculateDistance(lat, lng, this.lastScanCoords.lat, this.lastScanCoords.lng) > scanThresholdMeters;

    if (shouldScan) {
      this.lastScanCoords = { lat, lng };
      const scanAnchorLat = speed > 40 ? lookaheadLat : lat;
      const scanAnchorLng = speed > 40 ? lookaheadLng : lng;
      await this.scanLandscape(scanAnchorLat, scanAnchorLng);
    } else {
      this.updatePoiBearings(lat, lng);
    }
  }

  async scanLandscape(lat, lng) {
    document.getElementById('hud-status').textContent = 'Scanning landscape...';

    const [wikiPois, osmPois] = await Promise.all([
      this.wiki.findNearby(lat, lng, this.searchRadius),
      this.osm.findNearby(lat, lng, this.searchRadius)
    ]);

    const customPins = this.pinsService.pins.map(p => this.pinsService.toPoi(p));
    const nearbyPins = customPins.filter(p => {
      p.dist = Math.round(this.calculateDistance(lat, lng, p.lat, p.lng));
      return p.dist <= this.searchRadius;
    });

    // Merge in corridor POIs (both selected & unselected) when along a planned route
    const corridorList = (this.routeService.corridorPois || []).map(p => {
      p.dist = Math.round(this.calculateDistance(lat, lng, p.lat, p.lng));
      return p;
    }).filter(p => p.dist <= Math.max(this.searchRadius, 4000));

    document.getElementById('hud-status').textContent = this.gps.isSimulating ? 'Simulating Drive' : 'Scanning';

    // Deduplicate merged POIs by unique ID and classify category
    const mergedMap = new Map();
    [...nearbyPins, ...corridorList, ...wikiPois, ...osmPois].forEach(p => {
      if (p && p.id && !mergedMap.has(p.id)) {
        if (!p.categoryKey) {
          const cat = this.routeService.classifyCategory(p);
          p.categoryKey = cat.key;
          p.categoryLabel = cat.label;
          p.categoryIcon = cat.icon;
        }
        mergedMap.set(p.id, p);
      }
    });
    const merged = Array.from(mergedMap.values());
    this.currentPois = merged;

    merged.forEach(poi => this.journal.logEncounter(poi, false));

    this.renderMarkers();
    this.renderFeed();
    this.evaluateAutomaticNarration(merged);
  }

  updatePoiBearings(carLat, carLng) {
    this.currentPois.forEach(poi => {
      poi.dist = Math.round(this.calculateDistance(carLat, carLng, poi.lat, poi.lng));
      poi.relativeBearing = this.gps.getRelativeDirection(poi.lat, poi.lng);
      poi.inForwardCone = this.gps.isInForwardCone(poi.lat, poi.lng);
      poi.detour = this.budget.formatDetourBadge(poi.dist);
      poi.moment = this.context.evaluatePoiMoment(poi, carLat, carLng, this.weather?.currentWeather);
    });
    this.currentPois.sort((a, b) => a.dist - b.dist);
    this.renderFeed();

    if (this.currentPois.length > 0 && !this.activePoiForOled) {
      this.updateOledDisplay(this.currentPois[0]);
    }

    // Automatically evaluate narration as car approaches landmarks
    this.evaluateAutomaticNarration(this.currentPois);
  }

  evaluateAutomaticNarration(pois) {
    if (!pois || pois.length === 0 || this.voice.isSpeaking) return;

    // Filter to candidates that have NOT been announced and NOT skipped yet
    let candidates = pois.filter(p => !this.narratedPoiIds.has(p.id) && !this.skippedPoiIds.has(p.id));

    // Filter by active live category preference (if driver selected a specific theme)
    if (this.activeFeedCategory !== 'all') {
      candidates = candidates.filter(p => (p.categoryKey || this.routeService.classifyCategory(p).key) === this.activeFeedCategory);
    }

    // Filter to approach distance (up to 2500m)
    candidates = candidates.filter(p => p.dist <= Math.min(this.searchRadius, 2500));

    if (this.useForwardConeFilter && this.gps.speed > 15) {
      candidates = candidates.filter(p => this.gps.isInForwardCone(p.lat, p.lng));
    }

    // All passing markers along the road (selected or unselected) are announced in sequence
    candidates.sort((a, b) => a.dist - b.dist);

    const candidate = candidates[0];
    if (candidate) {
      const relDir = this.gps.getRelativeDirection(candidate.lat, candidate.lng);
      this.voice.narrate(candidate, {
        force: false,
        isConcise: this.isConcise,
        unitSystem: this.unitSystem,
        relativeBearing: relDir,
        personaService: this.personas
      }).then(didNarrate => {
        if (didNarrate) {
          this.narratedPoiIds.add(candidate.id);
          this.lastNarratedPoi = candidate;
          if (candidate.source === 'wikipedia' || candidate.source === 'wikivoyage') {
            this.wiki.markAsNarrated(candidate.id);
          } else if (candidate.source === 'osm') {
            this.osm.markAsNarrated(candidate.id);
          } else if (candidate.source === 'wonder_pin') {
            this.pinsService.markAsNarrated(candidate.id);
          }
          this.journal.logEncounter(candidate, true);
          this.renderFeed();
        }
      });
    }
  }

  renderMarkers() {
    this.poiMarkers.forEach(marker => this.map.removeLayer(marker));
    this.poiMarkers.clear();

    let filtered = this.currentPois;
    if (this.useForwardConeFilter && this.gps.speed > 15) {
      filtered = filtered.filter(p => this.gps.isInForwardCone(p.lat, p.lng));
    }
    if (this.budget.filterOnlyWithinBudget) {
      filtered = filtered.filter(p => this.budget.estimateDetourCost(p.dist).fitsBudget);
    }

    filtered.forEach(poi => {
      let color = '#e3b341';
      let iconSymbol = '📖';

      if (poi.source === 'osm') {
        color = '#3fb950';
        iconSymbol = '🌲';
      } else if (poi.source === 'wonder_pin') {
        color = '#10b981';
        iconSymbol = '✨';
      } else if (poi.source === 'wikivoyage') {
        color = '#58a6ff';
        iconSymbol = '🧭';
      }

      const customIcon = L.divIcon({
        className: 'custom-poi-marker',
        html: `
          <div style="
            background: ${color};
            color: #000;
            border-radius: 50%;
            width: 26px; height: 26px;
            display: flex; align-items: center; justify-content: center;
            font-size: 13px; font-weight: bold;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            border: 2px solid #ffffff;
            cursor: pointer;
          ">
            ${iconSymbol}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: customIcon }).addTo(this.map);
      const isAnnounced = this.narratedPoiIds.has(poi.id);
      const audioBtnText = isAnnounced ? '🔁 Replay Story' : '🔊 Whisper Story';

      const popupDiv = document.createElement('div');
      popupDiv.style.fontFamily = 'sans-serif';
      popupDiv.style.color = '#161b22';
      popupDiv.style.maxWidth = '230px';

      popupDiv.innerHTML = `
        <h4 style="margin-bottom: 4px; font-size: 14px; color: #1f2328; font-weight: 600;">${this.escapeHtml(poi.title)}</h4>
        <p style="font-size: 12px; margin-bottom: 8px; color: #57606a; line-height: 1.35;">${this.escapeHtml(poi.extract.slice(0, 110))}...</p>
        <div style="display: flex; gap: 8px; flex-direction: column; margin-top: 6px;">
          <button class="popup-audio-btn" style="background:#1f6feb;color:#fff;border:none;padding:7px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;">
            ${audioBtnText}
          </button>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}" target="_blank" rel="noopener noreferrer" class="popup-detour-btn" style="background:#238636;color:#fff;text-align:center;padding:7px 10px;border-radius:6px;font-weight:600;font-size:12px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;">
            🗺️ Detour in Google Maps &rarr;
          </a>
        </div>
      `;

      popupDiv.querySelector('.popup-audio-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.replayPoi(poi);
      });

      popupDiv.querySelector('.popup-detour-link, .popup-detour-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`, '_blank');
        }
      });

      marker.bindPopup(popupDiv);
      this.poiMarkers.set(poi.id, marker);
    });
  }

  renderPinMarkers() {
    this.pinMarkers.forEach(m => this.map.removeLayer(m));
    this.pinMarkers.clear();

    this.pinsService.pins.forEach(pin => {
      const pinIcon = L.divIcon({
        className: 'wonder-pin-marker',
        html: `
          <div style="
            background: #059669;
            color: #fff;
            border-radius: 50%;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px;
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.85);
            border: 2px solid #ffffff;
            cursor: pointer;
          ">
            ✨
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const m = L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(this.map);
      
      const pinPopup = document.createElement('div');
      pinPopup.style.fontFamily = 'sans-serif';
      pinPopup.style.color = '#161b22';
      pinPopup.style.maxWidth = '220px';
      pinPopup.innerHTML = `
        <h4 style="margin-bottom: 4px; font-size: 14px; color: #1f2328; font-weight: 600;">✨ ${this.escapeHtml(pin.title)}</h4>
        <p style="font-size: 12px; margin-bottom: 8px; color: #57606a;">${this.escapeHtml(pin.note)}</p>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}" target="_blank" rel="noopener noreferrer" class="pin-detour-btn" style="color: #059669; font-weight: bold; font-size: 12px; text-decoration: underline; display: block; padding: 4px 0;">Detour to Wonder &rarr;</a>
      `;

      pinPopup.querySelector('.pin-detour-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`, '_blank');
        }
      });

      m.bindPopup(pinPopup);
      this.pinMarkers.set(pin.id, m);
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }

  renderFeed() {
    const feed = document.getElementById('feed-scroll');
    const countBadge = document.getElementById('feed-count');

    let visiblePois = this.currentPois;
    if (this.activeFeedCategory !== 'all') {
      visiblePois = visiblePois.filter(p => (p.categoryKey || this.routeService.classifyCategory(p).key) === this.activeFeedCategory);
    }
    if (this.useForwardConeFilter && this.gps.speed > 15) {
      visiblePois = visiblePois.filter(p => this.gps.isInForwardCone(p.lat, p.lng));
    }
    if (this.budget.filterOnlyWithinBudget) {
      visiblePois = visiblePois.filter(p => this.budget.estimateDetourCost(p.dist).fitsBudget);
    }

    countBadge.textContent = `${visiblePois.length} Nearby`;

    if (visiblePois.length === 0) {
      feed.innerHTML = `
        <div class="empty-feed">
          <div class="icon">✨</div>
          <h3>Pure Wandering Mode</h3>
          <p>No roadside landmarks matching your current category (${this.activeFeedCategory}) and filters within ${this.formatRadius(this.searchRadius)}.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = '';

    visiblePois.forEach(poi => {
      const card = document.createElement('div');
      card.id = `card-${poi.id}`;
      card.className = `poi-card ${poi.source === 'wonder_pin' ? 'wonder-pin-card' : ''}`;

      const relDir = poi.relativeBearing || this.gps.getRelativeDirection(poi.lat, poi.lng);
      const distStr = this.formatDistance(poi.dist);
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;

      const detourBadge = this.budget.formatDetourBadge(poi.dist);
      const momentBadge = this.context.evaluatePoiMoment(poi, poi.lat, poi.lng);

      const catInfo = poi.categoryKey ? { key: poi.categoryKey, label: poi.categoryLabel, icon: poi.categoryIcon } : this.routeService.classifyCategory(poi);
      let badgeLabel = `${catInfo.icon} ${catInfo.label.toUpperCase()}`;

      const isAnnounced = this.narratedPoiIds.has(poi.id);
      const isSpeakingThis = this.voice.isSpeaking && (this.voice.currentPoi?.id === poi.id);

      let actionButtonHtml = '';
      if (isSpeakingThis) {
        actionButtonHtml = `
          <button class="action-btn btn-skip-card" data-id="${poi.id}" title="Skip this story">
            ⏭️ Skip Story
          </button>
        `;
      } else if (isAnnounced) {
        actionButtonHtml = `
          <button class="action-btn btn-narrate btn-replay" data-id="${poi.id}" title="Replay this story">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Replay
          </button>
        `;
      } else {
        actionButtonHtml = `
          <button class="action-btn btn-narrate" data-id="${poi.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            Whisper
          </button>
        `;
      }

      card.innerHTML = `
        ${poi.thumbnail ? `<img src="${poi.thumbnail}" alt="${poi.title}" class="poi-image" loading="lazy">` : ''}
        <div class="poi-content">
          <div class="poi-meta">
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="poi-badge">${badgeLabel}</span>
              ${isAnnounced ? `<span class="badge-announced">✓ Announced</span>` : ''}
            </div>
            <span class="poi-bearing">${relDir} (${distStr})</span>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
            ${momentBadge ? `<span class="badge-moment">${momentBadge.badge}</span>` : ''}
            <span class="${detourBadge.fits ? 'badge-budget-fit' : 'badge-budget-over'}" title="${detourBadge.desc}">${detourBadge.label}</span>
          </div>

          <h3 class="poi-title">${poi.title}</h3>
          <p class="poi-extract">${poi.extract}</p>
          <div class="poi-actions">
            ${actionButtonHtml}
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="action-btn btn-detour">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              Detour Here
            </a>
          </div>
        </div>
      `;

      const narrateBtn = card.querySelector('.btn-narrate');
      if (narrateBtn) {
        narrateBtn.addEventListener('click', () => {
          this.replayPoi(poi);
        });
      }

      const detourBtn = card.querySelector('.btn-detour');
      if (detourBtn) {
        detourBtn.addEventListener('click', (e) => {
          if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            e.preventDefault();
            window.open(googleMapsUrl, '_blank');
          }
        });
      }

      const skipBtn = card.querySelector('.btn-skip-card');
      if (skipBtn) {
        skipBtn.addEventListener('click', () => {
          this.skipCurrentStory();
        });
      }

      feed.appendChild(card);
    });
  }

  updateOledDisplay(poi) {
    if (!poi) return;
    this.activePoiForOled = poi;

    const titleEl = document.getElementById('oled-poi-title');
    const typeEl = document.getElementById('oled-poi-type');
    const bearingEl = document.getElementById('oled-poi-bearing');
    const distEl = document.getElementById('oled-poi-dist');
    const detourEl = document.getElementById('oled-poi-detour');
    const extractEl = document.getElementById('oled-poi-extract');
    const detourLink = document.getElementById('oled-detour-btn');
    const speakBtn = document.getElementById('oled-speak-btn');
    const skipBtn = document.getElementById('oled-skip-btn');
    const replayBtn = document.getElementById('oled-replay-btn');

    if (titleEl) titleEl.textContent = poi.title;
    if (typeEl) typeEl.textContent = (poi.shortDescription || 'ROAD WONDER').toUpperCase();
    if (bearingEl) bearingEl.textContent = poi.relativeBearing || 'Ahead';
    if (distEl) distEl.textContent = this.formatDistance(poi.dist);
    if (detourEl) detourEl.textContent = poi.detour ? poi.detour.label : '+5m Detour';
    if (extractEl) extractEl.textContent = poi.extract;
    if (detourLink) detourLink.href = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;

    const isSpeaking = this.voice.isSpeaking;
    const isAnnounced = this.narratedPoiIds.has(poi.id);

    if (isSpeaking) {
      if (speakBtn) speakBtn.style.display = 'none';
      if (replayBtn) replayBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'inline-flex';
    } else if (isAnnounced) {
      if (speakBtn) speakBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      if (replayBtn) replayBtn.style.display = 'inline-flex';
    } else {
      if (skipBtn) skipBtn.style.display = 'none';
      if (replayBtn) replayBtn.style.display = 'none';
      if (speakBtn) speakBtn.style.display = 'inline-flex';
    }
  }

  openScrapbook() {
    const modal = document.getElementById('scrapbook-modal');
    const stats = this.journal.getSummaryStats(this.unitSystem);

    document.getElementById('stat-dist').textContent = this.unitSystem === 'imperial' ? stats.distanceMiles : stats.distanceKm;
    const statDistLabel = document.querySelector('.stat-box:nth-child(1) .stat-label');
    if (statDistLabel) statDistLabel.textContent = this.unitSystem === 'imperial' ? 'mi Scanned' : 'km Scanned';

    document.getElementById('stat-time').textContent = `${stats.elapsedMinutes}m`;
    document.getElementById('stat-pois').textContent = stats.totalDiscoveries;
    document.getElementById('stat-stories').textContent = stats.narratedCount;

    const timelineContainer = document.getElementById('scrapbook-timeline');
    if (this.journal.entries.length === 0) {
      timelineContainer.innerHTML = `
        <div class="empty-feed">
          <p>No roadside landmarks logged yet. Start driving or run a simulation to compile your journal!</p>
        </div>
      `;
    } else {
      timelineContainer.innerHTML = '';
      this.journal.entries.forEach((entry, idx) => {
        const item = document.createElement('div');
        item.className = 'timeline-entry';
        const loggedTime = entry.loggedAt instanceof Date ? entry.loggedAt : new Date(entry.loggedAt);
        const timeStr = loggedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
          ${entry.thumbnail ? `<img src="${entry.thumbnail}" class="timeline-thumb" alt="${entry.title}">` : '<div class="timeline-thumb" style="background:#21262d;display:flex;align-items:center;justify-content:center;font-size:24px;">🧭</div>'}
          <div class="timeline-info">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="timeline-title">${idx + 1}. ${entry.title}</span>
              <span class="timeline-time">${timeStr}</span>
            </div>
            <p class="timeline-extract">${entry.extract.slice(0, 140)}...</p>
            <div style="margin-top:4px;">
              <a href="https://www.google.com/maps/dir/?api=1&destination=${entry.lat},${entry.lng}" target="_blank" style="color:var(--accent-cyan);font-size:0.75rem;text-decoration:none;font-weight:600;">
                Google Maps &rarr;
              </a>
            </div>
          </div>
        `;
        timelineContainer.appendChild(item);
      });
    }

    modal.classList.add('active');
  }

  exportJournalMarkdown() {
    const mdContent = this.journal.exportToMarkdown(this.unitSystem);
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `road_trip_journal_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async locateUserForRoute(inputEl = null, btnEl = null, statusEl = null) {
    const locBtn = btnEl || document.getElementById('route-my-loc-btn');
    const input = inputEl || document.getElementById('route-origin-input');
    const status = statusEl || document.getElementById('route-status');

    if (locBtn) locBtn.textContent = '⏳ Locating...';
    if (status) status.innerHTML = '<span>Detecting high-precision GPS location...</span>';

    // Helper to apply verified coordinates to origin and route state
    const applyCoords = async (lat, lng, sourceLabel = 'GPS') => {
      this.gps.updatePosition(lat, lng, null, 0, false);
      this.saveLastKnownLocation(lat, lng);

      const placeName = await this.routeService.reverseGeocode(lat, lng);
      if (input) input.value = `📍 ${placeName}`;
      this.selectedOrigin = {
        name: placeName,
        lat: lat,
        lng: lng
      };

      if (locBtn) locBtn.textContent = '📍 Here';
      if (status) {
        const tag = sourceLabel ? ` (${sourceLabel})` : '';
        status.innerHTML = `<span>✓ Located: <strong>${placeName}</strong> (${lat.toFixed(4)}, ${lng.toFixed(4)})${tag}</span>`;
      }
    };

    // 1. Fast-path: If the map already has an active, non-simulated live GPS fix, use it immediately
    let hasLiveFix = false;
    if (this.gps?.currentPosition && !this.gps.currentPosition.isSimulated && typeof this.gps.currentPosition.lat === 'number') {
      hasLiveFix = true;
      const { lat, lng } = this.gps.currentPosition;
      await applyCoords(lat, lng, 'Live GPS');
    }

    // 2. Query hardware GPS (high accuracy) to get or refine the latest coordinate fix
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const accTag = accuracy ? `±${Math.round(accuracy)}m` : 'Hardware GPS';
          await applyCoords(latitude, longitude, accTag);
        },
        async (err) => {
          console.warn('Route location hardware GPS error/timeout:', err.message);
          // If we already obtained a live fix from step 1, we do not need fallback
          if (hasLiveFix) return;

          // 3. Fallback: Last known saved GPS location
          const lastKnown = this.getLastKnownLocation();
          if (lastKnown && typeof lastKnown.lat === 'number' && typeof lastKnown.lng === 'number') {
            await applyCoords(lastKnown.lat, lastKnown.lng, 'Last Known GPS');
          } else {
            // 4. Last resort: IP Geolocation (only when GPS completely denied or unavailable)
            try {
              const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
              if (res.ok) {
                const data = await res.json();
                if (data.latitude && data.longitude) {
                  const city = data.city || data.locality || data.principalSubdivision;
                  const state = data.principalSubdivisionCode ? data.principalSubdivisionCode.split('-').pop() : (data.principalSubdivision || '');
                  const label = city ? (state && state !== city ? `${city}, ${state}` : city) : 'Estimated Network Location';
                  
                  this.gps.updatePosition(data.latitude, data.longitude, null, 0, false);
                  if (input) input.value = `📍 ${label}`;
                  this.selectedOrigin = {
                    name: label,
                    lat: data.latitude,
                    lng: data.longitude
                  };
                  if (locBtn) locBtn.textContent = '📍 Here';
                  if (status) status.innerHTML = `<span>⚠️ Estimated via Network IP: <strong>${label}</strong> (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)})</span>`;
                  return;
                }
              }
            } catch (e) {}

            if (locBtn) locBtn.textContent = '📍 Here';
            if (status) status.innerHTML = `<span style="color:#f85149;">⚠️ GPS location unavailable. Please type your city or address.</span>`;
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    } else if (!hasLiveFix) {
      const lastKnown = this.getLastKnownLocation();
      if (lastKnown) {
        await applyCoords(lastKnown.lat, lastKnown.lng, 'Last Known GPS');
      } else {
        if (locBtn) locBtn.textContent = '📍 Here';
        if (status) status.innerHTML = `<span style="color:#f85149;">⚠️ Geolocation not supported by browser. Please type origin.</span>`;
      }
    }
  }

  initAutocomplete() {
    // Route Builder Autocomplete
    this.setupAutocompleteField(
      document.getElementById('route-origin-input'),
      document.getElementById('origin-suggestions'),
      (item) => {
        this.selectedOrigin = {
          name: item.title,
          fullName: `${item.title}, ${item.subtitle}`,
          lat: item.lat,
          lng: item.lng
        };
      }
    );

    this.setupAutocompleteField(
      document.getElementById('route-dest-input'),
      document.getElementById('dest-suggestions'),
      (item) => {
        this.selectedDest = {
          name: item.title,
          fullName: `${item.title}, ${item.subtitle}`,
          lat: item.lat,
          lng: item.lng
        };
      }
    );


    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-container')) {
        document.querySelectorAll('.autocomplete-dropdown').forEach(d => d.classList.remove('active'));
      }
    });
  }

  setupAutocompleteField(input, dropdown, onSelect) {
    if (!input || !dropdown) return;
    let debounceTimer = null;

    input.addEventListener('input', () => {
      const val = input.value.trim().replace(/^📍\s*/, '');
      clearTimeout(debounceTimer);

      if (val.length < 2) {
        dropdown.innerHTML = '';
        dropdown.classList.remove('active');
        return;
      }

      debounceTimer = setTimeout(async () => {
        const suggestions = await this.routeService.searchSuggestions(val);
        dropdown.innerHTML = '';

        if (suggestions.length === 0) {
          dropdown.classList.remove('active');
          return;
        }

        suggestions.forEach(item => {
          const div = document.createElement('div');
          div.className = 'autocomplete-item';
          div.innerHTML = `
            <span class="autocomplete-title">${item.title}</span>
            <span class="autocomplete-subtitle">${item.subtitle || ''}</span>
          `;

          div.addEventListener('click', () => {
            input.value = item.subtitle ? `${item.title}, ${item.subtitle}` : item.title;
            dropdown.classList.remove('active');
            onSelect(item);
          });

          dropdown.appendChild(div);
        });

        dropdown.classList.add('active');
      }, 250);
    });
  }

  renderRouteOptionsCards(routes, activeIndex, containerEl, onSelect) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    containerEl.style.display = 'grid';

    routes.forEach((r, idx) => {
      const card = document.createElement('div');
      card.className = `route-option-card ${idx === activeIndex ? 'active' : ''}`;
      
      const distStr = this.unitSystem === 'imperial' ? `${r.distanceMiles} mi` : `${r.distanceKm} km`;
      const timeStr = `${Math.floor(r.durationMinutes / 60) > 0 ? `${Math.floor(r.durationMinutes / 60)}h ` : ''}${r.durationMinutes % 60}m`;
      const deltaBadge = r.timeDeltaMinutes === 0 ? '<span style="color:#3fb950;font-weight:600;">Fastest</span>' : `<span style="color:var(--text-muted);">+${r.timeDeltaMinutes}m</span>`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="route-badge-pill ${r.badgeType || 'badge-balanced'}">${r.badge || `Route ${idx + 1}`}</span>
          <span style="font-size: 0.72rem;">${deltaBadge}</span>
        </div>

        <div class="route-card-title">
          <span>Route ${idx + 1}</span>
          <span style="font-size: 0.85rem; color: var(--accent-cyan);">${timeStr}</span>
        </div>

        <div class="route-card-metrics">
          <span>${distStr}</span> &bull; <span>${r.comfortLabel}</span>
        </div>

        <div>
          <div class="route-score-row">
            <span style="color: var(--text-muted);">🌲 Scenic Value</span>
            <span style="font-weight: 700; color: #34d399;">${r.scenicScore}/100</span>
          </div>
          <div class="scenic-score-bar-bg">
            <div class="scenic-score-bar-fill" style="width: ${r.scenicScore}%;"></div>
          </div>
        </div>

        <div class="route-comfort-badge">
          <span>🛋️ Driving Comfort: <strong>${r.comfortScore}/100</strong></span>
        </div>
      `;

      card.addEventListener('click', () => {
        containerEl.querySelectorAll('.route-option-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        onSelect(idx);
      });

      containerEl.appendChild(card);
    });
  }

  renderAlternativeRoutePolylines(routes, activeIndex, onSelect) {
    if (this.alternativePolylines) {
      this.alternativePolylines.forEach(p => this.map.removeLayer(p));
    }
    this.alternativePolylines = [];

    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }

    const bounds = L.latLngBounds();

    routes.forEach((r, idx) => {
      const isActive = idx === activeIndex;
      const polyline = L.polyline(r.latLngs, {
        color: isActive ? '#58a6ff' : '#8b949e',
        weight: isActive ? 6 : 4,
        opacity: isActive ? 0.9 : 0.45,
        dashArray: isActive ? null : '6, 6',
        lineCap: 'round'
      }).addTo(this.map);

      polyline.on('click', () => onSelect(idx));
      polyline.bindTooltip(`Route ${idx + 1}: ${r.badge} (${r.durationMinutes}m)`, { sticky: true });

      this.alternativePolylines.push(polyline);
      bounds.extend(polyline.getBounds());
    });

    if (routes.length > 0) {
      this.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  renderRouteWeatherPreview(forecastList, containerEl) {
    if (!containerEl) return;
    if (!forecastList || forecastList.length === 0) {
      containerEl.style.display = 'none';
      return;
    }

    containerEl.style.display = 'block';
    containerEl.innerHTML = `
      <div class="weather-preview-header">
        <span class="weather-preview-title">
          <span>🌤️ En-Route Predictive Weather Forecast</span>
        </span>
        <span style="font-size: 0.72rem; color: var(--text-muted);">Predictions at estimated waypoint arrival</span>
      </div>
      <div class="weather-corridor-grid">
        ${forecastList.map(cp => `
          <div class="weather-cp-card">
            <div class="weather-cp-label">${cp.label}</div>
            <div class="weather-cp-eta">${cp.etaDisplay}</div>
            <div class="weather-cp-temp-row">
              <span class="weather-cp-temp">${cp.tempDisplay}</span>
              <span class="weather-cp-icon">${cp.icon}</span>
            </div>
            <div class="weather-cp-cond">${cp.condition}</div>
            ${cp.hazardNote ? `<span class="weather-hazard-chip">${cp.hazardNote}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  updateRouteSummary(route) {
    if (!route) return;

    const distEl = document.getElementById('route-summary-dist');
    const directEl = document.getElementById('route-summary-direct');
    const totalEl = document.getElementById('route-summary-total');
    const stopsEl = document.getElementById('route-summary-stops');

    const isImperial = this.unitSystem === 'imperial';
    const distDisplay = isImperial ? `${route.distanceMiles} mi` : `${route.distanceKm} km`;
    if (distEl) distEl.textContent = distDisplay;

    const formatMins = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    if (directEl) directEl.textContent = formatMins(route.durationMinutes);

    const selectedStops = this.selectedWaypoints || [];
    const detourAddedMins = selectedStops.reduce((sum, p) => sum + (p.detourMinutes || 0), 0);
    const totalMins = route.durationMinutes + detourAddedMins;

    if (totalEl) totalEl.textContent = formatMins(totalMins);
    if (stopsEl) stopsEl.textContent = `${selectedStops.length}`;

    // Update navigation transfer links for full trip
    const gmapsLink = document.getElementById('launch-gmaps-link');
    const appleLink = document.getElementById('launch-apple-link');

    if (gmapsLink) {
      gmapsLink.href = this.routeService.generateGoogleMapsUrl(route.start, route.end, selectedStops);
      gmapsLink.style.display = 'inline-flex';
    }
    if (appleLink) {
      appleLink.href = this.routeService.generateAppleMapsUrl(route.start, route.end, selectedStops);
      appleLink.style.display = 'inline-flex';
    }

    const shareBtn = document.getElementById('route-share-link-btn');
    if (shareBtn) {
      shareBtn.style.display = 'inline-flex';
    }

    // Evaluate Multi-Day Trip Legs and Google Maps 9-Stop Limit
    const targetHours = Number(document.getElementById('daily-target-hours-select')?.value || 5);
    const dailyLegs = this.routeService.splitRouteIntoDailyLegs(route, selectedStops, targetHours, this.unitSystem);
    this.currentDailyLegs = dailyLegs;

    const limitAlert = document.getElementById('route-gmaps-limit-alert');
    const limitText = document.getElementById('route-gmaps-limit-text');
    const legsContainer = document.getElementById('route-daily-legs-container');
    const legsList = document.getElementById('route-daily-legs-list');

    if (selectedStops.length > 9) {
      if (limitAlert) limitAlert.style.display = 'block';
      if (limitText) {
        limitText.innerHTML = `You have selected <strong>${selectedStops.length} stops</strong>. Google Maps accepts up to 9 intermediate stops per link. We've auto-split your trip into <strong>${dailyLegs.length} Day Legs</strong> below so every stop opens seamlessly in Google Maps! (Or use <strong>Save Full GPX</strong> for all ${selectedStops.length} stops in one file).`;
      }
    } else if (totalMins >= 300) {
      if (limitAlert) limitAlert.style.display = 'block';
      if (limitText) {
        limitText.innerHTML = `Long-distance road trip detected (${formatMins(totalMins)}). We've suggested a <strong>${dailyLegs.length}-Day Itinerary</strong> (~${targetHours}h drive/day) below with 1-click Google Maps links for each day!`;
      }
    } else {
      if (limitAlert) limitAlert.style.display = 'none';
    }

    if (dailyLegs.length > 1) {
      if (legsContainer) legsContainer.style.display = 'block';
      if (legsList) {
        legsList.innerHTML = '';
        dailyLegs.forEach((leg, idx) => {
          const card = document.createElement('div');
          card.className = 'daily-leg-card';

          const legDistDisplay = isImperial ? `${leg.distanceMiles} mi` : `${leg.distanceKm} km`;
          const stopsSummary = leg.waypoints.length === 1 ? '1 stop' : `${leg.waypoints.length} stops`;

          card.innerHTML = `
            <div class="daily-leg-header">
              <div class="daily-leg-title">
                <span>📅 ${leg.title}</span>
              </div>
              <div class="daily-leg-metrics">
                ${formatMins(leg.durationMinutes)} &bull; ${legDistDisplay} &bull; ${stopsSummary}
              </div>
            </div>
            <div class="daily-leg-waypoints">
              ${leg.waypoints.length > 0
                ? leg.waypoints.map(wp => `<span class="daily-leg-wp-tag" title="${wp.title}">📍 ${wp.title}</span>`).join('')
                : '<span style="font-size:0.7rem;color:var(--text-muted);">Direct highway segment (no detours)</span>'
              }
            </div>
            <div class="daily-leg-actions">
              <a href="${leg.googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="daily-leg-btn gmaps">
                🗺️ Open Day ${leg.dayNumber} in Google Maps &rarr;
              </a>
              <a href="${leg.appleMapsUrl}" target="_blank" rel="noopener noreferrer" class="daily-leg-btn apple">
                🍏 Apple Maps
              </a>
              <button class="daily-leg-btn sim" data-leg-index="${idx}">
                🚗 Simulate Day ${leg.dayNumber}
              </button>
            </div>
          `;

          const simBtn = card.querySelector('.daily-leg-btn.sim');
          if (simBtn) {
            simBtn.addEventListener('click', () => {
              this.simulateRouteLeg(leg);
            });
          }

          legsList.appendChild(card);
        });
      }
    } else {
      if (legsContainer) legsContainer.style.display = 'none';
    }
  }

  simulateRouteLeg(leg) {
    if (!leg || !leg.latLngs || leg.latLngs.length < 2) return;
    const routeModal = document.getElementById('route-modal');
    const startBtn = document.getElementById('start-journey-btn');

    this.voice.unlockAudio();
    this.heartbeat.start();
    this.journal.startSession();

    this.gps.startSimulation(leg.latLngs);
    this.isTracking = true;
    if (routeModal) routeModal.classList.remove('active');
    document.getElementById('hud-status').textContent = `Simulating Day ${leg.dayNumber}`;
    if (startBtn) {
      startBtn.classList.add('tracking');
      startBtn.innerHTML = `<span>Stop Day ${leg.dayNumber} Simulation</span>`;
    }
  }

  async handleRouteScan() {
    const originInput = document.getElementById('route-origin-input').value.trim().replace(/^📍\s*/, '');
    const destInput = document.getElementById('route-dest-input').value.trim();
    const statusEl = document.getElementById('route-status');

    if (!originInput || !destInput) {
      statusEl.innerHTML = '<span style="color: #f85149;">Please provide both Origin and Destination.</span>';
      return;
    }

    statusEl.innerHTML = '<span>⏳ Locating endpoints and mapping driving corridor...</span>';

    try {
      let startCoords = this.selectedOrigin;
      if (!startCoords || !originInput.includes(startCoords.name)) {
        startCoords = await this.routeService.geocode(originInput);
      }

      let endCoords = this.selectedDest;
      if (!endCoords || !destInput.includes(endCoords.name)) {
        endCoords = await this.routeService.geocode(destInput);
      }

      if (!startCoords || !endCoords) {
        statusEl.innerHTML = '<span style="color: #f85149;">Could not locate one of the endpoints. Try typing a city or landmark.</span>';
        return;
      }

      statusEl.innerHTML = `<span>Mapping driving route from <strong>${startCoords.name}</strong> to <strong>${endCoords.name}</strong>...</span>`;

      const route = await this.routeService.calculateRoute(startCoords, endCoords);
      if (!route) {
        statusEl.innerHTML = '<span style="color: #f85149;">Unable to calculate route.</span>';
        return;
      }

      this.routeService.currentRoute = route;

      // 1. Immediately draw route polyline on map
      if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
      }
      this.routePolyline = L.polyline(route.latLngs, {
        color: '#58a6ff',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round'
      }).addTo(this.map);
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });

      // 2. Show Summary Banner, Offline Cache button, Simulate button, Export GPX
      document.getElementById('offline-cache-row').style.display = 'flex';
      document.getElementById('route-summary-banner').style.display = 'flex';
      document.getElementById('route-simulate-btn').style.display = 'inline-block';
      document.getElementById('export-gpx-btn').style.display = 'flex';
      this.updateRouteSummary(route);

      // 3. Predictive En-Route Weather Forecast
      const departureOffsetMins = Number(document.getElementById('route-departure-select')?.value || 0);
      const departureDate = new Date(Date.now() + (departureOffsetMins * 60 * 1000));

      try {
        const weatherPreviewEl = document.getElementById('route-weather-preview');
        this.weather.getRouteWeatherForecast(route.latLngs, route.durationMinutes, this.unitSystem).then(fc => {
          this.renderRouteWeatherPreview(fc, weatherPreviewEl);
        });
      } catch (e) {}

      statusEl.innerHTML = `<span>✓ Route ready &bull; Loading roadside highlights & weather forecasts...</span>`;

      // 4. Stream corridor landmarks with place-and-time weather
      const listEl = document.getElementById('corridor-list');
      listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px;font-size:0.85rem;">⏳ Streaming roadside wonders & checking en-route weather...</div>';

      this.routeService.discoverCorridorWaypoints(3500, departureDate, this.unitSystem).then(corridorPois => {
        statusEl.innerHTML = `<span>Found <strong>${corridorPois.length}</strong> roadside highlights along your journey:</span>`;
        this.rawCorridorPois = corridorPois;
        this.selectedWaypoints = [];

        const hintBanner = document.getElementById('corridor-hint-banner');
        if (hintBanner) hintBanner.style.display = 'block';

        // Update category count pills
        const counts = { all: corridorPois.length, nature: 0, history: 0, food: 0, gems: 0 };
        corridorPois.forEach(p => {
          const k = p.categoryKey || 'gems';
          if (counts[k] !== undefined) counts[k]++;
        });

        const setPillCount = (id, count) => {
          const el = document.getElementById(id);
          if (el) el.textContent = count;
        };
        setPillCount('cat-count-all', counts.all);
        setPillCount('cat-count-nature', counts.nature);
        setPillCount('cat-count-history', counts.history);
        setPillCount('cat-count-food', counts.food);
        setPillCount('cat-count-gems', counts.gems);

        const catBar = document.getElementById('corridor-category-bar');
        if (catBar) catBar.style.display = 'block';

        this.renderCorridorList();
      }).catch(err => {
        console.warn('Corridor discovery notice:', err);
        listEl.innerHTML = '<div style="color:var(--text-muted);padding:10px;">Ready for departure.</div>';
      });
    } catch (err) {
      console.error('Route scan error:', err);
      statusEl.innerHTML = '<span style="color:#f85149;">Unable to calculate route. Try again.</span>';
    }
  }

  getFilteredCorridorPois() {
    if (!this.rawCorridorPois) return [];
    if (this.activeCorridorCategory === 'all') return this.rawCorridorPois;
    return this.rawCorridorPois.filter(p => (p.categoryKey || this.routeService.classifyCategory(p).key) === this.activeCorridorCategory);
  }

  renderCorridorList() {
    const listEl = document.getElementById('corridor-list');
    if (!listEl) return;

    const filtered = this.getFilteredCorridorPois();
    listEl.innerHTML = '';

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);padding:14px;text-align:center;font-size:0.85rem;">No roadside highlights in the <strong>${this.activeCorridorCategory}</strong> category along this corridor.</div>`;
      return;
    }

    filtered.forEach((poi) => {
      const item = document.createElement('div');
      item.className = 'corridor-item';
      item.id = `corridor-item-${poi.id}`;

      const isChecked = this.selectedWaypoints.some(w => w.id === poi.id);
      if (isChecked) item.classList.add('selected');

      const detourBadge = `+${poi.detourMinutes}m detour`;
      const distFromHwy = `${this.formatDistance(poi.distanceFromRouteMeters)} off route`;
      const etaTime = poi.weather?.arrivalTimeFormatted ? `@ ${poi.weather.arrivalTimeFormatted}` : `+${poi.etaMinutes}m ETA`;

      const detourBadgeHtml = poi.detourType
        ? `<span class="badge-detour-type ${poi.detourType.cssClass}">${poi.detourType.label}</span>`
        : `<span class="badge-detour-type badge-drive-by">+${poi.detourMinutes}m detour</span>`;

      const sunsetBadgeHtml = poi.sunsetMatch
        ? `<span class="badge-sunset-match" title="Golden Hour / Sunset alignment">${poi.sunsetMatch.label}</span>`
        : '';

      const weatherBadge = poi.weather ? `
        <span class="corridor-weather-chip ${poi.weather.isAdverse ? 'adverse' : ''}" title="${poi.weather.suitabilityNote || ''}" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; background: ${poi.weather.isAdverse ? 'rgba(248,81,73,0.15)' : 'rgba(88,166,255,0.12)'}; color: ${poi.weather.isAdverse ? '#f85149' : '#79c0ff'}; border: 1px solid ${poi.weather.isAdverse ? 'rgba(248,81,73,0.4)' : 'rgba(88,166,255,0.3)'};">
          <span>${poi.weather.icon}</span>
          <span>${poi.weather.tempDisplay}</span>
          <span style="opacity: 0.8;">&bull; ${poi.weather.condition}</span>
          <span style="font-weight: 600; opacity: 0.95;">(${etaTime})</span>
        </span>
      ` : `<span style="font-size: 0.72rem; color: var(--text-muted);">⏳ +${poi.etaMinutes}m ETA</span>`;

      item.innerHTML = `
        <input type="checkbox" id="check-${poi.id}" data-id="${poi.id}" ${isChecked ? 'checked' : ''}>
        ${poi.thumbnail ? `<img src="${poi.thumbnail}" class="corridor-thumb" alt="${poi.title}">` : '<div class="corridor-thumb" style="background:#21262d;display:flex;align-items:center;justify-content:center;font-size:20px;">🧭</div>'}
        <div class="corridor-details" style="display: flex; flex-direction: column; gap: 3px; flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div class="corridor-title" style="font-weight: 600; font-size: 0.86rem; color: var(--text-main);">${poi.title}</div>
            <span class="corridor-cat-badge ${poi.categoryKey || 'gems'}">${poi.categoryIcon || '🧭'} ${poi.categoryLabel || 'Travel Gem'}</span>
          </div>
          <div class="corridor-meta" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.72rem; margin-top: 2px;">
            ${detourBadgeHtml}
            ${sunsetBadgeHtml}
            <span>&bull;</span>
            <span>${distFromHwy}</span>
            <span>&bull;</span>
            ${weatherBadge}
          </div>
        </div>
      `;

      const chk = item.querySelector('input[type="checkbox"]');
      chk.addEventListener('change', () => {
        if (chk.checked) {
          item.classList.add('selected');
          if (!this.selectedWaypoints.some(w => w.id === poi.id)) {
            this.selectedWaypoints.push(poi);
          }
        } else {
          item.classList.remove('selected');
          this.selectedWaypoints = this.selectedWaypoints.filter(w => w.id !== poi.id);
        }
        if (this.routeService.currentRoute) {
          this.updateRouteSummary(this.routeService.currentRoute);
        }
      });

      listEl.appendChild(item);
    });
  }

  async handleOfflinePreCache() {
    if (!this.routeService.currentRoute) return;
    const btn = document.getElementById('cache-route-offline-btn');
    btn.disabled = true;

    const res = await this.routeService.preCacheCorridor(
      this.routeService.currentRoute,
      (curr, total) => {
        btn.textContent = `⏳ ${Math.round((curr/total)*100)}%`;
      }
    );

    if (res.success) {
      btn.textContent = `✓ Cached (${res.count} POIs)`;
      btn.style.background = '#3fb950';
    } else {
      btn.textContent = 'Retry Cache';
      btn.disabled = false;
    }
  }

  exportRouteGpx() {
    if (!this.routeService.currentRoute) return;
    const r = this.routeService.currentRoute;
    const gpxContent = this.routeService.exportToGpx(r.start, r.end, this.selectedWaypoints, r.latLngs);
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scenic_route_${r.start.name}_to_${r.end.name}.gpx`.replace(/\s+/g, '_');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  highlightCard(poiId, isSpeaking) {
    document.querySelectorAll('.poi-card').forEach(c => c.classList.remove('speaking'));
    if (poiId && isSpeaking) {
      const activeCard = document.getElementById(`card-${poiId}`);
      if (activeCard) {
        activeCard.classList.add('speaking');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  showToast(msg, durationMs = 3200) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'flex';
    toast.offsetHeight; // Force reflow for smooth transition
    toast.classList.add('active');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('active');
      setTimeout(() => {
        if (!toast.classList.contains('active')) {
          toast.style.display = 'none';
        }
      }, 260);
    }, durationMs);
  }

  async checkSharedUrlParams() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const origin = params.get('origin');
      const dest = params.get('dest');
      const stopsStr = params.get('stops');
      const depOffset = params.get('dep');

      if (origin && dest) {
        const originInput = document.getElementById('route-origin-input');
        const destInput = document.getElementById('route-dest-input');
        const routeModal = document.getElementById('route-modal');

        if (originInput) originInput.value = origin;
        if (destInput) destInput.value = dest;

        const olat = parseFloat(params.get('olat'));
        const olng = parseFloat(params.get('olng'));
        if (!isNaN(olat) && !isNaN(olng)) {
          this.selectedOrigin = { name: origin, lat: olat, lng: olng };
        }

        const dlat = parseFloat(params.get('dlat'));
        const dlng = parseFloat(params.get('dlng'));
        if (!isNaN(dlat) && !isNaN(dlng)) {
          this.selectedDest = { name: dest, lat: dlat, lng: dlng };
        }

        if (depOffset) {
          const depSel = document.getElementById('route-departure-select');
          if (depSel) depSel.value = depOffset;
        }

        if (routeModal) routeModal.classList.add('active');

        await this.handleRouteScan();

        if (stopsStr && this.rawCorridorPois) {
          const targetIds = new Set(stopsStr.split(','));
          this.selectedWaypoints = this.rawCorridorPois.filter(p => targetIds.has(p.id));
          this.renderCorridorList();
          if (this.routeService.currentRoute) {
            this.updateRouteSummary(this.routeService.currentRoute);
          }
          this.showToast(`✓ Loaded shared road trip (${this.selectedWaypoints.length} stops included)!`);
        } else {
          this.showToast('✓ Loaded shared road trip!');
        }
      }
    } catch (e) {
      console.warn('Note on loading shared trip parameters:', e);
    }
  }
}

function launchApp() {
  if (window.app) return;
  try {
    window.app = new WanderingLayerApp();
    console.log('🧭 Wanderlust App initialized successfully!');
  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', launchApp);
} else {
  launchApp();
}
