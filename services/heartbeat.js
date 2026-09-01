/**
 * Silent Audio Heartbeat & MediaSession Service
 * Uses HTML5 Audio silent loop + MediaSession + Web Audio API to prevent
 * mobile OS (iOS Safari & Android Chrome) from throttling background GPS
 * and disconnecting WebSocket/network when the screen locks or when switching apps.
 */
export class HeartbeatService {
  constructor() {
    this.audioElement = null;
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isActive = false;
  }

  /**
   * Create an inaudible HTML5 audio loop with valid silent PCM WAV data
   */
  getSilentAudio() {
    if (!this.audioElement && typeof Audio !== 'undefined') {
      // 1-second silent WAV base64
      const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      this.audioElement = new Audio(silentWav);
      this.audioElement.loop = true;
      this.audioElement.volume = 0.001; // Inaudible
    }
    return this.audioElement;
  }

  /**
   * Start the inaudible background audio loop on user interaction
   */
  async start() {
    if (this.isActive) return;

    try {
      // 1. Start HTML5 Audio element loop (critical for iOS Safari & Android Chrome background execution priority)
      const audio = this.getSilentAudio();
      if (audio) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('HTML5 Audio silent keepalive notice:', err.message);
          });
        }
      }

      // 2. Also initialize Web Audio API sub-audible oscillator as dual-layer fallback
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        if (!this.audioCtx) {
          this.audioCtx = new AudioContext();
        }
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }

        this.oscillator = this.audioCtx.createOscillator();
        this.gainNode = this.audioCtx.createGain();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.setValueAtTime(30, this.audioCtx.currentTime); // 30Hz sub-bass
        this.gainNode.gain.setValueAtTime(0.0001, this.audioCtx.currentTime); // Inaudible

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        this.oscillator.start();
      }

      this.isActive = true;
      this.setupMediaSession();
      console.log('Background GPS audio heartbeat activated.');
    } catch (e) {
      console.warn('Heartbeat initialization warning:', e);
    }
  }

  setupMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Wanderlust GPS Companion',
          artist: 'The Map Beyond The Directions',
          album: 'Road Trip Audio Companion',
          artwork: [
            { src: 'https://raw.githubusercontent.com/feathericons/feather/master/icons/compass.svg', sizes: '512x512', type: 'image/svg+xml' }
          ]
        });

        // Handle lockscreen & bluetooth steering wheel buttons
        navigator.mediaSession.setActionHandler('play', () => this.start());
        navigator.mediaSession.setActionHandler('pause', () => {
          if (window.app && typeof window.app.skipCurrentStory === 'function') {
            window.app.skipCurrentStory();
          }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (window.app && typeof window.app.skipCurrentStory === 'function') {
            window.app.skipCurrentStory();
          }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (window.app && typeof window.app.replayLastStory === 'function') {
            window.app.replayLastStory();
          }
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          if (window.app && typeof window.app.skipCurrentStory === 'function') {
            window.app.skipCurrentStory();
          }
        });
      } catch (e) {
        console.warn('MediaSession handler registration notice:', e);
      }
    }
  }

  stop() {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (e) {}
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) {}
      this.oscillator = null;
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch (e) {}
    }
    this.isActive = false;
  }
}

