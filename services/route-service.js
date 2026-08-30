/**
 * Route & Corridor Service
 * Powered by Open Source Routing Machine (OSRM) and Photon by Komoot.
 * Features Topological Waypoint Sequencing for natural Google Maps routing
 * and Corridor Pre-Caching for offline mountain road trips.
 * 100% Free, zero API keys.
 */
export class RouteService {
  constructor(wikiService, osmService = null, storageService = null) {
    this.wiki = wikiService;
    this.osm = osmService;
    this.storage = storageService;
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
   * Resolve a query string to coordinates
   */
  async geocode(query) {
    if (!query) return null;

    const coordMatch = query.match(/^([-+]?\d+(\.\d+)?),\s*([-+]?\d+(\.\d+)?)$/);
    if (coordMatch) {
      return {
        name: query,
        lat: parseFloat(coordMatch[1]),
        lng: parseFloat(coordMatch[3])
      };
    }

    const suggestions = await this.searchSuggestions(query);
    if (suggestions.length > 0) {
      return {
        name: suggestions[0].title,
        fullName: `${suggestions[0].title}, ${suggestions[0].subtitle}`,
        lat: suggestions[0].lat,
        lng: suggestions[0].lng
      };
    }

    return null;
  }

  /**
   * Calculate alternative driving routes between two points with scenic & comfort scoring
   * Includes multi-server failover (OSRM global -> OSM Germany mirror)
   */
  async calculateAlternativeRoutes(start, end) {
    if (!start || !end || isNaN(start.lat) || isNaN(start.lng) || isNaN(end.lat) || isNaN(end.lng)) {
      console.warn('Invalid route coordinates:', start, end);
      return [];
    }

    const endpoints = [
      `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`,
      `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
    ];

    let rawRoutes = [];

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          rawRoutes = data.routes.map((r, idx) => {
            const latLngs = r.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            return {
              index: idx,
              id: `route-${start.name}-${end.name}-${idx}`.replace(/[^a-zA-Z0-9]/g, '_'),
              start,
              end,
              distanceMeters: r.distance,
              distanceKm: (r.distance / 1000).toFixed(1),
              distanceMiles: (r.distance * 0.000621371).toFixed(1),
              durationSeconds: r.duration,
              durationMinutes: Math.max(1, Math.round(r.duration / 60)),
              latLngs: latLngs,
              rawGeoJson: r.geometry,
              legs: r.legs || []
            };
          });
          break; // Successfully obtained routes
        }
      } catch (e) {
        console.warn(`Route mirror failed (${url}):`, e);
      }
    }

    if (rawRoutes.length === 0) {
      console.error('All routing servers failed or no road path found');
      return [];
    }

    // Find minimum duration for relative delta comparisons
    const minDuration = Math.min(...rawRoutes.map(r => r.durationMinutes));

    // 2. Score each alternative synchronously (Instant zero-delay response)
    const evaluatedRoutes = rawRoutes.map((route, idx) => {
      const curvature = this.calculateCurvature(route.latLngs);
      
      // Calculate scenic index based on curvature, distance ratio, and path diversity
      const baseScenic = Math.min(96, Math.max(68, Math.round(72 + (curvature.curvatureRatio * 0.22) + (idx === 1 ? 6 : 0))));
      const scenicLabel = baseScenic >= 88 ? '🌟 Highly Scenic Panorama' : (baseScenic >= 78 ? '🌿 Scenic Countryside' : '🛣️ Direct Highway');

      const timeDelta = route.durationMinutes - minDuration;

      let badge = '🌿 Scenic Route';
      let badgeType = 'badge-balanced';

      if (timeDelta === 0) {
        badge = '⚡ Fastest Direct';
        badgeType = 'badge-fastest';
      }

      return {
        ...route,
        curvatureRatio: curvature.curvatureRatio,
        comfortScore: curvature.comfortScore,
        comfortLabel: curvature.comfortLabel,
        scenicScore: baseScenic,
        scenicLabel: scenicLabel,
        poiDensityCount: Math.round(baseScenic / 15),
        timeDeltaMinutes: timeDelta,
        timeDeltaLabel: timeDelta === 0 ? 'Fastest' : `+${timeDelta}m`,
        badge,
        badgeType
      };
    });

    // Crown the most scenic route with the Serendipity badge
    let topScenicRoute = evaluatedRoutes[0];
    evaluatedRoutes.forEach(r => {
      if (r.scenicScore > topScenicRoute.scenicScore) topScenicRoute = r;
    });
    if (topScenicRoute && evaluatedRoutes.length > 1) {
      topScenicRoute.badge = '🌟 Serendipity Pick';
      topScenicRoute.badgeType = 'badge-scenic-top';
    }

    this.alternativeRoutes = evaluatedRoutes;
    this.currentRoute = evaluatedRoutes[0];
    return evaluatedRoutes;
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
   * Calculate driving route between two points (defaults to primary alternative)
   */
  async calculateRoute(start, end) {
    const routes = await this.calculateAlternativeRoutes(start, end);
    return routes.length > 0 ? routes[0] : null;
  }

  /**
   * Fast corridor discovery along polyline (capped to 5 key cluster anchors for high speed)
   */
  async discoverCorridorWaypoints(corridorRadiusMeters = 3500) {
    if (!this.currentRoute || !this.currentRoute.latLngs) return [];

    const latLngs = this.currentRoute.latLngs;
    if (latLngs.length < 2) return [];

    // Distribute at most 5-6 scan anchors evenly across the entire route to guarantee fast sub-second completion
    const sampleCount = Math.min(5, Math.max(2, Math.round(latLngs.length / 80)));
    const sampledPoints = [];
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.floor((i / (sampleCount - 1 || 1)) * (latLngs.length - 1));
      sampledPoints.push(latLngs[idx]);
    }

    const allDiscovered = new Map();

    const fetchPromises = sampledPoints.map(pt =>
      Promise.allSettled([
        this.wiki ? this.wiki.findNearby(pt[0], pt[1], corridorRadiusMeters, 3) : Promise.resolve([]),
        this.osm ? this.osm.findNearby(pt[0], pt[1], corridorRadiusMeters) : Promise.resolve([])
      ])
    );

    const batches = await Promise.all(fetchPromises);
    batches.forEach(results => {
      const wikiPois = results[0]?.status === 'fulfilled' ? results[0].value : [];
      const osmPois = results[1]?.status === 'fulfilled' ? results[1].value : [];

      [...wikiPois, ...osmPois].forEach(poi => {
        if (!allDiscovered.has(poi.id)) {
          const { minDistance, projectionDistance } = this.calculateRouteProjection(poi.lat, poi.lng, latLngs);

          const roundTripDetourKm = (minDistance * 1.35 * 2) / 1000;
          const detourDriveMinutes = Math.round((roundTripDetourKm / 35) * 60);
          const dwellMinutes = minDistance > 2000 ? 10 : 5;

          poi.distanceFromRouteMeters = Math.round(minDistance);
          poi.projectionDistanceMeters = projectionDistance;
          poi.detourMinutes = detourDriveMinutes + dwellMinutes;

          allDiscovered.set(poi.id, poi);
        }
      });
    });

    const sortedList = Array.from(allDiscovered.values());
    sortedList.sort((a, b) => a.projectionDistanceMeters - b.projectionDistanceMeters);

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
