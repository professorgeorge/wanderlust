/**
 * Storage Service
 * Robust client-side IndexedDB wrapper for persistent offline POIs,
 * user wonder pins, trip journals, and cached route corridors.
 * 100% free, runs locally in the user's browser with zero cloud dependencies.
 */
export class StorageService {
  constructor() {
    this.dbName = 'TheWanderingLayerDB';
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not supported; falling back to memory/localStorage.');
      return null;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store for pre-cached offline POIs
        if (!db.objectStoreNames.contains('offline_pois')) {
          const poiStore = db.createObjectStore('offline_pois', { keyPath: 'id' });
          poiStore.createIndex('corridorId', 'corridorId', { unique: false });
          poiStore.createIndex('source', 'source', { unique: false });
        }

        // Store for user-created Wonder Pins
        if (!db.objectStoreNames.contains('wonder_pins')) {
          const pinStore = db.createObjectStore('wonder_pins', { keyPath: 'id' });
          pinStore.createIndex('createdAt', 'createdAt', { unique: false });
          pinStore.createIndex('category', 'category', { unique: false });
        }

        // Store for road trip journals
        if (!db.objectStoreNames.contains('journals')) {
          const journalStore = db.createObjectStore('journals', { keyPath: 'id' });
          journalStore.createIndex('startTime', 'startTime', { unique: false });
        }

        // Store for saved routes
        if (!db.objectStoreNames.contains('routes')) {
          db.createObjectStore('routes', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        resolve(null);
      };
    });
  }

  // --- Offline POI Management ---

  async saveOfflinePois(corridorId, pois) {
    await this.initPromise;
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db.transaction(['offline_pois'], 'readwrite');
      const store = tx.objectStore('offline_pois');

      pois.forEach(poi => {
        store.put({
          ...poi,
          corridorId: corridorId,
          cachedAt: Date.now()
        });
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async getOfflinePois(corridorId = null) {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['offline_pois'], 'readonly');
      const store = tx.objectStore('offline_pois');

      if (corridorId) {
        const index = store.index('corridorId');
        const req = index.getAll(corridorId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      }
    });
  }

  // --- User Wonder Pins ---

  async saveWonderPin(pin) {
    await this.initPromise;
    if (!this.db) {
      const existing = JSON.parse(localStorage.getItem('wonder_pins') || '[]');
      existing.push(pin);
      localStorage.setItem('wonder_pins', JSON.stringify(existing));
      return pin;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['wonder_pins'], 'readwrite');
      const store = tx.objectStore('wonder_pins');
      store.put(pin);
      tx.oncomplete = () => resolve(pin);
      tx.onerror = () => resolve(null);
    });
  }

  async getAllWonderPins() {
    await this.initPromise;
    if (!this.db) {
      return JSON.parse(localStorage.getItem('wonder_pins') || '[]');
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['wonder_pins'], 'readonly');
      const store = tx.objectStore('wonder_pins');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async deleteWonderPin(id) {
    await this.initPromise;
    if (!this.db) {
      const existing = JSON.parse(localStorage.getItem('wonder_pins') || '[]');
      const filtered = existing.filter(p => p.id !== id);
      localStorage.setItem('wonder_pins', JSON.stringify(filtered));
      return true;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['wonder_pins'], 'readwrite');
      const store = tx.objectStore('wonder_pins');
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  // --- Journals ---

  async saveJournal(journalData) {
    await this.initPromise;
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db.transaction(['journals'], 'readwrite');
      const store = tx.objectStore('journals');
      store.put(journalData);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async getJournals() {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['journals'], 'readonly');
      const store = tx.objectStore('journals');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  // --- Full Backup & Cross-Device Restore ---

  async exportFullBackup(settings = {}) {
    await this.initPromise;
    const pins = await this.getAllWonderPins();
    const journals = await this.getJournals();
    const routes = await this.getAllSavedRoutes();

    return {
      app: 'The Wandering Layer',
      version: 2.0,
      exportedAt: new Date().toISOString(),
      settings: settings,
      wonderPins: pins,
      journals: journals,
      routes: routes
    };
  }

  async getAllSavedRoutes() {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['routes'], 'readonly');
      const store = tx.objectStore('routes');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async importFullBackup(backupData) {
    await this.initPromise;
    if (!backupData || typeof backupData !== 'object') {
      return { success: false, error: 'Invalid backup file format' };
    }

    let pinsCount = 0;
    let journalsCount = 0;
    let routesCount = 0;

    // 1. Restore Wonder Pins
    if (Array.isArray(backupData.wonderPins)) {
      for (const pin of backupData.wonderPins) {
        if (pin && pin.id) {
          await this.saveWonderPin(pin);
          pinsCount++;
        }
      }
    }

    // 2. Restore Journals
    if (Array.isArray(backupData.journals)) {
      for (const j of backupData.journals) {
        if (j && j.id) {
          await this.saveJournal(j);
          journalsCount++;
        }
      }
    }

    // 3. Restore Routes
    if (Array.isArray(backupData.routes)) {
      for (const r of backupData.routes) {
        if (r && r.id) {
          await this.saveRoute(r);
          routesCount++;
        }
      }
    }

    return {
      success: true,
      pinsCount,
      journalsCount,
      routesCount,
      settings: backupData.settings || null
    };
  }
}

