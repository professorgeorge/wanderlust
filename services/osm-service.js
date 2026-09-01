/**
 * OpenStreetMap (Overpass API) Service
 * Queries natural viewpoints, waterfalls, peaks, caves, farm stands, bakeries, and historical ruins.
 * Features automated mirror failover and grid caching.
 * 100% Free public open data.
 */
export class OsmService {
  constructor() {
    this.narratedNodes = new Set();
    this.cache = new Map();
    this.overpassMirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://overpass.osm.ch/api/interpreter'
    ];
    this.currentMirrorIndex = 0;
    this.lastQueryTime = 0;
  }

  /**
   * Search for viewpoints, waterfalls, caves, farm stands, and heritage spots within radius
   */
  async findNearby(lat, lng, radiusMeters = 3000, filterNarrated = false) {
    // Spatial grid cache key (~5km grid cell)
    const gridKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${Math.round(radiusMeters / 1000)}`;
    if (this.cache.has(gridKey)) {
      const cached = this.cache.get(gridKey);
      if (filterNarrated) {
        return cached.filter(el => !this.isNarrated(el.id));
      }
      return cached;
    }

    const now = Date.now();
    if (now - this.lastQueryTime < 400) {
      await new Promise(r => setTimeout(r, 200));
    }
    this.lastQueryTime = Date.now();

    const radius = Math.min(Math.max(radiusMeters, 500), 5000);
    const query = `
      [out:json][timeout:6];
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
    for (let attempt = 0; attempt < Math.min(this.overpassMirrors.length, 3); attempt++) {
      const mirrorUrl = this.overpassMirrors[(this.currentMirrorIndex + attempt) % this.overpassMirrors.length];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(mirrorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'WanderlustRoadTripApp/3.0 (OpenStreetMap Roadside Explorer)'
          },
          body: 'data=' + encodeURIComponent(query),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Mirror returned ${res.status}`);
        }

        const data = await res.json();
        if (!data?.elements) return [];

        this.currentMirrorIndex = (this.currentMirrorIndex + attempt) % this.overpassMirrors.length;

        const results = [];
        for (const el of data.elements) {
          if (!el.tags) continue;
          if (filterNarrated && (this.isNarrated(el.id) || this.isNarrated(`osm-${el.id}`))) continue;

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
        this.cache.set(gridKey, results);
        return results;
      } catch (err) {
        // Fallback to next mirror quietly
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
