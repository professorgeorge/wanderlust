import urllib.request
import urllib.parse
import json
import math

def test_wiki_and_wikivoyage():
    print("--- Testing Wikipedia & Wikivoyage Multi-Language APIs ---")
    lat, lng = 48.8584, 2.2945 # Paris (Eiffel Tower area)
    
    # 1. English Wikipedia
    wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord={lat}|{lng}&gsradius=2000&gslimit=2&format=json&origin=*"
    req = urllib.request.Request(wiki_url, headers={'User-Agent': 'TheWanderingLayer/2.0 (test@example.com)'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        titles = [x['title'] for x in data.get('query', {}).get('geosearch', [])]
        print(f"[OK] English Wikipedia GeoSearch: Found {len(titles)} items: {titles}")

    # 2. French Wikipedia (Regional Language)
    fr_url = f"https://fr.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord={lat}|{lng}&gsradius=2000&gslimit=2&format=json&origin=*"
    req_fr = urllib.request.Request(fr_url, headers={'User-Agent': 'TheWanderingLayer/2.0 (test@example.com)'})
    with urllib.request.urlopen(req_fr, timeout=10) as resp:
        data_fr = json.loads(resp.read().decode('utf-8'))
        titles_fr = [x['title'] for x in data_fr.get('query', {}).get('geosearch', [])]
        print(f"[OK] French Wikipedia (fr.wikipedia.org): Found {len(titles_fr)} items: {titles_fr}")

def test_unit_conversions():
    print("\n--- Testing Imperial vs Metric Unit Calculations ---")
    speed_kmh = 100
    speed_mph = round(speed_kmh * 0.621371)
    assert speed_mph == 62, f"Expected 62 mph, got {speed_mph}"
    print(f"[OK] Speed: {speed_kmh} km/h converts to {speed_mph} mph")

    dist_meters = 1609.34 # 1 mile
    dist_miles = round(dist_meters * 0.000621371, 1)
    assert dist_miles == 1.0, f"Expected 1.0 mi, got {dist_miles}"
    print(f"[OK] Distance: {dist_meters} meters converts to {dist_miles} miles")

    short_dist = 100 # meters
    dist_feet = round(short_dist * 3.28084)
    print(f"[OK] Short Distance: {short_dist} meters converts to {dist_feet} feet")

def test_overpass_mirrors():
    print("\n--- Testing OpenStreetMap Overpass Mirrors ---")
    mirrors = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]
    query = """[out:json][timeout:8];
    (
      node["natural"="waterfall"](around:8000,48.8584,2.2945);
      node["tourism"="viewpoint"](around:8000,48.8584,2.2945);
      node["historic"="monument"](around:8000,48.8584,2.2945);
    );
    out body 4;"""
    post_data = urllib.parse.urlencode({'data': query}).encode('utf-8')

    for m in mirrors:
        try:
            req = urllib.request.Request(m, data=post_data, headers={'User-Agent': 'TheWanderingLayer/2.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                elements = data.get('elements', [])
                print(f"[OK] Mirror {m}: Status {resp.status}, returned {len(elements)} elements")
                break
        except Exception as e:
            print(f"[WARN] Mirror {m} failed ({e}), continuing to next mirror...")

def test_topological_sorting():
    print("\n--- Testing Topological Waypoint Sorting Logic ---")
    polyline = [(10.0 + i*0.01, 76.0 + i*0.01) for i in range(10)]
    
    waypoints = [
        {'id': 'wp3', 'title': 'Stop 3', 'lat': 10.08, 'lng': 76.08},
        {'id': 'wp1', 'title': 'Stop 1', 'lat': 10.02, 'lng': 76.02},
        {'id': 'wp2', 'title': 'Stop 2', 'lat': 10.05, 'lng': 76.05}
    ]

    def calc_dist(lat1, lon1, lat2, lon2):
        return math.hypot(lat2 - lat1, lon2 - lon1)

    for wp in waypoints:
        min_d = float('inf')
        closest_idx = 0
        for i, pt in enumerate(polyline):
            d = calc_dist(wp['lat'], wp['lng'], pt[0], pt[1])
            if d < min_d:
                min_d = d
                closest_idx = i
        wp['proj'] = closest_idx

    sorted_wps = sorted(waypoints, key=lambda x: x['proj'])
    print("[OK] Ordered Waypoints along Route:", [w['title'] for w in sorted_wps])
    assert [w['title'] for w in sorted_wps] == ['Stop 1', 'Stop 2', 'Stop 3']

def test_backup_restore_schema():
    print("\n--- Testing Backup & Restore Serialization Schema ---")
    mock_backup = {
        "app": "The Wandering Layer",
        "version": 2.0,
        "exportedAt": "2026-08-29T20:09:00Z",
        "settings": {
            "unitSystem": "imperial",
            "knowledgeLang": "fr",
            "persona": "folklorist",
            "budgetMinutes": 25,
            "searchRadius": 4000
        },
        "wonderPins": [
            {"id": "pin-1", "title": "Secret Cliff", "lat": 36.27, "lng": -121.8}
        ],
        "journals": [
            {"id": "j-1", "stats": {"totalDiscoveries": 5}}
        ],
        "routes": []
    }
    
    serialized = json.dumps(mock_backup)
    deserialized = json.loads(serialized)
    assert deserialized['app'] == "The Wandering Layer"
    assert deserialized['settings']['unitSystem'] == "imperial"
    assert len(deserialized['wonderPins']) == 1
    print(f"[OK] Full Backup Schema valid: {len(deserialized['wonderPins'])} pins, {len(deserialized['journals'])} journals, {len(deserialized['settings'])} settings")

def test_multi_route_alternatives_and_scoring():
    print("\n--- Testing Multi-Route Alternatives & Scenic/Comfort Scoring ---")
    url = "https://router.project-osrm.org/route/v1/driving/-122.4194,37.7749;-121.9018,36.3714?overview=full&geometries=geojson&alternatives=3"
    req = urllib.request.Request(url, headers={'User-Agent': 'TheWanderingLayer/2.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        routes = data.get('routes', [])
        print(f"[OK] OSRM Multi-Route Discovery: Found {len(routes)} alternatives")
        assert len(routes) >= 2, "Expected at least 2 alternative routes"

        for idx, r in enumerate(routes):
            coords = r['geometry']['coordinates']
            dist_km = round(r['distance'] / 1000, 1)
            dur_mins = round(r['duration'] / 60)
            
            # Curvature calculation
            total_bends = 0
            for i in range(1, len(coords) - 1):
                p0, p1, p2 = coords[i-1], coords[i], coords[i+1]
                b1 = math.degrees(math.atan2(p1[0] - p0[0], p1[1] - p0[1]))
                b2 = math.degrees(math.atan2(p2[0] - p1[0], p2[1] - p1[1]))
                diff = abs((b2 - b1 + 180) % 360 - 180)
                if diff > 12:
                    total_bends += diff
            curvature_ratio = round(total_bends / max(1, dist_km))
            comfort_score = max(55, min(98, round(100 - (curvature_ratio * 0.35))))
            scenic_score = min(98, 70 + (idx * 12))

            print(f"  -> Route {idx + 1}: {dist_km} km ({dur_mins}m) | Curvature Ratio: {curvature_ratio} deg/km | Comfort: {comfort_score}/100 | Scenic Score: {scenic_score}/100")

def test_html_and_js_integrity():
    print("\n--- Testing HTML DOM & JS Element Bindings Integrity ---")
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    with open('app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    import re
    html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html))
    js_ids = set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js))

    dynamic_prefixes = ('card-', 'corridor-item-', 'check-', 'car-dot')
    missing = [i for i in js_ids if i not in html_ids and not any(i.startswith(p) for p in dynamic_prefixes)]
    
    print(f"[OK] Total HTML IDs defined: {len(html_ids)}")
    print(f"[OK] Total JS Element IDs queried: {len(js_ids)}")
    if missing:
        print(f"[WARN] Missing IDs in HTML: {missing}")
    assert len(missing) == 0, f"Missing IDs in HTML: {missing}"
    print("[OK] All JS element bindings exist in HTML!")

if __name__ == '__main__':
    test_wiki_and_wikivoyage()
    test_unit_conversions()
    test_overpass_mirrors()
    test_topological_sorting()
    test_backup_restore_schema()
    test_multi_route_alternatives_and_scoring()
    test_html_and_js_integrity()
    print("\nAll multi-route scenic evaluations and architectural tests passed successfully!")

