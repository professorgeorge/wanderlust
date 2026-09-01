import { RouteService } from './services/route-service.js';
import { WikiService } from './services/wiki-service.js';
import { OsmService } from './services/osm-service.js';
import { WeatherService } from './services/weather-service.js';
import { StorageService } from './services/storage-service.js';

async function run() {
  console.log('Testing corridor discovery with different routes...');

  const storage = new StorageService();
  const wiki = new WikiService(storage, 'en');
  const osm = new OsmService();
  const weather = new WeatherService();
  const routeService = new RouteService(wiki, osm, storage, weather);

  // Let's test route from San Francisco to San Jose
  console.log('\n--- Geocoding SF to SJ ---');
  const origin = await routeService.geocode('San Francisco');
  const dest = await routeService.geocode('San Jose');
  console.log('Origin:', origin);
  console.log('Dest:', dest);

  const route = await routeService.calculateRoute(origin, dest);
  console.log('Route calculated:', route ? {
    distanceMeters: route.distanceMeters,
    durationMinutes: route.durationMinutes,
    points: route.latLngs?.length
  } : 'NULL');

  console.log('\n--- Calling discoverCorridorWaypoints ---');
  const pois = await routeService.discoverCorridorWaypoints(3500, new Date(), 'imperial');
  console.log('Discovered POIs count:', pois.length);
  if (pois.length > 0) {
    console.log('Sample POI 1:', pois[0]);
    console.log('Sample POI 2:', pois[1]);
  } else {
    console.log('NO POIS RETURNED!');
  }
}

run().catch(console.error);
