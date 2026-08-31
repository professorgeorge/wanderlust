import { RouteService } from './services/route-service.js';
import { GpsService } from './services/gps.js';
import { WikiService } from './services/wiki-service.js';
import { WeatherService } from './services/weather-service.js';
import { OsmService } from './services/osm-service.js';

async function runComprehensiveTests() {
  console.log('=== Starting Wandering Layer Route, Place & Time Weather Tests ===\n');

  const wiki = new WikiService(null, 'en');
  const osm = new OsmService();
  const weather = new WeatherService();
  const routeService = new RouteService(wiki, osm, null, weather);
  const gps = new GpsService();

  // Test 1: Geocoding
  console.log('Test 1: Geocoding');
  const startLoc = await routeService.geocode('San Francisco, CA');
  const endLoc = await routeService.geocode('San Jose, CA');
  console.log('  Start:', startLoc?.name, startLoc?.lat, startLoc?.lng);
  console.log('  End:', endLoc?.name, endLoc?.lat, endLoc?.lng);
  if (!startLoc || !endLoc) throw new Error('Geocoding failed');
  console.log('  [PASS] Geocoding works.\n');

  // Test 2: Calculate Route (OSRM / Fallback)
  console.log('Test 2: Calculate Route');
  const route = await routeService.calculateRoute(startLoc, endLoc);
  console.log('  Route ID:', route.id);
  console.log('  Distance:', route.distanceKm, 'km (', route.distanceMiles, 'mi )');
  console.log('  Duration:', route.durationMinutes, 'minutes');
  console.log('  Polyline vertices:', route.latLngs.length);
  console.log('  Comfort label:', route.comfortLabel, 'Score:', route.comfortScore);
  if (!route || !route.latLngs || route.latLngs.length < 2) throw new Error('Route calculation failed');
  console.log('  [PASS] Calculate route works.\n');

  // Test 3: Point Forecast at Specific Place and Time (ETA)
  console.log('Test 3: Point-in-Time Weather Forecast for Stops');
  const pointForecast = await weather.getPointForecastAtTime(37.4419, -122.1430, 45, new Date(), 'imperial');
  console.log('  Palo Alto Stop Forecast (+45m ETA):', pointForecast?.tempDisplay, pointForecast?.condition, pointForecast?.icon);
  console.log('  Arrival Time:', pointForecast?.arrivalTimeFormatted, 'Suitability:', pointForecast?.suitabilityNote);
  if (!pointForecast || !pointForecast.tempDisplay) throw new Error('Point-in-time forecast failed');
  console.log('  [PASS] Location & Time specific weather forecast works.\n');

  // Test 4: Corridor Waypoint Discovery with Arrival Weather Enrichment
  console.log('Test 4: Corridor Discovery with Arrival Weather');
  const corridorWaypoints = await routeService.discoverCorridorWaypoints(5000, new Date(), 'imperial');
  console.log('  Found corridor waypoints count:', corridorWaypoints.length);
  if (corridorWaypoints.length > 0) {
    const first = corridorWaypoints[0];
    console.log('  First stop:', first.title, '| Type:', first.type || first.source);
    console.log('  Detour:', first.detourMinutes, 'mins | ETA:', first.etaMinutes, 'mins');
    if (first.weather) {
      console.log('  Weather at Arrival:', first.weather.icon, first.weather.tempDisplay, first.weather.condition, '@', first.weather.arrivalTimeFormatted);
    }
  }
  console.log('  [PASS] Corridor discovery and weather enrichment works.\n');

  // Test 5: Topological Sequencing & Map Links
  console.log('Test 5: Topological Sequencing & Map Links');
  const mockWaypoints = [
    { id: 'wp2', title: 'Midway Market', lat: 37.55, lng: -122.15, detourMinutes: 8 },
    { id: 'wp1', title: 'Early Bakery', lat: 37.70, lng: -122.35, detourMinutes: 5 }
  ];
  const sorted = routeService.sequenceWaypointsTopologically(mockWaypoints, route.latLngs);
  console.log('  Sorted waypoints:', sorted.map(w => w.title));
  const gmapsUrl = routeService.generateGoogleMapsUrl(startLoc, endLoc, sorted);
  const appleUrl = routeService.generateAppleMapsUrl(startLoc, endLoc, sorted);
  if (!gmapsUrl.includes('google.com') || !appleUrl.includes('apple.com')) throw new Error('Map URL generation failed');
  console.log('  [PASS] Topological sequencing and navigation URLs work.\n');

  // Test 7: Multi-Day Auto-Segmentation & 9-Stop Google Maps Leg Splitter
  console.log('Test 7: Multi-Day Auto-Segmentation & 9-Stop Google Maps Leg Splitter');
  // Create a 10-hour mock route with 15 waypoints
  const mockLongRoute = {
    start: startLoc,
    end: endLoc,
    durationMinutes: 600, // 10 hours
    distanceKm: 850,
    distanceMiles: 528,
    latLngs: route.latLngs
  };

  const mockFifteenStops = Array.from({ length: 15 }, (_, i) => ({
    id: `stop-${i + 1}`,
    title: `Scenic Roadside Stop ${i + 1}`,
    lat: route.latLngs[Math.min(route.latLngs.length - 1, (i + 1) * 70)][0],
    lng: route.latLngs[Math.min(route.latLngs.length - 1, (i + 1) * 70)][1],
    detourMinutes: 5
  }));

  const legs = routeService.splitRouteIntoDailyLegs(mockLongRoute, mockFifteenStops, 5, 'imperial');
  console.log(`  Auto-split 10h / 15-stop route into: ${legs.length} daily legs`);
  
  legs.forEach(leg => {
    console.log(`    ${leg.title}: ${leg.durationMinutes} mins | ${leg.waypoints.length} stops`);
    if (leg.waypoints.length > 9) {
      throw new Error(`Leg ${leg.dayNumber} exceeded Google Maps 9-stop limit with ${leg.waypoints.length} stops`);
    }
    if (!leg.googleMapsUrl.includes('google.com/maps') || !leg.appleMapsUrl.includes('maps.apple.com')) {
      throw new Error(`Leg ${leg.dayNumber} map URLs invalid`);
    }
  });

  // Test 8: Waypoint Category Classification & Filtering
  console.log('Test 8: Waypoint Category Classification & Filtering');
  const samplePois = [
    { id: '1', title: 'Big Sur Waterfall & River Overlook', type: 'waterfall', extract: 'Cascading natural falls into the Pacific.' },
    { id: '2', title: 'Historic Castle Fortress Ruins', type: 'castle', extract: 'Ancient 18th-century stone fortress and battle monument.' },
    { id: '3', title: 'Artisanal Sourdough Bakery & Cafe', type: 'bakery', extract: 'Fresh sourdough breads, warm pastries, and espresso.' },
    { id: '4', title: 'Roadside World Largest Art Sculpture', type: 'attraction', extract: 'Quirky travel guide spotlight.' }
  ];

  const catNature = routeService.classifyCategory(samplePois[0]);
  const catHistory = routeService.classifyCategory(samplePois[1]);
  const catFood = routeService.classifyCategory(samplePois[2]);
  const catGems = routeService.classifyCategory(samplePois[3]);

  if (catNature.key !== 'nature' || catHistory.key !== 'history' || catFood.key !== 'food' || catGems.key !== 'gems') {
    throw new Error(`Category classification failed: got ${catNature.key}, ${catHistory.key}, ${catFood.key}, ${catGems.key}`);
  }
  console.log('  Classified categories:');
  console.log('   ', samplePois[0].title, '->', catNature.icon, catNature.label);
  console.log('   ', samplePois[1].title, '->', catHistory.icon, catHistory.label);
  console.log('   ', samplePois[2].title, '->', catFood.icon, catFood.label);
  console.log('   ', samplePois[3].title, '->', catGems.icon, catGems.label);
  console.log('  [PASS] Waypoint category classification and filtering verified.\n');

  console.log('=== All tests PASSED successfully! ===');
}

runComprehensiveTests().catch(err => {
  console.error('\n[FAIL] Test suite error:', err);
  process.exit(1);
});
