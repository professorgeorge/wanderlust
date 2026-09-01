import { RouteService } from './services/route-service.js';
import { WikiService } from './services/wiki-service.js';
import { OsmService } from './services/osm-service.js';
import { WeatherService } from './services/weather-service.js';

async function run() {
  const wiki = new WikiService();
  const osm = new OsmService();
  const weather = new WeatherService();
  const routeService = new RouteService(wiki, osm, null, weather);

  console.log('Testing Geocode + Calculate Route + Corridor Discovery Speed...');
  const start = Date.now();

  const startLoc = await routeService.geocode('San Francisco');
  const endLoc = await routeService.geocode('San Jose');
  const route = await routeService.calculateRoute(startLoc, endLoc);
  routeService.currentRoute = route;

  console.log(`Route calculated in ${Date.now() - start}ms (dist: ${route.distanceMiles} mi, ${route.latLngs.length} pts)`);

  const t1 = Date.now();
  const pois = await routeService.discoverCorridorWaypoints(5000, new Date(), 'imperial');
  const duration = Date.now() - t1;

  console.log(`Corridor discovery took: ${duration}ms, found ${pois.length} waypoints!`);
  if (pois.length > 0) {
    console.log('Sample 1:', pois[0].title, `(${pois[0].categoryLabel}, +${pois[0].detourMinutes}m detour)`);
    console.log('Sample 5:', pois[Math.min(4, pois.length - 1)].title);
  }
}

run().catch(console.error);
