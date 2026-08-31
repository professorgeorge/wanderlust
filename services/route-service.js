/**
 * Route & Corridor Service
 * Powered by Open Source Routing Machine (OSRM) and Photon by Komoot.
 * Features Topological Waypoint Sequencing for natural Google Maps routing
 * and Corridor Pre-Caching for offline mountain road trips.
 * 100% Free, zero API keys.
 */
export class RouteService {
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
   * Queries Wikipedia, OSM (markets, viewpoints, farm stands), and computes point-in-time forecasts
   */
  async discoverCorridorWaypoints(corridorRadiusMeters = 3500, departureDate = new Date(), unitSystem = 'imperial') {
    if (!this.currentRoute || !this.currentRoute.latLngs) return [];

    const latLngs = this.currentRoute.latLngs;
    if (latLngs.length < 2) return [];

    // Distribute scan anchors evenly across the route
    const sampleCount = Math.min(4, Math.max(2, Math.round(latLngs.length / 100)));
    const sampledPoints = [];
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.floor((i / (sampleCount - 1 || 1)) * (latLngs.length - 1));
      sampledPoints.push(latLngs[idx]);
    }

    const allDiscovered = new Map();

    const fetchPromises = sampledPoints.map(async (pt) => {
      const [wikiRes, osmRes] = await Promise.allSettled([
        this.wiki ? this.wiki.findNearby(pt[0], pt[1], corridorRadiusMeters, 3) : Promise.resolve([]),
        this.osm ? this.osm.findNearby(pt[0], pt[1], corridorRadiusMeters) : Promise.resolve([])
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

          const roundTripDetourKm = (minDistance * 1.35 * 2) / 1000;
          const detourDriveMinutes = Math.round((roundTripDetourKm / 35) * 60);
          const dwellMinutes = minDistance > 2000 ? 10 : 5;

          const routeDist = this.currentRoute.distanceMeters || 1;
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

          allDiscovered.set(poi.id, poi);
        }
      });
    });

    const sortedList = Array.from(allDiscovered.values());
    sortedList.sort((a, b) => a.projectionDistanceMeters - b.projectionDistanceMeters);

    // Weather Enrichment at Specific Place & Specific Arrival Time (ETA)
    if (this.weather && sortedList.length > 0) {
      const weatherPromises = sortedList.map(async (poi) => {
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

    return sortedList;
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
