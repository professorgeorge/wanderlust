import { cleanAndSplitSentences } from './personas.js';

/**
 * Voice & Audio Service
 * Uses Web Speech API (SpeechSynthesis) + Web Audio API for pre-announcement chimes.
 * Features keep-alive heartbeats to prevent mobile OS speech timeouts.
 * 100% Client-side, free, and works offline.
 */
export class VoiceService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioCtx = null;
    this.isMuted = false;
    this.isSpeaking = false;
    this.selectedVoice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.lastSpokenTime = 0;
    this.cooldownSeconds = 180; // 3 minutes cooldown between auto-narrations
    this.onStateChange = null;
    this.speechHeartbeatTimer = null;
    this.currentPoi = null;
    this.lastPoi = null;
    this.activeUtterance = null; // Retain reference to active utterance to prevent browser GC truncation


    this.initVoices();
  }

  initVoices() {
    if (!this.synth) return;
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      this.selectedVoice = voices.find(v => (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Premium')))) ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0] || null;
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Unlock AudioContext on initial user touch/click (required by mobile iOS/Android)
   */
  unlockAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Play a gentle harmonic 2-tone chime before narration
   */
  async playChime() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Note 2: B5 (987.77 Hz) - harmonic fifth
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.15);
      gain2.gain.setValueAtTime(0.001, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.1, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.75);

      // Wait for chime to complete before speech starts
      await new Promise(res => setTimeout(res, 550));
    } catch (e) {
      console.warn('Chime audio error:', e);
    }
  }

  /**
   * Update MediaSession metadata for Car Bluetooth / Lock Screen
   */
  updateMediaSession(poi) {
    if ('mediaSession' in navigator && poi) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: poi.title || 'Roadside Story',
          artist: 'The Wandering Layer',
          album: poi.shortDescription || 'Audio Companion',
          artwork: [
            { src: poi.thumbnail || 'https://raw.githubusercontent.com/feathericons/feather/master/icons/compass.svg', sizes: '512x512', type: 'image/svg+xml' }
          ]
        });
      } catch (e) {
        console.warn('MediaSession metadata error:', e);
      }
    }
  }

  /**
   * Narrate a landmark discovery
   */
  async narrate(poi, options = {}) {
    if (this.isMuted || !this.synth) return false;

    const now = Date.now();
    const isManual = options.force === true;

    // Cooldown check for automatic triggers (e.g. 30s to 180s)
    if (!isManual && (now - this.lastSpokenTime) < (this.cooldownSeconds * 1000)) {
      return false;
    }

    if (isManual && this.isSpeaking) {
      this.stop();
    }

    if (this.isSpeaking) return false;

    this.currentPoi = poi;
    this.unlockAudio();
    await this.playChime();

    // Check if stopped/skipped during chime
    if (this.currentPoi !== poi) return false;

    let fullSpeech = '';
    let speechRate = this.rate;
    let speechPitch = this.pitch;

    if (options.personaService) {
      const formatted = options.personaService.formatSpeech(poi, options);
      fullSpeech = formatted.text;
      speechRate = formatted.rate * this.rate;
      speechPitch = formatted.pitch * this.pitch;
    } else {
      const bearingPhrase = options.relativeBearing ? `${options.relativeBearing}` : 'ahead';
      
      let distPhrase = '';
      if (options.unitSystem === 'imperial') {
        if (poi.dist < 400) {
          const feet = Math.round(poi.dist * 3.28084);
          distPhrase = `${feet} feet`;
        } else {
          const miles = (poi.dist * 0.000621371).toFixed(1);
          distPhrase = `${miles} miles`;
        }
      } else {
        const distanceKm = (poi.dist / 1000).toFixed(1);
        distPhrase = poi.dist < 1000 ? `${poi.dist} meters` : `${distanceKm} kilometers`;
      }

      const intro = `Coming up ${bearingPhrase}, about ${distPhrase}: ${poi.title}.`;
      const depth = options.narrationDepth || (options.isConcise ? 'concise' : 'rich');
      let maxSentences = 3;
      if (depth === 'comprehensive' || depth === 'full') {
        maxSentences = 'all';
      } else if (depth === 'concise') {
        maxSentences = 1;
      } else {
        maxSentences = options.maxSentences || 3;
      }

      const rawBody = poi.extract || poi.shortDescription || '';
      const storyBody = cleanAndSplitSentences(rawBody, maxSentences);
      fullSpeech = `${intro} ${storyBody}`.replace(/\s+/g, ' ').trim();
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(fullSpeech);
      this.activeUtterance = utterance; // Prevent browser GC from terminating in-flight speech

      if (this.selectedVoice) utterance.voice = this.selectedVoice;
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;

      const cleanup = () => {
        if (this.speechHeartbeatTimer) {
          clearInterval(this.speechHeartbeatTimer);
          this.speechHeartbeatTimer = null;
        }
        this.activeUtterance = null;
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.lastSpokenTime = Date.now();
        this.updateMediaSession(poi);
        if (this.onStateChange) {
          this.onStateChange({ isSpeaking: true, poi, lastPoi: this.lastPoi, wasSkipped: false });
        }

        // Mobile speech keepalive safety
        this.speechHeartbeatTimer = setInterval(() => {
          if (this.synth && this.synth.speaking && !this.synth.paused) {
            // Keep speech alive without disruptive stutter
            this.synth.resume();
          }
        }, 8000);
      };

      utterance.onend = () => {
        cleanup();
        this.isSpeaking = false;
        this.lastPoi = poi;
        this.currentPoi = null;
        if (this.onStateChange) {
          this.onStateChange({ isSpeaking: false, poi: null, lastPoi: this.lastPoi, wasSkipped: false });
        }
        resolve(true);
      };

      utterance.onerror = (err) => {
        cleanup();
        if (err.error !== 'canceled' && err.error !== 'interrupted') {
          console.warn('SpeechSynthesis error:', err);
        }
        this.isSpeaking = false;
        this.lastPoi = poi;
        this.currentPoi = null;
        if (this.onStateChange) {
          this.onStateChange({ isSpeaking: false, poi: null, lastPoi: this.lastPoi, wasSkipped: false });
        }
        resolve(false);
      };

      this.synth.speak(utterance);
    });
  }

  /**
   * 1-Tap Skip: Immediately cancel current narration and record as skipped
   */
  skip() {
    const skippedPoi = this.currentPoi;
    if (this.synth) {
      this.synth.cancel();
    }
    this.activeUtterance = null;
    if (this.speechHeartbeatTimer) {
      clearInterval(this.speechHeartbeatTimer);
      this.speechHeartbeatTimer = null;
    }
    this.isSpeaking = false;
    if (skippedPoi) {
      this.lastPoi = skippedPoi;
    }
    this.currentPoi = null;
    this.lastSpokenTime = Date.now() - (this.cooldownSeconds * 1000) + 5000; // Brief 5s pause before next

    if (this.onStateChange) {
      this.onStateChange({
        isSpeaking: false,
        poi: null,
        lastPoi: this.lastPoi,
        wasSkipped: true,
        skippedPoi: skippedPoi
      });
    }
    return skippedPoi;
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.activeUtterance = null;
    if (this.speechHeartbeatTimer) {
      clearInterval(this.speechHeartbeatTimer);
      this.speechHeartbeatTimer = null;
    }
    this.isSpeaking = false;
    this.currentPoi = null;
    if (this.onStateChange) {
      this.onStateChange({ isSpeaking: false, poi: null, lastPoi: this.lastPoi, wasSkipped: false });
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stop();
    return this.isMuted;
  }
}
