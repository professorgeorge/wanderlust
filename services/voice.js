/**
 * Voice & Audio Service
 * Uses Web Speech API (SpeechSynthesis) + Web Audio API for pre-announcement chimes.
 * Features keep-alive heartbeats to prevent mobile OS speech timeouts.
 * 100% Client-side, free, and works offline.
 */
export class VoiceService {
  constructor() {
    this.synth = window.speechSynthesis;
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
   * Narrate a landmark discovery
   */
  async narrate(poi, options = {}) {
    if (this.isMuted || !this.synth) return false;

    const now = Date.now();
    const isManual = options.force === true;

    // Cooldown check for automatic triggers
    if (!isManual && (now - this.lastSpokenTime) < (this.cooldownSeconds * 1000)) {
      return false;
    }

    if (isManual && this.isSpeaking) {
      this.stop();
    }

    if (this.isSpeaking) return false;

    this.unlockAudio();
    await this.playChime();

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

      let intro = `Coming up ${bearingPhrase}, about ${distPhrase}: ${poi.title}.`;
      
      let storyBody = poi.extract || poi.shortDescription || '';
      if (options.isConcise) {
        const match = storyBody.match(/^(.*?[.!?])(\s|$)/);
        storyBody = match ? match[1] : storyBody;
      } else {
        const sentences = storyBody.match(/[^.!?]+[.!?]+/g) || [storyBody];
        storyBody = sentences.slice(0, 2).join(' ');
      }
      fullSpeech = `${intro} ${storyBody}`;
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(fullSpeech);
      if (this.selectedVoice) utterance.voice = this.selectedVoice;
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;

      const cleanup = () => {
        if (this.speechHeartbeatTimer) {
          clearInterval(this.speechHeartbeatTimer);
          this.speechHeartbeatTimer = null;
        }
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.lastSpokenTime = Date.now();
        if (this.onStateChange) this.onStateChange({ isSpeaking: true, poi });

        // Mobile speech keepalive: prevent long speech cutting off
        this.speechHeartbeatTimer = setInterval(() => {
          if (this.synth.speaking) {
            this.synth.pause();
            this.synth.resume();
          }
        }, 10000);
      };

      utterance.onend = () => {
        cleanup();
        this.isSpeaking = false;
        if (this.onStateChange) this.onStateChange({ isSpeaking: false, poi: null });
        resolve(true);
      };

      utterance.onerror = (err) => {
        cleanup();
        console.warn('SpeechSynthesis error:', err);
        this.isSpeaking = false;
        if (this.onStateChange) this.onStateChange({ isSpeaking: false, poi: null });
        resolve(false);
      };

      this.synth.speak(utterance);
    });
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
      if (this.speechHeartbeatTimer) {
        clearInterval(this.speechHeartbeatTimer);
        this.speechHeartbeatTimer = null;
      }
      this.isSpeaking = false;
      if (this.onStateChange) this.onStateChange({ isSpeaking: false, poi: null });
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stop();
    return this.isMuted;
  }
}
