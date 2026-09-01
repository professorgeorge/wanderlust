/**
 * Wikipedia & Wikivoyage Service
 * Queries nearby geocoded articles and travel guide footnotes
 * using high-performance single-roundtrip batch MediaWiki generator queries.
 * 100% Free, no API key required, CORS-friendly (origin=*).
 */
export class WikiService {
  constructor(storageService = null, initialLang = 'en') {
    this.storage = storageService;
    this.lang = initialLang;
    this.cache = new Map(); // Cache summaries by key
    this.geoCache = new Map(); // Spatial cache for geosearch
    this.narratedPages = new Set(); // Prevent re-narrating the same landmark
  }

  setLanguage(langCode) {
    this.lang = langCode || 'en';
    this.cache.clear();
    this.geoCache.clear();
  }

  getHeaders() {
    if (typeof window !== 'undefined') {
      return {};
    }
    return {
      'Api-User-Agent': 'WanderlustRoadTripApp/3.0 (https://wanderlust.app; contact@wanderlust.app)',
      'User-Agent': 'WanderlustRoadTripApp/3.0 (https://wanderlust.app; contact@wanderlust.app)'
    };
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

  /**
   * Search for Wikipedia and Wikivoyage articles near a coordinate
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radiusMeters - Search radius in meters (max 10000)
   * @param {number} limit - Maximum number of results (default: 8)
   * @param {boolean} filterNarrated - Whether to omit already narrated pages (false for route planning)
   * @returns {Promise<Array>} Array of POI objects
   */
  async findNearby(lat, lng, radiusMeters = 3000, limit = 8, filterNarrated = false) {
    const clampedRadius = Math.min(Math.max(radiusMeters, 500), 10000);
    const gridKey = `${this.lang}_${lat.toFixed(2)}_${lng.toFixed(2)}_${Math.round(clampedRadius / 1000)}`;

    if (this.geoCache.has(gridKey)) {
      const cached = this.geoCache.get(gridKey);
      if (filterNarrated) {
        return cached.filter(item => !this.isNarrated(item.id));
      }
      return cached;
    }

    const wikiPois = await this.fetchWikipediaGeo(lat, lng, clampedRadius, limit, filterNarrated);

    let combined = [...wikiPois];
    // Only query Wikivoyage if Wikipedia returned few results to minimize API load
    if (combined.length < 3) {
      const voyagePois = await this.fetchWikivoyageGeo(lat, lng, clampedRadius, 3, filterNarrated);
      combined.push(...voyagePois);
    }

    // Deduplicate by title similarity
    const unique = [];
    const seenTitles = new Set();

    combined.forEach(item => {
      if (!item || !item.title) return;
      const cleanTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seenTitles.has(cleanTitle)) {
        seenTitles.add(cleanTitle);
        unique.push(item);
      }
    });

    unique.sort((a, b) => (a.dist || 0) - (b.dist || 0));
    this.geoCache.set(gridKey, unique);
    return unique;
  }

  /**
   * Fast single-shot geosearch without page summary overhead
   * Used for high-speed corridor evaluation & scenic scoring
   */
  async quickGeoQuery(lat, lng, radius = 5000, limit = 5) {
    try {
      const url = `https://${this.lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`;
      const res = await fetch(url, { headers: this.getHeaders() });
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

  /**
   * Single-roundtrip batch geosearch with extracts, descriptions & thumbnails in 1 request
   */
  async fetchWikipediaGeo(lat, lng, radius, limit, filterNarrated = false) {
    const url = `https://${this.lang}.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lng}&ggsradius=${radius}&ggslimit=${limit}&prop=coordinates|pageimages|extracts|description&exintro=1&explaintext=1&exchars=300&piprop=thumbnail&pithumbsize=300&format=json&origin=*`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { headers: this.getHeaders() });
        if (res.status === 429) {
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 250));
            continue;
          }
          return [];
        }
        if (!res.ok) return [];
        const data = await res.json();
        const pages = data?.query?.pages;
        if (!pages) return [];

        const results = [];
        for (const page of Object.values(pages)) {
          if (!page || !page.pageid || !page.title) continue;
          if (filterNarrated && (this.isNarrated(page.pageid) || this.isNarrated(`wiki-${page.pageid}`))) {
            continue;
          }

          const coords = page.coordinates && page.coordinates[0] ? page.coordinates[0] : null;
          const pageLat = coords ? coords.lat : lat;
          const pageLng = coords ? coords.lon : lng;
          const dist = this.calculateDistance(lat, lng, pageLat, pageLng);

          results.push({
            id: `wiki-${page.pageid}`,
            source: 'wikipedia',
            title: page.title,
            lat: pageLat,
            lng: pageLng,
            dist: Math.round(dist),
            extract: page.extract || page.description || 'A notable roadside discovery.',
            shortDescription: page.description || 'Historic or cultural landmark',
            thumbnail: page.thumbnail?.source || null,
            pageUrl: `https://${this.lang}.wikipedia.org/?curid=${page.pageid}`
          });
        }

        return results;
      } catch (err) {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }
    return [];
  }

  async fetchWikivoyageGeo(lat, lng, radius, limit, filterNarrated = false) {
    const url = `https://${this.lang}.wikivoyage.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lng}&ggsradius=${radius}&ggslimit=${limit}&prop=coordinates|pageimages|extracts|description&exintro=1&explaintext=1&exchars=300&piprop=thumbnail&pithumbsize=300&format=json&origin=*`;

    try {
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return [];

      const results = [];
      for (const page of Object.values(pages)) {
        if (!page || !page.pageid || !page.title) continue;
        if (filterNarrated && (this.isNarrated(page.pageid) || this.isNarrated(`voyage-${page.pageid}`))) {
          continue;
        }

        const coords = page.coordinates && page.coordinates[0] ? page.coordinates[0] : null;
        const pageLat = coords ? coords.lat : lat;
        const pageLng = coords ? coords.lon : lng;
        const dist = this.calculateDistance(lat, lng, pageLat, pageLng);

        results.push({
          id: `voyage-${page.pageid}`,
          source: 'wikivoyage',
          title: page.title,
          lat: pageLat,
          lng: pageLng,
          dist: Math.round(dist),
          extract: page.extract || page.description || 'Travel guide spotlight.',
          shortDescription: page.description || 'Travel guide recommendation',
          thumbnail: page.thumbnail?.source || null,
          pageUrl: `https://${this.lang}.wikivoyage.org/?curid=${page.pageid}`
        });
      }

      return results;
    } catch (err) {
      return [];
    }
  }

  /**
   * Fetch page summary via MediaWiki REST API (with local memory cache)
   */
  async getPageSummary(title) {
    if (!title) return null;
    if (this.cache.has(title)) {
      return this.cache.get(title);
    }

    try {
      const url = `https://${this.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const summary = {
        extract: data.extract,
        description: data.description,
        thumbnail: data.thumbnail
      };
      this.cache.set(title, summary);
      return summary;
    } catch (e) {
      return null;
    }
  }

  async getWikivoyageSummary(title) {
    if (!title) return null;
    const cacheKey = `voyage_${title}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const url = `https://${this.lang}.wikivoyage.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const summary = {
        extract: data.extract,
        description: data.description,
        thumbnail: data.thumbnail
      };
      this.cache.set(cacheKey, summary);
      return summary;
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
