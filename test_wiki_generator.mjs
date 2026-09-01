const lat = 37.7749;
const lng = -122.4194;
const radius = 5000;
const limit = 8;
const lang = 'en';

const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}%7C${lng}&ggsradius=${radius}&ggslimit=${limit}&prop=coordinates|pageimages|extracts|description&exintro=1&explaintext=1&exchars=300&piprop=thumbnail&pithumbsize=300&format=json&origin=*`;

const headers = {
  'User-Agent': 'WanderlustRoadTripApp/3.0 (https://wanderlust.app; contact@wanderlust.app)',
  'Api-User-Agent': 'WanderlustRoadTripApp/3.0 (https://wanderlust.app; contact@wanderlust.app)'
};

fetch(url, { headers })
  .then(r => r.json())
  .then(data => {
    const pages = data?.query?.pages || {};
    const results = Object.values(pages).map(p => ({
      id: `wiki-${p.pageid}`,
      source: 'wikipedia',
      title: p.title,
      lat: p.coordinates ? p.coordinates[0].lat : lat,
      lng: p.coordinates ? p.coordinates[0].lon : lng,
      extract: p.extract || p.description || 'A notable roadside discovery.',
      shortDescription: p.description || 'Historic or cultural landmark',
      thumbnail: p.thumbnail?.source || null,
      pageUrl: `https://${lang}.wikipedia.org/?curid=${p.pageid}`
    }));
    console.log(`Successfully fetched ${results.length} POIs in ONE request:`);
    results.forEach(r => console.log(` - [${r.id}] ${r.title} (${r.lat}, ${r.lng}): ${r.shortDescription}`));
  })
  .catch(console.error);
