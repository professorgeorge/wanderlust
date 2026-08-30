# The Wandering Layer 🧭
*The Map Beyond the Directions*

A zero-cost, open-source audio-first companion Progressive Web App (PWA) that runs alongside Google Maps, proactively narrating viewpoints, waterfalls, and historical footnotes as you drive.

---

### Key Philosophy
> *"Directions are wonderfully efficient. When we are trying to reach a destination, we want to know exactly which road to take... But something profound is lost when the glowing blue line of the route becomes the only thing we see. A map tells me there is a lake beyond the road I am taking. It tells me there is a village on the other side of the hill... Education must teach us how to read the map. To understand, rather than merely arrive."*

---

### Core Capabilities ($0.00 Forever, Zero-Config)

1. **Official OpenStreetMap Dark Tiles:** Zero API key required, crisp readability day and night.
2. **Speed-Adaptive Lookahead Horizon:** Automatically expands scanning distance (from 1.5 km in town to 6+ km at 100+ km/h highway speeds) and anchors queries along your travel vector.
3. **Forward Heading Cone Filtering:** Filters announcements to a ±60° forward cone to prevent alerting for landmarks already passed or on unreachable rear roads.
4. **Wikipedia & Wikivoyage Knowledge Engine:** Dual-source geocoded history, local folklore, travel-guide footnotes, and culinary highlights.
5. **OpenStreetMap Overpass Engine with Mirror Failover:** Natural waterfalls, mountain lookouts, peaks, caves, springs, and ancient monuments with automatic fallback servers.
6. **User Wonder Pins (Community Layer):** One-tap roadside bookmarking to record personal discoveries (secret benches, bakeries, sacred trees) with standard GeoJSON export/import.
7. **Topologically Sequenced Google Maps Multi-Stop Routes:** Route Builder automatically sorts selected corridor stops along the driving direction so Google Maps navigates them without backtracking.
8. **Corridor Offline Pre-Caching & Service Worker (`sw.js`):** 1-tap download of all stories along a planned route into browser `IndexedDB` for seamless audio narration in zero-signal mountain canyons.
9. **Minimalist OLED Night Driving HUD:** Pure-black high-contrast screen mode for car dashboard mounts with large speed typography, upcoming story summaries, and big action targets.
10. **Device-Native Voice Synthesis & Harmonic Chimes:** Web Speech + Web Audio API without cloud TTS costs, equipped with mobile keep-alive heartbeats.
11. **Ephemeral Moments Engine (Context-Aware):** Adapts to your exact time of day—highlighting valley mist at dawn, cool waterfalls at midday, golden hour sunset ridges in the afternoon, and dark-sky lookouts at night.
12. **Detour Slack Budget with Dynamic Depletion:** Set how many minutes of wandering slack you have; tracks dwell time at stops and updates remaining budget.
13. **Silent Background Audio Heartbeat:** Uses HTML5 `MediaSession` and an inaudible sub-audible loop to prevent iOS Safari and Android Chrome from pausing background GPS when Google Maps is active.
14. **Serendipity Scrapbook (Auto-Journal):** Passively collects every milestone passed into an illustrated timeline with statistics, photos, and a one-click Markdown download.
15. **Companion Personas:** Choose who is sitting in the passenger seat:
    - ✨ *The Contemplative Wanderer* (Poetic & reflective)
    - 📜 *The Local Folklorist* (Myths & oral history)
    - 🌿 *The Naturalist & Geologist* (Landforms & ecology)
    - 🏛️ *The Highway Historian* (Engineering & trade routes)

---

### How to Run Locally

Launch a local static server:

```bash
cd C:\Users\babug\.gemini\antigravity\scratch\wandering-layer
python -m http.server 8080
```

Then open `http://localhost:8080` in your web browser.

---

### How to Host for Free (For Use in Your Car on iPhone / Android)

1. Create a free repository on [GitHub](https://github.com).
2. Push or upload the files in this directory (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`, `services/`).
3. Go to **Settings > Pages > Branch: main / root > Save**.
4. GitHub provides a free, public, secure HTTPS URL (e.g. `https://yourname.github.io/wandering-layer/`).
5. Open this URL on your phone's Safari or Chrome, tap **"Add to Home Screen"**, connect to Bluetooth in your car, tap **"Start Journey"**, and switch back to Google Maps!

---

### Conceptualization & Development Credit

**Conceptualized, architected, and developed by [Babu George](https://www.linkedin.com/in/beingbabu/)** as an open, serendipitous road-trip audio companion.

---

### Legal Disclaimer & Non-Liability Clause

1. **Absolute "AS-IS" & No Warranty:** This software is provided strictly on an "AS-IS" and "AS-AVAILABLE" basis without warranties or representations of any kind, whether express, statutory, or implied, including but not limited to the implied warranties of merchantability, fitness for a particular purpose, non-infringement, or routing accuracy.
2. **Informational & Recreational Purpose Only:** All waypoint data, geographic coordinates, estimated arrival times, detour durations, roadside attractions, viewpoints, historical facts, and weather forecasts are dynamically aggregated from public, crowdsourced, third-party APIs (OpenStreetMap, Wikimedia Foundation, Open-Meteo, OSRM) and are subject to real-world errors, omissions, road closures, or changing conditions. This application is NOT an emergency navigation system or certified driving safety tool.
3. **Express Assumption of Risk & Driver Responsibility:** The vehicle operator assumes sole, total responsibility for vehicle operation, route selection, and personal safety. The driver MUST remain fully attentive to the roadway at all times, adhere to all posted speed limits and traffic regulations, respect private property boundaries, and NEVER manipulate screen controls or adjust settings while the vehicle is in motion.
4. **Total Limitation of Liability & Hold Harmless:** To the fullest extent permitted by applicable law, in no event shall the author/creator (Babu George), developers, or project contributors be liable for any direct, indirect, incidental, punitive, special, or consequential damages, losses, personal injuries, fatalities, property damage, traffic citations, or accidents arising out of or in connection with the access, use, or inability to use this software. By accessing or running this application, you expressly agree to hold harmless and release the creators from any and all legal claims, liabilities, and causes of action.

