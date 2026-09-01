import { WakeLockService } from './services/wake-lock.js';
import { GpsService } from './services/gps.js';

console.log('=== Running Wake Lock & Background GPS Watchdog Tests ===');

// Test 1: WakeLockService instantiation & fallback handling in Node
const wakeLock = new WakeLockService();
console.log('Test 1: WakeLock Service Initialization');
console.log('  isSupported in Node environment:', wakeLock.isSupported);
console.log('  isEnabled by default:', wakeLock.isEnabled);
if (wakeLock.isEnabled === true && typeof wakeLock.request === 'function') {
  console.log('  [PASS] WakeLockService instantiated with correct defaults.');
} else {
  console.error('  [FAIL] WakeLockService instantiation failed.');
  process.exit(1);
}

// Test 2: WakeLock toggleEnabled
wakeLock.toggleEnabled(false).then((state) => {
  console.log('Test 2: Toggle Enabled to false');
  if (state === false && wakeLock.isEnabled === false) {
    console.log('  [PASS] toggleEnabled(false) succeeded.');
  } else {
    console.error('  [FAIL] toggleEnabled(false) failed.');
    process.exit(1);
  }

  return wakeLock.toggleEnabled(true);
}).then((state) => {
  console.log('Test 3: Toggle Enabled to true');
  if (state === true && wakeLock.isEnabled === true) {
    console.log('  [PASS] toggleEnabled(true) succeeded.');
  } else {
    console.error('  [FAIL] toggleEnabled(true) failed.');
    process.exit(1);
  }

  // Test 4: GpsService Watchdog and resyncLocation
  console.log('Test 4: GpsService Watchdog and resyncLocation lifecycle');
  const gps = new GpsService();
  if (typeof gps.resyncLocation === 'function' && typeof gps.startWatchdog === 'function') {
    console.log('  [PASS] GpsService has resyncLocation() and startWatchdog() methods.');
  } else {
    console.error('  [FAIL] GpsService missing watchdog or resync methods.');
    process.exit(1);
  }

  console.log('\n=== ALL WAKE LOCK & BACKGROUND GPS TESTS PASSED! ===');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
