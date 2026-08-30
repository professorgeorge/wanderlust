/**
 * Wikipedia & Wikivoyage Service
 * Queries nearby geocoded articles and travel guide footnotes
 * using public MediaWiki GeoSearch & REST APIs.
 * 100% Free, no API key required, CORS-friendly (origin=*).
 */
export class WikiService {
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

      const candidateItems = data.query.geosearch.filter(item => !this.narratedPages.has(item.pageid));
      
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

      const candidateItems = data.query.geosearch.filter(item => !this.narratedPages.has(`voyage-${item.pageid}`));

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

  markAsNarrated(pageidOrId) {
    const rawId = String(pageidOrId).replace(/^(wiki|voyage)-/, '');
    this.narratedPages.add(Number(rawId) || rawId);
  }

  resetNarrated() {
    this.narratedPages.clear();
  }
}
