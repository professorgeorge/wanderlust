import { StorageService } from './services/storage-service.js';
import { PinsService } from './services/pins-service.js';
import { WikiService } from './services/wiki-service.js';
import { OsmService } from './services/osm-service.js';
import { VoiceService } from './services/voice.js';
import { GpsService } from './services/gps.js';
import { ContextService } from './services/context-service.js';
import { DetourBudgetService } from './services/detour-budget.js';
import { HeartbeatService } from './services/heartbeat.js';
import { JournalService } from './services/journal-service.js';
import { PersonaService } from './services/personas.js';
import { RouteService } from './services/route-service.js';
import { WeatherService } from './services/weather-service.js';

class WanderingLayerApp {
  constructor() {
    this.storage = new StorageService();
    this.pinsService = new PinsService(this.storage);
    this.weather = new WeatherService();

    // Global Audience: Unit System & Language Preferences
    const savedUnits = localStorage.getItem('unit_system');
    const isImperialLocale = navigator.language && (navigator.language.includes('US') || navigator.language.includes('GB') || navigator.language.includes('LR') || navigator.language.includes('MM'));
    this.unitSystem = savedUnits || (isImperialLocale ? 'imperial' : 'metric');

    const savedLang = localStorage.getItem('knowledge_lang');
    const detectedLang = navigator.language ? navigator.language.split('-')[0].toLowerCase() : 'en';
    const supportedLangs = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'hi', 'zh', 'ml', 'ar'];
    this.knowledgeLang = savedLang || (supportedLangs.includes(detectedLang) ? detectedLang : 'en');

    this.wiki = new WikiService(this.storage, this.knowledgeLang);
    this.osm = new OsmService();
    this.voice = new VoiceService();
    this.gps = new GpsService();
    this.context = new ContextService();
    this.budget = new DetourBudgetService(20);
    this.heartbeat = new HeartbeatService();
    this.journal = new JournalService(this.storage);
    this.personas = new PersonaService('wanderer');
    this.routeService = new RouteService(this.wiki, this.osm, this.storage, this.weather);

    this.map = null;
    this.carMarker = null;
    this.radiusCircle = null;
    this.poiMarkers = new Map();
    this.pinMarkers = new Map();
    this.routePolyline = null;
    this.alternativePolylines = [];
    this.activeRouteIndex = 0;
    this.selectedWaypoints = [];
    this.selectedOrigin = null;
    this.selectedDest = null;

    this.isTracking = false;
    this.currentPois = [];
    this.searchRadius = 3000; // base meters
    this.isConcise = false;
    this.useForwardConeFilter = true;
    this.isHudMode = false;
    this.lastScanCoords = null;
    this.activePoiForOled = null;

    this.initServiceWorker();
    this.initMap();
    this.loadInitialData();
    this.bindEvents();
    this.initAutocomplete();
    this.initVoiceState();
    this.initAutoLocation();
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update();
      }).catch(err => {
        console.warn('Service worker registration non-fatal notice:', err);
      });
    }
  }

  async loadInitialData() {
    await this.pinsService.loadPins();
    this.renderPinMarkers();

    // Sync settings selectors
    const unitSelect = document.getElementById('unit-system-select');
    if (unitSelect) unitSelect.value = this.unitSystem;

    const langSelect = document.getElementById('knowledge-lang-select');
    if (langSelect) langSelect.value = this.knowledgeLang;

    this.updateRadiusSliderLabel();
  }

  getLastKnownLocation() {
    try {
      const saved = localStorage.getItem('last_known_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          // Purge legacy development placeholder (Neriyamangalam, India) if cached
          if (Math.abs(parsed.lat - 10.0542) < 0.05 && Math.abs(parsed.lng - 76.7865) < 0.05) {
            localStorage.removeItem('last_known_location');
            return null;
          }
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  saveLastKnownLocation(lat, lng) {
    try {
      // Don't save old legacy placeholder
      if (Math.abs(lat - 10.0542) < 0.05 && Math.abs(lng - 76.7865) < 0.05) return;
      localStorage.setItem('last_known_location', JSON.stringify({
        lat,
        lng,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  initMap() {
    const lastKnown = this.getLastKnownLocation();
    // Default to US center or last known location
    const initialLat = lastKnown ? lastKnown.lat : (this.unitSystem === 'imperial' ? 37.7749 : 48.8566);
    const initialLng = lastKnown ? lastKnown.lng : (this.unitSystem === 'imperial' ? -122.4194 : 2.3522);
    const initialZoom = lastKnown ? 13 : 11;

    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([initialLat, initialLng], initialZoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    const carIcon = L.divIcon({
      className: 'car-marker-container',
      html: `
        <div id="car-dot" style="
          width: 22px; height: 22px;
          background: #58a6ff;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 14px rgba(88, 166, 255, 0.8);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.3s ease;
        ">
          <div style="width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 7px solid #fff; margin-bottom: 2px;"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    this.carMarker = L.marker([initialLat, initialLng], { icon: carIcon }).addTo(this.map);

    this.radiusCircle = L.circle([initialLat, initialLng], {
      radius: this.searchRadius,
      color: '#58a6ff',
      weight: 1,
      fillColor: '#58a6ff',
      fillOpacity: 0.05,
      dashArray: '4, 8'
    }).addTo(this.map);

    this.updateContextHUD(initialLat, initialLng);

    if (lastKnown) {
      this.gps.updatePosition(lastKnown.lat, lastKnown.lng, null, 0, false);
      this.scanLandscape(lastKnown.lat, lastKnown.lng);
    }
  }

  async initAutoLocation() {
    let locationResolved = false;

    const applyLocation = (lat, lng, zoom = 13, source = 'gps') => {
      if (locationResolved && source === 'ip') return;
      locationResolved = true;
      this.saveLastKnownLocation(lat, lng);
      this.carMarker.setLatLng([lat, lng]);
      this.radiusCircle.setLatLng([lat, lng]);
      this.map.setView([lat, lng], zoom);
      this.gps.updatePosition(lat, lng, null, 0, false);
      this.updateContextHUD(lat, lng);
      this.scanLandscape(lat, lng);
    };

    // 1. Hardware GPS (High Accuracy)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyLocation(pos.coords.latitude, pos.coords.longitude, 13, 'gps');
        },
        (err) => {
          console.log('Hardware GPS waiting/unavailable:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }

    // 2. Instant IP Geolocation fallback (works immediately without waiting for browser prompt)
    try {
      const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude && !locationResolved) {
          applyLocation(data.latitude, data.longitude, 12, 'ip');
        }
      }
    } catch (e) {
      console.warn('IP geolocation notice:', e);
    }
  }

  // --- Units Conversion Helpers ---

  formatSpeed(speedKmh) {
    if (this.unitSystem === 'imperial') {
      const mph = Math.round(speedKmh * 0.621371);
      return { val: mph, unit: 'mph', oledUnit: 'MPH' };
    }
    return { val: speedKmh, unit: 'km/h', oledUnit: 'KM / H' };
  }

  formatDistance(meters) {
    if (this.unitSystem === 'imperial') {
      if (meters < 400) {
        return `${Math.round(meters * 3.28084)} ft`;
      }
      return `${(meters * 0.000621371).toFixed(1)} mi`;
    }
    if (meters < 1000) {
      return `${meters} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  formatRadius(meters) {
    if (this.unitSystem === 'imperial') {
      return `${(meters * 0.000621371).toFixed(1)} mi`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  updateRadiusSliderLabel() {
    const radiusLabel = document.getElementById('radius-val');
    if (radiusLabel) {
      radiusLabel.textContent = this.formatRadius(this.searchRadius);
    }
  }

  bindEvents() {
    this.gps.onLocationUpdate = (pos) => this.handleLocationUpdate(pos);

    this.voice.onStateChange = ({ isSpeaking, poi }) => {
      const banner = document.getElementById('speaking-banner');
      const bannerText = document.getElementById('speaking-text');
      if (isSpeaking && poi) {
        banner.classList.add('active');
        bannerText.textContent = `Whispering: ${poi.title}`;
        this.highlightCard(poi.id, true);
        this.activePoiForOled = poi;
        this.updateOledDisplay(poi);
      } else {
        banner.classList.remove('active');
        this.highlightCard(null, false);
      }
    };

    // Live GPS Start/Stop button
    const startBtn = document.getElementById('start-journey-btn');
    startBtn.addEventListener('click', () => {
      this.voice.unlockAudio();
      this.heartbeat.start();

      if (!this.isTracking) {
        this.journal.startSession();
        const started = this.gps.startLiveTracking();
        if (started) {
          this.isTracking = true;
          startBtn.classList.add('tracking');
          startBtn.innerHTML = `<span>End Journey</span>`;
          document.getElementById('hud-status').textContent = 'Live Tracking';
        }
      } else {
        this.gps.stopLiveTracking();
        this.gps.stopSimulation();
        this.heartbeat.stop();
        this.isTracking = false;
        startBtn.classList.remove('tracking');
        startBtn.innerHTML = `<span>Start Journey (Live GPS)</span>`;
        document.getElementById('hud-status').textContent = 'Standby';

        if (this.journal.entries.length > 0) {
          this.openScrapbook();
        }
      }
    });

    // Mute button
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.addEventListener('click', () => {
      const isMuted = this.voice.toggleMute();
      document.getElementById('mute-label').textContent = isMuted ? 'Muted' : 'Audio On';
      muteBtn.classList.toggle('active', isMuted);
    });

    // Minimal OLED Driving HUD Mode
    const hudModeBtn = document.getElementById('hud-mode-btn');
    const drivingHudView = document.getElementById('driving-hud-view');
    const exitHudBtn = document.getElementById('exit-hud-btn');

    hudModeBtn.addEventListener('click', () => {
      this.isHudMode = true;
      drivingHudView.style.display = 'flex';
      if (this.currentPois.length > 0) {
        this.updateOledDisplay(this.currentPois[0]);
      }
    });

    exitHudBtn.addEventListener('click', () => {
      this.isHudMode = false;
      drivingHudView.style.display = 'none';
    });

    document.getElementById('oled-speak-btn').addEventListener('click', () => {
      if (this.activePoiForOled) {
        this.voice.narrate(this.activePoiForOled, {
          force: true,
          isConcise: this.isConcise,
          unitSystem: this.unitSystem,
          relativeBearing: this.activePoiForOled.relativeBearing,
          personaService: this.personas
        });
      }
    });

    document.getElementById('oled-pin-btn').addEventListener('click', () => {
      this.openWonderPinModal();
    });

    // Wonder Pin Modal & Actions
    const dropPinBtn = document.getElementById('drop-pin-btn');
    const pinModal = document.getElementById('pin-modal');
    const closePinBtn = document.getElementById('close-pin-btn');

    dropPinBtn.addEventListener('click', () => this.openWonderPinModal());
    closePinBtn.addEventListener('click', () => pinModal.classList.remove('active'));

    document.getElementById('save-pin-btn').addEventListener('click', async () => {
      const title = document.getElementById('pin-title-input').value;
      const note = document.getElementById('pin-note-input').value;
      const category = document.getElementById('pin-category-select').value;
      const markerPos = this.carMarker ? this.carMarker.getLatLng() : { lat: 37.7749, lng: -122.4194 };
      const pos = this.gps.currentPosition || { lat: markerPos.lat, lng: markerPos.lng };

      await this.pinsService.createPin({
        title,
        note,
        category,
        lat: pos.lat,
        lng: pos.lng
      });

      document.getElementById('pin-title-input').value = '';
      document.getElementById('pin-note-input').value = '';
      pinModal.classList.remove('active');

      this.renderPinMarkers();
      if (this.lastScanCoords) {
        this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
      }
    });

    document.getElementById('export-pins-geojson-btn').addEventListener('click', () => {
      const geojsonStr = this.pinsService.exportToGeoJson();
      const blob = new Blob([geojsonStr], { type: 'application/geo+json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my_wonder_pins_${new Date().toISOString().slice(0, 10)}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    document.getElementById('import-pins-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const res = await this.pinsService.importFromGeoJson(evt.target.result);
        if (res.success) {
          alert(`Successfully imported ${res.count} wonder pins!`);
          this.renderPinMarkers();
          if (this.lastScanCoords) {
            this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
          }
        } else {
          alert(`Import failed: ${res.error}`);
        }
      };
      reader.readAsText(file);
    });

    // Scrapbook Modal
    const scrapbookBtn = document.getElementById('scrapbook-btn');
    const scrapbookModal = document.getElementById('scrapbook-modal');
    const closeScrapbookBtn = document.getElementById('close-scrapbook-btn');
    scrapbookBtn.addEventListener('click', () => this.openScrapbook());
    closeScrapbookBtn.addEventListener('click', () => scrapbookModal.classList.remove('active'));

    document.getElementById('export-journal-btn').addEventListener('click', () => {
      this.exportJournalMarkdown();
    });

    // Route Builder Modal
    const routeModal = document.getElementById('route-modal');
    const closeRouteBtn = document.getElementById('close-route-btn');
    const openRouteModal = () => routeModal.classList.add('active');

    ['route-btn', 'sidebar-plan-route-btn', 'feed-plan-route-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openRouteModal);
    });

    closeRouteBtn.addEventListener('click', () => routeModal.classList.remove('active'));

    document.getElementById('route-my-loc-btn').addEventListener('click', () => {
      this.locateUserForRoute(document.getElementById('route-origin-input'), document.getElementById('route-my-loc-btn'), document.getElementById('route-status'));
    });

    document.getElementById('route-scan-btn').addEventListener('click', () => this.handleRouteScan());
    document.getElementById('route-departure-select')?.addEventListener('change', () => {
      if (this.routeService.currentRoute) {
        this.handleRouteScan();
      }
    });
    document.getElementById('export-gpx-btn').addEventListener('click', () => this.exportRouteGpx());
    document.getElementById('cache-route-offline-btn').addEventListener('click', () => this.handleOfflinePreCache());

    // 1-Tap Simulation of Planned Route
    document.getElementById('route-simulate-btn').addEventListener('click', () => {
      if (!this.routeService.currentRoute?.latLngs) return;
      this.voice.unlockAudio();
      this.heartbeat.start();
      this.journal.startSession();

      this.gps.startSimulation(this.routeService.currentRoute.latLngs);
      this.isTracking = true;
      routeModal.classList.remove('active');
      document.getElementById('hud-status').textContent = 'Simulating Route';
      startBtn.classList.add('tracking');
      startBtn.innerHTML = `<span>Stop Simulation</span>`;
    });

    // HUD Detour Slack Slider
    const hudBudgetSlider = document.getElementById('hud-budget-slider');
    hudBudgetSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      document.getElementById('hud-budget-val').textContent = `${val}m`;
      this.budget.setBudget(val);
      this.renderFeed();
    });

    // Simulation Modal
    const simBtn = document.getElementById('sim-btn');
    const simModal = document.getElementById('sim-modal');
    const closeSimBtn = document.getElementById('close-sim-btn');
    simBtn.addEventListener('click', () => {
      // If a route was already calculated in Route Builder, prefill it
      if (this.routeService.currentRoute) {
        document.getElementById('sim-origin-input').value = this.routeService.currentRoute.start?.name || '';
        document.getElementById('sim-dest-input').value = this.routeService.currentRoute.end?.name || '';
      }
      simModal.classList.add('active');
    });
    closeSimBtn.addEventListener('click', () => simModal.classList.remove('active'));

    document.getElementById('sim-my-loc-btn').addEventListener('click', () => {
      this.locateUserForRoute(document.getElementById('sim-origin-input'), document.getElementById('sim-my-loc-btn'), document.getElementById('sim-status'));
    });

    document.getElementById('sim-export-gpx-btn').addEventListener('click', () => {
      if (this.currentSimRoute) {
        const r = this.currentSimRoute;
        const gpxContent = this.routeService.exportToGpx(r.start, r.end, [], r.latLngs);
        const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `simulated_drive_${r.start.name}_to_${r.end.name}.gpx`.replace(/\s+/g, '_');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    });

    document.getElementById('start-sim-action').addEventListener('click', async () => {
      const originInput = document.getElementById('sim-origin-input').value.trim().replace(/^📍\s*/, '');
      const destInput = document.getElementById('sim-dest-input').value.trim();
      const statusEl = document.getElementById('sim-status');
      const startBtn = document.getElementById('start-journey-btn');

      if (!originInput || !destInput) {
        if (this.routeService.currentRoute?.latLngs) {
          const r = this.routeService.currentRoute;
          this.currentSimRoute = r;
          this.voice.unlockAudio();
          this.heartbeat.start();
          this.journal.startSession();
          this.gps.startSimulation(r.latLngs);
          this.isTracking = true;

          // Populate nav transfer links
          document.getElementById('sim-gmaps-link').href = this.routeService.generateGoogleMapsUrl(r.start, r.end, []);
          document.getElementById('sim-apple-link').href = this.routeService.generateAppleMapsUrl(r.start, r.end, []);
          document.getElementById('sim-nav-row').style.display = 'block';

          simModal.classList.remove('active');
          document.getElementById('hud-status').textContent = 'Simulating Route';
          startBtn.classList.add('tracking');
          startBtn.innerHTML = `<span>Stop Simulation</span>`;
          return;
        }
        statusEl.innerHTML = '<span style="color: #f85149;">Please provide both Origin and Destination.</span>';
        return;
      }

      statusEl.innerHTML = '<span>⏳ Mapping route and launching drive simulation...</span>';

      try {
        let startCoords = this.selectedSimOrigin;
        if (!startCoords || !originInput.includes(startCoords.name)) {
          startCoords = await this.routeService.geocode(originInput);
        }

        let endCoords = this.selectedSimDest;
        if (!endCoords || !destInput.includes(endCoords.name)) {
          endCoords = await this.routeService.geocode(destInput);
        }

        if (!startCoords || !endCoords) {
          statusEl.innerHTML = '<span style="color: #f85149;">Could not locate one of the endpoints.</span>';
          return;
        }

        const route = await this.routeService.calculateRoute(startCoords, endCoords);
        if (!route) {
          statusEl.innerHTML = '<span style="color: #f85149;">Could not compute driving route between those locations.</span>';
          return;
        }

        this.currentSimRoute = route;

        // Draw route polyline on map
        if (this.routePolyline) {
          this.map.removeLayer(this.routePolyline);
        }
        this.routePolyline = L.polyline(route.latLngs, {
          color: '#58a6ff',
          weight: 6,
          opacity: 0.9,
          lineCap: 'round'
        }).addTo(this.map);
        this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });

        // Predictive Route Weather Corridor Forecast
        try {
          const simWeatherPreview = document.getElementById('sim-route-weather-preview');
          this.weather.getRouteWeatherForecast(route.latLngs, route.durationMinutes, this.unitSystem).then(fc => {
            this.renderRouteWeatherPreview(fc, simWeatherPreview);
          });
        } catch (e) {}

        // Populate navigation transfer links
        document.getElementById('sim-gmaps-link').href = this.routeService.generateGoogleMapsUrl(startCoords, endCoords, []);
        document.getElementById('sim-apple-link').href = this.routeService.generateAppleMapsUrl(startCoords, endCoords, []);
        document.getElementById('sim-nav-row').style.display = 'block';

        this.voice.unlockAudio();
        this.heartbeat.start();
        this.journal.startSession();

        this.gps.startSimulation(route.latLngs);
        this.isTracking = true;

        statusEl.innerHTML = `<span>✓ Simulating drive &bull; ${route.distanceKm} km (${route.durationMinutes}m)</span>`;
        
        setTimeout(() => {
          simModal.classList.remove('active');
        }, 500);

        document.getElementById('hud-status').textContent = 'Simulating Route';
        startBtn.classList.add('tracking');
        startBtn.innerHTML = `<span>Stop Simulation</span>`;
      } catch (err) {
        console.error('Simulation start error:', err);
        statusEl.innerHTML = '<span style="color:#f85149;">Simulation could not start. Please try again.</span>';
      }
    });

    document.getElementById('sim-speed-slider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('sim-speed-val').textContent = `${val}x (Cruising Speed)`;
      this.gps.setSpeedMultiplier(Number(val));
    });

    // Settings Modal
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));

    // Units System Selection
    const unitSystemSelect = document.getElementById('unit-system-select');
    if (unitSystemSelect) {
      unitSystemSelect.addEventListener('change', (e) => {
        this.unitSystem = e.target.value;
        localStorage.setItem('unit_system', this.unitSystem);
        this.updateRadiusSliderLabel();
        if (this.gps.currentPosition) {
          const sp = this.formatSpeed(this.gps.currentPosition.speed);
          document.getElementById('hud-speed').textContent = sp.val;
          const unitSpan = document.querySelector('.speed-unit');
          if (unitSpan) unitSpan.textContent = sp.unit;
        }
        this.renderFeed();
        this.renderMarkers();
      });
    }

    // Knowledge Language Selection
    const knowledgeLangSelect = document.getElementById('knowledge-lang-select');
    if (knowledgeLangSelect) {
      knowledgeLangSelect.addEventListener('change', (e) => {
        this.knowledgeLang = e.target.value;
        localStorage.setItem('knowledge_lang', this.knowledgeLang);
        this.wiki.setLanguage(this.knowledgeLang);
        this.initVoiceState();
        if (this.lastScanCoords) {
          this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
        }
      });
    }

    document.getElementById('forward-cone-toggle').addEventListener('change', (e) => {
      this.useForwardConeFilter = e.target.checked;
      this.renderFeed();
      this.renderMarkers();
    });

    // Persona Selector
    const personaSelect = document.getElementById('persona-select');
    personaSelect.addEventListener('change', (e) => {
      const p = this.personas.setPersona(e.target.value);
      if (p) {
        document.getElementById('persona-desc').textContent = p.tagline;
      }
    });

    // Ephemeral Time Phase Simulator Override
    const timePhaseSelect = document.getElementById('time-phase-select');
    timePhaseSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      this.context.simulatedHour = val === 'auto' ? null : Number(val);
      if (this.lastScanCoords) {
        this.updateContextHUD(this.lastScanCoords.lat, this.lastScanCoords.lng);
      }
      this.renderFeed();
    });

    // Budget Filter Toggle
    const budgetFilterToggle = document.getElementById('budget-filter-toggle');
    budgetFilterToggle.addEventListener('change', (e) => {
      this.budget.filterOnlyWithinBudget = e.target.checked;
      this.renderFeed();
      this.renderMarkers();
    });

    document.getElementById('radius-slider').addEventListener('input', (e) => {
      this.searchRadius = Number(e.target.value);
      this.updateRadiusSliderLabel();
      if (this.radiusCircle) this.radiusCircle.setRadius(this.searchRadius);
    });

    document.getElementById('cooldown-slider').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.voice.cooldownSeconds = val;
      document.getElementById('cooldown-val').textContent = `${Math.round(val / 60)} mins`;
    });

    document.getElementById('narration-depth').addEventListener('change', (e) => {
      this.isConcise = (e.target.value === 'concise');
    });

    // Full Backup Export
    document.getElementById('export-full-backup-btn').addEventListener('click', async () => {
      const currentSettings = {
        unitSystem: this.unitSystem,
        knowledgeLang: this.knowledgeLang,
        useForwardConeFilter: this.useForwardConeFilter,
        persona: this.personas.currentKey,
        budgetMinutes: this.budget.budgetMinutes,
        filterOnlyWithinBudget: this.budget.filterOnlyWithinBudget,
        searchRadius: this.searchRadius,
        cooldownSeconds: this.voice.cooldownSeconds,
        isConcise: this.isConcise,
        lastKnownLocation: this.getLastKnownLocation()
      };

      const backupData = await this.storage.exportFullBackup(currentSettings);
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wandering_layer_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const statusMsg = document.getElementById('backup-status-msg');
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#3fb950';
        statusMsg.textContent = `✓ Backup exported: ${backupData.wonderPins.length} wonder pins, ${backupData.journals.length} journals, and settings.`;
      }
    });

    // Full Backup Restore
    document.getElementById('import-backup-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const statusMsg = document.getElementById('backup-status-msg');
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          const res = await this.storage.importFullBackup(parsed);

          if (res.success) {
            if (res.settings) {
              if (res.settings.unitSystem) {
                this.unitSystem = res.settings.unitSystem;
                localStorage.setItem('unit_system', this.unitSystem);
                const uSel = document.getElementById('unit-system-select');
                if (uSel) uSel.value = this.unitSystem;
              }
              if (res.settings.knowledgeLang) {
                this.knowledgeLang = res.settings.knowledgeLang;
                localStorage.setItem('knowledge_lang', this.knowledgeLang);
                this.wiki.setLanguage(this.knowledgeLang);
                const lSel = document.getElementById('knowledge-lang-select');
                if (lSel) lSel.value = this.knowledgeLang;
              }
              if (res.settings.persona) {
                this.personas.setPersona(res.settings.persona);
                const pSel = document.getElementById('persona-select');
                if (pSel) pSel.value = res.settings.persona;
              }
              if (typeof res.settings.budgetMinutes === 'number') {
                this.budget.setBudget(res.settings.budgetMinutes);
                const bSlider = document.getElementById('hud-budget-slider');
                if (bSlider) bSlider.value = res.settings.budgetMinutes;
                const bVal = document.getElementById('hud-budget-val');
                if (bVal) bVal.textContent = `${res.settings.budgetMinutes}m`;
              }
              if (typeof res.settings.searchRadius === 'number') {
                this.searchRadius = res.settings.searchRadius;
                const rSlider = document.getElementById('radius-slider');
                if (rSlider) rSlider.value = res.settings.searchRadius;
                this.updateRadiusSliderLabel();
              }
              if (typeof res.settings.cooldownSeconds === 'number') {
                this.voice.cooldownSeconds = res.settings.cooldownSeconds;
                const cSlider = document.getElementById('cooldown-slider');
                if (cSlider) cSlider.value = res.settings.cooldownSeconds;
              }
              if (typeof res.settings.isConcise === 'boolean') {
                this.isConcise = res.settings.isConcise;
                const nDepth = document.getElementById('narration-depth');
                if (nDepth) nDepth.value = this.isConcise ? 'concise' : 'rich';
              }
              if (typeof res.settings.useForwardConeFilter === 'boolean') {
                this.useForwardConeFilter = res.settings.useForwardConeFilter;
                const fToggle = document.getElementById('forward-cone-toggle');
                if (fToggle) fToggle.checked = this.useForwardConeFilter;
              }
              if (res.settings.lastKnownLocation) {
                this.saveLastKnownLocation(res.settings.lastKnownLocation.lat, res.settings.lastKnownLocation.lng);
              }
            }

            await this.pinsService.loadPins();
            this.renderPinMarkers();

            if (statusMsg) {
              statusMsg.style.display = 'block';
              statusMsg.style.color = '#3fb950';
              statusMsg.textContent = `✓ Restored successfully: ${res.pinsCount} wonder pins, ${res.journalsCount} travel journals, and your preferences!`;
            }

            if (this.lastScanCoords) {
              this.scanLandscape(this.lastScanCoords.lat, this.lastScanCoords.lng);
            }
          } else {
            if (statusMsg) {
              statusMsg.style.display = 'block';
              statusMsg.style.color = '#f85149';
              statusMsg.textContent = `⚠️ Restore failed: ${res.error || 'Invalid file format'}`;
            }
          }
        } catch (err) {
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.color = '#f85149';
            statusMsg.textContent = `⚠️ Error reading backup file: ${err.message}`;
          }
        }
      };
      reader.readAsText(file);
    });
  }

  initVoiceState() {
    const select = document.getElementById('voice-select');
    setTimeout(() => {
      const voices = window.speechSynthesis.getVoices();
      select.innerHTML = '';
      
      const langPrefix = this.knowledgeLang || 'en';
      const matchingVoices = voices.filter(v => v.lang.startsWith(langPrefix));
      const otherVoices = voices.filter(v => !v.lang.startsWith(langPrefix));

      [...matchingVoices, ...otherVoices].forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        select.appendChild(opt);
      });

      if (matchingVoices.length > 0) {
        this.voice.selectedVoice = matchingVoices[0];
        select.value = matchingVoices[0].name;
      }

      select.addEventListener('change', () => {
        this.voice.selectedVoice = voices.find(v => v.name === select.value);
      });
    }, 400);
  }

  openWonderPinModal() {
    document.getElementById('pin-modal').classList.add('active');
  }

  async updateContextHUD(lat, lng) {
    const phase = this.context.getTimePhase(lat, lng);
    const iconEl = document.getElementById('hud-moment-icon');
    const textEl = document.getElementById('hud-moment-text');
    if (iconEl) iconEl.textContent = phase.icon;
    if (textEl) textEl.textContent = phase.label;

    const oledMoment = document.getElementById('hud-mode-moment');
    if (oledMoment) oledMoment.textContent = `${phase.icon} ${phase.label.toUpperCase()}`;

    // Real-Time Atmospheric Weather
    try {
      const weather = await this.weather.getCurrentWeather(lat, lng, this.unitSystem);
      if (weather) {
        const wIcon = document.getElementById('hud-weather-icon');
        const wTemp = document.getElementById('hud-weather-temp');
        if (wIcon) wIcon.textContent = weather.icon;
        if (wTemp) wTemp.textContent = weather.tempDisplay;

        const oledWeather = document.getElementById('oled-weather-badge');
        if (oledWeather) {
          oledWeather.textContent = `${weather.icon} ${weather.tempDisplay} ${weather.condition.toUpperCase()}`;
        }
      }
    } catch (e) {
      console.warn('Weather HUD update notice:', e);
    }
  }

  async handleLocationUpdate(pos) {
    const { lat, lng, heading, speed, lookaheadLat, lookaheadLng, lookaheadMeters } = pos;

    this.saveLastKnownLocation(lat, lng);
    this.journal.updateDistance(lat, lng);

    const formattedSpeed = this.formatSpeed(speed);
    document.getElementById('hud-speed').textContent = formattedSpeed.val;
    const unitSpan = document.querySelector('.speed-unit');
    if (unitSpan) unitSpan.textContent = formattedSpeed.unit;

    const oledSpeed = document.getElementById('oled-speed');
    if (oledSpeed) oledSpeed.textContent = formattedSpeed.val;
    const oledUnit = document.querySelector('.oled-speed-lbl');
    if (oledUnit) oledUnit.textContent = formattedSpeed.oledUnit;

    const headingEl = document.getElementById('hud-heading');
    if (headingEl && heading !== null) {
      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const index = Math.round((((heading % 360) + 360) % 360) / 22.5) % 16;
      headingEl.textContent = `🧭 ${directions[index]}`;
    }

    this.updateContextHUD(lat, lng);
    
    this.carMarker.setLatLng([lat, lng]);

    // Speed-adaptive horizon radius scaling
    const speedRatio = Math.max(1, speed / 40);
    const dynamicRadius = Math.min(8000, Math.round(this.searchRadius * speedRatio));
    this.radiusCircle.setLatLng([lat, lng]);
    this.radiusCircle.setRadius(dynamicRadius);

    this.map.panTo([lat, lng], { animate: true, duration: 0.5 });

    const dot = document.getElementById('car-dot');
    if (dot && heading !== null) {
      dot.style.transform = `rotate(${heading}deg)`;
    }

    const scanThresholdMeters = speed > 70 ? 1200 : (speed > 40 ? 800 : 500);
    const shouldScan = !this.lastScanCoords ||
      this.calculateDistance(lat, lng, this.lastScanCoords.lat, this.lastScanCoords.lng) > scanThresholdMeters;

    if (shouldScan) {
      this.lastScanCoords = { lat, lng };
      const scanAnchorLat = speed > 40 ? lookaheadLat : lat;
      const scanAnchorLng = speed > 40 ? lookaheadLng : lng;
      await this.scanLandscape(scanAnchorLat, scanAnchorLng);
    } else {
      this.updatePoiBearings(lat, lng);
    }
  }

  async scanLandscape(lat, lng) {
    document.getElementById('hud-status').textContent = 'Scanning landscape...';

    const [wikiPois, osmPois] = await Promise.all([
      this.wiki.findNearby(lat, lng, this.searchRadius),
      this.osm.findNearby(lat, lng, this.searchRadius)
    ]);

    const customPins = this.pinsService.pins.map(p => this.pinsService.toPoi(p));
    const nearbyPins = customPins.filter(p => {
      p.dist = Math.round(this.calculateDistance(lat, lng, p.lat, p.lng));
      return p.dist <= this.searchRadius;
    });

    document.getElementById('hud-status').textContent = this.gps.isSimulating ? 'Simulating Drive' : 'Scanning';

    const merged = [...nearbyPins, ...wikiPois, ...osmPois];
    this.currentPois = merged;

    merged.forEach(poi => this.journal.logEncounter(poi, false));

    this.renderMarkers();
    this.renderFeed();
    this.evaluateAutomaticNarration(merged);
  }

  updatePoiBearings(carLat, carLng) {
    this.currentPois.forEach(poi => {
      poi.dist = Math.round(this.calculateDistance(carLat, carLng, poi.lat, poi.lng));
      poi.relativeBearing = this.gps.getRelativeDirection(poi.lat, poi.lng);
      poi.inForwardCone = this.gps.isInForwardCone(poi.lat, poi.lng);
      poi.detour = this.budget.formatDetourBadge(poi.dist);
      poi.moment = this.context.evaluatePoiMoment(poi, carLat, carLng, this.weather?.currentWeather);
    });
    this.currentPois.sort((a, b) => a.dist - b.dist);
    this.renderFeed();

    if (this.currentPois.length > 0 && !this.activePoiForOled) {
      this.updateOledDisplay(this.currentPois[0]);
    }
  }

  evaluateAutomaticNarration(pois) {
    if (!pois || pois.length === 0 || this.voice.isSpeaking) return;

    let candidates = pois.filter(p => p.dist <= Math.min(this.searchRadius, 2500));

    if (this.useForwardConeFilter) {
      candidates = candidates.filter(p => this.gps.isInForwardCone(p.lat, p.lng));
    }

    if (this.budget.filterOnlyWithinBudget) {
      candidates = candidates.filter(p => this.budget.estimateDetourCost(p.dist).fitsBudget);
    }

    const candidate = candidates[0];
    if (candidate) {
      const relDir = this.gps.getRelativeDirection(candidate.lat, candidate.lng);
      this.voice.narrate(candidate, {
        force: false,
        isConcise: this.isConcise,
        unitSystem: this.unitSystem,
        relativeBearing: relDir,
        personaService: this.personas
      }).then(didNarrate => {
        if (didNarrate) {
          if (candidate.source === 'wikipedia' || candidate.source === 'wikivoyage') {
            this.wiki.markAsNarrated(candidate.id);
          } else if (candidate.source === 'osm') {
            this.osm.markAsNarrated(candidate.id);
          }
          this.journal.logEncounter(candidate, true);
        }
      });
    }
  }

  renderMarkers() {
    this.poiMarkers.forEach(marker => this.map.removeLayer(marker));
    this.poiMarkers.clear();

    let filtered = this.currentPois;
    if (this.useForwardConeFilter && this.gps.speed > 15) {
      filtered = filtered.filter(p => this.gps.isInForwardCone(p.lat, p.lng));
    }
    if (this.budget.filterOnlyWithinBudget) {
      filtered = filtered.filter(p => this.budget.estimateDetourCost(p.dist).fitsBudget);
    }

    filtered.forEach(poi => {
      let color = '#e3b341';
      let iconSymbol = '📖';

      if (poi.source === 'osm') {
        color = '#3fb950';
        iconSymbol = '🌲';
      } else if (poi.source === 'wonder_pin') {
        color = '#d2a8ff';
        iconSymbol = '✨';
      } else if (poi.source === 'wikivoyage') {
        color = '#58a6ff';
        iconSymbol = '🧭';
      }

      const customIcon = L.divIcon({
        className: 'custom-poi-marker',
        html: `
          <div style="
            background: ${color};
            color: #000;
            border-radius: 50%;
            width: 26px; height: 26px;
            display: flex; align-items: center; justify-content: center;
            font-size: 13px; font-weight: bold;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            border: 2px solid #ffffff;
            cursor: pointer;
          ">
            ${iconSymbol}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const marker = L.marker([poi.lat, poi.lng], { icon: customIcon }).addTo(this.map);
      marker.bindPopup(`
        <div style="font-family: sans-serif; color: #161b22; max-width: 220px;">
          <h4 style="margin-bottom: 4px; font-size: 14px;">${poi.title}</h4>
          <p style="font-size: 12px; margin-bottom: 8px; color: #57606a;">${poi.extract.slice(0, 100)}...</p>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}" target="_blank" style="color: #0969da; font-weight: bold; font-size: 12px;">Detour in Google Maps &rarr;</a>
        </div>
      `);

      this.poiMarkers.set(poi.id, marker);
    });
  }

  renderPinMarkers() {
    this.pinMarkers.forEach(m => this.map.removeLayer(m));
    this.pinMarkers.clear();

    this.pinsService.pins.forEach(pin => {
      const pinIcon = L.divIcon({
        className: 'wonder-pin-marker',
        html: `
          <div style="
            background: #8a2be2;
            color: #fff;
            border-radius: 50%;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px;
            box-shadow: 0 0 12px rgba(138, 43, 226, 0.8);
            border: 2px solid #ffffff;
            cursor: pointer;
          ">
            ✨
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const m = L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(this.map);
      m.bindPopup(`
        <div style="font-family: sans-serif; color: #161b22; max-width: 220px;">
          <h4 style="margin-bottom: 4px; font-size: 14px;">✨ ${pin.title}</h4>
          <p style="font-size: 12px; margin-bottom: 8px; color: #57606a;">${pin.note}</p>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}" target="_blank" style="color: #8a2be2; font-weight: bold; font-size: 12px;">Detour to Wonder &rarr;</a>
        </div>
      `);
      this.pinMarkers.set(pin.id, m);
    });
  }

  renderFeed() {
    const feed = document.getElementById('feed-scroll');
    const countBadge = document.getElementById('feed-count');

    let visiblePois = this.currentPois;
    if (this.useForwardConeFilter && this.gps.speed > 15) {
      visiblePois = visiblePois.filter(p => this.gps.isInForwardCone(p.lat, p.lng));
    }
    if (this.budget.filterOnlyWithinBudget) {
      visiblePois = visiblePois.filter(p => this.budget.estimateDetourCost(p.dist).fitsBudget);
    }

    countBadge.textContent = `${visiblePois.length} Nearby`;

    if (visiblePois.length === 0) {
      feed.innerHTML = `
        <div class="empty-feed">
          <div class="icon">✨</div>
          <h3>Pure Wandering Mode</h3>
          <p>No roadside landmarks matching your current filters within ${this.formatRadius(this.searchRadius)}.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = '';

    visiblePois.forEach(poi => {
      const card = document.createElement('div');
      card.id = `card-${poi.id}`;
      card.className = `poi-card ${poi.source === 'wonder_pin' ? 'wonder-pin-card' : ''}`;

      const relDir = poi.relativeBearing || this.gps.getRelativeDirection(poi.lat, poi.lng);
      const distStr = this.formatDistance(poi.dist);
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;

      const detourBadge = this.budget.formatDetourBadge(poi.dist);
      const momentBadge = this.context.evaluatePoiMoment(poi, poi.lat, poi.lng);

      let badgeLabel = '📖 STORY';
      if (poi.source === 'osm') badgeLabel = '🌲 NATURE';
      else if (poi.source === 'wonder_pin') badgeLabel = '✨ WONDER PIN';
      else if (poi.source === 'wikivoyage') badgeLabel = '🧭 TRAVEL FOOTNOTE';

      card.innerHTML = `
        ${poi.thumbnail ? `<img src="${poi.thumbnail}" alt="${poi.title}" class="poi-image" loading="lazy">` : ''}
        <div class="poi-content">
          <div class="poi-meta">
            <span class="poi-badge">${badgeLabel}</span>
            <span class="poi-bearing">${relDir} (${distStr})</span>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
            ${momentBadge ? `<span class="badge-moment">${momentBadge.badge}</span>` : ''}
            <span class="${detourBadge.fits ? 'badge-budget-fit' : 'badge-budget-over'}" title="${detourBadge.desc}">${detourBadge.label}</span>
          </div>

          <h3 class="poi-title">${poi.title}</h3>
          <p class="poi-extract">${poi.extract}</p>
          <div class="poi-actions">
            <button class="action-btn btn-narrate" data-id="${poi.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              Whisper
            </button>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="action-btn btn-detour">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              Detour Here
            </a>
          </div>
        </div>
      `;

      card.querySelector('.btn-narrate').addEventListener('click', () => {
        this.voice.narrate(poi, {
          force: true,
          isConcise: this.isConcise,
          unitSystem: this.unitSystem,
          relativeBearing: relDir,
          personaService: this.personas
        });
        this.journal.logEncounter(poi, true);
      });

      feed.appendChild(card);
    });
  }

  updateOledDisplay(poi) {
    if (!poi) return;
    this.activePoiForOled = poi;

    const titleEl = document.getElementById('oled-poi-title');
    const typeEl = document.getElementById('oled-poi-type');
    const bearingEl = document.getElementById('oled-poi-bearing');
    const distEl = document.getElementById('oled-poi-dist');
    const detourEl = document.getElementById('oled-poi-detour');
    const extractEl = document.getElementById('oled-poi-extract');
    const detourLink = document.getElementById('oled-detour-btn');

    if (titleEl) titleEl.textContent = poi.title;
    if (typeEl) typeEl.textContent = (poi.shortDescription || 'ROAD WONDER').toUpperCase();
    if (bearingEl) bearingEl.textContent = poi.relativeBearing || 'Ahead';
    if (distEl) distEl.textContent = this.formatDistance(poi.dist);
    if (detourEl) detourEl.textContent = poi.detour ? poi.detour.label : '+5m Detour';
    if (extractEl) extractEl.textContent = poi.extract;
    if (detourLink) detourLink.href = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;
  }

  openScrapbook() {
    const modal = document.getElementById('scrapbook-modal');
    const stats = this.journal.getSummaryStats(this.unitSystem);

    document.getElementById('stat-dist').textContent = this.unitSystem === 'imperial' ? stats.distanceMiles : stats.distanceKm;
    const statDistLabel = document.querySelector('.stat-box:nth-child(1) .stat-label');
    if (statDistLabel) statDistLabel.textContent = this.unitSystem === 'imperial' ? 'mi Scanned' : 'km Scanned';

    document.getElementById('stat-time').textContent = `${stats.elapsedMinutes}m`;
    document.getElementById('stat-pois').textContent = stats.totalDiscoveries;
    document.getElementById('stat-stories').textContent = stats.narratedCount;

    const timelineContainer = document.getElementById('scrapbook-timeline');
    if (this.journal.entries.length === 0) {
      timelineContainer.innerHTML = `
        <div class="empty-feed">
          <p>No roadside landmarks logged yet. Start driving or run a simulation to compile your journal!</p>
        </div>
      `;
    } else {
      timelineContainer.innerHTML = '';
      this.journal.entries.forEach((entry, idx) => {
        const item = document.createElement('div');
        item.className = 'timeline-entry';
        const loggedTime = entry.loggedAt instanceof Date ? entry.loggedAt : new Date(entry.loggedAt);
        const timeStr = loggedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
          ${entry.thumbnail ? `<img src="${entry.thumbnail}" class="timeline-thumb" alt="${entry.title}">` : '<div class="timeline-thumb" style="background:#21262d;display:flex;align-items:center;justify-content:center;font-size:24px;">🧭</div>'}
          <div class="timeline-info">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="timeline-title">${idx + 1}. ${entry.title}</span>
              <span class="timeline-time">${timeStr}</span>
            </div>
            <p class="timeline-extract">${entry.extract.slice(0, 140)}...</p>
            <div style="margin-top:4px;">
              <a href="https://www.google.com/maps/dir/?api=1&destination=${entry.lat},${entry.lng}" target="_blank" style="color:var(--accent-cyan);font-size:0.75rem;text-decoration:none;font-weight:600;">
                Google Maps &rarr;
              </a>
            </div>
          </div>
        `;
        timelineContainer.appendChild(item);
      });
    }

    modal.classList.add('active');
  }

  exportJournalMarkdown() {
    const mdContent = this.journal.exportToMarkdown(this.unitSystem);
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `road_trip_journal_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  locateUserForRoute(inputEl = null, btnEl = null, statusEl = null) {
    const locBtn = btnEl || document.getElementById('route-my-loc-btn');
    const input = inputEl || document.getElementById('route-origin-input');
    const status = statusEl || document.getElementById('route-status');

    if (!navigator.geolocation) {
      if (status) status.innerHTML = '<span style="color:#f85149;">Geolocation is not supported by your browser.</span>';
      return;
    }

    if (locBtn) locBtn.textContent = '⏳ Locating...';
    if (status) status.innerHTML = '<span>Detecting current GPS coordinates...</span>';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        this.gps.updatePosition(latitude, longitude, null, 0, false);
        
        if (status) status.innerHTML = '<span>Resolving address name...</span>';
        const placeName = await this.routeService.reverseGeocode(latitude, longitude);
        
        if (input) input.value = `📍 ${placeName}`;
        this.selectedOrigin = {
          name: placeName,
          lat: latitude,
          lng: longitude
        };
        this.selectedSimOrigin = { ...this.selectedOrigin };

        if (locBtn) locBtn.textContent = '📍 Here';
        if (status) status.innerHTML = `<span>✓ Located: <strong>${placeName}</strong> (${latitude.toFixed(4)}, ${longitude.toFixed(4)})</span>`;
      },
      (err) => {
        console.warn('Geolocation error:', err);
        if (locBtn) locBtn.textContent = '📍 Here';
        if (status) status.innerHTML = `<span style="color:#f85149;">⚠️ Location access unavailable (${err.message}). You can type your city or town name.</span>`;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  initAutocomplete() {
    // Route Builder Autocomplete
    this.setupAutocompleteField(
      document.getElementById('route-origin-input'),
      document.getElementById('origin-suggestions'),
      (item) => {
        this.selectedOrigin = {
          name: item.title,
          fullName: `${item.title}, ${item.subtitle}`,
          lat: item.lat,
          lng: item.lng
        };
      }
    );

    this.setupAutocompleteField(
      document.getElementById('route-dest-input'),
      document.getElementById('dest-suggestions'),
      (item) => {
        this.selectedDest = {
          name: item.title,
          fullName: `${item.title}, ${item.subtitle}`,
          lat: item.lat,
          lng: item.lng
        };
      }
    );

    // Custom Simulation Modal Autocomplete
    this.setupAutocompleteField(
      document.getElementById('sim-origin-input'),
      document.getElementById('sim-origin-suggestions'),
      (item) => {
        this.selectedSimOrigin = {
          name: item.title,
          fullName: `${item.title}, ${item.subtitle}`,
          lat: item.lat,
          lng: item.lng
        };
      }
    );

    this.setupAutocompleteField(
      document.getElementById('sim-dest-input'),
      document.getElementById('sim-dest-suggestions'),
      (item) => {
        this.selectedSimDest = {
          name: item.title,
          fullName: `${item.title}, ${item.subtitle}`,
          lat: item.lat,
          lng: item.lng
        };
      }
    );

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-container')) {
        document.querySelectorAll('.autocomplete-dropdown').forEach(d => d.classList.remove('active'));
      }
    });
  }

  setupAutocompleteField(input, dropdown, onSelect) {
    if (!input || !dropdown) return;
    let debounceTimer = null;

    input.addEventListener('input', () => {
      const val = input.value.trim().replace(/^📍\s*/, '');
      clearTimeout(debounceTimer);

      if (val.length < 2) {
        dropdown.innerHTML = '';
        dropdown.classList.remove('active');
        return;
      }

      debounceTimer = setTimeout(async () => {
        const suggestions = await this.routeService.searchSuggestions(val);
        dropdown.innerHTML = '';

        if (suggestions.length === 0) {
          dropdown.classList.remove('active');
          return;
        }

        suggestions.forEach(item => {
          const div = document.createElement('div');
          div.className = 'autocomplete-item';
          div.innerHTML = `
            <span class="autocomplete-title">${item.title}</span>
            <span class="autocomplete-subtitle">${item.subtitle || ''}</span>
          `;

          div.addEventListener('click', () => {
            input.value = item.subtitle ? `${item.title}, ${item.subtitle}` : item.title;
            dropdown.classList.remove('active');
            onSelect(item);
          });

          dropdown.appendChild(div);
        });

        dropdown.classList.add('active');
      }, 250);
    });
  }

  renderRouteOptionsCards(routes, activeIndex, containerEl, onSelect) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    containerEl.style.display = 'grid';

    routes.forEach((r, idx) => {
      const card = document.createElement('div');
      card.className = `route-option-card ${idx === activeIndex ? 'active' : ''}`;
      
      const distStr = this.unitSystem === 'imperial' ? `${r.distanceMiles} mi` : `${r.distanceKm} km`;
      const timeStr = `${Math.floor(r.durationMinutes / 60) > 0 ? `${Math.floor(r.durationMinutes / 60)}h ` : ''}${r.durationMinutes % 60}m`;
      const deltaBadge = r.timeDeltaMinutes === 0 ? '<span style="color:#3fb950;font-weight:600;">Fastest</span>' : `<span style="color:var(--text-muted);">+${r.timeDeltaMinutes}m</span>`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="route-badge-pill ${r.badgeType || 'badge-balanced'}">${r.badge || `Route ${idx + 1}`}</span>
          <span style="font-size: 0.72rem;">${deltaBadge}</span>
        </div>

        <div class="route-card-title">
          <span>Route ${idx + 1}</span>
          <span style="font-size: 0.85rem; color: var(--accent-cyan);">${timeStr}</span>
        </div>

        <div class="route-card-metrics">
          <span>${distStr}</span> &bull; <span>${r.comfortLabel}</span>
        </div>

        <div>
          <div class="route-score-row">
            <span style="color: var(--text-muted);">🌲 Scenic Value</span>
            <span style="font-weight: 700; color: #d2a8ff;">${r.scenicScore}/100</span>
          </div>
          <div class="scenic-score-bar-bg">
            <div class="scenic-score-bar-fill" style="width: ${r.scenicScore}%;"></div>
          </div>
        </div>

        <div class="route-comfort-badge">
          <span>🛋️ Driving Comfort: <strong>${r.comfortScore}/100</strong></span>
        </div>
      `;

      card.addEventListener('click', () => {
        containerEl.querySelectorAll('.route-option-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        onSelect(idx);
      });

      containerEl.appendChild(card);
    });
  }

  renderAlternativeRoutePolylines(routes, activeIndex, onSelect) {
    if (this.alternativePolylines) {
      this.alternativePolylines.forEach(p => this.map.removeLayer(p));
    }
    this.alternativePolylines = [];

    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }

    const bounds = L.latLngBounds();

    routes.forEach((r, idx) => {
      const isActive = idx === activeIndex;
      const polyline = L.polyline(r.latLngs, {
        color: isActive ? '#58a6ff' : '#8b949e',
        weight: isActive ? 6 : 4,
        opacity: isActive ? 0.9 : 0.45,
        dashArray: isActive ? null : '6, 6',
        lineCap: 'round'
      }).addTo(this.map);

      polyline.on('click', () => onSelect(idx));
      polyline.bindTooltip(`Route ${idx + 1}: ${r.badge} (${r.durationMinutes}m)`, { sticky: true });

      this.alternativePolylines.push(polyline);
      bounds.extend(polyline.getBounds());
    });

    if (routes.length > 0) {
      this.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  renderRouteWeatherPreview(forecastList, containerEl) {
    if (!containerEl) return;
    if (!forecastList || forecastList.length === 0) {
      containerEl.style.display = 'none';
      return;
    }

    containerEl.style.display = 'block';
    containerEl.innerHTML = `
      <div class="weather-preview-header">
        <span class="weather-preview-title">
          <span>🌤️ En-Route Predictive Weather Forecast</span>
        </span>
        <span style="font-size: 0.72rem; color: var(--text-muted);">Predictions at estimated waypoint arrival</span>
      </div>
      <div class="weather-corridor-grid">
        ${forecastList.map(cp => `
          <div class="weather-cp-card">
            <div class="weather-cp-label">${cp.label}</div>
            <div class="weather-cp-eta">${cp.etaDisplay}</div>
            <div class="weather-cp-temp-row">
              <span class="weather-cp-temp">${cp.tempDisplay}</span>
              <span class="weather-cp-icon">${cp.icon}</span>
            </div>
            <div class="weather-cp-cond">${cp.condition}</div>
            ${cp.hazardNote ? `<span class="weather-hazard-chip">${cp.hazardNote}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  updateRouteSummary(route) {
    if (!route) return;

    const distEl = document.getElementById('route-summary-dist');
    const directEl = document.getElementById('route-summary-direct');
    const totalEl = document.getElementById('route-summary-total');
    const stopsEl = document.getElementById('route-summary-stops');

    const isImperial = this.unitSystem === 'imperial';
    const distDisplay = isImperial ? `${route.distanceMiles} mi` : `${route.distanceKm} km`;
    if (distEl) distEl.textContent = distDisplay;

    const formatMins = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    if (directEl) directEl.textContent = formatMins(route.durationMinutes);

    const selectedStops = this.selectedWaypoints || [];
    const detourAddedMins = selectedStops.reduce((sum, p) => sum + (p.detourMinutes || 0), 0);
    const totalMins = route.durationMinutes + detourAddedMins;

    if (totalEl) totalEl.textContent = formatMins(totalMins);
    if (stopsEl) stopsEl.textContent = `${selectedStops.length}`;

    // Update navigation transfer links
    const gmapsLink = document.getElementById('launch-gmaps-link');
    const appleLink = document.getElementById('launch-apple-link');

    if (gmapsLink) {
      gmapsLink.href = this.routeService.generateGoogleMapsUrl(route.start, route.end, selectedStops);
      gmapsLink.style.display = 'inline-flex';
    }
    if (appleLink) {
      appleLink.href = this.routeService.generateAppleMapsUrl(route.start, route.end, selectedStops);
      appleLink.style.display = 'inline-flex';
    }
  }

  async handleRouteScan() {
    const originInput = document.getElementById('route-origin-input').value.trim().replace(/^📍\s*/, '');
    const destInput = document.getElementById('route-dest-input').value.trim();
    const statusEl = document.getElementById('route-status');

    if (!originInput || !destInput) {
      statusEl.innerHTML = '<span style="color: #f85149;">Please provide both Origin and Destination.</span>';
      return;
    }

    statusEl.innerHTML = '<span>⏳ Locating endpoints and mapping driving corridor...</span>';

    try {
      let startCoords = this.selectedOrigin;
      if (!startCoords || !originInput.includes(startCoords.name)) {
        startCoords = await this.routeService.geocode(originInput);
      }

      let endCoords = this.selectedDest;
      if (!endCoords || !destInput.includes(endCoords.name)) {
        endCoords = await this.routeService.geocode(destInput);
      }

      if (!startCoords || !endCoords) {
        statusEl.innerHTML = '<span style="color: #f85149;">Could not locate one of the endpoints. Try typing a city or landmark.</span>';
        return;
      }

      statusEl.innerHTML = `<span>Mapping driving route from <strong>${startCoords.name}</strong> to <strong>${endCoords.name}</strong>...</span>`;

      const route = await this.routeService.calculateRoute(startCoords, endCoords);
      if (!route) {
        statusEl.innerHTML = '<span style="color: #f85149;">Unable to calculate route.</span>';
        return;
      }

      this.routeService.currentRoute = route;

      // 1. Immediately draw route polyline on map
      if (this.routePolyline) {
        this.map.removeLayer(this.routePolyline);
      }
      this.routePolyline = L.polyline(route.latLngs, {
        color: '#58a6ff',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round'
      }).addTo(this.map);
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });

      // 2. Show Summary Banner, Offline Cache button, Simulate button, Export GPX
      document.getElementById('offline-cache-row').style.display = 'flex';
      document.getElementById('route-summary-banner').style.display = 'flex';
      document.getElementById('route-simulate-btn').style.display = 'inline-block';
      document.getElementById('export-gpx-btn').style.display = 'flex';
      this.updateRouteSummary(route);

      // 3. Predictive En-Route Weather Forecast
      const departureOffsetMins = Number(document.getElementById('route-departure-select')?.value || 0);
      const departureDate = new Date(Date.now() + (departureOffsetMins * 60 * 1000));

      try {
        const weatherPreviewEl = document.getElementById('route-weather-preview');
        this.weather.getRouteWeatherForecast(route.latLngs, route.durationMinutes, this.unitSystem).then(fc => {
          this.renderRouteWeatherPreview(fc, weatherPreviewEl);
        });
      } catch (e) {}

      statusEl.innerHTML = `<span>✓ Route ready &bull; Loading roadside highlights & weather forecasts...</span>`;

      // 4. Stream corridor landmarks with place-and-time weather
      const listEl = document.getElementById('corridor-list');
      listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px;font-size:0.85rem;">⏳ Streaming roadside wonders & checking en-route weather...</div>';

      this.routeService.discoverCorridorWaypoints(3500, departureDate, this.unitSystem).then(corridorPois => {
        statusEl.innerHTML = `<span>Found <strong>${corridorPois.length}</strong> roadside highlights along your journey:</span>`;
        listEl.innerHTML = '';
        this.selectedWaypoints = [];

        if (corridorPois.length === 0) {
          listEl.innerHTML = '<div style="color:var(--text-muted);padding:10px;">Ready for departure. No major recorded stops along this segment.</div>';
        } else {
          corridorPois.forEach((poi) => {
            const item = document.createElement('div');
            item.className = 'corridor-item';
            item.id = `corridor-item-${poi.id}`;

            const detourBadge = `+${poi.detourMinutes}m detour`;
            const distFromHwy = `${this.formatDistance(poi.distanceFromRouteMeters)} off route`;
            const etaTime = poi.weather?.arrivalTimeFormatted ? `@ ${poi.weather.arrivalTimeFormatted}` : `+${poi.etaMinutes}m ETA`;

            const weatherBadge = poi.weather ? `
              <span class="corridor-weather-chip ${poi.weather.isAdverse ? 'adverse' : ''}" title="${poi.weather.suitabilityNote || ''}" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; background: ${poi.weather.isAdverse ? 'rgba(248,81,73,0.15)' : 'rgba(88,166,255,0.12)'}; color: ${poi.weather.isAdverse ? '#f85149' : '#79c0ff'}; border: 1px solid ${poi.weather.isAdverse ? 'rgba(248,81,73,0.4)' : 'rgba(88,166,255,0.3)'};">
                <span>${poi.weather.icon}</span>
                <span>${poi.weather.tempDisplay}</span>
                <span style="opacity: 0.8;">&bull; ${poi.weather.condition}</span>
                <span style="font-weight: 600; opacity: 0.95;">(${etaTime})</span>
              </span>
            ` : `<span style="font-size: 0.72rem; color: var(--text-muted);">⏳ +${poi.etaMinutes}m ETA</span>`;

            item.innerHTML = `
              <input type="checkbox" id="check-${poi.id}" data-id="${poi.id}">
              ${poi.thumbnail ? `<img src="${poi.thumbnail}" class="corridor-thumb" alt="${poi.title}">` : '<div class="corridor-thumb" style="background:#21262d;display:flex;align-items:center;justify-content:center;font-size:20px;">🧭</div>'}
              <div class="corridor-details" style="display: flex; flex-direction: column; gap: 3px;">
                <div class="corridor-title" style="font-weight: 600; font-size: 0.86rem; color: var(--text-main);">${poi.title}</div>
                <div class="corridor-meta" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.72rem;">
                  <span style="color: var(--accent-gold); font-weight: 600;">${detourBadge}</span>
                  <span>&bull;</span>
                  <span>${distFromHwy}</span>
                  <span>&bull;</span>
                  ${weatherBadge}
                </div>
              </div>
            `;

            const chk = item.querySelector('input[type="checkbox"]');
            chk.addEventListener('change', () => {
              if (chk.checked) {
                item.classList.add('selected');
                this.selectedWaypoints.push(poi);
              } else {
                item.classList.remove('selected');
                this.selectedWaypoints = this.selectedWaypoints.filter(w => w.id !== poi.id);
              }
              this.updateRouteSummary(route);
            });

            listEl.appendChild(item);
          });
        }
      }).catch(err => {
        console.warn('Corridor discovery notice:', err);
        listEl.innerHTML = '<div style="color:var(--text-muted);padding:10px;">Ready for departure.</div>';
      });
    } catch (err) {
      console.error('Route scan error:', err);
      statusEl.innerHTML = '<span style="color:#f85149;">Unable to calculate route. Try again.</span>';
    }
  }

  async handleOfflinePreCache() {
    if (!this.routeService.currentRoute) return;
    const btn = document.getElementById('cache-route-offline-btn');
    btn.disabled = true;

    const res = await this.routeService.preCacheCorridor(
      this.routeService.currentRoute,
      (curr, total) => {
        btn.textContent = `⏳ ${Math.round((curr/total)*100)}%`;
      }
    );

    if (res.success) {
      btn.textContent = `✓ Cached (${res.count} POIs)`;
      btn.style.background = '#3fb950';
    } else {
      btn.textContent = 'Retry Cache';
      btn.disabled = false;
    }
  }

  exportRouteGpx() {
    if (!this.routeService.currentRoute) return;
    const r = this.routeService.currentRoute;
    const gpxContent = this.routeService.exportToGpx(r.start, r.end, this.selectedWaypoints, r.latLngs);
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scenic_route_${r.start.name}_to_${r.end.name}.gpx`.replace(/\s+/g, '_');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  highlightCard(poiId, isSpeaking) {
    document.querySelectorAll('.poi-card').forEach(c => c.classList.remove('speaking'));
    if (poiId && isSpeaking) {
      const activeCard = document.getElementById(`card-${poiId}`);
      if (activeCard) {
        activeCard.classList.add('speaking');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new WanderingLayerApp();
});
