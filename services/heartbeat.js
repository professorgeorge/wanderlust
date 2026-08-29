/**
 * Silent Audio Heartbeat & MediaSession Service
 * Prevents mobile OS (iOS Safari & Android Chrome) from throttling background GPS
 * when the screen locks or when the user switches to Google Maps.
 */
export class HeartbeatService {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isActive = false;
  }

  /**
   * Start the inaudible background audio loop on user interaction
   */
  start() {
    if (this.isActive) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      // Generate a near-silent inaudible loop (sub-audible low frequency with near-zero gain)
      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(30, this.audioCtx.currentTime); // 30Hz sub-bass
      this.gainNode.gain.setValueAtTime(0.0001, this.audioCtx.currentTime); // Inaudible

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
      this.oscillator.start();

      this.isActive = true;
      this.setupMediaSession();
      console.log('Background GPS audio heartbeat activated.');
    } catch (e) {
      console.warn('Heartbeat initialization warning:', e);
    }
  }

  setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'The Wandering Layer',
        artist: 'The Map Beyond The Directions',
        album: 'Road Trip Audio Companion',
        artwork: [
          { src: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/compass.svg', sizes: '512x512', type: 'image/svg+xml' }
        ]
      });

      // Handle lockscreen play/pause buttons
      navigator.mediaSession.setActionHandler('play', () => this.start());
      navigator.mediaSession.setActionHandler('pause', () => this.stop());
    }
  }

  stop() {
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) {}
      this.oscillator = null;
    }
    this.isActive = false;
  }
}
