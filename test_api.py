import urllib.request
import urllib.parse
import json

def test_wiki():
    url = "https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=10.0542|76.7865&gsradius=5000&gslimit=3&format=json&origin=*"
    req = urllib.request.Request(url, headers={'User-Agent': 'TheWanderingLayer/1.0 (test@example.com)'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("[OK] Wikipedia GeoSearch: Found", [x['title'] for x in data['query']['geosearch']])

def test_overpass():
    query = """[out:json][timeout:10];
    (
      node["natural"="waterfall"](around:10000,10.0321,76.9123);
      node["tourism"="viewpoint"](around:10000,10.0321,76.9123);
    );
    out body 5;"""
    post_data = urllib.parse.urlencode({'data': query}).encode('utf-8')
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=post_data, headers={'User-Agent': 'TheWanderingLayer/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            elements = data.get('elements', [])
            print(f"[OK] OpenStreetMap Overpass: Found {len(elements)} elements:", [e.get('tags', {}).get('name', 'unnamed') for e in elements[:3]])
    except Exception as e:
        print("⚠ Overpass note:", e)

if __name__ == '__main__':
    test_wiki()
    test_overpass()
