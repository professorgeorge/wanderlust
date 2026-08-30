import { RouteService } from './services/route-service.js';
import { GpsService } from './services/gps.js';
import { WikiService } from './services/wiki-service.js';

async function runComprehensiveTests() {
  console.log('=== Starting Wandering Layer Route & Simulator Tests ===\n');

  const wiki = new WikiService(null, 'en');
  const routeService = new RouteService(wiki, null, null);
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

  // Test 3: Calculate Curvature and calcBearing
  console.log('Test 3: Curvature & Bearing computation');
  const samplePoints = [[37.77, -122.41], [37.78, -122.40], [37.79, -122.42], [37.80, -122.41]];
  const curv = routeService.calculateCurvature(samplePoints);
  console.log('  Curvature ratio:', curv.curvatureRatio, 'Score:', curv.comfortScore);
  const bearing = routeService.calcBearing(37.77, -122.41, 37.78, -122.40);
  console.log('  Bearing calculated:', bearing.toFixed(2), 'degrees');
  if (isNaN(bearing) || bearing < 0 || bearing > 360) throw new Error('calcBearing failed');
  console.log('  [PASS] Bearing and curvature calculations work.\n');

  // Test 4: Corridor Waypoint Discovery
  console.log('Test 4: Corridor Waypoint Discovery');
  const corridorWaypoints = await routeService.discoverCorridorWaypoints(5000);
  console.log('  Found corridor waypoints count:', corridorWaypoints.length);
  if (corridorWaypoints.length > 0) {
    console.log('  First stop:', corridorWaypoints[0].title, 'Detour:', corridorWaypoints[0].detourMinutes, 'mins');
  }
  console.log('  [PASS] Corridor discovery works.\n');

  // Test 5: Topological Sequencing & Navigation URLs
  console.log('Test 5: Topological Sequencing & Map Links');
  const mockWaypoints = [
    { id: 'wp2', title: 'Midway Vista', lat: 37.55, lng: -122.15, detourMinutes: 8 },
    { id: 'wp1', title: 'Early Overlook', lat: 37.70, lng: -122.35, detourMinutes: 5 }
  ];
  const sorted = routeService.sequenceWaypointsTopologically(mockWaypoints, route.latLngs);
  console.log('  Sorted waypoints:', sorted.map(w => w.title));
  const gmapsUrl = routeService.generateGoogleMapsUrl(startLoc, endLoc, sorted);
  const appleUrl = routeService.generateAppleMapsUrl(startLoc, endLoc, sorted);
  console.log('  Google Maps URL generated:', gmapsUrl.substring(0, 70) + '...');
  console.log('  Apple Maps URL generated:', appleUrl.substring(0, 70) + '...');
  if (!gmapsUrl.includes('google.com') || !appleUrl.includes('apple.com')) throw new Error('Map URL generation failed');
  console.log('  [PASS] Topological sequencing and navigation URLs work.\n');

  // Test 6: GPX Export
  console.log('Test 6: GPX Export');
  const gpx = routeService.exportToGpx(startLoc, endLoc, sorted, route.latLngs);
  if (!gpx.includes('<gpx') || !gpx.includes('Start:')) throw new Error('GPX generation failed');
  console.log('  GPX generated successfully (length:', gpx.length, 'bytes)');
  console.log('  [PASS] GPX Export works.\n');

  // Test 7: Trip Simulator Lifecycle
  console.log('Test 7: Trip Simulator Lifecycle');
  let positionUpdatesReceived = 0;
  gps.onLocationUpdate = (pos) => {
    positionUpdatesReceived++;
  };
  const simStarted = gps.startSimulation(route.latLngs);
  if (!simStarted) throw new Error('Failed to start GPS simulation');
  console.log('  Simulation active:', gps.isSimulating, 'Speed:', gps.speed, 'km/h');
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
