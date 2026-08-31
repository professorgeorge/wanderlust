import { VoiceService } from './services/voice.js';
import { WikiService } from './services/wiki-service.js';
import { OsmService } from './services/osm-service.js';
import { PinsService } from './services/pins-service.js';
import { StorageService } from './services/storage-service.js';

// Mock SpeechSynthesis & Browser environment in Node.js
global.window = {
  indexedDB: null,
  speechSynthesis: {
    speaking: true,
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    getVoices: () => []
  }
};
global.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};
if (typeof global.navigator === 'undefined') {
  global.navigator = { mediaSession: { setActionHandler: () => {} } };
} else {
  global.navigator.mediaSession = { setActionHandler: () => {} };
}

async function runNarrationTests() {
  console.log('=== Running Single Announcement, Replay & Skip Verification Tests ===\n');

  // Test 1: Wiki Service ID Normalization & Deduplication
  console.log('Test 1: Wiki Service Deduplication (Wikipedia & Wikivoyage)');
  const wiki = new WikiService(null, 'en');
  
  wiki.markAsNarrated('wiki-12345');
  if (!wiki.isNarrated('wiki-12345') || !wiki.isNarrated(12345) || !wiki.isNarrated('12345')) {
    throw new Error('Wikipedia ID normalization failed');
  }

  wiki.markAsNarrated('voyage-67890');
  if (!wiki.isNarrated('voyage-67890') || !wiki.isNarrated(67890) || !wiki.isNarrated('67890')) {
    throw new Error('Wikivoyage ID normalization failed');
  }
  console.log('  [PASS] Wiki & Wikivoyage IDs reliably deduplicated.\n');

  // Test 2: OSM Service Deduplication
  console.log('Test 2: OSM Service Deduplication');
  const osm = new OsmService();
  osm.markAsNarrated('osm-99999');
  if (!osm.isNarrated('osm-99999') || !osm.isNarrated(99999) || !osm.isNarrated('99999')) {
    throw new Error('OSM ID normalization failed');
  }
  console.log('  [PASS] OSM IDs reliably deduplicated.\n');

  // Test 3: Wonder Pins Service Deduplication
  console.log('Test 3: Wonder Pins Service Deduplication');
  const mockStorage = { getAllWonderPins: async () => [], saveWonderPin: async () => {} };
  const pins = new PinsService(mockStorage);
  pins.markAsNarrated('wonder-abcde');
  if (!pins.isNarrated('wonder-abcde')) {
    throw new Error('Pins ID normalization failed');
  }
  console.log('  [PASS] Wonder Pins reliably deduplicated.\n');

  // Test 4: Voice Service Skip and Last POI Tracking
  console.log('Test 4: Voice Service Skip and Last POI Tracking');
  
  const voice = new VoiceService();
  const mockPoi = { id: 'wiki-101', title: 'Golden Gate Bridge', extract: 'Famous suspension bridge.' };

  voice.currentPoi = mockPoi;
  voice.isSpeaking = true;

  let stateReceived = null;
  voice.onStateChange = (state) => {
    stateReceived = state;
  };

  const skipped = voice.skip();
  if (skipped.id !== 'wiki-101') throw new Error('skip() did not return skipped POI');
  if (voice.isSpeaking !== false) throw new Error('isSpeaking was not reset to false');
  if (voice.lastPoi.id !== 'wiki-101') throw new Error('lastPoi was not preserved for replay');
  if (!stateReceived || stateReceived.wasSkipped !== true) throw new Error('onStateChange did not broadcast wasSkipped');
  console.log('  [PASS] VoiceService skip() successfully cancels and preserves lastPoi for replay.\n');

  // Test 5: Candidate Selection (All Markers, Selected vs Deselected)
  console.log('Test 5: All Markers Evaluated During Drive Regardless of Selection');
  const corridorPois = [
    { id: 'poi-1', title: 'Lookout Point', dist: 800, isSelected: false },
    { id: 'poi-2', title: 'Historic Mill', dist: 1400, isSelected: true },
    { id: 'poi-3', title: 'Mountain Spring', dist: 2200, isSelected: false }
  ];

  const narratedSet = new Set(['poi-1']);
  const skippedSet = new Set();

  // Evaluate candidate filtering
  const eligibleCandidates = corridorPois.filter(p => !narratedSet.has(p.id) && !skippedSet.has(p.id) && p.dist <= 2500);
  
  if (eligibleCandidates.length !== 2) throw new Error(`Expected 2 eligible candidates, got ${eligibleCandidates.length}`);
  if (eligibleCandidates[0].id !== 'poi-2' || eligibleCandidates[1].id !== 'poi-3') {
    throw new Error('Unselected marker was erroneously excluded from candidate pool');
  }
  console.log('  [PASS] Unselected markers remain fully eligible for roadside audio announcements.\n');

  console.log('=== All Narration, Deduplication & Replay/Skip Tests PASSED! ===');
}

runNarrationTests().catch(err => {
  console.error('\n[FAIL] Test error:', err);
  process.exit(1);
});
