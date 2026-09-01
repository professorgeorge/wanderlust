/**
 * Screen Wake Lock Service
 * Uses the W3C Screen Wake Lock API (navigator.wakeLock) to keep the display
 * lit and awake when driving in the foreground (like Google Maps/Waze).
 * Automatically re-acquires lock upon app visibility recovery.
 * 100% Client-side.
 */
export class WakeLockService {
  constructor() {
    this.wakeLockSentinel = null;
    this.isEnabled = true; // Default to true for in-car road trip navigation
    this.onStateChange = null;
    this.isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    this.setupVisibilityListener();
  }

  setupVisibilityListener() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.isEnabled) {
        // Re-acquire wake lock when app returns to foreground
        await this.request();
      }
    });
  }

  /**
   * Request screen wake lock
   */
  async request() {
    if (!this.isSupported || !this.isEnabled) return false;

    // If already active and not released, return true
    if (this.wakeLockSentinel && !this.wakeLockSentinel.released) {
      return true;
    }

    try {
      this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener('release', () => {
        if (this.onStateChange) {
          this.onStateChange(this.isActive());
        }
      });
      if (this.onStateChange) {
        this.onStateChange(true);
      }
      console.log('Screen Wake Lock acquired: display will remain lit.');
      return true;
    } catch (err) {
      console.warn('Screen Wake Lock request notice:', err.message);
      if (this.onStateChange) {
        this.onStateChange(false);
      }
      return false;
    }
  }

  /**
   * Release screen wake lock
   */
  async release() {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (e) {}
      this.wakeLockSentinel = null;
    }
    if (this.onStateChange) {
      this.onStateChange(false);
    }
  }

  /**
   * Toggle user preference for keeping screen awake
   */
  async toggleEnabled(enabled = null) {
    this.isEnabled = (enabled !== null) ? Boolean(enabled) : !this.isEnabled;
    if (this.isEnabled) {
      await this.request();
    } else {
      await this.release();
    }
    return this.isEnabled;
  }

  isActive() {
    return Boolean(this.wakeLockSentinel && !this.wakeLockSentinel.released);
  }
}
