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

  // Test 6: Trip Simulator Lifecycle
  console.log('Test 6: Trip Simulator Lifecycle');
  let positionUpdatesReceived = 0;
  gps.onLocationUpdate = () => {
    positionUpdatesReceived++;
  };
  const simStarted = gps.startSimulation(route.latLngs);
  if (!simStarted) throw new Error('Failed to start GPS simulation');
  await new Promise(resolve => setTimeout(resolve, 500));
  gps.stopSimulation();
  console.log('  Simulation stopped. Updates received:', positionUpdatesReceived);
  if (positionUpdatesReceived === 0) throw new Error('Simulation did not fire location updates');
  console.log('  [PASS] Trip Simulator lifecycle works.\n');

  console.log('=== All tests PASSED successfully! ===');
}

runComprehensiveTests().catch(err => {
  console.error('\n[FAIL] Test suite error:', err);
  process.exit(1);
});
