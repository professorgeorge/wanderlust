/**
 * Serendipity Scrapbook & Auto-Journal Service
 * Records landmarks, vistas, and footnotes passed along the route
 * and persists illustrated road trip journals into IndexedDB.
 */
export class JournalService {
  constructor(storageService = null) {
    this.storage = storageService;
    this.startTime = null;
    this.endTime = null;
    this.totalDistanceCoveredMeters = 0;
    this.lastPosition = null;
    this.entries = [];
    this.loggedIds = new Set();
  }

  startSession() {
    this.startTime = new Date();
    this.endTime = null;
    this.totalDistanceCoveredMeters = 0;
    this.lastPosition = null;
    this.entries = [];
    this.loggedIds.clear();
  }

  updateDistance(lat, lng) {
    if (this.lastPosition) {
      const d = this.calcDist(this.lastPosition.lat, this.lastPosition.lng, lat, lng);
      if (d > 5 && d < 1000) {
        this.totalDistanceCoveredMeters += d;
      }
    }
    this.lastPosition = { lat, lng };
  }

  logEncounter(poi, wasNarrated = false) {
    if (this.loggedIds.has(poi.id)) {
      if (wasNarrated) {
        const existing = this.entries.find(e => e.id === poi.id);
        if (existing) existing.wasNarrated = true;
      }
      return;
    }

    this.loggedIds.add(poi.id);
    const entry = {
      ...poi,
      loggedAt: new Date(),
      wasNarrated: wasNarrated
    };
    this.entries.push(entry);

    this.persistCurrentSession();
  }

  async persistCurrentSession() {
    if (!this.storage || this.entries.length === 0) return;
    const stats = this.getSummaryStats();
    const journalRecord = {
      id: `journal-${this.startTime ? this.startTime.getTime() : Date.now()}`,
      startTime: this.startTime ? this.startTime.toISOString() : new Date().toISOString(),
      stats: stats,
      entries: this.entries.map(e => ({
        ...e,
        loggedAt: e.loggedAt instanceof Date ? e.loggedAt.toISOString() : e.loggedAt
      }))
    };
    await this.storage.saveJournal(journalRecord);
  }

  getSummaryStats(unitSystem = 'metric') {
    const elapsedMinutes = this.startTime ? Math.round((new Date() - this.startTime) / 60000) : 0;
    const distanceKm = (this.totalDistanceCoveredMeters / 1000).toFixed(1);
    const distanceMiles = (this.totalDistanceCoveredMeters * 0.000621371).toFixed(1);
    const natureCount = this.entries.filter(e => e.source === 'osm' || (e.extract || '').toLowerCase().includes('waterfall') || (e.title || '').toLowerCase().includes('falls')).length;
    const historyCount = this.entries.length - natureCount;

    return {
      startTime: this.startTime,
      elapsedMinutes,
      distanceKm,
      distanceMiles,
      displayDistance: unitSystem === 'imperial' ? `${distanceMiles} mi` : `${distanceKm} km`,
      totalDiscoveries: this.entries.length,
      narratedCount: this.entries.filter(e => e.wasNarrated).length,
      natureCount,
      historyCount
    };
  }

  exportToMarkdown(unitSystem = 'metric') {
    const stats = this.getSummaryStats(unitSystem);
    const dateStr = this.startTime ? this.startTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Today';
    const distStr = unitSystem === 'imperial' ? `~${stats.distanceMiles} miles` : `~${stats.distanceKm} km`;

    let md = `# The Wandering Layer — Journey Scrapbook\n`;
    md += `*${dateStr}*\n\n`;
    md += `> "A map tells me there is a lake beyond the road I am taking... The question is whether, once the directions are set, we will still make the effort to look at the map."\n\n`;
    md += `### Journey Summary\n`;
    md += `- **Road Distance Scanned:** ${distStr}\n`;
    md += `- **Travel Duration:** ${stats.elapsedMinutes} minutes\n`;
    md += `- **Total Roadside Discoveries:** ${stats.totalDiscoveries} landmarks (${stats.natureCount} nature vistas, ${stats.historyCount} historic & cultural footnotes)\n`;
    md += `- **Stories Whispered:** ${stats.narratedCount}\n\n`;
    md += `---\n\n`;
    md += `### Roadside Timeline\n\n`;

    this.entries.forEach((entry, idx) => {
      const loggedTime = entry.loggedAt instanceof Date ? entry.loggedAt : new Date(entry.loggedAt);
      const timeStr = loggedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      md += `#### ${idx + 1}. ${entry.title} (${timeStr})\n`;
      if (entry.thumbnail) {
        md += `![${entry.title}](${entry.thumbnail})\n\n`;
      }
      md += `${entry.extract}\n\n`;
      md += `- **Type:** ${entry.source === 'wikipedia' ? 'Cultural & Historic Footnote' : (entry.source === 'wonder_pin' ? 'User Wonder Pin' : 'Natural Wonder')}\n`;
      md += `- **Coordinates:** \`${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}\` ([View in Google Maps](https://www.google.com/maps/dir/?api=1&destination=${entry.lat},${entry.lng}))\n\n`;
    });

    return md;
  }

  calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
